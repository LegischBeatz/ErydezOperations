# E-RYDEZ Operations Console

E-RYDEZ Operations Console is a local operations workspace for **read-only Shopify commerce snapshots** and an **OAuth-backed Gmail workspace**. It runs as a React single-page application behind Nginx with a FastAPI API and MongoDB through Docker Compose.

> **Important:** Shopify is the authoritative commerce source. The console does not change Shopify records. Gmail threads are read on demand, and sending requires explicit confirmation in the existing Gmail thread. The Compose deployment is plain HTTP without application authentication or TLS, so it is bound to loopback by default and must not be exposed publicly.

## What the Current Application Does

| Area | Current capability |
|---|---|
| Commerce | Shows Shopify-derived overview, orders, products, inventory, customers, fulfillment, refunds, returns, reports, and global search from one active validated snapshot. |
| Synchronization | Starts a complete, operator-initiated Shopify snapshot refresh; validates counts/links before activation; retains prior active snapshot on failure. |
| Gmail | Connects one local Gmail account through Google OAuth, reads threads on demand, creates optional editable AI drafts, and sends only confirmed replies in existing threads. |
| Operations | Shows safe snapshot run evidence, integration readiness/lifecycle metadata, audit timeline, and provider ledger. |
| Deployment | Packages frontend, backend, and authenticated MongoDB in Docker Compose. Only the frontend port is published to loopback. |

The application does not implement Shopify writes, scheduled syncs, webhooks, Gmail push watch, mailbox mirroring, attachment download, application login, authorization, tenant isolation, or TLS.

## Quick Start

### 1. Prepare local configuration

Install Docker Desktop with Linux containers/WSL2 on Windows, or Docker Engine/Docker Desktop with the Compose plugin on Linux/macOS. Copy `.env.example` to an untracked `.env`; complete the required local values without committing them.

| Required to start Compose | Required to synchronize Shopify | Required for Gmail | Required for AI drafts |
|---|---|---|---|
| `MONGO_ROOT_PASSWORD` | `SHOPIFY_STORE_DOMAIN`, `SHOPIFY_CLIENT_ID`, `SHOPIFY_CLIENT_SECRET` | Google OAuth client ID/secret, exact redirect URI, Fernet key | `OPENAI_API_KEY` |

`docker compose config --quiet` requires the Compose-required Shopify values even when a first snapshot has not yet been created. Gmail and AI fields may be left empty when those optional features are not used.

### 2. Start on Windows

```powershell
.\scripts\setup-windows.ps1
```

The helper validates Docker, preserves an existing `.env`, creates one from `.env.example` only when absent, generates a MongoDB password only for a new `.env`, builds the images unless `-SkipBuild` is supplied, starts Compose, and checks health endpoints. Use `-Port 8085` or another free port if `8082` is occupied.

### 3. Start on Linux/macOS

```bash
docker compose config --quiet
docker compose build
docker compose up -d
docker compose ps
```

Open `http://127.0.0.1:8082` unless `ERYDEZ_PORT` specifies another loopback port.

### 4. Verify health and create the first snapshot

```bash
curl -fsS http://127.0.0.1:8082/healthz
curl -fsS http://127.0.0.1:8082/api/health/live
curl -fsS http://127.0.0.1:8082/api/health/ready
```

A fresh stack can be healthy while `shopify_snapshot_active` is `false`. Open **Settings → Integrations** and choose **Run complete sync** after confirming Shopify configuration, or follow the [Shopify synchronization runbook](docs/runbooks/shopify-synchronization.md). Commerce routes return `503` until a snapshot is successfully activated.

## Everyday Operation

| Task | Where to go |
|---|---|
| Review/comprehensively refresh commerce data | [Shopify synchronization runbook](docs/runbooks/shopify-synchronization.md) |
| Configure/connect/repair Gmail | [Gmail workspace runbook](docs/runbooks/gmail-workspace.md) |
| Understand API and schema behavior | [API and data contracts](docs/contracts/README.md) and [Gmail contract](docs/contracts/gmail.md) |
| Diagnose deployment, backup, or recovery | [Operations runbook](docs/runbooks/README.md) |
| Understand the full system | [PROJECT.md](PROJECT.md) and [architecture](docs/architecture.md) |
| Make a safe code change | [AGENTS.md](AGENTS.md) |

Stop services without deleting the MongoDB volume:

```bash
docker compose down
```

Never run `docker compose down --volumes` unless permanent data deletion is approved and an independently verified backup exists.

## Development and Validation

The production/deployment path uses same-origin `/api` through Nginx. For separate development servers, set `REACT_APP_BACKEND_URL` to the backend origin without `/api`, configure `MONGO_URL` and `DB_NAME` before importing the backend, and set `CORS_ORIGINS` to the exact browser origin when needed.

```bash
python3 -m compileall -q backend
cd backend && pytest
cd ../frontend && npm test -- --watchAll=false
npm run build
```

The backend suite includes HTTP tests that expect a controlled API at `REACT_APP_BACKEND_URL` or `http://localhost:8001` with an active Shopify snapshot. Do not target a database whose retained data matters. No repository-defined frontend lint script or TypeScript type-check target exists.

## Security and Data Handling

Keep `.env`, MongoDB data, backups, logs, browser access, and Docker access restricted. Never commit secrets, tokens, OAuth codes, customer data, or raw provider payloads. Gmail refresh tokens are encrypted before MongoDB persistence; this does not remove the need to protect the key and database.

For the detailed architecture, contracts, decisions, and recovery procedures, start with [`PROJECT.md`](PROJECT.md).
