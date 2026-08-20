# ADR 0005: Ephemeral bounded operator guidance for AI email drafts

- **Status:** Accepted
- **Date:** 2026-08-20
- **Decision makers:** E-RYDEZ Operations

## Context

A customer thread may not contain all immediately relevant operational context for a useful reply draft. The Gmail workspace therefore allows an operator to provide concise, per-draft guidance such as preferred tone, an open question, or an information request. That guidance can be sensitive and must not silently become persistent customer communication data or override the application’s truthfulness and send-safety rules.

## Decision

The Gmail composer provides an optional operator-guidance field limited to 500 characters. The browser stores it only in the active component state and submits it only to `POST /api/gmail/threads/{thread_id}/ai-reply`. The backend bounds it again to 500 characters and places it in a clearly delimited section of the AI draft prompt.

Guidance is business context, not higher-priority instruction authority. The draft prompt retains its rules to use only the supplied conversation, respond in the selected/detected language, avoid invented facts or commitments, use placeholders for unverified information, and return only an editable plain-text email body. Draft generation never sends a message.

## Alternatives Considered

| Alternative | Benefits | Drawbacks | Outcome |
|---|---|---|---|
| Ephemeral 500-character guidance per draft | Allows task-specific context with bounded exposure and no persistence model | Requires operator re-entry for a new draft/thread | Chosen |
| Persist guidance in MongoDB or as reusable templates | Reusable historical context | Adds retention, deletion, access-control, and audit requirements absent from current design | Rejected |
| Unlimited free-form prompt field | Maximum flexibility | Increases sensitive-context exposure, prompt-injection surface, and unpredictable drafts | Rejected |
| Fully automatic AI reply/send | Faster apparent workflow | Removes required operator review and can create uncontrolled external communication | Rejected |

## Consequences

AI output is advisory. The operator sees an editable draft, information about the context used, and a review disclaimer. The final send action is a separate two-step UI flow and a server-side source-thread-derived Gmail reply. Guidance is cleared from the composer after a successful send and when the selected thread changes.

The draft context itself is bounded: the service uses up to the latest 20 normalized messages, truncates individual message bodies, and caps aggregate context. This limits provider exposure but does not replace operator judgment. The optional AI provider may be unavailable without preventing manual Gmail replies.

## Risks and Mitigations

| Risk | Mitigation in implementation | Remaining limitation |
|---|---|---|
| Guidance contains sensitive information | Browser-only transient state; no MongoDB field or sent-message injection of the raw guidance. | The text is sent to the configured AI provider during the one draft request. |
| Guidance attempts to override safety constraints | Prompt explicitly makes it subordinate to truth, language, and safety rules. | Model behavior still requires operator review. |
| Hallucinated operational promises | Prompt forbids invented delivery times, tracking values, prices, and commitments; asks for placeholders. | A draft is not a verified source of truth. |
| Accidental AI-triggered external action | AI endpoint only returns data; UI preserves explicit two-step send confirmation. | Operator may still intentionally send an edited draft. |
| Excessive provider context | 500-character guidance and bounded conversation context. | No configurable per-user policy or DLP layer exists. |

## Implementation Notes

The UI field and confirmation behavior are in `frontend/src/pages/GmailInbox.jsx`. `backend/gmail_service.py` constructs the bounded prompt and returns `draft`, `facts_used`, `language`, `model`, and a review disclaimer. The API and operating contract are documented in [`../contracts/gmail.md`](../contracts/gmail.md) and [`../runbooks/gmail-workspace.md`](../runbooks/gmail-workspace.md).

Do not change the guidance limit, persistence boundary, provider payload, or send relationship without reviewing privacy, prompt-safety, and Gmail side-effect implications.
