import asyncio
import logging
import random
import string
from dataclasses import dataclass, field
from datetime import datetime, timezone
from typing import Any, Callable, Optional

from fastapi import WebSocket
from sqlalchemy.orm import Session

from app.config import get_settings
from app.database import SessionLocal
from app.models import GameRoom, GameRound, Guess, Player, utc_now
from app.schemas import PlayerInfo, RoomDetailResponse, RoundPublicInfo
from app.scoring import calculate_drawer_bonus, calculate_guess_score
from app.words import is_close_guess, is_exact_match, mask_secret_word, select_secret_word

logger = logging.getLogger(__name__)
settings = get_settings()


def iso_now() -> str:
    return datetime.now(timezone.utc).isoformat()


def ws_envelope(event: str, data: dict[str, Any]) -> dict[str, Any]:
    return {
        "event": event,
        "data": data,
        "timestamp": iso_now(),
    }


def generate_unique_room_code(db: Session, length: int = 6) -> str:
    alphabet = string.ascii_uppercase + string.digits
    for _ in range(50):
        code = "".join(random.choices(alphabet, k=length))
        exists = db.query(GameRoom).filter(GameRoom.room_code == code).first()
        if not exists:
            return code
    raise RuntimeError("Unable to generate unique room code")


@dataclass
class RoomRuntimeState:
    room_id: int
    room_code: str
    status: str = "waiting"
    current_round: int = 0
    total_rounds: int = 3
    round_duration_seconds: int = 60
    min_players: int = 2
    intermission_seconds: float = 4.0

    host_player_id: Optional[int] = None
    connections: dict[int, WebSocket] = field(default_factory=dict)
    ready_players: set[int] = field(default_factory=set)
    connected_players: set[int] = field(default_factory=set)
    left_players: set[int] = field(default_factory=set)
    bot_players: set[int] = field(default_factory=set)

    used_words: set[str] = field(default_factory=set)
    drawer_history: list[int] = field(default_factory=list)

    # Current Round Runtime State (ephemeral, never stores strokes in DB)
    active_round_id: Optional[int] = None
    round_active: bool = False
    drawer_player_id: Optional[int] = None
    secret_word: Optional[str] = None
    word_hint: Optional[str] = None
    round_started_at: Optional[datetime] = None
    remaining_seconds: int = 0
    correct_guesser_ids: set[int] = field(default_factory=set)
    round_points_earned: dict[int, int] = field(default_factory=dict)
    strokes: list[dict[str, Any]] = field(default_factory=list)

    timer_task: Optional[asyncio.Task] = None
    intermission_task: Optional[asyncio.Task] = None
    lock: asyncio.Lock = field(default_factory=asyncio.Lock)


class GameEngine:
    """
    Authoritative real-time multiplayer game engine managing WebSocket connections,
    synchronized room states, drawer selection, canvas stroke broadcasting,
    guess validation, scoring, round timers, and MySQL persistence.
    """

    def __init__(self, session_factory: Callable[[], Session] = SessionLocal):
        self._session_factory = session_factory
        self.rooms: dict[str, RoomRuntimeState] = {}
        self.word_provider: Callable[[set[str]], str] = select_secret_word

    def get_or_load_runtime(self, db: Session, room: GameRoom) -> RoomRuntimeState:
        code = room.room_code.upper()
        runtime = self.rooms.get(code)
        if runtime is None:
            active_players = [p for p in room.players if p.left_at is None]
            host_id = active_players[0].id if active_players else None
            runtime = RoomRuntimeState(
                room_id=room.id,
                room_code=code,
                status=room.status,
                current_round=room.current_round,
                total_rounds=room.total_rounds,
                round_duration_seconds=settings.DEFAULT_ROUND_DURATION_SECONDS,
                min_players=settings.MIN_PLAYERS,
                intermission_seconds=settings.ROUND_INTERMISSION_SECONDS,
                host_player_id=host_id,
                left_players={p.id for p in room.players if p.left_at is not None},
                used_words={r.word.lower() for r in room.rounds if r.word},
            )
            # Restore active round if any
            if room.status == "playing" and room.rounds:
                latest_round = room.rounds[-1]
                if latest_round.ended_at is None:
                    runtime.active_round_id = latest_round.id
                    runtime.round_active = True
                    runtime.drawer_player_id = latest_round.drawer_player_id
                    runtime.secret_word = latest_round.word
                    runtime.word_hint = mask_secret_word(latest_round.word)
                    runtime.round_started_at = latest_round.started_at
            self.rooms[code] = runtime
        else:
            runtime.status = room.status
            runtime.current_round = room.current_round
            runtime.total_rounds = room.total_rounds
        return runtime

    def build_room_detail(self, db: Session, room: GameRoom) -> RoomDetailResponse:
        runtime = self.get_or_load_runtime(db, room)
        player_map: dict[int, str] = {}
        player_infos: list[PlayerInfo] = []

        for p in room.players:
            player_map[p.id] = p.display_name
            is_left = p.left_at is not None or p.id in runtime.left_players
            player_infos.append(
                PlayerInfo(
                    id=p.id,
                    room_id=p.room_id,
                    display_name=p.display_name,
                    score=p.score,
                    joined_at=p.joined_at,
                    left_at=p.left_at,
                    is_ready=(p.id in runtime.ready_players),
                    is_connected=(p.id in runtime.connected_players and not is_left),
                    is_host=(p.id == runtime.host_player_id),
                    is_drawer=(runtime.round_active and p.id == runtime.drawer_player_id),
                    has_guessed_current_round=(p.id in runtime.correct_guesser_ids),
                )
            )

        active_players = [p for p in player_infos if p.left_at is None]

        round_infos: list[RoundPublicInfo] = []
        for r in room.rounds:
            is_round_finished = r.ended_at is not None or room.status == "finished"
            # SECURITY: Never include the secret word in public/REST responses while round is active!
            round_infos.append(
                RoundPublicInfo(
                    id=r.id,
                    room_id=r.room_id,
                    round_number=r.round_number,
                    drawer_player_id=r.drawer_player_id,
                    drawer_name=player_map.get(r.drawer_player_id),
                    word=r.word if is_round_finished else None,
                    word_hint=mask_secret_word(r.word),
                    word_length=len(r.word),
                    started_at=r.started_at,
                    ended_at=r.ended_at,
                )
            )

        winner_info: Optional[PlayerInfo] = None
        if room.status == "finished" and player_infos:
            sorted_players = sorted(player_infos, key=lambda x: (-x.score, x.joined_at))
            winner_info = sorted_players[0]

        return RoomDetailResponse(
            id=room.id,
            room_code=room.room_code,
            status=room.status,
            current_round=room.current_round,
            total_rounds=room.total_rounds,
            round_duration_seconds=runtime.round_duration_seconds,
            min_players=runtime.min_players,
            host_player_id=runtime.host_player_id,
            drawer_player_id=runtime.drawer_player_id if runtime.round_active else None,
            remaining_seconds=runtime.remaining_seconds if runtime.round_active else 0,
            word_hint=runtime.word_hint if runtime.round_active else None,
            word_length=len(runtime.secret_word) if (runtime.round_active and runtime.secret_word) else None,
            created_at=room.created_at,
            started_at=room.started_at,
            ended_at=room.ended_at,
            players=player_infos,
            active_player_count=len(active_players),
            rounds=round_infos,
            winner=winner_info,
        )

    def _get_serialized_players(self, db: Session, room: GameRoom, runtime: RoomRuntimeState) -> list[dict[str, Any]]:
        detail = self.build_room_detail(db, room)
        return [p.model_dump(mode="json") for p in detail.players if p.left_at is None]

    async def send_to_player(self, runtime: RoomRuntimeState, player_id: int, event: str, data: dict[str, Any]) -> None:
        ws = runtime.connections.get(player_id)
        if ws is None:
            return
        try:
            await ws.send_json(ws_envelope(event, data))
        except Exception as exc:
            logger.debug("Failed sending %s to player %s: %s", event, player_id, exc)

    async def broadcast(
        self,
        runtime: RoomRuntimeState,
        event: str,
        data: dict[str, Any],
        exclude_player_id: Optional[int] = None,
    ) -> None:
        message = ws_envelope(event, data)
        stale_ids: list[int] = []
        for pid, ws in list(runtime.connections.items()):
            if exclude_player_id is not None and pid == exclude_player_id:
                continue
            try:
                await ws.send_json(message)
            except Exception:
                stale_ids.append(pid)
        for pid in stale_ids:
            runtime.connections.pop(pid, None)
            runtime.connected_players.discard(pid)

    def _ensure_host(self, db: Session, room: GameRoom, runtime: RoomRuntimeState) -> Optional[int]:
        eligible = [
            p.id
            for p in room.players
            if p.left_at is None and p.id not in runtime.left_players and p.id in runtime.connected_players
        ]
        if not eligible:
            eligible = [p.id for p in room.players if p.left_at is None and p.id not in runtime.left_players]
        if runtime.host_player_id not in eligible:
            runtime.host_player_id = eligible[0] if eligible else None
        return runtime.host_player_id

    def _select_next_drawer(self, room: GameRoom, runtime: RoomRuntimeState) -> Optional[int]:
        """Select the next drawer fairly among active connected players."""
        connected_eligible = [
            p.id
            for p in room.players
            if p.left_at is None and p.id not in runtime.left_players and p.id in runtime.connected_players
        ]
        if not connected_eligible:
            connected_eligible = [
                p.id for p in room.players if p.left_at is None and p.id not in runtime.left_players
            ]
        if not connected_eligible:
            return None

        # Prefer human players over practice bots when selecting the drawer
        human_eligible = [pid for pid in connected_eligible if pid not in runtime.bot_players]
        if human_eligible:
            connected_eligible = human_eligible

        # Find players who haven't drawn as many times
        draw_counts = {pid: runtime.drawer_history.count(pid) for pid in connected_eligible}
        min_count = min(draw_counts.values())
        candidates = [pid for pid in connected_eligible if draw_counts[pid] == min_count]

        # Avoid picking the exact same drawer twice in a row if more than 1 candidate exists
        if len(candidates) > 1 and runtime.drawer_history and candidates[0] == runtime.drawer_history[-1]:
            chosen = candidates[1]
        else:
            chosen = candidates[0]

        runtime.drawer_history.append(chosen)
        return chosen

    async def connect_player(self, room_code: str, player_id: int, websocket: WebSocket) -> Optional[RoomRuntimeState]:
        code = room_code.upper()
        with self._session_factory() as db:
            room = db.query(GameRoom).filter(GameRoom.room_code == code).first()
            if not room:
                await websocket.accept()
                await websocket.send_json(
                    ws_envelope("error", {"code": "ROOM_NOT_FOUND", "message": f"Room {code} does not exist."})
                )
                await websocket.close(code=4004)
                return None

            player = db.query(Player).filter(Player.id == player_id, Player.room_id == room.id).first()
            if not player:
                await websocket.accept()
                await websocket.send_json(
                    ws_envelope("error", {"code": "UNAUTHORIZED_PLAYER", "message": "Player is not registered in this room."})
                )
                await websocket.close(code=4003)
                return None

            if room.status == "finished" and player.left_at is not None:
                await websocket.accept()
                await websocket.send_json(
                    ws_envelope("error", {"code": "ROOM_INACTIVE", "message": "Cannot join an already finished game room."})
                )
                await websocket.close(code=4001)
                return None

            await websocket.accept()
            runtime = self.get_or_load_runtime(db, room)

            # Handle reconnect: clear left_at if they had previously disconnected/left
            was_reconnecting = player.id in runtime.left_players or player.left_at is not None
            if player.left_at is not None:
                player.left_at = None
                db.commit()
                db.refresh(room)

            runtime.left_players.discard(player.id)
            runtime.connections[player.id] = websocket
            runtime.connected_players.add(player.id)
            self._ensure_host(db, room, runtime)

            room_detail = self.build_room_detail(db, room)
            sync_payload = {
                "room": room_detail.model_dump(mode="json"),
                "you": next(
                    (p.model_dump(mode="json") for p in room_detail.players if p.id == player.id),
                    None,
                ),
                "strokes": list(runtime.strokes) if runtime.round_active else [],
            }

            # Send initial state to the newly connected/reconnected player
            await self.send_to_player(runtime, player.id, "sync_state", sync_payload)

            # If round is currently active and this player is the drawer, send them the secret word privately
            if runtime.round_active and runtime.drawer_player_id == player.id and runtime.secret_word:
                await self.send_to_player(
                    runtime,
                    player.id,
                    "secret_word",
                    {
                        "round_number": runtime.current_round,
                        "word": runtime.secret_word,
                    },
                )

            # Notify all players in the room
            event_name = "player_connected" if was_reconnecting else "player_joined"
            await self.broadcast(
                runtime,
                event_name,
                {
                    "player_id": player.id,
                    "display_name": player.display_name,
                    "host_player_id": runtime.host_player_id,
                    "players": self._get_serialized_players(db, room, runtime),
                },
            )
            return runtime

    async def handle_client_message(
        self, runtime: RoomRuntimeState, player_id: int, raw_message: dict[str, Any]
    ) -> None:
        event = raw_message.get("event")
        data = raw_message.get("data") or {}
        if not isinstance(data, dict):
            data = {}

        if event == "ping":
            await self.send_to_player(runtime, player_id, "pong", {"ok": True})
            return

        if event == "player_ready":
            await self.handle_player_ready(runtime, player_id, data)
        elif event == "start_game":
            await self.handle_start_game(runtime, player_id, data)
        elif event == "draw_stroke":
            await self.handle_draw_stroke(runtime, player_id, data)
        elif event == "undo_stroke":
            await self.handle_undo_stroke(runtime, player_id, data)
        elif event == "clear_canvas":
            await self.handle_clear_canvas(runtime, player_id)
        elif event == "reveal_hint":
            await self.handle_reveal_hint(runtime, player_id)
        elif event == "send_reaction":
            await self.handle_send_reaction(runtime, player_id, data)
        elif event == "submit_guess":
            await self.handle_submit_guess(runtime, player_id, data)
        elif event == "leave_room":
            await self.handle_leave_room(runtime, player_id)
        else:
            await self.send_to_player(
                runtime,
                player_id,
                "error",
                {"code": "UNKNOWN_EVENT", "message": f"Unsupported WebSocket event: {event}"},
            )

    async def handle_player_ready(
        self, runtime: RoomRuntimeState, player_id: int, data: dict[str, Any]
    ) -> None:
        async with runtime.lock:
            with self._session_factory() as db:
                room = db.query(GameRoom).filter(GameRoom.id == runtime.room_id).first()
                if not room or room.status != "waiting":
                    await self.send_to_player(
                        runtime,
                        player_id,
                        "error",
                        {"code": "GAME_ALREADY_STARTED", "message": "Ready state can only be changed in the lobby."},
                    )
                    return

                is_ready = data.get("is_ready")
                if is_ready is None:
                    is_ready = player_id not in runtime.ready_players

                if bool(is_ready):
                    runtime.ready_players.add(player_id)
                else:
                    runtime.ready_players.discard(player_id)

                await self.broadcast(
                    runtime,
                    "ready_status_changed",
                    {
                        "player_id": player_id,
                        "is_ready": player_id in runtime.ready_players,
                        "ready_count": len(runtime.ready_players),
                        "players": self._get_serialized_players(db, room, runtime),
                    },
                )

    async def handle_start_game(
        self, runtime: RoomRuntimeState, player_id: int, data: dict[str, Any]
    ) -> None:
        async with runtime.lock:
            with self._session_factory() as db:
                room = db.query(GameRoom).filter(GameRoom.id == runtime.room_id).first()
                if not room:
                    return

                if room.status != "waiting":
                    await self.send_to_player(
                        runtime,
                        player_id,
                        "error",
                        {"code": "INVALID_ROOM_STATE", "message": "Game has already started or ended."},
                    )
                    return

                active_players = [
                    p
                    for p in room.players
                    if p.left_at is None and p.id not in runtime.left_players and p.id in runtime.connected_players
                ]
                if len(active_players) < runtime.min_players:
                    await self.send_to_player(
                        runtime,
                        player_id,
                        "error",
                        {
                            "code": "NOT_ENOUGH_PLAYERS",
                            "message": f"At least {runtime.min_players} connected players are required to start.",
                        },
                    )
                    return

                # Transition room to playing
                room.status = "playing"
                room.started_at = utc_now()
                room.current_round = 0
                runtime.status = "playing"
                runtime.current_round = 0
                db.commit()
                db.refresh(room)

                await self.broadcast(
                    runtime,
                    "game_started",
                    {
                        "room_code": room.room_code,
                        "total_rounds": room.total_rounds,
                        "started_at": room.started_at.isoformat(),
                        "players": self._get_serialized_players(db, room, runtime),
                    },
                )

        # Start round 1
        await self.start_next_round(runtime)

    async def start_next_round(self, runtime: RoomRuntimeState) -> None:
        async with runtime.lock:
            # Cancel any previous timer or intermission tasks
            if runtime.timer_task and not runtime.timer_task.done():
                runtime.timer_task.cancel()

            with self._session_factory() as db:
                room = db.query(GameRoom).filter(GameRoom.id == runtime.room_id).first()
                if not room or room.status != "playing":
                    return

                if room.current_round >= room.total_rounds:
                    await self._finalize_game_locked(db, room, runtime, reason="all_rounds_completed")
                    return

                drawer_id = self._select_next_drawer(room, runtime)
                connected_active = [
                    p
                    for p in room.players
                    if p.left_at is None and p.id not in runtime.left_players and p.id in runtime.connected_players
                ]
                if drawer_id is None or len(connected_active) < runtime.min_players:
                    await self._finalize_game_locked(db, room, runtime, reason="insufficient_players")
                    return

                next_round_num = room.current_round + 1
                secret_word = self.word_provider(runtime.used_words)
                runtime.used_words.add(secret_word.lower())

                new_round = GameRound(
                    room_id=room.id,
                    round_number=next_round_num,
                    drawer_player_id=drawer_id,
                    word=secret_word,
                    started_at=utc_now(),
                )
                db.add(new_round)
                room.current_round = next_round_num
                db.commit()
                db.refresh(new_round)
                db.refresh(room)

                drawer_player = db.query(Player).filter(Player.id == drawer_id).first()
                drawer_name = drawer_player.display_name if drawer_player else "Unknown"

                # Update runtime round state
                runtime.current_round = next_round_num
                runtime.active_round_id = new_round.id
                runtime.round_active = True
                runtime.drawer_player_id = drawer_id
                runtime.secret_word = secret_word
                runtime.word_hint = mask_secret_word(secret_word)
                runtime.round_started_at = new_round.started_at
                runtime.remaining_seconds = runtime.round_duration_seconds
                runtime.correct_guesser_ids.clear()
                runtime.round_points_earned.clear()
                runtime.strokes.clear()

                serialized_players = self._get_serialized_players(db, room, runtime)

            # Clear everyone's canvas and announce the new round (without the secret word!)
            await self.broadcast(runtime, "canvas_cleared", {"round_number": runtime.current_round})
            await self.broadcast(
                runtime,
                "round_started",
                {
                    "round_id": runtime.active_round_id,
                    "round_number": runtime.current_round,
                    "total_rounds": runtime.total_rounds,
                    "drawer_player_id": runtime.drawer_player_id,
                    "drawer_name": drawer_name,
                    "word_hint": runtime.word_hint,
                    "word_length": len(secret_word),
                    "duration_seconds": runtime.round_duration_seconds,
                    "remaining_seconds": runtime.remaining_seconds,
                    "players": serialized_players,
                },
            )

            # Send the secret word ONLY to the selected drawer
            await self.send_to_player(
                runtime,
                drawer_id,
                "secret_word",
                {
                    "round_number": runtime.current_round,
                    "word": secret_word,
                },
            )

            # Launch countdown timer task
            runtime.timer_task = asyncio.create_task(
                self._round_timer_loop(runtime, runtime.active_round_id)
            )

    async def _round_timer_loop(self, runtime: RoomRuntimeState, round_id: Optional[int]) -> None:
        try:
            while runtime.round_active and runtime.active_round_id == round_id and runtime.remaining_seconds > 0:
                await asyncio.sleep(1.0)
                if not runtime.round_active or runtime.active_round_id != round_id:
                    return
                runtime.remaining_seconds = max(0, runtime.remaining_seconds - 1)
                await self.broadcast(
                    runtime,
                    "timer_tick",
                    {
                        "round_number": runtime.current_round,
                        "remaining_seconds": runtime.remaining_seconds,
                    },
                )
                if runtime.remaining_seconds <= 0:
                    break

            if runtime.round_active and runtime.active_round_id == round_id:
                await self.end_current_round(runtime, reason="time_up")
        except asyncio.CancelledError:
            return
        except Exception as exc:
            logger.exception("Error in round timer loop for room %s: %s", runtime.room_code, exc)

    async def handle_draw_stroke(
        self, runtime: RoomRuntimeState, player_id: int, data: dict[str, Any]
    ) -> None:
        if not runtime.round_active or runtime.status != "playing":
            await self.send_to_player(
                runtime,
                player_id,
                "error",
                {"code": "ROUND_NOT_ACTIVE", "message": "Cannot draw when no round is active."},
            )
            return

        if player_id != runtime.drawer_player_id:
            await self.send_to_player(
                runtime,
                player_id,
                "error",
                {"code": "NOT_DRAWER", "message": "Only the current drawer can draw on the canvas."},
            )
            return

        points = data.get("points")
        if not isinstance(points, list) or len(points) == 0:
            await self.send_to_player(
                runtime,
                player_id,
                "error",
                {"code": "INVALID_STROKE", "message": "Stroke must contain at least one point."},
            )
            return

        allowed_tools = ("brush", "eraser", "marker", "spray", "line", "rect", "circle", "fill")
        raw_tool = data.get("tool", "brush")
        stroke_payload = {
            "stroke_id": data.get("stroke_id"),
            "drawer_player_id": player_id,
            "tool": raw_tool if raw_tool in allowed_tools else "brush",
            "color": str(data.get("color", "#000000"))[:32],
            "brush_size": max(1.0, min(float(data.get("brush_size", 4.0)), 60.0)),
            "filled": bool(data.get("filled", False)),
            "opacity": max(0.1, min(float(data.get("opacity", 1.0)), 1.0)),
            "points": [
                {"x": float(pt.get("x", 0.0)), "y": float(pt.get("y", 0.0))}
                for pt in points[:500]
                if isinstance(pt, dict)
            ],
        }

        if not stroke_payload["points"]:
            return

        # Keep in ephemeral round memory for mid-round reconnections (never stored in MySQL)
        runtime.strokes.append(stroke_payload)

        # Broadcast stroke operation to all other connected players
        await self.broadcast(
            runtime,
            "draw_stroke",
            stroke_payload,
            exclude_player_id=player_id,
        )

        # If practice bots are in the room, let them react/guess as the artist draws
        active_bots = [
            bid
            for bid in runtime.bot_players
            if bid != runtime.drawer_player_id and bid not in runtime.correct_guesser_ids
        ]
        if active_bots and runtime.secret_word:
            bot_id = active_bots[0]
            stroke_count = len(runtime.strokes)
            if stroke_count == 2:
                wrong_word = select_secret_word({runtime.secret_word.lower()})
                await self.handle_submit_guess(runtime, bot_id, {"guess_text": wrong_word})
            elif stroke_count >= 8:
                await self.handle_submit_guess(runtime, bot_id, {"guess_text": runtime.secret_word})

    async def handle_undo_stroke(
        self, runtime: RoomRuntimeState, player_id: int, data: dict[str, Any]
    ) -> None:
        if not runtime.round_active or runtime.status != "playing":
            await self.send_to_player(
                runtime,
                player_id,
                "error",
                {"code": "ROUND_NOT_ACTIVE", "message": "Cannot undo when no round is active."},
            )
            return

        if player_id != runtime.drawer_player_id:
            await self.send_to_player(
                runtime,
                player_id,
                "error",
                {"code": "NOT_DRAWER", "message": "Only the current drawer can undo strokes."},
            )
            return

        if not runtime.strokes:
            return

        target_stroke_id = data.get("stroke_id")
        if target_stroke_id:
            # Remove all segments matching stroke_id (or pop last if not found)
            before_len = len(runtime.strokes)
            runtime.strokes = [
                s for s in runtime.strokes if s.get("stroke_id") != target_stroke_id
            ]
            if len(runtime.strokes) == before_len:
                runtime.strokes.pop()
        else:
            last_id = runtime.strokes[-1].get("stroke_id")
            if last_id:
                runtime.strokes = [
                    s for s in runtime.strokes if s.get("stroke_id") != last_id
                ]
            else:
                runtime.strokes.pop()

        await self.broadcast(
            runtime,
            "stroke_undone",
            {
                "drawer_player_id": player_id,
                "round_number": runtime.current_round,
                "strokes": list(runtime.strokes),
            },
        )

    async def handle_clear_canvas(self, runtime: RoomRuntimeState, player_id: int) -> None:
        if not runtime.round_active or runtime.status != "playing":
            await self.send_to_player(
                runtime,
                player_id,
                "error",
                {"code": "ROUND_NOT_ACTIVE", "message": "Cannot clear canvas when no round is active."},
            )
            return

        if player_id != runtime.drawer_player_id:
            await self.send_to_player(
                runtime,
                player_id,
                "error",
                {"code": "NOT_DRAWER", "message": "Only the current drawer can clear the canvas."},
            )
            return

        runtime.strokes.clear()
        await self.broadcast(
            runtime,
            "canvas_cleared",
            {"drawer_player_id": player_id, "round_number": runtime.current_round},
        )

    async def handle_reveal_hint(self, runtime: RoomRuntimeState, player_id: int) -> None:
        if not runtime.round_active or runtime.status != "playing" or not runtime.secret_word:
            return
        if player_id != runtime.drawer_player_id:
            await self.send_to_player(
                runtime,
                player_id,
                "error",
                {"code": "NOT_DRAWER", "message": "Only the drawer can reveal a letter hint."},
            )
            return

        word = runtime.secret_word
        current_hint_tokens = (runtime.word_hint or mask_secret_word(word)).split(" ")
        # Find unrevealed letter indices (allow revealing up to 40% of letters)
        letter_indices = [i for i, ch in enumerate(word) if ch != " "]
        already_revealed: set[int] = set()
        for idx in letter_indices:
            if idx < len(current_hint_tokens) and current_hint_tokens[idx] != "_":
                already_revealed.add(idx)

        max_reveal = max(1, len(letter_indices) // 2)
        if len(already_revealed) >= max_reveal:
            return

        unrevealed = [i for i in letter_indices if i not in already_revealed]
        if not unrevealed:
            return

        chosen_idx = random.choice(unrevealed)
        already_revealed.add(chosen_idx)
        runtime.word_hint = mask_secret_word(word, already_revealed)

        await self.broadcast(
            runtime,
            "hint_updated",
            {
                "round_number": runtime.current_round,
                "word_hint": runtime.word_hint,
                "word_length": len(word),
            },
        )

    async def handle_send_reaction(
        self, runtime: RoomRuntimeState, player_id: int, data: dict[str, Any]
    ) -> None:
        allowed_emojis = {"👏", "😂", "🔥", "🤔", "🎨", "🤯", "❤️", "🎉"}
        emoji = str(data.get("emoji", "🎨")).strip()
        if emoji not in allowed_emojis:
            emoji = "🎨"

        with self._session_factory() as db:
            player = db.query(Player).filter(Player.id == player_id).first()
            player_name = player.display_name if player else "Player"

        await self.broadcast(
            runtime,
            "player_reaction",
            {
                "player_id": player_id,
                "player_name": player_name,
                "emoji": emoji,
            },
        )

    async def handle_submit_guess(
        self, runtime: RoomRuntimeState, player_id: int, data: dict[str, Any]
    ) -> None:
        raw_guess = str(data.get("guess_text", "")).strip()
        if not raw_guess:
            await self.send_to_player(
                runtime,
                player_id,
                "error",
                {"code": "EMPTY_GUESS", "message": "Guess text cannot be empty."},
            )
            return

        guess_text = raw_guess[:255]
        should_end_round = False

        async with runtime.lock:
            if not runtime.round_active or runtime.status != "playing" or runtime.active_round_id is None:
                await self.send_to_player(
                    runtime,
                    player_id,
                    "error",
                    {"code": "ROUND_NOT_ACTIVE", "message": "No active round to submit guesses."},
                )
                return

            if player_id == runtime.drawer_player_id:
                await self.send_to_player(
                    runtime,
                    player_id,
                    "error",
                    {"code": "DRAWER_CANNOT_GUESS", "message": "The drawer is not allowed to submit guesses."},
                )
                return

            if player_id in runtime.correct_guesser_ids:
                await self.send_to_player(
                    runtime,
                    player_id,
                    "error",
                    {
                        "code": "ALREADY_GUESSED",
                        "message": "You have already guessed the secret word for this round.",
                    },
                )
                return

            with self._session_factory() as db:
                room = db.query(GameRoom).filter(GameRoom.id == runtime.room_id).first()
                player = db.query(Player).filter(Player.id == player_id, Player.room_id == runtime.room_id).first()
                if not room or not player or player.left_at is not None:
                    await self.send_to_player(
                        runtime,
                        player_id,
                        "error",
                        {"code": "INVALID_PLAYER", "message": "Player is not active in this room."},
                    )
                    return

                secret_word = runtime.secret_word or ""
                matched = is_exact_match(guess_text, secret_word)
                now = utc_now()

                # Persist Guess record in MySQL
                guess_record = Guess(
                    round_id=runtime.active_round_id,
                    player_id=player.id,
                    guess_text=guess_text,
                    is_correct=matched,
                    submitted_at=now,
                )
                db.add(guess_record)

                if matched:
                    runtime.correct_guesser_ids.add(player.id)
                    guess_order = len(runtime.correct_guesser_ids)

                    if runtime.round_started_at:
                        elapsed = max(0.0, (now - runtime.round_started_at).total_seconds())
                    else:
                        elapsed = float(runtime.round_duration_seconds - runtime.remaining_seconds)

                    points_awarded = calculate_guess_score(
                        is_correct=True,
                        time_taken_seconds=elapsed,
                        round_duration_seconds=runtime.round_duration_seconds,
                        round_number=runtime.current_round,
                        guess_order=guess_order,
                    )
                    drawer_bonus = calculate_drawer_bonus(
                        round_number=runtime.current_round,
                        time_taken_seconds=elapsed,
                        round_duration_seconds=runtime.round_duration_seconds,
                    )

                    player.score += points_awarded
                    runtime.round_points_earned[player.id] = (
                        runtime.round_points_earned.get(player.id, 0) + points_awarded
                    )

                    drawer = (
                        db.query(Player).filter(Player.id == runtime.drawer_player_id).first()
                        if runtime.drawer_player_id
                        else None
                    )
                    if drawer:
                        drawer.score += drawer_bonus
                        runtime.round_points_earned[drawer.id] = (
                            runtime.round_points_earned.get(drawer.id, 0) + drawer_bonus
                        )

                    db.commit()
                    db.refresh(room)

                    serialized_players = self._get_serialized_players(db, room, runtime)

                    # Notify everyone of the correct guess WITHOUT revealing the secret word
                    await self.broadcast(
                        runtime,
                        "correct_guess",
                        {
                            "player_id": player.id,
                            "player_name": player.display_name,
                            "points_awarded": points_awarded,
                            "drawer_player_id": runtime.drawer_player_id,
                            "drawer_bonus": drawer_bonus,
                            "guess_order": guess_order,
                            "time_taken_seconds": round(elapsed, 2),
                            "round_number": runtime.current_round,
                        },
                    )

                    # Broadcast live score update
                    await self.broadcast(
                        runtime,
                        "score_update",
                        {
                            "players": serialized_players,
                            "round_points": runtime.round_points_earned,
                        },
                    )

                    # Check if all active non-drawer players have now guessed the word
                    non_drawer_active_ids = {
                        p.id
                        for p in room.players
                        if p.left_at is None
                        and p.id not in runtime.left_players
                        and p.id in runtime.connected_players
                        and p.id != runtime.drawer_player_id
                    }
                    if non_drawer_active_ids and non_drawer_active_ids.issubset(runtime.correct_guesser_ids):
                        should_end_round = True
                else:
                    db.commit()
                    close_hint = is_close_guess(guess_text, secret_word)
                    await self.broadcast(
                        runtime,
                        "guess_submitted",
                        {
                            "id": guess_record.id,
                            "player_id": player.id,
                            "player_name": player.display_name,
                            "guess_text": guess_text,
                            "is_correct": False,
                            "is_close": close_hint,
                            "submitted_at": now.isoformat(),
                        },
                    )

        if should_end_round:
            await self.end_current_round(runtime, reason="all_guessed")

    async def end_current_round(self, runtime: RoomRuntimeState, reason: str = "time_up") -> None:
        async with runtime.lock:
            if not runtime.round_active:
                return

            runtime.round_active = False
            if runtime.timer_task and not runtime.timer_task.done():
                runtime.timer_task.cancel()

            revealed_word = runtime.secret_word or ""
            round_num = runtime.current_round
            round_scores_copy = dict(runtime.round_points_earned)

            # Clear ephemeral drawing strokes when round ends
            runtime.strokes.clear()

            with self._session_factory() as db:
                room = db.query(GameRoom).filter(GameRoom.id == runtime.room_id).first()
                if not room:
                    return

                if runtime.active_round_id is not None:
                    db_round = db.query(GameRound).filter(GameRound.id == runtime.active_round_id).first()
                    if db_round and db_round.ended_at is None:
                        db_round.ended_at = utc_now()
                        db.commit()

                db.refresh(room)
                serialized_players = self._get_serialized_players(db, room, runtime)

                await self.broadcast(
                    runtime,
                    "round_ended",
                    {
                        "round_number": round_num,
                        "total_rounds": room.total_rounds,
                        "word": revealed_word,
                        "reason": reason,
                        "round_scores": round_scores_copy,
                        "correct_guesser_ids": list(runtime.correct_guesser_ids),
                        "players": serialized_players,
                    },
                )
                await self.broadcast(runtime, "canvas_cleared", {"round_number": round_num})

                # Determine whether to end game or schedule next round
                connected_active = [
                    p
                    for p in room.players
                    if p.left_at is None and p.id not in runtime.left_players and p.id in runtime.connected_players
                ]
                if len(connected_active) < runtime.min_players:
                    await self._finalize_game_locked(db, room, runtime, reason="insufficient_players")
                    return

                if room.current_round >= room.total_rounds:
                    await self._finalize_game_locked(db, room, runtime, reason="all_rounds_completed")
                    return

        # Schedule next round after intermission (outside runtime.lock!)
        if runtime.intermission_seconds <= 0:
            await self.start_next_round(runtime)
        else:
            runtime.intermission_task = asyncio.create_task(
                self._intermission_then_next_round(runtime)
            )

    async def _intermission_then_next_round(self, runtime: RoomRuntimeState) -> None:
        try:
            await asyncio.sleep(runtime.intermission_seconds)
            if runtime.status == "playing" and not runtime.round_active:
                await self.start_next_round(runtime)
        except asyncio.CancelledError:
            return

    async def _finalize_game_locked(
        self, db: Session, room: GameRoom, runtime: RoomRuntimeState, reason: str
    ) -> None:
        if runtime.timer_task and not runtime.timer_task.done():
            runtime.timer_task.cancel()
        if runtime.intermission_task and not runtime.intermission_task.done():
            runtime.intermission_task.cancel()

        runtime.round_active = False
        runtime.status = "finished"
        runtime.strokes.clear()

        now = utc_now()
        room.status = "finished"
        room.ended_at = now

        # Ensure any unfinished round has ended_at set
        for r in room.rounds:
            if r.ended_at is None:
                r.ended_at = now

        db.commit()
        db.refresh(room)

        detail = self.build_room_detail(db, room)
        leaderboard = sorted(
            [p.model_dump(mode="json") for p in detail.players],
            key=lambda x: (-x["score"], x["joined_at"]),
        )
        winner = leaderboard[0] if leaderboard else None

        await self.broadcast(
            runtime,
            "game_ended",
            {
                "room_code": room.room_code,
                "reason": reason,
                "ended_at": now.isoformat(),
                "winner": winner,
                "leaderboard": leaderboard,
            },
        )

    async def handle_leave_room(self, runtime: RoomRuntimeState, player_id: int) -> None:
        ws = runtime.connections.pop(player_id, None)
        runtime.connected_players.discard(player_id)
        runtime.ready_players.discard(player_id)
        runtime.left_players.add(player_id)

        with self._session_factory() as db:
            room = db.query(GameRoom).filter(GameRoom.id == runtime.room_id).first()
            player = db.query(Player).filter(Player.id == player_id).first()
            player_name = player.display_name if player else "Player"
            if player and player.left_at is None:
                player.left_at = utc_now()
                db.commit()
            if room:
                db.refresh(room)
                self._ensure_host(db, room, runtime)
                await self.broadcast(
                    runtime,
                    "player_left",
                    {
                        "player_id": player_id,
                        "display_name": player_name,
                        "host_player_id": runtime.host_player_id,
                        "players": self._get_serialized_players(db, room, runtime),
                    },
                )

        if ws is not None:
            try:
                await ws.close()
            except Exception:
                pass

        await self._evaluate_post_disconnect_state(runtime, disconnected_player_id=player_id)

    async def handle_disconnect(self, runtime: RoomRuntimeState, player_id: int) -> None:
        if player_id not in runtime.connected_players and player_id not in runtime.connections:
            return

        runtime.connections.pop(player_id, None)
        runtime.connected_players.discard(player_id)
        runtime.ready_players.discard(player_id)

        with self._session_factory() as db:
            room = db.query(GameRoom).filter(GameRoom.id == runtime.room_id).first()
            player = db.query(Player).filter(Player.id == player_id).first()
            player_name = player.display_name if player else "Player"
            if room:
                self._ensure_host(db, room, runtime)
                await self.broadcast(
                    runtime,
                    "player_disconnected",
                    {
                        "player_id": player_id,
                        "display_name": player_name,
                        "host_player_id": runtime.host_player_id,
                        "players": self._get_serialized_players(db, room, runtime),
                    },
                )

        await self._evaluate_post_disconnect_state(runtime, disconnected_player_id=player_id)

    async def _evaluate_post_disconnect_state(
        self, runtime: RoomRuntimeState, disconnected_player_id: int
    ) -> None:
        """
        Ensure the game never gets permanently stuck when a player or drawer disconnects.
        """
        if runtime.status != "playing":
            return

        # 1. If the current drawer disconnected during an active round, end the round immediately
        if runtime.round_active and disconnected_player_id == runtime.drawer_player_id:
            await self.end_current_round(runtime, reason="drawer_disconnected")
            return

        with self._session_factory() as db:
            room = db.query(GameRoom).filter(GameRoom.id == runtime.room_id).first()
            if not room or room.status != "playing":
                return

            connected_active = [
                p
                for p in room.players
                if p.left_at is None and p.id not in runtime.left_players and p.id in runtime.connected_players
            ]

            # 2. If fewer than min_players remain connected, end the round/game cleanly
            if len(connected_active) < runtime.min_players:
                if runtime.round_active:
                    await self.end_current_round(runtime, reason="insufficient_players")
                else:
                    async with runtime.lock:
                        await self._finalize_game_locked(db, room, runtime, reason="insufficient_players")
                return

            # 3. If a guesser disconnected and all remaining active guessers have already guessed, end round
            if runtime.round_active:
                remaining_guessers = {
                    p.id for p in connected_active if p.id != runtime.drawer_player_id
                }
                if remaining_guessers and remaining_guessers.issubset(runtime.correct_guesser_ids):
                    await self.end_current_round(runtime, reason="all_guessed")


# Global singleton game engine instance
game_engine = GameEngine()
