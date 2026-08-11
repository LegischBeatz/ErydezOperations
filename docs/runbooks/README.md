# Runbooks

## Purpose

This directory contains repeatable local-development and validation procedures. No production
deployment or incident-response process is currently documented in the repository.

## Local Development

### Prerequisites

- A supported Python environment with `backend/requirements.txt` installed.
- Node.js and npm compatible with `frontend/package-lock.json`.
- A reachable disposable MongoDB database.

### Configuration

Configure the backend process with `MONGO_URL` and `DB_NAME`. Optionally constrain
`CORS_ORIGINS`; the code default is `*`. Configure the frontend with
`REACT_APP_BACKEND_URL` pointing to the API origin. Environment files are ignored by Git and must
not be committed.

### Start the Services

From `backend/`, start the API on the port expected by the test defaults:

```bash
uvicorn server:app --reload --host 0.0.0.0 --port 8001
```

From `frontend/`, start the React development server:

```bash
npm start
```

Create React App normally serves on port 3000. Set `ENABLE_HEALTH_CHECK=true` before starting the
frontend only when the custom development-server health routes are needed.

### Validation

Run service-independent checks from the repository root:

```bash
python3 -m compileall -q backend
cd frontend
npm run build
```

The backend pytest suite is a live HTTP integration suite, not an in-process unit suite. It calls
`POST /api/reset` and therefore must use a disposable database. With MongoDB and the API running:

```bash
cd backend
pytest
```

`backend/pytest.ini` runs two xdist workers with `loadscope`. To troubleshoot serially, use
`pytest -n 0` and do not edit the configured defaults. The frontend currently has no tracked test
files; if tests are added, run `npm test -- --watchAll=false`.

## Reset Seed Data

`POST /api/reset` deletes and recreates every collection represented by `backend/seed.py`. Use it
only against a disposable development/test database. Success returns `{"status": "reseeded"}`.

## Common Failures

| Symptom | Likely Cause | Resolution |
|---|---|---|
| API import fails with `KeyError: MONGO_URL` or `DB_NAME` | Required backend environment is missing | Set both variables before starting Uvicorn. |
| Browser requests target `undefined/api` | `REACT_APP_BACKEND_URL` was absent at frontend build/start time | Set the variable and restart/rebuild the frontend. |
| Browser reports CORS errors | Frontend origin is not in `CORS_ORIGINS` | Add the exact origin and restart the API. |
| Integration tests cannot connect to port 8001 | API is not running or `REACT_APP_BACKEND_URL` points elsewhere | Start the API or set the test URL explicitly. |
| Expected mock records are absent | Seed marker exists but collections were changed | After confirming the database is disposable, call `/api/reset`. |
| Frontend health routes are absent | Health plugin was not enabled before startup | Restart with `ENABLE_HEALTH_CHECK=true`. |

## Recovery and Escalation

- For local mock-data corruption, reseed only after confirming the target database can be erased.
- No backup, rollback, production access, on-call owner, or escalation contact is documented. Obtain
  those details from the project owner before operating a non-local environment.

## Runbook Template

# Runbook: Procedure Name

## When to Use

Describe the symptoms, trigger, or operational scenario.

## Prerequisites

- Required access:
- Required tools:
- Required environment:

## Procedure

1.
2.
3.

## Validation

Describe how to confirm the procedure succeeded.

## Rollback / Recovery

Describe safe recovery steps if the procedure fails.

## Common Failures

| Symptom | Likely Cause | Resolution |
|---|---|---|
| | | |

## Escalation

- Escalate to:
- Include these diagnostics:
