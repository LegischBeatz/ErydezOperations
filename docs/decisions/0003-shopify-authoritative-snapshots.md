# ADR 0003: Shopify-authoritative validated snapshots

- **Status:** Accepted
- **Date:** 2026-08-20
- **Decision makers:** E-RYDEZ Operations

## Context

The current product needs a responsive operational view across orders, customers, products, variants, inventory, fulfillment, refunds, and returns. Shopify already owns those commerce records. Legacy seed code and compatibility pages use a different mock-era shape and are not part of the active backend path.

The implementation must avoid presenting a partially fetched or internally inconsistent provider dataset as a complete operational view. It must also leave prior usable commerce data visible when a refresh fails.

## Decision

Shopify is the sole authority for canonical commerce data. MongoDB stores a normalized, read-only query model built from complete Shopify snapshots. A full synchronization obtains shop/source counts, fetches accessible data through cursor pagination, normalizes records, validates integrity, inserts records under a new `sync_id`, and only then activates that snapshot through `meta.id = "shopify_sync"`.

Canonical routes query only the active `sync_id`. The console does not mutate Shopify. Legacy mock write routes return `409`; `/api/reset` returns `410`; and `backend/seed.py` is not imported by the runtime backend.

## Alternatives Considered

| Alternative | Benefits | Drawbacks | Outcome |
|---|---|---|---|
| Direct Shopify query on every browser request | No local copy | Provider latency/rate-limit exposure; difficult aggregates; no stable cross-page snapshot | Rejected |
| Legacy mock workflows with selected Shopify fields | Lower short-term migration effort | Conflicting data ownership and inconsistent shapes | Rejected |
| Incremental upserts into one visible collection | Lower per-run storage cost | Partial/removed records can become visible; rollback is unclear | Rejected |
| Complete staged snapshot and active-metadata switch | Consistent query target, explicit validation, previous snapshot remains usable during failure | Full-fetch cost and temporary duplicate records | Chosen |

## Consequences

The active UI exposes only Shopify-aligned commerce records. Snapshot activation is eventually consistent rather than real time. Synchronization is operator initiated through Settings or `POST /api/shopify/sync`; no scheduler, webhook, or background worker performs it.

The server keeps recent run evidence and cleans old canonical snapshots after successful activation. `sync_runs` history is bounded. A failed staging run removes its staged rows and leaves the prior active metadata intact. A semantically bad but technically valid activated snapshot requires manual recovery from an operator-maintained logical backup; this is not automatic rollback.

## Risks and Mitigations

| Risk | Mitigation in implementation | Remaining limitation |
|---|---|---|
| Incomplete provider traversal | Shopify connection pagination continues until `hasNextPage` is false; expected order/product/customer counts are checked. | Source changes during a long sync can still cause validation failure. |
| Broken relationships | Validation rejects duplicate/missing Shopify IDs and broken product–variant, variant–inventory, customer–order, and child–order links. | Validation covers implemented links only, not every Shopify field relationship. |
| Failed refresh replaces usable data | Activation occurs after staged insert and validation; previous active snapshot remains query target on failure. | Process-local lock is per backend process; backend runs one worker by deployment decision. |
| Stale/mock collections remain | Successful activation deletes non-active canonical records and drops listed mock-only collections. | Old source files/pages remain for compatibility and are not active workflows. |
| Credential/provider error leaks into operations | API returns bounded safe errors; secrets are environment-only; sync ledger redacts token-like values. | Operators still need secure host and log access. |

## Implementation Notes

`backend/shopify.py` owns configuration, token selection, transport retries, throttle pauses, cursor pagination, and normalization. `backend/server.py` owns indexes, validation, staging, activation, cleanup, and active-snapshot query routes. The snapshot entity contract is in [`../contracts/README.md`](../contracts/README.md) and the operating procedure is in [`../runbooks/shopify-synchronization.md`](../runbooks/shopify-synchronization.md).

Schema changes that affect canonical documents, the active-metadata record, validation relationships, or cleanup must include a migration/recovery plan, contract update, tests, and a review of the existing active snapshot before deployment.
