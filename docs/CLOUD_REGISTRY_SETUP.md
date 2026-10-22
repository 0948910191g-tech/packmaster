# PackMaster shared Marketplace Registry on Cloudflare

Cloudflare D1 stores only the TikTok/Shopee product registry. A same-origin Pages Function reads and writes D1; Cloudflare Access verifies who can call it. Orders, PDFs, Batch data, and SKU Mapping rules stay in each browser's local storage.

## One-time Cloudflare setup

1. Create a Cloudflare Pages project connected to the PackMaster GitHub repository. Use the repository root as the project root, leave the build command empty, and set the output directory to **.**. Keep the existing GitHub Pages site available until the Cloudflare site has been tested.
2. Create a new, isolated D1 database named **packmaster-registry**. Do not bind it to another app's database.
3. Run **cloudflare/migrations/0001_create_marketplace_registry.sql** once in the D1 SQL console.
4. In the Pages project, add a D1 binding named **REGISTRY_DB** and select **packmaster-registry**. Redeploy after adding the binding.
5. In Cloudflare Zero Trust, enable Access for the Pages project. Protect the exact production pages.dev hostname and the **/api/** path. Add an Allow policy for each approved email address. For a pages.dev hostname, follow Cloudflare's Pages known-issues guide to remove the wildcard from the generated Access application.
6. Add these Pages production variables:
   - **ACCESS_TEAM_DOMAIN**: the HTTPS Cloudflare Access team domain, such as **https://your-team.cloudflareaccess.com**
   - **ACCESS_AUD**: the Application Audience (AUD) tag for the Access application
   - **REGISTRY_ALLOWED_EMAILS**: comma-separated exact email addresses that are allowed to use the registry. Use the same addresses in the Access Allow policy.
7. Deploy the Pages project. The GitHub Pages URL and the Cloudflare Pages URL are different browser origins, so localStorage does not move between them automatically. On the first device, sign in with Cloudflare Access, import the current TikTok and Shopee Registry JSON files, and share the registry. Other approved devices open the same Pages URL and sign in with Cloudflare Access to load the shared copy.

Cloudflare Access must be enabled for the API path and its identity provider must be configured. The Pages Function also verifies the signed Access JWT, its issuer, audience, expiry, and exact email allowlist before it can reach D1. The D1 binding is server-side and is never exposed to browser code.

## Sync behavior

- The first explicit seed uploads the current browser's validated registry only when the D1 table is empty.
- After that, the cloud copy is authoritative and refreshes on page focus and every 30 seconds.
- Imports require an approved Cloudflare Access session when cloud configuration is enabled.
- Updates use a revision check. If another device changed the registry first, the app asks the user to reload before importing, preventing silent overwrite.
- Before replacing different local catalog data with the cloud copy, the old local snapshot is retained under **packmasterMarketplaceRegistryBeforeCloudV1** in browser storage.
- Only registry JSON goes to D1. Workspace Backup continues to include a separate recovery copy; keep backup files private and out of Git.

## Hosting note

GitHub remains the code repository. Cloudflare Pages builds from GitHub and runs the Pages Function and D1 binding. The existing GitHub Pages URL cannot access D1 directly; all devices need to use the Cloudflare Pages production URL after cutover.