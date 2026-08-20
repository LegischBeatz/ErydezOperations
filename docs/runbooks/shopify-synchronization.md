# Runbook: Shopify Snapshot Synchronization

## Purpose and Safety Model

Use this runbook to create or refresh the console’s canonical Shopify snapshot after initial deployment, credential/scope repair, deployment of snapshot code, or confirmed stale data. Shopify remains authoritative. The procedure reads Shopify and writes the local MongoDB read model; it does not mutate Shopify.

A synchronization is safe by design only when operators preserve its activation model: a new snapshot is fetched and staged under a fresh `sync_id`, validated, then marked active. The previous active snapshot remains available during fetch/staging and after a failed run. Do not manually delete active collections to “make room” for a sync.

## Preconditions

| Check | Required state |
|---|---|
| Deployment | Compose backend and MongoDB are healthy; `GET /api/health/ready` returns `200`. |
| Local configuration | `SHOPIFY_STORE_DOMAIN` and either valid client credentials or a valid static Admin token are available to the backend. Compose requires client ID/secret interpolation. |
| Provider access | Backend can reach Shopify Admin GraphQL and has read access for entities it fetches. |
| Operational safety | No planned destructive database maintenance is in progress; a verified logical backup exists before schema/destructive recovery work. |
| Concurrency | No other full sync is currently running. The server returns `409` for concurrent starts. |

Use a live status check to validate intended provider connectivity. It contacts Shopify and must be run only when that external request is expected.

```powershell
Invoke-RestMethod http://127.0.0.1:8082/api/health/ready
Invoke-RestMethod 'http://127.0.0.1:8082/api/shopify/status?live=true'
```

A first deployment may have `shopify_snapshot_active: false`. That is expected before the initial successful synchronization but means canonical commerce routes cannot serve data.

## Snapshot Scope

The adapter fetches a shop profile/counts plus accessible products, embedded product variants, orders, embedded fulfillments/refunds/returns, customers, and inventory items/levels. It writes these normalized collections:

| Collection | Origin | Key links validated |
|---|---|---|
| `shop` | Shop profile | Snapshot membership |
| `orders` | Shopify orders | Customer and child records |
| `products`, `variants` | Products and embedded variants | Variant → product |
| `inventory_items` | Inventory items/levels | Inventory item → variant/product |
| `customers` | Shopify customers | Customer → order |
| `fulfillments`, `refunds`, `returns` | Embedded order records | Child → order |

The adapter uses GraphQL cursor pagination. It validates source counts for orders, products, and customers; identifier uniqueness; expected stored counts; and configured cross-record links. The implementation preserves source values rather than inventing data for missing Shopify fields.

## Procedure

### 1. Confirm current state

```powershell
Invoke-RestMethod 'http://127.0.0.1:8082/api/shopify/status?live=false'
Invoke-RestMethod http://127.0.0.1:8082/api/shopify/sync-runs
```

Record the current `active_snapshot.active_sync_id`, `last_synced_at`, and latest run status before starting a change. This is evidence for diagnosing unexpected results, not a backup.

### 2. Start the full synchronization

Use **Settings → Integrations → Run complete sync**, or issue the same request directly:

```powershell
$result = Invoke-RestMethod `
  -Method Post `
  -Uri 'http://127.0.0.1:8082/api/shopify/sync' `
  -ContentType 'application/json' `
  -Body '{}'
$result | ConvertTo-Json -Depth 8
```

The request can remain open while the server fetches the provider. Do not retry while it is still running; a simultaneous request returns `409`.

### 3. Validate activation

```powershell
$status = Invoke-RestMethod 'http://127.0.0.1:8082/api/shopify/status?live=true'
$status.active_snapshot | ConvertTo-Json -Depth 8
$status.latest_run | ConvertTo-Json -Depth 8
```

| Validation | Expected result |
|---|---|
| Latest run | `status` is `completed`. |
| Active snapshot | Non-empty `active_sync_id` and current `last_synced_at`. |
| Integrity report | `validation.valid` is `true`; `errors` empty; missing-link counters are zero. |
| Source counts | Live Shopify order/product/customer counts equal snapshot counts when provider counts are available. |
| Provider state | Live status is `Healthy` rather than merely `Configured`. |

### 4. Validate console reads without writes

```powershell
Invoke-RestMethod 'http://127.0.0.1:8082/api/orders?page=1&page_size=1'
Invoke-RestMethod 'http://127.0.0.1:8082/api/inventory?page=1&page_size=1'
Invoke-RestMethod 'http://127.0.0.1:8082/api/customers?page=1&page_size=1'
Invoke-RestMethod http://127.0.0.1:8082/api/fulfillments
Invoke-RestMethod http://127.0.0.1:8082/api/refunds
Invoke-RestMethod http://127.0.0.1:8082/api/returns
```

Open the major React views after API validation. Confirm that visible records identify Shopify as source and that detail/search navigation uses the newly active snapshot. For a bounded latency diagnosis, inspect only the browser `Server-Timing` response hint and redacted `performance_request`/`performance_database` backend logs; they exclude search terms, customer fields, provider payloads, and credentials. Do not attempt order notes, pause updates, or reset as validation; those are intentionally disabled routes.

### 5. Preserve diagnostics

```powershell
Invoke-RestMethod http://127.0.0.1:8082/api/shopify/sync-runs
docker compose logs --tail=200 backend
docker compose ps
```

Retain run ID, timestamp, count/validation summary, deployed commit, and **redacted** errors. Do not copy Shopify credentials or complete customer records into incident notes.

## Expected State Transitions

| Phase | `sync_runs` behavior | Active snapshot behavior |
|---|---|---|
| Fetching | New run is created with `status: fetching`; progress may update. | Prior active snapshot continues to serve reads. |
| Staging | Run becomes `staging` after fetch completion. | Prior active snapshot remains current. |
| Completed | Validation/stored counts pass; metadata and cleanup are recorded. | New `sync_id` becomes active. |
| Failed | Error category is stored in bounded run metadata; staged canonical rows are removed. | Prior active snapshot remains active. |

## Failure Handling

| Symptom | Likely cause | Response |
|---|---|---|
| `409 A Shopify synchronization is already running` | Existing in-process run holds the lock. | Wait for completion and inspect the newest run; do not force concurrent writes. |
| `502` with provider/configuration detail | Credentials missing/revoked, source scope issue, provider/network error, or GraphQL failure. | Keep the active snapshot; correct external configuration; retry after diagnosis. |
| Count mismatch | Source changed during fetch, incomplete traversal, or inaccessible records. | Do not bypass validation. Inspect source scopes/counts and retry after diagnosis. |
| Missing link validation | Child record references parent not present in fetched snapshot. | Inspect affected entity family/source access; do not activate by manually editing collections. |
| `/health/ready` is `503` | MongoDB unavailable. | Restore MongoDB connectivity first. |
| UI still shows prior data after completed run | Browser cache or old frontend bundle. | Hard refresh, check current frontend health/image, then validate API active snapshot directly. |
| Unexpected live value | Provider source has the value (including missing SKU or unusual inventory quantity). | Verify in Shopify; do not coerce the snapshot to match an assumed UI value. |

## Recovery and Credential Changes

A failed synchronization before activation needs no data rollback. The prior active snapshot is still selected. Do not delete staged/active data manually; the server performs staged cleanup.

If a newly activated snapshot is technically valid but operationally wrong, stop additional synchronization, preserve evidence, and restore a verified logical backup into an isolated recovery database. Validate the recovery copy before replacing production/local active data. The code does not provide a “select previous sync ID” rollback endpoint.

If Shopify credentials are exposed or replaced, rotate/revoke them in Shopify, update only untracked local configuration, recreate the backend, then run a live status check and a complete sync:

```powershell
docker compose up -d --force-recreate backend
Invoke-RestMethod 'http://127.0.0.1:8082/api/shopify/status?live=true'
```

Never paste a token or client secret into command history, source control, logs, screenshots, or escalation material.

## Escalation

Escalate repeated provider authorization failures, count mismatches, missing-link validation failures, suspected data exposure, or a bad activated snapshot. Include the sync run ID, start/end timestamps, safe validation report, affected entity family/identifiers, provider status category, deployed commit, redacted backend logs, and backup identifier/checksum when recovery is involved.
