# PackMaster: optional Cloud Registry setup

**Status on November 4, 2026:** `packmaster-registry` Worker deployed at `https://packmaster-registry.hakubaby2022.workers.dev`. The configured secret was verified with authenticated GET requests for both platforms and an unauthenticated request returned 401. With the approved GitHub Pages origin, both GETs returned HTTP 200 and revision 1: TikTok 121 products / 161 SKU rows, Shopee 126 products / 156 SKU rows. These are read-only API checks; cross-device sync and live write conflict checks remain unverified. The frontend includes a separate self-hosted registry-sync.html with strict script policy so access tokens are not entered on the main dashboard.

## Scope

- Source catalog only: TikTok and Shopee have independent snapshots.
- One snapshot per platform; multiple shops per platform are **not supported** yet.
- Local browser data remains the default. Sync is opt-in with explicit Push/Pull actions.
- Order PDFs, Batch data, internal SKU Mapping and personal customer data remain local.
- Registry items do not contain authoritative internal short names. Do not use the catalog alone to print matched SKU labels.

## Setup steps (require explicit approval before applying to a real account)

1. Review the existing D1 table schema and confirm it still matches `cloudflare/schema.sql`. Do not create a second registry table.
2. Review `cloudflare/wrangler.toml` which already points to the verified `packmaster-registry` database. Keep `main` pointing to `registry-worker.mjs`.
3. Set `ALLOWED_ORIGINS` to exact approved application origin(s). Do not use a wildcard.
4. Generate a strong random token (32+ characters) and add it to the Worker **secret** `REGISTRY_SYNC_TOKEN`. Never commit it to Git, print it in logs or put it in an HTML/JS source file.
5. The D1 table, initial registry import, and Worker deployment are already complete. Do not rerun the initial import against populated data.
6. Authenticated GET for both platforms and an unauthorized request have been verified. Before enabling live UI sync, test cross-device behavior and verify stale capture and revision conflict protection in a safe non-production environment.

## Using it in PackMaster

1. Open Packmaster Dashboard, choose Marketplace Registry, then open the dedicated **Secure Registry Sync** page (`registry-sync.html`) in the same GitHub Pages origin.
2. Enter the registry token on the isolated sync page. It loads only first-party scripts under a restrictive CSP and never stores the token. The Worker origin is fixed in the client.
3. Use **Send TIKTOK/SHOPEE to Cloud** to update one platform, or **Receive TIKTOK/SHOPEE from Cloud** to replace one local catalog. Every replacement requires confirmation; receiving over an existing local catalog additionally requires generating a local JSON backup.
4. Before receiving data, export a Workspace Backup. The API rejects stale snapshots and detects concurrent writes with a revision check.

The Worker expects Bearer authentication and rejects unlisted browser origins. The Worker returns only catalog data. It does not expose backups, mappings or orders. TikTok and Shopee catalogs share one D1 row and one global revision; updating either platform requires the latest revision. The combined JSON has a strict ~1.9 MB UTF-8 cap because D1 limits a row to 2 MB.

## Security limitations / follow-up

A shared token is for controlled internal testing only. A multi-user production release still needs per-user authentication (for example Cloudflare Access), role-based permissions, audit logging without customer data, and token rotation. The main dashboard still loads third-party CDN scripts, so it must never request the registry token. The isolated sync page loads only first-party JavaScript and uses `textContent` for untrusted data.

The Review dialog now includes read-only registry evidence when a local platform catalog is present. TikTok's structured `Product | Variant | Seller SKU` field and explicit `Seller SKU:` fields are matched exactly within the order's own platform. Duplicate seller SKUs are shown as ambiguous. A Shopee PDF without an explicit seller SKU cannot be automatically identified from a product title. These hints do not change print output, readiness status, local SKU rules, or cloud records.

Next stage: build a separate confirmed platform + Seller SKU / Model ID -> internal SKU mapping. Until each mapping is verified, unresolved items must remain Review/Unmapped instead of being guessed. No automatic migration of legacy keyword rules into authoritative mappings.
