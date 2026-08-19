# Runbook: Shopify Snapshot Synchronization

## When to Use

Use this procedure for an operator-requested complete Shopify refresh, after changing Shopify credentials or API scopes, after deploying synchronization code, or when the console indicates that its active snapshot is stale. Shopify is authoritative; this procedure replaces the local read model but does not mutate Shopify.

## Prerequisites

| Requirement | Details |
|---|---|
| Required access | Trusted-LAN access to the console host and permission to operate Docker Compose |
| Required tools | Docker Engine with Compose, PowerShell on Windows or a POSIX shell on Linux/macOS |
| Required environment | Running MongoDB volume, untracked `.env`, reachable Shopify Admin GraphQL API |
| Shopify configuration | `SHOPIFY_STORE_DOMAIN`, `SHOPIFY_CLIENT_ID`, `SHOPIFY_CLIENT_SECRET`; optional static `SHOPIFY_ADMIN_ACCESS_TOKEN` |
| Required scopes | Read access sufficient for orders, products, customers, fulfillments, inventory, and locations |

The client-credentials flow returns a short-lived access token. The application obtains and renews that token automatically; do not paste generated access tokens into source control.[1]

## Safety Properties

A full synchronization fetches and validates a new snapshot before changing the active snapshot identifier. The previous snapshot remains visible while staging. If fetching, normalization, insertion, or validation fails, staged records are removed and the previous snapshot remains active. Mock-only and stale data are deleted only after successful activation.

## Procedure

### 1. Confirm service health

```powershell
docker compose ps
Invoke-RestMethod http://localhost:8082/api/health/ready
Invoke-RestMethod 'http://localhost:8082/api/shopify/status?live=true'
```

Readiness must report `shopify_snapshot_active = true` during routine operations. A new deployment before its first synchronization may report `false`.

### 2. Create a logical backup before a destructive migration

Store backups outside the repository. Do not commit archives or credentials. Use `mongodump --archive --gzip` inside the authenticated MongoDB container, then copy the archive to an operator-controlled backup directory and record a SHA-256 checksum. Test restore procedures against a separate disposable Compose project.

Routine subsequent snapshots do not require deleting the active snapshot first, but a verified backup remains recommended before schema changes or data cleanup.

### 3. Start a complete synchronization

From the console, open **Settings → Shopify integration → Run complete sync**. Alternatively:

```powershell
$result = Invoke-RestMethod `
  -Method Post `
  -Uri 'http://localhost:8082/api/shopify/sync' `
  -ContentType 'application/json' `
  -Body '{}' `
  -TimeoutSec 300
$result | ConvertTo-Json -Depth 8
```

Only one synchronization can run at a time. A concurrent request returns HTTP 409.

### 4. Validate activation

```powershell
$status = Invoke-RestMethod 'http://localhost:8082/api/shopify/status?live=true'
$status.status
$status.shopify_counts
$status.active_snapshot.counts
$status.active_snapshot.validation
$status.latest_run
```

The expected state is:

| Check | Required result |
|---|---|
| Connection | `Healthy` |
| Latest run | `completed` |
| Snapshot validation | `valid = true` and no errors |
| Source counts | Live order, product, and customer counts equal active snapshot counts |
| Cross-record links | Every missing-link counter is zero |
| Active snapshot | Non-empty `active_sync_id` and current `last_synced_at` |

### 5. Validate the console

Open `http://localhost:8082/overview`, then verify Orders, Products, Inventory, Customers, Fulfillment, Returns & refunds, and Settings. Confirm that real Shopify identifiers and values render, list pagination works, a record opens its detail view, and global search navigates to the expected entity.

### 6. Inspect run history and logs

```powershell
Invoke-RestMethod http://localhost:8082/api/shopify/sync-runs
docker compose logs --tail 200 backend
docker compose ps
```

Recent run history is bounded in MongoDB. Error messages must not contain access tokens or client secrets.

## Validation Queries

The following API checks are safe and read-only:

```powershell
Invoke-RestMethod 'http://localhost:8082/api/orders?page=1&page_size=1'
Invoke-RestMethod 'http://localhost:8082/api/products'
Invoke-RestMethod 'http://localhost:8082/api/inventory?page=1&page_size=1'
Invoke-RestMethod 'http://localhost:8082/api/customers?page=1&page_size=1'
Invoke-RestMethod 'http://localhost:8082/api/fulfillments'
Invoke-RestMethod 'http://localhost:8082/api/refunds'
Invoke-RestMethod 'http://localhost:8082/api/returns'
```

For a release validation, run the repository unit tests, frontend tests and build, and the live HTTP integration suite against a controlled running stack. The integration suite is read-only and verifies that obsolete mutation and reset routes remain disabled.

## Rollback / Recovery

If a synchronization fails before activation, no manual rollback is required: the previous active snapshot remains in use. Inspect the failed run and backend logs, correct the underlying cause, and retry.

If a newly activated snapshot is semantically wrong despite passing validation, stop further synchronizations, preserve the current database and logs, and restore the verified logical backup into a separate recovery database first. Validate the restored database before replacing the active MongoDB volume or database. Do not delete the active volume until recovery is proven.

For a failed application deployment, retain `.env` and the MongoDB volume, restore the previous code or image inputs, rebuild, and run `docker compose up -d`. The active snapshot metadata and data remain in the volume.

## Credential Rotation

If a client secret is exposed, revoke or rotate it in Shopify immediately. Update only the untracked local `.env`, then recreate the backend:

```powershell
docker compose up -d --force-recreate backend
Invoke-RestMethod 'http://localhost:8082/api/shopify/status?live=true'
```

Never place credentials in documentation, commands committed to Git, screenshots, test fixtures, or logs.

## Common Failures

| Symptom | Likely Cause | Resolution |
|---|---|---|
| HTTP 401 from Shopify | Client secret used as an access token, expired token, revoked app, or invalid credentials | Verify client ID/secret configuration; allow the adapter to obtain a fresh token; rotate compromised credentials |
| HTTP 403 or GraphQL access error | Required Shopify read scope is absent | Update app scopes in Shopify, reinstall/approve if required, then retry |
| Count mismatch blocks activation | Pagination or Shopify count changed during the run | Inspect the run, retry during lower activity, and investigate repeatable mismatches before changing validation |
| Missing-link validation error | A child record references a parent outside the fetched snapshot | Inspect affected identifiers and source scopes; do not bypass the validation |
| Synchronization returns HTTP 409 | Another full synchronization owns the process lock | Wait for the active run to finish and inspect `/api/shopify/sync-runs` |
| UI shows old bundle | Browser cache retained an older frontend document | Hard-refresh once; confirm the rebuilt frontend container is healthy |
| Readiness is healthy but live status fails | MongoDB is available, but Shopify is temporarily unavailable or credentials are invalid | Continue using the active snapshot while correcting connectivity; do not purge it |
| A Shopify value appears surprising | Shopify contains the value, such as negative available inventory or missing SKU | Verify in Shopify; do not silently coerce or invent a replacement |

## Escalation

Escalate repeated count mismatches, missing-link failures, unauthorized access, or suspected data exposure to the store owner and application operator. Include the synchronization run ID, start and failure timestamps, validation report, affected entity types and Shopify identifiers, backend log excerpt, deployed commit, and backup checksum. **Never include secrets or full customer datasets.**

## References

[1]: https://shopify.dev/docs/apps/build/authentication-authorization/client-secrets "Shopify client credentials"
[2]: https://shopify.dev/docs/api/usage/pagination-graphql "Shopify GraphQL pagination"
