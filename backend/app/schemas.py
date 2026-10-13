from datetime import datetime
from typing import Any, Literal, Optional
from pydantic import BaseModel, Field, ConfigDict


# ============================================================================
# REST API Request Schemas
# ============================================================================

class CreateRoomRequest(BaseModel):
    display_name: str = Field(..., min_length=1, max_length=64, description="Creator's display name")
    total_rounds: int = Field(default=3, ge=1, le=15, description="Total number of rounds in the game")
    round_duration_seconds: int = Field(
        default=60, ge=5, le=300, description="Countdown timer duration per round in seconds"
    )


class JoinRoomRequest(BaseModel):
    display_name: str = Field(..., min_length=1, max_length=64, description="Player's display name")
    player_id: Optional[int] = Field(
        default=None, description="Optional existing player_id for reconnecting to a room"
    )


class LeaveRoomRequest(BaseModel):
    player_id: int = Field(..., description="ID of the player leaving the room")


# ============================================================================
# REST API Response Schemas
# ============================================================================

class PlayerInfo(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    room_id: int
    display_name: str
    score: int
    joined_at: datetime
    left_at: Optional[datetime] = None
    is_ready: bool = False
    is_connected: bool = False
    is_host: bool = False
    is_drawer: bool = False
    has_guessed_current_round: bool = False


class GuessPublicInfo(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    round_id: int
    player_id: int
    player_name: Optional[str] = None
    guess_text: str
    is_correct: bool
    submitted_at: datetime


class RoundPublicInfo(BaseModel):
    """
    Public representation of a round.
    SECURITY: `word` is NEVER populated while the round is still active (`ended_at is None`).
    Only `word_hint` and `word_length` are returned for active rounds.
    """

    id: int
    room_id: int
    round_number: int
    drawer_player_id: int
    drawer_name: Optional[str] = None
    word: Optional[str] = Field(
        default=None,
        description="Revealed secret word ONLY after the round has ended; None while round is active",
    )
    word_hint: str = Field(description="Masked hint of the word (e.g. '_ _ _ _ _')")
    word_length: int = Field(description="Character length of the secret word")
    started_at: datetime
    ended_at: Optional[datetime] = None


class RoomDetailResponse(BaseModel):
    id: int
    room_code: str
    status: str
    current_round: int
    total_rounds: int
    round_duration_seconds: int = 60
    min_players: int = 2
    host_player_id: Optional[int] = None
    drawer_player_id: Optional[int] = None
    remaining_seconds: int = 0
    word_hint: Optional[str] = None
    word_length: Optional[int] = None
    created_at: datetime
    started_at: Optional[datetime] = None
    ended_at: Optional[datetime] = None
    players: list[PlayerInfo] = Field(default_factory=list)
    active_player_count: int = 0
    rounds: list[RoundPublicInfo] = Field(default_factory=list)
    winner: Optional[PlayerInfo] = None


class JoinRoomResponse(BaseModel):
    room: RoomDetailResponse
    player: PlayerInfo


class GameHistoryItem(BaseModel):
    id: int
    room_code: str
    status: str
    total_rounds: int
    player_count: int
    winner_name: Optional[str] = None
    winner_score: Optional[int] = None
    secret_words: list[str] = Field(default_factory=list)
    created_at: datetime
    started_at: Optional[datetime] = None
    ended_at: Optional[datetime] = None


class GameHistoryResponse(BaseModel):
    total: int
    games: list[GameHistoryItem]


class LeaderboardEntry(BaseModel):
    rank: int
    player_id: int
    display_name: str
    score: int
    room_code: str
    game_ended_at: Optional[datetime] = None


class LeaderboardResponse(BaseModel):
    entries: list[LeaderboardEntry]


class PlayerStatsResponse(BaseModel):
    display_name: str
    games_played: int
    games_won: int
    total_score: int
    highest_score: int
    average_score: float
    total_guesses: int
    correct_guesses: int
    guess_accuracy_percent: float
    rounds_drawn: int


# ============================================================================
# WebSocket Event Payloads & Envelope
# ============================================================================

class StrokePoint(BaseModel):
    x: float
    y: float


class DrawStrokeData(BaseModel):
    stroke_id: Optional[str] = None
    tool: Literal["brush", "eraser", "marker", "spray", "line", "rect", "circle", "fill"] = "brush"
    color: str = "#000000"
    brush_size: float = Field(default=4.0, ge=1.0, le=60.0)
    filled: bool = False
    opacity: float = Field(default=1.0, ge=0.1, le=1.0)
    points: list[StrokePoint] = Field(..., min_length=1)


class WebSocketMessage(BaseModel):
    """Standardized WebSocket message structure for all client <-> server events."""

    event: str = Field(..., description="Event type identifier")
    data: dict[str, Any] = Field(default_factory=dict, description="Event payload")
    timestamp: Optional[str] = Field(default=None, description="ISO-8601 UTC timestamp")
