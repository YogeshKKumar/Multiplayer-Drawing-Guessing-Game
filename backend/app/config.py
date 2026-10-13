import os
from functools import lru_cache
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    APP_NAME: str = "SketchSync - Multiplayer Drawing & Guessing Game"
    APP_ENV: str = "development"
    DEBUG: bool = True
    HOST: str = "0.0.0.0"
    PORT: int = 8000

    # MySQL 8.0 Database URL
    DATABASE_URL: str = "mysql+pymysql://gameuser:gamepassword@localhost:3306/drawing_game_db"
    USE_SQLITE_FALLBACK: bool = True

    # Game configuration
    MIN_PLAYERS: int = 2
    MAX_PLAYERS: int = 10
    DEFAULT_TOTAL_ROUNDS: int = 3
    DEFAULT_ROUND_DURATION_SECONDS: int = 60
    ROUND_INTERMISSION_SECONDS: float = 4.0

    # CORS configuration
    CORS_ORIGINS: str = "http://localhost:5173,http://localhost:3000,http://127.0.0.1:5173"

    model_config = SettingsConfigDict(
        env_file=".env",
        env_file_encoding="utf-8",
        extra="ignore",
    )

    @property
    def cors_origin_list(self) -> list[str]:
        if not self.CORS_ORIGINS:
            return ["*"]
        return [origin.strip() for origin in self.CORS_ORIGINS.split(",") if origin.strip()]


@lru_cache
def get_settings() -> Settings:
    return Settings()
