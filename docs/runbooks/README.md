# Operations Runbooks

## Scope

These runbooks operate the current Docker Compose implementation of E-RYDEZ Operations Console. The system is a local, unauthenticated HTTP application with Shopify-authoritative commerce snapshots and an optional OAuth-backed Gmail workspace. Read [`../../PROJECT.md`](../../PROJECT.md) and [`../../docs/architecture.md`](../../docs/architecture.md) before operational work.

| Procedure | Use it when |
|---|---|
| [Shopify snapshot synchronization](shopify-synchronization.md) | A snapshot must be created, refreshed, diagnosed, or recovered. |
| [Gmail workspace](gmail-workspace.md) | Configuring Google OAuth, connecting/disconnecting Gmail, handling Gmail states, or diagnosing AI draft availability. |

## Security Boundary

The Compose frontend publishes plain HTTP only to `127.0.0.1:${ERYDEZ_PORT:-8082}`. There is no application login, authorization, TLS, tenant boundary, reverse-proxy access policy, or public-access design. Do not change the bind address, port-forward the service, or publish it through a public proxy without an explicit security implementation and reviewed decision record.

Nginx supplies a restrictive same-origin CSP plus MIME, frame, referrer, and Permissions-Policy headers as browser defense in depth. FastAPI rejects cross-site browser mutations and requires the central frontend client’s `X-Erydez-Request: local-console` header for browser `POST`/`PATCH`/other unsafe methods. This request-provenance safeguard is not an identity system: it does not make the service safe for remote access, and documented local CLI calls without browser `Origin` or Fetch-Metadata remain permitted.

Shopify snapshots can contain customer and commerce data. Gmail authorization data includes an encrypted refresh token. Keep `.env`, Docker/host access, browser access, MongoDB volume access, container logs, and backups restricted to approved operators. Never put secrets, OAuth codes, raw provider payloads, or customer exports in source control, issue text, screenshots, or support artifacts.

## Prerequisites and Configuration

| Requirement | Implemented expectation |
|---|---|
| Container runtime | Docker Compose plugin. Windows onboarding assumes Docker Desktop with Linux containers and WSL2. |
| Repository configuration | A local, untracked `.env` based on `.env.example`. |
| Required Compose values | `MONGO_ROOT_PASSWORD`, `SHOPIFY_STORE_DOMAIN`, `SHOPIFY_CLIENT_ID`, and `SHOPIFY_CLIENT_SECRET` must be non-empty for Compose interpolation. |
| Optional Gmail values | Google OAuth client ID/secret, exact redirect URI, and a valid Fernet key are needed only to use Gmail OAuth. |
| Optional AI values | `OPENAI_API_KEY` enables AI drafts only; Gmail manual reading/replying does not depend on it. |
| Optional local retention | `INTEGRATION_HEALTH_RETENTION_DAYS` (90), `INTEGRATION_AUDIT_RETENTION_DAYS` (365), and `GMAIL_SEND_OPERATION_RETENTION_HOURS` (24) are positive-integer defaults. They retain safe local evidence and hashed Gmail-send metadata only; no message content is stored for idempotency. |

| Network | The backend needs outbound provider access for Shopify sync, Google OAuth/Gmail operations, and optional draft generation. |

Use `.env.example` as the variable-name contract. Do not copy real values into documentation. `docker compose config --quiet` validates Compose interpolation and structure but does not prove provider credentials, scopes, or network reachability.

## Start and Update

### Windows

Start Docker Desktop and verify `docker info` plus `docker compose version`. From the repository root, run:

```powershell
.\scripts\setup-windows.ps1
```

The script creates `.env` only if it does not exist, generates a MongoDB password only for that new file, performs Compose validation, builds unless `-SkipBuild` is selected, starts the stack, and polls three local health URLs. Use `-Port 8085` or another free loopback port when `8082` is occupied. Complete the required Shopify values in the local `.env` before running it.

### Linux and macOS

Prepare the local `.env`, then validate, build, and start the packaged stack:

```bash
docker compose config --quiet
docker compose build
docker compose up -d
docker compose ps
```

The default console URL is `http://127.0.0.1:8082`. A custom local port is set by `ERYDEZ_PORT` in `.env` or the invoking environment.

### Health Verification

```bash
curl -fsS http://127.0.0.1:8082/healthz
curl -fsS http://127.0.0.1:8082/api/health/live
curl -fsS http://127.0.0.1:8082/api/health/ready
docker compose ps
```

| Check | What it proves | What it does not prove |
|---|---|---|
| `/healthz` | Nginx is serving the frontend container. | SPA route/data correctness. |
| `/api/health/live` | FastAPI process responds. | MongoDB, Shopify, Gmail, or snapshot readiness. |
| `/api/health/ready` | MongoDB ping succeeds and reports active-snapshot boolean. | Live Shopify configuration/reachability. |
| `docker compose ps` | Compose health/restart state. | Current provider authorization or snapshot validity. |

A fresh stack can report `ready` with `shopify_snapshot_active: false`. In that state, canonical commerce routes return `503` until a successful Shopify synchronization is activated.

## Routine Operation

The Settings page exposes the complete Shopify sync action, current snapshot state, run history, safe integration readiness controls, and Gmail control-plane evidence. The application shell also exposes Shopify sync and active-snapshot status. A displayed integration health read is side-effect free; use the explicit **Check readiness** action to append one safe health record subject to TTL retention.

Use the read-only endpoints below for safe diagnostics; do not use them as a substitute for the documented provider workflow.

```bash
curl -fsS 'http://127.0.0.1:8082/api/shopify/status?live=false'
curl -fsS http://127.0.0.1:8082/api/shopify/sync-runs
curl -fsS 'http://127.0.0.1:8082/api/orders?page=1&page_size=1'
curl -fsS http://127.0.0.1:8082/api/gmail/status
```

Use `live=true` on Shopify status only when an operator intends to contact Shopify and provider credentials are configured. It performs a live provider profile/count query.

Stop the stack without deleting application data:

```bash
docker compose stop
docker compose down
```

`docker compose down --volumes` deletes the Compose-managed MongoDB volume. Do not run it unless permanent data removal is intended and an independently verified backup exists.

## Backup, Recovery, and Rollback

The repository does not ship a backup scheduler, retention policy, or restore script. A Docker volume is persistent storage, **not** a backup. Before destructive maintenance, schema work, or manual database recovery, create a logical MongoDB backup with an operator-approved MongoDB backup tool, store it outside the repository and Compose volume, record an integrity checksum, and prove restoration against an isolated temporary database.

| Situation | Safe response |
|---|---|
| Shopify synchronization fails before activation | Do not manually purge collections. The implementation leaves the previous snapshot active and removes failed staged rows. Inspect run record and backend logs, then follow the Shopify runbook. |
| New active snapshot appears semantically wrong | Stop further syncs, preserve current database/log evidence, restore the last verified logical backup into a separate recovery database first, and validate it before replacing the active database. |
| Code/image deployment fails | Keep `.env` and MongoDB volume. Restore the previously known code/image input, rebuild, start Compose, and validate health before further action. |
| Gmail authorization is invalid | Use the Gmail workspace runbook to reauthorize or disconnect; never manually decrypt/edit token documents. |
| Credential exposure is suspected | Restrict access, rotate affected provider credentials or encryption key according to a reviewed recovery plan, preserve minimal redacted evidence, and notify the system owner. |

## Local Development and Validation

The packaged Compose deployment is the operational path. Nginx compresses text responses and caches only content-hashed `static/` build assets for one year; `index.html` is revalidated and `/api` responses are not browser-cached by this rule. Do not add a blanket API cache because active-snapshot, Gmail, and integration responses have different freshness and privacy boundaries. Separate development processes are supported by the code but require explicit local configuration. The central API client automatically supplies the required local browser-mutation header; do not replace it with ad hoc Axios/fetch calls. For an external development origin, include its exact origin in `CORS_ORIGINS` and restart the backend.


```bash
# Backend: MONGO_URL and DB_NAME are required before importing server.py.
cd backend
uvicorn server:app --reload --host 0.0.0.0 --port 8001

# Frontend: point to the backend origin without /api for separate dev servers.
cd ../frontend
REACT_APP_BACKEND_URL=http://localhost:8001 npm start
```

Run the available project checks from a controlled environment:

```bash
python3 -m compileall -q backend
cd backend && pytest
cd ../frontend && npm test -- --watchAll=false
npm run build
```

`backend/pytest.ini` fixes pytest-xdist at `-n 2 --dist loadscope`; retain it. The backend suite includes service-independent unit tests and HTTP tests that expect a controlled API at `REACT_APP_BACKEND_URL` or `http://localhost:8001` with an active snapshot. Do not point those HTTP tests at an environment with data that must be retained. Use `pytest -n 0` only for serial isolation troubleshooting.

For a safe initial latency diagnosis, inspect the browser `Server-Timing` response hint and only redacted `performance_request`/`performance_database` log categories. These include route template, method, status, duration, response-byte hint, and aggregate database timing; they intentionally exclude request queries, customer fields, Gmail content, credentials, tokens, and provider payloads.

No repository-defined frontend lint script or TypeScript type-check command exists. The current frontend is JavaScript/JSX; `npm run build` is the available compile/build validation.

## Common Failures

| Symptom | Likely cause | Safe action |
|---|---|---|
| `docker compose config` rejects configuration | Required `.env` value is blank, often MongoDB password or Shopify settings. | Correct the untracked local configuration; do not place values in versioned files. |
| `/api/health/ready` is `503` | MongoDB unavailable or credentials/network wrong inside Compose. | Inspect `docker compose ps` and redacted `docker compose logs --tail=200 mongodb backend`. |
| Commerce route returns `503` while readiness is healthy | No active Shopify snapshot. | Complete a valid Shopify sync; do not use legacy seed data. |
| Sync returns `409` | Another sync owns the process-local lock. | Wait and inspect `/api/shopify/sync-runs`. |
| Sync returns `502` or validation failure | Shopify credential/scope/network failure or incomplete/inconsistent provider snapshot. | Preserve current active snapshot; inspect safe run/log evidence; use the Shopify runbook. |
| Browser calls `undefined/api` | Separate frontend development lacks `REACT_APP_BACKEND_URL`. | Set the backend origin and restart the frontend dev server. |
| Browser sees CORS failure or `403` for a local mutation in separate development | Browser origin is absent from `CORS_ORIGINS`, or code bypasses the central API client and therefore omits `X-Erydez-Request: local-console`. | Add the exact development origin, use the central API client, and restart backend after changing configuration; production uses same-origin proxying. |

| Gmail reports configuration required | OAuth client variables, redirect URI, or Fernet key missing/invalid. | Configure local environment precisely; see Gmail runbook. |
| Gmail reports `401` | Refresh token absent, expired, invalid, or revoked. | Reauthorize through browser OAuth. |
| Gmail access reports `409` | Local lifecycle is paused/disconnect pending/disconnected. | Resolve lifecycle through Settings before retrying. |
| AI drafts unavailable | No optional API key, invalid key, provider error, or quota exhaustion. | Use manual reply or resolve optional AI configuration; do not bypass Gmail confirmation. |
| Gmail send returns outcome-unknown `502` | The provider may have accepted the confirmed reply but local completion evidence could not be recorded safely. | Do **not** click send again for the same confirmation. Refresh and inspect the Gmail thread, then create a new explicit confirmation only if a reply is absent. |

## Escalation Record

When escalating, include only the minimum safe operational evidence: deployed commit, timestamps, affected route or run ID, snapshot validation summary, provider status category, container status, and relevant **redacted** log lines. For recovery work include backup location identifier and checksum, never the archive contents. Do not include credentials, OAuth state/code/token values, full Gmail messages, or customer-data extracts.
