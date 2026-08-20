# Gmail Workspace: Implemented UI Behavior

## Purpose

This document describes the current Gmail route at `/gmail` as implemented in `frontend/src/pages/GmailInbox.jsx`. It is a functional UI reference, not a claim of visual acceptance testing or a future design specification. The API/data contract is authoritative in [`contracts/gmail.md`](contracts/gmail.md).

## Workspace States

| State | Trigger | User-visible behavior |
|---|---|---|
| Status unavailable | Gmail status request errors | Error panel requests refresh or backend-log review. |
| Connection paused | Local integration lifecycle is `paused` | Inbox reading and replying are blocked with a local-control message. |
| OAuth configuration required | `oauth_configured` is false | Panel identifies missing configuration category and directs operator to local OAuth setup. |
| OAuth not connected | OAuth configured but no token record | Connect panel starts browser Google OAuth flow. |
| Connected but not active | Token is present but lifecycle is not active | Workspace remains blocked; operator is directed to integration state. |
| Active | Token connected and lifecycle `active` | Thread list, search, pagination, detail view, draft composer, and disconnect control are available. |

## Reading and Navigation

On wide screens, the page presents an inbox list and selected thread workspace. On narrower screens, selection switches the active panel between list and thread. The route maintains an optional Gmail search query in the browser URL and offers quick filters, refresh, and load-more behavior based on Gmail’s opaque next-page token.

Each thread displays sender, subject, snippet, date, message count, and attachment presence. The detail view presents chronological normalized messages. Header values are display data; the browser does not use them as send authority.

## Content Rendering

The frontend can display `body` as plain text and uses the backend-provided `htmlBody` for formatted content. `htmlBody` is already sanitized by the server. Attachments appear as filename/MIME metadata only; no direct attachment download or `cid:` rendering capability is implemented.

| Content type | Frontend behavior | Boundary |
|---|---|---|
| Plain text | Rendered as a readable message fallback. | Supplied by normalized Gmail API response. |
| Formatted HTML | Rendered only from server-sanitized `htmlBody`. | Do not pass raw Gmail HTML to the browser renderer. |
| Long message | Can be expanded in the thread UI. | Content still originates from the selected on-demand thread. |
| Attachment | Metadata badge/list entry. | No binary retrieval endpoint or client-side provider link. |

## Composer and Send Safety

The composer resets when the selected thread changes. It finds the latest inbound normalized message only to show reply context; the backend independently derives actual send headers from Gmail.

| Control | Implemented behavior |
|---|---|
| AI guidance | Optional collapsible field, client-limited to 500 characters, described as neither stored nor sent. |
| AI draft | Calls the draft endpoint and fills an editable composer; visible disclaimer/facts remain draft metadata. |
| Manual editing | Editing remains available whether or not AI is available. |
| Preparation | A non-empty draft and inbound reply target are required before **Senden vorbereiten**. |
| Confirmation | A distinct **Jetzt senden** control issues the send request; cancellation hides confirmation. |
| Disconnect | Browser asks for confirmation before it requests token revocation/local deletion. |

Do not remove the two-step confirmation, add automatic send behavior, or permit browser-controlled recipient/subject headers without revising the backend contract and security design.

## Accessibility and Presentation Constraints

The workspace uses semantic buttons, visible labels, state-specific panels, loading/error/empty feedback, and responsive layout controls. Global application navigation remains in `AppShell`, which also provides active Shopify snapshot status and synchronization action. Changes to spacing, color, typography, responsive behavior, or component composition must preserve [`../design_guidelines.json`](../design_guidelines.json).

## Related Documentation

- [Gmail HTTP and safety contract](contracts/gmail.md)
- [Gmail workspace runbook](runbooks/gmail-workspace.md)
- [Operator guide for AI drafts](gmail-ai-reply-guide.md)
- [Agent change rules](../AGENTS.md)
