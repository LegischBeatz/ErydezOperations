# API and Data Contracts

## Contract Authority

The implemented contract is `backend/server.py`. Browser code must call it only through [`frontend/src/lib/api.js`](../../frontend/src/lib/api.js). This document records current behavior; it does not create an external versioned-service guarantee. Any change to route paths, request validation, response fields, or error behavior must update the backend, API client, tests, this document, and the matching runbook in one change.

The Gmail contract is separated into [`gmail.md`](gmail.md) because Gmail has OAuth, content-safety, and real send-side-effect rules that do not apply to canonical Shopify data.

## HTTP Envelope

| Property | Current contract |
|---|---|
| Base path | `/api` |
| Representation | JSON request and response bodies unless an OAuth route redirects the browser. |
| Authentication | None at the application layer. Compose publishes only the frontend loopback port by default; do not treat this as an Internet-facing API. |
| CORS | Disabled unless `CORS_ORIGINS` is non-empty. When configured, it enables credentials and all methods/headers for the listed origins. |
| API schema | FastAPI provides runtime OpenAPI from implementation annotations, but handlers return direct JSON dictionaries/lists rather than explicit Pydantic response models. |
| Performance timing | API responses include a `Server-Timing: app;dur=…` duration for browser diagnostics. Backend logs record only method, route template, status, duration, response-byte hint, and aggregate database timings; they never log query text, customer fields, Gmail content, credentials, or provider payloads. |
| Error body | FastAPI `HTTPException` responses use `{ "detail": "..." }`; request parsing/validation may return FastAPI’s standard `422` detail array. |

## Data Ownership

| Data family | Authority | API behavior |
|---|---|---|
| Commerce | Shopify Admin GraphQL | The API serves only the active normalized MongoDB snapshot. It does not mutate Shopify. |
| Snapshot state | FastAPI/MongoDB | `meta.id = "shopify_sync"` identifies active snapshot metadata; `sync_runs` provides recent execution records. |
| Integration control | FastAPI/MongoDB | Connection readiness, lifecycle intent, health snapshots, recovery owner, and audit records are console-owned metadata. |
| Gmail | Gmail REST API | Threads are retrieved on demand. MongoDB stores OAuth state, encrypted refresh-token data, and safe refresh metadata, not a mailbox mirror. |
| AI drafts | Optional OpenAI-compatible endpoint | A draft is generated per request and returned to the browser. It is not persisted or sent by draft generation. |

## Health and Shopify Synchronization

| Method and path | Request inputs | Response / behavior |
|---|---|---|
| `GET /api/` | None | Identity object with API title message, `schema_version`, and `source: "shopify"`. |
| `GET /api/health/live` | None | `{ "status": "live" }`; it does not test MongoDB or Shopify. |
| `GET /api/health/ready` | None | Pings MongoDB and returns `{ "status": "ready", "shopify_snapshot_active": boolean }`. Mongo failure is `503`. |
| `GET /api/shopify/status` | `live` boolean query; defaults to `true` | Safe configuration and snapshot state. When live and configured, it calls Shopify for profile/count status. It never returns secrets. |
| `POST /api/shopify/sync` | Empty body accepted | Starts a complete snapshot synchronization. Only one process-local run is allowed. Success returns `ok`, `run_id`, active snapshot metadata, validation, cleanup, and insertion counts. |
| `GET /api/shopify/sync-runs` | None | Up to 25 newest-first sync-run documents. |
| `POST /api/reset` | Any | Permanently removed compatibility endpoint; always `410`. |

A synchronization reads accessible Shopify records, validates a staged snapshot, then switches the active metadata record. See [`../runbooks/shopify-synchronization.md`](../runbooks/shopify-synchronization.md) for operational procedure and [`../architecture.md`](../architecture.md) for the activation sequence.

## Canonical Commerce Queries

All canonical routes below require an active snapshot. Without one, they return `503` with `No successful Shopify snapshot is active`.

| Method and path | Query or path inputs | Response shape and rules |
|---|---|---|
| `GET /api/overview` | None | Shopify-derived dashboard: `source`, `currency`, `last_sync`, `sync`, `cards`, financial/fulfillment counts, recent orders, low stock, and top products. |
| `GET /api/orders` | `q`, `filter`, `financial_status`, `fulfillment_status`, `delivery_method`, `page` ≥ 1, `page_size` 1–250 | Paginated order response. Search and directly expressible status/delivery filters execute against the active MongoDB snapshot before page data is transferred. `filter` recognizes `unfulfilled`, `over-8`, `over-14`, `over-30`, `shipping`, `pickup`, and `cancelled-refunded`; age thresholds preserve their existing exact business-day rule after inexpensive snapshot filters. Unrecognized values do not add a filter. |
| `GET /api/orders/{order_id}` | Normalized ID, Shopify GID, or order number | Active order with derived `business_day_age`, `customer_name`, and `city`; `404` when absent. |
| `POST /api/orders/{order_id}/notes` | Any body | Legacy write route; always `409`. |
| `POST /api/orders/{order_id}/pause-updates` | Any body | Legacy write route; always `409`. |
| `POST /api/orders/{order_id}/timeline` | Any body | Legacy write route; always `409`. |
| `GET /api/products` | `q`, `status` | Active product list, sorted by title. Text/status predicates execute against the active MongoDB snapshot before records are returned. |
| `GET /api/products/{product_id}` | Normalized ID or Shopify GID | Product plus linked active `variants` and `inventory`; `404` when absent. |
| `GET /api/inventory` | `q`, `low_stock` boolean, `page` ≥ 1, `page_size` 1–250 | Paginated inventory items. Text/low-stock predicates execute against the active MongoDB snapshot before page data is transferred. Low stock means tracked with `quantities.available <= 3`. |
| `GET /api/inventory/{item_id}` | Normalized ID, Shopify GID, or SKU | Inventory item plus linked `variant`, `product`, and unfulfilled `open_orders`; `404` when absent. |
| `GET /api/customers` | `q`, `page` ≥ 1, `page_size` 1–250 | Paginated active customers. Text predicates execute against the active MongoDB snapshot before page data is transferred. |
| `GET /api/customers/{customer_id}` | Normalized ID or Shopify GID | Customer plus linked active orders; `404` when absent. |
| `GET /api/fulfillment` and `GET /api/fulfillments` | None | Same newest-first active fulfillment list. |
| `GET /api/refunds` | None | Newest-first active refund list. |
| `GET /api/returns` | None | Newest-first active return list. |
| `GET /api/returns/{return_id}` | Normalized ID or Shopify GID | One active return; `404` when absent. |
| `GET /api/reports` | None | Read-only report derived from `overview`, including current `refreshed_at`. |
| `GET /api/search` | Required `q` string | Up to eight matching orders, products, customers, and inventory items per family. The independent active-snapshot family queries run concurrently. Empty/whitespace query returns empty arrays. |

### Pagination Shape

Orders, inventory, and customers use one-based pages. `pages` is always at least `1`, including an empty result.

```json
{
  "items": [],
  "total": 0,
  "page": 1,
  "page_size": 100,
  "pages": 1
}
```

### Canonical Record Baseline

Every persisted canonical record created by `backend/shopify.py` carries the following fields. Source fields may be `null` or empty when Shopify did not supply them; the API does not synthesize a substitute.

| Field | Meaning |
|---|---|
| `id` | Normalized short Shopify resource ID used by console routes. |
| `shopify_id` | Original Shopify GraphQL GID. |
| `source` | Always `shopify`. |
| `sync_id` | Complete snapshot membership identifier. |
| `synced_at` | Snapshot acquisition timestamp. |

| Entity | Contractually relevant fields and links |
|---|---|
| Order | Number, confirmation number, timestamps, financial/fulfillment/return status, customer, addresses, shipping data, money bags, line items, fulfillment/refund/return arrays, and tracking. |
| Product | Title, handle, status, vendor/type, tags, category, media, options, price ranges, source timestamps, and variant IDs/count. |
| Variant | Product links, SKU/barcode, prices, availability, inventory state, selected options, image, and Shopify inventory-item link. |
| Inventory item | Variant/product links, SKU, tracking flags, origin/cost/weight, aggregate quantity states, and location-level quantities. |
| Customer | Display identity, email/phone, source state/tags/notes, aggregate order/spend data, default address, and timestamps. |
| Fulfillment, refund, return | Parent order link plus provider-specific status, timestamp, quantity, money, tracking, or note fields. |

Money values are normalized into a money bag with `amount`, `currency`, `presentment_amount`, and `presentment_currency`. Inventory quantity maps use `available`, `committed`, `incoming`, `on_hand`, and `reserved` when normalized from the provider.

## Integration Control and Local Evidence

These routes manage console-owned integration records. They do not synchronize, mutate, or store provider payloads. `GET /api/integrations/{connection_id}/health` is intentionally a GET route that also inserts a health snapshot.

| Method and path | Request inputs | Behavior |
|---|---|---|
| `GET /api/integrations` | None | Shopify summary followed by console integration records with safe public connection and computed health data. |
| `POST /api/integrations/gmail/initialize` | JSON `{ "reason": string }`, at least 8 characters | Creates the one local Gmail readiness record. Returns `409` if it already exists; no OAuth or Gmail data action occurs. |
| `GET /api/integrations/{connection_id}` | Path ID | Safe connection fields plus latest recorded or computed health; `404` if unknown. |
| `GET /api/integrations/{connection_id}/health` | Path ID | Computes and persists a safe health snapshot; `404` if unknown. |
| `GET /api/integrations/{connection_id}/audit` | Path ID | Up to 100 newest-first console audit events; `404` if unknown. |
| `GET /api/audit-timeline` | `limit` 1–500; default 250 | Read-only, newest-first safe audit timeline and scope note. |
| `GET /api/provider-ledger` | `limit` 1–500; default 250 | Merged local Shopify sync-run and integration-control evidence; no provider events or payloads. |
| `POST /api/integrations/{connection_id}/lifecycle` | JSON `action` and `reason` ≥ 8 characters | Records allowed lifecycle intent: `pause`, `resume`, `request_reauthorization`, or `request_disconnect`. Invalid actions/states return `422` or `409`. |
| `POST /api/integrations/{connection_id}/recovery-owner` | JSON `display_name` ≥ 3 chars and `reason` ≥ 8 chars | Assigns a console recovery owner and writes audit evidence. |

Public integration records include ID, provider, environment, display identity, lifecycle and desired state, capabilities, business/recovery owner, timestamps, and last action reason. They omit credentials, tokens, provider payloads, and raw Gmail content.

## Gmail Workspace

| Method and path | Contract summary |
|---|---|
| `GET /api/gmail/status` | Safe OAuth configuration, connection, lifecycle, refresh, and AI availability state. |
| `GET /api/gmail/oauth/start` | Starts a CSRF-protected OAuth flow and redirects to Google. |
| `GET /api/gmail/oauth/callback` | Consumes the authorization response and redirects to `/gmail` with an outcome code. |
| `POST /api/gmail/disconnect` | Revokes Google access where possible and deletes local authorization data. |
| `GET /api/gmail/threads` | On-demand list of compact normalized thread summaries, Gmail-search query support, 1–100 results, optional page token. A short-lived in-memory access token and bounded metadata-request concurrency reduce provider round trips without creating a mailbox mirror. |
| `GET /api/gmail/threads/{thread_id}` | Full normalized on-demand thread. |
| `POST /api/gmail/threads/{thread_id}/ai-reply` | Returns an editable draft only. |
| `POST /api/gmail/send` | Sends an explicitly requested existing-thread reply using server-derived addressing/threading metadata. |

See [`gmail.md`](gmail.md) for the detailed Gmail request, response, safety, and failure contract.

## Legacy Compatibility Surface

The following routes remain so old pages can receive an empty response instead of a missing route. They are **not primary navigation workflows** and must not be documented as implemented business capabilities.

| Route | Current response |
|---|---|
| `GET /api/work-items` | `{ "items": [], "counts": {} }` |
| `GET /api/conversations`, `/api/appointments`, `/api/automations`, `/api/approvals`, `/api/notifications` | `[]` |
| `GET /api/automations/runs` | `[]` |
| `GET /api/purchasing` | `{ "suppliers": [], "purchase_orders": [] }` |

The API client also retains obsolete helpers for now-unnavigated mock-era pages. Their presence is not a compatibility commitment for successful mutation; many target routes have no server implementation or intentionally return `409`.

## Validation and Failure Semantics

| Condition | Status | Consumer / operator behavior |
|---|---|---|
| MongoDB unavailable for readiness | `503` | Restore database connectivity. |
| No active Shopify snapshot for canonical query | `503` | Run a successful complete sync; do not seed mock data. |
| Canonical record or integration connection absent | `404` | Return to the parent view or correct the identifier. |
| Concurrent Shopify sync | `409` | Wait for the active run and inspect sync history. |
| Shopify write or legacy order mutation attempt | `409` | Perform the commerce change in Shopify, not this console. |
| Invalid lifecycle transition | `409` | Check lifecycle state and submit an allowed next action. |
| Gmail access paused by local lifecycle | `409` | Resume only through the integration control workflow. |
| Removed reset request | `410` | Do not reseed; synchronize Shopify. |
| Invalid request, invalid pagination, short reason/name, missing required query/body | `422` | Correct the request. |
| Gmail authorization missing/expired/revoked | `401` | Reauthorize through the OAuth workflow. |
| AI provider has no quota | `402` | Manual Gmail reply remains possible; resolve AI-provider quota separately. |
| Shopify, Gmail, or OAuth provider failure | Usually `502` | Preserve active snapshot or Gmail state, inspect safe errors/logs, then retry after diagnosis. |
| Gmail OAuth or encryption configuration absent | `503` | Configure the required environment variables without exposing secret values. |

## Runtime Configuration

| Component | Variable | Required when | Meaning |
|---|---|---|---|
| Backend | `MONGO_URL` | Always | Authenticated MongoDB connection URL. |
| Backend | `DB_NAME` | Always | MongoDB database name. |
| Backend | `CORS_ORIGINS` | Only separate browser origins | Comma-separated allowlist; blank disables CORS middleware. |
| Backend | `ERYDEZ_LOCAL_OPERATOR_LABEL` | Optional | Safe attribution label for console-owned audit evidence. |
| Shopify | `SHOPIFY_STORE_DOMAIN` | Shopify status/sync | MyShopify domain; protocol is stripped and suffix normalized by code. |
| Shopify | `SHOPIFY_CLIENT_ID`, `SHOPIFY_CLIENT_SECRET` | Client-credentials mode | Credentials used to obtain a short-lived Admin API token. |
| Shopify | `SHOPIFY_ADMIN_ACCESS_TOKEN` | Static-token alternative | Used only when it has the expected Admin-token form; client credentials remain alternative. |
| Shopify | `SHOPIFY_API_VERSION` | Optional | Defaults to `2025-10`. |
| Gmail | `GOOGLE_OAUTH_CLIENT_ID`, `GOOGLE_OAUTH_CLIENT_SECRET`, `GMAIL_OAUTH_REDIRECT_URI`, `GMAIL_TOKEN_ENCRYPTION_KEY` | Gmail OAuth | Required configuration for Google OAuth and Fernet token encryption. |
| AI drafts | `OPENAI_API_KEY` | AI draft generation only | Enables the optional draft provider. |
| AI drafts | `OPENAI_API_BASE`, `GMAIL_AI_MODEL`, `GMAIL_AI_MAX_COMPLETION_TOKENS` | Optional | Provider base URL and draft model/output budget configuration. |
| Frontend development | `REACT_APP_BACKEND_URL` | Separate dev servers | Backend origin without `/api`; blank in production enables Nginx same-origin `/api`. |

## Compatibility Rules

The code has a numeric `schema_version` in the API identity and active snapshot metadata, currently set by `backend/server.py`. It is not a comprehensive wire-format versioning system. Maintain compatibility deliberately: retain an existing field/route or coordinate all callers and documentation in the same change; add migration/rollback instructions for canonical schema changes; and record data-ownership, lifecycle, security, or deployment changes in an ADR.

## Implementation Sources

This contract is derived from [`backend/server.py`](../../backend/server.py), [`backend/shopify.py`](../../backend/shopify.py), [`backend/gmail_service.py`](../../backend/gmail_service.py), [`frontend/src/lib/api.js`](../../frontend/src/lib/api.js), and the current backend/frontend tests.
