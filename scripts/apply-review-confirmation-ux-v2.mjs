import fs from 'node:fs';

const file = 'index.html';
let html = fs.readFileSync(file, 'utf8');

if (html.includes('data-pm-review-original-pdf') && html.includes('data-pm-batch-source-files')) {
  console.log('Review Confirmation UX V2 is already applied');
  process.exit(0);
}

const fail = (message) => {
  throw new Error(`[Review UX V2 patch] ${message}`);
};

const replaceOnce = (label, from, to) => {
  const first = html.indexOf(from);
  if (first < 0) fail(`missing anchor: ${label}`);
  if (html.indexOf(from, first + from.length) >= 0) fail(`anchor is not unique: ${label}`);
  html = html.slice(0, first) + to + html.slice(first + from.length);
};

const replaceAllCount = (label, from, to, expectedCount) => {
  const parts = html.split(from);
  const count = parts.length - 1;
  if (count !== expectedCount) fail(`${label} expected ${expectedCount} matches, found ${count}`);
  html = parts.join(to);
};

const replaceSection = (label, startMarker, endMarker, replacement) => {
  const start = html.indexOf(startMarker);
  if (start < 0) fail(`missing section start: ${label}`);
  const end = html.indexOf(endMarker, start + startMarker.length);
  if (end < 0) fail(`missing section end: ${label}`);
  html = html.slice(0, start) + replacement + html.slice(end);
};

replaceOnce(
  'Review sidecar scripts',
  `  <script src="./packmaster-keyword-assistant.js"></script>\n  <script src="./packmaster-review-overrides.js"></script>`,
  `  <script src="./packmaster-keyword-assistant.js"></script>\n  <script src="./packmaster-review-keyword-suggestions.js"></script>\n  <script src="./packmaster-review-overrides.js"></script>\n  <script src="./packmaster-batch-source-files.js"></script>`
);

replaceOnce(
  'Review sidecar APIs',
  `      const keywordAssistantApi = window.PackMasterKeywordAssistant;\n      const reviewOverridesApi = window.PackMasterReviewOverrides;\n      const printScopeApi = window.PackMasterPrintScope;`,
  `      const keywordAssistantApi = window.PackMasterKeywordAssistant;\n      const reviewKeywordSuggestionsApi = window.PackMasterReviewKeywordSuggestions;\n      const reviewOverridesApi = window.PackMasterReviewOverrides;\n      const batchSourceFilesApi = window.PackMasterBatchSourceFiles;\n      const printScopeApi = window.PackMasterPrintScope;`
);

replaceOnce(
  'Batch source summary state',
  `      const [batchViewFilter, setBatchViewFilter] = useState('ACTIVE');\n      const [selectedArchivedBatchIds, setSelectedArchivedBatchIds] = useState([]);`,
  `      const [batchViewFilter, setBatchViewFilter] = useState('ACTIVE');\n      const [selectedArchivedBatchIds, setSelectedArchivedBatchIds] = useState([]);\n      const [batchSourceSummaries, setBatchSourceSummaries] = useState({});`
);

replaceOnce(
  'Batch source summary effect',
  `      const archivedBatchCount = useMemo(() => batches.filter(batch => Boolean(getBatchArchivedAt(batch))).length, [batches]);\n\n      useEffect(() => { localStorage.setItem('skuMappingRules', JSON.stringify(skuRules)); }, [skuRules]);`,
  `      const archivedBatchCount = useMemo(() => batches.filter(batch => Boolean(getBatchArchivedAt(batch))).length, [batches]);\n\n      useEffect(() => {\n        let cancelled = false;\n        const loadBatchSourceSummaries = async () => {\n          if (!batchApi || !batchSourceFilesApi) {\n            if (!cancelled) setBatchSourceSummaries({});\n            return;\n          }\n          const entries = await Promise.all(visibleBatches.map(async (batch) => {\n            try {\n              const batchOrders = batch.id === activeBatchId\n                ? orders\n                : ((await batchApi.loadBatch(batch.id)).orders || []);\n              return [batch.id, batchSourceFilesApi.summarizeBatchSourceFiles(batchOrders, 2)];\n            } catch (error) {\n              console.warn('Read Batch source filenames failed', batch.id, error);\n              return [batch.id, { names: [], total: 0, hiddenCount: 0, label: 'ยังไม่มีไฟล์' }];\n            }\n          }));\n          if (!cancelled) setBatchSourceSummaries(Object.fromEntries(entries));\n        };\n        loadBatchSourceSummaries();\n        return () => { cancelled = true; };\n      }, [visibleBatches, activeBatchId, orders, batchApi, batchSourceFilesApi]);\n\n      useEffect(() => { localStorage.setItem('skuMappingRules', JSON.stringify(skuRules)); }, [skuRules]);`
);

replaceOnce(
  'Empty parsed warning acknowledgement',
  `        if (o.parsedItems.length === 0) {\n            if (o.isContinuation) return { ...o, displayItems: [], originalQty: 0, qtyWarning: false };\n            const failedItems = o.parserWarning ? ['⚠️ ตรวจสอบ SKU', '⚠️ ตรวจสอบ Qty'] : [];\n            return { ...o, displayItems: failedItems, originalQty: 0, qtyWarning: Boolean(o.parserWarning) };\n        }`,
  `        if (o.parsedItems.length === 0) {\n            if (o.isContinuation) return { ...o, displayItems: [], originalQty: 0, qtyWarning: false };\n            const skuAcknowledged = reviewOverridesApi ? reviewOverridesApi.getReviewAcknowledgement(o, 'sku') : false;\n            const qtyAcknowledged = reviewOverridesApi ? reviewOverridesApi.getReviewAcknowledgement(o, 'qty') : false;\n            const failedItems = [];\n            if (o.parserWarning && !skuAcknowledged) failedItems.push('⚠️ ตรวจสอบ SKU');\n            if (o.parserWarning && !qtyAcknowledged) failedItems.push('⚠️ ตรวจสอบ Qty');\n            return { ...o, displayItems: failedItems, originalQty: 0, qtyWarning: Boolean(o.parserWarning) };\n        }`
);

replaceOnce(
  'Effective Qty in mapping loop',
  `        o.parsedItems.forEach(item => {\n            const manualOverride = reviewOverridesApi ? reviewOverridesApi.getManualSkuOverride(o, item.text) : null;`,
  `        o.parsedItems.forEach(item => {\n            const effectiveQty = reviewOverridesApi ? reviewOverridesApi.getEffectiveItemQty(o, item) : item.qty;\n            const manualOverride = reviewOverridesApi ? reviewOverridesApi.getManualSkuOverride(o, item.text) : null;`
);

replaceAllCount(
  'Mapped aggregation uses effective review Qty',
  `                    qty: current.qty + item.qty,`,
  `                    qty: current.qty + effectiveQty,`,
  2
);

replaceOnce(
  'Review warning rendering and effective total',
  `        if (hasAmbiguous || o.parserWarning) finalDisplayItems.push('• ⚠️ ตรวจสอบ SKU');\n        if (hasUnmatched) finalDisplayItems.push('• ยังไม่ตั้งชื่อ');\n\n        const totalQty = o.parsedItems.reduce((sum, item) => sum + (parseInt(item.qty, 10) || 0), 0);\n        const qtyWarning = hasQtyWarning(o.parsedItems, o.declaredTotalQty, o.parserWarning);\n        if (qtyWarning) finalDisplayItems.push('• ⚠️ ตรวจสอบ Qty');`,
  `        const skuAcknowledged = reviewOverridesApi ? reviewOverridesApi.getReviewAcknowledgement(o, 'sku') : false;\n        const qtyAcknowledged = reviewOverridesApi ? reviewOverridesApi.getReviewAcknowledgement(o, 'qty') : false;\n        if ((hasAmbiguous || o.parserWarning) && !skuAcknowledged) finalDisplayItems.push('• ⚠️ ตรวจสอบ SKU');\n        if (hasUnmatched) finalDisplayItems.push('• ยังไม่ตั้งชื่อ');\n\n        const totalQty = o.parsedItems.reduce((sum, item) => {\n          const qty = reviewOverridesApi ? reviewOverridesApi.getEffectiveItemQty(o, item) : item.qty;\n          return sum + (parseInt(qty, 10) || 0);\n        }, 0);\n        const qtyWarning = hasQtyWarning(o.parsedItems, o.declaredTotalQty, o.parserWarning);\n        if (qtyWarning && !qtyAcknowledged) finalDisplayItems.push('• ⚠️ ตรวจสอบ Qty');`
);

replaceOnce(
  'MappedOrders dependencies',
  `        return { ...o, displayItems: finalDisplayItems, originalQty: totalQty, qtyWarning };\n      }), [orders, getMatchResult]);`,
  `        return { ...o, displayItems: finalDisplayItems, originalQty: totalQty, qtyWarning };\n      }), [orders, getMatchResult, reviewOverridesApi]);`
);

replaceSection(
  'Review flags use exception layer',
  `      const getReviewFlags = useCallback((order) => {`,
  `      const reviewSummary = useMemo(() => {`,
  `      const getReviewFlags = useCallback((order) => {\n        if (exceptionApi) {\n          const flags = exceptionApi.getExceptionFlags(order);\n          return {\n            hasSkuReview: flags.reviewSku,\n            hasQtyReview: flags.reviewQty,\n            hasUnmapped: flags.unmapped,\n            ready: flags.ready\n          };\n        }\n        const outputText = (order.displayItems || []).join(' ');\n        const hasSkuReview = outputText.includes('ตรวจสอบ SKU');\n        const hasQtyReview = Boolean(order.qtyWarning || outputText.includes('ตรวจสอบ Qty'));\n        const hasUnmapped = outputText.includes('ยังไม่ตั้งชื่อ');\n        return { hasSkuReview, hasQtyReview, hasUnmapped, ready: !hasSkuReview && !hasQtyReview && !hasUnmapped };\n      }, [exceptionApi]);\n\n`
);

replaceSection(
  'Review exception handlers',
  `      const handleFixSkuException = (row) => {`,
  `      const handleApplyQuickOrderName = () => {`,
  `      const getReviewSourceText = (row) => {\n        if (!row || !row.order) return '';\n        const types = row.types || [];\n        let seed = '';\n        if (pilotSafetyApi && types.some(type => type === 'REVIEW_SKU' || type === 'UNMAPPED')) {\n          try { seed = pilotSafetyApi.getSkuFixSeed(row, getMatchResult) || ''; }\n          catch (error) { console.warn('Pilot Safety seed unavailable', error); }\n        }\n        if (seed) return seed;\n        const parsedItems = Array.isArray(row.order.parsedItems) ? row.order.parsedItems : [];\n        const unresolved = parsedItems.find(item => {\n          try { return getMatchResult(item && item.text).status !== 'matched'; }\n          catch (error) { return true; }\n        });\n        return String((unresolved || parsedItems[0])?.text || '').trim();\n      };\n\n      const getReviewKeywordSuggestions = (seed) => {\n        if (!seed) return [];\n        const batchItemTexts = orders.flatMap(order => (Array.isArray(order && order.parsedItems) ? order.parsedItems : []))\n          .map(item => String(item && item.text || '').trim())\n          .filter(Boolean);\n        let suggestions = [];\n        if (reviewKeywordSuggestionsApi && typeof reviewKeywordSuggestionsApi.generateReviewKeywordSuggestions === 'function') {\n          try {\n            suggestions = reviewKeywordSuggestionsApi.generateReviewKeywordSuggestions({\n              sourceText: seed,\n              existingRules: skuRules,\n              batchItemTexts,\n              maxSuggestions: 3,\n              keywordAssistant: keywordAssistantApi,\n              matchRule: matchSkuRule,\n              matchNormalizer: normalizeMatchText\n            });\n          } catch (suggestionError) {\n            console.warn('Review Keyword suggestions unavailable', suggestionError);\n            suggestions = [];\n          }\n        } else if (keywordAssistantApi && typeof keywordAssistantApi.generateKeywordSuggestions === 'function') {\n          suggestions = keywordAssistantApi.generateKeywordSuggestions({\n            sourceText: seed,\n            existingRules: skuRules,\n            batchItemTexts,\n            maxSuggestions: 3,\n            safeOnly: true,\n            matchRule: matchSkuRule,\n            matchNormalizer: normalizeMatchText\n          });\n        }\n        if (suggestions.length === 0 && reviewKeywordSuggestionsApi && typeof reviewKeywordSuggestionsApi.sanitizeSourceIdentity === 'function') {\n          const fallback = reviewKeywordSuggestionsApi.sanitizeSourceIdentity(seed);\n          if (fallback && (!keywordAssistantApi || !keywordAssistantApi.isGenericCandidate(fallback))) {\n            suggestions = [{ value: fallback, confidence: 'review', reason: 'full-source-review', specificity: 'current-context-max', autoApply: false, autoSave: false }];\n          }\n        }\n        return suggestions;\n      };\n\n      const handleFixSkuException = (row) => {\n        if (!row || !row.order) return;\n        const types = row.types || [];\n        if (!types.some(type => type === 'REVIEW_SKU' || type === 'UNMAPPED')) {\n          openExceptionInTable(row);\n          return;\n        }\n        const seed = getReviewSourceText(row);\n        if (!seed) {\n          openExceptionInTable(row);\n          showToast('ไม่พบข้อความสินค้าใน Order นี้ — กรุณาตรวจใบจริง', 'error');\n          return;\n        }\n        const suggestions = getReviewKeywordSuggestions(seed);\n        setQuickMapState({ open: true, row, sourceText: seed, keyword: '', shortName: '', suggestions });\n      };\n\n      const handleReviewException = (row) => {\n        if (!row || !row.order) return;\n        const types = row.types || [];\n        if (types.some(type => type === 'REVIEW_SKU' || type === 'UNMAPPED')) {\n          handleFixSkuException(row);\n          return;\n        }\n        const seed = getReviewSourceText(row);\n        setQuickMapState({ open: true, row, sourceText: seed, keyword: '', shortName: '', suggestions: [] });\n      };\n\n      const handleSetReviewConfirmation = (type, confirmed) => {\n        const targetOrderId = quickMapState.row?.order?.id;\n        if (!targetOrderId || !reviewOverridesApi) return;\n        resetActiveBatchCompletion();\n        setOrders(prev => prev.map(order => {\n          if (order.id !== targetOrderId) return order;\n          return confirmed\n            ? reviewOverridesApi.confirmReview(order, type)\n            : reviewOverridesApi.clearReviewConfirmation(order, type);\n        }));\n        setQuickMapState(prev => {\n          if (!prev.row || !prev.row.order) return prev;\n          const updatedOrder = confirmed\n            ? reviewOverridesApi.confirmReview(prev.row.order, type)\n            : reviewOverridesApi.clearReviewConfirmation(prev.row.order, type);\n          return { ...prev, row: { ...prev.row, order: updatedOrder } };\n        });\n        showToast(confirmed ? `ยืนยันว่า ${type === 'qty' ? 'Qty' : 'SKU'} ถูกต้องแล้ว` : `ยกเลิกการยืนยัน ${type === 'qty' ? 'Qty' : 'SKU'} แล้ว`, 'success');\n      };\n\n      const handleSaveQtyReviewCorrections = () => {\n        const targetOrderId = quickMapState.row?.order?.id;\n        const items = Array.isArray(quickMapState.row?.order?.parsedItems) ? quickMapState.row.order.parsedItems : [];\n        if (!targetOrderId || !reviewOverridesApi || items.length === 0) return;\n        const drafts = quickMapState.qtyDrafts || {};\n        const corrections = items.map(item => {\n          const fallbackQty = reviewOverridesApi.getEffectiveItemQty(quickMapState.row.order, item);\n          const rawDraft = Object.prototype.hasOwnProperty.call(drafts, item.text) ? drafts[item.text] : fallbackQty;\n          return { item, qty: Number(rawDraft) };\n        });\n        if (corrections.some(entry => !Number.isInteger(entry.qty) || entry.qty < 1)) {\n          showToast('Qty ที่แก้ต้องเป็นจำนวนเต็มตั้งแต่ 1 ขึ้นไป', 'error');\n          return;\n        }\n        resetActiveBatchCompletion();\n        setOrders(prev => prev.map(order => {\n          if (order.id !== targetOrderId) return order;\n          return corrections.reduce((next, entry) => reviewOverridesApi.upsertQtyOverride(next, entry.item.text, entry.qty), order);\n        }));\n        showToast('บันทึก Qty ที่แก้แล้ว — ตรวจใบจริงและติ๊ก “Qty ถูกต้อง” เพื่อปิด Exception', 'success');\n      };\n\n`
);

replaceOnce(
  'Manual SKU correction acknowledges explicit fix',
  `        setOrders(prev => prev.map(order => order.id === targetOrderId\n          ? reviewOverridesApi.upsertManualSkuOverride(order, sourceText, shortName)\n          : order\n        ));`,
  `        setOrders(prev => prev.map(order => {\n          if (order.id !== targetOrderId) return order;\n          let next = reviewOverridesApi.upsertManualSkuOverride(order, sourceText, shortName);\n          if ((quickMapState.row?.types || []).includes('REVIEW_SKU')) next = reviewOverridesApi.confirmReview(next, 'sku');\n          return next;\n        }));`
);

replaceOnce(
  'Batch card source filenames',
  `                                  <p className="text-[11px] font-semibold text-slate-400 mt-1">อัปเดต {formatBatchUpdated(batch.updatedAt)}</p>`,
  `                                  <p className="text-[11px] font-semibold text-slate-400 mt-1">อัปเดต {formatBatchUpdated(batch.updatedAt)}</p>\n                                  <div data-pm-batch-source-files className="mt-2 flex items-start gap-1.5 text-[10px] font-bold text-slate-500" title={batchSourceSummaries[batch.id]?.label || 'กำลังอ่านไฟล์...'}><PMIcon name="file" className="w-3.5 h-3.5 mt-0.5 shrink-0 text-blue-500"/><span className="truncate">ไฟล์: {batchSourceSummaries[batch.id]?.label || 'กำลังอ่านไฟล์...'}</span></div>`
);

replaceOnce(
  'Current exception inspect action',
  `<button onClick={()=>openExceptionInTable(currentException)} className="pm-secondary-btn">เปิดในรายการ</button>{(currentException.types||[]).some(type=>type==='REVIEW_SKU'||type==='UNMAPPED')&&<button onClick={()=>handleFixSkuException(currentException)} className="pm-primary-btn">ตั้งชื่อ SKU</button>}`,
  `<button onClick={()=>openExceptionInTable(currentException)} className="pm-secondary-btn">เปิดในรายการ</button><button data-pm-action="review-exception" onClick={()=>handleReviewException(currentException)} className="pm-primary-btn">ตรวจรายการ</button>`
);

replaceAllCount(
  'Review row inspect actions',
  `row&&(flags.hasSkuReview||flags.hasUnmapped)&&<button onClick={()=>handleFixSkuException(row)} className="pm-secondary-btn !py-2 !px-3">ตั้งชื่อ SKU</button>`,
  `row&&<button data-pm-action="review-exception" onClick={()=>handleReviewException(row)} className="pm-secondary-btn !py-2 !px-3">ตรวจรายการ</button>`,
  1
);

replaceAllCount(
  'Review card inspect actions',
  `row&&(flags.hasSkuReview||flags.hasUnmapped)&&<button onClick={()=>handleFixSkuException(row)} className="pm-secondary-btn w-full justify-center mt-3">ตั้งชื่อ SKU</button>`,
  `row&&<button data-pm-action="review-exception" onClick={()=>handleReviewException(row)} className="pm-secondary-btn w-full justify-center mt-3">ตรวจรายการ</button>`,
  1
);

replaceSection(
  'Side-by-side Review modal',
  `          {quickMapState.open && (`,
  `          {exportStatus.active && (`,
  `          {quickMapState.open && (\n            <div data-pm-quick-mapping className="pm-quick-map-backdrop no-print" role="dialog" aria-modal="true" aria-label="ตรวจและแก้ Exception">\n              <div className="pm-quick-map-panel !max-w-6xl !w-[min(1180px,96vw)]">\n                <div className="flex items-start justify-between gap-3">\n                  <div><div className="pm-section-kicker">Exception Review</div><h3 className="text-lg font-black text-slate-900 mt-1">ตรวจใบจริง แล้วตัดสินใจเฉพาะ Order นี้</h3><p className="text-xs font-semibold text-slate-400 mt-1">การยืนยัน/แก้เฉพาะ Order จะไม่สร้าง Shared Mapping อัตโนมัติ</p></div>\n                  <button onClick={()=>setQuickMapState({ open:false, row:null, keyword:'', shortName:'' })} className="pm-icon-btn" title="ปิด" aria-label="ปิด">×</button>\n                </div>\n                <div className="mt-4 grid lg:grid-cols-[minmax(0,1.05fr)_minmax(380px,.95fr)] gap-4">\n                  <div data-pm-review-original-pdf className="min-w-0 rounded-2xl border border-slate-200 bg-slate-100 overflow-hidden">\n                    <div className="px-4 py-3 bg-white border-b border-slate-200 flex items-center justify-between gap-3"><div><div className="text-[9px] font-black uppercase tracking-[.12em] text-slate-400">ใบต้นฉบับ</div><div className="text-xs font-black text-slate-800 mt-0.5">{quickMapState.row?.order?.sourceFileName || 'PDF ต้นทาง'}{quickMapState.row?.order?.sourcePage ? ` • หน้า ${quickMapState.row.order.sourcePage}` : ''}</div></div><span className="text-[10px] font-bold text-blue-600">ภาพก่อน PackMaster เขียนทับ</span></div>\n                    {quickMapState.row?.order?.pdfImage ? <div className="max-h-[72vh] overflow-auto p-3"><img src={quickMapState.row.order.pdfImage} alt="ใบออเดอร์ต้นฉบับ" className="w-full h-auto rounded-xl shadow-sm bg-white" /></div> : <div className="min-h-[320px] flex items-center justify-center p-6 text-center text-xs font-bold text-slate-400">ไม่มีภาพ PDF ต้นฉบับใน Order นี้</div>}\n                  </div>\n                  <div className="min-w-0 max-h-[76vh] overflow-y-auto pr-1">\n                    <div className="rounded-xl border border-blue-100 bg-blue-50/55 p-3"><div className="text-[9px] uppercase tracking-[.12em] font-black text-blue-500">Order</div><div className="mt-1 font-mono text-xs font-black text-blue-950 break-all">{quickMapState.row?.order?.tracking || quickMapState.row?.order?.orderId || 'Exception'}</div><div data-pm-source-reference className="mt-2 text-[10px] font-bold text-blue-700/70">Source: {quickMapState.row?.order?.sourceFileName || '-'}{quickMapState.row?.order?.sourcePage ? ` • หน้า ${quickMapState.row.order.sourcePage}` : ''}</div></div>\n                    {quickMapState.sourceText && <div className="mt-3 rounded-xl border border-slate-200 bg-white p-3"><div className="text-[9px] font-black uppercase tracking-[.1em] text-slate-400">ข้อความสินค้าจากใบจริง</div><div className="mt-1 text-xs font-bold leading-5 text-slate-700 break-words">{quickMapState.sourceText}</div></div>}\n\n                    {(quickMapState.row?.types || []).some(type => type === 'REVIEW_SKU' || type === 'UNMAPPED') && <>\n                      <div className="mt-4"><label className="pm-label">Keyword ที่ใช้จับคู่ (เฉพาะตอนบันทึกเป็น Mapping)</label><input value={quickMapState.keyword} onChange={(e)=>setQuickMapState(prev=>({ ...prev, keyword:e.target.value }))} className="pm-input" /></div>\n                      <div data-pm-keyword-suggestions className="mt-3">\n                        <div className="flex items-center justify-between gap-2"><label className="pm-label mb-0">Keyword แนะนำที่ผ่าน Safety Check</label><span className="text-[10px] font-semibold text-slate-400">ไม่ Auto-fill • ไม่ Auto-save</span></div>\n                        {(quickMapState.suggestions || []).length > 0 ? <div className="mt-2 grid gap-2">{(quickMapState.suggestions || []).map((suggestion,index)=>{const selected=quickMapState.keyword===suggestion.value;return <button key={\`${'${suggestion.value}'}-${'${index}'}\`} type="button" data-pm-keyword-suggestion onClick={()=>setQuickMapState(prev => ({ ...prev, keyword: suggestion.value }))} className={\`w-full rounded-xl border px-3 py-2.5 text-left transition ${'${selected'} ? 'border-blue-400 bg-blue-50 ring-2 ring-blue-100' : 'border-slate-200 bg-white hover:border-blue-200 hover:bg-blue-50/40'}\`}><div className="flex items-start justify-between gap-3"><span className="text-xs font-black text-slate-800 break-words">{suggestion.value}</span><span className={\`shrink-0 rounded-full border px-2 py-0.5 text-[9px] font-black ${'${suggestion.confidence'} === 'recommended' ? 'bg-emerald-50 border-emerald-200 text-emerald-700' : 'bg-amber-50 border-amber-200 text-amber-700'}\`}>{suggestion.confidence === 'recommended' ? 'ปลอดภัย' : 'ตรวจอีกครั้ง'}</span></div><div className="mt-1 text-[10px] font-semibold text-slate-500">{suggestion.confidence === 'recommended' ? 'ผ่าน Smart Matcher กับคลังและ Batch ปัจจุบัน' : 'เฉพาะที่สุดจากใบจริง • ระบบจะเช็ก Safety อีกครั้งก่อนบันทึก'}</div></button>})}</div> : <div className="mt-2 rounded-xl border border-slate-200 bg-slate-50 p-3 text-xs font-semibold text-slate-500">ยังตั้งชื่อเฉพาะ Order นี้ได้ — กรุณาอ้างอิงใบจริงด้านซ้ายและใช้ Keyword ที่เฉพาะเจาะจง</div>}\n                      </div>\n                      <div className="mt-3"><label className="pm-label">ชื่อภายใน / ผลลัพธ์ที่จะพิมพ์</label><input autoFocus list="pm-internal-name-options" value={quickMapState.shortName} onChange={(e)=>setQuickMapState(prev=>({ ...prev, shortName:e.target.value }))} placeholder="ค้นหาจากคลัง หรือกรอกชื่อใหม่" className="pm-input text-base font-black" /><datalist id="pm-internal-name-options">{internalNameChoices.map(name=><option key={name} value={name} />)}</datalist></div>\n                      <div className="mt-3 grid sm:grid-cols-2 gap-2"><button onClick={handleSaveQuickMapping} disabled={!quickMapState.keyword.trim() || !quickMapState.shortName.trim()} className="pm-secondary-btn justify-center">บันทึกเป็น Mapping และใช้</button><button onClick={handleApplyQuickOrderName} disabled={!quickMapState.shortName.trim()} className="pm-primary-btn justify-center">ใช้กับ Order นี้</button></div>\n                    </>}\n\n                    {(quickMapState.row?.types || []).includes('REVIEW_SKU') && <label data-pm-review-confirm-sku className="mt-4 flex items-start gap-3 rounded-xl border border-emerald-200 bg-emerald-50 p-3 cursor-pointer"><input type="checkbox" className="mt-0.5 w-4 h-4" checked={reviewOverridesApi ? reviewOverridesApi.getReviewAcknowledgement(quickMapState.row?.order,'sku') : false} onChange={(e)=>handleSetReviewConfirmation('sku',e.target.checked)} /><span><span className="block text-xs font-black text-emerald-900">SKU ถูกต้อง</span><span className="block text-[10px] font-semibold text-emerald-700/75 mt-0.5">ติ๊กเมื่อเทียบกับใบจริงแล้ว ชื่อ/การจับคู่ถูกต้อง</span></span></label>}\n\n                    {(quickMapState.row?.types || []).includes('REVIEW_QTY') && <div className="mt-4 rounded-xl border border-red-200 bg-red-50/50 p-3"><div className="flex items-center justify-between gap-2"><div><div className="text-xs font-black text-red-900">ตรวจสอบ Qty</div><div className="text-[10px] font-semibold text-red-700/70 mt-0.5">แก้เฉพาะ Review layer • Qty ที่ Parser อ่านเดิมยังถูกเก็บไว้</div></div></div><div className="mt-3 space-y-2">{(quickMapState.row?.order?.parsedItems || []).map((item,index)=>{const hasDraft=Object.prototype.hasOwnProperty.call(quickMapState.qtyDrafts||{},item.text);const effectiveQty=reviewOverridesApi?reviewOverridesApi.getEffectiveItemQty(quickMapState.row.order,item):item.qty;const value=hasDraft?quickMapState.qtyDrafts[item.text]:String(effectiveQty);return <div key={\`${'${item.text}'}-${'${index}'}\`} className="rounded-lg bg-white border border-red-100 p-2.5"><div className="text-[10px] font-bold text-slate-600 break-words mb-2">{item.text || `รายการ ${index+1}`}</div><div className="flex items-center gap-2"><span className="text-[10px] font-black text-slate-400">Qty</span><input data-pm-review-qty-override type="number" min="1" step="1" value={value} onChange={(e)=>setQuickMapState(prev=>({ ...prev, qtyDrafts:{ ...(prev.qtyDrafts||{}), [item.text]:e.target.value } }))} className="pm-input !py-2 w-24 text-center font-black" /><span className="text-[10px] font-semibold text-slate-400">Parser เดิม: {item.qty}</span></div></div>})}</div><button onClick={handleSaveQtyReviewCorrections} className="pm-secondary-btn w-full justify-center mt-3">บันทึก Qty ที่แก้</button><label data-pm-review-confirm-qty className="mt-3 flex items-start gap-3 rounded-xl border border-emerald-200 bg-emerald-50 p-3 cursor-pointer"><input type="checkbox" className="mt-0.5 w-4 h-4" checked={reviewOverridesApi ? reviewOverridesApi.getReviewAcknowledgement(quickMapState.row?.order,'qty') : false} onChange={(e)=>handleSetReviewConfirmation('qty',e.target.checked)} /><span><span className="block text-xs font-black text-emerald-900">Qty ถูกต้อง</span><span className="block text-[10px] font-semibold text-emerald-700/75 mt-0.5">ติ๊กหลังตรวจใบจริง หรือหลังแก้ Qty ด้านบนแล้ว</span></span></label></div>}\n\n                    <div className="mt-5 flex flex-col sm:flex-row sm:justify-between gap-2"><button onClick={handleOpenQuickMapInLibrary} className="pm-secondary-btn">เปิดคลังคำศัพท์</button><button onClick={()=>setQuickMapState({ open:false, row:null, keyword:'', shortName:'' })} className="pm-ghost-btn">ปิดหน้าต่าง</button></div>\n                  </div>\n                </div>\n              </div>\n            </div>\n          )}\n          \n`
);

fs.writeFileSync(file, html);
console.log('Applied Review Confirmation UX V2 to index.html');
