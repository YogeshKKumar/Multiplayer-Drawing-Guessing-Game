"""Initial schema for game_rooms, players, game_rounds, and guesses

Revision ID: 0001_initial_schema
Revises: 
Create Date: 2026-10-12 00:00:00.000000

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa

# revision identifiers, used by Alembic.
revision: str = "0001_initial_schema"
down_revision: Union[str, None] = None
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        "game_rooms",
        sa.Column("id", sa.Integer(), autoincrement=True, nullable=False),
        sa.Column("room_code", sa.String(length=16), nullable=False),
        sa.Column("status", sa.String(length=32), nullable=False, server_default="waiting"),
        sa.Column("current_round", sa.Integer(), nullable=False, server_default="0"),
        sa.Column("total_rounds", sa.Integer(), nullable=False, server_default="3"),
        sa.Column("created_at", sa.DateTime(), nullable=False),
        sa.Column("started_at", sa.DateTime(), nullable=True),
        sa.Column("ended_at", sa.DateTime(), nullable=True),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index("ix_game_rooms_room_code", "game_rooms", ["room_code"], unique=True)
    op.create_index("ix_game_rooms_status", "game_rooms", ["status"], unique=False)

    op.create_table(
        "players",
        sa.Column("id", sa.Integer(), autoincrement=True, nullable=False),
        sa.Column("room_id", sa.Integer(), nullable=False),
        sa.Column("display_name", sa.String(length=64), nullable=False),
        sa.Column("score", sa.Integer(), nullable=False, server_default="0"),
        sa.Column("joined_at", sa.DateTime(), nullable=False),
        sa.Column("left_at", sa.DateTime(), nullable=True),
        sa.ForeignKeyConstraint(["room_id"], ["game_rooms.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index("ix_players_room_id", "players", ["room_id"], unique=False)
    op.create_index("ix_players_display_name", "players", ["display_name"], unique=False)

    op.create_table(
        "game_rounds",
        sa.Column("id", sa.Integer(), autoincrement=True, nullable=False),
        sa.Column("room_id", sa.Integer(), nullable=False),
        sa.Column("round_number", sa.Integer(), nullable=False),
        sa.Column("drawer_player_id", sa.Integer(), nullable=False),
        sa.Column("word", sa.String(length=100), nullable=False),
        sa.Column("started_at", sa.DateTime(), nullable=False),
        sa.Column("ended_at", sa.DateTime(), nullable=True),
        sa.ForeignKeyConstraint(["room_id"], ["game_rooms.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["drawer_player_id"], ["players.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index("ix_game_rounds_room_id", "game_rounds", ["room_id"], unique=False)
    op.create_index("ix_game_rounds_drawer_player_id", "game_rounds", ["drawer_player_id"], unique=False)
    op.create_index("ix_game_rounds_room_round", "game_rounds", ["room_id", "round_number"], unique=False)

    op.create_table(
        "guesses",
        sa.Column("id", sa.Integer(), autoincrement=True, nullable=False),
        sa.Column("round_id", sa.Integer(), nullable=False),
        sa.Column("player_id", sa.Integer(), nullable=False),
        sa.Column("guess_text", sa.String(length=255), nullable=False),
        sa.Column("is_correct", sa.Boolean(), nullable=False, server_default=sa.text("0")),
        sa.Column("submitted_at", sa.DateTime(), nullable=False),
        sa.ForeignKeyConstraint(["round_id"], ["game_rounds.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["player_id"], ["players.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index("ix_guesses_round_id", "guesses", ["round_id"], unique=False)
    op.create_index("ix_guesses_player_id", "guesses", ["player_id"], unique=False)


def downgrade() -> None:
    op.drop_index("ix_guesses_player_id", table_name="guesses")
    op.drop_index("ix_guesses_round_id", table_name="guesses")
    op.drop_table("guesses")

    op.drop_index("ix_game_rounds_room_round", table_name="game_rounds")
    op.drop_index("ix_game_rounds_drawer_player_id", table_name="game_rounds")
    op.drop_index("ix_game_rounds_room_id", table_name="game_rounds")
    op.drop_table("game_rounds")

    op.drop_index("ix_players_display_name", table_name="players")
    op.drop_index("ix_players_room_id", table_name="players")
    op.drop_table("players")

    op.drop_index("ix_game_rooms_status", table_name="game_rooms")
    op.drop_index("ix_game_rooms_room_code", table_name="game_rooms")
    op.drop_table("game_rooms")
