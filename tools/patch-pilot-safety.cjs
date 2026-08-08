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
  '  <script src="./packmaster-exceptions.js"></script>\n  <script src="./packmaster-archive.js"></script>',
  '  <script src="./packmaster-exceptions.js"></script>\n  <script src="./packmaster-pilot-safety.js"></script>\n  <script src="./packmaster-archive.js"></script>',
  'pilot safety script'
);

replaceOnce(
  '      const exceptionApi = window.PackMasterExceptions;\n      const archiveApi = window.PackMasterArchive;',
  '      const exceptionApi = window.PackMasterExceptions;\n      const pilotSafetyApi = window.PackMasterPilotSafety;\n      const archiveApi = window.PackMasterArchive;',
  'pilot safety API'
);

replaceOnce(
  "      const exceptionRows = useMemo(() =>\n        exceptionApi ? exceptionApi.buildExceptionRows(MappedOrders) : [],\n      [MappedOrders]);\n\n      const filteredExceptionRows = useMemo(() =>",
  "      const exceptionRows = useMemo(() =>\n        exceptionApi ? exceptionApi.buildExceptionRows(MappedOrders) : [],\n      [MappedOrders]);\n      const printBlocked = pilotSafetyApi ? pilotSafetyApi.hasBlockingExceptions(exceptionRows) : exceptionRows.length > 0;\n\n      const filteredExceptionRows = useMemo(() =>",
  'print blocked derived state'
);

replaceOnce(
  "      const openExceptionInTable = (row) => {\n        if (!row || !row.order) return;\n        setPreviewMode('table');\n        setReviewPlatform('ALL');\n        setReviewStatus('ALL');\n        setReviewSearch(row.order.tracking || row.order.orderId || '');\n      };\n\n      const sortBatchRows =",
  "      const openExceptionInTable = (row) => {\n        if (!row || !row.order) return;\n        setPreviewMode('table');\n        setReviewPlatform('ALL');\n        setReviewStatus('ALL');\n        setReviewSearch(row.order.tracking || row.order.orderId || '');\n      };\n\n      const handleFixSkuException = (row) => {\n        if (!row || !row.order || !pilotSafetyApi) return;\n        const seed = pilotSafetyApi.getSkuFixSeed(row);\n        if (!seed) {\n          openExceptionInTable(row);\n          showToast('Exception นี้ไม่มีข้อความ SKU ที่ปลอดภัยสำหรับเติมอัตโนมัติ — เปิดในตารางแทน', 'error');\n          return;\n        }\n        setEditingId(null);\n        setSkuSearch(seed);\n        setSkuFilter('ALL');\n        setNewRule({ keyword: seed, shortName: '' });\n        setActiveTab('settings');\n        showToast('เปิดคลังคำศัพท์พร้อม Keyword จาก Exception แล้ว — ตรวจข้อความก่อนกดเพิ่ม', 'success');\n      };\n\n      const sortBatchRows =",
  'one-click SKU exception fix'
);

replaceOnce(
  "      const formatBatchUpdated = (value) => {",
  "      const getEffectiveBatchStatus = (batch) => pilotSafetyApi ? pilotSafetyApi.getEffectiveBatchStatus(batch) : batch.status;\n\n      const formatBatchUpdated = (value) => {",
  'effective batch status helper'
);

replaceOnce(
  "      const handlePrint = async () => {\n        await markActiveBatchPrinted();\n        window.print();\n      };",
  "      const handlePrint = async () => {\n        if (printBlocked) {\n          showToast(`ยังพิมพ์ไม่ได้ — แก้ Exception ให้ครบก่อน (${exceptionRows.length} รายการ)`, 'error');\n          return;\n        }\n        await markActiveBatchPrinted();\n        window.print();\n      };",
  'print handler safety gate'
);

replaceOnce(
  "      const handleExportPDF = async () => {\n        if (MappedOrders.length === 0) return;",
  "      const handleExportPDF = async () => {\n        if (MappedOrders.length === 0) return;\n        if (printBlocked) {\n          showToast(`ยังพิมพ์ไม่ได้ — แก้ Exception ให้ครบก่อน (${exceptionRows.length} รายการ)`, 'error');\n          return;\n        }",
  'export handler safety gate'
);

replaceOnce(
  '                            const statusUi = getBatchStatusUi(batch.status);',
  '                            const statusUi = getBatchStatusUi(getEffectiveBatchStatus(batch));',
  'batch card effective status'
);

replaceOnce(
  "                                {activeBatch && (() => { const ui = getBatchStatusUi(activeBatch.status); return <span className={`px-3 py-1 rounded-full border text-[10px] font-black ${ui.className}`}>{ui.label}</span>; })()}",
  "                                {activeBatch && (() => { const ui = getBatchStatusUi(getEffectiveBatchStatus(activeBatch)); return <span className={`px-3 py-1 rounded-full border text-[10px] font-black ${ui.className}`}>{ui.label}</span>; })()}",
  'active batch effective status'
);

replaceOnce(
  '                       <button onClick={handleExportPDF} disabled={exportStatus.active || orders.length === 0} className="bg-white border-2 border-blue-50 hover:border-blue-100 disabled:opacity-50 text-blue-900 px-6 py-3 rounded-2xl font-bold text-sm shadow-sm flex items-center gap-2 transition-all active:scale-95"><span>📥</span> Save PDF</button>\n                       <button onClick={handlePrint} disabled={orders.length === 0} className="bg-blue-950 hover:bg-blue-900 disabled:opacity-50 text-white px-8 py-3 rounded-2xl font-bold text-sm shadow-lg shadow-blue-900/20 flex items-center gap-2 transition-all active:scale-95"><span>🖨️</span> พิมพ์</button>',
  '                       <button onClick={handleExportPDF} disabled={exportStatus.active || orders.length === 0 || printBlocked} title={printBlocked ? `ยังมี Exception ${exceptionRows.length} รายการ` : \'Save PDF\'} className="bg-white border-2 border-blue-50 hover:border-blue-100 disabled:opacity-50 text-blue-900 px-6 py-3 rounded-2xl font-bold text-sm shadow-sm flex items-center gap-2 transition-all active:scale-95"><span>📥</span> Save PDF</button>\n                       <button onClick={handlePrint} disabled={orders.length === 0 || printBlocked} title={printBlocked ? `ยังมี Exception ${exceptionRows.length} รายการ` : \'พิมพ์\'} className="bg-blue-950 hover:bg-blue-900 disabled:opacity-50 text-white px-8 py-3 rounded-2xl font-bold text-sm shadow-lg shadow-blue-900/20 flex items-center gap-2 transition-all active:scale-95"><span>{printBlocked ? \'🔒\' : \'🖨️\'}</span> {printBlocked ? \'ยังพิมพ์ไม่ได้\' : \'พิมพ์\'}</button>',
  'print buttons disabled safety'
);

replaceOnce(
  "                  {orders.length > 0 && (\n                    <>",
  "                  {orders.length > 0 && printBlocked && (\n                    <div className=\"mb-5 rounded-2xl border-2 border-red-100 bg-red-50 px-5 py-4 flex items-start gap-3 text-red-700\">\n                      <span className=\"text-xl\">🔒</span>\n                      <div><div className=\"font-black text-sm\">แก้ Exception ให้ครบก่อนพิมพ์</div><div className=\"text-xs font-bold text-red-600/70 mt-1\">เหลือ {exceptionRows.length} รายการ • Print / Save PDF ถูกล็อกเพื่อป้องกันแพ็กผิด</div></div>\n                    </div>\n                  )}\n\n                  {orders.length > 0 && (\n                    <>",
  'visible print lock notice'
);

replaceOnce(
  '                                <button onClick={() => moveExceptionCursor(1)} disabled={safeExceptionCursor >= filteredExceptionRows.length - 1} className="px-3 py-2 rounded-xl bg-white border border-slate-200 disabled:opacity-30 text-xs font-black">ถัดไป</button>\n                                <button onClick={() => openExceptionInTable(currentException)} className="px-4 py-2 rounded-xl bg-blue-950 text-white text-xs font-black">เปิดในตาราง</button>',
  '                                <button onClick={() => moveExceptionCursor(1)} disabled={safeExceptionCursor >= filteredExceptionRows.length - 1} className="px-3 py-2 rounded-xl bg-white border border-slate-200 disabled:opacity-30 text-xs font-black">ถัดไป</button>\n                                {(currentException.types.includes(\'UNMAPPED\') || currentException.types.includes(\'REVIEW_SKU\') || currentException.types.includes(\'PARSER_WARNING\')) && <button onClick={() => handleFixSkuException(currentException)} className="px-4 py-2 rounded-xl bg-amber-500 hover:bg-amber-600 text-white text-xs font-black">ตั้งชื่อ SKU</button>}\n                                <button onClick={() => openExceptionInTable(currentException)} className="px-4 py-2 rounded-xl bg-blue-950 text-white text-xs font-black">เปิดในตาราง</button>',
  'exception fix button'
);

fs.writeFileSync(file, html);
console.log('Pilot safety UI patch applied');
