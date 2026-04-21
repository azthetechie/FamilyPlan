"""Iteration 4 backend tests: event exceptions + owner permissions."""
import os
import pytest
import requests
from pymongo import MongoClient

BASE_URL = os.environ['REACT_APP_BACKEND_URL'].rstrip('/')
API = f"{BASE_URL}/api"

PRIMARY_TOKEN = "test_session_1776655943013"
PRIMARY_USER = "test-user-1776655943013"
PRIMARY_FAMILY = "family-1776655943013"

MONGO_URL = os.environ.get('MONGO_URL', 'mongodb://localhost:27017')
DB_NAME = os.environ.get('DB_NAME', 'test_database')


@pytest.fixture(scope="session")
def mongo():
    c = MongoClient(MONGO_URL)
    yield c[DB_NAME]
    c.close()


@pytest.fixture(scope="session")
def primary():
    s = requests.Session()
    s.headers.update({"Content-Type": "application/json", "Authorization": f"Bearer {PRIMARY_TOKEN}"})
    return s


# =============== EVENT EXCEPTIONS ===============
class TestEventExceptions:
    event_id = None

    def test_create_event_has_empty_exceptions(self, primary):
        payload = {
            "title": "TEST_Recurring Exception Test",
            "date": "2026-02-10",
            "time": "08:00",
            "category": "sport",
            "recurring": "weekly",
            "recur_until": "2026-05-10",
        }
        r = primary.post(f"{API}/events", json=payload)
        assert r.status_code == 200, r.text
        evt = r.json()
        TestEventExceptions.event_id = evt["event_id"]
        assert "exceptions" in evt, f"Event missing exceptions field: {evt}"
        assert evt["exceptions"] == [], f"Expected empty list, got {evt['exceptions']}"

    def test_add_exception(self, primary):
        assert TestEventExceptions.event_id
        r = primary.post(
            f"{API}/events/{TestEventExceptions.event_id}/exceptions",
            json={"date": "2026-02-17"},
        )
        assert r.status_code == 200, r.text
        evt = r.json()
        assert "2026-02-17" in evt.get("exceptions", []), f"exceptions missing date: {evt}"

    def test_add_exception_idempotent(self, primary):
        """addToSet should not duplicate."""
        r = primary.post(
            f"{API}/events/{TestEventExceptions.event_id}/exceptions",
            json={"date": "2026-02-17"},
        )
        assert r.status_code == 200
        evt = r.json()
        assert evt["exceptions"].count("2026-02-17") == 1

    def test_add_multiple_exceptions(self, primary):
        r = primary.post(
            f"{API}/events/{TestEventExceptions.event_id}/exceptions",
            json={"date": "2026-02-24"},
        )
        assert r.status_code == 200
        assert "2026-02-24" in r.json()["exceptions"]
        assert "2026-02-17" in r.json()["exceptions"]

    def test_get_events_includes_exceptions(self, primary):
        events = primary.get(f"{API}/events").json()
        evt = next((e for e in events if e["event_id"] == TestEventExceptions.event_id), None)
        assert evt is not None
        assert sorted(evt["exceptions"]) == ["2026-02-17", "2026-02-24"]

    def test_remove_exception(self, primary):
        r = primary.delete(
            f"{API}/events/{TestEventExceptions.event_id}/exceptions/2026-02-17"
        )
        assert r.status_code == 200, r.text
        evt = r.json()
        assert "2026-02-17" not in evt["exceptions"]
        assert "2026-02-24" in evt["exceptions"]

    def test_add_exception_nonexistent_event(self, primary):
        r = primary.post(f"{API}/events/evt_nope/exceptions", json={"date": "2026-02-17"})
        assert r.status_code == 404

    def test_remove_exception_unauth(self):
        r = requests.delete(f"{API}/events/{TestEventExceptions.event_id}/exceptions/2026-02-24")
        assert r.status_code == 401

    def test_zz_cleanup_event(self, primary):
        if TestEventExceptions.event_id:
            primary.delete(f"{API}/events/{TestEventExceptions.event_id}")


# =============== OWNER PERMISSIONS ===============
class TestOwnerPermissions:
    """Test that PUT /api/family/info is owner-only."""

    @pytest.fixture(autouse=True)
    def restore_owner(self, mongo):
        # Set is_owner=True before test
        mongo.users.update_one({"user_id": PRIMARY_USER}, {"$set": {"is_owner": True}})
        yield
        # Restore to True after each test
        mongo.users.update_one({"user_id": PRIMARY_USER}, {"$set": {"is_owner": True}})

    def test_owner_can_rename_family(self, primary):
        r = primary.put(f"{API}/family/info", json={"name": "TEST_OwnerRenamed"})
        assert r.status_code == 200, r.text
        assert r.json()["name"] == "TEST_OwnerRenamed"

    def test_non_owner_cannot_rename(self, primary, mongo):
        # Demote to non-owner
        mongo.users.update_one({"user_id": PRIMARY_USER}, {"$set": {"is_owner": False}})
        r = primary.put(f"{API}/family/info", json={"name": "TEST_NonOwnerAttempt"})
        assert r.status_code == 403, r.text
        detail = r.json().get("detail", "")
        assert "owner" in detail.lower(), f"Expected 'owner' in detail: {detail}"

    def test_auth_me_returns_is_owner(self, primary):
        r = primary.get(f"{API}/auth/me")
        assert r.status_code == 200
        assert "is_owner" in r.json()
        assert r.json()["is_owner"] is True

    def test_family_members_includes_is_owner(self, primary):
        r = primary.get(f"{API}/family/members")
        assert r.status_code == 200
        parents = r.json().get("parents", [])
        assert len(parents) >= 1
        for p in parents:
            assert "is_owner" in p, f"Parent missing is_owner: {p}"

    def test_zz_restore_family_name(self, primary):
        primary.put(f"{API}/family/info", json={"name": "Our family"})
