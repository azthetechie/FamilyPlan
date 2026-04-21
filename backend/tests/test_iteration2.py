"""Iteration 2 backend tests: invites, family info/join, shopping templates, event recurring fields."""
import os
import pytest
import requests
from datetime import datetime, timezone, timedelta

BASE_URL = os.environ['REACT_APP_BACKEND_URL'].rstrip('/')
API = f"{BASE_URL}/api"

# Pre-seeded primary user (has/will have data)
PRIMARY_TOKEN = "test_session_1776655943013"
PRIMARY_USER = "test-user-1776655943013"
PRIMARY_FAMILY = "family-1776655943013"

# Pre-seeded solo user (no data)
SOLO_TOKEN = "test_session_solo_1776808359819"
SOLO_USER = "test-user-solo-1776808359819"
SOLO_FAMILY = "family-solo-1776808359819"


@pytest.fixture(scope="session")
def primary():
    s = requests.Session()
    s.headers.update({"Content-Type": "application/json", "Authorization": f"Bearer {PRIMARY_TOKEN}"})
    return s


@pytest.fixture(scope="session")
def solo():
    s = requests.Session()
    s.headers.update({"Content-Type": "application/json", "Authorization": f"Bearer {SOLO_TOKEN}"})
    return s


@pytest.fixture(scope="session")
def anon():
    s = requests.Session()
    s.headers.update({"Content-Type": "application/json"})
    return s


# =============== FAMILY INFO ===============
class TestFamilyInfo:
    def test_family_info_auto_creates_meta(self, primary):
        r = primary.get(f"{API}/family/info")
        assert r.status_code == 200
        data = r.json()
        assert data["family_id"] == PRIMARY_FAMILY
        assert data["short_code"].startswith("NEST-")
        assert len(data["short_code"]) == 9
        assert isinstance(data["name"], str) and data["name"]
        assert data["parents_count"] >= 1
        assert "children_count" in data

    def test_family_info_unauth(self, anon):
        r = anon.get(f"{API}/family/info")
        assert r.status_code == 401

    def test_family_info_update_name(self, primary):
        r = primary.put(f"{API}/family/info", json={"name": "TEST_Familia"})
        assert r.status_code == 200
        assert r.json()["name"] == "TEST_Familia"
        # GET to verify persistence
        r2 = primary.get(f"{API}/family/info")
        assert r2.json()["name"] == "TEST_Familia"

    def test_family_info_reject_empty_name(self, primary):
        r = primary.put(f"{API}/family/info", json={"name": "   "})
        assert r.status_code == 400

    def test_family_info_reject_long_name(self, primary):
        r = primary.put(f"{API}/family/info", json={"name": "x" * 61})
        assert r.status_code == 400


# =============== PREVIEW CODE (public) ===============
class TestPreviewCode:
    short_code = None

    def test_get_short_code(self, primary):
        r = primary.get(f"{API}/family/info")
        TestPreviewCode.short_code = r.json()["short_code"]

    def test_preview_public_no_auth(self, anon):
        assert TestPreviewCode.short_code
        r = anon.get(f"{API}/family/preview-code/{TestPreviewCode.short_code}")
        assert r.status_code == 200
        data = r.json()
        assert data["short_code"] == TestPreviewCode.short_code
        assert data["parents_count"] >= 1
        assert "name" in data

    def test_preview_lowercase_normalised(self, anon):
        r = anon.get(f"{API}/family/preview-code/{TestPreviewCode.short_code.lower()}")
        assert r.status_code == 200

    def test_preview_not_found(self, anon):
        r = anon.get(f"{API}/family/preview-code/NEST-ZZZZ9")
        assert r.status_code == 404


# =============== INVITES ===============
class TestInvites:
    invite_token = None

    def test_create_invite(self, primary):
        r = primary.post(f"{API}/family/invites", json={"email": "partner@example.com"})
        assert r.status_code == 200
        data = r.json()
        assert "invite_token" in data and len(data["invite_token"]) >= 16
        assert data["email"] == "partner@example.com"
        # expires_at is about 7 days ahead
        exp = datetime.fromisoformat(data["expires_at"])
        delta = exp - datetime.now(timezone.utc)
        assert timedelta(days=6) < delta < timedelta(days=8)
        TestInvites.invite_token = data["invite_token"]

    def test_list_invites(self, primary):
        r = primary.get(f"{API}/family/invites")
        assert r.status_code == 200
        tokens = [i["invite_token"] for i in r.json()]
        assert TestInvites.invite_token in tokens

    def test_preview_invite_public(self, anon):
        r = anon.get(f"{API}/family/invites/preview/{TestInvites.invite_token}")
        assert r.status_code == 200
        data = r.json()
        assert data["invite_token"] == TestInvites.invite_token
        assert "created_by_name" in data

    def test_preview_invalid_invite(self, anon):
        r = anon.get(f"{API}/family/invites/preview/notarealtokenxyz")
        assert r.status_code == 404

    def test_list_invites_unauth(self, anon):
        r = anon.get(f"{API}/family/invites")
        assert r.status_code == 401

    def test_revoke_invite(self, primary):
        r = primary.delete(f"{API}/family/invites/{TestInvites.invite_token}")
        assert r.status_code == 200
        # confirm gone
        r2 = primary.get(f"{API}/family/invites")
        tokens = [i["invite_token"] for i in r2.json()]
        assert TestInvites.invite_token not in tokens

    def test_revoke_nonexistent(self, primary):
        r = primary.delete(f"{API}/family/invites/nope_xyz_123")
        assert r.status_code == 404

    def test_auth_session_accepts_invite_token_param(self, anon):
        """POST /api/auth/session should accept invite_token body field (even if session_id invalid)."""
        r = anon.post(f"{API}/auth/session", json={"session_id": "bogus", "invite_token": "whatever"})
        # Must not be 400 (schema/validation error); must be 401 from OAuth failing
        assert r.status_code == 401


# =============== FAMILY JOIN ===============
class TestFamilyJoin:
    def test_join_requires_auth(self, anon):
        r = anon.post(f"{API}/family/join", json={"code": "NEST-XXXX"})
        assert r.status_code == 401

    def test_join_invalid_code(self, solo):
        r = solo.post(f"{API}/family/join", json={"code": "NEST-NOPE"})
        assert r.status_code == 404

    def test_primary_cannot_join_own_family(self, primary):
        info = primary.get(f"{API}/family/info").json()
        r = primary.post(f"{API}/family/join", json={"code": info["short_code"]})
        assert r.status_code == 400

    def test_primary_with_data_cannot_join_solo(self, primary, solo):
        """Primary user has invites/templates/possible data; also we'll create a child to guarantee it blocks."""
        # Ensure primary has data -> add a child
        primary.post(f"{API}/family/children", json={"name": "TEST_Blocker", "age": 5})
        solo_info = solo.get(f"{API}/family/info").json()
        r = primary.post(f"{API}/family/join", json={"code": solo_info["short_code"]})
        assert r.status_code == 400
        assert "data" in r.json().get("detail", "").lower() or "members" in r.json().get("detail", "").lower()

    def test_solo_can_join_primary(self, primary, solo):
        """Solo (no data) should join primary's family successfully."""
        primary_info = primary.get(f"{API}/family/info").json()
        code = primary_info["short_code"]
        r = solo.post(f"{API}/family/join", json={"code": code})
        assert r.status_code == 200, f"Join failed: {r.text}"
        data = r.json()
        assert data["family_id"] == PRIMARY_FAMILY
        assert data["short_code"] == code

        # Verify membership via /auth/me
        me = solo.get(f"{API}/auth/me").json()
        assert me["family_id"] == PRIMARY_FAMILY

        # Verify primary family now shows 2 parents
        info = primary.get(f"{API}/family/info").json()
        assert info["parents_count"] >= 2

    def test_already_in_target_family(self, solo):
        """After join, solo trying to join same family again returns 400."""
        primary_info_code = requests.get(
            f"{API}/family/preview-code/{requests.get(f'{API}/family/info', headers={'Authorization': f'Bearer {PRIMARY_TOKEN}'}).json()['short_code']}"
        ).json()["short_code"]
        r = solo.post(f"{API}/family/join", json={"code": primary_info_code})
        assert r.status_code == 400


# =============== EVENT RECURRING FIELDS ===============
class TestEventRecurring:
    event_id = None

    def test_create_event_with_recurring_fields(self, primary):
        """Event API should accept recurring, recur_until, reminder_minutes."""
        payload = {
            "title": "TEST_Recurring Yoga",
            "date": "2026-02-10",
            "time": "08:00",
            "category": "sport",
            "recurring": "weekly",
            "recur_until": "2026-05-10",
            "reminder_minutes": 60,
        }
        r = primary.post(f"{API}/events", json=payload)
        assert r.status_code == 200, f"Create event failed: {r.text}"
        evt = r.json()
        TestEventRecurring.event_id = evt["event_id"]
        # Check the fields persisted (may be missing if model doesn't accept them - that's the bug)
        # Verify via GET
        events = primary.get(f"{API}/events").json()
        stored = next((e for e in events if e["event_id"] == evt["event_id"]), None)
        assert stored, "Event not found in list"
        # Flag if the fields were dropped
        assert stored.get("recurring") == "weekly", f"recurring field dropped! stored={stored}"
        assert stored.get("recur_until") == "2026-05-10", f"recur_until dropped! stored={stored}"
        assert stored.get("reminder_minutes") == 60, f"reminder_minutes dropped! stored={stored}"

    def test_cleanup_recurring_event(self, primary):
        if TestEventRecurring.event_id:
            primary.delete(f"{API}/events/{TestEventRecurring.event_id}")


# =============== SHOPPING TEMPLATES ===============
class TestTemplates:
    template_id = None

    def test_create_template(self, primary):
        payload = {
            "name": "TEST_Weekly Shop",
            "items": [
                {"name": "TEST_Bread", "quantity": "1", "supermarket": "Coles", "category": "bakery"},
                {"name": "TEST_Eggs", "quantity": "12", "supermarket": "Coles", "category": "dairy"},
            ],
        }
        r = primary.post(f"{API}/shopping/templates", json=payload)
        assert r.status_code == 200
        tpl = r.json()
        assert tpl["name"] == "TEST_Weekly Shop"
        assert len(tpl["items"]) == 2
        assert tpl["family_id"] == PRIMARY_FAMILY
        TestTemplates.template_id = tpl["template_id"]

    def test_list_templates(self, primary):
        r = primary.get(f"{API}/shopping/templates")
        assert r.status_code == 200
        ids = [t["template_id"] for t in r.json()]
        assert TestTemplates.template_id in ids

    def test_update_template(self, primary):
        payload = {
            "name": "TEST_Weekly Shop Updated",
            "items": [{"name": "TEST_Bread", "quantity": "2", "supermarket": "Woolworths", "category": "bakery"}],
        }
        r = primary.put(f"{API}/shopping/templates/{TestTemplates.template_id}", json=payload)
        assert r.status_code == 200
        assert r.json()["name"] == "TEST_Weekly Shop Updated"
        assert len(r.json()["items"]) == 1

    def test_apply_template_adds_items(self, primary):
        # Count shopping items before
        before = len(primary.get(f"{API}/shopping").json())
        r = primary.post(f"{API}/shopping/templates/{TestTemplates.template_id}/apply")
        assert r.status_code == 200
        assert r.json()["added"] >= 1
        after = primary.get(f"{API}/shopping").json()
        assert len(after) == before + 1
        assert any(i["name"] == "TEST_Bread" for i in after)
        # Verify frequent increment
        freq = primary.get(f"{API}/shopping/frequent").json()
        bread = [f for f in freq if f.get("name_lower") == "test_bread"]
        assert bread and bread[0]["count"] >= 1

    def test_delete_template(self, primary):
        r = primary.delete(f"{API}/shopping/templates/{TestTemplates.template_id}")
        assert r.status_code == 200
        r2 = primary.get(f"{API}/shopping/templates")
        assert all(t["template_id"] != TestTemplates.template_id for t in r2.json())

    def test_delete_nonexistent_template(self, primary):
        r = primary.delete(f"{API}/shopping/templates/tpl_nonexistent_xyz")
        assert r.status_code == 404

    def test_templates_unauth(self, anon):
        r = anon.get(f"{API}/shopping/templates")
        assert r.status_code == 401


# =============== CLEANUP ===============
class TestZCleanup:
    def test_cleanup_shopping_items(self, primary):
        items = primary.get(f"{API}/shopping").json()
        for it in items:
            if it.get("name", "").startswith("TEST_"):
                primary.delete(f"{API}/shopping/{it['item_id']}")

    def test_cleanup_children(self, primary):
        members = primary.get(f"{API}/family/members").json()
        for c in members.get("children", []):
            if c.get("name", "").startswith("TEST_"):
                primary.delete(f"{API}/family/children/{c['child_id']}")

    def test_cleanup_family_name(self, primary):
        primary.put(f"{API}/family/info", json={"name": "Our family"})
