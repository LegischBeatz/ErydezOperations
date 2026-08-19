# ADR-0003: Shopify-Authoritative Canonical Snapshots

- **Status:** Accepted
- **Date:** 2026-08-16
- **Decision Makers:** E‑RYDEZ Operations

## Context

The console was initially implemented around seeded mock workflows whose fields, mutations, and navigation did not match the live Shopify store. Mixing mock and Shopify records caused inconsistent totals, incomplete relationships, synthetic operational states, and frontend assumptions that failed when real records lacked mock-only fields.

Shopify already owns the authoritative order, customer, product, variant, inventory, fulfillment, refund, and Return models. These entities are linked by stable Shopify identifiers and exposed through cursor-paginated GraphQL connections.[1] [2] [3] [4]

## Decision

The application will treat **Shopify as the sole operational source of truth**. MongoDB will be a normalized, read-only query model composed of complete, validated snapshots. A new snapshot is staged under a unique synchronization identifier and becomes active only after source-count, uniqueness, persistence-count, and cross-record-link validations succeed. The previous active snapshot remains available until activation completes.

The console will expose only Shopify-backed operational sections. Mock-only mutations and reset behavior are disabled. Shopify changes remain in Shopify unless a future ADR defines an authenticated, authorized mutation workflow.

## Alternatives Considered

| Alternative | Benefits | Drawbacks | Decision |
|---|---|---|---|
| Preserve mock workflows and overlay Shopify fields | Lowest initial change | Two conflicting models, synthetic states, fragile UI assumptions, unclear authority | Rejected |
| Query Shopify directly for every browser request | No local replication | Higher latency and rate-limit exposure, difficult cross-entity aggregation, weaker availability | Rejected |
| Incremental upserts without snapshot activation | Smaller writes | Partial state can become visible; stale/deleted records are harder to identify safely | Rejected |
| Validated full snapshots with atomic metadata activation | Consistent reads, deterministic cleanup, simple rollback semantics, auditable runs | Higher synchronization cost and temporary duplicate storage | Chosen |

## Consequences

### Positive

The UI now mirrors Shopify terminology and available information, every visible operational record is traceable to a Shopify identifier, and cross-entity links are deterministic. Synchronization failures cannot replace the active snapshot, and mock records are removed only after successful activation.

### Negative

The console is eventually consistent rather than real-time, and complete snapshots fetch and rewrite the accessible store dataset. Operational sections that have no Shopify source are no longer presented as active workflows. Shopify mutation functionality is intentionally absent.

### Risks and Mitigations

| Risk | Mitigation |
|---|---|
| A partial Shopify fetch is mistaken for a complete snapshot | Compare fetched order, product, and customer totals with Shopify count queries before activation |
| A record points to a missing parent | Validate product–variant, variant–inventory, customer–order, and order–child links |
| A failed run corrupts visible data | Stage under a new `sync_id`; retain the previous active snapshot; delete failed staging records |
| Mock or stale records remain visible | Query only the active `sync_id`, then remove stale canonical records and mock-only collections after activation |
| A leaked or expired token interrupts synchronization | Use the Shopify client-credentials flow, keep secrets in untracked environment variables, and renew short-lived tokens automatically.[5] |
| Public access exposes customer data | Keep the deployment on a trusted LAN/VPN until authentication and TLS are implemented |

## Implementation Notes

The Shopify adapter is implemented in `backend/shopify.py`. Snapshot orchestration, validation, activation, cleanup, indexes, and canonical query routes are implemented in `backend/server.py`. The active snapshot is identified by `meta.id = "shopify_sync"`. The frontend API boundary remains `frontend/src/lib/api.js`, and Shopify-specific presentation helpers are isolated in `frontend/src/lib/shopify.js`.

The authoritative migration began from a verified logical MongoDB backup. The first accepted snapshot stored 711 orders, 44 products, 732 variants, 732 inventory items, 1,781 customers, 554 fulfillments, 73 refunds, and zero Shopify Return objects; the exact values are expected to change with the live store.

## References

[1]: https://shopify.dev/docs/api/admin-graphql/latest/objects/Order "Shopify Admin GraphQL Order"
[2]: https://shopify.dev/docs/api/admin-graphql/latest/objects/Product "Shopify Admin GraphQL Product"
[3]: https://shopify.dev/docs/api/admin-graphql/latest/objects/InventoryItem "Shopify Admin GraphQL InventoryItem"
[4]: https://shopify.dev/docs/api/usage/pagination-graphql "Shopify GraphQL pagination"
[5]: https://shopify.dev/docs/apps/build/authentication-authorization/client-secrets "Shopify client credentials"
