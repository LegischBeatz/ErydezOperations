# Contracts

## Purpose

This directory documents the implemented browser-to-API boundary. The source of truth remains
`frontend/src/lib/api.js` for client calls and `backend/server.py` for server behavior.

## HTTP API

- **Base path:** `/api`
- **Transport:** JSON over HTTP.
- **Authentication:** None is implemented.
- **Schema definition:** No OpenAPI file is checked in and request bodies currently use untyped
  dictionaries. FastAPI serves its generated schema at runtime.

| Method and path | Purpose | Notable inputs or rules |
|---|---|---|
| `GET /api/` | API identity | Returns the console API message. |
| `POST /api/reset` | Rebuild seeded collections | Destructive; intended for disposable/test data. |
| `GET /api/overview` | Dashboard aggregates | Reads multiple operational collections. |
| `GET /api/work-items` | List work items | Optional `view`; unknown views fall back to `all-open`. |
| `PATCH /api/work-items/{id}` | Update work item | Accepts `state`, `owner`, and `severity`. |
| `GET /api/orders` | List/search orders | Optional `q` and named `filter`. |
| `GET /api/orders/{id}` | Order detail | Includes related work, conversations, returns, appointments, and approvals. |
| `POST /api/orders/{id}/notes` | Add internal note | Body uses `text`; appends a timeline event. |
| `POST /api/orders/{id}/pause-updates` | Pause/resume updates | Body uses `paused`, `reason`, and `until`. |
| `POST /api/orders/{id}/timeline` | Append timeline event | Optional source/channel/actor/type plus summary/detail. |
| `GET /api/conversations` | List conversations | Optional named `filter`. |
| `GET /api/conversations/{id}` | Conversation detail | Includes its order when linked. |
| `POST /api/conversations/{id}/messages` | Create outgoing message | `mode` is `send`, `schedule`, `approval`, or `draft`. |
| `PATCH /api/conversations/{id}` | Update conversation | Accepts `state`, `owner`, `order_id`, `category`, and `unread`. |
| `GET /api/fulfillment` | List/group fulfillment records | Returns stage order, grouped records, and flat records. |
| `POST /api/fulfillment/{id}/advance` | Advance workflow stage | Shipping fulfillment requires tracking or an explicit exception reason before completion. |
| `POST /api/fulfillment/{id}/scan` | Check SKU/serial scan | Body uses `code`; mismatch creates a high-severity work item. |
| `GET /api/inventory` | List inventory | Returns stored inventory records. |
| `GET /api/inventory/{sku}` | Inventory detail | Adds waiting orders and matching inbound purchase orders. |
| `GET /api/returns` | List RMAs | Sorted newest first. |
| `GET /api/returns/{id}` | RMA detail | Returns 404 when absent. |
| `PATCH /api/returns/{id}` | Update RMA | Accepts state, resolution, liability, and inspection fields. |
| `GET /api/appointments` | List appointments | Sorted by time. |
| `PATCH /api/appointments/{id}` | Update appointment | Accepts `status`, `time`, and `confirmation_state`. |
| `GET /api/automations` | List automation rules | Returns stored rule records. |
| `PATCH /api/automations/{id}` | Update automation | Requires `status`. |
| `GET /api/automations/runs` | List automation runs | Sorted newest first. |
| `GET /api/automations/runs/{id}` | Automation run detail | Returns 404 when absent. |
| `GET /api/approvals` | List approvals | Sorted newest first. |
| `POST /api/approvals/{id}/decision` | Decide approval | `decision`: `approve`, `reject`, or `more-info`; rejection requires `reason`. |
| `GET /api/integrations` | List mock integration states | Does not call external systems. |
| `GET /api/notifications` | List notifications | Sorted newest first. |
| `PATCH /api/notifications/{id}` | Mark notification read | Returns `{\"ok\": true}` even if no record matched. |
| `GET /api/purchasing` | Suppliers and purchase orders | Returns both collections. |
| `GET /api/reports` | Operational report aggregates | Several KPI values are fixed mock values. |
| `GET /api/search` | Search operational records | Query parameter `q`; blank query returns empty groups. |

## Validation and Errors

- Missing resources generally return HTTP 404 with FastAPI's `detail` field.
- Invalid or missing workflow inputs return HTTP 400 or 422 where explicitly checked.
- Request-body fields not included in a handler's allowlist are ignored; work-item updates reject a
  body with no recognized fields.
- There are no checked-in response models, API version prefix, deprecation rules, or compatibility
  guarantees. Consumers must update with server contract changes.

## Runtime Configuration Contract

| Component | Variable | Required | Meaning |
|---|---|---|---|
| Backend | `MONGO_URL` | Yes | MongoDB connection URL. |
| Backend | `DB_NAME` | Yes | MongoDB database name. |
| Backend | `CORS_ORIGINS` | No | Comma-separated allowed origins; code default is `*`. |
| Frontend | `REACT_APP_BACKEND_URL` | Yes | API origin without the `/api` suffix. |
| Frontend dev server | `ENABLE_HEALTH_CHECK` | No | Enables custom webpack development health routes when `true`. |

## Contract Template

# Contract: Name

## Version

- **Version:**
- **Status:** Draft / Active / Deprecated
- **Owner:**

## Interface

| Field / Endpoint | Type | Required | Rules | Example |
|---|---|---|---|---|
| | | | | |

## Validation Rules

-
-

## Error Handling

| Condition | Error Code | Consumer Action |
|---|---|---|
| | | |

## Compatibility

Describe versioning, backward compatibility, and deprecation behavior.

## Related Components

-
