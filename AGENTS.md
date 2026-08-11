# Agent Instructions

## Purpose

This file defines how automated agents and contributors must work in this repository.

## Core Constraints

- Preserve existing behavior unless a task explicitly requires a change.
- Prefer small, reviewable changes over broad rewrites.
- Do not introduce dependencies without documenting the reason.
- Never commit secrets, credentials, tokens, or private production data.
- Update relevant documentation when behavior, architecture, or operations change.
- Record significant technical decisions in `docs/decisions/`.

## Required Workflow

1. Read `PROJECT.md` and relevant documentation before making changes.
2. Define the smallest safe implementation approach.
3. Implement, test, and validate the change.
4. Update documentation, contracts, runbooks, and ADRs as applicable.

## Quality Standards

- Keep modules focused and dependencies directional.
- Add or update tests for changed behavior.
- Prefer explicit validation and clear error messages.
- Use consistent naming, formatting, and project conventions.
- Document assumptions, trade-offs, and known limitations.

## Change Checklist

- [ ] Scope matches the active task.
- [ ] Tests pass.
- [ ] Documentation is current.
- [ ] Contracts are updated where required.
- [ ] Operational impact is reflected in runbooks.
- [ ] Significant decisions have an ADR.

## Repository-Specific Guidance

- Treat `frontend/src/lib/api.js` as the client-side API boundary and `backend/server.py` as the
  current HTTP contract implementation.
- The backend requires `MONGO_URL` and `DB_NAME`. The frontend requires
  `REACT_APP_BACKEND_URL`. Do not add real credentials or production data to the repository.
- Data seeded by `backend/seed.py` and integration records returned by the API are mock data. Do not
  describe Shopify, Gmail, WhatsApp, Planzer, or calendar integrations as live.
- Preserve the UI constraints in `design_guidelines.json` when changing frontend behavior or
  presentation.
- Backend tests are live HTTP integration tests. They reset the configured database and expect the
  API at `REACT_APP_BACKEND_URL` (default `http://localhost:8001`). Never point them at a database
  containing data that must be retained.
- Keep `backend/pytest.ini`'s configured xdist options intact. Run serially with `pytest -n 0` only
  when isolation is necessary.

## Validation Commands

- Frontend production build: `cd frontend && npm run build`
- Frontend tests, if test files are added: `cd frontend && npm test -- --watchAll=false`
- Backend integration suite, with a disposable MongoDB and API already running:
  `cd backend && pytest`
- Backend syntax check that does not require services:
  `python3 -m compileall -q backend`
