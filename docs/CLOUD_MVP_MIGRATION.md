# PackMaster Cloud MVP — Migration Runbook

## เป้าหมายจริง

พนักงาน PPG เปิด PackMaster จาก URL Cloudflare เดียวกัน ทุกเครื่องเห็นและแก้ไขข้อมูลชุดเดียวกันโดยไม่ต้องรับ/ส่งไฟล์ JSON เอง

แหล่งข้อมูลกลางประกอบด้วย Batch/Orders, SKU Mapping, Review/Quantity Overrides, Archive, Duplicate Fingerprints, Source Files, Reprint Snapshots และทะเบียน TikTok/Shopee โดยต้องไม่สูญเสียข้อมูล PDF/ภาพใบปะหน้าที่ใช้แพ็กสินค้า

## สถานะ ณ 4 พฤศจิกายน 2026

- **พร้อม:** แยกสร้าง D1 `packmaster-workspace` และติดตั้งตาราง `workspace_batches`, `workspace_documents`, `workspace_audit` สำเร็จ ตรวจฐานจริงแล้วมี 0 Batch
- **พร้อมในโค้ดเท่านั้น:** `cloudflare/workspace/workspace-worker.mjs` ใช้ D1-only แบ่ง Orders/รูปเป็นชิ้น BLOB พร้อม SHA-256, Bearer authorization และ CAS revision; `packmaster-cloud-client.js` แจ้ง 409 เมื่อข้อมูลต่างเครื่องชนกัน
- **ไม่ใช้ R2:** ผู้ใช้ไม่ต้องการผูกบัตรหรือเปิดบริการชำระเงิน จึงตัด R2 binding และเพิ่มตาราง D1 `workspace_objects` / `workspace_object_chunks` แทน; ยังไม่มี Worker token, ยังไม่ได้ Deploy Workspace API หรือย้าย Dashboard ทั้งโปรแกรมขึ้น Cloudflare
- **ยังไม่พร้อม:** React UI ยังใช้ LocalStorage/IndexedDB สำหรับ Mapping, Archive, Duplicate, Reprint Snapshot และ Batch ตามค่าเริ่มต้น; มีเฉพาะ hook opt-in ของ Batch adapter ซึ่งยังไม่ถูกเปิดใช้งาน
- **ยังไม่ได้ทำ:** ย้ายข้อมูลออเดอร์/ไฟล์จริงจาก Browser ของพนักงานเข้าสู่ Cloud, ทดสอบพร้อมกันสองเครื่อง, ทดสอบพิมพ์จาก D1 บนเครื่องพิมพ์จริง
- **ยังคงเดิม:** D1 `packmaster-registry` ที่เก็บทะเบียน TikTok 121 / Shopee 126 สินค้าไม่ถูกแก้ไข

**ห้ามประกาศว่า MVP พร้อมใช้จริง** จนกว่าจะครบ Acceptance Criteria ด้านล่าง

## สถาปัตยกรรม

Cloudflare-hosted frontend (JS/CSS dependencies self-hosted) → Worker API พร้อมสิทธิ์ใช้งาน → D1 เท่านั้น (ข้อมูลธุรกรรม, revision, Orders/ภาพแบบ BLOB แบ่งชิ้น)

- D1 `workspace_batches`: Batch ID, meta, revision, immutable D1 object reference, soft-delete tombstone
- D1 `workspace_documents`: Mapping/Archive/Duplicate และ settings รายประเภทพร้อม optimistic revision
- D1 `workspace_audit`: Log การเขียนข้อมูล โดยห้ามเก็บ PII หรือ token ใน log
- D1 `workspace_objects` และ `workspace_object_chunks`: Orders/ภาพแบบแบ่งชิ้นสูงสุด 4 MiB ต่อ snapshot พร้อม SHA-256; ห้ามเปิดข้อมูลผ่าน public endpoint
- หากเครื่อง A/B แก้ Batch รุ่นเดียวกัน ระบบตอบ **409 revision_conflict** และไม่เขียนทับโดยพลการ ผู้ใช้ต้อง Reload/แก้ Conflict
## ขั้นตอนเปิดใช้งานที่ยังต้องทำ

1. **ไม่ใช้ R2 และไม่ผูกบัตร:** ใช้ Free Tier ของ Workers และ D1 เดิมที่เปิดได้โดยไม่เพิ่มบริการชำระเงิน
2. ใช้ D1 `packmaster-workspace` เดิม และตาราง `workspace_objects` / `workspace_object_chunks` ที่ติดตั้งแล้ว; ตรวจ Wrangler config ว่าไม่มี R2 binding
3. สร้าง secret `WORKSPACE_ACCESS_TOKEN` (คนละอันกับ `REGISTRY_SYNC_TOKEN`); อย่าใส่ค่าใน Git, Markdown, HTML หรือแชท
4. เปลี่ยนระบบยืนยันตัวตนเป็น per-user Cloudflare Access / RBAC ก่อนปล่อยให้พนักงานหลายคนใช้งานจริง; shared bearer เป็นได้เพียง internal pilot
5. ย้ายหน้า Packmaster ทั้งโปรแกรมไป Cloudflare Pages/Worker static assets โดย self-host dependencies, ใช้ CSP, และเชื่อม Batch API + Documents API รวมทั้ง Archive/Duplicate/Reprint
6. ทำให้ UI โหลดข้อมูลกลางและบันทึกอัตโนมัติอย่างปลอดภัย, แจ้ง Conflict 409, มี Loading/Error/Offline state; ห้ามเงียบหรือ fallback ไปบันทึก Local โดยไม่แจ้ง
7. โหมด D1-only ปัจจุบันจำกัด snapshot ต่อ Batch ที่ 4 MiB และ D1 Free จำกัด 500 MB ต่อฐานข้อมูล; ก่อนใช้กับ Batch ใหญ่หลายพันออเดอร์ ต้องแยกไฟล์ภาพรายออเดอร์หรือเพิ่ม chunk upload/manifest และทดสอบขนาดจริง
8. สำรอง Workspace ของแต่ละ Browser ก่อนย้าย ตรวจข้อมูลจากไฟล์ Backup, นับ Batch/Orders/Rules/Review/ภาพให้ตรง แล้วจึง Import แบบระบุชุดต้นทาง ไม่ล้างข้อมูลเดิม
9. ทดสอบบนสองเครื่องจริง พนักงาน A/B สลับแก้ Mapping, Batch, Order/Review แล้วตรวจข้อมูลตรงกัน; ทดสอบชน Revision, กดพิมพ์และ Reprint จากข้อมูล D1 แบบแบ่งชิ้น
10. ค่อย Deploy Cloudflare app หลังผ่าน Regression, Smoke, Print QA และตรวจสิทธิ์/ความเป็นส่วนตัว

## เกณฑ์รับมอบ MVP

- [ ] เปิด URL ของ Packmaster บน Cloudflare ได้จากสองเครื่อง โดยผู้ใช้ได้รับสิทธิ์ตามบทบาท
- [ ] สร้าง Batch เครื่อง A → เครื่อง B เห็น Batch เดียวกัน
- [ ] เพิ่มออเดอร์ / แก้ Qty / Review เครื่อง B → เครื่อง A เห็นผลเดียวกันหลัง Refresh หรือ Live update
- [ ] SKU Mapping, Archive, Duplicate และทะเบียนสินค้าเป็นแหล่งข้อมูลกลางเดียว
- [ ] D1 เก็บรูปใบปะหน้า PDF แบบแบ่งชิ้น และทั้งสองเครื่องเปิด/พิมพ์ได้ โดยไม่มีข้อมูลเสีย
- [ ] ข้อมูลชนกันต้องเตือนและไม่ทับงานอีกเครื่อง, ระบบต้องไม่ลบไฟล์ที่ถูกอ้างถึงจาก D1
- [ ] สำรองและย้ายข้อมูลเดิมได้ครบทุก Batch/Order/Mapping โดยไม่สูญเสียข้อมูล
- [ ] รองรับ Batch ขนาดจริงที่บริษัทใช้งานและทดสอบ Regression ผ่าน

## ความปลอดภัย / Rollback

ระบบ GitHub Pages เดิมยังเป็น Local-first และจะไม่ถูกเปลี่ยนเป็น Cloud โดยอัตโนมัติระหว่างสร้างระบบใหม่; เก็บไว้เป็น fallback ระหว่างทดสอบ ห้ามเชื่อมข้อมูลสองชุดด้วย auto-merge แบบเดา
ข้อมูลลูกค้าจริงไม่ถูกส่งเข้า GitHub หรือ Logs; การลบ Batch ฝั่ง Cloud เป็น soft-delete และเก็บไฟล์แบบแบ่งชิ้นใน D1 ไว้เพื่อกู้คืนตามนโยบาย Retention ก่อนลบถาวร
การ Import ข้อมูลเดิมต้องเกิดหลังสำรองและได้รับคำยืนยันที่แสดงจำนวนรายการและผลกระทบอย่างชัดเจน

## Registry-only Matcher migration (Cloud)
- Cloud packing uses only the platform-specific product registry and confirmed Seller SKU to PPG internal short-name assignments. Keyword rules (`skuMappingRules`) are retired in Cloud mode; legacy Local app remains available separately. No Keyword fallback or automatic migration.
- `packmaster-registry-matcher.js` requires an exact explicit Seller SKU, not a fuzzy product title. TIKTOK and SHOPEE are isolated. Unique SKU and the same Product/Model ID as at the time of assignment are required for an automatic pack-ready match.
- The new assignment document is stored in additive D1 table `workspace_registry_assignments` with optimistic revision protection. The migration does not modify old Keyword Mapping, existing marketplace registry, batches, orders or shipping data.
- Before deploying code, apply `cloudflare/workspace/registry-assignments.sql` on `packmaster-workspace`. Deploy Worker and self-hosted assets together; verify the new authenticated GET endpoint returns revision 0 with no assignments initially.
- In the ทะเบียนสินค้า page, select a unique Seller SKU and enter a human-confirmed PPG internal name. No automatic mapping from marketplace titles or old Keyword rules. Missing, duplicated or changed Seller SKUs require manual review.
- TikTok positioned PDF parsing generally preserves Product | Variant | Seller SKU. Shopee positioned labels may contain only the product title and no explicit Seller SKU. Those orders remain Review, never guessed. Test with representative sanitized PDFs before live use.
- This scope does not fix the remaining Cloud MVP issues such as duplicate-file history, print snapshots and limits on large batches.

### Deployment gate
1. Run `node --test tests/*.test.mjs`, JSX syntax check, `git diff --check`, Cloud build, and Wrangler dry-run.
2. Review the additive D1 migration and data safety. Do not change or delete previous marketplace or Keyword rows.
3. Deploy only on explicit authorization. Verify live JS checksum and test with dummy batches in two browsers, duplicates, missing SKU and Ready-only print.

## PDF 150-label upload fix: D1-only multipart
- Root cause: the old Cloud Batch save sent images for all orders inside a single JSON request. `workspace-worker.mjs` rejects bodies over 12 MiB, and each D1 immutable object was capped at 4 MiB. The UI correctly stopped on `body_too_large`, leaving its Batch without persisted Orders.
- New protocol (requires Worker and browser client to deploy together): individual immutable order parts, maximum 1,500,000 UTF-8 bytes each at the API, client-side targets 1,200,000 bytes. Stage by hash through `PUT /api/workspace/batches/:id/parts/:sha256`; only when every part has been acknowledged send the revision-checked manifest with `partHashes` and `orderCount` to the ordinary Batch PUT.
- The new D1 table `workspace_order_parts` stores validated order IDs and the SHA-256 part index. This permits a single bounded D1 query to confirm all staged parts and reject duplicate order IDs across parts without violating the 50-D1-query-per-request Workers Free limit. The old `workspace_batches` and legacy 4 MiB objects remain readable.
- On GET, the manifest lists immutable hashes. The client fetches and checks each part before exposing its orders to the packing UI, including full `pdfImage` print data. Identical unchanged parts reuse the same D1 object rather than increasing storage on every edit.
- If any upload or compare-and-swap commit fails, the active Batch revision remains untouched. Staged content can remain unreferenced and may require a separate reviewed retention/garbage-collection policy; NEVER blindly delete objects referenced by a Batch.
- Limits: 64 parts (roughly 76 MB client-part targets) per Batch snapshot, 5,000 Orders and 1.2 MB per single order; larger labels must be handled with a separate workflow. D1 Free per-database space limit remains 500 MB. Explicitly warn before assuming an oversized real Batch is supported.
- Additive production migration: `cloudflare/workspace/batch-parts.sql` must be applied before deploying both `workspace-worker.mjs` and the newly bundled `packmaster-cloud-client.js`. Existing Batch and SKU mapping data is preserved.
- Tests: synthetic 150 printable labels (~19 MB), reconstruct/reload, hash verification, cross-device CAS conflict, reused parts after edit, incomplete staging, duplicate IDs, corrupted part and unauthorized/stale writes.
- Deployment still requires user authorization under the Packmaster project safety rules. Test on a dummy Batch with a representative real 150-page PDF and another device before using real fulfillment orders.
