import uuid
from datetime import datetime, timedelta, timezone

def _id():
    return str(uuid.uuid4())

def biz_days_ago(now, n):
    d = now
    added = 0
    while added < n:
        d = d - timedelta(days=1)
        if d.weekday() < 5:
            added += 1
    return d

def iso(dt):
    return dt.isoformat()

PRODUCTS = [
    {"sku": "VX2-PRO-GT", "name": "VMAX VX2 Pro GT", "variant": "Black / 500W", "price": 859.00},
    {"sku": "VX4-ST", "name": "VMAX VX4 ST", "variant": "Grey / 750W", "price": 1299.00},
    {"sku": "NB-MAX-G2", "name": "Segway Ninebot Max G2", "variant": "Dark Grey", "price": 899.00},
    {"sku": "ER-CARGO-1", "name": "E-RYDEZ Cargo One", "variant": "Sand / 250W", "price": 2490.00},
    {"sku": "AP-CITY-PRO", "name": "Apollo City Pro", "variant": "Black", "price": 1590.00},
    {"sku": "NIU-KQI3-MAX", "name": "NIU KQi3 Max", "variant": "Space Grey", "price": 749.00},
    {"sku": "HELM-ABUS-M", "name": "ABUS Urban Helmet", "variant": "Matt Black / M", "price": 89.00},
    {"sku": "LOCK-KRYP-U", "name": "Kryptonite U-Lock", "variant": "Standard", "price": 45.00},
    {"sku": "TIRE-10X3", "name": "Spare Tire 10x3", "variant": "Tubeless", "price": 39.00},
]

CUSTOMERS = [
    {"name": "Markus Weber", "email": "markus.weber@bluewin.ch", "phone": "+41 79 412 33 21", "city": "Zürich", "lang": "DE"},
    {"name": "Claire Dubois", "email": "claire.dubois@gmail.com", "phone": "+41 78 220 91 45", "city": "Lausanne", "lang": "FR"},
    {"name": "Luca Bernasconi", "email": "l.bernasconi@ticino.com", "phone": "+41 76 555 18 02", "city": "Lugano", "lang": "DE"},
    {"name": "Anna Keller", "email": "anna.keller@gmx.ch", "phone": "+41 79 881 44 67", "city": "Bern", "lang": "DE"},
    {"name": "Thomas Müller", "email": "t.mueller@sunrise.ch", "phone": "+41 78 334 72 19", "city": "Basel", "lang": "DE"},
    {"name": "Sophie Martin", "email": "sophie.martin@outlook.com", "phone": "+41 76 902 55 38", "city": "Genève", "lang": "FR"},
    {"name": "David Brunner", "email": "d.brunner@hispeed.ch", "phone": "+41 79 210 66 84", "city": "Winterthur", "lang": "DE"},
    {"name": "Elena Fischer", "email": "elena.fischer@icloud.com", "phone": "+41 78 445 09 12", "city": "Zug", "lang": "EN"},
    {"name": "Jonas Meier", "email": "jonas.meier@bluewin.ch", "phone": "+41 76 118 27 53", "city": "Luzern", "lang": "DE"},
    {"name": "Nadine Schmid", "email": "nadine.schmid@gmail.com", "phone": "+41 79 663 90 41", "city": "St. Gallen", "lang": "DE"},
    {"name": "Pierre Rochat", "email": "p.rochat@vtx.ch", "phone": "+41 78 771 24 96", "city": "Fribourg", "lang": "FR"},
    {"name": "Laura Steiner", "email": "laura.steiner@gmx.ch", "phone": "+41 76 340 85 07", "city": "Chur", "lang": "DE"},
    {"name": "Oliver Hartmann", "email": "o.hartmann@swissonline.ch", "phone": "+41 79 529 13 78", "city": "Aarau", "lang": "DE"},
    {"name": "Isabelle Favre", "email": "isabelle.favre@gmail.com", "phone": "+41 78 086 42 35", "city": "Neuchâtel", "lang": "FR"},
    {"name": "Ben Richards", "email": "ben.richards@proton.me", "phone": "+41 76 794 61 20", "city": "Zürich", "lang": "EN"},
]

OWNERS = ["Pablo", "Support", "Fulfillment", "Unassigned"]

def build_seed():
    now = datetime.now(timezone.utc)
    data = {}

    # ---------------- ORDERS ----------------
    # (idx, cust_idx, product_idx, qty, age_bizdays, payment, fulfillment_stage, delivery, tracking, exceptions, contact_state, next_action)
    specs = [
        (1001, 0, 0, 1, 17, "Paid", "Awaiting stock", "Shipping", None, ["Overdue >14d", "Customer waiting"], "Customer waiting 2 d", "Send delay update"),
        (1002, 1, 1, 1, 22, "Paid", "Awaiting stock", "Shipping", None, ["Overdue >14d", "No update sent 7d"], "Updated 8 d ago", "Send delay update"),
        (1003, 2, 2, 1, 9, "Paid", "Ready to allocate", "Pickup", None, ["Pickup not booked"], "No contact", "Book pickup"),
        (1004, 3, 3, 1, 31, "Paid", "Awaiting stock", "Shipping", None, ["Overdue >30d", "Customer waiting"], "Customer waiting 1 d", "Escalate / offer option"),
        (1005, 4, 4, 1, 6, "Paid", "Allocated", "Shipping", None, [], "Auto-update sent 2 d ago", "Start fulfillment"),
        (1006, 5, 5, 1, 12, "Paid", "Picking", "Shipping", None, ["Missing tracking"], "No contact", "Add tracking"),
        (1007, 6, 0, 1, 3, "Paid", "Packed", "Shipping", None, [], "Notified", "Carrier handoff"),
        (1008, 7, 6, 2, 2, "Paid", "Fulfilled", "Shipping", "99.00.123456.78901234", [], "Tracking sent", None),
        (1009, 8, 1, 1, 15, "Paid", "Awaiting stock", "Pickup", None, ["Overdue >14d"], "Updated 3 d ago", "Confirm inbound ETA"),
        (1010, 9, 2, 1, 8, "Paid", "Ready to allocate", "Shipping", None, ["Has unread message"], "Customer waiting 5 h", "Reply + allocate"),
        (1011, 10, 3, 1, 19, "Paid", "Awaiting stock", "Shipping", None, ["Overdue >14d", "FR language"], "Updated 4 d ago", "Send delay update"),
        (1012, 11, 4, 1, 4, "Paid", "Allocated", "Pickup", None, [], "Pickup booked", "Prepare pickup"),
        (1013, 12, 5, 1, 11, "Paid", "Picking", "Shipping", None, [], "Auto-update scheduled", None),
        (1014, 13, 0, 1, 25, "Paid", "Awaiting stock", "Shipping", None, ["Overdue >14d", "Refund requested"], "Customer waiting 3 h", "Refund approval"),
        (1015, 14, 7, 3, 1, "Paid", "Fulfilled", "Shipping", "99.00.556677.11223344", [], "Delivered", None),
        (1016, 0, 8, 2, 5, "Paid", "Fulfilled", "Shipping", "99.00.998811.55667788", ["Delivery exception"], "Carrier: address issue", "Resolve delivery exception"),
        (1017, 2, 1, 1, 13, "Paid", "Awaiting stock", "Shipping", None, [], "Updated 2 d ago", None),
        (1018, 4, 6, 1, 0, "Paid", "Ready to allocate", "Pickup", None, [], "No contact", "Allocate"),
        (1019, 6, 2, 1, 16, "Paid", "Awaiting stock", "Shipping", None, ["Overdue >14d"], "Updated 5 d ago", "Send delay update"),
        (1020, 8, 3, 1, 7, "Refunded", "Cancelled", "Shipping", None, [], "Refund confirmed", None),
        (1021, 10, 4, 1, 10, "Paid", "Allocated", "Shipping", None, [], "Auto-update sent", "Start fulfillment"),
        (1022, 12, 0, 1, 21, "Paid", "Awaiting stock", "Shipping", None, ["Overdue >14d", "Warranty case open"], "RMA in progress", "Review RMA"),
        (1023, 14, 5, 1, 2, "Paid", "Packed", "Shipping", None, [], "Notified", "Carrier handoff"),
        (1024, 1, 6, 1, 9, "Partially refunded", "Fulfilled", "Shipping", "99.00.334455.99887766", [], "Partial refund sent", None),
        (1025, 3, 2, 1, 18, "Paid", "Awaiting stock", "Pickup", None, ["Overdue >14d", "Payment due at pickup"], "Updated 6 d ago", "Send delay update"),
        (1026, 5, 1, 1, 1, "Paid", "Ready to allocate", "Shipping", None, [], "No contact", "Allocate"),
        (1027, 7, 3, 1, 28, "Paid", "Awaiting stock", "Shipping", None, ["Overdue >14d", "Customer waiting"], "Customer waiting 4 d", "Escalate / offer option"),
        (1028, 9, 4, 1, 5, "Cancelled", "Cancelled", "Shipping", None, [], "Cancellation confirmed", None),
    ]

    orders = []
    for (num, ci, pi, qty, age, pay, stage, dm, trk, exc, contact, next_act) in specs:
        c = CUSTOMERS[ci]
        p = PRODUCTS[pi]
        paid = biz_days_ago(now, age)
        oid = f"E-{num}"
        promised = "5–10 business days"
        last_update = None
        next_update = None
        suppressed = False
        if stage == "Awaiting stock" and pay == "Paid":
            last_update = iso(paid + timedelta(days=min(age, 5)))
            next_update = iso(now + timedelta(days=2))
        if num == 1004:
            suppressed = True
        timeline = [
            {"id": _id(), "ts": iso(paid), "source": "Shopify", "channel": "shopify", "actor": "Shopify", "type": "order", "summary": f"Order {oid} placed and paid — CHF {p['price']*qty:,.2f}", "detail": f"{qty}× {p['name']} ({p['variant']}), payment captured via TWINT."},
        ]
        if stage in ("Allocated", "Picking", "Packed", "Fulfilled"):
            timeline.append({"id": _id(), "ts": iso(paid + timedelta(days=1)), "source": "Console", "channel": "system", "actor": "Automation", "type": "automation", "summary": "Stock allocated from Zürich warehouse", "detail": "Allocation rule: oldest paid order first."})
        if last_update:
            timeline.append({"id": _id(), "ts": last_update, "source": "Automation", "channel": "email", "actor": "Automation", "type": "message", "summary": f"Proactive status update sent ({c['lang']})", "detail": "Template: delay_update_v3. Delivery confirmed by provider (Gmail id gm-88213)."})
        if "Customer waiting" in exc:
            timeline.append({"id": _id(), "ts": iso(now - timedelta(hours=26)), "source": "Gmail", "channel": "email", "actor": c["name"], "type": "message", "summary": "Customer asked for delivery date", "detail": "\"Hello, I ordered over two weeks ago. When will my scooter ship?\""})
        if trk:
            timeline.append({"id": _id(), "ts": iso(paid + timedelta(days=2)), "source": "Planzer", "channel": "planzer", "actor": "Planzer", "type": "shipment", "summary": f"Shipment created — tracking {trk}", "detail": "Service: Planzer Paket, 1 package, 18.4 kg."})
        if "Delivery exception" in exc:
            timeline.append({"id": _id(), "ts": iso(now - timedelta(hours=6)), "source": "Planzer", "channel": "planzer", "actor": "Planzer", "type": "exception", "summary": "Delivery exception: address incomplete", "detail": "Carrier could not locate apartment number. Parcel held at Zürich depot."})
        timeline.sort(key=lambda e: e["ts"])
        orders.append({
            "id": oid, "order_number": f"#{num}",
            "customer": c, "items": [{"sku": p["sku"], "name": p["name"], "variant": p["variant"], "qty": qty, "price": p["price"]}],
            "total": round(p["price"] * qty, 2),
            "paid_at": iso(paid), "payment_status": pay,
            "fulfillment_stage": stage, "delivery_method": dm,
            "tracking": trk, "carrier": "Planzer" if trk else None,
            "exceptions": exc, "contact_state": contact,
            "next_action": next_act, "promised_lead_time": promised,
            "stock_state": "Awaiting inbound" if stage == "Awaiting stock" else ("Allocated" if stage in ("Allocated", "Picking", "Packed") else "—"),
            "last_customer_update": last_update, "next_scheduled_update": next_update,
            "updates_suppressed": suppressed,
            "suppression_reason": "Customer requested telephone contact" if suppressed else None,
            "suppression_until": iso(now + timedelta(days=4)) if suppressed else None,
            "address": f"{c['city']}, Switzerland",
            "timeline": timeline,
            "notes": [],
            "financials": {"subtotal": round(p["price"] * qty, 2), "shipping": 0 if dm == "Pickup" else 19.00, "refunded": p["price"] if pay == "Refunded" else (120.00 if pay == "Partially refunded" else 0), "currency": "CHF"},
            "audit": [{"id": _id(), "ts": iso(paid), "actor": "Shopify webhook", "action": "order.created", "prev": None, "new": "Paid / Unfulfilled", "reason": "Webhook ingest"}],
            "created_at": iso(paid),
        })
    data["orders"] = orders

    # ---------------- WORK ITEMS ----------------
    wi = []
    def work(title, order_id, severity, reason, state, waiting, due_h, owner, action, source, category="order"):
        o = next((x for x in orders if x["id"] == order_id), None)
        wi.append({
            "id": _id(), "title": title, "order_id": order_id,
            "customer": o["customer"]["name"] if o else None,
            "severity": severity, "reason": reason, "state": state,
            "customer_waiting": waiting, "due": iso(now + timedelta(hours=due_h)) if due_h is not None else None,
            "owner": owner, "recommended_action": action,
            "updated_at": iso(now - timedelta(hours=abs(hash(title)) % 20 + 1)), "source": source,
            "category": category, "created_at": iso(now - timedelta(days=abs(hash(title)) % 6 + 1)),
        })
    work("Overdue order — VMAX VX2 Pro GT", "E-1001", "Critical", "17 business days unfulfilled; promised range exceeded by 8 days", "Open", "2 d", 4, "Pablo", "Send delay update", "rule")
    work("Overdue order — VMAX VX4 ST", "E-1002", "Critical", "22 business days unfulfilled; no customer update for 8 days", "Open", None, 2, "Unassigned", "Send delay update", "rule")
    work("Order exceeds 30 business days", "E-1004", "Critical", "31 business days unfulfilled; customer asked twice", "In progress", "1 d", 1, "Pablo", "Offer alternative or refund", "rule")
    work("Refund requested — E-1014", "E-1014", "Critical", "Customer requested refund after 25 business days", "Approval required", "3 h", 6, "Pablo", "Review refund approval", "conversation")
    work("Delivery exception — address issue", "E-1016", "High", "Planzer could not deliver; parcel held at Zürich depot", "Open", None, 8, "Unassigned", "Contact customer for address", "planzer")
    work("Unread customer message", "E-1010", "High", "Customer waiting 5 hours; order ready to allocate", "Open", "5 h", 6, "Support", "Reply and allocate stock", "gmail")
    work("Missing tracking — picking overdue", "E-1006", "High", "In picking for 3 days; no tracking recorded", "In progress", None, 12, "Fulfillment", "Add tracking", "rule")
    work("Overdue order — Apollo City Pro", "E-1019", "High", "16 business days unfulfilled; last update 5 days ago", "Open", None, 24, "Unassigned", "Send delay update", "rule")
    work("Overdue order — FR customer", "E-1011", "High", "19 business days unfulfilled; FR template required", "Open", None, 24, "Support", "Send delay update (FR)", "rule")
    work("Pickup not booked — E-1003", "E-1003", "Normal", "Order ready for pickup 9 business days; no appointment", "Open", None, 30, "Support", "Send booking link", "rule")
    work("Warranty case linked — E-1022", "E-1022", "Normal", "RMA-2031 under review; customer awaiting decision", "Waiting", None, 48, "Pablo", "Review inspection findings", "rma")
    work("Inbound ETA unconfirmed", "E-1009", "Normal", "Awaiting stock 15 business days; supplier ETA not confirmed", "Open", None, 48, "Pablo", "Confirm inbound ETA", "rule")
    work("Failed automation — delay update", "E-1027", "Critical", "Gmail send failed (quota); message not delivered", "Open", "4 d", 2, "Unassigned", "Retry send", "automation", "automation")
    work("Overdue order — pickup payment due", "E-1025", "High", "18 business days unfulfilled; bar payment at pickup", "Open", None, 24, "Unassigned", "Send delay update", "rule")
    work("Duplicate contact suspected", "E-1001", "Low", "Email and WhatsApp inquiry within 3 hours", "Waiting", None, None, "Support", "Mark duplicate", "conversation", "conversation")
    data["work_items"] = wi

    # ---------------- CONVERSATIONS ----------------
    convs = []
    def conv(cust_i, order_id, channel, subject, category, state, waiting_h, unread, lang, msgs, confidence=96, owner="Support", sla="OK"):
        c = CUSTOMERS[cust_i]
        m = []
        for (mins_ago, frm, body, auto) in msgs:
            m.append({"id": _id(), "ts": iso(now - timedelta(minutes=mins_ago)), "from": frm, "direction": "in" if frm == c["name"] else "out", "body": body, "automated": auto, "channel": channel})
        convs.append({
            "id": _id(), "customer": c, "order_id": order_id, "channel": channel,
            "subject": subject, "preview": msgs[-1][2][:90], "category": category,
            "state": state, "waiting": f"{waiting_h} h" if waiting_h else None,
            "sla": sla, "owner": owner, "unread": unread, "language": lang,
            "match_confidence": confidence, "messages": m,
            "updated_at": iso(now - timedelta(minutes=msgs[-1][0])),
            "duplicate_warning": None, "created_at": iso(now - timedelta(minutes=msgs[0][0])),
        })
    conv(0, "E-1001", "email", "Where is my order?", "Status inquiry", "Open", 26, True, "DE", [
        (1560, "Automation", "Guten Tag Herr Weber — Ihr VMAX VX2 Pro GT ist weiterhin in Produktion. Wir erwarten den Wareneingang in KW 25.", True),
        (1560 - 60, CUSTOMERS[0]["name"], "Hello, I ordered over two weeks ago (order #1001). When will my scooter ship? I need it for my commute.", False),
    ], 98)
    conv(9, "E-1010", "email", "Question before shipping", "Status inquiry", "Open", 5, True, "DE", [
        (300, CUSTOMERS[9]["name"], "Hi, can you confirm the scooter ships this week? Also, can I add a helmet to the same order?", False),
    ], 97)
    conv(13, "E-1014", "email", "Request for refund — order #1014", "Cancellation", "Approval required", 3, True, "FR", [
        (2880, CUSTOMERS[13]["name"], "Bonjour, cela fait 25 jours ouvrables. Je souhaite annuler ma commande et être remboursée intégralement.", False),
        (180, CUSTOMERS[13]["name"], "Merci de confirmer le remboursement rapidement.", False),
    ], 99, "Pablo", "Breached")
    conv(5, None, "whatsapp", "Battery question", "Product question", "Open", 2, True, "FR", [
        (120, CUSTOMERS[5]["name"], "Bonjour, quelle est l'autonomie réelle du Apollo City Pro en hiver?", False),
    ], 54)
    conv(3, "E-1004", "email", "Third follow-up on my order", "Status inquiry", "In progress", 22, False, "DE", [
        (4300, CUSTOMERS[3]["name"], "This is my third message. 31 business days is unacceptable. Please tell me exactly when the Cargo One arrives or cancel.", False),
        (4000, "Pablo", "Guten Tag Frau Keller, ich verstehe Ihren Ärger. Der Rahmen ist in der Endmontage — ich melde mich bis Freitag mit einem fixen Termin oder biete Ihnen eine Alternative an.", False),
        (1320, CUSTOMERS[3]["name"], "Friday is tomorrow. I expect a concrete answer.", False),
    ], 99, "Pablo", "At risk")
    conv(6, "E-1016", "email", "Delivery failed?", "Delivery", "Open", 6, True, "DE", [
        (360, CUSTOMERS[6]["name"], "Planzer says my address is incomplete. I live at Hardstrasse 12, apartment 4B. Please fix this.", False),
    ], 95)
    conv(12, "E-1022", "email", "Warranty — controller fault", "Warranty", "Waiting", None, False, "DE", [
        (7200, CUSTOMERS[12]["name"], "The display shows error E-07 and the motor cuts out. Serial VX2-2025-08812. Video attached.", False),
        (7000, "Support", "Thank you — RMA-2031 created. Our technician will review the video and we will send inspection instructions.", False),
    ], 99, "Pablo")
    conv(14, None, "email", "B2B fleet inquiry", "B2B", "Open", 12, True, "EN", [
        (720, CUSTOMERS[14]["name"], "We are looking to equip 15 couriers with e-scooters. Do you offer fleet pricing and service contracts?", False),
    ], 40, "Pablo")
    conv(1, "E-1002", "whatsapp", "Order #1002 status", "Status inquiry", "Resolved", None, False, "FR", [
        (5600, CUSTOMERS[1]["name"], "Bonjour, où en est ma commande #1002?", False),
        (5500, "Automation", "Bonjour Mme Dubois — votre VMAX VX4 ST est en cours d'acheminement vers notre entrepôt. Expédition prévue sous 10 jours ouvrables.", True),
    ], 98)
    conv(7, "E-1008", "email", "Thanks!", "Other", "Resolved", None, False, "EN", [
        (2000, CUSTOMERS[7]["name"], "Helmets arrived quickly, great service. Thanks!", False),
    ], 97)
    # duplicate-contact warning example
    convs[0]["duplicate_warning"] = "A WhatsApp reply was sent 2 hours ago. Review before sending another response."
    data["conversations"] = convs

    # ---------------- FULFILLMENT ----------------
    stages_map = {"Awaiting stock": "Awaiting stock", "Ready to allocate": "Ready to allocate", "Allocated": "Allocated", "Picking": "Picking", "Packed": "Packed", "Fulfilled": "Fulfilled"}
    fulfill = []
    for o in orders:
        if o["payment_status"] in ("Cancelled", "Refunded"):
            continue
        stage = o["fulfillment_stage"]
        if "Delivery exception" in o["exceptions"]:
            stage = "Delivery exception"
        elif stage == "Fulfilled" and o["delivery_method"] == "Pickup":
            stage = "Carrier handoff / ready for pickup"
        it = o["items"][0]
        fulfill.append({
            "id": _id(), "order_id": o["id"], "customer": o["customer"]["name"],
            "sku": it["sku"], "product": it["name"], "qty": it["qty"],
            "paid_at": o["paid_at"], "stage": stage,
            "delivery_method": o["delivery_method"],
            "address_valid": "Delivery exception" not in o["exceptions"],
            "serial": f"SN-{o['id'][-4:]}-{it['sku'][:4]}" if stage in ("Allocated", "Picking", "Packed", "Fulfilled") else None,
            "tracking": o["tracking"], "planzer_service": "Planzer Paket" if o["delivery_method"] == "Shipping" else None,
            "notification_state": "Sent" if o["tracking"] else ("Scheduled" if stage == "Packed" else "Not sent"),
            "operator": "Pablo" if stage in ("Picking", "Packed") else None,
            "notes": "Address incomplete — apartment missing" if "Delivery exception" in o["exceptions"] else None,
            "updated_at": iso(now - timedelta(hours=abs(hash(o["id"])) % 40 + 1)),
        })
    data["fulfillments"] = fulfill

    # ---------------- INVENTORY ----------------
    inv_specs = [
        ("VX2-PRO-GT", 2, 6, 12, iso(now + timedelta(days=9)), "E-1001", 8, "Shortage", "6 paid orders waiting; inbound covers demand in 9 days"),
        ("VX4-ST", 0, 3, 10, iso(now + timedelta(days=14)), "E-1002", 5, "Critical shortage", "Negative ATP; inbound ETA not confirmed by supplier"),
        ("NB-MAX-G2", 5, 3, 0, None, "E-1003", 4, "OK", "Coverage 21 days at current velocity"),
        ("ER-CARGO-1", 0, 2, 4, iso(now + timedelta(days=21)), "E-1004", 2, "Critical shortage", "Oldest waiting order 31 business days"),
        ("AP-CITY-PRO", 3, 2, 0, None, "E-1005", 3, "At risk", "Below reorder point; create purchase order"),
        ("NIU-KQI3-MAX", 8, 1, 0, None, "E-1006", 4, "OK", "Healthy coverage"),
        ("HELM-ABUS-M", 24, 2, 0, None, None, 10, "OK", "Healthy coverage"),
        ("LOCK-KRYP-U", 14, 0, 0, None, None, 6, "OK", "Healthy coverage"),
        ("TIRE-10X3", 2, 0, 50, iso(now + timedelta(days=5)), None, 10, "At risk", "Inbound confirmed; low current stock"),
    ]
    inventory = []
    for (sku, on_hand, committed, inbound, eta, oldest, rop, risk, rec) in inv_specs:
        p = next(x for x in PRODUCTS if x["sku"] == sku)
        atp = on_hand - committed
        inventory.append({
            "id": _id(), "sku": sku, "product": p["name"], "variant": p["variant"],
            "on_hand": on_hand, "committed": committed, "atp": atp,
            "quality_hold": 0, "awaiting_allocation": committed if atp < 0 else 0,
            "inbound_qty": inbound, "inbound_eta": eta, "inbound_confidence": "Confirmed" if sku in ("VX2-PRO-GT", "TIRE-10X3") else ("Unconfirmed" if inbound else None),
            "projected_available": atp + inbound,
            "oldest_waiting_order": oldest, "reorder_point": rop,
            "risk": risk, "recommendation": rec,
            "velocity_per_week": round(committed * 0.8 + 1, 1),
            "events": [{"id": _id(), "ts": iso(now - timedelta(days=3)), "summary": f"Cycle count confirmed {on_hand} on hand", "actor": "Fulfillment"}],
        })
    data["inventory"] = inventory

    # ---------------- RETURNS ----------------
    returns = [
        {"id": "RMA-2031", "order_id": "E-1022", "customer": CUSTOMERS[12], "product": "VMAX VX2 Pro GT", "serial": "VX2-2025-08812",
         "type": "Warranty", "problem": "Display error E-07, motor cutout under load", "state": "Under review",
         "evidence": ["video_error_e07.mp4", "photo_display.jpg"], "warranty_eligible_facts": "Purchased 4 months ago; within 24-month warranty; no visible water damage in video",
         "policy_version": "WPOL-2026-02", "inspection": "Technician review scheduled 12.06.2026", "supplier_claim": None,
         "proposed_resolution": "Controller replacement under warranty", "approved_resolution": None, "liability_decision": None,
         "financial_impact": "CHF 0.00 customer / est. CHF 145.00 parts", "age_days": 6,
         "created_at": iso(now - timedelta(days=6)),
         "timeline": [
            {"id": _id(), "ts": iso(now - timedelta(days=6)), "actor": "Support", "summary": "RMA created from email conversation"},
            {"id": _id(), "ts": iso(now - timedelta(days=5)), "actor": "Automation", "summary": "Evidence request sent (DE) — video received"},
            {"id": _id(), "ts": iso(now - timedelta(days=2)), "actor": "Pablo", "summary": "Moved to Under review; inspection scheduled"},
         ]},
        {"id": "RMA-2032", "order_id": "E-1015", "customer": CUSTOMERS[14], "product": "Kryptonite U-Lock", "serial": None,
         "type": "Return", "problem": "Ordered wrong size, unopened", "state": "Awaiting physical item",
         "evidence": ["photo_unopened.jpg"], "warranty_eligible_facts": "14-day return window; item unused",
         "policy_version": "RPOL-2026-01", "inspection": None, "supplier_claim": None,
         "proposed_resolution": "Full refund on receipt", "approved_resolution": "Full refund on receipt", "liability_decision": "Customer remorse — standard return",
         "financial_impact": "CHF -45.00 refund", "age_days": 3,
         "created_at": iso(now - timedelta(days=3)),
         "timeline": [
            {"id": _id(), "ts": iso(now - timedelta(days=3)), "actor": "Support", "summary": "RMA created; return label sent"},
         ]},
        {"id": "RMA-2029", "order_id": "E-1024", "customer": CUSTOMERS[1], "product": "ABUS Urban Helmet", "serial": None,
         "type": "Warranty", "problem": "Strap buckle broke after two weeks", "state": "Refund approval",
         "evidence": ["photo_buckle.jpg"], "warranty_eligible_facts": "Manufacturing defect visible; within warranty",
         "policy_version": "WPOL-2026-02", "inspection": "Photo review complete — defect confirmed", "supplier_claim": "Claim ABUS-CH #4471 opened",
         "proposed_resolution": "Partial refund CHF 89.00", "approved_resolution": None, "liability_decision": "Manufacturer defect",
         "financial_impact": "CHF -89.00 refund, recoverable via supplier claim", "age_days": 12,
         "created_at": iso(now - timedelta(days=12)),
         "timeline": [
            {"id": _id(), "ts": iso(now - timedelta(days=12)), "actor": "Support", "summary": "RMA created"},
            {"id": _id(), "ts": iso(now - timedelta(days=8)), "actor": "Pablo", "summary": "Defect confirmed from photos; supplier claim opened"},
            {"id": _id(), "ts": iso(now - timedelta(days=1)), "actor": "Automation", "summary": "Refund approval requested — awaiting owner decision"},
         ]},
        {"id": "RMA-2027", "order_id": "E-1008", "customer": CUSTOMERS[7], "product": "Segway Ninebot Max G2", "serial": "NB-2025-11930",
         "type": "Warranty", "problem": "Rattling noise from front fork", "state": "Resolved",
         "evidence": ["video_noise.mp4"], "warranty_eligible_facts": "Within warranty; wear part excluded review passed",
         "policy_version": "WPOL-2026-02", "inspection": "Fork bolt loose — retightened and tested", "supplier_claim": None,
         "proposed_resolution": "Repair at workshop", "approved_resolution": "Repair completed 02.06.2026", "liability_decision": "Covered — assembly issue",
         "financial_impact": "CHF 0.00", "age_days": 18,
         "created_at": iso(now - timedelta(days=18)),
         "timeline": [
            {"id": _id(), "ts": iso(now - timedelta(days=18)), "actor": "Support", "summary": "RMA created"},
            {"id": _id(), "ts": iso(now - timedelta(days=4)), "actor": "Pablo", "summary": "Repair completed; customer picked up"},
         ]},
    ]
    data["returns"] = returns

    # ---------------- APPOINTMENTS ----------------
    def appt(hours_from_now, typ, cust_i, order_id, product, payment_due, readiness, confirm, status):
        c = CUSTOMERS[cust_i]
        return {"id": _id(), "time": iso(now + timedelta(hours=hours_from_now)), "type": typ,
                "customer": c["name"], "phone": c["phone"], "order_id": order_id, "product": product,
                "location": "E-RYDEZ Showroom, Badenerstrasse 41, Zürich",
                "payment_due": payment_due, "readiness": readiness,
                "confirmation_state": confirm, "reminder_state": "Scheduled" if hours_from_now > 4 else "Sent",
                "status": status}
    appts = [
        appt(2, "Customer pickup", 11, "E-1012", "Apollo City Pro", None, "Ready", "Confirmed", "Upcoming"),
        appt(5, "Warranty inspection", 12, "E-1022", "VMAX VX2 Pro GT", None, "Item on site", "Confirmed", "Upcoming"),
        appt(26, "Customer pickup", 3, "E-1025", "Segway Ninebot Max G2", "CHF 899.00 due at pickup", "Not ready — awaiting stock", "Reminder pending", "Upcoming"),
        appt(30, "Return handoff", 14, "RMA-2032", "Kryptonite U-Lock", None, "Ready", "Confirmed", "Upcoming"),
        appt(50, "Local delivery", 0, "E-1016", "Spare Tire 10x3", None, "Ready", "Unconfirmed", "Upcoming"),
        appt(-20, "Customer pickup", 4, "E-1018", "ABUS Urban Helmet", None, "Ready", "Confirmed", "Completed"),
        appt(-45, "Warranty inspection", 7, "RMA-2027", "Segway Ninebot Max G2", None, "Ready", "Confirmed", "Completed"),
    ]
    data["appointments"] = appts

    # ---------------- AUTOMATIONS ----------------
    autos = [
        {"id": _id(), "name": "Proactive delay updates", "purpose": "Send status message to unfulfilled paid orders at 8/14/21 business days", "status": "Active",
         "trigger": "Daily 08:00 Europe/Zurich", "next_run": iso(now + timedelta(hours=16)), "last_result": "9 evaluated, 4 sent, 1 failed",
         "success_count": 312, "failure_count": 6, "approval_policy": "Low risk — automatic (verified facts only)", "owner": "Pablo"},
        {"id": _id(), "name": "Inbound message triage", "purpose": "Classify category/language and link customer/order matches", "status": "Active",
         "trigger": "On message received", "next_run": None, "last_result": "Linked 96% automatically this week",
         "success_count": 1841, "failure_count": 23, "approval_policy": "Automatic linking above 90% confidence", "owner": "Pablo"},
        {"id": _id(), "name": "Tracking notification", "purpose": "Send tracking link when fulfillment completes", "status": "Active",
         "trigger": "On fulfillment created", "next_run": None, "last_result": "Sent for #1008 · 41 min ago",
         "success_count": 208, "failure_count": 1, "approval_policy": "Low risk — automatic", "owner": "Pablo"},
        {"id": _id(), "name": "Pickup readiness reminders", "purpose": "Remind customers 24h before appointment; warn if stock not ready", "status": "Degraded",
         "trigger": "Hourly", "next_run": iso(now + timedelta(minutes=34)), "last_result": "Calendar API delayed — retries scheduled",
         "success_count": 87, "failure_count": 4, "approval_policy": "Low risk — automatic", "owner": "Pablo"},
        {"id": _id(), "name": "Refund request detection", "purpose": "Detect refund/cancellation intent and create approval request", "status": "Active",
         "trigger": "On message classified", "next_run": None, "last_result": "Approval created for #1014 · 3 h ago",
         "success_count": 42, "failure_count": 0, "approval_policy": "High risk — owner approval required", "owner": "Pablo"},
        {"id": _id(), "name": "Review request after delivery", "purpose": "Ask for a review 7 days after confirmed delivery", "status": "Paused",
         "trigger": "Daily 10:00", "next_run": None, "last_result": "Paused by Pablo on 02.06.2026",
         "success_count": 156, "failure_count": 2, "approval_policy": "Low risk — automatic", "owner": "Pablo"},
    ]
    data["automations"] = autos

    runs = [
        {"id": _id(), "automation": "Proactive delay updates", "automation_id": autos[0]["id"], "ts": iso(now - timedelta(hours=4)), "result": "Failed",
         "trigger_event": "Scheduled run 08:00 — order E-1027 matched rule: 28 business days unfulfilled",
         "inputs": {"order": "E-1027", "age": "28 business days", "last_contact": "4 days ago", "data_freshness": "Shopify synced 2 min before run"},
         "conditions": ["Order paid: yes", "Fulfilled: no", "Cancelled/refunded: no", "Suppressed: no", "Contacted in last 5 days: no"],
         "decision_path": "Age ≥ 21d and no recent contact → send escalation template (DE)",
         "actions": ["Render template delay_update_v3 (DE)", "Send via Gmail API"],
         "external_ids": [], "errors": "Gmail API error 429: rate limit exceeded. Message NOT delivered. Retry scheduled 12:00.",
         "retries": 2, "records": ["Work item created: Failed automation — delay update"]},
        {"id": _id(), "automation": "Proactive delay updates", "automation_id": autos[0]["id"], "ts": iso(now - timedelta(hours=4, minutes=2)), "result": "Success",
         "trigger_event": "Scheduled run 08:00 — order E-1002 matched rule",
         "inputs": {"order": "E-1002", "age": "22 business days", "last_contact": "8 days ago", "data_freshness": "Shopify synced 2 min before run"},
         "conditions": ["Order paid: yes", "Fulfilled: no", "Suppressed: no"],
         "decision_path": "Age ≥ 21d → escalation template (FR)",
         "actions": ["Render template delay_update_v3 (FR)", "Send via Gmail API"],
         "external_ids": ["gmail:gm-99120"], "errors": None, "retries": 0,
         "records": ["Timeline event on E-1002"]},
        {"id": _id(), "automation": "Refund request detection", "automation_id": autos[4]["id"], "ts": iso(now - timedelta(hours=3)), "result": "Success",
         "trigger_event": "Message classified as Cancellation (FR) on conversation of E-1014",
         "inputs": {"order": "E-1014", "classification_confidence": "99%", "match_confidence": "99%"},
         "conditions": ["Refund intent detected: yes", "Order paid: yes", "High-risk policy: owner approval"],
         "decision_path": "Refund intent → create approval request, block automatic reply",
         "actions": ["Create approval request", "Create work item"],
         "external_ids": [], "errors": None, "retries": 0,
         "records": ["Approval APR-118 created"]},
        {"id": _id(), "automation": "Tracking notification", "automation_id": autos[2]["id"], "ts": iso(now - timedelta(minutes=41)), "result": "Success",
         "trigger_event": "Fulfillment completed for E-1008",
         "inputs": {"order": "E-1008", "tracking": "99.00.123456.78901234"},
         "conditions": ["Tracking present: yes", "Notification not already sent: yes"],
         "decision_path": "Send tracking template (EN)",
         "actions": ["Send via Gmail API"], "external_ids": ["gmail:gm-99184"], "errors": None, "retries": 0,
         "records": ["Timeline event on E-1008"]},
        {"id": _id(), "automation": "Inbound message triage", "automation_id": autos[1]["id"], "ts": iso(now - timedelta(hours=2)), "result": "Success",
         "trigger_event": "Email received from ben.richards@proton.me",
         "inputs": {"match_confidence": "40%", "classification": "B2B (88%)"},
         "conditions": ["Match confidence ≥ 90%: no"],
         "decision_path": "Low confidence → route to Unlinked queue, no auto-reply",
         "actions": ["Queue conversation as Unlinked"], "external_ids": [], "errors": None, "retries": 0,
         "records": ["Conversation queued"]},
    ]
    data["automation_runs"] = runs

    # ---------------- APPROVALS ----------------
    approvals = [
        {"id": "APR-118", "risk": "High", "state": "Pending",
         "proposed_action": "Refund CHF 859.00 and cancel order E-1014",
         "affected": "Isabelle Favre · Order E-1014 · VMAX VX2 Pro GT",
         "reason": "Customer requested cancellation after 25 business days unfulfilled; within policy for full refund",
         "facts": ["25 business days unfulfilled", "No stock allocation", "Inbound ETA unconfirmed", "Customer contacted twice (FR)"],
         "impact": "CHF -859.00 revenue; customer retention risk if rejected",
         "draft": "Bonjour Mme Favre, nous confirmons l'annulation de votre commande #1014 et le remboursement intégral de CHF 859.00 sous 3–5 jours ouvrables. Veuillez nous excuser pour l'attente.",
         "requested_by": "Automation — Refund request detection", "requested_at": iso(now - timedelta(hours=3)),
         "decision": None, "decision_reason": None, "order_id": "E-1014"},
        {"id": "APR-117", "risk": "High", "state": "Pending",
         "proposed_action": "Refund CHF 89.00 for RMA-2029 (defective helmet)",
         "affected": "Claire Dubois · Order E-1024 · ABUS Urban Helmet",
         "reason": "Manufacturing defect confirmed by photo inspection; supplier claim opened",
         "facts": ["Defect confirmed", "Supplier claim ABUS-CH #4471 open", "Within warranty period"],
         "impact": "CHF -89.00 refund, recoverable via supplier claim",
         "draft": "Bonjour Mme Dubois, le défaut est confirmé. Nous remboursons CHF 89.00 sur votre moyen de paiement d'origine sous 3–5 jours ouvrables.",
         "requested_by": "Pablo (manual)", "requested_at": iso(now - timedelta(days=1)),
         "decision": None, "decision_reason": None, "order_id": "E-1024"},
        {"id": "APR-116", "risk": "Medium", "state": "Pending",
         "proposed_action": "Send non-standard message: offer alternative model to Anna Keller",
         "affected": "Anna Keller · Order E-1004 · E-RYDEZ Cargo One",
         "reason": "31 business days unfulfilled; inbound ETA 3 weeks; retention at risk",
         "facts": ["31 business days unfulfilled", "Inbound ETA 21 days unconfirmed", "Customer contacted 3 times", "Alternative in stock: Apollo City Pro"],
         "impact": "Possible CHF -900.00 price adjustment if customer accepts alternative",
         "draft": "Guten Tag Frau Keller, als Alternative können wir Ihnen den Apollo City Pro sofort liefern — oder Sie erhalten CHF 100.00 Gutschrift bei Wartezeit bis KW 27. Was ist Ihnen lieber?",
         "requested_by": "Pablo (manual)", "requested_at": iso(now - timedelta(hours=20)),
         "decision": None, "decision_reason": None, "order_id": "E-1004"},
        {"id": "APR-114", "risk": "Low", "state": "Approved",
         "proposed_action": "Send routine delay update to E-1019 (DE)",
         "affected": "David Brunner · Order E-1019",
         "reason": "16 business days unfulfilled; verified facts only", "facts": ["16 business days", "Inbound confirmed 9 days"],
         "impact": "None — informational", "draft": "Guten Tag Herr Brunner, Ihr Segway Ninebot Max G2 trifft in ca. 9 Tagen bei uns ein…",
         "requested_by": "Automation — Proactive delay updates", "requested_at": iso(now - timedelta(days=1, hours=4)),
         "decision": "Approved by Pablo", "decision_reason": None, "order_id": "E-1019"},
        {"id": "APR-112", "risk": "Critical", "state": "Rejected",
         "proposed_action": "Bulk-correct 14 inventory records from cycle count import",
         "affected": "14 SKUs",
         "reason": "Cycle count import proposed large negative corrections",
         "facts": ["Import source: manual CSV", "3 SKUs would go negative"],
         "impact": "Inventory accuracy risk; could block fulfillment",
         "draft": None,
         "requested_by": "System administrator import", "requested_at": iso(now - timedelta(days=2)),
         "decision": "Rejected by Pablo", "decision_reason": "CSV had wrong warehouse column mapping — re-import required", "order_id": None},
    ]
    data["approvals"] = approvals

    # ---------------- INTEGRATIONS ----------------
    integrations = [
        {"id": _id(), "name": "Shopify", "status": "Healthy", "last_event": iso(now - timedelta(minutes=2)), "detail": "Orders and fulfillment webhooks active"},
        {"id": _id(), "name": "Gmail", "status": "Delayed", "last_event": iso(now - timedelta(minutes=18)), "detail": "Rate limit at 08:00 run — retries scheduled 12:00"},
        {"id": _id(), "name": "WhatsApp Business", "status": "Healthy", "last_event": iso(now - timedelta(minutes=7)), "detail": "Session active"},
        {"id": _id(), "name": "Planzer", "status": "Healthy", "last_event": iso(now - timedelta(minutes=31)), "detail": "Tracking events streaming"},
        {"id": _id(), "name": "Google Calendar", "status": "Delayed", "last_event": iso(now - timedelta(minutes=52)), "detail": "API latency elevated — reminder sends retried"},
    ]
    data["integrations"] = integrations

    # ---------------- NOTIFICATIONS ----------------
    notifications = [
        {"id": _id(), "priority": "Critical", "ts": iso(now - timedelta(hours=4)), "title": "Automation failed: delay update for E-1027", "detail": "Gmail rate limit — retry scheduled 12:00", "link": "/work?view=failed-automation", "read": False},
        {"id": _id(), "priority": "High", "ts": iso(now - timedelta(hours=5)), "title": "Customer waiting beyond SLA — E-1014", "detail": "Refund request unanswered for 3 hours", "link": "/orders/E-1014", "read": False},
        {"id": _id(), "priority": "High", "ts": iso(now - timedelta(hours=6)), "title": "Delivery exception — E-1016", "detail": "Planzer: address incomplete, parcel held", "link": "/orders/E-1016", "read": False},
        {"id": _id(), "priority": "Normal", "ts": iso(now - timedelta(hours=3)), "title": "Approval requested: APR-118", "detail": "Refund CHF 859.00 for order E-1014", "link": "/automations?tab=approvals", "read": False},
        {"id": _id(), "priority": "Normal", "ts": iso(now - timedelta(hours=8)), "title": "Pickup today 14:00 — Laura Steiner", "detail": "Apollo City Pro ready at showroom", "link": "/appointments", "read": True},
        {"id": _id(), "priority": "Informational", "ts": iso(now - timedelta(hours=10)), "title": "Daily exception digest ready", "detail": "12 items need action; 1 failed automation", "link": "/reports", "read": True},
    ]
    data["notifications"] = notifications

    # ---------------- PURCHASING ----------------
    suppliers = [
        {"id": _id(), "name": "VMAX Mobility GmbH", "location": "Hamburg, DE", "lead_time": "4–6 weeks", "open_pos": 2, "reliability": "82% on-time"},
        {"id": _id(), "name": "Segway Distribution CH", "location": "Zug, CH", "lead_time": "1–2 weeks", "open_pos": 0, "reliability": "96% on-time"},
        {"id": _id(), "name": "Apollo Scooters EU", "location": "Rotterdam, NL", "lead_time": "3–4 weeks", "open_pos": 1, "reliability": "88% on-time"},
    ]
    pos = [
        {"id": "PO-3021", "supplier": "VMAX Mobility GmbH", "items": "12× VX2-PRO-GT, 10× VX4-ST", "value": "CHF 14,820.00", "state": "In transit",
         "eta": iso(now + timedelta(days=9)), "eta_confidence": "Confirmed", "deposit": "Paid 30%", "milestones": ["Ordered 12.05.2026", "Production complete 28.05.2026", "Shipped 03.06.2026", "ETA 19.06.2026"]},
        {"id": "PO-3022", "supplier": "VMAX Mobility GmbH", "items": "4× ER-CARGO-1", "value": "CHF 6,480.00", "state": "In production",
         "eta": iso(now + timedelta(days=21)), "eta_confidence": "Unconfirmed", "deposit": "Paid 30%", "milestones": ["Ordered 20.05.2026", "Production started 26.05.2026"]},
        {"id": "PO-3023", "supplier": "Apollo Scooters EU", "items": "50× TIRE-10X3", "value": "CHF 1,150.00", "state": "In transit",
         "eta": iso(now + timedelta(days=5)), "eta_confidence": "Confirmed", "deposit": "Paid 100%", "milestones": ["Ordered 30.05.2026", "Shipped 06.06.2026"]},
        {"id": "PO-3019", "supplier": "Segway Distribution CH", "items": "8× NB-MAX-G2", "value": "CHF 5,120.00", "state": "Received",
         "eta": None, "eta_confidence": None, "deposit": "Paid on receipt", "milestones": ["Ordered 05.05.2026", "Received 14.05.2026"]},
    ]
    data["suppliers"] = suppliers
    data["purchase_orders"] = pos

    data["meta"] = [{"id": "seed", "seeded_at": iso(now), "version": 1}]
    return data
