# E-RYDEZ Operations Console — PRD

## Original problem statement
Build the complete full-stack E-RYDEZ Operations Console exactly as defined in the uploaded `UX_UI_SPECIFICATION.md` (v1.0): a desktop-first web app that turns Shopify orders, conversations, fulfillment, appointments, returns and automation events into one prioritized operational queue for owner/operator Pablo. Pixel-accurate UX/UI, complete flows, realistic mock data with a clean swappable data layer.

## User choices (10.08.2026)
- Scope: FULL console — MVP + Phase 2/3 screens (Inventory, Returns, expanded Fulfillment, Purchasing)
- Data layer: FastAPI + MongoDB seeded with realistic data (real API layer, swappable later)
- UI language: English (German-ready structure)
- Auth: NONE — always runs as Pablo (owner)

## Architecture
- Backend: FastAPI (`/app/backend/server.py`) + seed data (`/app/backend/seed.py`), MongoDB via MONGO_URL. Auto-seeds on startup if empty; `POST /api/reset` reseeds. All routes prefixed `/api`. Business-day age computed server-side.
- Frontend: React 19 + shadcn + Tailwind, SWR for data. Clean data layer at `/app/frontend/src/lib/api.js` (single swap point for real integrations). Shell: `components/shell/AppShell.jsx`; shared design system: `components/common.jsx` (StatusChip, Severity, KpiCard, TimelineEvent, AutomationExplain, InlineAlert, etc.).
- Design tokens per spec §9.2: canvas #F5F7FA, brand #145CFF, Inter with tabular-nums, 240/72px sidebar, 52px table rows.
- ALL external integrations (Shopify, Gmail, WhatsApp, Planzer, Google Calendar) are MOCKED via seeded data by design.

## Implemented (10.08.2026) — all spec §7 screens
- Overview: 4 clickable KPI cards, priority queue (top 8), Today panel, backlog-by-age chart (clickable buckets), inventory risks, automation activity, integration health, critical banner logic
- Work queue: 10 saved views with counts, 9-column dense table, right detail drawer (facts → recommendation → actions), J/K/E/R/Enter shortcuts, multi-select bulk actions (non-financial only), resolve with undo toast
- Orders: 13 columns, 11 filters, search, exception count badges with hover, muted cancelled orders, business-day age text
- Order detail: header with state/severity, last+next communication panel, 7 tabs (Overview/Timeline/Messages/Fulfillment/Inventory/Financials/Audit), filterable timeline with Automation labels, action rail, pause/resume updates with required reason, autosaving internal notes, duplicate-contact warning, Open in Shopify
- Inbox: 3-pane (320/flex/360), filters, conversation header with match confidence, composer with templates + labelled AI drafts + inspectable facts, send blocked below 90% confidence, approval required for refund/warranty topics, send/schedule/approval/draft modes, obsolete-status warning
- Fulfillment: 8-stage grouped list + optional board, 4-step scan flow (mismatch stops flow + creates exception), tracking required or explicit exception reason (422), notification state visible
- Inventory: ATP math table, detail drawer with waiting-order queue, inbound POs, reorder recommendation with assumptions
- Returns: 11-state RMA workflow, detail with eligibility facts vs liability decision as separate fields, evidence, supplier claims, timeline
- Appointments: agenda/week/list views, type filters, readiness warnings, check-in/complete/reschedule/no-show, payment-due notes
- Automations: rules list with pause/resume, run detail with trigger→facts→decision→action + admin raw payload, Approval center with 4 risk levels, approve/edit-and-approve/reject (reason required)/more-info
- Reports: metrics with definitions on hover, backlog chart, inquiries by category, automation outcomes, period/timezone/refresh shown
- Purchasing: suppliers, POs with milestones and ETA confidence
- Settings: users/roles matrix, integrations (masked credentials), business rules, message templates
- Shell: collapsible sidebar, global search (/ shortcut) across orders/conversations/RMAs/inventory, Create menu, integration-health popover, notifications popover

## Implemented (11.02.2026) — German/English internationalization
- LocaleProvider + `useT()` hook at `/app/frontend/src/lib/i18n.jsx`; dictionary at `/app/frontend/src/lib/translations.js`
- Default locale = **de** (per spec's internal language). Persisted in localStorage as `erydez.locale`
- Segmented **DE | EN** toggle in top bar next to user avatar (`data-testid="language-switch"`, `lang-de`, `lang-en`)
- Locale-aware formatting in `format.js`: dayjs de/en locales, CHF via `de-CH`/`en-CH`, business-day plural forms
- Full coverage: navigation, top-bar chrome, KPI labels, section titles, table columns, filter chips, tab labels, empty states, alerts, button labels, dropdown items, dialog copy, toasts, StatusChip/Severity values, ConfidenceBadge, AutomationExplain

## Testing
- Iteration 1 (10.08.2026): backend 37/37 pass; frontend ~95%, all pages functional. Fixed post-test: /settings default redirect, DialogTitle a11y. Regression suite: /app/backend/tests/test_erydez_backend.py.
- 11.02.2026 smoke: DE default renders correctly (Übersicht, Bestellungen etc.); language toggle switches locale and re-renders all pages; lint passes.

## Backlog / next
- P1: Email/weekly digest views (spec §4.1 daily digest report page), saved-view persistence in URL for column config
- P1: Analytics drilldowns in Reports (historical comparison charts)
- P1: External Pickup Booking module (calendar capacity + readiness checks)
- P2: Role switcher in top bar (preview as Support/Fulfillment/Manager)
- P2: Mobile-optimized focused task views (spec §12.3)
- P3: Landed-cost/margin reports, demand forecasting, review/retention automations
