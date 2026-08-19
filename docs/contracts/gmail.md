# Gmail HTTP and Display Contract

## Purpose

This document describes the implemented Gmail workspace contract. It applies only to the locally authorized Gmail connection and does not change the project boundary: the console must never claim that an unavailable integration is live. The browser accesses every endpoint through `frontend/src/lib/api.js`; `backend/server.py` exposes the HTTP surface and `backend/gmail_service.py` owns Gmail normalization.

## Workspace Behaviour

The Gmail page is a two-pane workspace on wide screens and a drill-down workspace on narrow screens. An operator first selects a thread, reads its complete message history, optionally creates a fully editable AI draft, and then completes the existing two-step send confirmation. Recipient, subject, and RFC threading headers remain server-derived from the source Gmail thread.

| Area | Implemented behaviour |
|---|---|
| Thread list | Supports Gmail search syntax, quick filters, compact sender/subject/snippet metadata, attachments and pagination through `nextPageToken`. |
| Thread view | Shows the subject, message count, activity date, every message in chronological order, expandable header details, attachments and an expandable presentation for long messages. |
| Message body | Preserves `text/plain` in `body`. When Gmail provides `text/html`, it also exposes a sanitized `htmlBody` for formatted display. |
| HTML safety | The server uses a dependency-free allow-list sanitizer. It removes event handlers, scripts, styles, embeds and unsafe URL schemes; links open in a separate, non-opener browsing context. |
| AI drafting | Operator hints are limited to 500 characters, used only for the next draft and never included automatically in the sent message. Every draft remains editable. |
| Sending | The browser sends only `thread_id` and edited `content`. The backend validates and derives the actual recipient, subject and thread headers from Gmail. |

## Endpoints

| Method and path | Behaviour | Important constraints |
|---|---|---|
| `GET /api/gmail/status` | Returns safe OAuth, local lifecycle and AI availability state. | Never returns tokens or secrets. |
| `GET /api/gmail/threads` | Returns a compact list of Gmail threads. | Accepts `q`, `max_results` and `page_token`. |
| `GET /api/gmail/threads/{thread_id}` | Returns a full normalized thread. | The connection must be active. |
| `POST /api/gmail/threads/{thread_id}/ai-reply` | Creates an editable AI draft. | `instructions` are capped at 500 characters; no message is sent. |
| `POST /api/gmail/send` | Sends a confirmed reply in the existing thread. | Ignores any browser-supplied recipient or subject. |
| `POST /api/gmail/disconnect` | Revokes the local authorization where possible and deletes local token data. | Requires an explicit user interaction in the UI. |

## Normalized Thread Shape

A thread contains compact fields for the list view and a chronological `messages` collection for the detail view. Missing provider fields remain empty instead of being invented.

```json
{
  "id": "gmail-thread-id",
  "subject": "Re: Delivery status",
  "from": "Customer <customer@example.com>",
  "snippet": "Latest message preview",
  "date": "2026-08-19T09:42:00+00:00",
  "messageCount": 3,
  "hasAttachments": true,
  "messages": [
    {
      "id": "gmail-message-id",
      "from": "Customer <customer@example.com>",
      "to": "info@example.com",
      "subject": "Re: Delivery status",
      "date": "2026-08-19T09:42:00+00:00",
      "body": "Plain-text fallback or source text",
      "htmlBody": "<p>Sanitized formatted HTML</p>",
      "direction": "in",
      "attachments": [
        {"filename": "invoice.pdf", "mimeType": "application/pdf"}
      ]
    }
  ]
}
```

## Validation Notes

The Gmail service unit suite verifies direction detection, chronological normalization, attachment metadata, reply threading and safe formatted HTML handling. The front end must continue to use `body` as its text fallback and must only render the sanitized `htmlBody` returned by this service.
