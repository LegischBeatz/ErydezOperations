# ErydezOperations

## Purpose

E-RYDEZ Operations Console is an internal operations application for coordinating orders,
customer conversations, fulfillment, inventory, returns, appointments, purchasing, automation
approvals, and operational reporting. The current implementation is a mock-backed prototype: a
FastAPI service stores seeded operational records in MongoDB, and the React client presents and
updates those records. No live commerce, messaging, carrier, or calendar integration is implemented
in this repository.

## Current Goals

- No active product outcomes are documented in the tracked repository. Confirm priorities with the
  project owner before treating commit-message follow-ups or mock UI affordances as planned work.

## System Snapshot

- **Primary users:** E-RYDEZ operations staff; current seeded data and UI actions model an operator
  named Pablo.
- **Core capabilities:** Operational overview and work queue; order and conversation handling;
  fulfillment scanning and stage transitions; inventory, return, and appointment workflows;
  purchasing, reports, automations, approvals, notifications, and global search.
- **Deployment environment:** No production deployment definition is tracked. The code supports a
  local React development server, a local FastAPI process, and a configured MongoDB instance.
- **Primary technologies:** JavaScript/JSX with React and CRACO; Python with FastAPI and Motor;
  MongoDB; pytest-based HTTP integration tests.

## Technology Stack

- **Frontend:** React 19, React Router, SWR, Axios, Tailwind CSS, Radix UI primitives, CRACO, and
  Create React App tooling.
- **Backend:** Python, FastAPI, Uvicorn, Motor/PyMongo, Pydantic, and python-dotenv.
- **Persistence:** MongoDB, populated with deterministic mock operational data from
  `backend/seed.py` when the seed marker is absent.
- **Validation:** pytest with pytest-xdist for the live HTTP API suite; CRACO build tooling for the
  frontend.

## Important Links

- Architecture: [`docs/architecture.md`](docs/architecture.md)
- Decisions: [`docs/decisions/`](docs/decisions/)
- Contracts: [`docs/contracts/`](docs/contracts/)
- Runbooks: [`docs/runbooks/`](docs/runbooks/)
- Existing project notes: [`README.md`](README.md)
- Frontend tooling notes: [`frontend/README.md`](frontend/README.md)
- UI design source: [`design_guidelines.json`](design_guidelines.json)
