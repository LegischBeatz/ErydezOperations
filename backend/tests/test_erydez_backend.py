"""E-RYDEZ Operations Console backend tests.

Covers all endpoints listed in the review request: overview, work-items,
orders (list/detail/notes/pause), conversations, fulfillment (advance/scan),
inventory, returns, appointments, automations, approvals, search, reports,
integrations, notifications.
"""
import os
import pytest
import requests

BASE_URL = os.environ.get("REACT_APP_BACKEND_URL", "https://erydez-ops-console.preview.emergentagent.com").rstrip("/")
API = f"{BASE_URL}/api"


@pytest.fixture(scope="session", autouse=True)
def reseed():
    r = requests.post(f"{API}/reset", timeout=30)
    assert r.status_code == 200
    yield


@pytest.fixture(scope="session")
def s():
    return requests.Session()


# ---------------- Overview ----------------
def test_overview(s):
    r = s.get(f"{API}/overview")
    assert r.status_code == 200
    d = r.json()
    for k in ("needs_action", "overdue_14", "awaiting_reply", "failed_automations"):
        assert k in d["cards"]
    assert len(d["priority_queue"]) <= 8
    assert set(d["backlog_by_age"].keys()) == {"0–7", "8–14", "15–21", "22–30", "30+"}
    assert isinstance(d["today"], list)
    assert isinstance(d["inventory_risks"], list)
    assert isinstance(d["integrations"], list)
    assert "recent_runs" in d["automation_activity"]


# ---------------- Work items ----------------
@pytest.mark.parametrize("view", [
    "my-work", "critical", "due-today", "overdue-orders", "customer-waiting",
    "awaiting-stock", "awaiting-approval", "failed-automation", "unassigned", "all-open",
])
def test_work_items_views(s, view):
    r = s.get(f"{API}/work-items", params={"view": view})
    assert r.status_code == 200, r.text
    data = r.json()
    assert "items" in data and "counts" in data
    assert view in data["counts"]


def test_work_item_patch(s):
    lst = s.get(f"{API}/work-items", params={"view": "all-open"}).json()["items"]
    assert lst, "expected some open work items"
    wid = lst[0]["id"]
    r = s.patch(f"{API}/work-items/{wid}", json={"owner": "Pablo"})
    assert r.status_code == 200
    assert r.json()["owner"] == "Pablo"

    r2 = s.patch(f"{API}/work-items/does-not-exist", json={"owner": "X"})
    assert r2.status_code == 404


# ---------------- Orders ----------------
@pytest.mark.parametrize("f", ["unfulfilled", "over-14", "pickup", "missing-tracking", "cancelled-refunded"])
def test_orders_filters(s, f):
    r = s.get(f"{API}/orders", params={"filter": f})
    assert r.status_code == 200
    assert isinstance(r.json(), list)


def test_orders_search(s):
    r = s.get(f"{API}/orders", params={"q": "weber"})
    assert r.status_code == 200


def test_order_detail(s):
    r = s.get(f"{API}/orders/E-1001")
    assert r.status_code == 200
    d = r.json()
    assert d["id"] == "E-1001"
    assert isinstance(d["business_day_age"], int)
    for k in ("timeline", "work_items", "conversations", "returns", "appointments", "approvals"):
        assert k in d


def test_order_not_found(s):
    assert s.get(f"{API}/orders/E-9999").status_code == 404


def test_add_note_and_pause(s):
    r = s.post(f"{API}/orders/E-1001/notes", json={"text": "TEST_NOTE test"})
    assert r.status_code == 200
    assert r.json()["text"] == "TEST_NOTE test"

    r = s.post(f"{API}/orders/E-1001/pause-updates", json={"paused": True, "reason": "Customer requested pause"})
    assert r.status_code == 200
    assert r.json()["updates_suppressed"] is True
    assert r.json()["suppression_reason"] == "Customer requested pause"

    r = s.post(f"{API}/orders/E-1001/pause-updates", json={"paused": False})
    assert r.status_code == 200
    assert r.json()["updates_suppressed"] is False


# ---------------- Conversations ----------------
@pytest.mark.parametrize("f", ["unread", "unlinked", "cancellation"])
def test_conversations_filters(s, f):
    r = s.get(f"{API}/conversations", params={"filter": f})
    assert r.status_code == 200
    assert isinstance(r.json(), list)


def test_conversation_detail_and_send(s):
    convs = s.get(f"{API}/conversations").json()
    assert convs
    linked = next((c for c in convs if c.get("order_id")), None)
    assert linked
    cid = linked["id"]
    r = s.get(f"{API}/conversations/{cid}")
    assert r.status_code == 200
    d = r.json()
    if d.get("order_id"):
        assert "order" in d

    r = s.post(f"{API}/conversations/{cid}/messages", json={"mode": "send", "body": "TEST message"})
    assert r.status_code == 200
    assert r.json()["delivery_state"] == "Sent"

    r = s.patch(f"{API}/conversations/{cid}", json={"state": "Snoozed"})
    assert r.status_code == 200


# ---------------- Fulfillment ----------------
def test_fulfillment_list(s):
    r = s.get(f"{API}/fulfillment")
    assert r.status_code == 200
    d = r.json()
    assert len(d["stages"]) == 8
    assert "grouped" in d


def test_fulfillment_scan_mismatch_and_match(s):
    items = s.get(f"{API}/fulfillment").json()["items"]
    target = next((f for f in items if f["stage"] in ("Allocated", "Picking", "Packed")), items[0])
    r = s.post(f"{API}/fulfillment/{target['id']}/scan", json={"code": "WRONG-CODE-XYZ"})
    assert r.status_code == 200
    assert r.json()["match"] is False
    assert r.json()["exception_created"] is True

    r = s.post(f"{API}/fulfillment/{target['id']}/scan", json={"code": target["sku"]})
    assert r.status_code == 200
    assert r.json()["match"] is True


def test_fulfillment_advance_requires_tracking(s):
    items = s.get(f"{API}/fulfillment").json()["items"]
    packed = next((f for f in items if f["stage"] == "Packed" and f["delivery_method"] == "Shipping" and not f.get("tracking")), None)
    if not packed:
        pytest.skip("no Packed shipping w/o tracking to test 422")
    # Packed -> Carrier handoff (allowed without tracking)
    r = s.post(f"{API}/fulfillment/{packed['id']}/advance", json={})
    assert r.status_code == 200
    # Carrier handoff -> Fulfilled requires tracking OR exception reason
    r = s.post(f"{API}/fulfillment/{packed['id']}/advance", json={})
    assert r.status_code == 422, f"expected 422 advancing to Fulfilled without tracking, got {r.status_code}"

    r = s.post(f"{API}/fulfillment/{packed['id']}/advance", json={"tracking": "TEST-TRK-1", "exception_reason": "manual"})
    assert r.status_code == 200


# ---------------- Inventory ----------------
def test_inventory(s):
    r = s.get(f"{API}/inventory")
    assert r.status_code == 200
    lst = r.json()
    for i in lst:
        assert i["atp"] == i["on_hand"] - i["committed"]


def test_inventory_sku(s):
    r = s.get(f"{API}/inventory/VX2-PRO-GT")
    assert r.status_code == 200
    d = r.json()
    assert "waiting_orders" in d and "inbound_pos" in d
    ages = [o["business_day_age"] for o in d["waiting_orders"]]
    assert ages == sorted(ages, reverse=True)


# ---------------- Returns ----------------
def test_returns(s):
    r = s.get(f"{API}/returns")
    assert r.status_code == 200
    r = s.get(f"{API}/returns/RMA-2031")
    assert r.status_code == 200
    d = r.json()
    prev_events = len(d.get("timeline", []))
    r = s.patch(f"{API}/returns/RMA-2031", json={"state": "In inspection"})
    assert r.status_code == 200
    assert len(r.json()["timeline"]) == prev_events + 1


# ---------------- Appointments ----------------
def test_appointments(s):
    r = s.get(f"{API}/appointments")
    assert r.status_code == 200
    lst = r.json()
    assert lst
    aid = lst[0]["id"]
    r = s.patch(f"{API}/appointments/{aid}", json={"status": "Checked in"})
    assert r.status_code == 200
    assert r.json()["status"] == "Checked in"


# ---------------- Automations ----------------
def test_automations(s):
    r = s.get(f"{API}/automations")
    assert r.status_code == 200
    lst = r.json()
    if lst:
        aid = lst[0]["id"]
        r = s.patch(f"{API}/automations/{aid}", json={"status": "Paused"})
        assert r.status_code == 200
        assert r.json()["status"] == "Paused"
    runs = s.get(f"{API}/automations/runs").json()
    assert runs
    r = s.get(f"{API}/automations/runs/{runs[0]['id']}")
    assert r.status_code == 200


# ---------------- Approvals ----------------
def test_approvals_flow(s):
    approvals = s.get(f"{API}/approvals").json()
    pending = [a for a in approvals if a["state"] == "Pending"]
    assert len(pending) >= 2

    a1 = pending[0]["id"]
    # reject without reason -> 422
    r = s.post(f"{API}/approvals/{a1}/decision", json={"decision": "reject"})
    assert r.status_code == 422
    r = s.post(f"{API}/approvals/{a1}/decision", json={"decision": "reject", "reason": "Not policy compliant"})
    assert r.status_code == 200
    # already decided -> 400
    r = s.post(f"{API}/approvals/{a1}/decision", json={"decision": "approve"})
    assert r.status_code == 400

    a2 = pending[1]["id"]
    r = s.post(f"{API}/approvals/{a2}/decision", json={"decision": "approve"})
    assert r.status_code == 200
    assert r.json()["state"] == "Approved"


# ---------------- Search / reports / misc ----------------
def test_search(s):
    r = s.get(f"{API}/search", params={"q": "weber"})
    assert r.status_code == 200
    assert isinstance(r.json()["orders"], list)

    r = s.get(f"{API}/search", params={"q": "RMA-2031"})
    assert r.status_code == 200
    assert any(rr["id"] == "RMA-2031" for rr in r.json()["returns"])

    r = s.get(f"{API}/search", params={"q": "VX2"})
    assert r.status_code == 200
    assert r.json()["inventory"]


def test_reports(s):
    r = s.get(f"{API}/reports")
    assert r.status_code == 200
    d = r.json()
    assert "backlog_by_age" in d
    assert "tracking_coverage" in d
    assert "automation" in d


def test_integrations_and_notifications(s):
    r = s.get(f"{API}/integrations")
    assert r.status_code == 200 and isinstance(r.json(), list)
    ns = s.get(f"{API}/notifications").json()
    if ns:
        r = s.patch(f"{API}/notifications/{ns[0]['id']}")
        assert r.status_code == 200
