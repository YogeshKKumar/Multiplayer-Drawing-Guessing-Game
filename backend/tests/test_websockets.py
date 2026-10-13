from app.game_engine import game_engine
from app.models import GameRoom


def drain_until_event(ws, target_event: str, max_messages: int = 15) -> list[dict]:
    """Read messages from a TestClient WebSocket until `target_event` is seen."""
    collected = []
    for _ in range(max_messages):
        msg = ws.receive_json()
        collected.append(msg)
        if msg["event"] == target_event:
            return collected
    raise AssertionError(
        f"Did not receive event '{target_event}' within {max_messages} messages. Got: {[m['event'] for m in collected]}"
    )


def test_websocket_full_game_lifecycle_and_security(client, db_session):
    # Create a 2-round game room
    create_res = client.post(
        "/api/rooms",
        json={"display_name": "Alice", "total_rounds": 2, "round_duration_seconds": 30},
    )
    room_code = create_res.json()["room"]["room_code"]
    alice_id = create_res.json()["player"]["id"]

    join_res = client.post(
        f"/api/rooms/{room_code}/join",
        json={"display_name": "Bob"},
    )
    bob_id = join_res.json()["player"]["id"]

    # Speed up intermission to 0s for deterministic synchronous WebSocket testing
    runtime = game_engine.rooms[room_code]
    runtime.intermission_seconds = 0.0

    with client.websocket_connect(f"/ws/{room_code}/{alice_id}") as ws_alice, client.websocket_connect(
        f"/ws/{room_code}/{bob_id}"
    ) as ws_bob:
        # Initial sync_state
        alice_init = drain_until_event(ws_alice, "sync_state")
        assert alice_init[-1]["data"]["room"]["room_code"] == room_code

        bob_init = drain_until_event(ws_bob, "sync_state")
        assert bob_init[-1]["data"]["you"]["id"] == bob_id

        # Ready status toggle
        ws_alice.send_json({"event": "player_ready", "data": {"is_ready": True}})
        ready_msgs = drain_until_event(ws_bob, "ready_status_changed")
        assert ready_msgs[-1]["data"]["player_id"] == alice_id
        assert ready_msgs[-1]["data"]["is_ready"] is True

        # Start the game
        ws_alice.send_json({"event": "start_game", "data": {}})

        # Alice is drawer in Round 1; she should receive round_started AND secret_word
        alice_r1_msgs = drain_until_event(ws_alice, "secret_word")
        secret_msg = alice_r1_msgs[-1]
        assert secret_msg["data"]["word"] == "elephant"

        # Bob is guesser in Round 1; he receives round_started with masked hint, NEVER secret_word
        bob_r1_msgs = drain_until_event(ws_bob, "round_started")
        bob_events = [m["event"] for m in bob_r1_msgs]
        assert "secret_word" not in bob_events
        round_started_data = bob_r1_msgs[-1]["data"]
        assert "word" not in round_started_data
        assert round_started_data["word_hint"] == "_ _ _ _ _ _ _ _"
        assert round_started_data["drawer_player_id"] == alice_id

        # Non-drawer (Bob) attempting to draw must be rejected
        ws_bob.send_json(
            {
                "event": "draw_stroke",
                "data": {
                    "tool": "brush",
                    "color": "#ff0000",
                    "brush_size": 5,
                    "points": [{"x": 10, "y": 15}, {"x": 20, "y": 25}],
                },
            }
        )
        bob_err = drain_until_event(ws_bob, "error")
        assert bob_err[-1]["data"]["code"] == "NOT_DRAWER"

        # Drawer (Alice) sends a valid stroke -> broadcast to Bob
        ws_alice.send_json(
            {
                "event": "draw_stroke",
                "data": {
                    "stroke_id": "s1",
                    "tool": "brush",
                    "color": "#1976d2",
                    "brush_size": 6,
                    "points": [{"x": 50, "y": 60}, {"x": 80, "y": 90}],
                },
            }
        )
        bob_stroke = drain_until_event(ws_bob, "draw_stroke")
        assert bob_stroke[-1]["data"]["color"] == "#1976d2"
        assert len(bob_stroke[-1]["data"]["points"]) == 2

        # Drawer (Alice) attempting to guess must be rejected
        ws_alice.send_json({"event": "submit_guess", "data": {"guess_text": "elephant"}})
        alice_err = drain_until_event(ws_alice, "error")
        assert alice_err[-1]["data"]["code"] == "DRAWER_CANNOT_GUESS"

        # Bob submits an incorrect guess first
        ws_bob.send_json({"event": "submit_guess", "data": {"guess_text": "elephan"}})
        wrong_guess_msgs = drain_until_event(ws_alice, "guess_submitted")
        assert wrong_guess_msgs[-1]["data"]["is_correct"] is False
        assert wrong_guess_msgs[-1]["data"]["is_close"] is True

        # Bob submits the correct guess -> triggers correct_guess, score_update, round_ended, and Round 2 start!
        ws_bob.send_json({"event": "submit_guess", "data": {"guess_text": "Elephant"}})

        # In Round 2, Bob becomes the drawer and receives secret_word
        bob_r2_msgs = drain_until_event(ws_bob, "secret_word", max_messages=20)
        bob_event_names = [m["event"] for m in bob_r2_msgs]
        assert "correct_guess" in bob_event_names
        assert "score_update" in bob_event_names
        assert "round_ended" in bob_event_names
        assert "round_started" in bob_event_names

        r2_word = bob_r2_msgs[-1]["data"]["word"]
        assert isinstance(r2_word, str) and len(r2_word) > 0

        # Drain Alice up to Round 2 round_started
        drain_until_event(ws_alice, "round_started", max_messages=20)

        # Now Alice is the guesser in Round 2; she guesses the Round 2 secret word to finish the game
        ws_alice.send_json({"event": "submit_guess", "data": {"guess_text": r2_word}})

        game_end_msgs = drain_until_event(ws_alice, "game_ended", max_messages=20)
        end_payload = game_end_msgs[-1]["data"]
        assert end_payload["room_code"] == room_code
        assert end_payload["winner"] is not None
        assert len(end_payload["leaderboard"]) == 2

    # Verify completed game is persisted in database
    db_room = db_session.query(GameRoom).filter(GameRoom.room_code == room_code).first()
    db_session.refresh(db_room)
    assert db_room.status == "finished"
    assert db_room.started_at is not None
    assert db_room.ended_at is not None
    assert len(db_room.rounds) == 2
    assert all(p.score > 0 for p in db_room.players)


def test_drawer_disconnect_and_player_reconnect_handling(client):
    create_res = client.post(
        "/api/rooms",
        json={"display_name": "HostDrawer", "total_rounds": 2, "round_duration_seconds": 30},
    )
    room_code = create_res.json()["room"]["room_code"]
    p1_id = create_res.json()["player"]["id"]

    p2_id = client.post(f"/api/rooms/{room_code}/join", json={"display_name": "PlayerTwo"}).json()[
        "player"
    ]["id"]
    p3_id = client.post(f"/api/rooms/{room_code}/join", json={"display_name": "PlayerThree"}).json()[
        "player"
    ]["id"]

    runtime = game_engine.rooms[room_code]
    runtime.intermission_seconds = 0.0

    with client.websocket_connect(f"/ws/{room_code}/{p2_id}") as ws2, client.websocket_connect(
        f"/ws/{room_code}/{p3_id}"
    ) as ws3:
        drain_until_event(ws2, "sync_state")
        drain_until_event(ws3, "sync_state")

        # Connect p1 (HostDrawer) in an inner context so we can simulate unexpected drawer disconnect
        with client.websocket_connect(f"/ws/{room_code}/{p1_id}") as ws1:
            drain_until_event(ws1, "sync_state")
            ws1.send_json({"event": "start_game", "data": {}})
            drain_until_event(ws1, "secret_word")
            drain_until_event(ws2, "round_started")
            drain_until_event(ws3, "round_started")

        # Exiting `with ws1:` disconnects the active drawer!
        # The game must NOT stay stuck: Round 1 must end with reason 'drawer_disconnected' and Round 2 must start
        ws2_msgs = drain_until_event(ws2, "round_started", max_messages=20)
        reasons = [m["data"].get("reason") for m in ws2_msgs if m["event"] == "round_ended"]
        assert "drawer_disconnected" in reasons
        assert ws2_msgs[-1]["data"]["round_number"] == 2

        # Draw a stroke in Round 2 (where p2 is drawer) and test p1 reconnecting mid-round
        ws2.send_json(
            {
                "event": "draw_stroke",
                "data": {
                    "stroke_id": "reconnect-stroke",
                    "tool": "brush",
                    "color": "#00ff00",
                    "brush_size": 8,
                    "points": [{"x": 12, "y": 34}, {"x": 56, "y": 78}],
                },
            }
        )
        drain_until_event(ws3, "draw_stroke")

        # Now p1 reconnects and must receive sync_state including the active round's strokes!
        with client.websocket_connect(f"/ws/{room_code}/{p1_id}") as ws1_reconnected:
            reconn_msgs = drain_until_event(ws1_reconnected, "sync_state")
            sync_data = reconn_msgs[-1]["data"]
            assert sync_data["room"]["current_round"] == 2
            assert len(sync_data["strokes"]) == 1
            assert sync_data["strokes"][0]["stroke_id"] == "reconnect-stroke"


def test_advanced_drawing_tools_undo_hints_and_reactions(client):
    create_res = client.post(
        "/api/rooms",
        json={"display_name": "Artist", "total_rounds": 2, "round_duration_seconds": 30},
    )
    room_code = create_res.json()["room"]["room_code"]
    artist_id = create_res.json()["player"]["id"]
    guesser_id = client.post(f"/api/rooms/{room_code}/join", json={"display_name": "Guesser"}).json()[
        "player"
    ]["id"]

    with client.websocket_connect(f"/ws/{room_code}/{artist_id}") as ws_artist, client.websocket_connect(
        f"/ws/{room_code}/{guesser_id}"
    ) as ws_guesser:
        drain_until_event(ws_artist, "sync_state")
        drain_until_event(ws_guesser, "sync_state")

        ws_artist.send_json({"event": "start_game", "data": {}})
        drain_until_event(ws_artist, "secret_word")
        drain_until_event(ws_guesser, "round_started")

        # 1. Shape tool (filled rectangle)
        ws_artist.send_json(
            {
                "event": "draw_stroke",
                "data": {
                    "stroke_id": "shape-1",
                    "tool": "rect",
                    "color": "#ef4444",
                    "brush_size": 4,
                    "filled": True,
                    "opacity": 1.0,
                    "points": [{"x": 100, "y": 100}, {"x": 250, "y": 220}],
                },
            }
        )
        stroke_msg = drain_until_event(ws_guesser, "draw_stroke")[-1]
        assert stroke_msg["data"]["tool"] == "rect"
        assert stroke_msg["data"]["filled"] is True

        # 2. Flood fill tool
        ws_artist.send_json(
            {
                "event": "draw_stroke",
                "data": {
                    "stroke_id": "fill-1",
                    "tool": "fill",
                    "color": "#38bdf8",
                    "brush_size": 1,
                    "points": [{"x": 150, "y": 150}],
                },
            }
        )
        fill_msg = drain_until_event(ws_guesser, "draw_stroke")[-1]
        assert fill_msg["data"]["tool"] == "fill"

        # 3. Undo last stroke (removes fill-1, leaves shape-1)
        ws_artist.send_json({"event": "undo_stroke", "data": {"stroke_id": "fill-1"}})
        undo_msg = drain_until_event(ws_guesser, "stroke_undone")[-1]
        assert len(undo_msg["data"]["strokes"]) == 1
        assert undo_msg["data"]["strokes"][0]["stroke_id"] == "shape-1"

        # 4. Reveal letter hint
        ws_artist.send_json({"event": "reveal_hint", "data": {}})
        hint_msg = drain_until_event(ws_guesser, "hint_updated")[-1]
        assert hint_msg["data"]["word_length"] == 8
        assert any(ch.isalpha() for ch in hint_msg["data"]["word_hint"])

        # 5. Live emoji reaction
        ws_guesser.send_json({"event": "send_reaction", "data": {"emoji": "🔥"}})
        react_msg = drain_until_event(ws_artist, "player_reaction")[-1]
        assert react_msg["data"]["emoji"] == "🔥"
        assert react_msg["data"]["player_name"] == "Guesser"

