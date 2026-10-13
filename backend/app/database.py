import logging
from typing import Generator
from sqlalchemy import create_engine, text
from sqlalchemy.orm import DeclarativeBase, sessionmaker, Session

from app.config import get_settings

logger = logging.getLogger(__name__)
settings = get_settings()


class Base(DeclarativeBase):
    pass


def _build_engine():
    db_url = settings.DATABASE_URL
    if db_url.startswith("sqlite"):
        return create_engine(
            db_url,
            connect_args={"check_same_thread": False},
            pool_pre_ping=True,
        )

    try:
        mysql_engine = create_engine(
            db_url,
            pool_pre_ping=True,
            pool_recycle=3600,
            pool_size=10,
            max_overflow=20,
        )
        # Verify MySQL connectivity if fallback is enabled
        if settings.USE_SQLITE_FALLBACK:
            with mysql_engine.connect() as conn:
                conn.execute(text("SELECT 1"))
        return mysql_engine
    except Exception as exc:
        if settings.USE_SQLITE_FALLBACK:
            fallback_url = "sqlite:///./drawing_game.db"
            logger.warning(
                "MySQL 8.0 not reachable (%s). Falling back to local SQLite (%s).",
                exc,
                fallback_url,
            )
            return create_engine(
                fallback_url,
                connect_args={"check_same_thread": False},
                pool_pre_ping=True,
            )
        raise


engine = _build_engine()
SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)


def get_db() -> Generator[Session, None, None]:
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()


def init_db() -> None:
    """Create tables if they do not already exist."""
    import app.models  # noqa: F401
    Base.metadata.create_all(bind=engine)
