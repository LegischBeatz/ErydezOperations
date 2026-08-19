# ADR-0004: Gmail Integration via MCP Connector with AI Reply Generation

## Status

Accepted

## Context

The E-RYDEZ Operations Console requires Gmail integration to enable operators to read, respond
to, and manage customer emails directly within the application. The existing codebase contains
a control-plane-only Gmail readiness record (F-009a) but no data-plane implementation.

Key requirements:
- Read and display Gmail threads as conversations
- Generate AI-powered reply drafts based on conversation context
- Send replies within existing Gmail threads
- Maintain security (no stored OAuth tokens in the application)
- Integrate cleanly with the existing FastAPI/React architecture

## Decision

Implement Gmail integration using the Manus MCP Gmail connector for email operations and the
built-in OpenAI-compatible LLM proxy for AI reply generation.

Architecture:
1. **Gmail access**: The `gmail_service.py` module calls the MCP Gmail connector tools
   (`gmail_search_messages`, `gmail_read_threads`, `gmail_send_messages`) via subprocess.
   Authentication is managed externally by the MCP connector — no OAuth tokens are stored
   in the application database or environment.

2. **AI reply generation**: Uses the built-in LLM proxy (`gpt-5-mini`) to generate
   contextually appropriate reply drafts. The model receives only message content (sender,
   subject, body) — never credentials or internal system data.

3. **API layer**: New FastAPI endpoints under `/api/gmail/` expose thread listing, thread
   reading, AI draft generation, and sending. These follow the existing API patterns
   (JSON responses, HTTPException for errors, no stored state beyond what Gmail provides).

4. **Frontend**: A new `GmailInbox` page with a mail-program-like UI (thread list + detail
   view + composer). AI drafts are fully editable and require explicit two-step confirmation
   before sending.

5. **Send safety**: Sending requires (a) user editing/confirming the draft in the UI,
   (b) explicit "Senden vorbereiten" → "Jetzt senden" two-click confirmation, and
   (c) the MCP connector's own interactive confirmation prompt.

## Consequences

- No OAuth credentials are stored in the application; Gmail access depends on the MCP
  connector being configured and authenticated externally.
- The application cannot perform background Gmail sync or webhook-based real-time updates;
  email data is fetched on-demand when the user views the inbox.
- AI-generated drafts may contain placeholder text (e.g., "[Tracking-Nummer]") when
  factual information is unavailable; the system never fabricates data.
- The `openai` Python package is added as a runtime dependency.
- The existing F-009a control-plane readiness record remains intact; this implementation
  supersedes the "not implemented" status for Gmail data operations.

## Alternatives Considered

1. **Google OAuth with stored tokens**: Rejected due to complexity of token refresh,
   security risk of stored credentials, and the availability of the MCP connector.
2. **Gmail API via Google Python SDK**: Would require OAuth setup, token storage, and
   refresh logic. The MCP connector provides equivalent functionality with external auth.
3. **Polling/webhook sync to MongoDB**: Rejected for 1.0; on-demand fetching is simpler
   and avoids background process management in the trusted-LAN deployment model.
