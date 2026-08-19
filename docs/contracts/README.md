# Contracts

## Purpose

This directory documents the implemented browser-to-API boundary. `frontend/src/lib/api.js` remains the client boundary, `backend/server.py` defines server behavior, and `backend/shopify.py` owns Shopify transport and normalization. Shopify is authoritative; MongoDB is a canonical read model.

## HTTP API

| Property | Contract |
|---|---|
| Base path | `/api` |
| Transport | JSON over HTTP |
| Authentication | None; trusted-LAN deployment only |
| Runtime schema | FastAPI-generated OpenAPI |
| Operational mutation policy | Shopify records are read-only in this console |
| Active-record scope | All canonical queries use the active `sync_id` |

### Health, Identity, and Synchronization

| Method and path | Purpose | Notable inputs or rules |
|---|---|---|
| `GET /api/` | API identity | Returns source `shopify` and schema version. |
| `GET /api/health/live` | Process liveness | Does not check MongoDB or Shopify. |
| `GET /api/health/ready` | Persistence readiness | Pings MongoDB and reports whether an active Shopify snapshot exists. |
| `GET /api/shopify/status` | Connection and snapshot status | Optional `live=true` performs a live Shopify profile/count check. Never returns credentials. |
| `POST /api/shopify/sync` | Complete authoritative synchronization | Single-run lock; stages, validates, activates, then cleans stale/mock data. HTTP 409 if already running. |
| `GET /api/shopify/sync-runs` | Recent synchronization history | Newest first; bounded history. |
| `POST /api/reset` | Removed mock reset | Returns HTTP 410; it never deletes the active Shopify snapshot. |

### Canonical Shopify Queries

| Method and path | Purpose | Notable inputs or rules |
|---|---|---|
| `GET /api/overview` | Shopify-derived dashboard aggregates | Returns source, currency, sales, status counts, recent orders, top products, and low-stock items. |
| `GET /api/orders` | Paginated Shopify orders | `q`, `financial_status`, `fulfillment_status`, `cancelled`, `requires_shipping`, `page`, `page_size`. |
| `GET /api/orders/{id}` | Canonical order detail | Accepts normalized legacy ID; contains customer, addresses, money, items, fulfillments, refunds, Returns, and tracking. |
| `GET /api/products` | Product catalog | Optional `q` and Shopify `status`. Includes price range, variant/inventory summary, and media. |
| `GET /api/products/{id}` | Product detail | Adds linked variants and inventory items. |
| `GET /api/inventory` | Paginated inventory items | `q`, `low_stock`, `page`, `page_size`; quantity states and location levels. |
| `GET /api/inventory/{id}` | Inventory detail | Adds linked open orders and duplicate-SKU count. |
| `GET /api/customers` | Paginated Shopify customers | `q`, `page`, `page_size`. |
| `GET /api/customers/{id}` | Customer detail | Adds linked Shopify orders. |
| `GET /api/fulfillments` | Shopify fulfillment records | Newest first; tracking, status, timestamps, and line quantities. |
| `GET /api/refunds` | Shopify refunds | Newest first; linked orders, money, refund lines, transactions, restock behavior. |
| `GET /api/returns` | Shopify Return objects | Newest first; distinct from refunds. |
| `GET /api/search` | Cross-entity search | `q`; searches orders, products, customers, and inventory within the active snapshot. |
| `GET /api/reports` | Shopify-derived aggregates | Read-only overview-compatible report payload. |
| `GET /api/integrations` | Shopify integration summary | Returns configured/health state, last sync, and active counts. |

### Gmail Workspace

The Gmail OAuth, thread reading, AI drafting and confirmed thread-reply surface is documented separately in [`gmail.md`](gmail.md). Gmail messages remain outside the canonical Shopify snapshot model. The browser must use the centralized API client and may only render the sanitized `htmlBody` returned by the Gmail service.

### Compatibility Stubs

Former mock-only list routes for work items, conversations, appointments, automations, approvals, and notifications return empty collections. Former order-note and update-suppression mutations return HTTP 409 with an explicit source-of-truth message. They remain temporary compatibility stubs and are not used by the production navigation.

## Canonical Data Contract

Every canonical Shopify document contains:

| Field | Meaning |
|---|---|
| `source` | Always `shopify` |
| `sync_id` | Snapshot membership identifier |
| `shopify_id` | Stable Shopify GraphQL GID |
| `id` | Normalized legacy/resource identifier used in console URLs |
| `synced_at` | Snapshot acquisition timestamp |

Entity-specific records retain authoritative statuses, timestamps, money bags, addresses, line items, media, options, quantities, and relationship identifiers. Missing source fields remain `null`, empty, or explicitly unavailable; the API does not invent mock replacements.

## Pagination Contract

Orders, customers, and inventory use one-based `page` and bounded `page_size` values. Responses have the following shape:

```json
{
  "items": [],
  "total": 0,
  "page": 1,
  "page_size": 100,
  "pages": 0
}
```

Shopify ingestion itself uses cursor pagination and does not rely on console page numbers.[1]

## Validation and Errors

| Condition | HTTP result | Consumer action |
|---|---|---|
| Missing canonical record | 404 | Return to the corresponding list or refresh after synchronization. |
| Synchronization already active | 409 | Wait for the active run; inspect sync history. |
| Attempted mock mutation | 409 | Perform the change in Shopify. |
| Removed reset endpoint | 410 | Never reseed; run a validated Shopify synchronization. |
| Shopify/configuration/integrity failure | 502 | Preserve the active snapshot, inspect run history and logs, correct the cause, then retry. |
| MongoDB unavailable | 503 readiness | Restore persistence connectivity. |
| Invalid query/body | 422 | Correct the request. |

A new snapshot is not activated when source counts, Shopify-ID uniqueness, stored counts, or cross-record links fail validation.

## Runtime Configuration Contract

| Component | Variable | Required | Meaning |
|---|---|---|---|
| Backend | `MONGO_URL` | Yes | Authenticated MongoDB connection URL. |
| Backend | `DB_NAME` | Yes | MongoDB database name. |
| Backend | `CORS_ORIGINS` | No | Comma-separated allowed origins; blank disables cross-origin access. |
| Backend | `SHOPIFY_STORE_DOMAIN` | Yes | Permanent `*.myshopify.com` store domain without protocol/path. |
| Backend | `SHOPIFY_CLIENT_ID` | For client credentials | Shopify app client ID. |
| Backend | `SHOPIFY_CLIENT_SECRET` | For client credentials | Shopify app client secret; untracked and never returned. |
| Backend | `SHOPIFY_ADMIN_ACCESS_TOKEN` | Alternative | Static Admin API token; optional when client credentials are configured. |
| Backend | `SHOPIFY_API_VERSION` | No | Admin API version; defaults to the application-tested value. |
| Frontend | `REACT_APP_BACKEND_URL` | Development only | API origin without `/api`; production uses same-origin `/api`. |
| Frontend dev server | `ENABLE_HEALTH_CHECK` | No | Enables custom development-server health routes when `true`. |

## Compatibility

The canonical snapshot schema is versioned through `schema_version` in synchronization metadata and the API identity. Schema changes require synchronized backend, frontend, tests, contracts, runbooks, and an explicit migration/rollback plan.

## References

[1]: https://shopify.dev/docs/api/usage/pagination-graphql "Shopify GraphQL pagination"
[2]: https://shopify.dev/docs/apps/build/authentication-authorization/client-secrets "Shopify client credentials"
