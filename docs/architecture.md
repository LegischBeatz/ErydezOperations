# Architecture

## Purpose

Document the implemented boundaries and data flow of the E-RYDEZ Operations Console. This is a
description of the repository as it exists, not a production target architecture.

## System Context

| Area | Responsibility | External Dependencies |
|---|---|---|
| Browser client | Render the operations console and issue HTTP requests | React runtime; FastAPI API URL |
| API application | Serve operational queries and mutations under `/api` | FastAPI, Motor, configured MongoDB |
| Data / Storage | Persist seeded orders, conversations, work items, and related records | MongoDB |
| External services | Represent integration health and carrier/message state as mock records | No live adapters are implemented |

## System Boundaries

### In Scope

- React pages for overview, work, orders, inbox, fulfillment, inventory, returns, appointments,
  purchasing, reports, automations, and settings.
- A FastAPI JSON API for reading and mutating the operational model.
- Seeded mock data and MongoDB persistence.
- Backend HTTP integration tests and optional frontend development-server health endpoints.

### Out of Scope

- Authentication, authorization, and tenant isolation.
- Live Shopify, email, WhatsApp, carrier, or calendar integrations.
- Production deployment, database migration, backup, and monitoring definitions.
- Offline processing or a separate job/queue worker.

## Components

| Component | Responsibility | Owns Data? | Depends On |
|---|---|---|---|
| `frontend/src/App.js` and pages | Route and render console workflows | Browser/UI state only | App shell, shared components, API client |
| `frontend/src/lib/api.js` | Centralize Axios calls to the backend | No | `REACT_APP_BACKEND_URL`, Axios |
| `backend/server.py` | Define API routes, workflow rules, and MongoDB queries/mutations | No | FastAPI, Motor, `backend/seed.py` |
| `backend/seed.py` | Build the initial mock operational dataset | Defines seed records | Python standard library |
| MongoDB | Store all operational collections and the seed marker | Yes | `MONGO_URL`, `DB_NAME` |
| Frontend health-check plugin | Expose optional development-server build/liveness details | In-memory build state | CRACO/webpack dev server, `ENABLE_HEALTH_CHECK` |

## Dependency Direction

The current codebase is a two-tier application with route handlers containing both workflow logic
and persistence calls:

```text
React pages and shared UI
        ↓
frontend/src/lib/api.js
        ↓ HTTP /api
backend/server.py route handlers
        ↓ Motor
MongoDB
```

- Frontend pages should continue to call the backend through `frontend/src/lib/api.js`.
- HTTP changes must be reflected in `docs/contracts/README.md` and affected callers/tests.
- New live external integrations should use explicit adapters instead of being embedded directly in
  route handlers.
- There is no separate domain/application layer today; do not claim that dependency inversion is
  already enforced.

## Data Flow

1. `frontend/src/index.js` mounts the React application and its providers.
2. Routed pages use SWR for reads and the functions in `frontend/src/lib/api.js` for Axios requests.
3. Axios targets `${REACT_APP_BACKEND_URL}/api`.
4. FastAPI handlers query or mutate MongoDB directly through the shared Motor database handle.
5. On API startup, `seed_if_empty` checks `meta.id == "seed"`; if absent, it inserts the dataset
   returned by `build_seed()`.
6. Several mutations also append order timeline or audit records. The reset endpoint replaces all
   seeded collections and is used by the integration suite.

## Non-Functional Requirements

- **Security:** No authentication or authorization is implemented. CORS defaults to `*`; deployment
  must explicitly constrain it. The reset endpoint is unauthenticated and destructive to configured
  collections.
- **Performance:** Queries use fixed upper bounds and mostly filter or aggregate in application
  memory. No performance targets or indexes are documented.
- **Availability:** The optional `/health*` routes belong to the frontend development server. No API
  health/readiness contract or production availability target is defined.
- **Observability:** The API configures standard Python logging; the optional webpack plugin tracks
  development build health. No metrics, tracing, or production alerting configuration is tracked.
- **Scalability:** The tracked repository defines one API process and MongoDB connection, with no
  deployment topology or capacity targets.

## Related Decisions

No project-specific ADRs are currently tracked. Use
[`docs/decisions/ADR_TEMPLATE.md`](decisions/ADR_TEMPLATE.md) for future significant decisions.
