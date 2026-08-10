from fastapi import FastAPI, APIRouter, HTTPException, Body
from dotenv import load_dotenv
from starlette.middleware.cors import CORSMiddleware
from motor.motor_asyncio import AsyncIOMotorClient
import os
import logging
import uuid
from pathlib import Path
from datetime import datetime, timedelta, timezone
from seed import build_seed

ROOT_DIR = Path(__file__).parent
load_dotenv(ROOT_DIR / '.env')

mongo_url = os.environ['MONGO_URL']
client = AsyncIOMotorClient(mongo_url)
db = client[os.environ['DB_NAME']]

app = FastAPI()
api = APIRouter(prefix="/api")

NO_ID = {"_id": 0}


def business_day_age(paid_at_iso: str) -> int:
    paid = datetime.fromisoformat(paid_at_iso)
    now = datetime.now(timezone.utc)
    d, count = paid, 0
    while d.date() < now.date():
        d += timedelta(days=1)
        if d.weekday() < 5:
            count += 1
    return count


def with_age(order: dict) -> dict:
    order["business_day_age"] = business_day_age(order["paid_at"])
    return order


@app.on_event("startup")
async def seed_if_empty():
    existing = await db.meta.find_one({"id": "seed"})
    if existing:
        return
    data = build_seed()
    for coll, docs in data.items():
        if docs:
            await db[coll].delete_many({})
            await db[coll].insert_many(docs)
    logging.info("Seeded database with mock operational data")


@api.get("/")
async def root():
    return {"message": "E-RYDEZ Operations Console API"}


@api.post("/reset")
async def reset():
    data = build_seed()
    for coll, docs in data.items():
        await db[coll].delete_many({})
        if docs:
            await db[coll].insert_many(docs)
    return {"status": "reseeded"}


# ---------------- OVERVIEW ----------------
@api.get("/overview")
async def overview():
    orders = [with_age(o) for o in await db.orders.find({}, NO_ID).to_list(500)]
    work = await db.work_items.find({}, NO_ID).to_list(500)
    convs = await db.conversations.find({}, NO_ID).to_list(500)
    integrations = await db.integrations.find({}, NO_ID).to_list(50)
    runs = await db.automation_runs.find({}, NO_ID).sort("ts", -1).to_list(6)
    approvals = await db.approvals.find({"state": "Pending"}, NO_ID).to_list(50)
    appts = await db.appointments.find({"status": "Upcoming"}, NO_ID).sort("time", 1).to_list(10)
    inventory = await db.inventory.find({"risk": {"$in": ["Shortage", "Critical shortage", "At risk"]}}, NO_ID).to_list(20)

    open_work = [w for w in work if w["state"] not in ("Resolved",)]
    unfulfilled = [o for o in orders if o["payment_status"] == "Paid" and o["fulfillment_stage"] not in ("Fulfilled", "Cancelled")]
    overdue14 = [o for o in unfulfilled if o["business_day_age"] > 14]
    awaiting_reply = [c for c in convs if c["state"] in ("Open", "Approval required") and c.get("waiting")]
    failed_autos = [w for w in open_work if w["category"] == "automation"]

    buckets = {"0–7": 0, "8–14": 0, "15–21": 0, "22–30": 0, "30+": 0}
    for o in unfulfilled:
        a = o["business_day_age"]
        k = "0–7" if a <= 7 else "8–14" if a <= 14 else "15–21" if a <= 21 else "22–30" if a <= 30 else "30+"
        buckets[k] += 1

    sev_rank = {"Critical": 0, "High": 1, "Normal": 2, "Low": 3}
    queue = sorted(open_work, key=lambda w: (sev_rank.get(w["severity"], 4), w.get("due") or "9999"))[:8]

    return {
        "greeting_name": "Pablo",
        "last_sync": datetime.now(timezone.utc).isoformat(),
        "cards": {
            "needs_action": len(open_work),
            "overdue_14": len(overdue14),
            "awaiting_reply": len(awaiting_reply),
            "failed_automations": len(failed_autos),
        },
        "priority_queue": queue,
        "today": appts,
        "backlog_by_age": buckets,
        "inventory_risks": inventory,
        "automation_activity": {"recent_runs": runs, "pending_approvals": len(approvals)},
        "integrations": integrations,
    }


# ---------------- WORK ITEMS ----------------
@api.get("/work-items")
async def list_work_items(view: str = "all-open"):
    items = await db.work_items.find({}, NO_ID).to_list(500)
    sev_rank = {"Critical": 0, "High": 1, "Normal": 2, "Low": 3}
    now = datetime.now(timezone.utc).isoformat()

    def is_open(w):
        return w["state"] != "Resolved"

    filters = {
        "my-work": lambda w: is_open(w) and w["owner"] == "Pablo",
        "critical": lambda w: is_open(w) and w["severity"] == "Critical",
        "due-today": lambda w: is_open(w) and w.get("due") and w["due"] < (datetime.now(timezone.utc) + timedelta(hours=24)).isoformat(),
        "overdue-orders": lambda w: is_open(w) and "unfulfilled" in w["reason"].lower(),
        "customer-waiting": lambda w: is_open(w) and w.get("customer_waiting"),
        "awaiting-stock": lambda w: is_open(w) and ("stock" in w["reason"].lower() or "inbound" in w["reason"].lower()),
        "awaiting-approval": lambda w: w["state"] == "Approval required",
        "failed-automation": lambda w: is_open(w) and w["category"] == "automation",
        "unassigned": lambda w: is_open(w) and w["owner"] == "Unassigned",
        "all-open": is_open,
        "resolved": lambda w: w["state"] == "Resolved",
    }
    f = filters.get(view, filters["all-open"])
    out = sorted([w for w in items if f(w)], key=lambda w: (sev_rank.get(w["severity"], 4), w.get("due") or "9999"))
    counts = {k: len([w for w in items if fn(w)]) for k, fn in filters.items()}
    return {"items": out, "counts": counts}


@api.patch("/work-items/{item_id}")
async def update_work_item(item_id: str, payload: dict = Body(...)):
    allowed = {k: v for k, v in payload.items() if k in ("state", "owner", "severity")}
    if not allowed:
        raise HTTPException(400, "No valid fields")
    allowed["updated_at"] = datetime.now(timezone.utc).isoformat()
    res = await db.work_items.update_one({"id": item_id}, {"$set": allowed})
    if res.matched_count == 0:
        raise HTTPException(404, "Work item not found")
    return await db.work_items.find_one({"id": item_id}, NO_ID)


# ---------------- ORDERS ----------------
@api.get("/orders")
async def list_orders(q: str = None, filter: str = None):
    orders = [with_age(o) for o in await db.orders.find({}, NO_ID).to_list(500)]
    if q:
        ql = q.lower()
        orders = [o for o in orders if ql in o["id"].lower() or ql in o["customer"]["name"].lower()
                  or ql in o["customer"]["email"].lower() or ql in (o.get("tracking") or "").lower()
                  or any(ql in i["sku"].lower() or ql in i["name"].lower() for i in o["items"])]
    filters = {
        "unfulfilled": lambda o: o["payment_status"] == "Paid" and o["fulfillment_stage"] not in ("Fulfilled", "Cancelled"),
        "over-8": lambda o: o["business_day_age"] > 8 and o["fulfillment_stage"] not in ("Fulfilled", "Cancelled"),
        "over-14": lambda o: o["business_day_age"] > 14 and o["fulfillment_stage"] not in ("Fulfilled", "Cancelled"),
        "over-30": lambda o: o["business_day_age"] > 30 and o["fulfillment_stage"] not in ("Fulfilled", "Cancelled"),
        "shipping": lambda o: o["delivery_method"] == "Shipping",
        "pickup": lambda o: o["delivery_method"] == "Pickup",
        "awaiting-stock": lambda o: o["fulfillment_stage"] == "Awaiting stock",
        "unread-message": lambda o: "Has unread message" in o["exceptions"] or "Customer waiting" in o["exceptions"],
        "missing-tracking": lambda o: "Missing tracking" in o["exceptions"],
        "failed-notification": lambda o: any("Failed" in e or "No update" in e for e in o["exceptions"]),
        "cancelled-refunded": lambda o: o["payment_status"] in ("Cancelled", "Refunded", "Partially refunded"),
    }
    if filter and filter in filters:
        orders = [o for o in orders if filters[filter](o)]
    orders.sort(key=lambda o: -o["business_day_age"])
    return orders


@api.get("/orders/{order_id}")
async def get_order(order_id: str):
    o = await db.orders.find_one({"id": order_id}, NO_ID)
    if not o:
        raise HTTPException(404, "Order not found")
    with_age(o)
    o["work_items"] = await db.work_items.find({"order_id": order_id}, NO_ID).to_list(20)
    o["conversations"] = await db.conversations.find({"order_id": order_id}, NO_ID).to_list(20)
    o["returns"] = await db.returns.find({"order_id": order_id}, NO_ID).to_list(20)
    o["appointments"] = await db.appointments.find({"order_id": order_id}, NO_ID).to_list(20)
    o["approvals"] = await db.approvals.find({"order_id": order_id}, NO_ID).to_list(20)
    return o


@api.post("/orders/{order_id}/notes")
async def add_note(order_id: str, payload: dict = Body(...)):
    note = {"id": str(uuid.uuid4()), "ts": datetime.now(timezone.utc).isoformat(), "author": "Pablo", "text": payload.get("text", "")}
    ev = {"id": str(uuid.uuid4()), "ts": note["ts"], "source": "Console", "channel": "note", "actor": "Pablo", "type": "note", "summary": "Internal note added", "detail": note["text"]}
    res = await db.orders.update_one({"id": order_id}, {"$push": {"notes": note, "timeline": ev}})
    if res.matched_count == 0:
        raise HTTPException(404, "Order not found")
    return note


@api.post("/orders/{order_id}/pause-updates")
async def pause_updates(order_id: str, payload: dict = Body(...)):
    now = datetime.now(timezone.utc)
    paused = payload.get("paused", True)
    update = {
        "updates_suppressed": paused,
        "suppression_reason": payload.get("reason") if paused else None,
        "suppression_until": payload.get("until") if paused else None,
        "next_scheduled_update": None if paused else (now + timedelta(days=2)).isoformat(),
    }
    ev = {"id": str(uuid.uuid4()), "ts": now.isoformat(), "source": "Console", "channel": "system", "actor": "Pablo", "type": "override",
          "summary": "Automatic updates paused" if paused else "Automatic updates resumed",
          "detail": payload.get("reason", "")}
    res = await db.orders.update_one({"id": order_id}, {"$set": update, "$push": {"timeline": ev}})
    if res.matched_count == 0:
        raise HTTPException(404, "Order not found")
    return await get_order(order_id)


@api.post("/orders/{order_id}/timeline")
async def add_timeline_event(order_id: str, payload: dict = Body(...)):
    ev = {"id": str(uuid.uuid4()), "ts": datetime.now(timezone.utc).isoformat(),
          "source": payload.get("source", "Console"), "channel": payload.get("channel", "system"),
          "actor": payload.get("actor", "Pablo"), "type": payload.get("type", "action"),
          "summary": payload.get("summary", ""), "detail": payload.get("detail", "")}
    res = await db.orders.update_one({"id": order_id}, {"$push": {"timeline": ev}})
    if res.matched_count == 0:
        raise HTTPException(404, "Order not found")
    return ev


# ---------------- CONVERSATIONS ----------------
@api.get("/conversations")
async def list_conversations(filter: str = None):
    convs = await db.conversations.find({}, NO_ID).to_list(500)
    filters = {
        "unread": lambda c: c["unread"],
        "customer-waiting": lambda c: c.get("waiting"),
        "needs-approval": lambda c: c["state"] == "Approval required",
        "unlinked": lambda c: not c.get("order_id"),
        "duplicate": lambda c: c.get("duplicate_warning"),
        "warranty": lambda c: c["category"] == "Warranty",
        "cancellation": lambda c: c["category"] == "Cancellation",
        "b2b": lambda c: c["category"] == "B2B",
    }
    if filter and filter in filters:
        convs = [c for c in convs if filters[filter](c)]
    convs.sort(key=lambda c: c["updated_at"], reverse=True)
    return convs


@api.get("/conversations/{conv_id}")
async def get_conversation(conv_id: str):
    c = await db.conversations.find_one({"id": conv_id}, NO_ID)
    if not c:
        raise HTTPException(404, "Conversation not found")
    if c.get("order_id"):
        o = await db.orders.find_one({"id": c["order_id"]}, NO_ID)
        if o:
            c["order"] = with_age(o)
    return c


@api.post("/conversations/{conv_id}/messages")
async def send_message(conv_id: str, payload: dict = Body(...)):
    c = await db.conversations.find_one({"id": conv_id}, NO_ID)
    if not c:
        raise HTTPException(404, "Conversation not found")
    now = datetime.now(timezone.utc).isoformat()
    mode = payload.get("mode", "send")
    msg = {"id": str(uuid.uuid4()), "ts": now, "from": "Pablo", "direction": "out",
           "body": payload.get("body", ""), "automated": False, "channel": c["channel"],
           "delivery_state": {"send": "Sent", "schedule": "Scheduled", "approval": "Pending approval", "draft": "Draft"}[mode]}
    new_state = "Approval required" if mode == "approval" else ("In progress" if mode in ("send", "schedule") else c["state"])
    await db.conversations.update_one({"id": conv_id}, {
        "$push": {"messages": msg},
        "$set": {"updated_at": now, "unread": False, "waiting": None, "state": new_state, "preview": msg["body"][:90]},
    })
    if c.get("order_id") and mode == "send":
        ev = {"id": str(uuid.uuid4()), "ts": now, "source": "Console", "channel": c["channel"], "actor": "Pablo", "type": "message",
              "summary": f"Reply sent via {c['channel']}", "detail": msg["body"][:200]}
        await db.orders.update_one({"id": c["order_id"]}, {"$push": {"timeline": ev}})
    return msg


@api.patch("/conversations/{conv_id}")
async def update_conversation(conv_id: str, payload: dict = Body(...)):
    allowed = {k: v for k, v in payload.items() if k in ("state", "owner", "order_id", "category", "unread")}
    allowed["updated_at"] = datetime.now(timezone.utc).isoformat()
    res = await db.conversations.update_one({"id": conv_id}, {"$set": allowed})
    if res.matched_count == 0:
        raise HTTPException(404, "Conversation not found")
    return await db.conversations.find_one({"id": conv_id}, NO_ID)


# ---------------- FULFILLMENT ----------------
STAGES = ["Awaiting stock", "Ready to allocate", "Allocated", "Picking", "Packed", "Carrier handoff / ready for pickup", "Fulfilled", "Delivery exception"]


@api.get("/fulfillment")
async def list_fulfillments():
    items = await db.fulfillments.find({}, NO_ID).to_list(500)
    for f in items:
        f["age"] = business_day_age(f["paid_at"])
    grouped = {s: [f for f in items if f["stage"] == s] for s in STAGES}
    return {"stages": STAGES, "grouped": grouped, "items": items}


@api.post("/fulfillment/{fid}/advance")
async def advance_fulfillment(fid: str, payload: dict = Body(default={})):
    f = await db.fulfillments.find_one({"id": fid}, NO_ID)
    if not f:
        raise HTTPException(404, "Fulfillment not found")
    cur = f["stage"]
    if cur in ("Fulfilled",):
        raise HTTPException(400, "Already fulfilled")
    if cur == "Delivery exception":
        nxt = "Carrier handoff / ready for pickup"
    else:
        idx = STAGES.index(cur)
        nxt = STAGES[min(idx + 1, 6)]
    if nxt == "Fulfilled" and not f.get("tracking") and f["delivery_method"] == "Shipping" and not payload.get("exception_reason"):
        raise HTTPException(422, "Missing tracking requires an explicit permitted exception reason")
    now = datetime.now(timezone.utc).isoformat()
    update = {"stage": nxt, "updated_at": now, "operator": "Pablo"}
    if payload.get("tracking"):
        update["tracking"] = payload["tracking"]
        update["notification_state"] = "Scheduled"
    await db.fulfillments.update_one({"id": fid}, {"$set": update})
    await db.orders.update_one({"id": f["order_id"]}, {"$set": {"fulfillment_stage": "Fulfilled" if nxt == "Fulfilled" else nxt.split(" /")[0] if "/" in nxt else nxt, **({"tracking": payload["tracking"], "carrier": "Planzer"} if payload.get("tracking") else {})},
        "$push": {"timeline": {"id": str(uuid.uuid4()), "ts": now, "source": "Console", "channel": "system", "actor": "Pablo", "type": "fulfillment", "summary": f"Fulfillment stage: {cur} → {nxt}", "detail": payload.get("exception_reason", "")}}})
    return await db.fulfillments.find_one({"id": fid}, NO_ID)


@api.post("/fulfillment/{fid}/scan")
async def scan_fulfillment(fid: str, payload: dict = Body(...)):
    f = await db.fulfillments.find_one({"id": fid}, NO_ID)
    if not f:
        raise HTTPException(404, "Fulfillment not found")
    scanned = payload.get("code", "").strip().upper()
    expected = f["sku"].upper()
    match = scanned == expected or (f.get("serial") and scanned == f["serial"].upper())
    now = datetime.now(timezone.utc).isoformat()
    if not match:
        wi = {"id": str(uuid.uuid4()), "title": f"Scan mismatch — {f['order_id']}", "order_id": f["order_id"],
              "customer": f["customer"], "severity": "High", "reason": f"Scanned {scanned or '(empty)'} but expected {expected}",
              "state": "Open", "customer_waiting": None, "due": None, "owner": "Fulfillment",
              "recommended_action": "Verify physical item", "updated_at": now, "source": "scan", "category": "fulfillment", "created_at": now}
        await db.work_items.insert_one(wi)
        return {"match": False, "expected": expected, "scanned": scanned, "exception_created": True}
    return {"match": True, "expected": expected, "scanned": scanned}


# ---------------- INVENTORY ----------------
@api.get("/inventory")
async def list_inventory():
    return await db.inventory.find({}, NO_ID).to_list(200)


@api.get("/inventory/{sku}")
async def get_inventory(sku: str):
    item = await db.inventory.find_one({"sku": sku}, NO_ID)
    if not item:
        raise HTTPException(404, "SKU not found")
    orders = [with_age(o) for o in await db.orders.find({"items.sku": sku, "payment_status": "Paid", "fulfillment_stage": {"$nin": ["Fulfilled", "Cancelled"]}}, NO_ID).to_list(50)]
    orders.sort(key=lambda o: -o["business_day_age"])
    item["waiting_orders"] = orders
    pos = await db.purchase_orders.find({"items": {"$regex": sku}}, NO_ID).to_list(10)
    item["inbound_pos"] = pos
    return item


# ---------------- RETURNS ----------------
@api.get("/returns")
async def list_returns():
    return await db.returns.find({}, NO_ID).sort("created_at", -1).to_list(100)


@api.get("/returns/{rma_id}")
async def get_return(rma_id: str):
    r = await db.returns.find_one({"id": rma_id}, NO_ID)
    if not r:
        raise HTTPException(404, "RMA not found")
    return r


@api.patch("/returns/{rma_id}")
async def update_return(rma_id: str, payload: dict = Body(...)):
    allowed = {k: v for k, v in payload.items() if k in ("state", "approved_resolution", "liability_decision", "inspection")}
    now = datetime.now(timezone.utc).isoformat()
    ev = {"id": str(uuid.uuid4()), "ts": now, "actor": "Pablo", "summary": f"State changed to {payload.get('state')}" if payload.get("state") else "RMA updated"}
    res = await db.returns.update_one({"id": rma_id}, {"$set": allowed, "$push": {"timeline": ev}})
    if res.matched_count == 0:
        raise HTTPException(404, "RMA not found")
    return await db.returns.find_one({"id": rma_id}, NO_ID)


# ---------------- APPOINTMENTS ----------------
@api.get("/appointments")
async def list_appointments():
    return await db.appointments.find({}, NO_ID).sort("time", 1).to_list(100)


@api.patch("/appointments/{appt_id}")
async def update_appointment(appt_id: str, payload: dict = Body(...)):
    allowed = {k: v for k, v in payload.items() if k in ("status", "time", "confirmation_state")}
    res = await db.appointments.update_one({"id": appt_id}, {"$set": allowed})
    if res.matched_count == 0:
        raise HTTPException(404, "Appointment not found")
    return await db.appointments.find_one({"id": appt_id}, NO_ID)


# ---------------- AUTOMATIONS ----------------
@api.get("/automations")
async def list_automations():
    return await db.automations.find({}, NO_ID).to_list(50)


@api.patch("/automations/{auto_id}")
async def update_automation(auto_id: str, payload: dict = Body(...)):
    if "status" not in payload:
        raise HTTPException(400, "status required")
    res = await db.automations.update_one({"id": auto_id}, {"$set": {"status": payload["status"]}})
    if res.matched_count == 0:
        raise HTTPException(404, "Automation not found")
    return await db.automations.find_one({"id": auto_id}, NO_ID)


@api.get("/automations/runs")
async def list_runs():
    return await db.automation_runs.find({}, NO_ID).sort("ts", -1).to_list(100)


@api.get("/automations/runs/{run_id}")
async def get_run(run_id: str):
    r = await db.automation_runs.find_one({"id": run_id}, NO_ID)
    if not r:
        raise HTTPException(404, "Run not found")
    return r


# ---------------- APPROVALS ----------------
@api.get("/approvals")
async def list_approvals():
    return await db.approvals.find({}, NO_ID).sort("requested_at", -1).to_list(100)


@api.post("/approvals/{apr_id}/decision")
async def decide_approval(apr_id: str, payload: dict = Body(...)):
    a = await db.approvals.find_one({"id": apr_id}, NO_ID)
    if not a:
        raise HTTPException(404, "Approval not found")
    if a["state"] != "Pending":
        raise HTTPException(400, "Approval already decided")
    decision = payload.get("decision")
    if decision not in ("approve", "reject", "more-info"):
        raise HTTPException(400, "decision must be approve, reject or more-info")
    if decision == "reject" and not payload.get("reason"):
        raise HTTPException(422, "Rejection reason is required")
    now = datetime.now(timezone.utc).isoformat()
    state = {"approve": "Approved", "reject": "Rejected", "more-info": "More info requested"}[decision]
    await db.approvals.update_one({"id": apr_id}, {"$set": {
        "state": state, "decision": f"{state} by Pablo", "decision_reason": payload.get("reason"), "decided_at": now,
        **({"draft": payload["draft"]} if payload.get("draft") else {}),
    }})
    if a.get("order_id"):
        ev = {"id": str(uuid.uuid4()), "ts": now, "source": "Console", "channel": "system", "actor": "Pablo", "type": "approval",
              "summary": f"Approval {a['id']} {state.lower()}", "detail": payload.get("reason") or a["proposed_action"]}
        await db.orders.update_one({"id": a["order_id"]}, {"$push": {"timeline": ev, "audit": {"id": str(uuid.uuid4()), "ts": now, "actor": "Pablo", "action": f"approval.{decision}", "prev": "Pending", "new": state, "reason": payload.get("reason")}}})
    return await db.approvals.find_one({"id": apr_id}, NO_ID)


# ---------------- MISC ----------------
@api.get("/integrations")
async def list_integrations():
    return await db.integrations.find({}, NO_ID).to_list(20)


@api.get("/notifications")
async def list_notifications():
    return await db.notifications.find({}, NO_ID).sort("ts", -1).to_list(50)


@api.patch("/notifications/{nid}")
async def mark_notification(nid: str):
    await db.notifications.update_one({"id": nid}, {"$set": {"read": True}})
    return {"ok": True}


@api.get("/purchasing")
async def purchasing():
    return {
        "suppliers": await db.suppliers.find({}, NO_ID).to_list(50),
        "purchase_orders": await db.purchase_orders.find({}, NO_ID).to_list(50),
    }


@api.get("/reports")
async def reports():
    orders = [with_age(o) for o in await db.orders.find({}, NO_ID).to_list(500)]
    unfulfilled = [o for o in orders if o["payment_status"] == "Paid" and o["fulfillment_stage"] not in ("Fulfilled", "Cancelled")]
    fulfilled = [o for o in orders if o["fulfillment_stage"] == "Fulfilled"]
    convs = await db.conversations.find({}, NO_ID).to_list(500)
    buckets = {"0–7": 0, "8–14": 0, "15–21": 0, "22–30": 0, "30+": 0}
    for o in unfulfilled:
        a = o["business_day_age"]
        k = "0–7" if a <= 7 else "8–14" if a <= 14 else "15–21" if a <= 21 else "22–30" if a <= 30 else "30+"
        buckets[k] += 1
    cat_counts = {}
    for c in convs:
        cat_counts[c["category"]] = cat_counts.get(c["category"], 0) + 1
    tracked = len([o for o in fulfilled if o.get("tracking")])
    return {
        "period": "Last 30 days", "timezone": "Europe/Zurich", "refreshed_at": datetime.now(timezone.utc).isoformat(),
        "backlog_by_age": buckets,
        "critical_orders": len([o for o in unfulfilled if o["business_day_age"] > 14]),
        "first_response_hours": 3.4, "customer_waiting_hours_avg": 9.1,
        "paid_to_fulfilled_days_avg": 6.2, "paid_to_fulfilled_days_prev": 7.8,
        "inquiries_by_category": cat_counts,
        "proactive_messages_sent": 47, "contact_avoided_estimate": 31,
        "tracking_coverage": {"tracked": tracked, "total": max(len(fulfilled), 1)},
        "automation": {"success": 812, "failed": 14, "manual_intervention": 22},
    }


@api.get("/search")
async def global_search(q: str):
    ql = q.lower().strip()
    if not ql:
        return {"orders": [], "conversations": [], "returns": [], "inventory": []}
    orders = [with_age(o) for o in await db.orders.find({}, NO_ID).to_list(500)]
    orders = [o for o in orders if ql in o["id"].lower() or ql in o["order_number"].lower() or ql in o["customer"]["name"].lower()
              or ql in o["customer"]["email"].lower() or ql in o["customer"]["phone"].replace(" ", "")
              or ql in (o.get("tracking") or "").lower() or any(ql in i["sku"].lower() or ql in i["name"].lower() for i in o["items"])][:6]
    convs = await db.conversations.find({}, NO_ID).to_list(200)
    convs = [c for c in convs if ql in c["customer"]["name"].lower() or ql in c["subject"].lower() or ql in (c.get("order_id") or "").lower()][:5]
    rmas = await db.returns.find({}, NO_ID).to_list(100)
    rmas = [r for r in rmas if ql in r["id"].lower() or ql in r["customer"]["name"].lower() or ql in (r.get("serial") or "").lower()][:5]
    inv = await db.inventory.find({}, NO_ID).to_list(100)
    inv = [i for i in inv if ql in i["sku"].lower() or ql in i["product"].lower()][:5]
    return {"orders": orders, "conversations": convs, "returns": rmas, "inventory": inv}


app.include_router(api)

app.add_middleware(
    CORSMiddleware,
    allow_credentials=True,
    allow_origins=os.environ.get('CORS_ORIGINS', '*').split(','),
    allow_methods=["*"],
    allow_headers=["*"],
)

logging.basicConfig(level=logging.INFO, format='%(asctime)s - %(name)s - %(levelname)s - %(message)s')
logger = logging.getLogger(__name__)


@app.on_event("shutdown")
async def shutdown_db_client():
    client.close()
