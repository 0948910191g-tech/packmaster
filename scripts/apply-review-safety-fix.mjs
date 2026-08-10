import fs from 'node:fs';

const path = 'index.html';
let html = fs.readFileSync(path, 'utf8');

if (html.includes('const reviewOverridesApi = window.PackMasterReviewOverrides;') &&
    html.includes('const printScopeApi = window.PackMasterPrintScope;') &&
    html.includes('const handleApplyQuickOrderName = () => {')) {
  console.log('Review safety patch already applied');
  process.exit(0);
}

const replaceOnce = (before, after, label) => {
  if (!html.includes(before)) throw new Error(`Patch anchor not found: ${label}`);
  html = html.replace(before, after);
};

replaceOnce(
  '<script src="./packmaster-keyword-assistant.js"></script>',
  '<script src="./packmaster-keyword-assistant.js"></script>\n  <script src="./packmaster-review-overrides.js"></script>\n  <script src="./packmaster-print-scope.js"></script>',
  'helper scripts'
);

replaceOnce(
  '      const keywordAssistantApi = window.PackMasterKeywordAssistant;',
  '      const keywordAssistantApi = window.PackMasterKeywordAssistant;\n      const reviewOverridesApi = window.PackMasterReviewOverrides;\n      const printScopeApi = window.PackMasterPrintScope;',
  'helper APIs'
);

replaceOnce(
  "      const [quickMapState, setQuickMapState] = useState({ open: false, row: null, keyword: '', shortName: '' });",
  "      const [quickMapState, setQuickMapState] = useState({ open: false, row: null, keyword: '', shortName: '' });\n      const [printScopeMode, setPrintScopeMode] = useState('FULL_BATCH');",
  'print scope state'
);

replaceOnce(
  '          for (const { pdf } of pdfDocuments) {',
  '          for (const { file, pdf } of pdfDocuments) {',
  'source file loop'
);

let sourceInsertions = 0;
html = html.replace(/pdfImage,\s*\n(\s*)platform,/g, (match, indent) => {
  sourceInsertions += 1;
  return `pdfImage,\n${indent}sourceFileName: file.name,\n${indent}sourcePage: i,\n${indent}platform,`;
});
if (sourceInsertions < 2) throw new Error(`Expected at least 2 source metadata insertions, got ${sourceInsertions}`);

replaceOnce(
  "        const initialKeyword = suggestions.length > 0 ? suggestions[0].value : '';\n        setQuickMapState({ open: true, row, sourceText: seed, keyword: initialKeyword, shortName: '', suggestions });",
  "        setQuickMapState({ open: true, row, sourceText: seed, keyword: '', shortName: '', suggestions });",
  'advisory keyword suggestions'
);

replaceOnce(
  '      const handleSaveQuickMapping = () => {',
  `      const handleApplyQuickOrderName = () => {\n        const shortName = String(quickMapState.shortName || '').trim();\n        const sourceText = String(quickMapState.sourceText || '').trim();\n        const targetOrderId = quickMapState.row?.order?.id;\n        if (!shortName || !sourceText || !targetOrderId || !reviewOverridesApi) {\n          showToast('กรุณาเลือกหรือกรอกชื่อภายในก่อนใช้กับ Order นี้', 'error');\n          return;\n        }\n        resetActiveBatchCompletion();\n        setOrders(prev => prev.map(order => order.id === targetOrderId\n          ? reviewOverridesApi.upsertManualSkuOverride(order, sourceText, shortName)\n          : order\n        ));\n        showToast('ใช้ชื่อกับ Order นี้แล้ว — ไม่ได้เพิ่ม Mapping ใหม่', 'success');\n        setQuickMapState({ open: false, row: null, keyword: '', shortName: '' });\n      };\n\n      const handleSaveQuickMapping = () => {`,
  'order-only handler'
);

replaceOnce(
  '        o.parsedItems.forEach(item => {\n            const match = getMatchResult(item.text);',
  `        o.parsedItems.forEach(item => {\n            const manualOverride = reviewOverridesApi ? reviewOverridesApi.getManualSkuOverride(o, item.text) : null;\n            if (manualOverride) {\n                const baseName = manualOverride.shortName.trim().replace(/\\u00A0/g, ' ');\n                const current = skuMap.get(baseName) || { qty: 0, sourceKeyword: item.text || '' };\n                skuMap.set(baseName, {\n                    qty: current.qty + item.qty,\n                    sourceKeyword: current.sourceKeyword || item.text || ''\n                });\n                return;\n            }\n            const match = getMatchResult(item.text);`,
  'manual override before matcher'
);

replaceOnce(
  "      const filteredSkuRules = useMemo(() => {",
  `      const internalNameChoices = useMemo(() => reviewOverridesApi\n        ? reviewOverridesApi.getUniqueInternalNames(skuRules)\n        : Array.from(new Set(skuRules.map(rule => String(rule.shortName || '').trim()).filter(Boolean))), [skuRules]);\n\n      const filteredSkuRules = useMemo(() => {`,
  'internal name choices'
);

replaceOnce(
  "            order.platform,\n            ...(order.displayItems || []),",
  "            order.platform,\n            order.sourceFileName,\n            order.sourcePage,\n            ...(order.displayItems || []),",
  'source metadata review search'
);

replaceOnce(
  "                  <div><div className=\"pm-section-kicker\">Quick Mapping</div><h3 className=\"text-lg font-black text-slate-900 mt-1\">ตั้งชื่อ SKU ตรงนี้ได้เลย</h3><p className=\"text-xs font-semibold text-slate-400 mt-1\">ใช้ Keyword ที่ Pilot Safety ตรวจแล้ว และบันทึกเป็นกฎเดียวกับคลังคำศัพท์</p></div>",
  "                  <div><div className=\"pm-section-kicker\">Quick Mapping</div><h3 className=\"text-lg font-black text-slate-900 mt-1\">ตั้งชื่อ SKU ตรงนี้ได้เลย</h3><p className=\"text-xs font-semibold text-slate-400 mt-1\">ค่าเริ่มต้นใช้กับ Order นี้เท่านั้น • ถ้าต้องการสอนระบบค่อยบันทึกเป็น Mapping แยกต่างหาก</p></div>",
  'quick map description'
);

replaceOnce(
  "                <div className=\"mt-4 rounded-xl border border-blue-100 bg-blue-50/55 p-3\"><div className=\"text-[9px] uppercase tracking-[.12em] font-black text-blue-500\">Order</div><div className=\"mt-1 font-mono text-xs font-black text-blue-950 break-all\">{quickMapState.row?.order?.tracking || quickMapState.row?.order?.orderId || 'Exception'}</div></div>\n                <div className=\"mt-4\"><label className=\"pm-label\">Keyword ที่ใช้จับคู่</label><input value={quickMapState.keyword} onChange={(e)=>setQuickMapState(prev=>({ ...prev, keyword:e.target.value }))} className=\"pm-input\" /></div>",
  "                <div className=\"mt-4 rounded-xl border border-blue-100 bg-blue-50/55 p-3\"><div className=\"text-[9px] uppercase tracking-[.12em] font-black text-blue-500\">Order</div><div className=\"mt-1 font-mono text-xs font-black text-blue-950 break-all\">{quickMapState.row?.order?.tracking || quickMapState.row?.order?.orderId || 'Exception'}</div><div data-pm-source-reference className=\"mt-2 text-[10px] font-bold text-blue-700/70\">Source: {quickMapState.row?.order?.sourceFileName || '-'}{quickMapState.row?.order?.sourcePage ? ` • หน้า ${quickMapState.row.order.sourcePage}` : ''}</div></div>\n                <div className=\"mt-4\"><label className=\"pm-label\">Keyword ที่ใช้จับคู่ (เฉพาะตอนบันทึกเป็น Mapping)</label><input value={quickMapState.keyword} onChange={(e)=>setQuickMapState(prev=>({ ...prev, keyword:e.target.value }))} className=\"pm-input\" /></div>",
  'quick map source reference'
);

replaceOnce(
  '                    <div className="mt-2 rounded-xl border border-slate-200 bg-slate-50 p-3 text-xs font-semibold text-slate-500">ไม่มี Keyword ที่ผ่าน Safety Check กับคลังและ Batch ปัจจุบัน — กรุณาใช้ Keyword ที่เฉพาะกว่านี้หรือเปิดคลังคำศัพท์</div>',
  '                    <div className="mt-2 rounded-xl border border-slate-200 bg-slate-50 p-3 text-xs font-semibold text-slate-500">ไม่มี Keyword ที่ผ่าน Safety Check — ยังตั้งชื่อเฉพาะ Order นี้ได้ โดยเลือกชื่อจากคลังหรือกรอกเองด้านล่าง</div>',
  'non-blocking no suggestion copy'
);

replaceOnce(
  '                <div className="mt-3"><label className="pm-label">ชื่อภายใน / ผลลัพธ์ที่จะพิมพ์</label><input autoFocus value={quickMapState.shortName} onChange={(e)=>setQuickMapState(prev=>({ ...prev, shortName:e.target.value }))} placeholder="เช่น เด้งม่วง5" className="pm-input text-base font-black" /></div>',
  '                <div className="mt-3"><label className="pm-label">ชื่อภายใน / ผลลัพธ์ที่จะพิมพ์</label><input autoFocus list="pm-internal-name-options" value={quickMapState.shortName} onChange={(e)=>setQuickMapState(prev=>({ ...prev, shortName:e.target.value }))} placeholder="ค้นหาจากคลัง หรือกรอกชื่อใหม่" className="pm-input text-base font-black" /><datalist id="pm-internal-name-options">{internalNameChoices.map(name=><option key={name} value={name} />)}</datalist></div>',
  'internal name datalist'
);

replaceOnce(
  '                <div className="mt-3 rounded-xl border border-slate-200 bg-slate-50 p-3 text-xs font-semibold text-slate-500">ระบบจะไม่เดาชื่อภายในให้ — ผู้ใช้ต้องกรอกและยืนยันเอง ก่อนใช้กฎกับ Review</div>',
  '                <div className="mt-3 rounded-xl border border-slate-200 bg-slate-50 p-3 text-xs font-semibold text-slate-500">เลือกชื่อที่มีอยู่หรือกรอกเองได้ทันที • การกด “ใช้กับ Order นี้” จะไม่สร้างกฎและไม่กระทบ SKU อื่น</div>',
  'order-only safety copy'
);

replaceOnce(
  '                <div className="mt-5 flex flex-col sm:flex-row sm:justify-between gap-2"><button onClick={handleOpenQuickMapInLibrary} className="pm-secondary-btn">เปิดคลังคำศัพท์</button><div className="flex gap-2"><button onClick={()=>setQuickMapState({ open:false, row:null, keyword:\'\', shortName:\'\' })} className="pm-ghost-btn">ยกเลิก</button><button onClick={handleSaveQuickMapping} disabled={!quickMapState.keyword.trim() || !quickMapState.shortName.trim()} className="pm-primary-btn">บันทึกและใช้</button></div></div>',
  '                <div className="mt-5 flex flex-col gap-3"><div className="flex flex-col sm:flex-row sm:justify-between gap-2"><button onClick={handleOpenQuickMapInLibrary} className="pm-secondary-btn">เปิดคลังคำศัพท์</button><button onClick={()=>setQuickMapState({ open:false, row:null, keyword:\'\', shortName:\'\' })} className="pm-ghost-btn">ยกเลิก</button></div><div className="grid sm:grid-cols-2 gap-2"><button onClick={handleSaveQuickMapping} disabled={!quickMapState.keyword.trim() || !quickMapState.shortName.trim()} className="pm-secondary-btn">บันทึกเป็น Mapping และใช้</button><button onClick={handleApplyQuickOrderName} disabled={!quickMapState.shortName.trim()} className="pm-primary-btn">ใช้กับ Order นี้</button></div></div>',
  'quick map actions'
);

replaceOnce(
  '      const printBlocked = pilotSafetyApi ? pilotSafetyApi.hasBlockingExceptions(exceptionRows) : exceptionRows.length > 0;',
  `      const printBlocked = pilotSafetyApi ? pilotSafetyApi.hasBlockingExceptions(exceptionRows) : exceptionRows.length > 0;\n      const PrintScopedOrders = useMemo(() => printScopeApi\n        ? printScopeApi.selectPrintOrders(MappedOrders, printScopeMode, order => getReviewFlags(order).ready)\n        : (printScopeMode === 'READY_ONLY' ? MappedOrders.filter(order => getReviewFlags(order).ready) : MappedOrders),\n      [MappedOrders, printScopeMode, getReviewFlags]);`,
  'print scoped orders'
);

replaceOnce(
  `      const handlePrint = async () => {\n        if (printBlocked) {\n          showToast(\`ยังพิมพ์ไม่ได้ — แก้ Exception ให้ครบก่อน (\${exceptionRows.length} รายการ)\`, 'error');\n          return;\n        }\n        await markActiveBatchPrinted();\n        window.print();\n      };`,
  `      const handlePrint = async (mode = 'FULL_BATCH', override = false) => {\n        if (mode === 'FULL_BATCH' && printBlocked && !override) {\n          showToast(\`ยังพิมพ์ทั้ง Batch ไม่ได้ — มี Exception \${exceptionRows.length} รายการ\`, 'error');\n          return;\n        }\n        const scopedOrders = printScopeApi\n          ? printScopeApi.selectPrintOrders(MappedOrders, mode, order => getReviewFlags(order).ready)\n          : (mode === 'READY_ONLY' ? MappedOrders.filter(order => getReviewFlags(order).ready) : MappedOrders);\n        if (scopedOrders.length === 0) {\n          showToast('ไม่มีรายการพร้อมพิมพ์ใน Scope นี้', 'error');\n          return;\n        }\n        if (mode === 'FULL_BATCH' && printBlocked && override) {\n          const confirmed = window.confirm(\`Batch นี้ยังมี \${exceptionRows.length} Exception\\n\\nต้องการพิมพ์ทั้ง Batch ต่อหรือไม่? รายการที่ยังไม่พร้อมอาจมีชื่อสินค้าไม่สมบูรณ์\`);\n          if (!confirmed) return;\n        }\n        setPrintScopeMode(mode);\n        await new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)));\n        if (mode === 'FULL_BATCH' && !printBlocked) await markActiveBatchPrinted();\n        window.print();\n      };\n\n      const handleEmergencyPrint = () => handlePrint('FULL_BATCH', true);`,
  'print handler'
);

const exportStart = html.indexOf('      const handleExportPDF = async () => {');
const exportEnd = html.indexOf('      const handleExportRules = () => {', exportStart);
if (exportStart < 0 || exportEnd < 0) throw new Error('Export handler anchors not found');
let exportBlock = html.slice(exportStart, exportEnd);
exportBlock = exportBlock.replace('const handleExportPDF = async () => {', "const handleExportPDF = async (mode = 'FULL_BATCH', override = false) => {");
exportBlock = exportBlock.replace(/        if \(MappedOrders\.length === 0\) return;\n        if \(printBlocked\) \{[\s\S]*?        \}\n        setExportStatus\(\{ active: true, current: 0, total: MappedOrders\.length \}\);/, `        if (MappedOrders.length === 0) return;\n        if (mode === 'FULL_BATCH' && printBlocked && !override) {\n          showToast(\`ยัง Save PDF ทั้ง Batch ไม่ได้ — มี Exception \${exceptionRows.length} รายการ\`, 'error');\n          return;\n        }\n        if (mode === 'FULL_BATCH' && printBlocked && override) {\n          const confirmed = window.confirm(\`Batch นี้ยังมี \${exceptionRows.length} Exception\\n\\nต้องการ Save PDF ทั้ง Batch ต่อหรือไม่?\`);\n          if (!confirmed) return;\n        }\n        const ordersToExport = printScopeApi\n          ? printScopeApi.selectPrintOrders(MappedOrders, mode, order => getReviewFlags(order).ready)\n          : (mode === 'READY_ONLY' ? MappedOrders.filter(order => getReviewFlags(order).ready) : MappedOrders);\n        if (ordersToExport.length === 0) {\n          showToast('ไม่มีรายการพร้อมสำหรับ Save PDF ใน Scope นี้', 'error');\n          return;\n        }\n        setExportStatus({ active: true, current: 0, total: ordersToExport.length });`);
exportBlock = exportBlock.replaceAll('MappedOrders.length', 'ordersToExport.length');
exportBlock = exportBlock.replace('const order = MappedOrders[i];', 'const order = ordersToExport[i];');
exportBlock = exportBlock.replace('          await markActiveBatchPrinted();', "          if (mode === 'FULL_BATCH' && !printBlocked) await markActiveBatchPrinted();");
html = html.slice(0, exportStart) + exportBlock + html.slice(exportEnd);

replaceOnce(
  '                        <button data-pm-action="save-pdf" onClick={handleExportPDF} disabled={exportStatus.active || orders.length === 0 || printBlocked} title={printBlocked?`ยังมี Exception ${exceptionRows.length} รายการ`:\'Save PDF\'} className="pm-secondary-btn"><PMIcon name="download"/> Save PDF</button>\n                        <button data-pm-action="print" onClick={handlePrint} disabled={orders.length === 0 || printBlocked} title={printBlocked?`ยังมี Exception ${exceptionRows.length} รายการ`:\'พิมพ์\'} className="pm-primary-btn"><PMIcon name={printBlocked?\'lock\':\'printer\'}/>{printBlocked?\'ยังพิมพ์ไม่ได้\':\'พิมพ์\'}</button>',
  '                        {printBlocked ? <><button data-pm-action="save-ready-pdf" onClick={()=>handleExportPDF(\'READY_ONLY\')} disabled={exportStatus.active || reviewSummary.ready === 0} className="pm-secondary-btn"><PMIcon name="download"/> Save Ready PDF</button><button data-pm-action="print-ready" onClick={()=>handlePrint(\'READY_ONLY\')} disabled={reviewSummary.ready === 0} className="pm-primary-btn"><PMIcon name="printer"/> พิมพ์ Ready</button></> : <><button data-pm-action="save-pdf" onClick={()=>handleExportPDF(\'FULL_BATCH\')} disabled={exportStatus.active || orders.length === 0} className="pm-secondary-btn"><PMIcon name="download"/> Save PDF</button><button data-pm-action="print" onClick={()=>handlePrint(\'FULL_BATCH\')} disabled={orders.length === 0} className="pm-primary-btn"><PMIcon name="printer"/> พิมพ์</button></>}',
  'top print actions'
);

replaceOnce(
  '                    {printBlocked && <div className="mb-4 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 flex items-center gap-3 text-amber-800"><PMIcon name="lock" className="w-5 h-5 shrink-0"/><div className="flex-1"><div className="text-sm font-black">Print Safety ทำงานอยู่</div><div className="text-xs font-semibold opacity-70">ยังมี {exceptionRows.length} Exception — แก้ให้ครบก่อน Print / Save PDF เพื่อป้องกันแพ็กผิด</div></div></div>}',
  '                    {printBlocked && <div className="mb-4 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 flex items-center gap-3 text-amber-800"><PMIcon name="lock" className="w-5 h-5 shrink-0"/><div className="flex-1"><div className="text-sm font-black">Print Safety ทำงานอยู่</div><div className="text-xs font-semibold opacity-70">ยังมี {exceptionRows.length} Exception — แนะนำให้แก้ Exception ให้ครบก่อนพิมพ์ แต่สามารถพิมพ์เฉพาะรายการพร้อม หรือยืนยัน Override ทั้ง Batch ได้</div></div></div>}',
  'print safety banner'
);

replaceOnce(
  "<div className=\"flex flex-wrap gap-2\">{printBlocked?<><button onClick={openExceptionMode} className=\"pm-warning-btn\"><PMIcon name=\"alert\"/> แก้ {exceptionRows.length} รายการ</button><button disabled className=\"pm-ghost-btn\"><PMIcon name=\"lock\"/> พิมพ์ถูกล็อก</button></>:<><button onClick={handleExportPDF} disabled={exportStatus.active||orders.length===0} className=\"pm-secondary-btn\"><PMIcon name=\"download\"/> Save PDF</button><button onClick={handlePrint} disabled={orders.length===0} className=\"pm-primary-btn\"><PMIcon name=\"printer\"/> พิมพ์ {reviewSummary.total} ใบ</button></>}</div>",
  "<div className=\"flex flex-wrap gap-2\">{printBlocked?<><button onClick={openExceptionMode} className=\"pm-warning-btn\"><PMIcon name=\"alert\"/> แก้ {exceptionRows.length} รายการ</button><button onClick={()=>handleExportPDF('READY_ONLY')} disabled={exportStatus.active||reviewSummary.ready===0} className=\"pm-secondary-btn\"><PMIcon name=\"download\"/> Save Ready PDF</button><button onClick={()=>handlePrint('READY_ONLY')} disabled={reviewSummary.ready===0} className=\"pm-primary-btn\"><PMIcon name=\"printer\"/> พิมพ์เฉพาะรายการพร้อม</button><button onClick={()=>handleExportPDF('FULL_BATCH', true)} className=\"pm-warning-btn\">Save PDF ทั้ง Batch</button><button onClick={handleEmergencyPrint} className=\"pm-warning-btn\">พิมพ์ทั้ง Batch</button></>:<><button onClick={()=>handleExportPDF('FULL_BATCH')} disabled={exportStatus.active||orders.length===0} className=\"pm-secondary-btn\"><PMIcon name=\"download\"/> Save PDF</button><button onClick={()=>handlePrint('FULL_BATCH')} disabled={orders.length===0} className=\"pm-primary-btn\"><PMIcon name=\"printer\"/> พิมพ์ {reviewSummary.total} ใบ</button></>}</div>",
  'review action dock'
);

replaceOnce(
  '{MappedOrders.map((order) => (<LabelCard key={`print-${order.id}`} order={order} thermalMode={thermalMode} isExport={true} />))}',
  '{PrintScopedOrders.map((order) => (<LabelCard key={`print-${order.id}`} order={order} thermalMode={thermalMode} isExport={true} />))}',
  'browser print scope'
);

replaceOnce(
  '<div className="font-mono text-xs font-bold text-slate-700">{order.tracking||order.orderId||order.id}</div><PMStatusPill',
  '<div className="font-mono text-xs font-bold text-slate-700">{order.tracking||order.orderId||order.id}</div><div data-pm-source-reference className="text-[9px] font-semibold text-slate-400 mt-1">{order.sourceFileName ? `${order.sourceFileName}${order.sourcePage ? ` • หน้า ${order.sourcePage}` : \'\'}` : \'-\'}</div><PMStatusPill',
  'table source display'
);

replaceOnce(
  '<div className="font-mono text-xs font-black text-slate-800 break-all mt-0.5">{order.tracking||order.orderId||order.id}</div>',
  '<div className="font-mono text-xs font-black text-slate-800 break-all mt-0.5">{order.tracking||order.orderId||order.id}</div><div data-pm-source-reference className="text-[9px] font-semibold text-slate-400 mt-1">{order.sourceFileName ? `${order.sourceFileName}${order.sourcePage ? ` • หน้า ${order.sourcePage}` : \'\'}` : \'-\'}</div>',
  'card source display'
);

fs.writeFileSync(path, html);
console.log('Applied PackMaster Review safety patch');
