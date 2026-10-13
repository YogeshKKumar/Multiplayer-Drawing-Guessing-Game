from datetime import datetime, timezone
from typing import Optional
from sqlalchemy import (
    Boolean,
    DateTime,
    ForeignKey,
    Integer,
    String,
    Index,
)
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.database import Base


def utc_now() -> datetime:
    return datetime.now(timezone.utc).replace(tzinfo=None)


class GameRoom(Base):
    """
    game_rooms table:
    - id
    - room_code
    - status ('waiting', 'playing', 'finished')
    - current_round
    - total_rounds
    - created_at
    - started_at
    - ended_at
    """

    __tablename__ = "game_rooms"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    room_code: Mapped[str] = mapped_column(String(16), unique=True, index=True, nullable=False)
    status: Mapped[str] = mapped_column(String(32), default="waiting", nullable=False, index=True)
    current_round: Mapped[int] = mapped_column(Integer, default=0, nullable=False)
    total_rounds: Mapped[int] = mapped_column(Integer, default=3, nullable=False)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=utc_now, nullable=False)
    started_at: Mapped[Optional[datetime]] = mapped_column(DateTime, nullable=True)
    ended_at: Mapped[Optional[datetime]] = mapped_column(DateTime, nullable=True)

    players: Mapped[list["Player"]] = relationship(
        "Player",
        back_populates="room",
        cascade="all, delete-orphan",
        order_by="Player.joined_at",
    )
    rounds: Mapped[list["GameRound"]] = relationship(
        "GameRound",
        back_populates="room",
        cascade="all, delete-orphan",
        order_by="GameRound.round_number",
    )


class Player(Base):
    """
    players table:
    - id
    - room_id
    - display_name
    - score
    - joined_at
    - left_at
    """

    __tablename__ = "players"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    room_id: Mapped[int] = mapped_column(
        Integer, ForeignKey("game_rooms.id", ondelete="CASCADE"), nullable=False, index=True
    )
    display_name: Mapped[str] = mapped_column(String(64), nullable=False, index=True)
    score: Mapped[int] = mapped_column(Integer, default=0, nullable=False)
    joined_at: Mapped[datetime] = mapped_column(DateTime, default=utc_now, nullable=False)
    left_at: Mapped[Optional[datetime]] = mapped_column(DateTime, nullable=True)

    room: Mapped["GameRoom"] = relationship("GameRoom", back_populates="players")
    drawn_rounds: Mapped[list["GameRound"]] = relationship(
        "GameRound", back_populates="drawer", foreign_keys="GameRound.drawer_player_id"
    )
    guesses: Mapped[list["Guess"]] = relationship(
        "Guess", back_populates="player", cascade="all, delete-orphan"
    )


class GameRound(Base):
    """
    game_rounds table:
    - id
    - room_id
    - round_number
    - drawer_player_id
    - word
    - started_at
    - ended_at
    """

    __tablename__ = "game_rounds"
    __table_args__ = (
        Index("ix_game_rounds_room_round", "room_id", "round_number"),
    )

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    room_id: Mapped[int] = mapped_column(
        Integer, ForeignKey("game_rooms.id", ondelete="CASCADE"), nullable=False, index=True
    )
    round_number: Mapped[int] = mapped_column(Integer, nullable=False)
    drawer_player_id: Mapped[int] = mapped_column(
        Integer, ForeignKey("players.id", ondelete="CASCADE"), nullable=False, index=True
    )
    word: Mapped[str] = mapped_column(String(100), nullable=False)
    started_at: Mapped[datetime] = mapped_column(DateTime, default=utc_now, nullable=False)
    ended_at: Mapped[Optional[datetime]] = mapped_column(DateTime, nullable=True)

    room: Mapped["GameRoom"] = relationship("GameRoom", back_populates="rounds")
    drawer: Mapped["Player"] = relationship(
        "Player", back_populates="drawn_rounds", foreign_keys=[drawer_player_id]
    )
    guesses: Mapped[list["Guess"]] = relationship(
        "Guess",
        back_populates="round",
        cascade="all, delete-orphan",
        order_by="Guess.submitted_at",
    )


class Guess(Base):
    """
    guesses table:
    - id
    - round_id
    - player_id
    - guess_text
    - is_correct
    - submitted_at
    """

    __tablename__ = "guesses"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    round_id: Mapped[int] = mapped_column(
        Integer, ForeignKey("game_rounds.id", ondelete="CASCADE"), nullable=False, index=True
    )
    player_id: Mapped[int] = mapped_column(
        Integer, ForeignKey("players.id", ondelete="CASCADE"), nullable=False, index=True
    )
    guess_text: Mapped[str] = mapped_column(String(255), nullable=False)
    is_correct: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)
    submitted_at: Mapped[datetime] = mapped_column(DateTime, default=utc_now, nullable=False)

    round: Mapped["GameRound"] = relationship("GameRound", back_populates="guesses")
    player: Mapped["Player"] = relationship("Player", back_populates="guesses")
