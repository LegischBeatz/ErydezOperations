# ADR 0001: Local Docker Compose deployment boundary

- **Status:** Accepted
- **Date:** 2026-08-20
- **Decision makers:** E-RYDEZ Operations

## Context

The repository contains a React SPA, a FastAPI process, and MongoDB. The application needs a repeatable local deployment that keeps browser traffic on one origin and avoids directly publishing application or database ports. The current code has no application authentication, authorization, tenant isolation, or TLS configuration; its deployment boundary must therefore be explicit.

## Decision

Docker Compose is the supported packaged deployment. The stack runs Nginx with the compiled React SPA, one FastAPI Uvicorn worker, and authenticated MongoDB. Only the Nginx frontend is published to the host, bound by default to `127.0.0.1:8082`; `/api/` is proxied to the internal backend. MongoDB and FastAPI remain on internal networks.

The backend runs as a non-root user on a read-only filesystem with a temporary `/tmp`. MongoDB persists through the `mongodb-data` named volume. Docker health dependencies start MongoDB before the backend and the backend before the frontend.

## Alternatives Considered

| Alternative | Benefits | Drawbacks | Outcome |
|---|---|---|---|
| Compose with a single loopback frontend port | Repeatable full stack, same-origin API, no host database/backend exposure | Requires Docker and retains a local persistence volume | Chosen |
| Publish FastAPI and MongoDB ports | Simpler host-level debugging | Expands attack surface and bypasses Nginx’s same-origin boundary | Rejected |
| Native separate Node/Python/Mongo processes as the release path | Direct local debugging | Environment drift and no equivalent health-gated packaged topology | Rejected as the packaged deployment path |
| Public reverse proxy / TLS / external hostname | Enables remote access | Current code lacks app authentication/authorization and deployment security design | Deferred; not implemented |

## Consequences

The packaged application is reachable only through the frontend port and browser API calls use the same origin. Compose restarts services unless stopped, while normal container replacement preserves the MongoDB named volume.

The decision does **not** make the application safe for public exposure. Host, Docker, browser, backup, and local-network access remain sensitive because the console can expose Shopify snapshot data and operate a Gmail connection. Operators must keep the loopback binding unless a separately designed secure access layer is adopted.

## Risks and Mitigations

| Risk | Mitigation in current implementation | Remaining limitation |
|---|---|---|
| Direct backend or database exposure | Only `frontend` declares host ports; `data` network is internal. | A host user with Docker access can still inspect containers/volume. |
| Startup races | Health-gated `depends_on` chain. | Provider configuration and active Shopify snapshot are not proven by container health alone. |
| Persistent-data loss | Named volume survives `docker compose down` without `--volumes`. | A volume is not a backup; logical backup/restore is operator work. |
| Privilege escalation in backend container | Non-root user and read-only filesystem. | Provider credentials are still available as process environment variables. |
| Public unauthenticated access | Loopback bind by default and documented trusted-local use. | No technical application login/TLS enforcement exists. |

## Implementation Notes

`compose.yaml` defines the services and network boundary; `frontend/nginx.conf` serves the SPA and proxies `/api/`; the Dockerfiles build the backend and frontend images. `scripts/setup-windows.ps1` validates Docker availability, preserves an existing `.env`, builds/starts Compose, and checks `/healthz`, `/api/health/live`, and `/api/health/ready`.

Use `docker compose down` to remove containers while retaining the volume. Never use `docker compose down --volumes` without an explicit, verified data-deletion decision and an independently stored backup. See [`../runbooks/README.md`](../runbooks/README.md).
