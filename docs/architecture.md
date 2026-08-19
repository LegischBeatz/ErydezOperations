# Architecture

## Purpose

This document describes the implemented boundaries and data flow of the E‑RYDEZ Operations Console. **Shopify is the sole operational source of truth**; MongoDB stores validated read-only snapshots optimized for console queries.

## System Context

| Area | Responsibility | External Dependencies |
|---|---|---|
| Browser client | Render Shopify-backed operational views and initiate an explicit full synchronization | React, SWR, same-origin FastAPI API |
| API application | Authenticate to Shopify, ingest complete cursor-paginated data, validate and activate snapshots, and serve read-only queries | FastAPI, Motor, Shopify Admin GraphQL API |
| Shopify adapter | Acquire short-lived access tokens, execute GraphQL queries, normalize Shopify entities, and preserve source identifiers | `backend/shopify.py`, Shopify client-credentials flow |
| Data / storage | Persist one active canonical snapshot plus bounded synchronization history | MongoDB |
| Shopify | Authoritative orders, customers, products, variants, inventory, fulfillments, refunds, and Return objects | Shopify Admin GraphQL API |

Shopify’s Admin GraphQL model represents orders, products, variants, inventory, and related records as distinct linked objects. Cursor pagination is required to traverse complete connections.[1] [2] [3] [4]

## System Boundaries

### In Scope

The console presents Shopify-backed overview, orders, customers, products, variants, inventory quantities and locations, fulfillments, refunds, Return objects, synchronization state, and global search. The API supports read-only operational queries and an explicit complete-snapshot synchronization. MongoDB persists normalized Shopify records, synchronization metadata, and recent run history.

### Out of Scope

Application authentication, authorization, tenant isolation, webhooks, scheduled background synchronization, Shopify mutations, email or messaging, carrier mutations, calendar workflows, and non-Shopify operational records are not implemented. The console is a trusted-LAN deployment and must not be exposed publicly without adding authentication and TLS.

## Components

| Component | Responsibility | Owns Data? | Depends On |
|---|---|---|---|
| `frontend/src/App.js` and Shopify pages | Route and render source-aligned operational views | Browser/UI state only | App shell, shared components, API client |
| `frontend/src/lib/api.js` | Centralize all backend calls | No | Axios, same-origin API |
| `frontend/src/lib/shopify.js` | Present Shopify status, money, customer, address, and sparse-data values consistently | No | Browser locale APIs |
| `backend/shopify.py` | Shopify authentication, GraphQL pagination, normalization, and source snapshot construction | No | Shopify Admin GraphQL API |
| `backend/server.py` | Snapshot validation, staging, activation, cleanup, indexes, and query endpoints | No | Motor, `backend/shopify.py` |
| MongoDB | Store canonical snapshots, active snapshot metadata, and recent synchronization runs | Yes, as a cache/read model | `MONGO_URL`, `DB_NAME` |

## Deployment Topology

Docker Compose is the supported trusted-LAN deployment. Nginx is the only component with a published host port; it serves the React bundle and proxies same-origin `/api` requests. FastAPI and MongoDB remain on internal networks.

```text
Trusted LAN :8082 -> Nginx/React -> FastAPI:8000 -> MongoDB:27017
                                      |
                                      +-> Shopify Admin GraphQL API
```

## Dependency Direction

```text
React pages and shared UI
        ↓
frontend/src/lib/api.js
        ↓ HTTP /api
backend/server.py
        ↓
backend/shopify.py -> Shopify Admin GraphQL API
        ↓
MongoDB canonical read model
```

Frontend pages call the backend only through `frontend/src/lib/api.js`. Shopify transport, authentication, pagination, and normalization remain isolated in `backend/shopify.py`. API contract changes must update `docs/contracts/README.md`, tests, and affected callers.

## Authoritative Synchronization Flow

1. An operator starts a complete synchronization from the console or `POST /api/shopify/sync`.
2. The adapter obtains or reuses a short-lived client-credentials access token; Shopify documents that this flow returns a token that expires after 24 hours.[5]
3. The adapter fetches shop identity and authoritative counts, then cursor-paginates every accessible product, variant, inventory item, customer, order, fulfillment, refund, and Return connection.
4. Raw objects are normalized without inventing unavailable fields. Shopify GIDs and legacy identifiers are retained for deterministic linking.
5. The API validates source counts for orders, products, and customers; uniqueness of every Shopify identifier; and product–variant, variant–inventory, customer–order, and order–child links.
6. The new records are inserted under a new `sync_id`. The previous active snapshot remains readable during staging.
7. Only after insertion and validation succeed does the API activate the new snapshot in `meta.id = "shopify_sync"`.
8. Stale canonical records, mock-only collections, and the old seed marker are removed after activation. Failed staging records are deleted and the previous active snapshot remains intact.

## Canonical Collections

| Collection | Primary source | Core links |
|---|---|---|
| `shop` | Shopify shop profile | Authoritative source counts and shop identity |
| `orders` | Shopify Order | Customer, line-item product/variant, fulfillment, refund, Return |
| `products` | Shopify Product | Variant and media identifiers |
| `variants` | Shopify ProductVariant | Product and inventory item |
| `inventory_items` | Shopify InventoryItem | Variant and location inventory levels |
| `customers` | Shopify Customer | Orders through retained customer GID |
| `fulfillments` | Shopify Fulfillment | Parent order and fulfillment line items |
| `refunds` | Shopify Refund | Parent order and refund line items |
| `returns` | Shopify Return | Parent order and return quantities |
| `meta` | Application-generated | Active snapshot, counts, validation report |
| `sync_runs` | Application-generated | Recent run state, timing, counts, errors, cleanup |

Every canonical Shopify record includes `source = "shopify"`, `sync_id`, `shopify_id`, normalized fields, and a synchronization timestamp.

## API and Mutation Policy

Operational data is read-only in the console. Former mock mutation routes return an explicit conflict response, and the former reset endpoint returns HTTP 410. Shopify changes must be performed in Shopify until a separately designed and authorized mutation workflow exists.

## Non-Functional Requirements

| Concern | Implemented behavior | Remaining limitation |
|---|---|---|
| Integrity | Count, uniqueness, cross-link, and post-insert validations gate activation | No field-level hash comparison |
| Recovery | Previous snapshot remains active until successful activation; logical backup precedes destructive migration | Restore remains operator-driven |
| Performance | Indexed active-snapshot queries and pagination for large lists | Fulfillment/refund lists remain complete unpaginated responses at current store size |
| Availability | Liveness and MongoDB-backed readiness; synchronization failure does not replace active data | Single API worker and MongoDB instance |
| Security | Credentials remain in untracked environment variables and are not returned by the API | No application authentication or TLS; trusted LAN only |
| Observability | Sync run records, progress stages, counts, validation, cleanup, and application logs | No external metrics or alerting |

## Related Decisions

- [`ADR-0001: Docker Compose deployment`](decisions/0001-docker-compose-deployment.md)
- [`ADR-0002: Cross-platform release baseline`](decisions/0002-cross-platform-release-baseline.md)
- [`ADR-0003: Shopify-authoritative canonical snapshots`](decisions/0003-shopify-authoritative-snapshots.md)

## References

[1]: https://shopify.dev/docs/api/admin-graphql/latest/objects/Order "Shopify Admin GraphQL Order"
[2]: https://shopify.dev/docs/api/admin-graphql/latest/objects/Product "Shopify Admin GraphQL Product"
[3]: https://shopify.dev/docs/api/admin-graphql/latest/objects/InventoryItem "Shopify Admin GraphQL InventoryItem"
[4]: https://shopify.dev/docs/api/usage/pagination-graphql "Shopify GraphQL pagination"
[5]: https://shopify.dev/docs/apps/build/authentication-authorization/client-secrets "Shopify client credentials"
