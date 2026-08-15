# Version 1.0 Roadmap

## Current baseline

The repository is a mock-backed operations-console prototype. Docker Compose is the supported
installation path. The first compatibility target is Windows with Docker Desktop and Linux
containers; equivalent Linux and macOS procedures are documented and validated through the same
Compose contract.

## Milestones

### 1.0 installation baseline

- Reproducible Docker Compose startup on Windows, Linux, and macOS.
- PowerShell bootstrap and validation for Windows operators.
- Health-gated MongoDB, FastAPI, and frontend services.
- Automated Compose build and smoke checks in CI.
- Clear trusted-LAN security and data-volume warnings.

### 1.1 operational hardening

- Add application authentication, authorization, and tenant boundaries.
- Define backup/restore ownership, retention, and recovery objectives.
- Add structured metrics, logs, and alerting guidance.
- Add explicit API compatibility and migration policies.

### Future integration releases

- Replace mock integration records with explicit, tested adapters for commerce, messaging,
  fulfillment, and calendar providers.
- Introduce production deployment topology, TLS, secret management, and migration tooling.

The roadmap is intentionally separate from the current mock data and must not be read as evidence
that any external integration is live.
