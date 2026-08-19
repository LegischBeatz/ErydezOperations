# Runbooks

## Purpose

This directory contains trusted-LAN Docker deployment, Shopify synchronization, backup, recovery, and validation procedures for the E‑RYDEZ Operations Console. Shopify is the operational source of truth; MongoDB contains the validated canonical read model.

- [Shopify snapshot synchronization](shopify-synchronization.md)

## Security Boundary

The stack serves unauthenticated plain HTTP. Run it only on a trusted LAN or VPN. Do not port-forward it or expose it through a public proxy until application authentication, authorization, and TLS are implemented. The database contains real customer and order data; restrict host, filesystem, backup, Docker, and browser access accordingly.

MongoDB and FastAPI must not publish host ports. Nginx is the only published service and proxies same-origin `/api` requests. Credentials belong only in the untracked `.env` and must never appear in Git, logs, screenshots, tests, or documentation.

## Docker Compose Deployment

### Prerequisites

| Requirement | Windows | Linux/macOS |
|---|---|---|
| Container runtime | Docker Desktop with WSL2 and Linux containers | Docker Engine or Docker Desktop |
| Compose | Docker Compose plugin | Docker Compose plugin |
| Operator shell | PowerShell 5.1+ or PowerShell 7 | POSIX shell |
| Network | Trusted LAN/VPN access to configured frontend port | Trusted LAN/VPN access to configured frontend port |

### Configuration

Copy `.env.example` to the untracked `.env`, generate a strong URL-safe MongoDB password, and configure the permanent Shopify `*.myshopify.com` domain plus the client ID and client secret. The adapter obtains short-lived access tokens through Shopify’s client-credentials flow.[1]

Required backend variables are documented in [`docs/contracts/README.md`](../contracts/README.md). Do not include `https://`, `/admin`, or a custom storefront domain in `SHOPIFY_STORE_DOMAIN`.

### Start or Update

On Windows, Docker Desktop is a prerequisite and is not installed by the repository helper:

```powershell
docker --version
docker compose version
docker info
.\scripts\setup-windows.ps1
```

The helper preserves an existing `.env`, validates Compose, builds images, starts the stack, and checks frontend, liveness, and readiness.

For a standard update on any supported host:

```bash
docker compose config --quiet
docker compose build
docker compose up -d
docker compose ps
```

Open `http://localhost:8082` on the host, or use the configured `ERYDEZ_PORT`. Only the frontend port should appear under published ports.

### Operate

```bash
docker compose ps
docker compose logs --tail=200 frontend backend mongodb
curl -fsS http://127.0.0.1:8082/api/health/live
curl -fsS http://127.0.0.1:8082/api/health/ready
```

Stop containers without deleting MongoDB data:

```bash
docker compose stop
docker compose down
```

Never pass `--volumes` unless permanent deletion of Compose-managed application data is explicitly intended and a verified backup exists.

## Shopify Synchronization

Run synchronization from **Settings → Shopify integration → Run complete sync** or call `POST /api/shopify/sync`. The application stages and validates a complete snapshot before activation; the previous snapshot remains active if the run fails.

Use the dedicated [Shopify synchronization runbook](shopify-synchronization.md) for prerequisites, validation, rollback, credential rotation, and failure handling. The former mock reset endpoint is permanently disabled and returns HTTP 410.

## Backup and Restore

Before schema migrations or destructive cleanup, create a logical `mongodump --archive --gzip` backup and store it outside the repository. Record a SHA-256 checksum and test the corresponding `mongorestore` procedure against a separate disposable Compose project. A Docker volume is not a backup.

Do not overwrite or delete the active database during recovery until the restored copy has passed canonical count, source, uniqueness, and cross-link validation.

## Deployment Validation

```bash
curl -fsS http://127.0.0.1:8082/healthz
curl -fsS http://127.0.0.1:8082/api/health/live
curl -fsS http://127.0.0.1:8082/api/health/ready
curl -fsS 'http://127.0.0.1:8082/api/shopify/status?live=true'
curl -fsS http://127.0.0.1:8082/orders
```

All services must be healthy, readiness must report an active snapshot, live order/product/customer counts must match the active snapshot, and the `/orders` route must return the React application.

## Local Development

### Backend

Configure `MONGO_URL`, `DB_NAME`, `CORS_ORIGINS`, and Shopify variables, then run:

```bash
cd backend
uvicorn server:app --reload --host 0.0.0.0 --port 8001
```

### Frontend

Set `REACT_APP_BACKEND_URL` to the API origin for separate development, then run:

```bash
cd frontend
npm start
```

Production uses a blank frontend backend URL and same-origin `/api` proxying.

### Tests and Builds

```bash
python3 -m compileall -q backend
cd backend && pytest
cd ../frontend && npm test -- --watchAll=false
npm run build
```

The backend suite contains service-independent canonical tests and live HTTP integration tests. Run the live suite only against a controlled stack; it is read-only and confirms that obsolete mock mutations remain disabled. `backend/pytest.ini` controls xdist defaults; use `pytest -n 0` for serial troubleshooting without editing the configuration.

## Common Failures

| Symptom | Likely Cause | Resolution |
|---|---|---|
| API import fails for `MONGO_URL` or `DB_NAME` | Required backend environment is missing | Set both variables before starting Uvicorn. |
| Browser requests target `undefined/api` | Development frontend API origin is missing | Set `REACT_APP_BACKEND_URL` and restart the development server. |
| Browser reports CORS errors | Development origin is absent from `CORS_ORIGINS` | Add the exact origin and restart the API. |
| Compose rejects configuration | A required password or Shopify variable is blank | Correct the untracked `.env`; rerun `docker compose config --quiet`. |
| Shopify status reports unauthorized | Invalid/revoked client credentials or wrong token mode | Verify app credentials, rotate exposed secrets, and recreate the backend. |
| Full sync fails count or link validation | Incomplete fetch, scope issue, or source changed during the run | Keep the old snapshot active; inspect sync history/logs and retry only after diagnosis. |
| A Shopify value appears negative or unavailable | The live source contains that state | Verify in Shopify; do not coerce or invent a replacement. |
| Old frontend remains visible | Cached application document or old container | Hard-refresh and confirm the current frontend container/image. |
| Readiness returns HTTP 503 | MongoDB is unavailable | Restore MongoDB connectivity; readiness recovers when persistence returns. |
| Port `8082` is allocated | Another service owns the port | Stop the conflict or set a different `ERYDEZ_PORT`. |

## Recovery and Escalation

For a failed synchronization, preserve the active snapshot and inspect the failed run; do not manually purge data. For a failed code deployment, retain `.env` and the MongoDB volume, restore the previous code or image inputs, rebuild, and start the stack. For suspected credential or customer-data exposure, rotate credentials, restrict access, preserve audit evidence, and escalate to the store owner immediately.

Include run ID, timestamps, validation report, affected Shopify identifiers, deployed commit, relevant redacted log lines, and backup checksum in escalation material. Never include secrets or bulk customer data.

## References

[1]: https://shopify.dev/docs/apps/build/authentication-authorization/client-secrets "Shopify client credentials"
