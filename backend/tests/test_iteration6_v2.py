"""Iteration 6 tests: meal templates CRUD + apply, /api/activity before cursor."""
import os
import time
import pytest
import requests

BASE_URL = os.environ.get("REACT_APP_BACKEND_URL", "").rstrip("/")
SESSION_TOKEN = "test_session_1776655943013"
HEADERS = {"Authorization": f"Bearer {SESSION_TOKEN}", "Content-Type": "application/json"}


@pytest.fixture(scope="module")
def created_ids():
    return {"template_id": None, "meal_id": None}


# === Meal Templates CRUD ===
def test_list_templates_empty_ok():
    r = requests.get(f"{BASE_URL}/api/meals/templates", headers=HEADERS, timeout=10)
    assert r.status_code == 200
    assert isinstance(r.json(), list)


def test_create_template(created_ids):
    payload = {
        "name": "TEST_Taco_Tuesday",
        "meal_type_default": "dinner",
        "ingredients": ["tortillas", "mince", "beans", "lettuce"],
        "notes": "Family favourite",
    }
    r = requests.post(f"{BASE_URL}/api/meals/templates", json=payload, headers=HEADERS, timeout=10)
    assert r.status_code == 200, r.text
    data = r.json()
    assert data["name"] == payload["name"]
    assert data["meal_type_default"] == "dinner"
    assert data["ingredients"] == payload["ingredients"]
    assert "meal_template_id" in data
    created_ids["template_id"] = data["meal_template_id"]


def test_list_templates_includes_created(created_ids):
    r = requests.get(f"{BASE_URL}/api/meals/templates", headers=HEADERS, timeout=10)
    assert r.status_code == 200
    ids = [t["meal_template_id"] for t in r.json()]
    assert created_ids["template_id"] in ids


def test_update_template(created_ids):
    tid = created_ids["template_id"]
    assert tid
    payload = {
        "name": "TEST_Taco_Tuesday_v2",
        "meal_type_default": "lunch",
        "ingredients": ["tortillas", "mince"],
        "notes": "updated",
    }
    r = requests.put(f"{BASE_URL}/api/meals/templates/{tid}", json=payload, headers=HEADERS, timeout=10)
    assert r.status_code == 200
    assert r.json()["name"] == "TEST_Taco_Tuesday_v2"
    # verify persistence
    r2 = requests.get(f"{BASE_URL}/api/meals/templates", headers=HEADERS, timeout=10)
    found = [t for t in r2.json() if t["meal_template_id"] == tid]
    assert found and found[0]["meal_type_default"] == "lunch"


def test_apply_template_creates_meal(created_ids):
    tid = created_ids["template_id"]
    assert tid
    date = "2030-06-15"
    r = requests.post(
        f"{BASE_URL}/api/meals/templates/{tid}/apply",
        json={"date": date, "meal_type": "dinner"},
        headers=HEADERS,
        timeout=10,
    )
    assert r.status_code == 200, r.text
    meal = r.json()
    assert meal["date"] == date
    assert meal["meal_type"] == "dinner"
    assert meal["name"] == "TEST_Taco_Tuesday_v2"
    assert meal["ingredients"] == ["tortillas", "mince"]
    created_ids["meal_id"] = meal["meal_id"]
    # verify meal persisted
    r2 = requests.get(
        f"{BASE_URL}/api/meals",
        params={"start_date": date, "end_date": date},
        headers=HEADERS, timeout=10,
    )
    assert any(m["meal_id"] == meal["meal_id"] for m in r2.json())


def test_apply_logs_activity(created_ids):
    # fetch recent activity and ensure entry for template apply exists
    r = requests.get(f"{BASE_URL}/api/activity", params={"limit": 10}, headers=HEADERS, timeout=10)
    assert r.status_code == 200
    summaries = [a.get("summary", "") for a in r.json()]
    assert any("from template" in s for s in summaries), f"Expected 'from template' in activity, got: {summaries}"


def test_apply_template_not_found():
    r = requests.post(
        f"{BASE_URL}/api/meals/templates/mtpl_does_not_exist/apply",
        json={"date": "2030-06-15", "meal_type": "dinner"},
        headers=HEADERS, timeout=10,
    )
    assert r.status_code == 404


# === /api/activity before cursor + limit ===
def test_activity_limit_param():
    r = requests.get(f"{BASE_URL}/api/activity", params={"limit": 3}, headers=HEADERS, timeout=10)
    assert r.status_code == 200
    assert len(r.json()) <= 3


def test_activity_before_cursor_pagination():
    """Spec: GET /api/activity?before=<iso> should return items with created_at < before."""
    # get latest 2
    r = requests.get(f"{BASE_URL}/api/activity", params={"limit": 2}, headers=HEADERS, timeout=10)
    assert r.status_code == 200
    first_page = r.json()
    if len(first_page) < 2:
        pytest.skip("Not enough activity rows to test before cursor")
    cursor = first_page[-1]["created_at"]  # oldest of first page
    r2 = requests.get(
        f"{BASE_URL}/api/activity", params={"before": cursor, "limit": 5},
        headers=HEADERS, timeout=10,
    )
    assert r2.status_code == 200
    second_page = r2.json()
    # all items in second_page must have created_at < cursor
    for item in second_page:
        assert item["created_at"] < cursor, (
            f"before cursor not honoured: got created_at={item['created_at']} >= cursor={cursor}"
        )
    # Also ensure no overlap of activity_ids with first page
    first_ids = {a["activity_id"] for a in first_page}
    second_ids = {a["activity_id"] for a in second_page}
    assert first_ids.isdisjoint(second_ids), "before cursor returned overlapping items from first page"


def test_activity_limit_max_capped():
    r = requests.get(f"{BASE_URL}/api/activity", params={"limit": 500}, headers=HEADERS, timeout=10)
    assert r.status_code == 200
    assert len(r.json()) <= 200


# === Cleanup ===
def test_zz_cleanup(created_ids):
    mid = created_ids.get("meal_id")
    if mid:
        requests.delete(f"{BASE_URL}/api/meals/{mid}", headers=HEADERS, timeout=10)
    tid = created_ids.get("template_id")
    if tid:
        r = requests.delete(f"{BASE_URL}/api/meals/templates/{tid}", headers=HEADERS, timeout=10)
        assert r.status_code == 200
        # verify 404 on second delete
        r2 = requests.delete(f"{BASE_URL}/api/meals/templates/{tid}", headers=HEADERS, timeout=10)
        assert r2.status_code == 404
