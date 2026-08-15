# ADR 0002: Cross-platform Docker release baseline

- **Status:** Accepted
- **Date:** 2026-08-15
- **Decision Makers:** E-RYDEZ project owner

## Context

The existing Compose deployment is portable in its container topology, but the operator guidance
assumes Unix commands and does not define a release or verification baseline. Windows is the first
host platform to support, while Linux and macOS should use the same Docker contract.

## Decision

- Docker Desktop with Linux containers and the WSL2 backend is the supported Windows path.
- Docker Compose remains the only supported installation path for the 1.0 baseline; native host
  installation of Python, Node.js, or MongoDB is not part of this release.
- A PowerShell bootstrap helper is provided for Windows, with equivalent documented shell commands
  for Linux and macOS.
- CI validates Compose configuration, image builds, service health, and representative HTTP routes.
- Version `1.0.0` is a release-readiness baseline for the mock-backed prototype, not a claim of
  production readiness.

## Consequences

Named volumes and internal Compose networks avoid host-specific path and permission behavior.
Operators still need Docker Desktop, sufficient disk space, and a trusted-LAN boundary. Windows
manual acceptance remains necessary because Linux CI cannot verify Docker Desktop UI, WSL2, or host
firewall behavior.
