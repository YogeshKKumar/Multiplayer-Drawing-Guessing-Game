import os
import pytest
from fastapi.testclient import TestClient
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker
from sqlalchemy.pool import StaticPool

from app.database import Base, get_db
from app.game_engine import game_engine
from app.main import app
from app.words import select_secret_word

# Use an in-memory shared SQLite database for fast, deterministic tests
TEST_DATABASE_URL = "sqlite://"

test_engine = create_engine(
    TEST_DATABASE_URL,
    connect_args={"check_same_thread": False},
    poolclass=StaticPool,
)
TestingSessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=test_engine)


def override_get_db():
    db = TestingSessionLocal()
    try:
        yield db
    finally:
        db.close()


@pytest.fixture(autouse=True)
def setup_test_environment():
    Base.metadata.drop_all(bind=test_engine)
    Base.metadata.create_all(bind=test_engine)

    app.dependency_overrides[get_db] = override_get_db
    game_engine._session_factory = TestingSessionLocal
    game_engine.rooms.clear()
    game_engine.word_provider = lambda used: "elephant" if "elephant" not in used else select_secret_word(used)

    yield

    # Cancel any leftover background tasks
    for runtime in list(game_engine.rooms.values()):
        if runtime.timer_task and not runtime.timer_task.done():
            runtime.timer_task.cancel()
        if runtime.intermission_task and not runtime.intermission_task.done():
            runtime.intermission_task.cancel()
    game_engine.rooms.clear()
    app.dependency_overrides.clear()


@pytest.fixture()
def client() -> TestClient:
    with TestClient(app) as c:
        yield c


@pytest.fixture()
def db_session():
    session = TestingSessionLocal()
    try:
        yield session
    finally:
        session.close()
