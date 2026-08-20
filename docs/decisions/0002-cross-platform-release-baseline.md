# ADR 0002: Compose-first local onboarding and smoke verification

- **Status:** Accepted
- **Date:** 2026-08-20
- **Decision makers:** E-RYDEZ Operations

## Context

The repository packages its runtime through Docker Compose, while developers may also run frontend and backend processes separately. Windows has a repository-provided PowerShell helper, and the same Compose file can be operated from Docker Engine or Docker Desktop hosts. A reliable onboarding path must state what the repository configures and what remains host/operator responsibility.

## Decision

Treat Compose as the supported local deployment and smoke-test path. On Windows, use Docker Desktop with Linux containers and the WSL2 backend, then run `scripts/setup-windows.ps1`. On Linux/macOS, prepare the untracked `.env`, validate the Compose model, build, start, and run the documented health checks.

The Windows helper does not install Docker Desktop, enable virtualization, overwrite an existing `.env`, or populate Shopify/Gmail credentials. It checks Docker/Compose availability, creates `.env` from `.env.example` only when absent, generates a MongoDB password in that new file, applies a chosen host port through `ERYDEZ_PORT`, builds unless `-SkipBuild` is supplied, starts services, and polls the frontend/backend health endpoints for up to three minutes.

## Alternatives Considered

| Alternative | Benefits | Drawbacks | Outcome |
|---|---|---|---|
| Compose-first onboarding with a Windows helper and portable commands | Matches packaged topology; keeps host instructions concise; verifies health | Requires Docker runtime and a correctly configured `.env` | Chosen |
| Native installation as the supported operations path | No containers required | Version/runtime/database configuration drift; no equivalent topology guarantee | Rejected for operations |
| Auto-install Docker, configure WSL2, or alter firewall settings | Fewer manual host steps | Requires elevated system changes outside repository control | Rejected |
| Treat a successful health check as proof of live provider readiness | Simple visible success signal | `/api/health/ready` proves MongoDB only, not an active snapshot or provider connectivity | Rejected |

## Consequences

Onboarding instructions must distinguish **container health**, **active Shopify snapshot state**, and **live Shopify/Gmail provider availability**. A fresh Compose stack can start successfully without a Shopify snapshot; canonical commerce pages subsequently return `503` until an operator completes a valid synchronization.

The CI workflow currently attempts a disposable Compose smoke process and verifies Nginx health, backend readiness, an SPA route, and that only the frontend publishes a port. Those checks are useful topology validation, but they are not an end-to-end provider synchronization test and must not be presented as one.

## Risks and Mitigations

| Risk | Mitigation | Remaining limitation |
|---|---|---|
| Existing secret configuration is overwritten | Windows helper preserves an existing `.env`. | Operators still manage values and secret rotation. |
| A developer assumes default `.env.example` starts all services | Documentation requires completion of Compose-required values and explains optional Gmail/AI values. | Compose interpolation rejects absent Shopify values by design. |
| Port collision | Helper accepts `-Port`; Compose honors `ERYDEZ_PORT`. | Host users must select an available loopback port. |
| Host-platform behavior differs | Compose configuration and container images are shared across hosts. | The repository does not automate Windows virtualization or firewall validation. |
| Smoke validation mutates retained data | Runbooks require a controlled/disposable environment for destructive or live integration tests. | No standalone ephemeral database harness is bundled. |

## Implementation Notes

The operational procedures are in [`../runbooks/README.md`](../runbooks/README.md). The precise Windows flow is implemented in [`../../scripts/setup-windows.ps1`](../../scripts/setup-windows.ps1). `compose.yaml` is the deployment contract; do not replace it with stale native-install or mock-prototype instructions.
