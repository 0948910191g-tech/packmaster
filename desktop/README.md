# Packmaster Desktop for Windows

Packmaster Desktop v0.1 packages the existing GitHub Pages Packmaster into a local Windows Electron application. It does **not** change the matching, SKU, PDF parsing, quantity or label business logic.

## Build and run on Windows

From the repository root:

```powershell
npm ci
npm run desktop:start
npm test
npm run desktop:smoke
npm run desktop:build
```

The installation program is generated in `desktop-dist/Packmaster-Desktop-Setup-0.1.0-x64.exe` after a successful build. This is a local build only; it is not automatically published or deployed.

## Runtime

- Includes React, Babel, Tailwind CSS, PDF.js, HTML2Canvas and jsPDF inside the app. No network access required to open, import or print.
- Only the signed-off application assets can load via the private `packmaster://app/` origin.
- Cloud connections and external requests are blocked in v0.1. This build is Local-first, not Cloudflare multi-user.
- BrowserWindow uses sandbox, context isolation, no Node integration and a restricted navigation policy.
- Web and Desktop store data separately. The existing Desktop workspace stays at `%APPDATA%\PPG\Packmaster Desktop`; new store profiles use isolated child folders under its `stores` directory. Electron `userData` and `sessionData` both point to the selected profile, so LocalStorage, IndexedDB, cookies and caches stay separate. The “พื้นที่จัดเก็บ” selector lists the legacy workspace and named stores. New stores start empty; there is no automatic migration or import. Switching requires confirmation, asks the current page to save its active work, persists the choice in the base catalog, and relaunches Desktop into the selected profile. A normal shortcut reopens the last explicitly selected store; first launch without a saved choice uses the legacy workspace. An explicit `--store-id=...` overrides that preference.
- Review the backup contents and current Desktop data before confirming Restore, which can replace the selected local workspace. Keep a separate secure backup before production use.
- Print via the existing page print buttons or the File > Print menu. Test the correct 100 x 150 mm thermal-printer settings with a physical printer before packing orders.
- The desktop installer currently does not have a publisher code-signing certificate. Windows SmartScreen may show a warning; install only on trusted PPG computers.

## Known limitations

- This is a desktop packaging phase, **not** a full SQLite migration. Data stays in Electron-managed local browser databases (IndexedDB/localStorage).
- `--store-id=legacy` opens the unchanged legacy profile. Generated IDs select only profiles present in the base profile's `store-catalog.json`; store catalog creation and preference changes use an exclusive lock and reject malformed catalogs or symlink/junction escapes. An invalid saved preference fails closed instead of falling back to legacy. A stale catalog lock stops catalog changes until it is inspected; it is never removed automatically. Store profiles apply to this Desktop installation only, not Cloud or Web tenants.
- Names that were only stored in another browser/device are not shared automatically.
- Physical printer output, real customer PDFs and cross-machine migration require acceptance testing on sanitized examples.
- No updater or update notification is implemented. Updater work is blocked until a trusted release source, artifact signing identity, and verification procedure are selected; do not enable external update requests or install unsigned update artifacts. Future releases must retain the same application ID and userdata path.
- `npm run desktop:smoke` in an unpackaged development build uses the persistent isolated profile at `desktop/test-profiles/smoke`; it never opens the normal `%APPDATA%` profile. For targeted test runs, pass `--test-profile=<absolute path>` beneath `desktop/test-profiles`. The app rejects profiles outside that directory and symlink/junction escapes. Test profile data is kept across runs to exercise persistence. Packaged `--smoke-test` and `--test-profile` are rejected because the repository test-profile directory is inside the read-only packaged app.
- Smoke verifies offline startup, PDF parsing, malformed local registry/assignment/SKU raw-value preservation and visible startup errors after reload, plus a synthetic Workspace Backup/Restore round trip with SKU rules, Batch, Order and marketplace assignment data. `npm run desktop:store-recovery-smoke` verifies recovery after a controlled process exit during restore and keeps its profiles under the isolated repository test-profile directory. This covers process interruption, not sudden power loss or storage-device failure. Recovery snapshots are subject to an approximately 64 MiB size cap; physical printing and real customer PDFs still need acceptance testing.

## Source of truth

Keep the desktop UI based on the main `index.html` with deterministic edits in `desktop/scripts/prepare.mjs`. Never edit `desktop/app` directly; it is generated and ignored by Git. Changes to production parser/matcher/qty are outside this task.
