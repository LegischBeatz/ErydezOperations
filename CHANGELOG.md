# Changelog

## Unreleased

### Documentation alignment

- Rebuilt the repository’s agent instructions, project overview, architecture, contracts, decisions, runbooks, and onboarding guides from the current React, FastAPI, MongoDB, Shopify, and Gmail implementations.
- Corrected stale mock-prototype and MCP-connector descriptions. The active commerce path is a Shopify-authoritative validated snapshot; Gmail uses direct Google OAuth 2.0 and Gmail REST with encrypted refresh-token persistence.
- Documented the implemented read-only Shopify boundary, active-snapshot activation behavior, optional AI draft workflow, Gmail send safeguards, deployment exposure limit, and validation prerequisites.
- Added a Gmail workspace runbook and a durable decision index; removed the placeholder ADR template.

## Release Policy

The repository does not contain a confirmed released-version history or a formal release automation workflow. Do not infer production readiness from this file. Versioned release notes should be added only when a release identifier, scope, validation evidence, migration/recovery impact, and compatibility statement are established in the code and delivery process.
