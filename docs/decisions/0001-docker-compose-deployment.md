# ADR 0001: Trusted-LAN Docker Compose deployment

- **Status:** Accepted
- **Date:** 2026-08-11
- **Decision Makers:** E-RYDEZ project owner

## Context

The prototype required operators to start React, FastAPI, and MongoDB separately. The host already
runs PoseVault and PromptSmith as healthy Compose stacks with a production frontend proxy, internal
application services, persistent storage, restart policies, and dependency health checks.

## Decision

- Docker Compose is the supported trusted-LAN deployment.
- Compose runs Nginx/React, exactly one non-root FastAPI worker, and authenticated MongoDB with a
  named volume.
- Only Nginx publishes a host port, `8082` by default, and proxies same-origin `/api` requests.
- MongoDB is isolated on an internal data network. Its readiness gates the backend, and backend
  readiness gates the frontend.
- The backend filesystem is read-only except for an ephemeral `/tmp` tmpfs.
- TLS, application authentication, public exposure, and migration from an existing MongoDB are
  outside this deployment.

## Alternatives Considered

| Alternative | Benefits | Drawbacks | Decision |
|---|---|---|---|
| Continue separate development processes | No container definitions | Not reproducible or restartable | Rejected |
| Publish backend and MongoDB ports | Easier direct diagnostics | Unnecessary LAN attack surface | Rejected |
| Route through the host Caddy service | Central TLS and hostname | Adds public-proxy and certificate decisions | Rejected |

## Consequences

The stack starts reproducibly, browser traffic uses one origin, internal services are not published,
and MongoDB data survives normal container replacement. Operators must create a strong MongoDB
password, enforce the trusted-LAN boundary, monitor host disk/log usage, and avoid removing the named
volume unintentionally.

The application still has no login or authorization. Every trusted client can call every endpoint,
including the destructive mock-data reset. TLS and application authentication are prerequisites for
production or sensitive operational data.

## Implementation Notes

Use `docker compose down` to remove containers without deleting data. Passing `--volumes`
permanently deletes the Compose-managed database. The single-worker constraint avoids introducing
unsupported multi-process coordination semantics.
