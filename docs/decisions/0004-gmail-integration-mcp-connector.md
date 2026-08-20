# ADR 0004: Local Google OAuth and Gmail REST workspace

- **Status:** Accepted
- **Date:** 2026-08-20
- **Decision makers:** E-RYDEZ Operations

## Context

The console includes a Gmail workspace that lets an operator inspect customer threads, create an optional AI-assisted reply draft, and send an explicitly confirmed reply inside an existing Gmail thread. The implemented runtime is a Docker Compose backend; it cannot depend on a local interactive CLI or on an external connector to supply application behavior.

The prior decision text described an MCP connector and no stored OAuth tokens. That does not represent the current code. `backend/gmail_service.py` directly uses Google OAuth 2.0 and Gmail REST endpoints, and the application stores an encrypted refresh token in MongoDB.

## Decision

Implement Gmail access through Google OAuth 2.0 authorization-code flow and Gmail REST HTTP calls in `backend/gmail_service.py`. Use the Gmail read-only and send scopes. Keep client credentials and the Fernet encryption key in environment variables; persist only Fernet-encrypted refresh-token ciphertext, safe mailbox metadata, state hashes, and refresh timestamps in MongoDB.

Fetch Gmail threads on demand. Do not implement Gmail push watch, Pub/Sub, webhook processing, scheduled polling, durable thread/message mirroring, or attachment download. HTML email content must be server-sanitized before it reaches the browser. Replies must be sent only within an existing source thread and derive recipient, subject, and threading headers server-side.

## Alternatives Considered

| Alternative | Benefits | Drawbacks | Outcome |
|---|---|---|---|
| Direct Google OAuth + Gmail REST with encrypted local refresh token | Works in the deployed backend, explicit lifecycle, on-demand read/send, no external runtime connector | Requires OAuth client setup, secure key handling, and token-recovery procedure | Chosen |
| MCP/CLI connector with externally managed authorization | Moves some token handling out of the app | Not the current application architecture; unsuitable as an internal Compose runtime dependency | Rejected |
| Gmail Python SDK | Provider-supported abstraction | Adds an additional SDK dependency without capability needed beyond direct REST implementation | Rejected |
| Gmail watch/webhook/background sync | More timely updates | Requires public callback/message infrastructure, retry/idempotency, retention, and operational monitoring | Deferred; not implemented |
| Browser-provided recipient/subject on send | Simpler client request | Header injection and mismatched-thread risk | Rejected |

## Consequences

The application holds sensitive OAuth refresh-token ciphertext in MongoDB. Backups, volume access, the encryption key, and client credentials therefore need the same operational protection as other credentials. A successful OAuth connection does not make the integration public or multi-tenant; it represents one local `gmail-local` connection record.

Thread lists may become stale between operator refreshes because no background synchronizer exists. AI draft capability is optional and independent of Gmail read/send capability. Gmail provider failure, expired authorization, or a paused lifecycle state must produce safe errors without exposing tokens or raw provider response bodies.

## Risks and Mitigations

| Risk | Mitigation in implementation | Remaining limitation |
|---|---|---|
| OAuth CSRF/state replay | Random state value is stored only as a SHA-256 hash and expires after ten minutes; callback consumes it once. | No user/session-specific application authentication layer exists. |
| Refresh-token disclosure | Refresh token is Fernet-encrypted before persistence; public API serializers omit token fields. | Security depends on the environment encryption key and host/database access controls. |
| Unsafe formatted email | Server allow-list sanitizes HTML and URLs before returning `htmlBody`. | Email body content may still contain untrusted text requiring normal operator judgment. |
| Accidental/misdirected send | UI has two-step confirmation; server reloads thread and derives recipient/subject/reply headers. | An operator-confirmed send remains an irreversible external action. |
| Uncontrolled mailbox retention | No raw thread/message persistence and no attachment download endpoint. | Safe metadata and encrypted refresh token remain until disconnect or database recovery procedure. |
| Hidden provider automation claim | On-demand calls only; no watch/webhook/scheduler code path. | Operator must refresh manually. |

## Implementation Notes

Gmail route definitions are in `backend/server.py`; provider logic is in `backend/gmail_service.py`; the client workspace is `frontend/src/pages/GmailInbox.jsx`; and the browser boundary is `frontend/src/lib/api.js`. The precise interface contract is in [`../contracts/gmail.md`](../contracts/gmail.md), and configuration/recovery steps are in [`../runbooks/gmail-workspace.md`](../runbooks/gmail-workspace.md).

Any change to scopes, token encryption/persistence, send behavior, HTML sanitization, background access, attachment retrieval, or provider exposure requires a security review, updated tests/contracts/runbooks, and a new or amended decision record.
