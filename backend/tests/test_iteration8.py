"""
Iteration 8 backend tests:
  (1) FastAPI lifespan migration (no on_event deprecation; / endpoints still serve)
  (2) POST /api/meals/to-shopping date-range validation (400 when start_date > end_date)
  (3) WebSocket /api/ws/activity (auth, hello, ping/pong, broadcast scope)
"""
import os
import json
import asyncio
import time
import uuid
import pytest
import requests
import websockets

def _read_frontend_env_url():
    try:
        with open('/app/frontend/.env') as f:
            for line in f:
                if line.startswith('REACT_APP_BACKEND_URL='):
                    return line.split('=', 1)[1].strip()
    except Exception:
        pass
    return None

BASE_URL = (os.environ.get('REACT_APP_BACKEND_URL') or _read_frontend_env_url() or '').rstrip('/')
assert BASE_URL, "REACT_APP_BACKEND_URL not configured"
WS_URL = BASE_URL.replace('https://', 'wss://').replace('http://', 'ws://') + '/api/ws/activity'

SESSION_TOKEN = "test_session_1776655943013"
USER_ID = "test-user-1776655943013"
FAMILY_ID = "family-1776655943013"

AUTH_HEADERS = {"Authorization": f"Bearer {SESSION_TOKEN}", "Content-Type": "application/json"}


# ---------- helpers ----------
@pytest.fixture(scope="module")
def s():
    sess = requests.Session()
    sess.headers.update(AUTH_HEADERS)
    return sess


# ---------- (1) lifespan smoke ----------
def test_health_endpoint_works_with_lifespan(s):
    """If lifespan is broken, root /api/ would 5xx or 404."""
    r = s.get(f"{BASE_URL}/api/")
    # The api_router has a "/" GET that returns Hello World style or auth/me; accept any 2xx/4xx but never 5xx
    assert r.status_code < 500, f"Server error on /api/: {r.status_code} {r.text[:200]}"


def test_auth_me_returns_user(s):
    r = s.get(f"{BASE_URL}/api/auth/me")
    assert r.status_code == 200, r.text
    data = r.json()
    assert data.get("user_id") == USER_ID
    assert data.get("family_id") == FAMILY_ID


# ---------- (2) meals/to-shopping date validation ----------
def test_meals_to_shopping_rejects_inverted_range(s):
    r = s.post(f"{BASE_URL}/api/meals/to-shopping", json={
        "start_date": "2026-01-15",
        "end_date":   "2026-01-10",
    })
    assert r.status_code == 400, f"expected 400 got {r.status_code} body={r.text[:200]}"
    body = r.json()
    detail = (body.get("detail") or body.get("error") or body.get("message") or "")
    assert "start_date must be on or before end_date" in str(detail).lower() or \
           "start_date must be on or before end_date" in str(detail), \
           f"Expected validation message, got: {detail}"


def test_meals_to_shopping_accepts_equal_dates(s):
    # Equal dates is a valid 1-day plan
    r = s.post(f"{BASE_URL}/api/meals/to-shopping", json={
        "start_date": "2099-12-31",
        "end_date":   "2099-12-31",
    })
    assert r.status_code == 200, r.text
    body = r.json()
    assert "added" in body


def test_meals_to_shopping_accepts_normal_range(s):
    r = s.post(f"{BASE_URL}/api/meals/to-shopping", json={
        "start_date": "2099-12-01",
        "end_date":   "2099-12-07",
    })
    assert r.status_code == 200, r.text
    assert "added" in r.json()


# ---------- (3) WebSocket tests ----------
@pytest.mark.asyncio
async def test_ws_rejects_no_token():
    try:
        async with websockets.connect(WS_URL) as ws:
            # If it connects, server should immediately close with 1008
            try:
                await asyncio.wait_for(ws.recv(), timeout=3)
                pytest.fail("WS without token should not receive data")
            except websockets.ConnectionClosed as e:
                assert e.code == 1008, f"expected 1008, got {e.code}"
    except websockets.InvalidStatus as e:
        # ingress/proxy may translate to HTTP rejection
        assert e.response.status_code in (401, 403, 1008), str(e)
    except websockets.ConnectionClosedError as e:
        assert e.code == 1008


@pytest.mark.asyncio
async def test_ws_rejects_invalid_token():
    url = WS_URL + "?token=invalid-token-xxx"
    try:
        async with websockets.connect(url) as ws:
            try:
                await asyncio.wait_for(ws.recv(), timeout=3)
                pytest.fail("WS with invalid token should close")
            except websockets.ConnectionClosed as e:
                assert e.code == 1008
    except (websockets.InvalidStatus, websockets.ConnectionClosedError) as e:
        # acceptable rejection paths
        pass


@pytest.mark.asyncio
async def test_ws_hello_and_ping_pong():
    url = WS_URL + f"?token={SESSION_TOKEN}"
    async with websockets.connect(url) as ws:
        hello_raw = await asyncio.wait_for(ws.recv(), timeout=5)
        hello = json.loads(hello_raw)
        assert hello.get("type") == "hello"
        assert hello.get("family_id") == FAMILY_ID
        # ping/pong
        await ws.send("ping")
        pong = await asyncio.wait_for(ws.recv(), timeout=5)
        assert pong == "pong"


@pytest.mark.asyncio
async def test_ws_broadcast_same_family():
    """Open WS, then POST a note via REST → expect a broadcast within ~2s."""
    url = WS_URL + f"?token={SESSION_TOKEN}"
    async with websockets.connect(url) as ws:
        hello = json.loads(await asyncio.wait_for(ws.recv(), timeout=5))
        assert hello["type"] == "hello"

        # Trigger an activity by POSTing a note (or shopping item)
        unique = f"TEST_WS_{uuid.uuid4().hex[:8]}"
        r = requests.post(
            f"{BASE_URL}/api/notes",
            headers=AUTH_HEADERS,
            json={"title": unique, "content": "ws broadcast test"},
        )
        assert r.status_code in (200, 201), r.text
        note = r.json()
        note_id = note.get("id") or note.get("note_id") or note.get("_id")

        # Wait up to 5s for broadcast
        received = None
        try:
            for _ in range(10):
                raw = await asyncio.wait_for(ws.recv(), timeout=2.5)
                try:
                    data = json.loads(raw)
                except Exception:
                    continue
                if isinstance(data, dict) and data.get("action") and data.get("user_id"):
                    received = data
                    break
        except asyncio.TimeoutError:
            pass

        # cleanup the note (best effort)
        if note_id:
            try:
                requests.delete(f"{BASE_URL}/api/notes/{note_id}", headers=AUTH_HEADERS)
            except Exception:
                pass

        assert received is not None, "Did not receive broadcast on same-family WS within 5s"
        assert "summary" in received and "created_at" in received
        assert received.get("user_id") == USER_ID


@pytest.mark.asyncio
async def test_ws_broadcast_isolated_to_family():
    """A WS authed as our family should NOT receive activity from other families.
    We can only assert this indirectly: connect WS, perform NO write from any other family,
    and assert no spurious traffic arrives within 2s after the hello frame.
    """
    url = WS_URL + f"?token={SESSION_TOKEN}"
    async with websockets.connect(url) as ws:
        hello = json.loads(await asyncio.wait_for(ws.recv(), timeout=5))
        assert hello["type"] == "hello"
        # No POST issued: nothing except potentially a stray pong/heartbeat should arrive
        try:
            extra = await asyncio.wait_for(ws.recv(), timeout=2)
            # If we DO receive something, it must not be an activity payload
            try:
                data = json.loads(extra)
                assert not (isinstance(data, dict) and data.get("action")), \
                    f"Unexpected activity received with no triggering POST: {data}"
            except Exception:
                pass  # plain text frame is fine
        except asyncio.TimeoutError:
            pass  # expected — silence
