# Gmail Workspace Contract

## Scope and Ownership

The Gmail workspace is an OAuth-backed, on-demand Gmail REST integration. It is separate from the Shopify canonical snapshot. Gmail remains the source of truth for threads and messages; the console does not create a durable local mailbox mirror.

MongoDB contains only the state needed to operate the connection: a Fernet-encrypted refresh token, safe mailbox identity/scopes/timestamps, one-time OAuth state hashes, last refresh metadata, and console-owned integration/audit records. It must not be used to store raw Gmail threads or messages.

> **Send safety:** A reply is a real Gmail side effect. AI draft generation never sends. A send request accepts only a thread ID and message content; the server reloads the provider thread and derives recipient, subject, and RFC reply headers itself.

## Configuration and Authorization

| Requirement | Contract |
|---|---|
| OAuth client | `GOOGLE_OAUTH_CLIENT_ID`, `GOOGLE_OAUTH_CLIENT_SECRET`, and `GMAIL_OAUTH_REDIRECT_URI` must be configured. |
| Token protection | `GMAIL_TOKEN_ENCRYPTION_KEY` must be a valid Fernet key. Refresh-token ciphertext is stored in `gmail_oauth_tokens`; access tokens and authorization codes remain in process memory. |
| Requested scopes | `https://www.googleapis.com/auth/gmail.readonly` and `https://www.googleapis.com/auth/gmail.send`. |
| OAuth CSRF protection | `GET /api/gmail/oauth/start` generates a 32-byte URL-safe state value, stores only its SHA-256 hash, and applies a ten-minute expiry. The callback consumes the matching state exactly once. |
| Connection identity | The API obtains `emailAddress` from Gmail profile after authorization and exposes only safe identity metadata. |
| Local lifecycle | A `paused`, `disconnect_pending`, or `disconnected` `gmail-local` integration record blocks Gmail data-plane routes with `409`. The dashboard’s readiness record alone never authorizes Gmail access. |

The status endpoint intentionally exposes missing configuration names and the configured redirect URI, but it never exposes OAuth client secret values, encryption keys, access tokens, refresh tokens, or authorization codes.

## HTTP Endpoints

| Method and path | Input | Success behavior | Relevant failures |
|---|---|---|---|
| `GET /api/gmail/status` | None | Returns safe OAuth configuration, connection, refresh, AI, lifecycle, and public connection state. | Database failures surface through the normal API failure path. |
| `GET /api/gmail/oauth/start` | None | Creates one-time state and returns a `302` redirect to Google OAuth consent. | `503` when OAuth/encryption configuration is incomplete. |
| `GET /api/gmail/oauth/callback` | `code`, `state`, optional `error` query values | Validates state, exchanges code, stores encrypted refresh token, records local connection, then redirects `303` to `/gmail?oauth=connected`. Provider/user error redirects to `cancelled` or `failed`. | Callback failure is intentionally represented by browser redirect rather than a credential-bearing response. |
| `POST /api/gmail/disconnect` | Empty body accepted | Attempts Google token revocation, deletes local token and refresh metadata, marks the local connection disconnected, and returns `{ "ok": true }`. | Provider/configuration errors map to safe Gmail errors; local token deletion still occurs if revocation cannot be confirmed. |
| `GET /api/gmail/threads` | Optional `q`, `page_token`; `max_results` integer 1–100, default 25 | Retrieves a page of normalized thread summaries, defaults `q` to `in:inbox -category:promotions -category:social`, records safe refresh metadata. | `401` if not authorized; `409` if lifecycle blocked; `502` for provider/network failures. |
| `GET /api/gmail/threads/{thread_id}` | Thread ID up to 256 characters | Retrieves one complete normalized thread with chronological messages. | `502` for invalid ID/provider failure; `401`/`409` as above. |
| `POST /api/gmail/threads/{thread_id}/ai-reply` | Optional JSON `sender_name`, `language`, `instructions`, `profile_id` | Reads the thread and returns an editable draft plus a non-persistent context plan. `sender_name` is limited to 100 characters; `language` to 50; `instructions` to 500; `profile_id` to 80. Unknown language/profile hints are ignored in favour of server-side detection. No Gmail send or MongoDB draft write occurs. | `422` for empty thread; `503` for missing AI config; `402` for detected AI quota exhaustion; `502` for other generation/provider failure. |
| `POST /api/gmail/send` | JSON `{ "thread_id": string, "content": string }` | Reloads the source thread, derives reply metadata, sends through Gmail, records safe audit evidence, and returns safe message result. | `422` for absent thread ID; `502` for empty/over-50,000-character content, invalid recipient, or provider failure; `401`/`409` as above. |

## Status Shape

`GET /api/gmail/status` returns safe state similar to the following. Fields may be `null` or `false` when not configured/connected.

```json
{
  "oauth_configured": true,
  "missing_configuration": [],
  "redirect_uri": "http://localhost:8082/api/gmail/oauth/callback",
  "requested_scopes": [
    "https://www.googleapis.com/auth/gmail.readonly",
    "https://www.googleapis.com/auth/gmail.send"
  ],
  "connected": true,
  "email_address": "mailbox@example.com",
  "connected_at": "2026-08-20T10:00:00Z",
  "last_synced_at": "2026-08-20T10:10:00Z",
  "ai_available": true,
  "ai_model": "gpt-5-mini",
  "lifecycle_state": "active",
  "connection": {
    "id": "gmail-local",
    "provider": "gmail",
    "environment": "local"
  }
}
```

`last_synced_at` is the most recent on-demand thread-list refresh timestamp, not a scheduled or complete mailbox synchronization claim.

## Thread and Message Schema

`GET /api/gmail/threads` returns the following envelope. `nextPageToken` is Gmail’s opaque pagination token and must be sent back unchanged as `page_token` to retrieve a following page.

```json
{
  "threads": [
    {
      "id": "gmail-thread-id",
      "subject": "Delivery question",
      "from": "Customer <customer@example.com>",
      "snippet": "Latest message preview",
      "date": "2026-08-20T09:42:00+00:00",
      "messageCount": 2,
      "hasAttachments": true,
      "messages": []
    }
  ],
  "userEmail": "mailbox@example.com",
  "nextPageToken": "provider-token-or-null",
  "total": 1,
  "syncedAt": "2026-08-20T09:45:00Z"
}
```

`GET /api/gmail/threads/{thread_id}` returns the same thread shape with a populated chronological `messages` array. Message fields are normalized as follows.

| Field | Meaning and validation boundary |
|---|---|
| `id`, `threadId` | Gmail resource IDs returned by the provider. |
| `from`, `to`, `subject` | Header values for display. They are not trusted as browser-supplied send instructions. |
| `date` | UTC ISO timestamp when Gmail internal date or parseable Date header is available; otherwise `null`. |
| `body` | Plain-text MIME body when available; otherwise text extracted from sanitized HTML; then Gmail snippet. |
| `htmlBody` | Server-sanitized HTML from a `text/html` MIME part; empty when unavailable or sanitization fails. |
| `snippet` | Gmail snippet for compact display. |
| `direction` | `out` only if the parsed sender email matches the connected mailbox; otherwise `in`. |
| `attachments` | Metadata-only array of `{ "filename", "mimeType" }` for parts with a Gmail attachment ID. No download endpoint exists. |

## Safe Email HTML Contract

The server sanitizes `htmlBody` before returning it. It allow-lists ordinary presentation tags such as paragraphs, headings, lists, tables, links, images, inline emphasis, and preformatted text; blocks executable/embedded tags including `script`, `style`, `iframe`, `object`, `embed`, and `svg`; and drops event-handler and unrecognized attributes.

`href` allows only `https:`, `http:`, and `mailto:`. Image `src` additionally permits selected base64 image data URLs. Inline CSS is restricted to a presentation-property allow-list and rejects values containing `url(`, `expression`, `@import`, or `javascript:`. Rendered links receive `target="_blank"` and `rel="noreferrer noopener"`.

The frontend must display `body` as a fallback and must render only the returned `htmlBody`, never unsanitized provider HTML. The current UI does not fetch/download attachments and does not resolve `cid:` content.

## Draft Contract

AI drafting is available only when `OPENAI_API_KEY` is configured. It uses the normalized selected thread, bounds source context to the latest 20 messages, limits an individual message body to 2,000 characters, and limits aggregate context to 24,000 characters. Common reply quotations and `>`-prefixed quoted lines are removed before the context is supplied to the AI provider. Optional operator guidance is truncated to 500 characters and is treated as constrained business context, not as instruction authority over the draft’s safety/truth rules.

Before generation, the server derives a non-persistent draft plan from the current thread. It detects one of the curated reply profiles, a conservative response language, a German formal/informal/neutral address hint, whether a clear order reference appears in the thread, missing information, and review flags. Supported curated profile IDs are `delivery_status`, `pickup_appointment`, `order_change_or_payment`, `cancellation_or_refund`, `technical_or_parts`, and `clarification`. The browser may provide an optional `profile_id` override for that one draft; unknown values are ignored. Profiles are code-managed safety guidance, not a mailbox-derived template archive.

When the normalized thread contains **exactly one explicit order-number reference**, the FastAPI layer may read the matching record from the active Shopify snapshot. It accepts neither customer identity fields, product names, partial order numbers, email addresses, nor phone numbers as matching keys. No active snapshot, multiple references, missing/ambiguous matches, or an invalid snapshot record produce a safe fallback without Shopify facts; they never block manual Gmail replies or force a draft failure. The minimized fact card contains only the verified order reference, snapshot timestamp, financial/fulfillment/return state, delivery method, cancellation marker, provider tracking numbers, and product titles/quantities. It omits customer identity, addresses, notes, money values, Shopify identifiers, URLs, and raw provider records.

The draft prompt requires a short, professional response in German, French, or English based on a caller hint or conservative detection. It instructs the model not to invent facts, delivery times, tracking references, prices, or commitments, and to use placeholders or clear follow-up questions when verified information is absent. Draft generation returns:

```json
{
  "draft": "Editable plain-text email body",
  "facts_used": ["Conversation: 2 message(s)", "Reply language: English", "Reply profile: Delivery status & delay"],
  "language": "English",
  "model": "gpt-5-mini",
  "draft_plan": {
    "intent": "delivery_status",
    "reply_profile": { "id": "delivery_status", "label": "Delivery status & delay", "version": "v1" },
    "language": "English",
    "formality": "neutral",
    "order_reference_detected": true,
    "missing_information": [],
    "risk_flags": ["operator_review_required", "delivery_or_tracking_must_be_verified"],
    "requires_operator_review": true,
    "shopify_fact_status": "available",
    "shopify_fact_card_available": true
  },
  "shopify_facts": {
    "source": "shopify_active_snapshot",
    "order_reference": "#3691512",
    "snapshot_synced_at": "2026-08-20T12:00:00Z",
    "financial_status": "PAID",
    "fulfillment_status": "UNFULFILLED",
    "return_status": "NONE",
    "delivery_method": "SHIPPING",
    "cancelled": false,
    "tracking_numbers": ["verified-provider-number"],
    "line_items": [{ "title": "Product title", "quantity": 1 }]
  },
  "disclaimer": "AI-generated draft. Review and edit before sending."
}
```

The UI keeps the optional guidance and the optional profile override only in component state. The backend does not persist either field, the API does not send them automatically, and the Gmail send endpoint accepts only the final manually editable `content`. The returned `draft_plan` and optional `shopify_facts` are advisory metadata for the active response only; they are not saved as Gmail-thread, mailbox, or feedback records. `draft_plan.shopify_fact_status` is one of `available`, `reference_missing`, `reference_ambiguous`, `active_snapshot_missing`, `order_not_found`, `order_ambiguous`, or `invalid_snapshot_record`.

## Send Contract

The send request must contain a non-empty `thread_id` and `content`. The browser must not supply recipients, subject lines, or arbitrary threading headers. The server enforces these rules:

1. It rejects empty content and content longer than 50,000 characters.
2. It fetches the full source Gmail thread again rather than trusting browser thread data.
3. It selects the most recent inbound source message; if none exists, it falls back to the last thread message.
4. It extracts and validates the recipient from that message’s `From` header. Newline-bearing or invalid addresses are rejected.
5. It keeps the source subject, adds `In-Reply-To` when a Message-ID exists, and extends `References` with that Message-ID.
6. It sends the encoded MIME message with the original Gmail `threadId`.

A successful response contains only safe result fields:

```json
{
  "ok": true,
  "result": {
    "id": "gmail-message-id",
    "thread_id": "gmail-thread-id",
    "recipient": "customer@example.com",
    "subject": "Delivery question"
  }
}
```

The current React UI adds a two-step confirmation (`Senden vorbereiten` followed by `Jetzt senden`) before calling this endpoint. Preserve that control in any client change; it is a UI safeguard in addition to the server-side derivation rules.

## Error and Compatibility Rules

| Condition | HTTP result | Required behavior |
|---|---|---|
| Missing OAuth client configuration or invalid Fernet key | `503` | Configure environment values; do not expose values in diagnostics. |
| Missing/expired/revoked authorization | `401` | Start a new OAuth authorization flow. |
| Local lifecycle paused or disconnection pending/disconnected | `409` | Resolve lifecycle state through Integration Control Center before Gmail access. |
| Invalid/missing thread, draft, or lifecycle input | `422` or safe `502` depending on handler | Correct input and retry only after diagnosis. |
| Gmail / Google OAuth provider failure | `502` | Inspect bounded backend logs and safe error detail; do not manually edit encrypted token data. |
| OpenAI quota unavailable | `402` | Use manual reply or restore optional AI-provider capacity; Gmail send remains independently available. |

There is no mailbox synchronization, webhook, push watch, message archive, draft persistence, attachment download, or provider event ledger contract. Additions in these areas require new implementation, security review, operational runbook, tests, and a durable decision record.

## Implementation Sources

This contract is derived from [`backend/gmail_service.py`](../../backend/gmail_service.py), Gmail routes in [`backend/server.py`](../../backend/server.py), [`frontend/src/pages/GmailInbox.jsx`](../../frontend/src/pages/GmailInbox.jsx), [`frontend/src/lib/api.js`](../../frontend/src/lib/api.js), and Gmail unit tests in [`backend/tests/test_gmail_service_unit.py`](../../backend/tests/test_gmail_service_unit.py).
