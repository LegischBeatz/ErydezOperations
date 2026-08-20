# E-RYDEZ Operations Console

## Purpose

E-RYDEZ Operations Console is a React and FastAPI operations workspace with two deliberate provider boundaries. The commerce workspace reads a locally stored, validated snapshot of Shopify Admin GraphQL data. The Gmail workspace uses Google OAuth 2.0 and the Gmail REST API to retrieve threads on demand, create optional AI-assisted drafts, and send only operator-confirmed replies within an existing thread.

> **The console is not a system of record for commerce.** Shopify is the authoritative source for orders, customers, products, variants, inventory, fulfillments, refunds, and returns. MongoDB is the active snapshot/read model and stores console-owned integration metadata plus encrypted Gmail refresh tokens.

## Current Goals

The current codebase provides a safe, read-oriented operations surface for Shopify data, complete-snapshot synchronization with validation before activation, and an operator-controlled Gmail workflow. It deliberately prevents console-side Shopify writes, keeps Gmail access on demand, and makes AI assistance non-sending and editable.

| Goal | Current implementation |
|---|---|
| Preserve a consistent commerce view | A complete Shopify snapshot is fetched, normalized, validated, staged under a new `sync_id`, and activated only after validation succeeds. |
| Make commerce data operationally usable | The UI exposes overview, orders, products, inventory, customers, fulfillment, returns/refunds, reports, and active-snapshot search. |
| Keep provider ownership explicit | Shopify canonical records are read-only; legacy write compatibility routes return `409`, and legacy reset returns `410`. |
| Support controlled customer-email work | Gmail OAuth tokens are encrypted at rest; threads are refreshed on demand; replies require explicit confirmation; AI produces drafts only. |
| Keep local deployment reproducible | Docker Compose runs a React bundle behind Nginx, FastAPI, and authenticated MongoDB, with health-gated startup. |

## System Snapshot

| Area | Implemented state | Important boundary |
|---|---|---|
| Browser client | React 19 SPA with React Router, SWR, Axios, Tailwind, and Radix-based UI components. The primary navigation covers commerce data, Gmail, audit/ledger views, and settings. | All backend calls go through `frontend/src/lib/api.js`. |
| API | FastAPI application in `backend/server.py` with `/api` routes for health, Shopify snapshots, canonical queries, integration control, and Gmail. | It requires `MONGO_URL` and `DB_NAME` at import time. |
| Commerce adapter | `backend/shopify.py` authenticates, calls the Shopify Admin GraphQL API, cursor-paginates accessible entities, normalizes them, and builds full snapshots. | Shopify remains authoritative; the console does not write Shopify. |
| Gmail adapter | `backend/gmail_service.py` performs OAuth, refreshes access tokens, retrieves/sanitizes Gmail content, sends thread replies, and optionally requests an OpenAI draft. | No watch, webhook, or background Gmail synchronization exists. |
| Persistence | MongoDB stores Shopify snapshot collections, snapshot metadata, sync history, integration registry/audit data, Gmail OAuth states, encrypted refresh tokens, and Gmail refresh metadata. | MongoDB is persistent local application storage, not a second commerce authority. |
| Deployment | Compose runs a non-root single-worker backend, internal MongoDB, and Nginx frontend. Only the frontend is published, bound to `127.0.0.1:${ERYDEZ_PORT:-8082}`. | The application uses plain HTTP and has no application authentication, authorization, tenant isolation, or TLS. |

## Technology Stack

| Layer | Implemented technology |
|---|---|
| Frontend | JavaScript/JSX, React 19, React Router, SWR, Axios, CRACO, Tailwind CSS, Radix UI, Nginx production serving. |
| Backend | Python 3.12 container, FastAPI, Uvicorn, Motor/PyMongo, python-dotenv, requests, cryptography, and the OpenAI Python client. |
| Providers | Shopify Admin GraphQL, Google OAuth 2.0, Gmail REST API, and optionally an OpenAI-compatible chat-completions endpoint for drafts. |
| Persistence | MongoDB 7.0 with a Compose-managed named volume. |
| Validation | Pytest with pytest-xdist, Jest through CRACO, frontend production builds, Compose configuration checks, and a Compose smoke workflow. |

## Safety and Capability Boundaries

The browser client can initiate a full Shopify sync, but no periodic sync job, webhook consumer, or background worker is implemented. An active snapshot is required for canonical commerce queries; a healthy database without a snapshot reports readiness but canonical routes return `503`.

Gmail has separate capabilities. It requests only Gmail read and send scopes, stores the refresh token encrypted with a Fernet key supplied through the environment, and retains OAuth state hashes for ten minutes. The server returns sanitized HTML for message display and uses `body` as a plain-text fallback. The send path derives recipient, subject, `In-Reply-To`, and `References` headers from Gmail’s source thread instead of trusting browser-supplied headers.

## Documentation Map

| Need | Source document |
|---|---|
| Agent workflow, constraints, and validation | [`AGENTS.md`](AGENTS.md) |
| Architecture, components, data flow, and non-functional limits | [`docs/architecture.md`](docs/architecture.md) |
| HTTP, schema, error, and compatibility contracts | [`docs/contracts/README.md`](docs/contracts/README.md) and [`docs/contracts/gmail.md`](docs/contracts/gmail.md) |
| Durable implementation decisions | [`docs/decisions/`](docs/decisions/) |
| Deployment, recovery, Shopify, and Gmail operations | [`docs/runbooks/`](docs/runbooks/) |
| Human-oriented local onboarding | [`README.md`](README.md) and [`frontend/README.md`](frontend/README.md) |
| UI presentation constraints | [`design_guidelines.json`](design_guidelines.json) |

## First Steps for Agents

Read [`AGENTS.md`](AGENTS.md), then this document, then the contract and runbook matching the requested change. Treat `frontend/src/lib/api.js` as the browser API boundary and `backend/server.py` as the implemented HTTP contract. Do not rely on the legacy `backend/seed.py`, mock-era compatibility pages, or historical wording as evidence of active capability.
