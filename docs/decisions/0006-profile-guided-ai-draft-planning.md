# ADR 0006: Profile-guided, non-persistent Gmail AI draft planning

- **Status:** Accepted
- **Date:** 2026-08-20
- **Decision makers:** E-RYDEZ Operations

## Context

Historical sent email analysis shows recurring operational request classes, particularly delivery status, order/payment changes, pickup appointments, technical or parts questions, and cancellations/refunds. The prior AI draft flow supplied bounded thread text and optional operator guidance to a single generic prompt. It did not make the detected request class, address-formality hint, missing information, or operational risk visible to the operator.

Gmail remains the source of truth for threads and messages. The console intentionally has no mailbox mirror, background Gmail synchronization, or persistent draft archive. Shopify remains the authoritative commerce source and the console does not mutate Shopify. The existing Gmail draft flow must remain optional, editable, non-sending, and limited to the selected thread plus at most 500 characters of operator guidance.

## Decision

The Gmail AI draft flow now derives a non-persistent `draft_plan` from the selected normalized thread before calling the optional AI provider. The plan contains a curated response-profile ID and label, a conservative language and German address-formality hint, an order-reference indicator, missing-information labels, risk flags, and an operator-review requirement.

The initial code-managed response profiles are `delivery_status`, `pickup_appointment`, `order_change_or_payment`, `cancellation_or_refund`, `technical_or_parts`, and `clarification`. The browser may request one of these profiles for one draft. Unknown profile or language hints are ignored in favour of server-side detection. Profiles are prompt guidance only; they do not create a reusable Gmail-content archive, a model-training set, or an automatic reply workflow.

Common reply quotations and `>`-prefixed quoted lines are removed from the AI context before drafting. The AI prompt treats all email content and operator guidance as lower-priority business context that cannot override truthfulness, safety, or send-side-effect rules. It continues to prohibit invented delivery dates, tracking values, prices, and commitments.

The API returns the `draft_plan` together with the editable draft. The frontend displays the profile, language/formality hint, order-reference state, missing information, and review requirement. It preserves the existing two-step confirmation and server-derived recipient, subject, and threading headers for sending.

## Alternatives Considered

| Alternative | Benefits | Drawbacks | Outcome |
|---|---|---|---|
| Curated, code-managed profiles with transient plan | Explicit, testable safety guidance; no new data retention; small reversible change | Profile updates require source/deployment changes | Chosen |
| Retrieval from historical sent emails | Could imitate prior phrasing | Creates a customer-content corpus, can reuse stale or exceptional commitments, conflicts with no-mailbox-mirror boundary | Rejected |
| Fine-tune or train on sent email history | May capture style patterns | Requires persistent training data, consent/retention governance, evaluation, and rollback controls not present in this local console | Rejected |
| Unchanged generic prompt | Smallest implementation footprint | Does not expose case-specific constraints or improve repeatable operational handling | Rejected |
| Automatic draft send for recognized profiles | Faster apparent processing | Removes mandatory operator control over a real external Gmail side effect | Rejected |

## Consequences

Draft generation remains a Gmail on-demand operation. MongoDB still stores only Gmail OAuth state, encrypted refresh-token data, safe refresh metadata, and console-owned integration/audit records; it does not store `draft_plan`, raw thread content, outgoing draft text, or profile-use history. The optional OpenAI-compatible provider receives only the bounded current thread context, optional bounded operator guidance, and the derived prompt guidance during one generation request.

The new metadata is additive to the existing draft response so clients that use only `draft`, `facts_used`, `language`, `model`, and `disclaimer` remain compatible. The UI improves review context but does not claim that detected classification, formal address, order reference, or any draft assertion is verified operational truth.

## Risks and Mitigations

| Risk | Mitigation | Remaining limitation |
|---|---|---|
| Incorrect profile or language classification | Conservative fallback, operator-visible profile, optional one-draft override, focused unit tests | Operator must still review and edit the draft |
| Quoted historical text changes intent | Remove common quotation markers and quoted lines before planning/context assembly | Email clients use diverse quotation formats |
| Profile text becomes an implicit source of business facts | Profiles contain only process guidance and missing-information prompts, not delivery, pricing, tracking, or refund facts | Future profile edits require the same review discipline |
| Operator interprets plan metadata as verified | UI labels it as context and keeps review flags visible; runbook states it is advisory | Human judgment remains necessary |
| Scope expands into a local learning archive | No persistence path, no feedback collection, no provider-history retrieval in this decision | A future feedback system requires a separate ADR and retention design |

## Implementation Notes

The implementation belongs in `backend/gmail_service.py`, the Gmail draft route in `backend/server.py`, the browser API boundary in `frontend/src/lib/api.js`, and the Gmail composer in `frontend/src/pages/GmailInbox.jsx`. Contracts and operating guidance are updated in [`../contracts/gmail.md`](../contracts/gmail.md) and [`../runbooks/gmail-workspace.md`](../runbooks/gmail-workspace.md).

No Shopify facts are added to the prompt in this decision. A future active-snapshot facts card would introduce a new Gmail-to-Shopify read boundary and requires a separate ADR, contract update, runbook update, and dedicated ambiguity/authorization tests.
