"""
Iteration 5 regression tests: activity log, meal planner, ownership transfer, event exceptions.
"""
import os
import uuid
import pytest
import requests
from datetime import datetime, timezone, timedelta

BASE_URL = os.environ.get("REACT_APP_BACKEND_URL", "").rstrip("/")
PRIMARY_TOKEN = "test_session_1776655943013"
PRIMARY_USER_ID = "test-user-1776655943013"
FAMILY_ID = "family-1776655943013"


# ---------- Fixtures ----------
@pytest.fixture(scope="session")
def api():
    s = requests.Session()
    s.headers.update({"Content-Type": "application/json"})
    return s


@pytest.fixture(scope="session")
def owner_headers():
    return {"Authorization": f"Bearer {PRIMARY_TOKEN}", "Content-Type": "application/json"}


@pytest.fixture(scope="session")
def second_parent(api):
    """Seed a second parent in the same family (non-owner) using direct mongosh is not available from here;
    instead we call /api/family/members and re-use any existing non-owner parent; if none, we create via Mongo shell subprocess."""
    # First, see if one already exists
    r = api.get(f"{BASE_URL}/api/family/members",
                headers={"Authorization": f"Bearer {PRIMARY_TOKEN}"})
    assert r.status_code == 200, f"members list failed: {r.status_code} {r.text}"
    parents = r.json().get("parents", [])
    non_owner = next((p for p in parents if p.get("user_id") != PRIMARY_USER_ID and not p.get("is_owner", True)), None)
    if non_owner:
        # Find a session token for this user
        import pymongo
        mongo_url = os.environ["MONGO_URL"]
        db_name = os.environ["DB_NAME"]
        mc = pymongo.MongoClient(mongo_url)
        db = mc[db_name]
        sess = db.user_sessions.find_one({"user_id": non_owner["user_id"]})
        if sess:
            return {"user_id": non_owner["user_id"], "token": sess["session_token"], "created_here": False}
    # Seed new user + session via pymongo
    import pymongo
    mongo_url = os.environ["MONGO_URL"]
    db_name = os.environ["DB_NAME"]
    mc = pymongo.MongoClient(mongo_url)
    db = mc[db_name]
    uid = f"test-user-p2-{uuid.uuid4().hex[:8]}"
    token = f"test_session_p2_{uuid.uuid4().hex[:12]}"
    db.users.insert_one({
        "user_id": uid,
        "family_id": FAMILY_ID,
        "email": f"partner.{uid}@example.com",
        "name": "Test Partner",
        "picture": None,
        "role": "parent",
        "is_owner": False,
        "created_at": datetime.now(timezone.utc).isoformat(),
    })
    db.user_sessions.insert_one({
        "user_id": uid,
        "session_token": token,
        "expires_at": datetime.now(timezone.utc) + timedelta(days=1),
        "created_at": datetime.now(timezone.utc),
    })
    return {"user_id": uid, "token": token, "created_here": True}


# ---------- Sanity ----------
def test_version(api):
    r = api.get(f"{BASE_URL}/api/")
    assert r.status_code == 200
    data = r.json()
    assert data.get("version") == "1.2"


def test_auth_me(api, owner_headers):
    r = api.get(f"{BASE_URL}/api/auth/me", headers=owner_headers)
    assert r.status_code == 200
    assert r.json().get("user_id") == PRIMARY_USER_ID


# ---------- Activity log on shopping / note / event ----------
def test_activity_logged_on_event_shopping_note(api, owner_headers):
    before = datetime.now(timezone.utc).isoformat()

    # event
    ev = api.post(f"{BASE_URL}/api/events", headers=owner_headers, json={
        "title": "TEST_it5 event", "date": "2030-01-01"
    })
    assert ev.status_code == 200
    eid = ev.json()["event_id"]

    # shopping
    sh = api.post(f"{BASE_URL}/api/shopping", headers=owner_headers, json={
        "name": "TEST_it5_milk", "quantity": "1"
    })
    assert sh.status_code == 200
    sid = sh.json()["item_id"]

    # note
    nt = api.post(f"{BASE_URL}/api/notes", headers=owner_headers, json={
        "title": "TEST_it5 note", "content": "hello"
    })
    assert nt.status_code == 200
    nid = nt.json()["note_id"]

    # activity since `before` should have >=3 new entries
    r = api.get(f"{BASE_URL}/api/activity", headers=owner_headers, params={"since": before})
    assert r.status_code == 200
    entries = r.json()
    actions = [e["action"] for e in entries]
    assert "event.create" in actions
    assert "shopping.add" in actions
    assert "note.create" in actions

    # desc sort check
    ts = [e["created_at"] for e in entries]
    assert ts == sorted(ts, reverse=True)

    # cleanup
    api.delete(f"{BASE_URL}/api/events/{eid}", headers=owner_headers)
    api.delete(f"{BASE_URL}/api/shopping/{sid}", headers=owner_headers)
    api.delete(f"{BASE_URL}/api/notes/{nid}", headers=owner_headers)


def test_activity_since_filter(api, owner_headers):
    # create an item, take ts, create another
    r1 = api.post(f"{BASE_URL}/api/notes", headers=owner_headers, json={"content": "TEST_a1"})
    assert r1.status_code == 200
    nid1 = r1.json()["note_id"]
    midpoint = datetime.now(timezone.utc).isoformat()
    # sleep briefly
    import time; time.sleep(0.05)
    r2 = api.post(f"{BASE_URL}/api/notes", headers=owner_headers, json={"content": "TEST_a2"})
    nid2 = r2.json()["note_id"]

    r = api.get(f"{BASE_URL}/api/activity", headers=owner_headers, params={"since": midpoint})
    assert r.status_code == 200
    entries = r.json()
    # we should get the second note, not the first
    targets = [e.get("target_id") for e in entries]
    assert nid2 in targets
    assert nid1 not in targets

    api.delete(f"{BASE_URL}/api/notes/{nid1}", headers=owner_headers)
    api.delete(f"{BASE_URL}/api/notes/{nid2}", headers=owner_headers)


# ---------- Meal Planner CRUD ----------
def test_meal_crud(api, owner_headers):
    # create
    payload = {
        "date": "2030-02-10",
        "meal_type": "dinner",
        "name": "TEST_pasta",
        "ingredients": ["pasta", "tomato", "basil"],
        "notes": "Italian night",
    }
    r = api.post(f"{BASE_URL}/api/meals", headers=owner_headers, json=payload)
    assert r.status_code == 200
    meal = r.json()
    mid = meal["meal_id"]
    assert meal["name"] == "TEST_pasta"
    assert meal["meal_type"] == "dinner"
    assert meal["ingredients"] == ["pasta", "tomato", "basil"]
    assert meal["date"] == "2030-02-10"

    # list
    r = api.get(f"{BASE_URL}/api/meals", headers=owner_headers,
                params={"start_date": "2030-02-01", "end_date": "2030-02-28"})
    assert r.status_code == 200
    ids = [m["meal_id"] for m in r.json()]
    assert mid in ids

    # out of range
    r = api.get(f"{BASE_URL}/api/meals", headers=owner_headers,
                params={"start_date": "2031-01-01", "end_date": "2031-01-31"})
    assert r.status_code == 200
    assert mid not in [m["meal_id"] for m in r.json()]

    # update
    r = api.put(f"{BASE_URL}/api/meals/{mid}", headers=owner_headers, json={
        "date": "2030-02-11", "meal_type": "lunch", "name": "TEST_pasta2",
        "ingredients": ["spaghetti"], "notes": ""
    })
    assert r.status_code == 200
    assert r.json()["name"] == "TEST_pasta2"
    assert r.json()["meal_type"] == "lunch"

    # delete
    r = api.delete(f"{BASE_URL}/api/meals/{mid}", headers=owner_headers)
    assert r.status_code == 200

    # 404 on delete again
    r = api.delete(f"{BASE_URL}/api/meals/{mid}", headers=owner_headers)
    assert r.status_code == 404


def test_meals_to_shopping_aggregates_unique_ingredients(api, owner_headers):
    # seed 2 meals overlapping ingredients
    mids = []
    for name, ings in [("TEST_Meal A", ["Onion", "garlic", "Chicken"]),
                       ("TEST_Meal B", ["onion", "rice", ""])]:  # "" should be skipped
        r = api.post(f"{BASE_URL}/api/meals", headers=owner_headers, json={
            "date": "2030-03-05", "meal_type": "dinner", "name": name,
            "ingredients": ings,
        })
        assert r.status_code == 200
        mids.append(r.json()["meal_id"])

    # send to shopping
    r = api.post(f"{BASE_URL}/api/meals/to-shopping", headers=owner_headers, json={
        "start_date": "2030-03-01", "end_date": "2030-03-31", "supermarket": "Coles"
    })
    assert r.status_code == 200
    data = r.json()
    # unique set: onion (dedup), garlic, chicken, rice = 4
    assert data["added"] == 4

    # verify items in shopping list
    r = api.get(f"{BASE_URL}/api/shopping", headers=owner_headers)
    items = r.json()
    names_lower = {i["name"].lower() for i in items if i.get("category") == "meal-plan"}
    for needed in ["onion", "garlic", "chicken", "rice"]:
        assert needed in names_lower

    # verify frequent_items increment
    r = api.get(f"{BASE_URL}/api/shopping/frequent", headers=owner_headers)
    freq_names = {i["name"].lower() for i in r.json()}
    assert "onion" in freq_names

    # cleanup: delete meal-plan items and meals
    for i in items:
        if i.get("category") == "meal-plan" and i.get("name", "").lower() in {"onion", "garlic", "chicken", "rice"}:
            api.delete(f"{BASE_URL}/api/shopping/{i['item_id']}", headers=owner_headers)
    for mid in mids:
        api.delete(f"{BASE_URL}/api/meals/{mid}", headers=owner_headers)


# ---------- Event exceptions ----------
def test_event_exception_skip_next(api, owner_headers):
    r = api.post(f"{BASE_URL}/api/events", headers=owner_headers, json={
        "title": "TEST_recur", "date": "2030-04-01", "recurring": "daily"
    })
    eid = r.json()["event_id"]
    r = api.post(f"{BASE_URL}/api/events/{eid}/exceptions",
                 headers=owner_headers, json={"date": "2030-04-02"})
    assert r.status_code == 200
    assert "2030-04-02" in r.json().get("exceptions", [])
    # idempotent
    r2 = api.post(f"{BASE_URL}/api/events/{eid}/exceptions",
                  headers=owner_headers, json={"date": "2030-04-02"})
    assert r2.json()["exceptions"].count("2030-04-02") == 1
    api.delete(f"{BASE_URL}/api/events/{eid}", headers=owner_headers)


# ---------- Transfer ownership ----------
def test_transfer_ownership_forbidden_for_non_owner(api, second_parent):
    headers = {"Authorization": f"Bearer {second_parent['token']}", "Content-Type": "application/json"}
    r = api.post(f"{BASE_URL}/api/family/transfer-ownership", headers=headers,
                 json={"to_user_id": PRIMARY_USER_ID})
    assert r.status_code == 403


def test_transfer_ownership_to_self_400(api, owner_headers):
    r = api.post(f"{BASE_URL}/api/family/transfer-ownership", headers=owner_headers,
                 json={"to_user_id": PRIMARY_USER_ID})
    assert r.status_code == 400


def test_transfer_ownership_target_not_in_family_404(api, owner_headers):
    r = api.post(f"{BASE_URL}/api/family/transfer-ownership", headers=owner_headers,
                 json={"to_user_id": "user_nope_xxxx"})
    assert r.status_code == 404


def test_transfer_ownership_happy_path(api, owner_headers, second_parent):
    sp = second_parent
    sp_headers = {"Authorization": f"Bearer {sp['token']}", "Content-Type": "application/json"}

    # Ensure primary is owner currently (reset state if previous test flipped)
    import pymongo
    mc = pymongo.MongoClient(os.environ["MONGO_URL"])
    db = mc[os.environ["DB_NAME"]]
    db.users.update_one({"user_id": PRIMARY_USER_ID}, {"$set": {"is_owner": True}})
    db.users.update_one({"user_id": sp["user_id"]}, {"$set": {"is_owner": False}})

    # Transfer from primary -> second parent
    r = api.post(f"{BASE_URL}/api/family/transfer-ownership", headers=owner_headers,
                 json={"to_user_id": sp["user_id"]})
    assert r.status_code == 200
    assert r.json()["new_owner_id"] == sp["user_id"]

    # Verify via /family/members
    r = api.get(f"{BASE_URL}/api/family/members", headers=owner_headers)
    parents = r.json()["parents"]
    p_map = {p["user_id"]: p for p in parents}
    assert p_map[sp["user_id"]]["is_owner"] is True
    assert p_map[PRIMARY_USER_ID]["is_owner"] is False

    # Now primary cannot transfer back (403), only sp can
    r_fail = api.post(f"{BASE_URL}/api/family/transfer-ownership", headers=owner_headers,
                      json={"to_user_id": PRIMARY_USER_ID})
    assert r_fail.status_code == 403

    # sp transfers back
    r_back = api.post(f"{BASE_URL}/api/family/transfer-ownership", headers=sp_headers,
                      json={"to_user_id": PRIMARY_USER_ID})
    assert r_back.status_code == 200

    # verify final state
    r = api.get(f"{BASE_URL}/api/family/members", headers=owner_headers)
    p_map = {p["user_id"]: p for p in r.json()["parents"]}
    assert p_map[PRIMARY_USER_ID]["is_owner"] is True
    assert p_map[sp["user_id"]]["is_owner"] is False


# ---------- Cleanup hook ----------
def test_zz_cleanup_seeded(second_parent):
    """Remove seeded partner user & session if created here."""
    if not second_parent.get("created_here"):
        return
    import pymongo
    mc = pymongo.MongoClient(os.environ["MONGO_URL"])
    db = mc[os.environ["DB_NAME"]]
    db.users.delete_one({"user_id": second_parent["user_id"]})
    db.user_sessions.delete_one({"session_token": second_parent["token"]})
