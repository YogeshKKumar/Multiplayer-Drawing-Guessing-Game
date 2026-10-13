from typing import Optional
from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy import desc
from sqlalchemy.orm import Session

from app.config import get_settings
from app.database import get_db
from app.game_engine import game_engine, generate_unique_room_code
from app.models import GameRoom, GameRound, Guess, Player, utc_now
from app.schemas import (
    CreateRoomRequest,
    GameHistoryItem,
    GameHistoryResponse,
    JoinRoomRequest,
    JoinRoomResponse,
    LeaderboardEntry,
    LeaderboardResponse,
    LeaveRoomRequest,
    PlayerStatsResponse,
    RoomDetailResponse,
)

router = APIRouter(prefix="/api", tags=["Game REST API"])
settings = get_settings()


@router.get("/health", summary="Health check endpoint")
def health_check():
    return {
        "status": "healthy",
        "service": settings.APP_NAME,
        "environment": settings.APP_ENV,
    }


@router.post(
    "/rooms",
    response_model=JoinRoomResponse,
    status_code=status.HTTP_201_CREATED,
    summary="Create a new game room and join as host",
)
def create_room(payload: CreateRoomRequest, db: Session = Depends(get_db)):
    display_name = payload.display_name.strip()
    if not display_name:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Display name cannot be blank.",
        )

    room_code = generate_unique_room_code(db)
    room = GameRoom(
        room_code=room_code,
        status="waiting",
        current_round=0,
        total_rounds=payload.total_rounds,
        created_at=utc_now(),
    )
    db.add(room)
    db.flush()

    host_player = Player(
        room_id=room.id,
        display_name=display_name,
        score=0,
        joined_at=utc_now(),
    )
    db.add(host_player)
    db.commit()
    db.refresh(room)
    db.refresh(host_player)

    runtime = game_engine.get_or_load_runtime(db, room)
    runtime.host_player_id = host_player.id
    runtime.total_rounds = payload.total_rounds
    runtime.round_duration_seconds = payload.round_duration_seconds

    detail = game_engine.build_room_detail(db, room)
    player_info = next(p for p in detail.players if p.id == host_player.id)
    return JoinRoomResponse(room=detail, player=player_info)


@router.post(
    "/rooms/{room_code}/join",
    response_model=JoinRoomResponse,
    summary="Join an existing active room or reconnect an existing player",
)
def join_room(room_code: str, payload: JoinRoomRequest, db: Session = Depends(get_db)):
    code = room_code.strip().upper()
    display_name = payload.display_name.strip()
    if not display_name:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Display name cannot be blank.",
        )

    room = db.query(GameRoom).filter(GameRoom.room_code == code).first()
    if not room:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Room '{code}' was not found.",
        )

    # Prevent unauthorized users from joining inactive (finished) rooms
    if room.status == "finished":
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="This room has already finished and is inactive.",
        )

    runtime = game_engine.get_or_load_runtime(db, room)

    # 1. Check if reconnecting by explicit player_id
    if payload.player_id is not None:
        existing_by_id = (
            db.query(Player)
            .filter(Player.id == payload.player_id, Player.room_id == room.id)
            .first()
        )
        if existing_by_id:
            existing_by_id.left_at = None
            runtime.left_players.discard(existing_by_id.id)
            db.commit()
            db.refresh(room)
            detail = game_engine.build_room_detail(db, room)
            p_info = next(p for p in detail.players if p.id == existing_by_id.id)
            return JoinRoomResponse(room=detail, player=p_info)

    # 2. Check if reconnecting by display_name when currently disconnected
    existing_by_name = (
        db.query(Player)
        .filter(
            Player.room_id == room.id,
            Player.display_name == display_name,
        )
        .first()
    )
    if existing_by_name:
        if existing_by_name.id not in runtime.connected_players:
            existing_by_name.left_at = None
            runtime.left_players.discard(existing_by_name.id)
            db.commit()
            db.refresh(room)
            detail = game_engine.build_room_detail(db, room)
            p_info = next(p for p in detail.players if p.id == existing_by_name.id)
            return JoinRoomResponse(room=detail, player=p_info)
        else:
            raise HTTPException(
                status_code=status.HTTP_409_CONFLICT,
                detail=f"Display name '{display_name}' is already active in this room.",
            )

    # New players cannot join if room is full
    active_players = [p for p in room.players if p.left_at is None]
    if len(active_players) >= settings.MAX_PLAYERS:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="This room is currently full.",
        )

    new_player = Player(
        room_id=room.id,
        display_name=display_name,
        score=0,
        joined_at=utc_now(),
    )
    db.add(new_player)
    db.commit()
    db.refresh(room)
    db.refresh(new_player)

    if runtime.host_player_id is None:
        runtime.host_player_id = new_player.id

    detail = game_engine.build_room_detail(db, room)
    p_info = next(p for p in detail.players if p.id == new_player.id)
    return JoinRoomResponse(room=detail, player=p_info)


@router.post(
    "/rooms/{room_code}/bot",
    response_model=RoomDetailResponse,
    summary="Add an AI Practice Bot to the room for solo/instant play",
)
async def add_practice_bot(room_code: str, db: Session = Depends(get_db)):
    code = room_code.strip().upper()
    room = db.query(GameRoom).filter(GameRoom.room_code == code).first()
    if not room:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Room '{code}' was not found.",
        )
    if room.status != "waiting":
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Bots can only be added while the room is in the lobby.",
        )

    runtime = game_engine.get_or_load_runtime(db, room)
    bot_num = len(runtime.bot_players) + 1
    bot_name = f"SketchBot #{bot_num} 🤖"

    bot_player = Player(
        room_id=room.id,
        display_name=bot_name,
        score=0,
        joined_at=utc_now(),
    )
    db.add(bot_player)
    db.commit()
    db.refresh(room)
    db.refresh(bot_player)

    runtime.bot_players.add(bot_player.id)
    runtime.connected_players.add(bot_player.id)
    runtime.ready_players.add(bot_player.id)

    await game_engine.broadcast(
        runtime,
        "player_joined",
        {
            "player_id": bot_player.id,
            "display_name": bot_player.display_name,
            "host_player_id": runtime.host_player_id,
            "players": game_engine._get_serialized_players(db, room, runtime),
        },
    )
    return game_engine.build_room_detail(db, room)


@router.post(
    "/rooms/{room_code}/leave",
    summary="Leave a game room",
)
async def leave_room(room_code: str, payload: LeaveRoomRequest, db: Session = Depends(get_db)):
    code = room_code.strip().upper()
    room = db.query(GameRoom).filter(GameRoom.room_code == code).first()
    if not room:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Room '{code}' not found.",
        )

    player = (
        db.query(Player)
        .filter(Player.id == payload.player_id, Player.room_id == room.id)
        .first()
    )
    if not player:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Player not found in this room.",
        )

    runtime = game_engine.get_or_load_runtime(db, room)
    await game_engine.handle_leave_room(runtime, player.id)

    return {"status": "left", "room_code": code, "player_id": player.id}


@router.get(
    "/rooms/{room_code}",
    response_model=RoomDetailResponse,
    summary="Get room information (never leaks active secret word)",
)
def get_room_info(room_code: str, db: Session = Depends(get_db)):
    code = room_code.strip().upper()
    room = db.query(GameRoom).filter(GameRoom.room_code == code).first()
    if not room:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Room '{code}' not found.",
        )
    return game_engine.build_room_detail(db, room)


@router.get(
    "/games/history",
    response_model=GameHistoryResponse,
    summary="Get completed game history",
)
def get_game_history(
    limit: int = Query(default=20, ge=1, le=100),
    include_active: bool = Query(default=False, description="Whether to include non-finished rooms"),
    db: Session = Depends(get_db),
):
    query = db.query(GameRoom)
    if not include_active:
        query = query.filter(GameRoom.status == "finished")

    total = query.count()
    rooms = query.order_by(desc(GameRoom.created_at)).limit(limit).all()

    items: list[GameHistoryItem] = []
    for r in rooms:
        winner = None
        if r.players:
            winner = sorted(r.players, key=lambda p: (-p.score, p.joined_at))[0]

        # Only expose secret words for completed rounds / finished games
        words = [
            rnd.word
            for rnd in r.rounds
            if rnd.ended_at is not None or r.status == "finished"
        ]

        items.append(
            GameHistoryItem(
                id=r.id,
                room_code=r.room_code,
                status=r.status,
                total_rounds=r.total_rounds,
                player_count=len(r.players),
                winner_name=winner.display_name if (winner and r.status == "finished") else None,
                winner_score=winner.score if (winner and r.status == "finished") else None,
                secret_words=words,
                created_at=r.created_at,
                started_at=r.started_at,
                ended_at=r.ended_at,
            )
        )

    return GameHistoryResponse(total=total, games=items)


@router.get(
    "/leaderboard",
    response_model=LeaderboardResponse,
    summary="Get top player scores across games or for a specific room",
)
def get_leaderboard(
    room_code: Optional[str] = Query(default=None, description="Optional room code filter"),
    limit: int = Query(default=20, ge=1, le=100),
    db: Session = Depends(get_db),
):
    query = db.query(Player, GameRoom).join(GameRoom, Player.room_id == GameRoom.id)
    if room_code:
        query = query.filter(GameRoom.room_code == room_code.strip().upper())

    rows = (
        query.order_by(desc(Player.score), Player.joined_at)
        .limit(limit)
        .all()
    )

    entries: list[LeaderboardEntry] = []
    for idx, (player, room) in enumerate(rows, start=1):
        entries.append(
            LeaderboardEntry(
                rank=idx,
                player_id=player.id,
                display_name=player.display_name,
                score=player.score,
                room_code=room.room_code,
                game_ended_at=room.ended_at,
            )
        )

    return LeaderboardResponse(entries=entries)


@router.get(
    "/players/stats/{display_name}",
    response_model=PlayerStatsResponse,
    summary="Get aggregated statistics for a player by display name",
)
def get_player_statistics(display_name: str, db: Session = Depends(get_db)):
    clean_name = display_name.strip()
    players = db.query(Player).filter(Player.display_name == clean_name).all()
    if not players:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"No player records found for '{clean_name}'.",
        )

    player_ids = [p.id for p in players]
    games_played = len(players)
    total_score = sum(p.score for p in players)
    highest_score = max((p.score for p in players), default=0)
    average_score = round(total_score / games_played, 2) if games_played > 0 else 0.0

    # Calculate games won in finished rooms
    games_won = 0
    for p in players:
        room = p.room
        if room and room.status == "finished" and room.players:
            top_player = sorted(room.players, key=lambda x: (-x.score, x.joined_at))[0]
            if top_player.id == p.id and top_player.score > 0:
                games_won += 1

    total_guesses = db.query(Guess).filter(Guess.player_id.in_(player_ids)).count()
    correct_guesses = (
        db.query(Guess)
        .filter(Guess.player_id.in_(player_ids), Guess.is_correct.is_(True))
        .count()
    )
    accuracy = round((correct_guesses / total_guesses) * 100.0, 2) if total_guesses > 0 else 0.0

    rounds_drawn = (
        db.query(GameRound)
        .filter(GameRound.drawer_player_id.in_(player_ids))
        .count()
    )

    return PlayerStatsResponse(
        display_name=clean_name,
        games_played=games_played,
        games_won=games_won,
        total_score=total_score,
        highest_score=highest_score,
        average_score=average_score,
        total_guesses=total_guesses,
        correct_guesses=correct_guesses,
        guess_accuracy_percent=accuracy,
        rounds_drawn=rounds_drawn,
    )
