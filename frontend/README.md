# E-RYDEZ Operations Frontend

This directory contains the browser client for E-RYDEZ Operations Console. It is a JavaScript/JSX React 19 single-page application built with CRACO, React Router, SWR, Axios, Tailwind CSS, and Radix-based UI components.

## Responsibilities

The frontend renders Shopify-derived operations views, a controlled Gmail workspace, audit/ledger views, and settings. It owns browser state, presentation, routing, language selection, and explicit user confirmation. It does **not** own provider credentials, Shopify/Gmail transport, snapshot activation, persistence, or data normalization.

| Primary route | Data source | Important behavior |
|---|---|---|
| `/overview`, `/orders`, `/products`, `/inventory`, `/customers`, `/fulfillment`, `/returns` | Active Shopify snapshot via FastAPI | Commerce records are read-only. |
| `/gmail` | Gmail REST through FastAPI | On-demand read, optional AI draft, explicit two-step send confirmation. |
| `/audit-timeline`, `/provider-ledger` | Console-owned safe evidence | No credentials, provider payloads, or Gmail content. |
| `/settings/integrations`, `/settings/data` | Shopify sync/integration state | Complete snapshot sync and local Gmail readiness/lifecycle controls. |

## API Boundary

All browser-to-backend calls must go through [`src/lib/api.js`](src/lib/api.js). Do not call provider APIs from components, add provider tokens to browser code, or duplicate Axios request handling in pages.

```text
React page/component
        ↓
src/lib/api.js
        ↓
/api through same-origin Nginx in production
        ↓
backend/server.py
```

In production `REACT_APP_BACKEND_URL` is blank, so `src/lib/api.js` uses `/api`. For separate local development, set it to the backend origin only, for example `http://localhost:8001`; do not include `/api`. The backend must allow the development browser origin through `CORS_ORIGINS` when the two origins differ.

## Local Development

Install dependencies from the lock file, then start the CRACO development server:

```bash
npm ci
REACT_APP_BACKEND_URL=http://localhost:8001 npm start
```

The FastAPI backend requires `MONGO_URL` and `DB_NAME` before it can import. A local browser running separately from the backend may also need `CORS_ORIGINS` configured server-side. The production path is Docker Compose; see the repository [README](../README.md) and [operations runbook](../docs/runbooks/README.md).

## Validation

```bash
npm test -- --watchAll=false
npm run build
```

`npm run build` is the frontend production compile/build check. The repository does not define a standalone `lint` script or TypeScript type-check command. Keep existing JavaScript formatting and use the build/test results to validate frontend changes.

## Frontend Safety Rules

1. Preserve [`design_guidelines.json`](../design_guidelines.json) when changing visible behavior or layout.
2. Preserve Shopify’s read-only boundary. Compatibility helpers for mock-era pages do not make provider writes available.
3. Preserve Gmail’s two-step send confirmation. `api.gmailSend` receives only `thread_id` and final `content`; never add client-controlled recipient, subject, or threading headers.
4. Render Gmail `htmlBody` only as returned by the backend sanitizer and keep `body` as fallback. Do not render raw provider HTML or add attachment download behavior without a documented backend contract.
5. Keep AI guidance local to the composer, limit it to 500 characters, and describe drafts as editable/non-sending.
6. Update the relevant contract, runbook, and tests when frontend API behavior changes.

For full context, read [`../AGENTS.md`](../AGENTS.md), [`../PROJECT.md`](../PROJECT.md), [`../docs/contracts/README.md`](../docs/contracts/README.md), and [`../docs/contracts/gmail.md`](../docs/contracts/gmail.md) before changing this client.
