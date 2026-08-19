from __future__ import annotations

import asyncio
import logging
import os
import re
import uuid
from collections import Counter, defaultdict
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

from dotenv import load_dotenv
from fastapi import APIRouter, Body, FastAPI, HTTPException, Query
from motor.motor_asyncio import AsyncIOMotorClient
from pymongo import ASCENDING, DESCENDING, IndexModel
from pymongo.errors import PyMongoError
from starlette.middleware.cors import CORSMiddleware

from shopify import (
    ShopifyAPIError,
    ShopifyClient,
    ShopifyConfigurationError,
    connection_details,
    fetch_shopify_snapshot,
    now_iso,
    verify_connection,
)

ROOT_DIR = Path(__file__).parent
load_dotenv(ROOT_DIR / ".env")

mongo_url = os.environ["MONGO_URL"]
client = AsyncIOMotorClient(mongo_url)
db = client[os.environ["DB_NAME"]]

app = FastAPI(title="E-RYDEZ Operations Console API", version="2.0.0")
api = APIRouter(prefix="/api")
logger = logging.getLogger(__name__)

NO_ID = {"_id": 0}
SCHEMA_VERSION = 2
CANONICAL_COLLECTIONS = (
    "shop",
    "orders",
    "products",
    "variants",
    "inventory_items",
    "customers",
    "fulfillments",
    "refunds",
    "returns",
)
MOCK_ONLY_COLLECTIONS = (
    "appointments",
    "approvals",
    "automation_runs",
    "automations",
    "conversations",
    "fulfillments_legacy",
    "integrations",
    "inventory",
    "notifications",
    "purchase_orders",
    "suppliers",
    "work_items",
)
INTEGRATION_CONNECTIONS = "integration_connections"
INTEGRATION_HEALTH = "integration_health_snapshots"
INTEGRATION_AUDIT = "integration_audit_events"
LOCAL_OPERATOR_LABEL = os.environ.get("ERYDEZ_LOCAL_OPERATOR_LABEL", "Local operator").strip() or "Local operator"
_sync_lock = asyncio.Lock()


def parse_datetime(value: str | None) -> datetime | None:
    if not value:
        return None
    try:
        return datetime.fromisoformat(value.replace("Z", "+00:00"))
    except (TypeError, ValueError):
        return None


def business_day_age(value: str | None) -> int:
    start = parse_datetime(value)
    if not start:
        return 0
    today = datetime.now(timezone.utc).date()
    day = start.date()
    count = 0
    while day < today:
        day = day.fromordinal(day.toordinal() + 1)
        if day.weekday() < 5:
            count += 1
    return count


def order_with_derived(order: dict[str, Any]) -> dict[str, Any]:
    result = dict(order)
    result["business_day_age"] = business_day_age(order.get("processed_at") or order.get("created_at"))
    result["customer_name"] = ((order.get("customer") or {}).get("display_name") or "Guest")
    result["city"] = ((order.get("shipping_address") or {}).get("city") or (order.get("billing_address") or {}).get("city"))
    return result


def money_amount(value: dict[str, Any] | None) -> float:
    try:
        return float((value or {}).get("amount") or 0)
    except (TypeError, ValueError):
        return 0.0


def integration_now() -> str:
    return datetime.now(timezone.utc).isoformat().replace("+00:00", "Z")


def local_operator_label() -> str:
    """Return the safe attribution label for the person using this local console."""
    return LOCAL_OPERATOR_LABEL


def public_connection(connection: dict[str, Any]) -> dict[str, Any]:
    return {
        "id": connection["id"],
        "provider": connection["provider"],
        "environment": connection["environment"],
        "display_identity": connection.get("display_identity"),
        "lifecycle_state": connection.get("lifecycle_state"),
        "desired_state": connection.get("desired_state"),
        "capabilities": connection.get("capabilities") or [],
        "business_owner": connection.get("business_owner"),
        "recovery_owner": connection.get("recovery_owner"),
        "created_at": connection.get("created_at"),
        "updated_at": connection.get("updated_at"),
        "last_action_reason": connection.get("last_action_reason"),
    }


def public_audit_timeline_item(event: dict[str, Any], connection: dict[str, Any] | None) -> dict[str, Any]:
    """Expose only safe operational evidence for the read-only audit timeline."""
    return {
        "id": event["id"],
        "connection_id": event["connection_id"],
        "provider": (connection or {}).get("provider") or "unknown",
        "display_identity": (connection or {}).get("display_identity"),
        "actor": event.get("actor") or LOCAL_OPERATOR_LABEL,
        "action": event.get("action"),
        "reason": event.get("reason"),
        "prior_state": event.get("prior_state"),
        "next_state": event.get("next_state"),
        "outcome": event.get("outcome"),
        "created_at": event.get("created_at"),
    }


def safe_provider_error_summary(value: Any) -> str | None:
    """Return a bounded diagnostic summary without token-like values."""
    if not value:
        return None
    summary = str(value).strip()
    summary = re.sub(r"\b(?:shpss|shpat)_[A-Za-z0-9_-]+\b", "[redacted]", summary)
    summary = re.sub(
        r"(?i)\b(client[ _-]?secret|access[ _-]?token|refresh[ _-]?token|authorization)\s*[:=]\s*\S+",
        r"\1=[redacted]",
        summary,
    )
    return summary[:300] or None


def public_sync_run_ledger_item(run: dict[str, Any]) -> dict[str, Any]:
    """Expose Shopify run metadata only; snapshots and provider payloads remain private."""
    started_at = run.get("started_at")
    completed_at = run.get("completed_at") or run.get("failed_at")
    started = parse_datetime(started_at)
    completed = parse_datetime(completed_at)
    duration_seconds = round((completed - started).total_seconds(), 3) if started and completed else None
    return {
        "id": f"shopify-sync:{run['id']}",
        "provider": "shopify",
        "kind": "run",
        "operation": run.get("mode") or "snapshot",
        "status": run.get("status") or "unknown",
        "occurred_at": started_at,
        "completed_at": completed_at,
        "duration_seconds": duration_seconds,
        "correlation_id": run["id"],
        "counts": run.get("counts") or run.get("fetched_counts") or {},
        "error_summary": safe_provider_error_summary(run.get("error")),
    }


def public_integration_ledger_item(event: dict[str, Any], connection: dict[str, Any] | None) -> dict[str, Any]:
    """Normalize safe console control evidence into the provider ledger shape."""
    return {
        "id": f"integration-audit:{event['id']}",
        "provider": (connection or {}).get("provider") or "unknown",
        "kind": "control_action",
        "operation": event.get("action"),
        "status": event.get("outcome") or "recorded",
        "occurred_at": event.get("created_at"),
        "completed_at": event.get("created_at"),
        "duration_seconds": 0,
        "correlation_id": event.get("connection_id"),
        "actor": event.get("actor") or LOCAL_OPERATOR_LABEL,
        "reason": event.get("reason"),
        "prior_state": event.get("prior_state"),
        "next_state": event.get("next_state"),
    }


def connection_health(connection: dict[str, Any]) -> dict[str, Any]:
    lifecycle = connection.get("lifecycle_state") or "setup_required"
    owner_ready = bool((connection.get("business_owner") or {}).get("display_name"))
    recovery_ready = bool((connection.get("recovery_owner") or {}).get("display_name"))
    gmail_data_plane = connection.get("provider") == "gmail" and "oauth_authorization" in (connection.get("capabilities") or [])
    dimensions = {
        "configuration": {
            "status": "healthy" if owner_ready else "degraded",
            "detail": "Business owner assigned" if owner_ready else "Assign a business owner before provider activation.",
        },
        "authorization": {
            "status": "connected" if gmail_data_plane and lifecycle == "active" else "not_configured",
            "detail": "Google OAuth authorization is active; encrypted refresh credentials are retained locally." if gmail_data_plane and lifecycle == "active" else "Connect a Gmail account through the Google OAuth consent flow.",
        },
        "receiver": {
            "status": "on_demand" if gmail_data_plane else "not_configured",
            "detail": "Threads are retrieved on demand through the Gmail API." if gmail_data_plane else "The Gmail data plane is not connected.",
        },
        "subscription": {
            "status": "not_configured",
            "detail": "Gmail push watch and Pub/Sub delivery are not enabled; the console refreshes on demand.",
        },
        "reconciliation": {
            "status": "on_demand" if gmail_data_plane else "not_configured",
            "detail": "Conversation data is reconciled against the Gmail API when the operator refreshes the inbox." if gmail_data_plane else "No Gmail data is available for reconciliation.",
        },
        "recovery_owner": {
            "status": "healthy" if recovery_ready else "pending",
            "detail": "Recovery owner assigned" if recovery_ready else "Recovery owner can be assigned later.",
        },
    }
    if lifecycle == "active" and gmail_data_plane:
        status, next_action = "healthy", "Gmail threads can be refreshed on demand; review any AI draft before sending."
    elif lifecycle == "paused":
        status, next_action = "paused", "Resume only when the local operator confirms the intended state."
    elif lifecycle == "disconnect_pending":
        status, next_action = "disconnect_pending", "Review provider dependencies and retention before completing a disconnect."
    elif lifecycle == "disconnected":
        status, next_action = "disconnected", "Connect a Gmail account before using inbox features."
    elif lifecycle == "reauthorization_required":
        status, next_action = "reauthorization_required", "Re-connect the Gmail account through the Google OAuth consent flow."
    else:
        status, next_action = "setup_required", "Configure Google OAuth and connect a Gmail account before using inbox features."
    return {
        "connection_id": connection["id"],
        "checked_at": integration_now(),
        "overall_status": status,
        "dimensions": dimensions,
        "next_action": next_action,
        "scope_note": "Gmail OAuth credentials are encrypted at rest. Gmail threads are retrieved on demand; no Gmail watch or background synchronization is enabled.",
    }


async def append_integration_audit(
    connection_id: str,
    actor: str,
    action: str,
    reason: str,
    prior_state: str | None,
    next_state: str | None,
    outcome: str = "recorded",
) -> dict[str, Any]:
    event = {
        "id": str(uuid.uuid4()),
        "connection_id": connection_id,
        "actor": actor,
        "action": action,
        "reason": reason,
        "prior_state": prior_state,
        "next_state": next_state,
        "outcome": outcome,
        "created_at": integration_now(),
    }
    await db[INTEGRATION_AUDIT].insert_one(event)
    return {key: value for key, value in event.items() if key != "_id"}


async def integration_connection_or_404(connection_id: str) -> dict[str, Any]:
    connection = await db[INTEGRATION_CONNECTIONS].find_one({"id": connection_id}, NO_ID)
    if not connection:
        raise HTTPException(status_code=404, detail="Integration connection not found")
    return connection


async def active_sync_document() -> dict[str, Any] | None:
    return await db.meta.find_one({"id": "shopify_sync"}, NO_ID)


async def active_sync_id(required: bool = True) -> str | None:
    meta = await active_sync_document()
    value = (meta or {}).get("active_sync_id")
    if required and not value:
        raise HTTPException(status_code=503, detail="No successful Shopify snapshot is active")
    return value


async def ensure_indexes() -> None:
    partial = {
        "partialFilterExpression": {
            "sync_id": {"$type": "string"},
            "shopify_id": {"$type": "string"},
        }
    }
    for collection_name in CANONICAL_COLLECTIONS:
        await db[collection_name].create_indexes(
            [
                IndexModel([("sync_id", ASCENDING)], name="sync_id"),
                IndexModel(
                    [("sync_id", ASCENDING), ("shopify_id", ASCENDING)],
                    name="sync_shopify_unique",
                    unique=True,
                    **partial,
                ),
            ]
        )
    await db.orders.create_indexes(
        [
            IndexModel([("sync_id", ASCENDING), ("processed_at", DESCENDING)], name="orders_processed"),
            IndexModel([("sync_id", ASCENDING), ("financial_status", ASCENDING)], name="orders_financial"),
            IndexModel([("sync_id", ASCENDING), ("fulfillment_status", ASCENDING)], name="orders_fulfillment"),
            IndexModel([("sync_id", ASCENDING), ("customer.shopify_id", ASCENDING)], name="orders_customer"),
        ]
    )
    await db.products.create_indexes(
        [
            IndexModel([("sync_id", ASCENDING), ("status", ASCENDING)], name="products_status"),
            IndexModel([("sync_id", ASCENDING), ("title", ASCENDING)], name="products_title"),
        ]
    )
    await db.variants.create_indexes(
        [
            IndexModel([("sync_id", ASCENDING), ("shopify_product_id", ASCENDING)], name="variants_product"),
            IndexModel([("sync_id", ASCENDING), ("sku", ASCENDING)], name="variants_sku"),
        ]
    )
    await db.inventory_items.create_indexes(
        [
            IndexModel([("sync_id", ASCENDING), ("shopify_variant_id", ASCENDING)], name="inventory_variant"),
            IndexModel([("sync_id", ASCENDING), ("sku", ASCENDING)], name="inventory_sku"),
        ]
    )
    await db.customers.create_indexes(
        [
            IndexModel([("sync_id", ASCENDING), ("updated_at", DESCENDING)], name="customers_updated"),
            IndexModel([("sync_id", ASCENDING), ("email", ASCENDING)], name="customers_email"),
        ]
    )
    await db.sync_runs.create_indexes(
        [
            IndexModel([("started_at", DESCENDING)], name="sync_runs_started"),
            IndexModel([("status", ASCENDING)], name="sync_runs_status"),
        ]
    )
    await db[INTEGRATION_CONNECTIONS].create_indexes(
        [
            IndexModel([("provider", ASCENDING), ("environment", ASCENDING)], name="provider_environment", unique=True),
            IndexModel([("lifecycle_state", ASCENDING)], name="lifecycle_state"),
            IndexModel([("updated_at", DESCENDING)], name="connections_updated"),
        ]
    )
    await db[INTEGRATION_HEALTH].create_indexes(
        [
            IndexModel([("connection_id", ASCENDING), ("checked_at", DESCENDING)], name="connection_health_history"),
        ]
    )
    await db[INTEGRATION_AUDIT].create_indexes(
        [
            IndexModel([("created_at", DESCENDING)], name="audit_timeline_created"),
            IndexModel([("connection_id", ASCENDING), ("created_at", DESCENDING)], name="connection_audit_history"),
            IndexModel([("actor", ASCENDING), ("created_at", DESCENDING)], name="connection_audit_actor"),
        ]
    )
    await db.gmail_oauth_tokens.create_indexes(
        [IndexModel([("id", ASCENDING)], name="gmail_oauth_token_id", unique=True)]
    )
    await db.gmail_oauth_states.create_indexes(
        [
            IndexModel([("state_hash", ASCENDING)], name="gmail_oauth_state_hash", unique=True),
            IndexModel([("expires_at", ASCENDING)], name="gmail_oauth_state_expiry", expireAfterSeconds=0),
        ]
    )
    await db.gmail_sync_state.create_indexes(
        [IndexModel([("id", ASCENDING)], name="gmail_sync_state_id", unique=True)]
    )


def validate_snapshot(snapshot: dict[str, Any]) -> dict[str, Any]:
    collections = snapshot["collections"]
    counts = snapshot["counts"]
    expected = snapshot["shopify_counts"]
    errors: list[str] = []

    for name, records in collections.items():
        ids = [record.get("shopify_id") for record in records]
        if records and (None in ids or len(ids) != len(set(ids))):
            errors.append(f"{name} contains missing or duplicate Shopify IDs")

    for name in ("orders", "products", "customers"):
        expected_count = expected.get(name)
        if expected_count is not None and counts.get(name) != expected_count:
            errors.append(f"{name} count {counts.get(name)} does not match Shopify count {expected_count}")

    product_ids = {record["shopify_id"] for record in collections["products"]}
    variant_ids = {record["shopify_id"] for record in collections["variants"]}
    customer_ids = {record["shopify_id"] for record in collections["customers"]}
    order_ids = {record["shopify_id"] for record in collections["orders"]}

    missing_variant_products = sum(
        record.get("shopify_product_id") not in product_ids for record in collections["variants"]
    )
    missing_inventory_variants = sum(
        bool(record.get("shopify_variant_id")) and record.get("shopify_variant_id") not in variant_ids
        for record in collections["inventory_items"]
    )
    missing_order_customers = sum(
        bool((record.get("customer") or {}).get("shopify_id"))
        and (record.get("customer") or {}).get("shopify_id") not in customer_ids
        for record in collections["orders"]
    )
    missing_child_orders = sum(
        record.get("shopify_order_id") not in order_ids
        for name in ("fulfillments", "refunds", "returns")
        for record in collections[name]
    )
    if missing_variant_products:
        errors.append(f"{missing_variant_products} variants reference missing products")
    if missing_inventory_variants:
        errors.append(f"{missing_inventory_variants} inventory items reference missing variants")
    if missing_order_customers:
        errors.append(f"{missing_order_customers} orders reference missing customers")
    if missing_child_orders:
        errors.append(f"{missing_child_orders} fulfillment/refund/return records reference missing orders")

    report = {
        "valid": not errors,
        "errors": errors,
        "counts": counts,
        "shopify_counts": expected,
        "links": {
            "missing_variant_products": missing_variant_products,
            "missing_inventory_variants": missing_inventory_variants,
            "missing_order_customers": missing_order_customers,
            "missing_child_orders": missing_child_orders,
        },
    }
    if errors:
        raise ValueError("; ".join(errors))
    return report


async def insert_snapshot(snapshot: dict[str, Any], run_id: str) -> dict[str, Any]:
    sync_id = snapshot["sync_id"]
    report = validate_snapshot(snapshot)
    inserted_counts: dict[str, int] = {}
    try:
        for collection_name, records in snapshot["collections"].items():
            if records:
                result = await db[collection_name].insert_many(records, ordered=True)
                inserted_counts[collection_name] = len(result.inserted_ids)
            else:
                inserted_counts[collection_name] = 0
        for collection_name, expected_count in snapshot["counts"].items():
            stored = await db[collection_name].count_documents({"sync_id": sync_id})
            if stored != expected_count:
                raise ValueError(
                    f"Stored {collection_name} count {stored} does not match staged count {expected_count}"
                )

        previous = await active_sync_document()
        completed_at = now_iso()
        sync_meta = {
            "id": "shopify_sync",
            "schema_version": SCHEMA_VERSION,
            "active_sync_id": sync_id,
            "previous_sync_id": (previous or {}).get("active_sync_id"),
            "last_successful_run_id": run_id,
            "last_synced_at": snapshot["synced_at"],
            "completed_at": completed_at,
            "counts": snapshot["counts"],
            "shopify_counts": snapshot["shopify_counts"],
            "validation": report,
        }
        await db.meta.replace_one({"id": "shopify_sync"}, sync_meta, upsert=True)
        await db.sync_runs.update_one(
            {"id": run_id},
            {
                "$set": {
                    "status": "completed",
                    "completed_at": completed_at,
                    "sync_id": sync_id,
                    "counts": snapshot["counts"],
                    "shopify_counts": snapshot["shopify_counts"],
                    "validation": report,
                }
            },
        )

        cleanup: dict[str, int] = {}
        for collection_name in CANONICAL_COLLECTIONS:
            result = await db[collection_name].delete_many({"sync_id": {"$ne": sync_id}})
            cleanup[collection_name] = result.deleted_count
        existing = set(await db.list_collection_names())
        for collection_name in MOCK_ONLY_COLLECTIONS:
            if collection_name in existing and collection_name not in CANONICAL_COLLECTIONS:
                await db.drop_collection(collection_name)
                cleanup[collection_name] = -1
        await db.meta.delete_one({"id": "seed"})
        old_runs = await db.sync_runs.find({}, {"_id": 1}).sort("started_at", DESCENDING).skip(25).to_list(None)
        if old_runs:
            await db.sync_runs.delete_many({"_id": {"$in": [item["_id"] for item in old_runs]}})
        await db.sync_runs.update_one({"id": run_id}, {"$set": {"cleanup": cleanup}})
        return {**sync_meta, "cleanup": cleanup, "inserted_counts": inserted_counts}
    except Exception:
        for collection_name in CANONICAL_COLLECTIONS:
            await db[collection_name].delete_many({"sync_id": sync_id})
        raise


async def run_full_sync() -> dict[str, Any]:
    if _sync_lock.locked():
        raise HTTPException(status_code=409, detail="A Shopify synchronization is already running")
    async with _sync_lock:
        run_id = str(uuid.uuid4())
        started_at = now_iso()
        await db.sync_runs.insert_one(
            {"id": run_id, "mode": "full_snapshot", "status": "fetching", "started_at": started_at, "progress": {}}
        )
        loop = asyncio.get_running_loop()

        def progress(entity: str, count: int) -> None:
            def schedule_update() -> None:
                asyncio.create_task(
                    db.sync_runs.update_one(
                        {"id": run_id},
                        {"$set": {f"progress.{entity}": count, "updated_at": now_iso()}},
                    )
                )

            loop.call_soon_threadsafe(schedule_update)

        try:
            snapshot = await asyncio.to_thread(fetch_shopify_snapshot, ShopifyClient(), progress)
            await db.sync_runs.update_one(
                {"id": run_id},
                {"$set": {"status": "staging", "sync_id": snapshot["sync_id"], "fetched_counts": snapshot["counts"]}},
            )
            result = await insert_snapshot(snapshot, run_id)
            return {"ok": True, "run_id": run_id, **result}
        except (ShopifyConfigurationError, ShopifyAPIError, PyMongoError, ValueError) as exc:
            logger.exception("Shopify synchronization failed")
            await db.sync_runs.update_one(
                {"id": run_id},
                {"$set": {"status": "failed", "failed_at": now_iso(), "error": str(exc)}},
            )
            raise HTTPException(status_code=502, detail=str(exc)) from exc
        except Exception as exc:
            logger.exception("Unexpected Shopify synchronization failure")
            await db.sync_runs.update_one(
                {"id": run_id},
                {"$set": {"status": "failed", "failed_at": now_iso(), "error": "Unexpected synchronization failure"}},
            )
            raise HTTPException(status_code=500, detail="Unexpected synchronization failure") from exc


@app.on_event("startup")
async def initialize_application() -> None:
    await ensure_indexes()
    logging.info("Shopify canonical schema initialized; mock seeding is disabled")


@api.get("/")
async def root() -> dict[str, Any]:
    return {"message": "E-RYDEZ Operations Console API", "schema_version": SCHEMA_VERSION, "source": "shopify"}


@api.get("/health/live")
async def health_live() -> dict[str, str]:
    return {"status": "live"}


@api.get("/health/ready")
async def health_ready() -> dict[str, Any]:
    try:
        await db.command("ping")
    except PyMongoError as exc:
        raise HTTPException(status_code=503, detail="MongoDB is unavailable") from exc
    meta = await active_sync_document()
    return {"status": "ready", "shopify_snapshot_active": bool((meta or {}).get("active_sync_id"))}


@api.post("/reset")
async def reset_removed() -> None:
    raise HTTPException(status_code=410, detail="Mock reseeding was removed; Shopify is the source of truth")


@api.get("/shopify/status")
async def shopify_status(live: bool = Query(default=True)) -> dict[str, Any]:
    details = connection_details()
    meta = await active_sync_document()
    last_run = await db.sync_runs.find_one({}, NO_ID, sort=[("started_at", DESCENDING)])
    if live and details.get("configured"):
        try:
            details = await asyncio.to_thread(verify_connection)
        except (ShopifyConfigurationError, ShopifyAPIError) as exc:
            details = {**details, "status": "Error", "detail": str(exc)}
    return {
        **details,
        "schema_version": SCHEMA_VERSION,
        "sync_running": _sync_lock.locked(),
        "active_snapshot": meta,
        "latest_run": last_run,
    }


@api.post("/shopify/sync")
async def sync_shopify() -> dict[str, Any]:
    return await run_full_sync()


@api.get("/shopify/sync-runs")
async def sync_runs() -> list[dict[str, Any]]:
    return await db.sync_runs.find({}, NO_ID).sort("started_at", DESCENDING).to_list(25)


@api.get("/overview")
async def overview() -> dict[str, Any]:
    sync_id = await active_sync_id()
    orders = await db.orders.find({"sync_id": sync_id}, NO_ID).sort("processed_at", DESCENDING).to_list(None)
    products = await db.products.find({"sync_id": sync_id}, NO_ID).to_list(None)
    inventory = await db.inventory_items.find({"sync_id": sync_id}, NO_ID).to_list(None)
    meta = await active_sync_document()

    financial = Counter(order.get("financial_status") or "UNKNOWN" for order in orders)
    fulfillment = Counter(order.get("fulfillment_status") or "UNKNOWN" for order in orders)
    unfulfilled = [order for order in orders if order.get("fulfillment_status") != "FULFILLED" and not order.get("cancelled_at")]
    refunded = [order for order in orders if money_amount((order.get("money") or {}).get("refunded")) > 0]
    gross_sales = round(sum(money_amount((order.get("money") or {}).get("current_total")) for order in orders), 2)
    refunded_total = round(sum(money_amount((order.get("money") or {}).get("refunded")) for order in orders), 2)
    available = sum(int((item.get("quantities") or {}).get("available") or 0) for item in inventory)
    low_stock = [
        item for item in inventory
        if item.get("tracked") and int((item.get("quantities") or {}).get("available") or 0) <= 3
    ]

    product_sales: dict[str, dict[str, Any]] = defaultdict(lambda: {"quantity": 0, "sales": 0.0})
    for order in orders:
        for item in order.get("line_items") or []:
            key = item.get("product_title") or item.get("title") or "Unknown product"
            product_sales[key]["quantity"] += int(item.get("quantity") or 0)
            product_sales[key]["sales"] += money_amount(item.get("discounted_total"))
    top_products = [
        {"title": title, "quantity": values["quantity"], "sales": round(values["sales"], 2)}
        for title, values in sorted(product_sales.items(), key=lambda pair: pair[1]["sales"], reverse=True)[:8]
    ]
    return {
        "source": "shopify",
        "currency": ((await db.shop.find_one({"sync_id": sync_id}, NO_ID)) or {}).get("currency") or "CHF",
        "last_sync": (meta or {}).get("last_synced_at"),
        "sync": meta,
        "cards": {
            "orders": len(orders),
            "gross_sales": gross_sales,
            "unfulfilled": len(unfulfilled),
            "refunded_orders": len(refunded),
            "refunded_total": refunded_total,
            "active_products": sum(product.get("status") == "ACTIVE" for product in products),
            "available_inventory": available,
            "low_stock_variants": len(low_stock),
        },
        "financial_statuses": dict(financial),
        "fulfillment_statuses": dict(fulfillment),
        "recent_orders": [order_with_derived(order) for order in orders[:8]],
        "low_stock": low_stock[:12],
        "top_products": top_products,
    }


@api.get("/orders")
async def list_orders(
    q: str | None = None,
    filter: str | None = None,
    financial_status: str | None = None,
    fulfillment_status: str | None = None,
    delivery_method: str | None = None,
    page: int = Query(default=1, ge=1),
    page_size: int = Query(default=100, ge=1, le=250),
) -> dict[str, Any]:
    sync_id = await active_sync_id()
    orders = await db.orders.find({"sync_id": sync_id}, NO_ID).sort("processed_at", DESCENDING).to_list(None)
    if q:
        needle = q.casefold()

        def matches(order: dict[str, Any]) -> bool:
            fields = [
                order.get("order_number"),
                order.get("confirmation_number"),
                order.get("email"),
                order.get("phone"),
                ((order.get("customer") or {}).get("display_name")),
                ((order.get("shipping_address") or {}).get("city")),
            ]
            fields.extend(
                value
                for item in order.get("line_items") or []
                for value in (item.get("sku"), item.get("name"), item.get("product_title"))
            )
            fields.extend(entry.get("number") for entry in order.get("tracking") or [])
            return any(needle in str(value or "").casefold() for value in fields)

        orders = [order for order in orders if matches(order)]
    if financial_status:
        orders = [order for order in orders if order.get("financial_status") == financial_status.upper()]
    if fulfillment_status:
        orders = [order for order in orders if order.get("fulfillment_status") == fulfillment_status.upper()]
    if delivery_method:
        orders = [order for order in orders if order.get("delivery_method") == delivery_method.upper()]
    legacy_filters = {
        "unfulfilled": lambda order: order.get("fulfillment_status") != "FULFILLED" and not order.get("cancelled_at"),
        "over-8": lambda order: business_day_age(order.get("processed_at")) > 8 and order.get("fulfillment_status") != "FULFILLED",
        "over-14": lambda order: business_day_age(order.get("processed_at")) > 14 and order.get("fulfillment_status") != "FULFILLED",
        "over-30": lambda order: business_day_age(order.get("processed_at")) > 30 and order.get("fulfillment_status") != "FULFILLED",
        "shipping": lambda order: order.get("delivery_method") == "SHIPPING",
        "pickup": lambda order: order.get("delivery_method") == "PICKUP_OR_OTHER",
        "cancelled-refunded": lambda order: bool(order.get("cancelled_at")) or order.get("financial_status") in {"REFUNDED", "PARTIALLY_REFUNDED"},
    }
    if filter in legacy_filters:
        orders = [order for order in orders if legacy_filters[filter](order)]
    total = len(orders)
    start = (page - 1) * page_size
    return {
        "items": [order_with_derived(order) for order in orders[start:start + page_size]],
        "total": total,
        "page": page,
        "page_size": page_size,
        "pages": max((total + page_size - 1) // page_size, 1),
    }


async def find_active(collection: str, record_id: str) -> dict[str, Any]:
    sync_id = await active_sync_id()
    selectors = [{"id": record_id}, {"shopify_id": record_id}]
    if collection == "orders":
        selectors.append({"order_number": record_id})
    record = await db[collection].find_one({"sync_id": sync_id, "$or": selectors}, NO_ID)
    if not record:
        raise HTTPException(status_code=404, detail=f"{collection.rstrip('s').title()} not found")
    return record


@api.get("/orders/{order_id}")
async def get_order(order_id: str) -> dict[str, Any]:
    return order_with_derived(await find_active("orders", order_id))


@api.post("/orders/{order_id}/notes")
@api.post("/orders/{order_id}/pause-updates")
@api.post("/orders/{order_id}/timeline")
async def order_write_removed(order_id: str, payload: dict[str, Any] = Body(default={})) -> None:
    del order_id, payload
    raise HTTPException(status_code=409, detail="Order writes are disabled because Shopify is the source of truth")


@api.get("/products")
async def list_products(q: str | None = None, status: str | None = None) -> list[dict[str, Any]]:
    sync_id = await active_sync_id()
    products = await db.products.find({"sync_id": sync_id}, NO_ID).sort("title", ASCENDING).to_list(None)
    if q:
        needle = q.casefold()
        products = [
            product for product in products
            if any(needle in str(value or "").casefold() for value in (product.get("title"), product.get("vendor"), product.get("product_type"), product.get("handle")))
        ]
    if status:
        products = [product for product in products if product.get("status") == status.upper()]
    return products


@api.get("/products/{product_id}")
async def get_product(product_id: str) -> dict[str, Any]:
    product = await find_active("products", product_id)
    sync_id = product["sync_id"]
    product["variants"] = await db.variants.find({"sync_id": sync_id, "shopify_product_id": product["shopify_id"]}, NO_ID).sort("title", ASCENDING).to_list(None)
    product["inventory"] = await db.inventory_items.find({"sync_id": sync_id, "shopify_product_id": product["shopify_id"]}, NO_ID).to_list(None)
    return product


@api.get("/inventory")
async def list_inventory(
    q: str | None = None,
    low_stock: bool = False,
    page: int = Query(default=1, ge=1),
    page_size: int = Query(default=100, ge=1, le=250),
) -> dict[str, Any]:
    sync_id = await active_sync_id()
    items = await db.inventory_items.find({"sync_id": sync_id}, NO_ID).sort("product_title", ASCENDING).to_list(None)
    if q:
        needle = q.casefold()
        items = [
            item for item in items
            if any(needle in str(value or "").casefold() for value in (item.get("sku"), item.get("product_title"), item.get("variant_title")))
        ]
    if low_stock:
        items = [item for item in items if item.get("tracked") and int((item.get("quantities") or {}).get("available") or 0) <= 3]
    total = len(items)
    start = (page - 1) * page_size
    return {"items": items[start:start + page_size], "total": total, "page": page, "page_size": page_size, "pages": max((total + page_size - 1) // page_size, 1)}


@api.get("/inventory/{item_id}")
async def get_inventory(item_id: str) -> dict[str, Any]:
    sync_id = await active_sync_id()
    item = await db.inventory_items.find_one(
        {"sync_id": sync_id, "$or": [{"id": item_id}, {"shopify_id": item_id}, {"sku": item_id}]},
        NO_ID,
    )
    if not item:
        raise HTTPException(status_code=404, detail="Inventory item not found")
    item["variant"] = await db.variants.find_one({"sync_id": sync_id, "shopify_id": item.get("shopify_variant_id")}, NO_ID)
    item["product"] = await db.products.find_one({"sync_id": sync_id, "shopify_id": item.get("shopify_product_id")}, NO_ID)
    item["open_orders"] = await db.orders.find(
        {
            "sync_id": sync_id,
            "line_items.shopify_variant_id": item.get("shopify_variant_id"),
            "fulfillment_status": {"$ne": "FULFILLED"},
            "cancelled_at": None,
        },
        NO_ID,
    ).sort("processed_at", ASCENDING).to_list(None)
    return item


@api.get("/customers")
async def list_customers(
    q: str | None = None,
    page: int = Query(default=1, ge=1),
    page_size: int = Query(default=100, ge=1, le=250),
) -> dict[str, Any]:
    sync_id = await active_sync_id()
    customers = await db.customers.find({"sync_id": sync_id}, NO_ID).sort("updated_at", DESCENDING).to_list(None)
    if q:
        needle = q.casefold()
        customers = [
            customer for customer in customers
            if any(needle in str(value or "").casefold() for value in (customer.get("display_name"), customer.get("email"), customer.get("phone"), ((customer.get("default_address") or {}).get("city"))))
        ]
    total = len(customers)
    start = (page - 1) * page_size
    return {"items": customers[start:start + page_size], "total": total, "page": page, "page_size": page_size, "pages": max((total + page_size - 1) // page_size, 1)}


@api.get("/customers/{customer_id}")
async def get_customer(customer_id: str) -> dict[str, Any]:
    customer = await find_active("customers", customer_id)
    customer["orders"] = [
        order_with_derived(order)
        for order in await db.orders.find(
            {"sync_id": customer["sync_id"], "customer.shopify_id": customer["shopify_id"]}, NO_ID
        ).sort("processed_at", DESCENDING).to_list(None)
    ]
    return customer


@api.get("/fulfillment")
@api.get("/fulfillments")
async def list_fulfillments() -> list[dict[str, Any]]:
    sync_id = await active_sync_id()
    return await db.fulfillments.find({"sync_id": sync_id}, NO_ID).sort("created_at", DESCENDING).to_list(None)


@api.get("/refunds")
async def list_refunds() -> list[dict[str, Any]]:
    sync_id = await active_sync_id()
    return await db.refunds.find({"sync_id": sync_id}, NO_ID).sort("created_at", DESCENDING).to_list(None)


@api.get("/returns")
async def list_returns() -> list[dict[str, Any]]:
    sync_id = await active_sync_id()
    return await db.returns.find({"sync_id": sync_id}, NO_ID).sort("created_at", DESCENDING).to_list(None)


@api.get("/returns/{return_id}")
async def get_return(return_id: str) -> dict[str, Any]:
    return await find_active("returns", return_id)


@api.get("/integrations")
async def list_integrations() -> list[dict[str, Any]]:
    status = await shopify_status(live=False)
    connections = await db[INTEGRATION_CONNECTIONS].find({}, NO_ID).sort("provider", ASCENDING).to_list(None)
    provider_records = [
        {
            **public_connection(connection),
            "name": connection.get("provider", "Provider").title(),
            "health": connection_health(connection),
        }
        for connection in connections
    ]
    return [
        {
            "id": "shopify",
            "name": "Shopify",
            "status": status.get("status"),
            "configured": status.get("configured"),
            "last_sync": ((status.get("active_snapshot") or {}).get("last_synced_at")),
            "counts": ((status.get("active_snapshot") or {}).get("counts")),
        },
        *provider_records,
    ]


@api.post("/integrations/gmail/initialize")
async def initialize_gmail_readiness(
    payload: dict[str, Any] = Body(default={}),
) -> dict[str, Any]:
    actor = local_operator_label()
    reason = str(payload.get("reason") or "Initialize approved local Gmail readiness record").strip()
    if len(reason) < 8:
        raise HTTPException(status_code=422, detail="A lifecycle reason of at least eight characters is required")
    existing = await db[INTEGRATION_CONNECTIONS].find_one({"provider": "gmail", "environment": "local"}, NO_ID)
    if existing:
        raise HTTPException(status_code=409, detail="Local Gmail readiness record already exists")
    timestamp = integration_now()
    connection = {
        "id": "gmail-local",
        "provider": "gmail",
        "environment": "local",
        "display_identity": "Existing authorized Gmail mailbox",
        "lifecycle_state": "setup_required",
        "desired_state": "active",
        "capabilities": ["connection_control", "metadata_only_health"],
        "business_owner": {"display_name": "Existing authorized Gmail mailbox identity", "status": "confirmed"},
        "recovery_owner": {"display_name": None, "status": "pending"},
        "created_at": timestamp,
        "updated_at": timestamp,
        "last_action_reason": reason,
    }
    await db[INTEGRATION_CONNECTIONS].insert_one(connection)
    await append_integration_audit(connection["id"], actor, "connection_registered", reason, None, "setup_required")
    return {"connection": public_connection(connection), "health": connection_health(connection)}


@api.get("/integrations/{connection_id}")
async def get_integration_connection(connection_id: str) -> dict[str, Any]:
    connection = await integration_connection_or_404(connection_id)
    latest_health = await db[INTEGRATION_HEALTH].find_one({"connection_id": connection_id}, NO_ID, sort=[("checked_at", DESCENDING)])
    return {"connection": public_connection(connection), "health": latest_health or connection_health(connection)}


@api.get("/integrations/{connection_id}/health")
async def evaluate_integration_health(connection_id: str) -> dict[str, Any]:
    connection = await integration_connection_or_404(connection_id)
    health = connection_health(connection)
    health["id"] = str(uuid.uuid4())
    await db[INTEGRATION_HEALTH].insert_one(health)
    return {key: value for key, value in health.items() if key != "_id"}


@api.get("/integrations/{connection_id}/audit")
async def integration_audit(connection_id: str) -> list[dict[str, Any]]:
    await integration_connection_or_404(connection_id)
    return await db[INTEGRATION_AUDIT].find({"connection_id": connection_id}, NO_ID).sort("created_at", DESCENDING).to_list(100)


@api.get("/audit-timeline")
async def audit_timeline(limit: int = Query(default=250, ge=1, le=500)) -> dict[str, Any]:
    """Return a read-only, newest-first view of safe console-owned audit evidence."""
    connections = await db[INTEGRATION_CONNECTIONS].find({}, NO_ID).to_list(None)
    by_id = {connection["id"]: connection for connection in connections}
    events = await db[INTEGRATION_AUDIT].find({}, NO_ID).sort("created_at", DESCENDING).to_list(limit)
    return {
        "items": [public_audit_timeline_item(event, by_id.get(event.get("connection_id"))) for event in events],
        "scope_note": "Read-only console audit evidence. Provider payloads, credentials, message content, and external event history are excluded.",
    }


@api.get("/provider-ledger")
async def provider_ledger(limit: int = Query(default=250, ge=1, le=500)) -> dict[str, Any]:
    """Return local run and control history without receiving or storing external provider events."""
    connections = await db[INTEGRATION_CONNECTIONS].find({}, NO_ID).to_list(None)
    by_id = {connection["id"]: connection for connection in connections}
    runs = await db.sync_runs.find({}, NO_ID).sort("started_at", DESCENDING).to_list(limit)
    events = await db[INTEGRATION_AUDIT].find({}, NO_ID).sort("created_at", DESCENDING).to_list(limit)
    items = [public_sync_run_ledger_item(run) for run in runs]
    items.extend(public_integration_ledger_item(event, by_id.get(event.get("connection_id"))) for event in events)
    items.sort(key=lambda item: item.get("occurred_at") or "", reverse=True)
    return {
        "items": items[:limit],
        "scope_note": "Local provider run and control history only. No external deliveries, polling, provider payloads, credentials, messages, or provider writes are included.",
    }


@api.post("/integrations/{connection_id}/lifecycle")
async def change_integration_lifecycle(
    connection_id: str,
    payload: dict[str, Any] = Body(default={}),
) -> dict[str, Any]:
    actor = local_operator_label()
    connection = await integration_connection_or_404(connection_id)
    action = str(payload.get("action") or "").strip().lower()
    reason = str(payload.get("reason") or "").strip()
    if action not in {"pause", "resume", "request_reauthorization", "request_disconnect"}:
        raise HTTPException(status_code=422, detail="Unsupported F-009a lifecycle action")
    if len(reason) < 8:
        raise HTTPException(status_code=422, detail="A lifecycle reason of at least eight characters is required")
    prior_state = connection.get("lifecycle_state")
    transitions = {
        "pause": ("paused", "paused"),
        "resume": ("setup_required", "active"),
        "request_reauthorization": ("reauthorization_required", "active"),
        "request_disconnect": ("disconnect_pending", "paused"),
    }
    next_state, desired_state = transitions[action]
    if action == "resume" and prior_state != "paused":
        raise HTTPException(status_code=409, detail="Only a paused connection can be resumed")
    if action == "pause" and prior_state in {"paused", "disconnect_pending", "disconnected"}:
        raise HTTPException(status_code=409, detail="Connection cannot be paused from its current lifecycle state")
    if action == "request_disconnect" and prior_state == "disconnected":
        raise HTTPException(status_code=409, detail="Connection is already disconnected")
    await db[INTEGRATION_CONNECTIONS].update_one(
        {"id": connection_id},
        {"$set": {"lifecycle_state": next_state, "desired_state": desired_state, "updated_at": integration_now(), "last_action_reason": reason}},
    )
    await append_integration_audit(connection_id, actor, action, reason, prior_state, next_state)
    updated = await integration_connection_or_404(connection_id)
    return {"connection": public_connection(updated), "health": connection_health(updated)}


@api.post("/integrations/{connection_id}/recovery-owner")
async def assign_recovery_owner(
    connection_id: str,
    payload: dict[str, Any] = Body(default={}),
) -> dict[str, Any]:
    actor = local_operator_label()
    connection = await integration_connection_or_404(connection_id)
    display_name = str(payload.get("display_name") or "").strip()
    reason = str(payload.get("reason") or "").strip()
    if len(display_name) < 3 or len(reason) < 8:
        raise HTTPException(status_code=422, detail="Recovery owner name and lifecycle reason are required")
    previous = ((connection.get("recovery_owner") or {}).get("display_name"))
    await db[INTEGRATION_CONNECTIONS].update_one(
        {"id": connection_id},
        {"$set": {"recovery_owner": {"display_name": display_name, "status": "confirmed"}, "updated_at": integration_now(), "last_action_reason": reason}},
    )
    await append_integration_audit(connection_id, actor, "recovery_owner_assigned", reason, "assigned" if previous else "pending", "assigned")
    updated = await integration_connection_or_404(connection_id)
    return {"connection": public_connection(updated), "health": connection_health(updated)}


@api.get("/reports")
async def reports() -> dict[str, Any]:
    overview_data = await overview()
    return {
        "source": "shopify",
        "period": "All accessible Shopify orders",
        "refreshed_at": now_iso(),
        "currency": overview_data["currency"],
        "cards": overview_data["cards"],
        "financial_statuses": overview_data["financial_statuses"],
        "fulfillment_statuses": overview_data["fulfillment_statuses"],
        "top_products": overview_data["top_products"],
    }


@api.get("/search")
async def global_search(q: str) -> dict[str, list[dict[str, Any]]]:
    needle = q.casefold().strip()
    if not needle:
        return {"orders": [], "products": [], "customers": [], "inventory": []}
    orders = (await list_orders(q=q, page=1, page_size=8))["items"]
    products = (await list_products(q=q))[:8]
    customers = (await list_customers(q=q, page=1, page_size=8))["items"]
    inventory = (await list_inventory(q=q, page=1, page_size=8))["items"]
    return {"orders": orders, "products": products, "customers": customers, "inventory": inventory}


@api.get("/work-items")
async def empty_work_items(view: str = "all-open") -> dict[str, Any]:
    del view
    return {"items": [], "counts": {}}


@api.get("/conversations")
@api.get("/appointments")
@api.get("/automations")
@api.get("/approvals")
@api.get("/notifications")
async def empty_legacy_lists() -> list[Any]:
    return []


@api.get("/automations/runs")
async def empty_automation_runs() -> list[Any]:
    return []


@api.get("/purchasing")
async def empty_purchasing() -> dict[str, list[Any]]:
    return {"suppliers": [], "purchase_orders": []}


# ---------------------------------------------------------------------------
# Gmail Integration (Google OAuth 2.0 + Gmail REST API)
# ---------------------------------------------------------------------------

from fastapi.responses import RedirectResponse
from gmail_service import (
    GmailPausedError,
    GmailServiceError,
    complete_oauth_authorization,
    disconnect_gmail,
    generate_ai_reply,
    gmail_status,
    list_threads,
    read_thread,
    send_thread_reply,
    start_oauth_authorization,
)

GMAIL_CONNECTION_ID = "gmail-local"


def gmail_http_exception(exc: GmailServiceError) -> HTTPException:
    """Map safe Gmail service failures to the appropriate HTTP response."""
    return HTTPException(status_code=getattr(exc, "status_code", 502), detail=str(exc))


async def gmail_connection_or_none() -> dict[str, Any] | None:
    return await db[INTEGRATION_CONNECTIONS].find_one({"id": GMAIL_CONNECTION_ID}, NO_ID)


async def require_active_gmail_connection() -> None:
    connection = await gmail_connection_or_none()
    if connection and connection.get("lifecycle_state") in {"paused", "disconnect_pending", "disconnected"}:
        raise GmailPausedError("Die Gmail-Verbindung ist durch die lokale Betriebssteuerung pausiert")


async def record_gmail_connection(email_address: str, action: str, reason: str) -> dict[str, Any]:
    """Persist only safe Gmail connection metadata; OAuth tokens stay separate and encrypted."""
    existing = await gmail_connection_or_none()
    timestamp = integration_now()
    connection = {
        "id": GMAIL_CONNECTION_ID,
        "provider": "gmail",
        "environment": "local",
        "display_identity": email_address,
        "lifecycle_state": "active",
        "desired_state": "active",
        "capabilities": ["oauth_authorization", "thread_read", "thread_reply", "on_demand_sync", "ai_reply_draft"],
        "business_owner": {"display_name": email_address, "status": "confirmed"},
        "recovery_owner": (existing or {}).get("recovery_owner") or {"display_name": None, "status": "pending"},
        "created_at": (existing or {}).get("created_at") or timestamp,
        "updated_at": timestamp,
        "last_action_reason": reason,
    }
    await db[INTEGRATION_CONNECTIONS].replace_one({"id": GMAIL_CONNECTION_ID}, connection, upsert=True)
    await append_integration_audit(
        GMAIL_CONNECTION_ID,
        local_operator_label(),
        action,
        reason,
        (existing or {}).get("lifecycle_state"),
        "active",
    )
    return connection


@api.get("/gmail/status")
async def gmail_connection_status() -> dict[str, Any]:
    """Return safe OAuth and Gmail connection metadata without any token fields."""
    status = await gmail_status(db)
    connection = await gmail_connection_or_none()
    return {
        **status,
        "lifecycle_state": (connection or {}).get("lifecycle_state") or "setup_required",
        "connection": public_connection(connection) if connection else None,
    }


@api.get("/gmail/oauth/start")
async def gmail_oauth_start() -> RedirectResponse:
    """Start a CSRF-protected Google OAuth 2.0 authorization-code flow."""
    try:
        url = await start_oauth_authorization(db)
        return RedirectResponse(url=url, status_code=302)
    except GmailServiceError as exc:
        raise gmail_http_exception(exc) from exc


@api.get("/gmail/oauth/callback")
async def gmail_oauth_callback(code: str | None = None, state: str | None = None, error: str | None = None) -> RedirectResponse:
    """Complete Google OAuth 2.0 and return the browser to the Gmail workspace."""
    if error:
        logger.info("Google OAuth was not completed: %s", error[:80])
        return RedirectResponse(url="/gmail?oauth=cancelled", status_code=303)
    try:
        result = await complete_oauth_authorization(db, code or "", state or "")
        await record_gmail_connection(result["email_address"], "oauth_connected", "Google OAuth authorization completed")
        return RedirectResponse(url="/gmail?oauth=connected", status_code=303)
    except GmailServiceError as exc:
        logger.warning("Google OAuth callback failed: %s", exc)
        return RedirectResponse(url="/gmail?oauth=failed", status_code=303)


@api.post("/gmail/disconnect")
async def gmail_disconnect() -> dict[str, Any]:
    """Revoke local Gmail authorization and remove encrypted credentials."""
    connection = await gmail_connection_or_none()
    try:
        await disconnect_gmail(db)
    except GmailServiceError as exc:
        raise gmail_http_exception(exc) from exc
    timestamp = integration_now()
    await db[INTEGRATION_CONNECTIONS].update_one(
        {"id": GMAIL_CONNECTION_ID},
        {"$set": {"lifecycle_state": "disconnected", "desired_state": "disconnected", "display_identity": None, "updated_at": timestamp, "last_action_reason": "Google OAuth access revoked and local token removed"}},
    )
    if connection:
        await append_integration_audit(
            GMAIL_CONNECTION_ID,
            local_operator_label(),
            "oauth_disconnected",
            "Google OAuth access revoked and local token removed",
            connection.get("lifecycle_state"),
            "disconnected",
        )
    return {"ok": True}


@api.get("/gmail/threads")
async def gmail_list_threads(
    q: str | None = None,
    max_results: int = Query(default=25, ge=1, le=100),
    page_token: str | None = None,
) -> dict[str, Any]:
    """List Gmail threads with optional Gmail search syntax."""
    try:
        await require_active_gmail_connection()
        return await list_threads(db, query=q, max_results=max_results, page_token=page_token)
    except GmailServiceError as exc:
        raise gmail_http_exception(exc) from exc


@api.get("/gmail/threads/{thread_id}")
async def gmail_get_thread(thread_id: str) -> dict[str, Any]:
    """Read a complete Gmail thread for display and drafting."""
    try:
        await require_active_gmail_connection()
        return await read_thread(db, thread_id)
    except GmailServiceError as exc:
        raise gmail_http_exception(exc) from exc


@api.post("/gmail/threads/{thread_id}/ai-reply")
async def gmail_generate_ai_reply(
    thread_id: str,
    payload: dict[str, Any] = Body(default={}),
) -> dict[str, Any]:
    """Generate an editable draft; it never sends a message."""
    try:
        await require_active_gmail_connection()
        thread = await read_thread(db, thread_id)
        messages = thread.get("messages") or []
        if not messages:
            raise HTTPException(status_code=422, detail="Thread enthält keine Nachrichten")
        return generate_ai_reply(
            thread_messages=messages,
            sender_name=str(payload.get("sender_name") or "E-RYDEZ Team")[:100],
            language_hint=str(payload.get("language") or "")[:50] or None,
            custom_instructions=str(payload.get("instructions") or "")[:500] or None,
        )
    except GmailServiceError as exc:
        raise gmail_http_exception(exc) from exc


@api.post("/gmail/send")
async def gmail_send_message(payload: dict[str, Any] = Body(...)) -> dict[str, Any]:
    """Send an explicitly confirmed reply in its existing Gmail conversation.

    Recipients, subject, and RFC threading headers are derived from the source
    Gmail thread. Browser-provided recipient headers are intentionally ignored.
    """
    thread_id = str(payload.get("thread_id") or "").strip()
    content = str(payload.get("content") or "")
    if not thread_id:
        raise HTTPException(status_code=422, detail="Gmail-Thread-ID ist erforderlich")
    try:
        await require_active_gmail_connection()
        result = await send_thread_reply(db, thread_id, content)
        await append_integration_audit(
            GMAIL_CONNECTION_ID,
            local_operator_label(),
            "thread_reply_sent",
            "User-confirmed Gmail reply sent in existing thread",
            "active",
            "active",
        )
        return {"ok": True, "result": result}
    except GmailServiceError as exc:
        raise gmail_http_exception(exc) from exc


app.include_router(api)

cors_origins = [origin.strip() for origin in os.environ.get("CORS_ORIGINS", "").split(",") if origin.strip()]
if cors_origins:
    app.add_middleware(
        CORSMiddleware,
        allow_credentials=True,
        allow_origins=cors_origins,
        allow_methods=["*"],
        allow_headers=["*"],
    )

logging.basicConfig(level=logging.INFO, format="%(asctime)s - %(name)s - %(levelname)s - %(message)s")


@app.on_event("shutdown")
async def shutdown_db_client() -> None:
    client.close()
