# Architecture Decision Records

This directory records durable choices already reflected in the current implementation. An ADR explains **why** a boundary or operating model exists; contracts explain **what** callers can rely on; runbooks explain **how** to operate it.

| ADR | Decision | Implementation boundary |
|---|---|---|
| [0001](0001-docker-compose-deployment.md) | Package the system as a loopback-published Docker Compose stack. | `compose.yaml`, Dockerfiles, Nginx, setup script |
| [0002](0002-cross-platform-release-baseline.md) | Use Compose-first onboarding and smoke verification. | `scripts/setup-windows.ps1`, Compose workflow, runbooks |
| [0003](0003-shopify-authoritative-snapshots.md) | Treat Shopify as authority and expose validated active snapshots. | `backend/shopify.py`, `backend/server.py` |
| [0004](0004-gmail-integration-mcp-connector.md) | Use direct Google OAuth and Gmail REST with encrypted refresh tokens. | `backend/gmail_service.py`, Gmail routes/UI |
| [0005](0005-ai-draft-operator-guidance.md) | Keep AI guidance bounded, ephemeral, and subordinate to safety rules. | Gmail composer and draft service |

Create or amend an ADR when changing the commerce source of truth, snapshot activation, provider authorization, token/secret handling, external write behavior, deployment exposure, compatibility strategy, or recovery model. Each record must describe context, decision, alternatives, consequences, risks, and implementation notes based on the code that will ship.

Do not record planned technology as implemented behavior. Link an ADR to the corresponding contract, runbook, tests, and source boundary in the same change.
