# Runbook: Gmail Workspace

## Scope

Use this runbook to configure, authorize, operate, disconnect, and diagnose the current Gmail workspace. The workspace is a local Google OAuth 2.0 and Gmail REST integration. It retrieves messages on demand and can send an explicitly operator-confirmed reply in an existing thread. It is not a mailbox synchronization service, an email archive, a webhook/watch consumer, or an automatic reply system.

Read [`../contracts/gmail.md`](../contracts/gmail.md) before changing configuration or diagnosing an API result. The Gmail data plane is distinct from the Shopify snapshot; Shopify synchronization does not make Gmail authorized or current.

## Security Rules

| Rule | Required practice |
|---|---|
| Secrets | Keep OAuth client secret, Fernet key, and optional AI key exclusively in untracked environment configuration. Never capture their values in logs, tickets, screenshots, or code. |
| Token storage | Do not edit `gmail_oauth_tokens` manually. The service encrypts/decrypts the refresh token and deletes it through the disconnect route. |
| Browser access | Use the local console URL and approved browser session. Do not expose the unauthenticated console publicly. |
| Email content | Treat message content as untrusted data. Render only server-provided sanitized HTML; do not add a browser path for raw provider HTML or attachment download. |
| Sending | Review the final text. The UI requires `Senden vorbereiten`, then `Jetzt senden`, and creates one idempotency key for that confirmation; do not circumvent this flow or reuse a failed confirmation blindly. |
| AI | AI drafts are optional, editable, non-sending, and limited to the selected thread plus bounded operator guidance. Do not use them as a verified source of operational facts. |

## Configuration

Complete these variables in the local `.env` and restart/recreate the backend after changing them.

| Variable | Required for | Notes |
|---|---|---|
| `GOOGLE_OAUTH_CLIENT_ID` | Google OAuth | Web-application OAuth client ID. |
| `GOOGLE_OAUTH_CLIENT_SECRET` | Google OAuth | Secret for the same OAuth client. |
| `GMAIL_OAUTH_REDIRECT_URI` | Google OAuth | Must exactly match the registered Google redirect URI. Compose defaults to `http://localhost:${ERYDEZ_PORT:-8082}/api/gmail/oauth/callback`. |
| `GMAIL_TOKEN_ENCRYPTION_KEY` | Token persistence | Valid Fernet key. Do not rotate it casually; existing ciphertext becomes unreadable without a migration/re-authorization plan. |
| `OPENAI_API_KEY` | AI drafts only | Optional. Gmail manual read/reply can operate without it. |
| `GMAIL_SEND_OPERATION_RETENTION_HOURS` | Duplicate-send prevention | Optional positive integer; default 24. Retains a thread/content hash, safe outcome, and key only; the Gmail message body is never stored. |
| `OPENAI_API_BASE`, `GMAIL_AI_MODEL`, `GMAIL_AI_MAX_COMPLETION_TOKENS` | AI provider tuning | Optional provider/model/budget settings. |

Google OAuth must allow the exact redirect URL currently exposed by the frontend port. If the host port changes, register the corresponding redirect URI and update `GMAIL_OAUTH_REDIRECT_URI` together. The code requests Gmail read-only and Gmail send scopes.

## Verify Safe Status

Before connecting or diagnosing Gmail, inspect only the safe status payload:

```powershell
Invoke-RestMethod http://127.0.0.1:8082/api/gmail/status | ConvertTo-Json -Depth 6
```

| Status condition | Meaning | Action |
|---|---|---|
| `oauth_configured: false` | One or more OAuth/encryption settings missing or invalid. | Complete environment configuration, recreate backend, and retry. |
| `oauth_configured: true`, `connected: false` | App is configured but no usable Gmail refresh token is stored. | Start OAuth from the Gmail page. |
| `connected: true`, `lifecycle_state: active` | Gmail workspace may read threads on demand. | Use normal Gmail workspace. |
| `lifecycle_state: paused` | Local control plane blocks read/send. | Resolve pause in Settings before using Gmail. |
| `lifecycle_state: disconnect_pending` or `disconnected` | Local lifecycle blocks Gmail data-plane access. | Resolve lifecycle/reconnect deliberately. |
| `ai_available: false` | Gmail works without optional AI draft capability. | Draft manually or configure/repair the AI provider separately. |

## Connect a Gmail Account

1. Start the console and confirm `GET /api/gmail/status` reports `oauth_configured: true`.
2. Open **Gmail** in the console and choose **Mit Google verbinden**.
3. Complete Google consent in the browser. The application starts an authorization-code flow with a one-time, ten-minute state value.
4. On success, the browser returns to `/gmail?oauth=connected`. The backend has encrypted and stored the refresh token, recorded safe mailbox identity, and marked the local connection active.
5. Refresh status and load the inbox. The first list request is an on-demand Gmail read; it also writes only safe refresh metadata.

Do not paste an authorization code into a shell, issue, or source file. If Google returns a browser failure/cancelled result, retry from the Gmail page only after checking the redirect URI and OAuth configuration.

## Read, Draft, and Send

### Read threads

The inbox uses a default Gmail query that excludes promotions and social categories. Operators may enter Gmail search syntax and use pagination. A list request uses a short-lived backend-memory access token and a bounded number of concurrent Gmail metadata requests; it returns compact summaries only. Loading a thread fetches that selected thread from Gmail in full. Neither path retains thread results as a local mailbox mirror, and restarting the backend discards the short-lived access-token cache.

The API returns plain text plus sanitized HTML and attachment metadata. Attachment download is not implemented. If formatted HTML renders poorly, fall back to the returned plain text and do not add an unsanitized rendering path.

### Generate an AI draft

Select a thread and, when useful, choose one temporary **Antwortprofil** before generating. The default is automatic recognition from the current customer request. Available profiles cover delivery status, pickup appointments, order/payment changes, cancellation/refund, technical/parts, and clarification. The selected profile applies only to the next draft and is not stored.

Optionally expand **Hinweise für den KI-Entwurf** and provide at most 500 characters of concrete business context. Generate a draft, then review/edit it. The service removes common quoted reply blocks from the AI context, derives a non-persistent context plan, and returns plain text plus a disclaimer. The plan visibly reports the selected profile, language/formality hint, whether an order reference was detected, missing information, and any review flags. It does not send Gmail or persist the plan.

When a thread has exactly one explicit order number and that order exists uniquely in the active Shopify snapshot, the composer may also display a green **Verifizierte Shopify-Fakten** card. It identifies the active read-only snapshot and may show the order reference, snapshot timestamp, payment/fulfillment/return state, delivery method, cancellation marker, verified provider tracking numbers, and product titles/quantities. The card never proves a promised delivery date, refund, price, availability, diagnosis, or operational commitment.

If no card is shown, the displayed fallback explains only the safe reason, such as missing/multiple reference, missing active snapshot, absent order, or ambiguous order. Do not work around a fallback by searching customer name, email address, phone number, product name, or partial order number in the console. Correct the reference in the existing Gmail thread or handle the case manually.

Treat risk flags, missing-information labels, and Shopify facts as prompts for operator review, not as a substitute for operational judgment. In particular, never treat a generated delivery date, tracking data, price, cancellation, refund, availability, diagnosis, or commitment as verified merely because it appears fluent. Use the manual composer if the AI provider is unavailable, quota-limited, or inappropriate for the message.

### Send an existing-thread reply

1. Write or edit the final content in the composer.
2. Select **Senden vorbereiten** and verify the displayed recipient/thread context.
3. Select **Jetzt senden** only when the final content is correct.
4. The browser holds one stable idempotency key for this confirmation. The server atomically reserves it, reloads the Gmail thread, and derives recipient, subject, `In-Reply-To`, and `References` headers from the provider source before sending.
5. If the browser retries after a lost response, reuse the same still-visible confirmation: a completed key returns the prior safe result without a second Gmail call. If the console reports an unknown outcome, stop and refresh the thread before preparing any new confirmation.

The endpoint intentionally ignores browser-supplied recipient/subject values because they are not accepted by the API contract. A successful send records safe console audit evidence and a short-lived hash-based idempotency result, not message content.

## Disconnect and Reauthorization

### Disconnect

In the Gmail UI, choose **Trennen** and confirm the warning. The backend attempts Google revocation, deletes the encrypted refresh token and local refresh metadata, marks the local connection disconnected, and writes audit evidence. Local deletion proceeds even if Google revocation cannot be confirmed.

After disconnect, Gmail data-plane routes should no longer be used. Reconnect through OAuth rather than attempting to restore a token document manually.

### Reauthorize

Reauthorization is appropriate when Gmail returns `401`, status indicates a missing/invalid connection, credentials/scopes changed, or Google authorization was revoked. Recheck configuration, use the Gmail UI to start OAuth, and verify the resulting status. The Settings lifecycle control can record a reauthorization request, but it does not itself perform OAuth.

## Failure Handling

| Symptom | Likely cause | Safe response |
|---|---|---|
| Gmail page says OAuth must be configured | Required OAuth variable/redirect/Fernet key absent or invalid. | Correct local environment values, recreate backend, use safe status to verify. |
| OAuth completes with `oauth=failed` | Redirect mismatch, rejected consent, invalid client config, state expired, or provider failure. | Check exact registered redirect URI and time-sensitive retry; inspect redacted backend logs. |
| `401` on thread read/send | No token, revoked token, decrypt failure, or refresh rejection. | Reauthorize through UI; do not manipulate ciphertext. |
| `409` on Gmail route | Local lifecycle is paused/disconnect pending/disconnected. | Inspect Settings integration state and resolve deliberately. |
| HTML email looks unsafe/unformatted | Sanitizer removed content/unsafe markup; no HTML part exists. | Use plain-text fallback. Do not bypass the sanitizer. |
| Send fails with ordinary validation/authentication/provider error | Empty/oversized content, invalid source sender, provider failure before a confirmed send, or lost authorization. | Preserve draft locally, inspect safe error, correct cause, and retry only after user review. |
| Send returns `502` with an unknown outcome | Gmail may have accepted the reply, but the local safe completion record could not be written. | Do **not** retry the same confirmation. Refresh the Gmail thread, determine whether the reply exists, and prepare a new explicit confirmation only when it is absent. |
| Send returns `409` for an idempotency key | The key was reused for different content or its prior outcome is pending/unknown. | Do not change/retry the old confirmation. Refresh the thread and start a new visible confirmation only after review. |
| AI draft returns `402` | Optional AI provider quota exhausted. | Use manual reply or restore provider capacity; Gmail does not require AI. |
| AI draft returns `503` | Optional AI configuration unavailable. | Add/repair optional key/settings without exposing them. |
| AI draft returns `502` | Provider/network/model failure. | Retry only after confirming safe configuration/provider availability; manual reply remains available. |
| Inbox is slow while detail loading is normal | Gmail list/provider metadata latency or a large requested page. | Use the safe browser `Server-Timing` response hint and redacted `performance_request`/`performance_database` backend log categories; do not collect message bodies, headers, tokens, or query values for diagnosis. |

## Recovery and Escalation

Do not rotate `GMAIL_TOKEN_ENCRYPTION_KEY` without a reviewed migration or reauthorization plan; old encrypted refresh tokens cannot be decrypted by an unrelated new key. If the key or OAuth client secret is exposed, restrict access, rotate affected provider configuration, revoke/reconnect the mailbox as appropriate, and preserve only redacted operational evidence.

Escalation records may include status category, timestamp, configured redirect URI, lifecycle state, HTTP status, and redacted backend log category. They must never include tokens, OAuth state values, authorization codes, client secrets, raw email content, or attachment files.
