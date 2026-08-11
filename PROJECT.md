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
- **Deployment environment:** Docker Compose is the supported trusted-LAN deployment. It runs a
  production React bundle behind Nginx, one FastAPI worker, and authenticated MongoDB. Local
  React, FastAPI, and MongoDB processes remain supported for development.
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

## Deployment Boundary

The Compose stack publishes only the Nginx frontend, on port `8082` by default. It provides no TLS,
application authentication, authorization, or tenant isolation and must remain on a trusted LAN or
VPN. The data and integration records are mock data; this deployment does not make any named
external integration live.

## Important Links

- Architecture: [`docs/architecture.md`](docs/architecture.md)
- Decisions: [`docs/decisions/`](docs/decisions/)
- Contracts: [`docs/contracts/`](docs/contracts/)
- Runbooks: [`docs/runbooks/`](docs/runbooks/)
- Existing project notes: [`README.md`](README.md)
- Frontend tooling notes: [`frontend/README.md`](frontend/README.md)
- UI design source: [`design_guidelines.json`](design_guidelines.json)
