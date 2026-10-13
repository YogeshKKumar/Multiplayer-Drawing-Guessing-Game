from app.models import GameRoom, GameRound, Player, utc_now


def test_health_and_root_endpoints(client):
    res = client.get("/api/health")
    assert res.status_code == 200
    assert res.json()["status"] == "healthy"

    root_res = client.get("/")
    assert root_res.status_code == 200
    assert "docs" in root_res.json()


def test_create_join_get_and_leave_room(client):
    # 1. Create room
    create_res = client.post(
        "/api/rooms",
        json={"display_name": "Alice", "total_rounds": 3, "round_duration_seconds": 45},
    )
    assert create_res.status_code == 201
    data = create_res.json()
    room_code = data["room"]["room_code"]
    alice_id = data["player"]["id"]
    assert len(room_code) == 6
    assert data["room"]["status"] == "waiting"
    assert data["room"]["total_rounds"] == 3
    assert data["player"]["display_name"] == "Alice"
    assert data["player"]["is_host"] is True

    # 2. Join room as second player
    join_res = client.post(
        f"/api/rooms/{room_code}/join",
        json={"display_name": "Bob"},
    )
    assert join_res.status_code == 200
    bob_data = join_res.json()
    bob_id = bob_data["player"]["id"]
    assert bob_id != alice_id
    assert bob_data["room"]["active_player_count"] == 2

    # 3. Get room details
    info_res = client.get(f"/api/rooms/{room_code}")
    assert info_res.status_code == 200
    assert len(info_res.json()["players"]) == 2

    # 4. Leave room
    leave_res = client.post(
        f"/api/rooms/{room_code}/leave",
        json={"player_id": bob_id},
    )
    assert leave_res.status_code == 200
    assert leave_res.json()["status"] == "left"


def test_prevent_joining_inactive_finished_room(client, db_session):
    create_res = client.post(
        "/api/rooms",
        json={"display_name": "HostUser", "total_rounds": 2},
    )
    room_code = create_res.json()["room"]["room_code"]

    # Mark room as finished in DB
    room = db_session.query(GameRoom).filter(GameRoom.room_code == room_code).first()
    room.status = "finished"
    room.ended_at = utc_now()
    db_session.commit()

    # Unauthorized user trying to join finished room must receive 403 Forbidden
    join_res = client.post(
        f"/api/rooms/{room_code}/join",
        json={"display_name": "Intruder"},
    )
    assert join_res.status_code == 403
    assert "finished" in join_res.json()["detail"].lower()


def test_api_never_exposes_secret_word_during_active_round(client, db_session):
    create_res = client.post(
        "/api/rooms",
        json={"display_name": "DrawerAlice", "total_rounds": 3},
    )
    room_code = create_res.json()["room"]["room_code"]
    drawer_id = create_res.json()["player"]["id"]

    room = db_session.query(GameRoom).filter(GameRoom.room_code == room_code).first()
    room.status = "playing"
    room.current_round = 1
    active_round = GameRound(
        room_id=room.id,
        round_number=1,
        drawer_player_id=drawer_id,
        word="spaceship",
        started_at=utc_now(),
        ended_at=None,
    )
    db_session.add(active_round)
    db_session.commit()

    # Fetch room info via REST API while round is active
    room_res = client.get(f"/api/rooms/{room_code}")
    assert room_res.status_code == 200
    payload = room_res.json()
    raw_text = room_res.text.lower()

    # The secret word "spaceship" must NEVER appear anywhere in the API response!
    assert "spaceship" not in raw_text
    assert payload["rounds"][0]["word"] is None
    assert payload["rounds"][0]["word_length"] == 9
    assert payload["rounds"][0]["word_hint"] == "_ _ _ _ _ _ _ _ _"


def test_history_leaderboard_and_player_stats_endpoints(client, db_session):
    room = GameRoom(
        room_code="HIST01",
        status="finished",
        current_round=2,
        total_rounds=2,
        created_at=utc_now(),
        started_at=utc_now(),
        ended_at=utc_now(),
    )
    db_session.add(room)
    db_session.flush()

    p1 = Player(room_id=room.id, display_name="Champion", score=380, joined_at=utc_now())
    p2 = Player(room_id=room.id, display_name="RunnerUp", score=190, joined_at=utc_now())
    db_session.add_all([p1, p2])
    db_session.flush()

    rnd = GameRound(
        room_id=room.id,
        round_number=1,
        drawer_player_id=p1.id,
        word="telescope",
        started_at=utc_now(),
        ended_at=utc_now(),
    )
    db_session.add(rnd)
    db_session.commit()

    # History endpoint
    hist_res = client.get("/api/games/history")
    assert hist_res.status_code == 200
    hist_data = hist_res.json()
    assert hist_data["total"] >= 1
    assert hist_data["games"][0]["room_code"] == "HIST01"
    assert hist_data["games"][0]["winner_name"] == "Champion"
    assert "telescope" in hist_data["games"][0]["secret_words"]

    # Leaderboard endpoint
    lb_res = client.get("/api/leaderboard")
    assert lb_res.status_code == 200
    entries = lb_res.json()["entries"]
    assert len(entries) >= 2
    assert entries[0]["display_name"] == "Champion"
    assert entries[0]["score"] == 380

    # Player statistics endpoint
    stats_res = client.get("/api/players/stats/Champion")
    assert stats_res.status_code == 200
    stats = stats_res.json()
    assert stats["display_name"] == "Champion"
    assert stats["games_played"] == 1
    assert stats["games_won"] == 1
    assert stats["total_score"] == 380
    assert stats["rounds_drawn"] == 1
