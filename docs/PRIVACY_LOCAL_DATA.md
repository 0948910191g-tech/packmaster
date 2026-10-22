# PackMaster Data Privacy Guide

PackMaster keeps order processing local to each browser. Cloudflare D1 stores only the shared TikTok/Shopee Marketplace product registry after an approved user signs in through Cloudflare Access. Orders, source PDFs, parsed customer data, Batch data, SKU Mapping rules, print output, and Diagnostics are not sent to D1.

## Shared Marketplace Registry

The shared registry contains marketplace product names, product/item IDs, variant/model rows, and Seller SKU values from imported catalog JSON files.

- Registry API access requires a Cloudflare Access session for an exact email address in the configured allowlist.
- Pages Functions verify the signed Access JWT, its issuer and audience, expiry, and email before reading or writing D1.
- The D1 database is accessed only by server-side Pages Functions. No D1 credentials or database keys are placed in browser files.
- The cloud copy refreshes when a page regains focus and every 30 seconds while open.
- The first authorized user explicitly seeds the cloud copy from the device that has the correct catalog. Once a cloud copy exists, it is authoritative.
- If the cloud copy replaces different local registry data, the previous local snapshot is kept in Browser storage under packmasterMarketplaceRegistryBeforeCloudV1.
- Workspace Backups still include the registry snapshot. Keep backup files private and out of Git.

The Marketplace Registry remains separate from the SKU Mapping library. Importing a catalog does not create internal packing names or matching rules.

## Data that stays local

- Marketplace order PDFs and source files
- pdfImage data used for Preview/Reprint
- Parsed order, tracking, and customer information
- Batch state and Workspace order history
- SKU Mapping rules and internal packing names
- Print-ready PDFs

These files may contain customer data and must not be committed to a public GitHub repository or attached to a public issue.

## Diagnostics

Pilot Diagnostics may contain aggregate/capability information such as Batch counts, order totals, Ready/Review/Unmapped totals, storage estimates, duplicate-warning totals, browser capability flags, and error categories.

Diagnostics must not include:

- pdfImage
- Raw PDFs
- Full tracking numbers or order IDs
- Customer names, addresses, or phone numbers
- Free-form error text that could contain customer information

Review any exported Diagnostics file before sharing it.

## Workspace Backup

Workspace Backup is for recovery or device migration and may contain more local order data than Diagnostics.

- Keep it in a folder controlled by the shop.
- Do not share a public link.
- Do not commit it to Git.
- Remove unnecessary copies according to the shop's retention policy.

## Browser and device

Because order data remains in the local browser:

- Avoid public computers.
- Use a browser profile controlled by the shop.
- Back up before clearing site data or resetting a browser.
- Sign in to the shared registry only on devices controlled by the shop.