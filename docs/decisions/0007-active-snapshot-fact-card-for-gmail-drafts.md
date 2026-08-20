# ADR 0007: Active Shopify snapshot fact card for Gmail AI drafts

- **Status:** Accepted
- **Date:** 2026-08-20
- **Decision makers:** E-RYDEZ Operations

## Context

Profile-guided Gmail AI drafts can safely identify recurring operational concerns, but a current thread often lacks verified order-state information. Operators otherwise have to transfer information manually from the commerce workspace, which risks omission, stale recollection, or an unreviewed operational commitment in a draft.

Shopify is the authoritative commerce source. The console serves only the currently active normalized Shopify snapshot and does not mutate Shopify. Gmail remains a local OAuth-backed, on-demand workspace with no message mirror, watch, webhook, background synchronization, attachment download, automatic draft send, or automatic reply send. The draft flow must remain optional, editable, non-sending, and bounded to the selected thread plus at most 500 characters of operator guidance.

## Decision

The FastAPI Gmail draft route may resolve one order against the active Shopify snapshot before calling the optional AI provider. Resolution is permitted only when the normalized selected Gmail thread contains exactly one explicit numeric order reference. It queries the active snapshot by that complete reference only, accepts one matching active order only, and reads no live Shopify data.

The resolver explicitly rejects customer names, email addresses, phone numbers, product names, tracking values, partial numbers, multiple references, zero matches, and multiple matches as lookup keys or outcomes. These cases return a safe status without a fact card and do not fail the Gmail draft or manual reply workflow.

The fact card is minimized before reaching the optional AI provider or the browser. It contains only the order reference, snapshot timestamp, financial/fulfillment/return status, delivery method, cancellation marker, provider tracking numbers, and line-item product titles/quantities. It omits customer identity, addresses, notes, money values, Shopify IDs, status-page URLs, raw documents, and provider payloads.

The prompt treats the fact card as an explicit, read-only source. It may repeat only supplied values and must not infer a delivery date, price, refund, availability, diagnosis, or other commitment. The UI marks the source as the active read-only snapshot and retains the existing edit and two-step Gmail send confirmation flow.

## Alternatives Considered

| Alternative | Benefits | Drawbacks | Outcome |
|---|---|---|---|
| Active-snapshot lookup by one explicit order reference | Current locally validated data; no live provider request; narrow matching rule | Only works for explicit, unique references | Chosen |
| Live Shopify lookup during draft generation | Could be fresher than the snapshot | Adds provider dependency, latency, credentials/transport coupling, and an unreviewed live-data path | Rejected |
| Match by Gmail sender email or customer name | More automatic linkage | Ambiguous identity matching and unnecessary disclosure of customer data to the draft provider | Rejected |
| Match by product name or tracking number | Helps product/delivery queries | Values are non-unique and can refer to many orders | Rejected |
| Show full order detail to the AI | More context | Exposes addresses, money, notes, and nonessential customer data | Rejected |
| No Shopify grounding | Lowest implementation complexity | Leaves operators to manually transfer verified current facts | Rejected |

## Consequences

Shopify remains the authoritative commerce source; the console reads only the active local snapshot and does not mutate Shopify. MongoDB remains persistent active-snapshot/read-model storage plus Gmail OAuth and console-owned integration metadata. The Gmail workspace remains local OAuth-backed and on demand, without a watch, webhook, or background synchronization. OpenAI remains an optional external draft-generation dependency; a draft never sends mail automatically. Deployment remains Docker Compose with Nginx frontend, internal FastAPI and MongoDB, loopback-only frontend port by default, and no app authentication or TLS.

The draft response adds optional `shopify_facts` and fact-status metadata. The contents are transient response data only: they are not stored with Gmail threads, drafts, feedback, or audit events. A missing/ambiguous fact card is not an error state and must preserve manual drafting.

## Risks and Mitigations

| Risk | Mitigation | Remaining limitation |
|---|---|---|
| Wrong order is used | Require exactly one explicit reference and exactly one active snapshot match; do not use identity or partial matches | Customer may omit or mistype the number |
| Stale snapshot fact | Label the snapshot timestamp and source; require final operator review | Snapshot may lag the live Shopify provider until the next controlled sync |
| Excess provider disclosure | Minimize the card fields and keep it transient; omit PII, money, notes, URLs, and raw records | The optional provider still receives the approved minimal facts for that draft |
| Draft converts status into a promise | Prompt prohibits inferred delivery dates, refunds, prices, availability, and commitments; UI keeps review flags and two-step send | Operator must still review the final wording |
| P1 changes into a broader data integration | No live lookup, write, persistence, feedback archive, or generic customer search is included | Future expansion needs a separate ADR and contract/runbook review |

## Implementation Notes

The server resolver is in `backend/server.py`, the pure reference/fact-card helpers are in `backend/draft_facts.py`, and `backend/gmail_service.py` accepts only an already minimized card for one generation request. The UI rendering is in `frontend/src/pages/GmailInbox.jsx`. The browser remains behind `frontend/src/lib/api.js`.

Focused unit tests cover reference extraction, quoted-history exclusion, multi-reference fallback, strict normalization, and PII/minimization of the card. The fact-card response and runbook behavior are documented in [`../contracts/gmail.md`](../contracts/gmail.md) and [`../runbooks/gmail-workspace.md`](../runbooks/gmail-workspace.md).
