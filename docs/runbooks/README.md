# Runbooks

## Purpose

This directory contains the trusted-LAN Docker deployment and repeatable local-development and
validation procedures. The application is a mock-backed prototype, not a public or authenticated
production service.

## Docker Compose Deployment

### Security Boundary

The stack serves unauthenticated plain HTTP on all LAN interfaces. Run it only on a trusted LAN or
VPN. Do not port-forward it, publish it through a public proxy, or expose Docker ports for MongoDB or
the backend. `POST /api/reset` is unauthenticated and deletes and recreates the mock operational
collections; never use it with data that must be retained.

### Prerequisites

- Docker Engine with the Compose plugin.
- Windows operators: [Docker Desktop](https://www.docker.com/products/docker-desktop/) with the
  WSL2 backend and Linux containers. PowerShell 5.1+ or PowerShell 7 is supported.
- Linux/macOS operators: Docker Engine or Docker Desktop with the Compose plugin.
- Host firewall or VPN rules limiting TCP port `8082` to trusted clients.
- Sufficient Docker storage for images, logs, and the MongoDB volume.

### Configure and Start

#### Windows (first supported host path)

Docker Desktop is a prerequisite and is not installed by the repository script. Install it, enable
the WSL2 backend, select Linux containers, start Docker Desktop, and wait for the engine to become
ready. Verify the installation in PowerShell:

```powershell
docker --version
docker compose version
docker info
```

`docker info` must return engine details rather than a daemon-connection error. If it fails, start
Docker Desktop and rerun the command before continuing.

From PowerShell at the repository root, run:

```powershell
.\scripts\setup-windows.ps1
```

The script does not overwrite an existing `.env`. It generates a URL-safe password using Windows
cryptography APIs, validates Compose, builds the images, starts the stack, and checks the frontend,
liveness, and readiness endpoints. Use `-Port 8085` if port `8082` is already occupied. If Docker
Desktop reports that the daemon is unavailable, start it and confirm that Linux containers are
selected before rerunning the script.

#### Linux and macOS

Create the untracked Compose environment and generate a URL-safe database password:

```bash
cp .env.example .env
openssl rand -hex 32
```

Set the generated value as `MONGO_ROOT_PASSWORD` in `.env`. Validate, build, and start the stack:

```bash
docker compose config --quiet
docker compose build
docker compose up -d
docker compose ps
curl -fsS http://127.0.0.1:8082/api/health/ready
```

All three services must report healthy. Open `http://<server-address>:8082`; use the configured
`ERYDEZ_PORT` instead if changed. Only the frontend port should appear under published ports.

On Windows, `localhost` is preferred over a host LAN IP for local use. For LAN use, allow only the
configured frontend port through the host firewall and remember that application authentication and
TLS are not implemented.

### Operate and Update

Inspect status and recent logs:

```bash
docker compose ps
docker compose logs --tail=200 frontend backend mongodb
```

Rebuild and restart after an application update:

```bash
docker compose build --pull
docker compose up -d
```

Stop or remove containers without deleting MongoDB data:

```bash
docker compose stop
docker compose down
```

Data is stored in the `erydez-operations_mongodb-data` named volume and survives container
replacement and `docker compose down`. Never pass `--volumes` unless permanent deletion of all
Compose-managed application data is intended.

### Backup and Restore

This prototype has no automated backup schedule. For an operator-triggered logical backup, ensure no
mutations are in progress and run `mongodump` inside the authenticated MongoDB service, writing the
archive to an explicitly chosen host backup directory. Test the corresponding `mongorestore`
procedure against a separate disposable Compose project before relying on a backup. Do not treat a
Docker volume as a backup, and do not commit database archives or credentials.

### Deployment Validation

```bash
curl -fsS http://127.0.0.1:8082/healthz
curl -fsS http://127.0.0.1:8082/api/health/live
curl -fsS http://127.0.0.1:8082/api/health/ready
curl -fsS http://127.0.0.1:8082/orders
```

The deep `/orders` route must return the React application. MongoDB and FastAPI must have no
published host ports. If MongoDB stops, liveness remains available while readiness returns HTTP 503;
readiness must recover after MongoDB restarts.

## Local Development

### Prerequisites

- A supported Python environment with `backend/requirements.txt` installed.
- Node.js and npm compatible with `frontend/package-lock.json`.
- A reachable disposable MongoDB database.

### Configuration

Configure the backend process with `MONGO_URL` and `DB_NAME`. Set `CORS_ORIGINS` explicitly to
`http://localhost:3000` for the separate local frontend; blank or omitted disables CORS. Configure the frontend with
`REACT_APP_BACKEND_URL` pointing to the API origin. Environment files are ignored by Git and must
not be committed.

### Start the Services

From `backend/`, start the API on the port expected by the test defaults:

```bash
uvicorn server:app --reload --host 0.0.0.0 --port 8001
```

From `frontend/`, start the React development server:

```bash
npm start
```

Create React App normally serves on port 3000. Set `ENABLE_HEALTH_CHECK=true` before starting the
frontend only when the custom development-server health routes are needed.

### Validation

Run service-independent checks from the repository root:

```bash
python3 -m compileall -q backend
cd frontend
npm run build
```

The backend pytest suite is a live HTTP integration suite, not an in-process unit suite. It calls
`POST /api/reset` and therefore must use a disposable database. With MongoDB and the API running:

```bash
cd backend
pytest
```

`backend/pytest.ini` runs two xdist workers with `loadscope`. To troubleshoot serially, use
`pytest -n 0` and do not edit the configured defaults. The frontend currently has no tracked test
files; if tests are added, run `npm test -- --watchAll=false`.

The repository also runs a Docker Compose smoke workflow in CI. It validates the Compose file,
builds all images, waits for service health, checks representative routes, and removes its
disposable volume afterward. CI runs on Linux; Windows Docker Desktop behavior is covered by the
PowerShell acceptance procedure above.

## Reset Seed Data

`POST /api/reset` deletes and recreates every collection represented by `backend/seed.py`. Use it
only against a disposable development/test database. Success returns `{"status": "reseeded"}`.

## Common Failures

| Symptom | Likely Cause | Resolution |
|---|---|---|
| API import fails with `KeyError: MONGO_URL` or `DB_NAME` | Required backend environment is missing | Set both variables before starting Uvicorn. |
| Browser requests target `undefined/api` | `REACT_APP_BACKEND_URL` was absent at frontend build/start time | Set the variable and restart/rebuild the frontend. |
| Browser reports CORS errors | Frontend origin is not in `CORS_ORIGINS` | Add the exact origin and restart the API. |
| Compose rejects its configuration | `MONGO_ROOT_PASSWORD` is blank or absent | Generate a URL-safe password and set it in the untracked `.env`. |
| PowerShell script cannot find Docker | Docker Desktop is not installed or its CLI is not on `PATH` | Install Docker Desktop, restart PowerShell, and verify `docker --version`. |
| Docker CLI cannot connect to the daemon | Docker Desktop is not running or Linux containers/WSL2 is unavailable | Start Docker Desktop, enable WSL2/Linux containers, verify with `docker info`, and rerun the helper. |
| Windows port is already allocated | Another service owns port `8082` | Stop the conflicting service or run the helper with `-Port <free-port>`. |
| A Compose service remains unhealthy | MongoDB authentication, startup, or API readiness failed | Inspect `docker compose ps` and the last 200 service log lines. |
| Integration tests cannot connect to port 8001 | API is not running or `REACT_APP_BACKEND_URL` points elsewhere | Start the API or set the test URL explicitly. |
| Expected mock records are absent | Seed marker exists but collections were changed | After confirming the database is disposable, call `/api/reset`. |
| Frontend health routes are absent | Health plugin was not enabled before startup | Restart with `ENABLE_HEALTH_CHECK=true`. |

## Recovery and Escalation

- For local mock-data corruption, reseed only after confirming the target database can be erased.
- For a failed container update, retain `.env` and the MongoDB volume, restore the previous code or
  image inputs, rebuild, and run `docker compose up -d`.
- Docker daemon log rotation and disk alerting are host-managed. Inspect disk use before any Docker
  pruning action and never prune volumes without identifying their owners.
- No production access, on-call owner, or escalation contact is documented. Obtain those details
  before storing sensitive or non-mock data.

## Runbook Template

# Runbook: Procedure Name

## When to Use

Describe the symptoms, trigger, or operational scenario.

## Prerequisites

- Required access:
- Required tools:
- Required environment:

## Procedure

1.
2.
3.

## Validation

Describe how to confirm the procedure succeeded.

## Rollback / Recovery

Describe safe recovery steps if the procedure fails.

## Common Failures

| Symptom | Likely Cause | Resolution |
|---|---|---|
| | | |

## Escalation

- Escalate to:
- Include these diagnostics:
