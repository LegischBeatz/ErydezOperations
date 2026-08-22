from __future__ import annotations

import asyncio
import hashlib
import logging
import os
import re
import time
import uuid
from contextlib import asynccontextmanager
from datetime import datetime, timedelta, timezone
from pathlib import Path
from typing import Any

from dotenv import load_dotenv
from draft_facts import build_shopify_fact_card, extract_thread_order_references
from fastapi import APIRouter, Body, FastAPI, HTTPException, Query
from fastapi.responses import JSONResponse, RedirectResponse
from motor.motor_asyncio import AsyncIOMotorClient
from pymongo import ASCENDING, DESCENDING, IndexModel
from pymongo.errors import DuplicateKeyError, PyMongoError
from starlette.middleware.cors import CORSMiddleware
from starlette.requests import Request

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

@asynccontextmanager
async def application_lifespan(_: FastAPI):
    await ensure_indexes()
    logging.info("Shopify canonical schema initialized; mock seeding is disabled")
    try:
        yield
    finally:
        client.close()


app = FastAPI(title="E-RYDEZ Operations Console API", version="2.1.0", lifespan=application_lifespan)
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
GMAIL_SEND_OPERATIONS = "gmail_send_operations"
LOCAL_OPERATOR_LABEL = os.environ.get("ERYDEZ_LOCAL_OPERATOR_LABEL", "Local operator").strip() or "Local operator"
CORS_ORIGINS = tuple(origin.strip() for origin in os.environ.get("CORS_ORIGINS", "").split(",") if origin.strip())
LOCAL_BROWSER_REQUEST_HEADER = "x-erydez-request"
LOCAL_BROWSER_REQUEST_VALUE = "local-console"
SAFE_HTTP_METHODS = frozenset({"GET", "HEAD", "OPTIONS"})
IDEMPOTENCY_KEY_PATTERN = re.compile(r"^[A-Za-z0-9_-]{16,128}$")
_sync_lock = asyncio.Lock()


def positive_integer_env(name: str, default: int) -> int:
    """Read a bounded positive local retention/configuration value."""
    try:
        return max(1, int(os.environ.get(name, default)))
    except (TypeError, ValueError):
        logger.warning("Invalid %s value; using safe default", name)
        return default


INTEGRATION_HEALTH_RETENTION_DAYS = positive_integer_env("INTEGRATION_HEALTH_RETENTION_DAYS", 90)
INTEGRATION_AUDIT_RETENTION_DAYS = positive_integer_env("INTEGRATION_AUDIT_RETENTION_DAYS", 365)
GMAIL_SEND_OPERATION_RETENTION_HOURS = positive_integer_env("GMAIL_SEND_OPERATION_RETENTION_HOURS", 24)


def _performance_route_label(path: str) -> str:
    """Return a bounded route label without identifiers or query content."""
    if path.startswith("/api/gmail/threads/"):
        return "/api/gmail/threads/{thread_id}" + ("/ai-reply" if path.endswith("/ai-reply") else "")
    for prefix, label in (
        ("/api/orders/", "/api/orders/{order_id}"),
        ("/api/products/", "/api/products/{product_id}"),
        ("/api/inventory/", "/api/inventory/{item_id}"),
        ("/api/customers/", "/api/customers/{customer_id}"),
        ("/api/returns/", "/api/returns/{return_id}"),
    ):
        if path.startswith(prefix):
            return label
    return path


def request_origin(request: Request) -> str | None:
    """Return the browser origin represented by the proxied request without trusting a query/body value."""
    host = request.headers.get("host", "").strip()
    if not host:
        return None
    scheme = request.headers.get("x-forwarded-proto", request.url.scheme).split(",", 1)[0].strip() or request.url.scheme
    return f"{scheme}://{host}"


def local_browser_mutation_is_trusted(request: Request) -> bool:
    """Reject cross-site browser mutations while retaining documented local CLI and CORS-dev workflows.

    The packaged application has no user session or public exposure.  This helper is
    deliberately a browser request-provenance guard, not an authentication layer.
    Requests without browser provenance remain available to the approved local CLI.
    """
    fetch_site = request.headers.get("sec-fetch-site", "").lower()
    origin = request.headers.get("origin")
    expected_origin = request_origin(request)
    trusted_origins = {origin for origin in (*CORS_ORIGINS, expected_origin) if origin}

    if fetch_site == "cross-site":
        return False
    if origin and origin not in trusted_origins:
        return False
    if fetch_site in {"same-origin", "same-site", "none"} or origin:
        return request.headers.get(LOCAL_BROWSER_REQUEST_HEADER) == LOCAL_BROWSER_REQUEST_VALUE
    return True


@app.middleware("http")
async def observe_api_request_timing(request: Request, call_next):
    """Reject untrusted browser mutations and emit safe route timing without request data."""
    started = time.perf_counter()
    route = _performance_route_label(request.url.path)
    if request.url.path.startswith("/api/") and request.method not in SAFE_HTTP_METHODS:
        if not local_browser_mutation_is_trusted(request):
            duration_ms = (time.perf_counter() - started) * 1000
            logger.warning(
                "local_request_rejected method=%s route=%s reason=untrusted_browser_mutation duration_ms=%.2f",
                request.method,
                route,
                duration_ms,
            )
            return JSONResponse(status_code=403, content={"detail": "Cross-site browser mutations are not allowed for this local console"})
    try:
        response = await call_next(request)
    except Exception:
        duration_ms = (time.perf_counter() - started) * 1000
        if request.url.path.startswith("/api/"):
            logger.info(
                "performance_request method=%s route=%s status=500 duration_ms=%.2f response_bytes=unknown",
                request.method,
                route,
                duration_ms,
            )
        raise

    duration_ms = (time.perf_counter() - started) * 1000
    if request.url.path.startswith("/api/"):
        response.headers["Server-Timing"] = f"app;dur={duration_ms:.1f}"
        logger.info(
            "performance_request method=%s route=%s status=%s duration_ms=%.2f response_bytes=%s",
            request.method,
            route,
            response.status_code,
            duration_ms,
            response.headers.get("content-length", "unknown"),
        )
    return response


def mongo_contains(value: str | None, fields: tuple[str, ...]) -> dict[str, Any] | None:
    """Build a bounded, case-insensitive substring filter for normalized snapshot fields."""
    needle = (value or "").strip()
    if not needle:
        return None
    return {"$or": [{field: {"$regex": re.escape(needle), "$options": "i"}} for field in fields]}


def combine_mongo_filters(*filters: dict[str, Any] | None) -> dict[str, Any]:
    """Combine optional MongoDB predicates without duplicating root operators."""
    active_filters = [item for item in filters if item]
    if not active_filters:
        return {}
    if len(active_filters) == 1:
        return active_filters[0]
    return {"$and": active_filters}


async def paginated_snapshot_records(
    collection_name: str,
    query: dict[str, Any],
    *,
    sort: tuple[str, int],
    page: int,
    page_size: int,
) -> dict[str, Any]:
    """Read only one page plus count from the active snapshot and log safe aggregate timing."""
    started = time.perf_counter()
    collection = db[collection_name]
    total_task = collection.count_documents(query)
    items_task = collection.find(query, NO_ID).sort(*sort).skip((page - 1) * page_size).limit(page_size).to_list(length=page_size)
    total, items = await asyncio.gather(total_task, items_task)
    duration_ms = (time.perf_counter() - started) * 1000
    logger.info(
        "performance_database collection=%s operation=page matched=%s returned=%s duration_ms=%.2f",
        collection_name,
        total,
        len(items),
        duration_ms,
    )
    return {
        "items": items,
        "total": total,
        "page": page,
        "page_size": page_size,
        "pages": max((total + page_size - 1) // page_size, 1),
    }


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


def business_day_candidate_cutoff(threshold: int) -> str:
    """Return a conservative date bound that cannot exclude an order over the weekday threshold."""
    return (datetime.now(timezone.utc) - timedelta(days=max(1, threshold) * 2)).isoformat().replace("+00:00", "Z")


def aggregate_counter(rows: list[dict[str, Any]]) -> dict[str, int]:
    return {str(row.get("_id") or "UNKNOWN"): int(row.get("count") or 0) for row in rows}





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
    """Return a bounded diagnostic summary without credentials or bearer material."""
    if not value:
        return None
    summary = str(value).strip()
    summary = re.sub(r"\b(?:shpss|shpat|sk)_[A-Za-z0-9_-]+\b", "[redacted]", summary)
    summary = re.sub(r"(?i)\bBearer\s+[A-Za-z0-9._~+\-/=]+", "Bearer [redacted]", summary)
    summary = re.sub(r"(?i)(mongodb(?:\+srv)?://)[^\s/@:]+(?::[^\s/@]+)?@", r"\1[redacted]@", summary)
    summary = re.sub(
        r"(?i)\b(client[ _-]?secret|access[ _-]?token|refresh[ _-]?token|authorization|api[ _-]?key|password)\s*[:=]\s*\S+",
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


def retention_expiry(days: int) -> datetime:
    return datetime.now(timezone.utc) + timedelta(days=days)


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
        "expires_at": retention_expiry(INTEGRATION_AUDIT_RETENTION_DAYS),
    }
    await db[INTEGRATION_AUDIT].insert_one(event)
    return {key: value for key, value in event.items() if key not in {"_id", "expires_at"}}


async def start_gmail_send_operation(thread_id: str, content: str, idempotency_key: str) -> dict[str, Any] | None:
    """Atomically reserve a Gmail send key without storing the email body."""
    if not IDEMPOTENCY_KEY_PATTERN.fullmatch(idempotency_key):
        raise HTTPException(status_code=422, detail="A valid Gmail idempotency key is required")
    content_hash = hashlib.sha256(f"{thread_id}\0{content}".encode("utf-8")).hexdigest()
    operation = {
        "id": idempotency_key,
        "thread_id": thread_id,
        "content_hash": content_hash,
        "status": "sending",
        "created_at": integration_now(),
        "expires_at": datetime.now(timezone.utc) + timedelta(hours=GMAIL_SEND_OPERATION_RETENTION_HOURS),
    }
    try:
        await db[GMAIL_SEND_OPERATIONS].insert_one(operation)
        return None
    except DuplicateKeyError:
        existing = await db[GMAIL_SEND_OPERATIONS].find_one({"id": idempotency_key}, NO_ID)
        if not existing or existing.get("thread_id") != thread_id or existing.get("content_hash") != content_hash:
            raise HTTPException(status_code=409, detail="The Gmail idempotency key cannot be reused for different content")
        if existing.get("status") == "completed":
            return existing.get("result") or {"thread_id": thread_id}
        raise HTTPException(
            status_code=409,
            detail="The prior Gmail send outcome is not retry-safe; refresh the thread and prepare a new confirmation if needed",
        )


async def complete_gmail_send_operation(idempotency_key: str, result: dict[str, Any]) -> None:
    await db[GMAIL_SEND_OPERATIONS].update_one(
        {"id": idempotency_key},
        {"$set": {"status": "completed", "completed_at": integration_now(), "result": result}},
    )


async def mark_gmail_send_outcome_unknown(idempotency_key: str) -> None:
    await db[GMAIL_SEND_OPERATIONS].update_one(
        {"id": idempotency_key},
        {"$set": {"status": "outcome_unknown", "completed_at": integration_now()}},
    )


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
            IndexModel([("expires_at", ASCENDING)], name="connection_health_expiry", expireAfterSeconds=0),
        ]
    )
    await db[INTEGRATION_AUDIT].create_indexes(
        [
            IndexModel([("created_at", DESCENDING)], name="audit_timeline_created"),
            IndexModel([("connection_id", ASCENDING), ("created_at", DESCENDING)], name="connection_audit_history"),
            IndexModel([("actor", ASCENDING), ("created_at", DESCENDING)], name="connection_audit_actor"),
            IndexModel([("expires_at", ASCENDING)], name="connection_audit_expiry", expireAfterSeconds=0),
        ]
    )
    await db[GMAIL_SEND_OPERATIONS].create_indexes(
        [
            IndexModel([("id", ASCENDING)], name="gmail_send_operation_id", unique=True),
            IndexModel([("expires_at", ASCENDING)], name="gmail_send_operation_expiry", expireAfterSeconds=0),
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
            safe_error = safe_provider_error_summary(exc) or "Shopify synchronization failed"
            logger.error("Shopify synchronization failed: %s", safe_error)
            await db.sync_runs.update_one(
                {"id": run_id},
                {"$set": {"status": "failed", "failed_at": now_iso(), "error": safe_error}},
            )
            raise HTTPException(status_code=502, detail=safe_error) from exc

        except Exception as exc:
            logger.exception("Unexpected Shopify synchronization failure")
            await db.sync_runs.update_one(
                {"id": run_id},
                {"$set": {"status": "failed", "failed_at": now_iso(), "error": "Unexpected synchronization failure"}},
            )
            raise HTTPException(status_code=500, detail="Unexpected synchronization failure") from exc





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
            details = {**details, "status": "Error", "detail": safe_provider_error_summary(exc) or "Shopify connection check failed"}

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
    """Build dashboard facts in MongoDB without materializing the active snapshot in the API process."""
    sync_id = await active_sync_id()
    match = {"sync_id": sync_id}
    orders_pipeline = [
        {"$match": match},
        {"$facet": {
            "summary": [
                {"$group": {
                    "_id": None,
                    "orders": {"$sum": 1},
                    "gross_sales": {"$sum": {"$ifNull": ["$money.current_total.amount", 0]}},
                    "unfulfilled": {"$sum": {"$cond": [{"$and": [
                        {"$ne": [{"$ifNull": ["$fulfillment_status", "UNKNOWN"]}, "FULFILLED"]},
                        {"$eq": [{"$ifNull": ["$cancelled_at", None]}, None]},
                    ]}, 1, 0]}},
                    "refunded_orders": {"$sum": {"$cond": [{"$gt": [{"$ifNull": ["$money.refunded.amount", 0]}, 0]}, 1, 0]}},
                    "refunded_total": {"$sum": {"$ifNull": ["$money.refunded.amount", 0]}},
                }},
                {"$project": {"_id": 0}},
            ],
            "financial_statuses": [
                {"$group": {"_id": {"$ifNull": ["$financial_status", "UNKNOWN"]}, "count": {"$sum": 1}}},
            ],
            "fulfillment_statuses": [
                {"$group": {"_id": {"$ifNull": ["$fulfillment_status", "UNKNOWN"]}, "count": {"$sum": 1}}},
            ],
            "recent_orders": [
                {"$sort": {"processed_at": DESCENDING}},
                {"$limit": 8},
            ],
            "top_products": [
                {"$unwind": "$line_items"},
                {"$group": {
                    "_id": {"$ifNull": ["$line_items.product_title", {"$ifNull": ["$line_items.title", "Unknown product"]}]},
                    "quantity": {"$sum": {"$ifNull": ["$line_items.quantity", 0]}},
                    "sales": {"$sum": {"$ifNull": ["$line_items.discounted_total.amount", 0]}},
                }},
                {"$sort": {"sales": DESCENDING, "_id": ASCENDING}},
                {"$limit": 8},
                {"$project": {"_id": 0, "title": "$_id", "quantity": 1, "sales": 1}},
            ],
        }},
    ]
    inventory_pipeline = [
        {"$match": match},
        {"$group": {
            "_id": None,
            "available_inventory": {"$sum": {"$ifNull": ["$quantities.available", 0]}},
            "low_stock_variants": {"$sum": {"$cond": [{"$and": [
                {"$eq": ["$tracked", True]},
                {"$lte": [{"$ifNull": ["$quantities.available", 0]}, 3]},
            ]}, 1, 0]}},
        }},
        {"$project": {"_id": 0}},
    ]
    low_stock_pipeline = [
        {"$match": {"sync_id": sync_id, "tracked": True, "quantities.available": {"$lte": 3}}},
        {"$sort": {"quantities.available": ASCENDING, "product_title": ASCENDING}},
        {"$limit": 12},
    ]
    started = time.perf_counter()
    order_result, inventory_result, low_stock, active_products, shop, meta = await asyncio.gather(
        db.orders.aggregate(orders_pipeline).to_list(length=1),
        db.inventory_items.aggregate(inventory_pipeline).to_list(length=1),
        db.inventory_items.aggregate(low_stock_pipeline).to_list(length=12),
        db.products.count_documents({"sync_id": sync_id, "status": "ACTIVE"}),
        db.shop.find_one({"sync_id": sync_id}, NO_ID),
        active_sync_document(),
    )
    logger.info(
        "performance_database collection=snapshot operation=overview_aggregation returned=%s duration_ms=%.2f",
        len(order_result),
        (time.perf_counter() - started) * 1000,
    )
    order_data = order_result[0] if order_result else {}
    summary = (order_data.get("summary") or [{}])[0]
    inventory_summary = (inventory_result or [{}])[0]
    return {
        "source": "shopify",
        "currency": (shop or {}).get("currency") or "CHF",
        "last_sync": (meta or {}).get("last_synced_at"),
        "sync": meta,
        "cards": {
            "orders": int(summary.get("orders") or 0),
            "gross_sales": round(float(summary.get("gross_sales") or 0), 2),
            "unfulfilled": int(summary.get("unfulfilled") or 0),
            "refunded_orders": int(summary.get("refunded_orders") or 0),
            "refunded_total": round(float(summary.get("refunded_total") or 0), 2),
            "active_products": active_products,
            "available_inventory": int(inventory_summary.get("available_inventory") or 0),
            "low_stock_variants": int(inventory_summary.get("low_stock_variants") or 0),
        },
        "financial_statuses": aggregate_counter(order_data.get("financial_statuses") or []),
        "fulfillment_statuses": aggregate_counter(order_data.get("fulfillment_statuses") or []),
        "recent_orders": [order_with_derived(order) for order in order_data.get("recent_orders") or []],
        "low_stock": low_stock,
        "top_products": [
            {**product, "quantity": int(product.get("quantity") or 0), "sales": round(float(product.get("sales") or 0), 2)}
            for product in order_data.get("top_products") or []
        ],
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
    filters: list[dict[str, Any] | None] = [
        {"sync_id": sync_id},
        mongo_contains(
            q,
            (
                "order_number",
                "confirmation_number",
                "email",
                "phone",
                "customer.display_name",
                "shipping_address.city",
                "line_items.sku",
                "line_items.name",
                "line_items.product_title",
                "tracking.number",
            ),
        ),
        {"financial_status": financial_status.upper()} if financial_status else None,
        {"fulfillment_status": fulfillment_status.upper()} if fulfillment_status else None,
        {"delivery_method": delivery_method.upper()} if delivery_method else None,
    ]
    direct_legacy_filters: dict[str, dict[str, Any]] = {
        "unfulfilled": {"fulfillment_status": {"$ne": "FULFILLED"}, "cancelled_at": None},
        "shipping": {"delivery_method": "SHIPPING"},
        "pickup": {"delivery_method": "PICKUP_OR_OTHER"},
        "cancelled-refunded": {
            "$or": [
                {"cancelled_at": {"$ne": None}},
                {"financial_status": {"$in": ["REFUNDED", "PARTIALLY_REFUNDED"]}},
            ]
        },
    }
    age_filters = {
        "over-8": 8,
        "over-14": 14,
        "over-30": 30,
    }
    if filter in direct_legacy_filters:
        filters.append(direct_legacy_filters[filter])
    query = combine_mongo_filters(*filters)

    if filter in age_filters:
        # Business-day age is deliberately retained as an exact Python rule. A
        # conservative calendar bound reduces candidates without excluding a match.
        threshold = age_filters[filter]
        query = combine_mongo_filters(query, {"processed_at": {"$lte": business_day_candidate_cutoff(threshold)}})
        started = time.perf_counter()
        candidates = await db.orders.find(query, NO_ID).sort("processed_at", DESCENDING).to_list(None)
        orders = [
            order for order in candidates
            if business_day_age(order.get("processed_at")) > threshold
            and order.get("fulfillment_status") != "FULFILLED"
        ]
        logger.info(
            "performance_database collection=orders operation=business_day_filter candidates=%s returned=%s duration_ms=%.2f",
            len(candidates),
            len(orders),
            (time.perf_counter() - started) * 1000,
        )
        total = len(orders)
        start = (page - 1) * page_size
        items = orders[start:start + page_size]
        return {
            "items": [order_with_derived(order) for order in items],
            "total": total,
            "page": page,
            "page_size": page_size,
            "pages": max((total + page_size - 1) // page_size, 1),
        }

    result = await paginated_snapshot_records(
        "orders",
        query,
        sort=("processed_at", DESCENDING),
        page=page,
        page_size=page_size,
    )
    result["items"] = [order_with_derived(order) for order in result["items"]]
    return result


async def find_active(collection: str, record_id: str) -> dict[str, Any]:
    sync_id = await active_sync_id()
    selectors = [{"id": record_id}, {"shopify_id": record_id}]
    if collection == "orders":
        selectors.append({"order_number": record_id})
    record = await db[collection].find_one({"sync_id": sync_id, "$or": selectors}, NO_ID)
    if not record:
        raise HTTPException(status_code=404, detail=f"{collection.rstrip('s').title()} not found")
    return record


async def active_shopify_fact_card_for_thread(thread_messages: list[dict[str, Any]]) -> tuple[dict[str, Any] | None, str]:
    """Resolve one explicit order reference against the active read-only snapshot.

    Gmail drafting stays available when no snapshot/reference exists. The resolver
    never matches customers by name, email, phone, product, or partial number.
    """
    references = extract_thread_order_references(thread_messages)
    if not references:
        return None, "reference_missing"
    if len(references) != 1:
        return None, "reference_ambiguous"
    sync_id = await active_sync_id(required=False)
    if not sync_id:
        return None, "active_snapshot_missing"

    reference = references[0]
    matches = await db.orders.find(
        {
            "sync_id": sync_id,
            "order_number": {"$in": [reference, f"#{reference}"]},
        },
        NO_ID,
    ).limit(2).to_list(length=2)
    if not matches:
        return None, "order_not_found"
    if len(matches) != 1:
        return None, "order_ambiguous"
    try:
        return build_shopify_fact_card(matches[0]), "available"
    except ValueError:
        logger.warning("Active Shopify order could not be transformed into a draft fact card")
        return None, "invalid_snapshot_record"


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
async def list_products(
    q: str | None = None,
    status: str | None = None,
    limit: int = Query(default=250, ge=1, le=500),
) -> list[dict[str, Any]]:

    sync_id = await active_sync_id()
    query = combine_mongo_filters(
        {"sync_id": sync_id},
        mongo_contains(q, ("title", "vendor", "product_type", "handle")),
        {"status": status.upper()} if status else None,
    )
    started = time.perf_counter()
    products = await db.products.find(query, NO_ID).sort("title", ASCENDING).to_list(length=limit)

    logger.info(
        "performance_database collection=products operation=list returned=%s duration_ms=%.2f",
        len(products),
        (time.perf_counter() - started) * 1000,
    )
    return products


@api.get("/products/{product_id}")
async def get_product(product_id: str) -> dict[str, Any]:
    product = await find_active("products", product_id)
    sync_id = product["sync_id"]
    product["variants"] = await db.variants.find({"sync_id": sync_id, "shopify_product_id": product["shopify_id"]}, NO_ID).sort("title", ASCENDING).to_list(length=250)
    product["inventory"] = await db.inventory_items.find({"sync_id": sync_id, "shopify_product_id": product["shopify_id"]}, NO_ID).to_list(length=250)

    return product


@api.get("/inventory")
async def list_inventory(
    q: str | None = None,
    low_stock: bool = False,
    page: int = Query(default=1, ge=1),
    page_size: int = Query(default=100, ge=1, le=250),
) -> dict[str, Any]:
    sync_id = await active_sync_id()
    query = combine_mongo_filters(
        {"sync_id": sync_id},
        mongo_contains(q, ("sku", "product_title", "variant_title")),
        {"tracked": True, "quantities.available": {"$lte": 3}} if low_stock else None,
    )
    return await paginated_snapshot_records(
        "inventory_items",
        query,
        sort=("product_title", ASCENDING),
        page=page,
        page_size=page_size,
    )


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
        ).sort("processed_at", ASCENDING).to_list(length=250)

    return item


@api.get("/customers")
async def list_customers(
    q: str | None = None,
    page: int = Query(default=1, ge=1),
    page_size: int = Query(default=100, ge=1, le=250),
) -> dict[str, Any]:
    sync_id = await active_sync_id()
    query = combine_mongo_filters(
        {"sync_id": sync_id},
        mongo_contains(q, ("display_name", "email", "phone", "default_address.city")),
    )
    return await paginated_snapshot_records(
        "customers",
        query,
        sort=("updated_at", DESCENDING),
        page=page,
        page_size=page_size,
    )


@api.get("/customers/{customer_id}")
async def get_customer(customer_id: str) -> dict[str, Any]:
    customer = await find_active("customers", customer_id)
    customer["orders"] = [
        order_with_derived(order)
        for order in await db.orders.find(
            {"sync_id": customer["sync_id"], "customer.shopify_id": customer["shopify_id"]}, NO_ID
        ).sort("processed_at", DESCENDING).to_list(length=250)
    ]
    return customer


@api.get("/fulfillment")
@api.get("/fulfillments")
async def list_fulfillments(limit: int = Query(default=250, ge=1, le=500)) -> list[dict[str, Any]]:
    sync_id = await active_sync_id()
    return await db.fulfillments.find({"sync_id": sync_id}, NO_ID).sort("created_at", DESCENDING).to_list(length=limit)


@api.get("/refunds")
async def list_refunds(limit: int = Query(default=250, ge=1, le=500)) -> list[dict[str, Any]]:
    sync_id = await active_sync_id()
    return await db.refunds.find({"sync_id": sync_id}, NO_ID).sort("created_at", DESCENDING).to_list(length=limit)


@api.get("/returns")
async def list_returns(limit: int = Query(default=250, ge=1, le=500)) -> list[dict[str, Any]]:
    sync_id = await active_sync_id()
    return await db.returns.find({"sync_id": sync_id}, NO_ID).sort("created_at", DESCENDING).to_list(length=limit)


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
async def get_integration_health(connection_id: str) -> dict[str, Any]:
    """Read the last safe health record without creating evidence as a GET side effect."""
    connection = await integration_connection_or_404(connection_id)
    latest = await db[INTEGRATION_HEALTH].find_one(
        {"connection_id": connection_id},
        NO_ID,
        sort=[("checked_at", DESCENDING)],
    )
    return latest or connection_health(connection)


@api.post("/integrations/{connection_id}/health")
async def record_integration_health(connection_id: str) -> dict[str, Any]:
    """Record an explicitly requested local readiness check with bounded retention."""
    connection = await integration_connection_or_404(connection_id)
    health = {
        **connection_health(connection),
        "id": str(uuid.uuid4()),
        "expires_at": retention_expiry(INTEGRATION_HEALTH_RETENTION_DAYS),
    }
    await db[INTEGRATION_HEALTH].insert_one(health)
    return {key: value for key, value in health.items() if key not in {"_id", "expires_at"}}


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
    orders_result, products, customers_result, inventory_result = await asyncio.gather(
        list_orders(q=q, page=1, page_size=8),
                list_products(q=q, limit=8),

        list_customers(q=q, page=1, page_size=8),
        list_inventory(q=q, page=1, page_size=8),
    )
    return {
        "orders": orders_result["items"],
        "products": products[:8],
        "customers": customers_result["items"],
        "inventory": inventory_result["items"],
    }


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
        shopify_fact_card, shopify_fact_status = await active_shopify_fact_card_for_thread(messages)
        return generate_ai_reply(
            thread_messages=messages,
            sender_name=str(payload.get("sender_name") or "E-RYDEZ Team")[:100],
            language_hint=str(payload.get("language") or "")[:50] or None,
            custom_instructions=str(payload.get("instructions") or "")[:500] or None,
            profile_hint=str(payload.get("profile_id") or "")[:80] or None,
            shopify_fact_card=shopify_fact_card,
            shopify_fact_status=shopify_fact_status,
        )
    except GmailServiceError as exc:
        raise gmail_http_exception(exc) from exc


@api.post("/gmail/send")
async def gmail_send_message(payload: dict[str, Any] = Body(...)) -> dict[str, Any]:
    """Send one explicitly confirmed existing-thread reply per idempotency key.

    Recipients, subject, and RFC threading headers are derived from the source
    Gmail thread. Browser-provided recipient headers are intentionally ignored.
    """
    thread_id = str(payload.get("thread_id") or "").strip()
    content = str(payload.get("content") or "")
    idempotency_key = str(payload.get("idempotency_key") or "").strip()
    if not thread_id:
        raise HTTPException(status_code=422, detail="Gmail-Thread-ID ist erforderlich")
    if not content.strip() or len(content) > 50_000:
        raise HTTPException(status_code=422, detail="Gmail reply content must contain 1 to 50000 characters")
    provider_send_started = False
    try:
        await require_active_gmail_connection()
        replay = await start_gmail_send_operation(thread_id, content, idempotency_key)
        if replay is not None:
            return {"ok": True, "result": replay, "replayed": True}
        provider_send_started = True
        result = await send_thread_reply(db, thread_id, content)
        await complete_gmail_send_operation(idempotency_key, result)
        await append_integration_audit(
            GMAIL_CONNECTION_ID,
            local_operator_label(),
            "thread_reply_sent",
            "User-confirmed Gmail reply sent in existing thread",
            "active",
            "active",
        )
        return {"ok": True, "result": result, "replayed": False}
    except GmailServiceError as exc:
        if provider_send_started and idempotency_key and IDEMPOTENCY_KEY_PATTERN.fullmatch(idempotency_key):
            await mark_gmail_send_outcome_unknown(idempotency_key)
        raise gmail_http_exception(exc) from exc
    except PyMongoError as exc:
        if provider_send_started and idempotency_key and IDEMPOTENCY_KEY_PATTERN.fullmatch(idempotency_key):
            await mark_gmail_send_outcome_unknown(idempotency_key)
            raise HTTPException(
                status_code=502,
                detail="Gmail send outcome is unknown; do not retry this confirmation and refresh the thread",
            ) from exc
        raise HTTPException(status_code=503, detail="Local Gmail send operation storage is unavailable") from exc


app.include_router(api)

if CORS_ORIGINS:
    app.add_middleware(
        CORSMiddleware,
        allow_credentials=True,
        allow_origins=list(CORS_ORIGINS),

        allow_methods=["*"],
        allow_headers=["*"],
    )

logging.basicConfig(level=logging.INFO, format="%(asctime)s - %(name)s - %(levelname)s - %(message)s")
