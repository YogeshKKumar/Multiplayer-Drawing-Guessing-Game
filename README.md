# SketchSync — Real-Time Multiplayer Drawing & Guessing Game

A browser-based real-time multiplayer drawing and guessing game built with **Python 3.12**, **FastAPI**, **WebSockets**, **SQLAlchemy 2.0**, **Alembic**, **MySQL 8.0**, **React 18**, **TypeScript**, **Vite**, **Material UI**, and the **HTML5 Canvas API**.

---

## Key Features & Architecture

1. **Synchronized Real-Time Game Engine (`backend/app/game_engine.py`)**:
   - Full bidirectional WebSocket state synchronization across all connected players in a game room.
   - **Drawer Rotation & Secret Word Isolation**: Selects one drawer per round and unicasts the `secret_word` exclusively to the drawer's WebSocket connection. Guessing players only receive a masked hint (`_ _ _ _ _`) and word length.
   - **Stroke-Level Canvas Synchronization**: Transmits compact vector stroke segments (`draw_stroke`) and clear operations (`clear_canvas`) rather than full canvas images. Active-round strokes are buffered in ephemeral memory so reconnecting players reconstruct the current drawing immediately, and are cleared when the round ends (never stored permanently in MySQL).
   - **Server-Authoritative Guess Validation & Scoring (`backend/app/scoring.py`)**:
     - Prevents the drawer from submitting guesses.
     - Prevents duplicate scoring once a player has guessed the word for the active round.
     - Detects 1-character-off close guesses (`is_close: true`) without leaking the word.
     - Awards points based on **correctness**, **time remaining ratio**, **round number multiplier**, and **first-solver bonus**, plus awards a **drawer bonus**.
   - **Disconnect & Reconnect Resilience**:
     - If the active drawer disconnects mid-round, the round immediately ends cleanly (`reason: "drawer_disconnected"`) and transitions to the next drawer/round so the game never gets stuck.
     - If active connected players drop below `MIN_PLAYERS`, the game concludes gracefully.
     - Players who refresh or temporarily lose connection automatically reconnect and receive a `sync_state` event with the current scoreboard, timer, and active round strokes.

---

## Database Schema (MySQL 8.0 / SQLAlchemy / Alembic)

### `game_rooms`
| Column | Type | Description |
| :--- | :--- | :--- |
| `id` | `INT PK AUTO_INCREMENT` | Primary key |
| `room_code` | `VARCHAR(16) UNIQUE` | Unique 6-character alphanumeric room code |
| `status` | `VARCHAR(32)` | `waiting`, `playing`, or `finished` |
| `current_round` | `INT` | Active round number (`0` in lobby) |
| `total_rounds` | `INT` | Configured total rounds |
| `created_at` | `DATETIME` | UTC creation timestamp |
| `started_at` | `DATETIME NULL` | UTC game start timestamp |
| `ended_at` | `DATETIME NULL` | UTC game completion timestamp |

### `players`
| Column | Type | Description |
| :--- | :--- | :--- |
| `id` | `INT PK AUTO_INCREMENT` | Primary key |
| `room_id` | `INT FK (game_rooms.id)` | Room foreign key |
| `display_name` | `VARCHAR(64)` | Player display name |
| `score` | `INT` | Cumulative game score |
| `joined_at` | `DATETIME` | UTC join timestamp |
| `left_at` | `DATETIME NULL` | UTC leave timestamp (`NULL` while active) |

### `game_rounds`
| Column | Type | Description |
| :--- | :--- | :--- |
| `id` | `INT PK AUTO_INCREMENT` | Primary key |
| `room_id` | `INT FK (game_rooms.id)` | Room foreign key |
| `round_number` | `INT` | 1-indexed round number |
| `drawer_player_id` | `INT FK (players.id)` | Player selected as drawer |
| `word` | `VARCHAR(100)` | Secret word (masked in API responses until round ends) |
| `started_at` | `DATETIME` | UTC round start timestamp |
| `ended_at` | `DATETIME NULL` | UTC round end timestamp |

### `guesses`
| Column | Type | Description |
| :--- | :--- | :--- |
| `id` | `INT PK AUTO_INCREMENT` | Primary key |
| `round_id` | `INT FK (game_rounds.id)` | Round foreign key |
| `player_id` | `INT FK (players.id)` | Guessing player foreign key |
| `guess_text` | `VARCHAR(255)` | Submitted guess text |
| `is_correct` | `BOOLEAN` | Whether the guess matched the secret word |
| `submitted_at` | `DATETIME` | UTC submission timestamp |

---

## WebSocket Event Specification

Endpoint: `ws://<host>:8000/ws/{room_code}/{player_id}`

All messages use a standardized JSON envelope:
```json
{
  "event": "event_name",
  "data": {},
  "timestamp": "2026-10-12T12:00:00.000000+00:00"
}
```

### Client $\rightarrow$ Server Events
- `player_ready`: `{"is_ready": true}` — Toggle ready status in the lobby.
- `start_game`: `{}` — Start the game when minimum connected players ($\ge 2$) are present.
- `draw_stroke`: `{"stroke_id": "s1", "tool": "brush", "color": "#38bdf8", "brush_size": 6, "points": [{"x": 100, "y": 150}, {"x": 120, "y": 170}]}` — Drawer only.
- `clear_canvas`: `{}` — Clear the shared canvas (Drawer only).
- `submit_guess`: `{"guess_text": "elephant"}` — Submit a guess (Guessing players only).
- `leave_room`: `{}` — Leave the game room cleanly.
- `ping`: `{}` — Keep-alive check.

### Server $\rightarrow$ Client Events
- `sync_state`: Full room, player, and current round stroke state on connect/reconnect.
- `player_joined` / `player_connected` / `player_disconnected` / `player_left`: Live connection updates.
- `ready_status_changed`: Lobby readiness updates.
- `game_started`: Game transition from `waiting` to `playing`.
- `round_started`: Broadcasts round number, `drawer_player_id`, `drawer_name`, `word_hint`, `word_length`, and `duration_seconds`.
- `secret_word`: Sent **privately only to the drawer** (`{"round_number": 1, "word": "elephant"}`).
- `draw_stroke`: Broadcasts a stroke segment to all other players.
- `canvas_cleared`: Clears the shared canvas for all players.
- `guess_submitted`: Broadcasts an incorrect guess (with `is_close: true` if 1 edit distance away).
- `correct_guess`: Broadcasts that a player solved the word and points earned (without revealing the word).
- `score_update`: Broadcasts updated player scores and round point deltas.
- `timer_tick`: Broadcasts `remaining_seconds` every second.
- `round_ended`: Reveals `word`, `reason`, and round score breakdown.
- `game_ended`: Broadcasts final `winner` and `leaderboard`.
- `error`: Validation error message sent to the requesting client.

---

## REST API Endpoints

Interactive Swagger UI is available at `http://localhost:8000/docs` and ReDoc at `http://localhost:8000/redoc`.

- `GET /api/health` — Service health check.
- `POST /api/rooms` — Create a new game room and register the host player.
- `POST /api/rooms/{room_code}/join` — Join an active room or reconnect an existing player (blocks joining `finished` rooms with `403 Forbidden`).
- `POST /api/rooms/{room_code}/leave` — Leave a game room.
- `GET /api/rooms/{room_code}` — Get room details, players, and rounds (never exposes the secret word of an active round).
- `GET /api/games/history` — Get completed game history with winners, scores, and secret words.
- `GET /api/leaderboard` — Get top player scores globally or filtered by `room_code`.
- `GET /api/players/stats/{display_name}` — Get aggregated player statistics (games played, wins, total/highest/average score, guess accuracy, rounds drawn).

---

## Running with Docker Compose (MySQL 8.0 + Backend + Frontend)

1. Copy `.env.example` to `.env`:
   ```bash
   cp .env.example .env
   ```
2. Build and start all services:
   ```bash
   docker compose up --build
   ```
   - **Frontend**: `http://localhost:5173`
   - **Backend API & Swagger**: `http://localhost:8000/docs`
   - **MySQL 8.0**: `localhost:3306`

---

## Local Development Setup

### 1. Backend (Python 3.12 + FastAPI)
```bash
cd backend
python -m venv .venv
# Windows PowerShell:
.\.venv\Scripts\Activate.ps1
pip install -r requirements.txt

# Optional: Run Alembic migrations against MySQL 8.0
alembic upgrade head

# Start the FastAPI server (automatically falls back to SQLite if MySQL is not running locally)
uvicorn app.main:app --reload --host 0.0.0.0 --port 8000
```

### 2. Frontend (React + TypeScript + Vite)
```bash
cd frontend
npm install
npm run dev
```
Open `http://localhost:5173` in two or more browser tabs to test real-time drawing and guessing!

---

## Running Automated Tests

The backend includes unit tests for scoring & word masking, REST API security tests, and full multi-client WebSocket integration tests:
```bash
cd backend
.\.venv\Scripts\pytest -v
```
