# Operator Guide: Gmail AI Drafts

## Purpose

The Gmail workspace can create an **editable, non-sending** draft from the currently selected Gmail thread. This feature is optional. It uses the configured AI provider only when the Gmail connection is active and AI configuration is available. It does not verify commerce facts, change Shopify, or send mail automatically.

## Safe Workflow

| Step | Operator action | What the application does |
|---|---|---|
| 1 | Open **Gmail** and select a connected thread. | Fetches the selected thread on demand from Gmail. |
| 2 | Read the conversation and determine which facts are verified. | Shows normalized messages, plain-text fallback, and server-sanitized formatted HTML when available. |
| 3 | Optionally open **Hinweise für den KI-Entwurf** and enter concise context. | Keeps up to 500 characters only in current browser component state. |
| 4 | Choose **KI-Entwurf erstellen**. | Sends bounded thread context and optional guidance to the configured draft provider; returns a plain-text draft. |
| 5 | Review and edit the complete draft. | Keeps the final content fully editable. AI context/guidance is not automatically inserted as an email attachment or header. |
| 6 | Choose **Senden vorbereiten**, verify recipient/thread context, then choose **Jetzt senden** only if correct. | Sends only the final content in the existing Gmail thread; backend derives recipient, subject, and reply headers from Gmail. |

## Guidance Rules

Guidance is for a single draft only. It can state known business context, desired tone, or an open question. It must not be used to request invented facts or to override truthfulness/safety constraints. Keep guidance factual and concise.

> **Example:** “Ask for the order number and VIN, explain that technical feasibility must first be checked, and do not promise a delivery date.”

The service constrains each draft to the selected normalized conversation, chooses or accepts a German/French/English language hint, avoids invented delivery dates, tracking numbers, prices, or commitments, and uses placeholders when information is absent. The result still requires human verification.

## Data and Privacy Boundaries

| Data | Current handling |
|---|---|
| Operator guidance | Browser component state only; capped at 500 characters; not stored in MongoDB. |
| AI draft | Returned to the browser as an editable response; no draft database write or automatic Gmail send. |
| Gmail messages | Retrieved on demand from Gmail; no local mailbox mirror. |
| Gmail refresh token | Fernet-encrypted in MongoDB; never returned by API. |
| Final email | Sent only after explicit two-step browser confirmation and server-side thread-derived addressing. |

The optional guidance is transmitted to the configured AI provider for that draft request. Do not place credentials, token values, unneeded personal data, or unverified sensitive information in guidance.

## When the Feature Is Unavailable

AI drafts may be unavailable because optional AI configuration is absent, the provider rejects the request, or the provider cannot serve the model. This does not block manual reply writing or the separate Gmail connection workflow. Keep the message manual, or follow the [Gmail workspace runbook](runbooks/gmail-workspace.md) for safe configuration/diagnosis.

For the exact API/safety contract, read [`contracts/gmail.md`](contracts/gmail.md).
