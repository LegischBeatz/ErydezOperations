# Current Scope and Change Gates

## Purpose

This repository does not encode a committed product roadmap beyond the code currently present. This document records the implemented scope and the architectural change gates that must be satisfied before expanding it. It must not be read as evidence that unimplemented services, workflows, or release dates exist.

## Implemented Scope

| Area | Implemented now |
|---|---|
| Shopify commerce | Complete operator-triggered snapshot synchronization; normalized active-snapshot queries for orders, products, variants, inventory, customers, fulfillments, refunds, and returns. |
| Commerce UI | Overview, lists/details, reports, global search, snapshot status, sync history, and read-only operation. |
| Gmail | Google OAuth, encrypted refresh-token persistence, on-demand thread read, sanitized HTML display, optional AI draft, and confirmed existing-thread reply. |
| Integration control | Local Gmail readiness/lifecycle/recovery-owner records, safe health checks, audit timeline, and provider ledger. |
| Deployment | Local Docker Compose with Nginx frontend, FastAPI backend, authenticated MongoDB, loopback-published frontend port, and container health checks. |
| Validation | Backend unit/HTTP tests, frontend tests/build, backend syntax check, and a Compose smoke workflow definition. |

## Explicitly Not Implemented

| Capability | Current state |
|---|---|
| Shopify mutation from console | Not implemented; legacy mutation compatibility routes return `409`. |
| Scheduled or webhook-driven Shopify synchronization | Not implemented. |
| Gmail push watch, Pub/Sub, webhook, or scheduled sync | Not implemented. |
| Gmail mailbox mirror, draft persistence, or attachment download | Not implemented. |
| Application authentication, authorization, tenant isolation, or TLS | Not implemented. |
| Public hosting/access topology | Not designed or implemented. |
| Automated backups, retention, restore automation, monitoring, alerting, or metrics | Not implemented. |
| Formal API wire-versioning/migration framework | Not implemented beyond current schema version metadata and coordinated code/document updates. |

## Required Change Gates

| Proposed expansion | Minimum required work before implementation |
|---|---|
| Shopify writes | Define source-of-truth/mutation authority, authentication/authorization, validation/idempotency, provider failure handling, audit trail, tests, contract/runbook updates, and ADR. |
| Scheduler, polling, watch, webhook, or background worker | Define execution environment, lifecycle, secrets, retries, idempotency, observability, failure recovery, deployment model, tests, runbook, and ADR. |
| Public/remote access | Add a reviewed security architecture with authentication, authorization, TLS, access control, session model, logging, incident response, and deployment/runbook updates. |
| Gmail attachments or message persistence | Define authorization scopes, content storage/retention, malware/content handling, privacy, download controls, recovery, tests, contract/runbook, and ADR. |
| Automated backup/restore | Define backup tooling, encryption, retention, storage location, restore testing, ownership, recovery objective, monitoring, and operational runbook. |

## Source Documents

Use [`PROJECT.md`](../PROJECT.md) for the current system snapshot, [`architecture.md`](architecture.md) for technical boundaries, [`contracts/`](contracts/) for interfaces, [`runbooks/`](runbooks/) for operations, and [`decisions/`](decisions/) for durable choices.
