import asyncio
import json
import logging
from fastapi import APIRouter, WebSocket, WebSocketDisconnect

from app.game_engine import game_engine, ws_envelope

logger = logging.getLogger(__name__)
router = APIRouter(tags=["Game WebSockets"])


async def _run_disconnect_safely(runtime, player_id: int) -> None:
    task = asyncio.create_task(game_engine.handle_disconnect(runtime, player_id))
    try:
        await asyncio.shield(task)
    except asyncio.CancelledError:
        pass


@router.websocket("/ws/{room_code}/{player_id}")
async def game_room_websocket(websocket: WebSocket, room_code: str, player_id: int):
    """
    Real-Time WebSocket endpoint for a player in a game room.

    Incoming events (`{"event": "...", "data": {...}}`):
    - `player_ready`: Toggle or set lobby ready status
    - `start_game`: Start the game when minimum players are present
    - `draw_stroke`: Broadcast drawing stroke points (drawer only)
    - `clear_canvas`: Clear the shared canvas (drawer only)
    - `submit_guess`: Submit a guess for the active round (guessers only)
    - `leave_room`: Leave the game room cleanly
    - `ping`: Keep-alive check
    """
    runtime = await game_engine.connect_player(room_code, player_id, websocket)
    if runtime is None:
        return

    try:
        while True:
            raw_text = await websocket.receive_text()
            try:
                payload = json.loads(raw_text)
                if not isinstance(payload, dict):
                    raise ValueError("WebSocket message must be a JSON object.")
            except Exception:
                await websocket.send_json(
                    ws_envelope(
                        "error",
                        {"code": "INVALID_JSON", "message": "Message must be valid JSON with 'event' and 'data'."},
                    )
                )
                continue

            await game_engine.handle_client_message(runtime, player_id, payload)
    except WebSocketDisconnect:
        await _run_disconnect_safely(runtime, player_id)
    except asyncio.CancelledError:
        await _run_disconnect_safely(runtime, player_id)
    except Exception as exc:
        logger.warning("WebSocket error for player %s in room %s: %s", player_id, room_code, exc)
        await _run_disconnect_safely(runtime, player_id)
