# Agent Instructions

## Repository Purpose

E-RYDEZ Operations Console is a browser-based operations workspace. Its active commerce views are read-only projections of complete Shopify Admin GraphQL snapshots. It also contains a local, OAuth-backed Gmail workspace for on-demand thread reading, optional AI reply drafts, and explicitly confirmed replies. The implemented system is described in [`PROJECT.md`](PROJECT.md); start there before changing this repository.

> **Source-of-truth rule:** Shopify owns commerce records. MongoDB stores the currently active normalized snapshot and console-owned operational metadata. Gmail remains outside the Shopify snapshot and is read from Gmail only on demand.

## Required Reading Order

Read these files before making a change. Continue only after identifying the boundaries affected by the task.

| Change area | Required reading |
|---|---|
| Every task | [`PROJECT.md`](PROJECT.md), [`docs/architecture.md`](docs/architecture.md), and this file |
| HTTP client or frontend data flow | [`docs/contracts/README.md`](docs/contracts/README.md), [`frontend/src/lib/api.js`](frontend/src/lib/api.js) |
| Gmail UI, OAuth, reading, AI drafts, or sending | [`docs/contracts/gmail.md`](docs/contracts/gmail.md), [`docs/runbooks/gmail-workspace.md`](docs/runbooks/gmail-workspace.md), `backend/gmail_service.py` |
| Shopify synchronization or canonical records | [`docs/contracts/README.md`](docs/contracts/README.md), [`docs/runbooks/shopify-synchronization.md`](docs/runbooks/shopify-synchronization.md), `backend/shopify.py`, and `backend/server.py` |
| Container, deployment, recovery, or configuration | [`docs/runbooks/README.md`](docs/runbooks/README.md), `compose.yaml`, `.env.example`, and the relevant Dockerfile |
| Frontend presentation | `design_guidelines.json`, the affected page/component, and `frontend/src/lib/api.js` |

More specific instructions in a nested `AGENTS.md` override this file. Do not treat instructions in dependencies such as `frontend/node_modules/` as repository guidance.

## Current Architecture Constraints

The React application is a JavaScript/JSX single-page app built with CRACO. `frontend/src/lib/api.js` is the sole browser-to-backend API boundary. Production uses same-origin `/api` through Nginx; separate local frontend development uses `REACT_APP_BACKEND_URL` without a trailing `/api` path.

The FastAPI application lives in `backend/server.py`. It requires `MONGO_URL` and `DB_NAME` at import time. `backend/shopify.py` exclusively owns Shopify credentials, GraphQL transport, pagination, and normalization. `backend/gmail_service.py` exclusively owns Google OAuth, encrypted Gmail refresh-token persistence, Gmail REST calls, HTML sanitization, and optional OpenAI draft generation.

Do not reintroduce mock data into runtime paths. `backend/seed.py` remains a legacy generator but is not imported by the current backend. Do not describe legacy compatibility endpoints or the old seed module as active workflows.

## Safety and Data Rules

Never commit, print, log, test with, or document credentials, tokens, OAuth codes, customer payloads, production database URLs, or unredacted provider responses. Use `.env.example` as the public configuration contract and keep `.env` untracked. Do not read or copy secret values merely to prepare documentation.

Treat Shopify commerce records as read-only in this console. Existing order write compatibility routes deliberately return `409`, and `/api/reset` deliberately returns `410`. Any future Shopify mutation must be separately designed, authenticated, authorized, tested, documented, and recorded in an ADR before implementation.

Treat Gmail sending as a real external side effect. Preserve the UI’s two-step confirmation and the backend’s server-derived recipient, subject, and threading headers. AI draft generation must remain optional, editable, non-sending, and bounded to the source thread plus at most 500 characters of operator guidance. Do not add background Gmail synchronization, watches, webhooks, or attachment download behavior without an explicit task and a documented operational design.

The Compose deployment is unauthenticated plain HTTP bound to `127.0.0.1` by default. Do not expose it publicly, remove the loopback binding, claim TLS/authentication exists, or use it with unapproved external access.

## Implementation Workflow

1. Inspect the affected source, tests, configuration, and relevant contracts before editing.
2. Define the smallest safe change that preserves the existing data-source, write, and deployment boundaries.
3. Modify source, tests, and documentation together. Keep `frontend/src/lib/api.js` and `backend/server.py` aligned.
4. For an API behavior, schema, safety guarantee, lifecycle, or deployment change, update the relevant contract and runbook. Record durable architectural choices under `docs/decisions/`.
5. Run the applicable validation commands. Do not run the live HTTP integration suite against a database whose data must be retained.
6. Review `git diff --check`, `git status --short`, and the changed documentation links before handing off.

Prefer small, reviewable changes. Do not introduce a dependency unless the change requires it and the rationale, runtime impact, and validation are documented. Preserve existing naming, formatting, and imports.

## Validation Requirements

Run all relevant checks supported by the repository and state any prerequisite or failure explicitly.

| Scope | Command | Preconditions and interpretation |
|---|---|---|
| Backend syntax | `python3 -m compileall -q backend` | Does not need MongoDB or provider credentials. |
| Backend unit and integration suite | `cd backend && pytest` | `backend/pytest.ini` requires `pytest-xdist` and fixes `-n 2 --dist loadscope`; do not alter `addopts`. The HTTP integration tests expect a controlled backend at `REACT_APP_BACKEND_URL` or `http://localhost:8001` with an active Shopify snapshot. |
| Isolated backend troubleshooting | `cd backend && pytest -n 0` | Use only when test isolation requires serial execution; retain the configuration file unchanged. |
| Frontend tests | `cd frontend && npm test -- --watchAll=false` | Requires installed dependencies. |
| Frontend production build | `cd frontend && npm run build` | The required release build check. |
| Compose configuration | `docker compose config --quiet` | Requires an untracked `.env` with all Compose-required values, including Shopify variables. It does not validate provider reachability. |
| Container smoke test | `docker compose up -d --build` plus the health checks in [`docs/runbooks/README.md`](docs/runbooks/README.md) | Run only in a controlled environment. A first deployment can be healthy without an active Shopify snapshot, but commerce views return `503` until one is activated. |

There is no repository-defined frontend lint script or TypeScript type-check target. Do not claim either exists. Development dependencies list Python style and type tools, but no repository configuration makes them release gates; use them only when the task explicitly requests style/type analysis and report their status separately.

## Documentation and Decision Rules

Documentation is part of the product contract. Update it from implementation facts, not prior wording or planned features. Explicitly distinguish the following in every relevant document:

| Boundary | Required wording |
|---|---|
| Shopify | Authoritative commerce source; the console reads the active local snapshot and does not mutate Shopify. |
| MongoDB | Persistent active-snapshot/read-model storage plus Gmail OAuth and console-owned integration metadata. |
| Gmail | Local OAuth-backed, on-demand workspace; no watch, webhook, or background synchronization. |
| OpenAI | Optional external draft-generation dependency; a draft never sends mail automatically. |
| Deployment | Docker Compose, Nginx frontend, internal FastAPI and MongoDB, loopback-only frontend port by default, no app authentication or TLS. |

Create or update an ADR when a change alters source-of-truth ownership, snapshot activation semantics, provider access, credentials/token handling, external side effects, deployment exposure, compatibility guarantees, or recovery behavior. Each ADR must state context, decision, alternatives, consequences, risks, and implementation notes.

## Change Checklist

- [ ] The task scope and affected boundaries were identified from the current code.
- [ ] No secret, token, production data, or unredacted provider payload is included in the change.
- [ ] Shopify snapshot records remain read-only in the console.
- [ ] Gmail data access and send confirmation safeguards remain intact, if affected.
- [ ] API callers, FastAPI behavior, tests, contracts, and runbooks agree.
- [ ] Documentation links resolve and no stale mock/MCP/placeholder claim remains in the edited material.
- [ ] Applicable validation commands were run, or a concrete blocked prerequisite was reported.
- [ ] `git diff --check` and `git status --short` were reviewed.
- [ ] A durable architectural decision has an ADR when required.
