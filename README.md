# E-RYDEZ Operations Console

Version: `1.0.0` release-readiness baseline (planned)

An internal operations-console prototype for coordinating mock orders, conversations, fulfillment,
inventory, returns, appointments, purchasing, and automation approvals.

The supported host deployment uses Docker Compose to run the production React bundle behind Nginx,
one FastAPI worker, and authenticated MongoDB. It is unauthenticated plain HTTP intended only for a
trusted LAN or VPN. The data and named integrations are mock data; this is not a public production
deployment.

## Quick start on Windows

Install Docker Desktop, enable the WSL2 backend, and select Linux containers. In PowerShell, from
the cloned repository, run:

```powershell
.\scripts\setup-windows.ps1
```

The helper creates `.env` only when it does not exist, generates a database password, builds the
images, starts the stack, and checks the health endpoints. Open `http://localhost:8082` when it
reports ready. Use `-Port 8085` to choose another host port, or `-SkipBuild` when the images are
already current.

Do not expose this unauthenticated HTTP service to the public internet. Read the full deployment
runbook before using it with anything other than the included mock data.

## Linux and macOS

Install Docker Engine or Docker Desktop with the Compose plugin, then run:

```bash
cp .env.example .env
openssl rand -hex 32
# Set the generated value as MONGO_ROOT_PASSWORD in .env.
docker compose config --quiet
docker compose up -d --build
```

Open `http://localhost:8082` after `docker compose ps` reports healthy services. The same named
volume and health-gated startup behavior applies on all supported host platforms.

For stopping, updating, troubleshooting, and safe data handling, see
[`docs/runbooks/README.md`](docs/runbooks/README.md). The release roadmap is in
[`docs/roadmap.md`](docs/roadmap.md).

See [`PROJECT.md`](PROJECT.md) for the system summary and
[`docs/runbooks/README.md`](docs/runbooks/README.md) for deployment and operating procedures.
