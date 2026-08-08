const fs = require('fs');
const path = require('path');

const file = path.resolve(__dirname, '../index.html');
let html = fs.readFileSync(file, 'utf8');

const replaceOnce = (from, to, label) => {
  if (html.includes(to)) return;
  const count = html.split(from).length - 1;
  if (count !== 1) throw new Error(`${label}: expected exactly one anchor, found ${count}`);
  html = html.replace(from, to);
};

replaceOnce(
  '  <script src="./packmaster-workspace.js"></script>\n',
  '  <script src="./packmaster-workspace.js"></script>\n  <script src="./packmaster-duplicate.js"></script>\n',
  'duplicate script include'
);

replaceOnce(
  '      const workspaceApi = window.PackMasterWorkspace;\n',
  '      const workspaceApi = window.PackMasterWorkspace;\n      const duplicateApi = window.PackMasterDuplicate;\n',
  'duplicate API binding'
);

replaceOnce(
  '      const handleFileUpload = async (e) => {\n        const files = Array.from(e.target.files);\n        if (files.length === 0) return;\n',
  `      const handleFileUpload = async (e) => {\n        let files = Array.from(e.target.files);\n        if (files.length === 0) return;\n`,
  'mutable upload files'
);

const activeBatchAnchor = `        if (!activeBatchId) {\n          showToast('กรุณาสร้างหรือเปิด Batch ก่อนอัปโหลดไฟล์', 'error');\n          e.target.value = null;\n          return;\n        }\n\n        if (orders.length >= 150) {`;

const duplicatePrelude = `        if (!activeBatchId) {\n          showToast('กรุณาสร้างหรือเปิด Batch ก่อนอัปโหลดไฟล์', 'error');\n          e.target.value = null;\n          return;\n        }\n\n        // Phase 3B — Duplicate Upload Safety Layer. Parser/Matcher/Qty logic below remains unchanged.\n        let acceptedSourceFiles = [];\n        if (duplicateApi) {\n          const fingerprinted = [];\n          for (const file of files) {\n            if (!file.name.toLowerCase().endsWith('.pdf')) {\n              fingerprinted.push({ file, hash: null, duplicate: null });\n              continue;\n            }\n            try {\n              const fileHash = await duplicateApi.hashFile(file);\n              const duplicate = duplicateApi.findExactFileDuplicate(fileHash, activeBatch?.sourceFiles || []);\n              fingerprinted.push({ file, hash: fileHash, duplicate });\n            } catch (hashError) {\n              console.warn('Duplicate fingerprint unavailable for file', file.name, hashError);\n              fingerprinted.push({ file, hash: null, duplicate: null });\n            }\n          }\n\n          const exactDuplicates = fingerprinted.filter(entry => entry.duplicate);\n          if (exactDuplicates.length > 0) {\n            const names = exactDuplicates.map(entry => entry.file.name).join(', ');\n            const importAgain = window.confirm(\`พบไฟล์ PDF ที่เคยนำเข้า Batch นี้แล้ว: \\n\\n\${names}\\n\\nกด OK หากต้องการนำเข้าซ้ำจริง ๆ หรือ Cancel เพื่อข้ามไฟล์ที่ซ้ำ\`);\n            if (!importAgain) {\n              const duplicateFiles = new Set(exactDuplicates.map(entry => entry.file));\n              files = files.filter(file => !duplicateFiles.has(file));\n            }\n          }\n\n          const acceptedSet = new Set(files);\n          acceptedSourceFiles = fingerprinted\n            .filter(entry => acceptedSet.has(entry.file) && entry.hash)\n            .map(entry => ({\n              name: entry.file.name,\n              size: Number(entry.file.size) || 0,\n              hash: entry.hash,\n              addedAt: new Date().toISOString()\n            }));\n\n          if (files.length === 0) {\n            showToast('ข้ามไฟล์ที่ซ้ำทั้งหมดแล้ว — ไม่มีข้อมูลใหม่ถูกเพิ่ม', 'success');\n            e.target.value = null;\n            return;\n          }\n        } else {\n          showToast('Duplicate checker ไม่พร้อม — อัปโหลดต่อได้ แต่รอบนี้จะไม่มีการตรวจไฟล์ซ้ำ', 'error');\n        }\n\n        if (orders.length >= 150) {`;
replaceOnce(activeBatchAnchor, duplicatePrelude, 'duplicate pre-upload guard');

const appendAnchor = `          if (allNewOrders.length > 0) {\n            resetActiveBatchCompletion();\n            setOrders(prev => [...prev, ...allNewOrders]); \n            setActiveTab('preview');\n            showToast(\`เพิ่มข้อมูลสำเร็จ \${allNewOrders.length} ใบ\`, 'success');\n          }`;

const appendReplacement = `          if (allNewOrders.length > 0) {\n            const duplicateSignals = duplicateApi\n              ? duplicateApi.findOrderDuplicateSignals(allNewOrders, orders)\n              : [];\n\n            if (duplicateSignals.length > 0) {\n              const importPossibleDuplicates = window.confirm(\`พบ Order ที่อาจซ้ำกับข้อมูลใน Batch นี้ \${duplicateSignals.length} รายการ\\n\\nระบบจะไม่ลบหรือรวม Qty ให้อัตโนมัติ\\nกด OK หากตรวจแล้วต้องการนำเข้าต่อ หรือ Cancel เพื่อหยุดรอบนี้\`);\n              if (!importPossibleDuplicates) {\n                showToast('ยกเลิกการเพิ่ม Order ที่อาจซ้ำ — ข้อมูลเดิมยังอยู่ครบ', 'error');\n                return;\n              }\n            }\n\n            resetActiveBatchCompletion();\n\n            if (activeBatch && acceptedSourceFiles.length > 0) {\n              const nextMeta = {\n                ...activeBatch,\n                sourceFiles: [...(Array.isArray(activeBatch.sourceFiles) ? activeBatch.sourceFiles : []), ...acceptedSourceFiles],\n                printedAt: null,\n                updatedAt: new Date().toISOString()\n              };\n              upsertBatchMeta(nextMeta);\n              if (batchStorageReady && batchApi) {\n                try {\n                  await batchApi.saveBatch(nextMeta, [...orders, ...allNewOrders]);\n                } catch (sourceSaveError) {\n                  console.error('Save source fingerprint failed', sourceSaveError);\n                  showToast('นำเข้าได้ แต่บันทึกประวัติไฟล์ซ้ำไม่สำเร็จ — กรุณา Backup ก่อนสลับ Batch', 'error');\n                }\n              }\n            }\n\n            setOrders(prev => [...prev, ...allNewOrders]); \n            setActiveTab('preview');\n            showToast(\`เพิ่มข้อมูลสำเร็จ \${allNewOrders.length} ใบ\`, 'success');\n          }`;
replaceOnce(appendAnchor, appendReplacement, 'post-parse duplicate warning');

fs.writeFileSync(file, html);
console.log('Applied Phase 3B duplicate upload integration patch');
