from pathlib import Path

path = Path('index.html')
html = path.read_text(encoding='utf-8')

if 'data-pm-review-original-pdf' in html and 'data-pm-batch-source-files' in html:
    print('Review Confirmation UX V2 is already applied')
    raise SystemExit(0)


def replace_once(label, old, new):
    global html
    count = html.count(old)
    if count != 1:
        raise RuntimeError(f'[Review UX V2 patch] {label}: expected 1 anchor, found {count}')
    html = html.replace(old, new, 1)


def replace_all(label, old, new, expected):
    global html
    count = html.count(old)
    if count != expected:
        raise RuntimeError(f'[Review UX V2 patch] {label}: expected {expected} anchors, found {count}')
    html = html.replace(old, new)


def replace_section(label, start_marker, end_marker, replacement):
    global html
    start = html.find(start_marker)
    if start < 0:
        raise RuntimeError(f'[Review UX V2 patch] {label}: missing start marker')
    end = html.find(end_marker, start + len(start_marker))
    if end < 0:
        raise RuntimeError(f'[Review UX V2 patch] {label}: missing end marker')
    html = html[:start] + replacement + html[end:]


replace_once(
    'Review sidecar scripts',
    '''  <script src="./packmaster-keyword-assistant.js"></script>
  <script src="./packmaster-review-overrides.js"></script>''',
    '''  <script src="./packmaster-keyword-assistant.js"></script>
  <script src="./packmaster-review-keyword-suggestions.js"></script>
  <script src="./packmaster-review-overrides.js"></script>
  <script src="./packmaster-batch-source-files.js"></script>'''
)

replace_once(
    'Review sidecar APIs',
    '''      const keywordAssistantApi = window.PackMasterKeywordAssistant;
      const reviewOverridesApi = window.PackMasterReviewOverrides;
      const printScopeApi = window.PackMasterPrintScope;''',
    '''      const keywordAssistantApi = window.PackMasterKeywordAssistant;
      const reviewKeywordSuggestionsApi = window.PackMasterReviewKeywordSuggestions;
      const reviewOverridesApi = window.PackMasterReviewOverrides;
      const batchSourceFilesApi = window.PackMasterBatchSourceFiles;
      const printScopeApi = window.PackMasterPrintScope;'''
)

replace_once(
    'Batch source summary state',
    '''      const [batchViewFilter, setBatchViewFilter] = useState('ACTIVE');
      const [selectedArchivedBatchIds, setSelectedArchivedBatchIds] = useState([]);''',
    '''      const [batchViewFilter, setBatchViewFilter] = useState('ACTIVE');
      const [selectedArchivedBatchIds, setSelectedArchivedBatchIds] = useState([]);
      const [batchSourceSummaries, setBatchSourceSummaries] = useState({});'''
)

replace_once(
    'Batch source summary effect',
    '''      const archivedBatchCount = useMemo(() => batches.filter(batch => Boolean(getBatchArchivedAt(batch))).length, [batches]);

      useEffect(() => { localStorage.setItem('skuMappingRules', JSON.stringify(skuRules)); }, [skuRules]);''',
    '''      const archivedBatchCount = useMemo(() => batches.filter(batch => Boolean(getBatchArchivedAt(batch))).length, [batches]);

      useEffect(() => {
        let cancelled = false;
        const loadBatchSourceSummaries = async () => {
          if (!batchApi || !batchSourceFilesApi) {
            if (!cancelled) setBatchSourceSummaries({});
            return;
          }
          const entries = await Promise.all(visibleBatches.map(async (batch) => {
            try {
              const batchOrders = batch.id === activeBatchId
                ? orders
                : ((await batchApi.loadBatch(batch.id)).orders || []);
              return [batch.id, batchSourceFilesApi.summarizeBatchSourceFiles(batchOrders, 2)];
            } catch (error) {
              console.warn('Read Batch source filenames failed', batch.id, error);
              return [batch.id, { names: [], total: 0, hiddenCount: 0, label: 'ยังไม่มีไฟล์' }];
            }
          }));
          if (!cancelled) setBatchSourceSummaries(Object.fromEntries(entries));
        };
        loadBatchSourceSummaries();
        return () => { cancelled = true; };
      }, [visibleBatches, activeBatchId, orders, batchApi, batchSourceFilesApi]);

      useEffect(() => { localStorage.setItem('skuMappingRules', JSON.stringify(skuRules)); }, [skuRules]);'''
)

replace_once(
    'Empty parsed warning acknowledgement',
    '''        if (o.parsedItems.length === 0) {
            if (o.isContinuation) return { ...o, displayItems: [], originalQty: 0, qtyWarning: false };
            const failedItems = o.parserWarning ? ['⚠️ ตรวจสอบ SKU', '⚠️ ตรวจสอบ Qty'] : [];
            return { ...o, displayItems: failedItems, originalQty: 0, qtyWarning: Boolean(o.parserWarning) };
        }''',
    '''        if (o.parsedItems.length === 0) {
            if (o.isContinuation) return { ...o, displayItems: [], originalQty: 0, qtyWarning: false };
            const skuAcknowledged = reviewOverridesApi ? reviewOverridesApi.getReviewAcknowledgement(o, 'sku') : false;
            const qtyAcknowledged = reviewOverridesApi ? reviewOverridesApi.getReviewAcknowledgement(o, 'qty') : false;
            const failedItems = [];
            if (o.parserWarning && !skuAcknowledged) failedItems.push('⚠️ ตรวจสอบ SKU');
            if (o.parserWarning && !qtyAcknowledged) failedItems.push('⚠️ ตรวจสอบ Qty');
            return { ...o, displayItems: failedItems, originalQty: 0, qtyWarning: Boolean(o.parserWarning) };
        }'''
)

replace_once(
    'Effective Qty in mapping loop',
    '''        o.parsedItems.forEach(item => {
            const manualOverride = reviewOverridesApi ? reviewOverridesApi.getManualSkuOverride(o, item.text) : null;''',
    '''        o.parsedItems.forEach(item => {
            const effectiveQty = reviewOverridesApi ? reviewOverridesApi.getEffectiveItemQty(o, item) : item.qty;
            const manualOverride = reviewOverridesApi ? reviewOverridesApi.getManualSkuOverride(o, item.text) : null;'''
)

replace_all(
    'Mapped aggregation uses effective review Qty',
    '''                    qty: current.qty + item.qty,''',
    '''                    qty: current.qty + effectiveQty,''',
    2
)

replace_once(
    'Review warning rendering and effective total',
    '''        if (hasAmbiguous || o.parserWarning) finalDisplayItems.push('• ⚠️ ตรวจสอบ SKU');
        if (hasUnmatched) finalDisplayItems.push('• ยังไม่ตั้งชื่อ');

        const totalQty = o.parsedItems.reduce((sum, item) => sum + (parseInt(item.qty, 10) || 0), 0);
        const qtyWarning = hasQtyWarning(o.parsedItems, o.declaredTotalQty, o.parserWarning);
        if (qtyWarning) finalDisplayItems.push('• ⚠️ ตรวจสอบ Qty');''',
    '''        const skuAcknowledged = reviewOverridesApi ? reviewOverridesApi.getReviewAcknowledgement(o, 'sku') : false;
        const qtyAcknowledged = reviewOverridesApi ? reviewOverridesApi.getReviewAcknowledgement(o, 'qty') : false;
        if ((hasAmbiguous || o.parserWarning) && !skuAcknowledged) finalDisplayItems.push('• ⚠️ ตรวจสอบ SKU');
        if (hasUnmatched) finalDisplayItems.push('• ยังไม่ตั้งชื่อ');

        const totalQty = o.parsedItems.reduce((sum, item) => {
          const qty = reviewOverridesApi ? reviewOverridesApi.getEffectiveItemQty(o, item) : item.qty;
          return sum + (parseInt(qty, 10) || 0);
        }, 0);
        const qtyWarning = hasQtyWarning(o.parsedItems, o.declaredTotalQty, o.parserWarning);
        if (qtyWarning && !qtyAcknowledged) finalDisplayItems.push('• ⚠️ ตรวจสอบ Qty');'''
)

replace_once(
    'MappedOrders dependencies',
    '''        return { ...o, displayItems: finalDisplayItems, originalQty: totalQty, qtyWarning };
      }), [orders, getMatchResult]);''',
    '''        return { ...o, displayItems: finalDisplayItems, originalQty: totalQty, qtyWarning };
      }), [orders, getMatchResult, reviewOverridesApi]);'''
)

replace_section(
    'Review flags use exception layer',
    '''      const getReviewFlags = useCallback((order) => {''',
    '''      const reviewSummary = useMemo(() => {''',
    '''      const getReviewFlags = useCallback((order) => {
        if (exceptionApi) {
          const flags = exceptionApi.getExceptionFlags(order);
          return {
            hasSkuReview: flags.reviewSku,
            hasQtyReview: flags.reviewQty,
            hasUnmapped: flags.unmapped,
            ready: flags.ready
          };
        }
        const outputText = (order.displayItems || []).join(' ');
        const hasSkuReview = outputText.includes('ตรวจสอบ SKU');
        const hasQtyReview = Boolean(order.qtyWarning || outputText.includes('ตรวจสอบ Qty'));
        const hasUnmapped = outputText.includes('ยังไม่ตั้งชื่อ');
        return { hasSkuReview, hasQtyReview, hasUnmapped, ready: !hasSkuReview && !hasQtyReview && !hasUnmapped };
      }, [exceptionApi]);

'''
)

replace_section(
    'Review exception handlers',
    '''      const handleFixSkuException = (row) => {''',
    '''      const handleApplyQuickOrderName = () => {''',
    '''      const getReviewSourceText = (row) => {
        if (!row || !row.order) return '';
        const types = row.types || [];
        let seed = '';
        if (pilotSafetyApi && types.some(type => type === 'REVIEW_SKU' || type === 'UNMAPPED')) {
          try { seed = pilotSafetyApi.getSkuFixSeed(row, getMatchResult) || ''; }
          catch (error) { console.warn('Pilot Safety seed unavailable', error); }
        }
        if (seed) return seed;
        const parsedItems = Array.isArray(row.order.parsedItems) ? row.order.parsedItems : [];
        const unresolved = parsedItems.find(item => {
          try { return getMatchResult(item && item.text).status !== 'matched'; }
          catch (error) { return true; }
        });
        return String((unresolved || parsedItems[0])?.text || '').trim();
      };

      const getReviewKeywordSuggestions = (seed) => {
        if (!seed) return [];
        const batchItemTexts = orders.flatMap(order => (Array.isArray(order && order.parsedItems) ? order.parsedItems : []))
          .map(item => String(item && item.text || '').trim())
          .filter(Boolean);
        let suggestions = [];
        if (reviewKeywordSuggestionsApi && typeof reviewKeywordSuggestionsApi.generateReviewKeywordSuggestions === 'function') {
          try {
            suggestions = reviewKeywordSuggestionsApi.generateReviewKeywordSuggestions({
              sourceText: seed,
              existingRules: skuRules,
              batchItemTexts,
              maxSuggestions: 3,
              keywordAssistant: keywordAssistantApi,
              matchRule: matchSkuRule,
              matchNormalizer: normalizeMatchText
            });
          } catch (suggestionError) {
            console.warn('Review Keyword suggestions unavailable', suggestionError);
            suggestions = [];
          }
        } else if (keywordAssistantApi && typeof keywordAssistantApi.generateKeywordSuggestions === 'function') {
          suggestions = keywordAssistantApi.generateKeywordSuggestions({
            sourceText: seed,
            existingRules: skuRules,
            batchItemTexts,
            maxSuggestions: 3,
            safeOnly: true,
            matchRule: matchSkuRule,
            matchNormalizer: normalizeMatchText
          });
        }
        if (suggestions.length === 0 && reviewKeywordSuggestionsApi && typeof reviewKeywordSuggestionsApi.sanitizeSourceIdentity === 'function') {
          const fallback = reviewKeywordSuggestionsApi.sanitizeSourceIdentity(seed);
          if (fallback && (!keywordAssistantApi || !keywordAssistantApi.isGenericCandidate(fallback))) {
            suggestions = [{ value: fallback, confidence: 'review', reason: 'full-source-review', specificity: 'current-context-max', autoApply: false, autoSave: false }];
          }
        }
        return suggestions;
      };

      const handleFixSkuException = (row) => {
        if (!row || !row.order) return;
        const types = row.types || [];
        if (!types.some(type => type === 'REVIEW_SKU' || type === 'UNMAPPED')) {
          openExceptionInTable(row);
          return;
        }
        const seed = getReviewSourceText(row);
        if (!seed) {
          openExceptionInTable(row);
          showToast('ไม่พบข้อความสินค้าใน Order นี้ — กรุณาตรวจใบจริง', 'error');
          return;
        }
        const suggestions = getReviewKeywordSuggestions(seed);
        setQuickMapState({ open: true, row, sourceText: seed, keyword: '', shortName: '', suggestions });
      };

      const handleReviewException = (row) => {
        if (!row || !row.order) return;
        const types = row.types || [];
        if (types.some(type => type === 'REVIEW_SKU' || type === 'UNMAPPED')) {
          handleFixSkuException(row);
          return;
        }
        const seed = getReviewSourceText(row);
        setQuickMapState({ open: true, row, sourceText: seed, keyword: '', shortName: '', suggestions: [] });
      };

      const handleSetReviewConfirmation = (type, confirmed) => {
        const targetOrderId = quickMapState.row?.order?.id;
        if (!targetOrderId || !reviewOverridesApi) return;
        resetActiveBatchCompletion();
        setOrders(prev => prev.map(order => {
          if (order.id !== targetOrderId) return order;
          return confirmed
            ? reviewOverridesApi.confirmReview(order, type)
            : reviewOverridesApi.clearReviewConfirmation(order, type);
        }));
        setQuickMapState(prev => {
          if (!prev.row || !prev.row.order) return prev;
          const updatedOrder = confirmed
            ? reviewOverridesApi.confirmReview(prev.row.order, type)
            : reviewOverridesApi.clearReviewConfirmation(prev.row.order, type);
          return { ...prev, row: { ...prev.row, order: updatedOrder } };
        });
        const label = type === 'qty' ? 'Qty' : 'SKU';
        showToast((confirmed ? 'ยืนยันว่า ' : 'ยกเลิกการยืนยัน ') + label + (confirmed ? ' ถูกต้องแล้ว' : ' แล้ว'), 'success');
      };

      const handleSaveQtyReviewCorrections = () => {
        const targetOrderId = quickMapState.row?.order?.id;
        const items = Array.isArray(quickMapState.row?.order?.parsedItems) ? quickMapState.row.order.parsedItems : [];
        if (!targetOrderId || !reviewOverridesApi || items.length === 0) return;
        const drafts = quickMapState.qtyDrafts || {};
        const corrections = items.map(item => {
          const fallbackQty = reviewOverridesApi.getEffectiveItemQty(quickMapState.row.order, item);
          const rawDraft = Object.prototype.hasOwnProperty.call(drafts, item.text) ? drafts[item.text] : fallbackQty;
          return { item, qty: Number(rawDraft) };
        });
        if (corrections.some(entry => !Number.isInteger(entry.qty) || entry.qty < 1)) {
          showToast('Qty ที่แก้ต้องเป็นจำนวนเต็มตั้งแต่ 1 ขึ้นไป', 'error');
          return;
        }
        resetActiveBatchCompletion();
        setOrders(prev => prev.map(order => {
          if (order.id !== targetOrderId) return order;
          return corrections.reduce((next, entry) => reviewOverridesApi.upsertQtyOverride(next, entry.item.text, entry.qty), order);
        }));
        showToast('บันทึก Qty ที่แก้แล้ว — ตรวจใบจริงและติ๊ก “Qty ถูกต้อง” เพื่อปิด Exception', 'success');
      };

'''
)

replace_once(
    'Manual SKU correction acknowledges explicit fix',
    '''        setOrders(prev => prev.map(order => order.id === targetOrderId
          ? reviewOverridesApi.upsertManualSkuOverride(order, sourceText, shortName)
          : order
        ));''',
    '''        setOrders(prev => prev.map(order => {
          if (order.id !== targetOrderId) return order;
          let next = reviewOverridesApi.upsertManualSkuOverride(order, sourceText, shortName);
          if ((quickMapState.row?.types || []).includes('REVIEW_SKU')) next = reviewOverridesApi.confirmReview(next, 'sku');
          return next;
        }));'''
)

replace_once(
    'Batch card source filenames',
    '''                                  <p className="text-[11px] font-semibold text-slate-400 mt-1">อัปเดต {formatBatchUpdated(batch.updatedAt)}</p>''',
    '''                                  <p className="text-[11px] font-semibold text-slate-400 mt-1">อัปเดต {formatBatchUpdated(batch.updatedAt)}</p>
                                  <div data-pm-batch-source-files className="mt-2 flex items-start gap-1.5 text-[10px] font-bold text-slate-500" title={batchSourceSummaries[batch.id]?.label || 'กำลังอ่านไฟล์...'}><PMIcon name="file" className="w-3.5 h-3.5 mt-0.5 shrink-0 text-blue-500"/><span className="truncate">ไฟล์: {batchSourceSummaries[batch.id]?.label || 'กำลังอ่านไฟล์...'}</span></div>'''
)

replace_once(
    'Current exception inspect action',
    '''<button onClick={()=>openExceptionInTable(currentException)} className="pm-secondary-btn">เปิดในรายการ</button>{(currentException.types||[]).some(type=>type==='REVIEW_SKU'||type==='UNMAPPED')&&<button onClick={()=>handleFixSkuException(currentException)} className="pm-primary-btn">ตั้งชื่อ SKU</button>}''',
    '''<button onClick={()=>openExceptionInTable(currentException)} className="pm-secondary-btn">เปิดในรายการ</button><button data-pm-action="review-exception" onClick={()=>handleReviewException(currentException)} className="pm-primary-btn">ตรวจรายการ</button>'''
)

replace_all(
    'Review row inspect action',
    '''row&&(flags.hasSkuReview||flags.hasUnmapped)&&<button onClick={()=>handleFixSkuException(row)} className="pm-secondary-btn !py-2 !px-3">ตั้งชื่อ SKU</button>''',
    '''row&&<button data-pm-action="review-exception" onClick={()=>handleReviewException(row)} className="pm-secondary-btn !py-2 !px-3">ตรวจรายการ</button>''',
    1
)

replace_all(
    'Review card inspect action',
    '''row&&(flags.hasSkuReview||flags.hasUnmapped)&&<button onClick={()=>handleFixSkuException(row)} className="pm-secondary-btn w-full justify-center mt-3">ตั้งชื่อ SKU</button>''',
    '''row&&<button data-pm-action="review-exception" onClick={()=>handleReviewException(row)} className="pm-secondary-btn w-full justify-center mt-3">ตรวจรายการ</button>''',
    1
)

replace_section(
    'Side-by-side Review modal',
    '''          {quickMapState.open && (''',
    '''          {exportStatus.active && (''',
    '''          {quickMapState.open && (
            <div data-pm-quick-mapping className="pm-quick-map-backdrop no-print" role="dialog" aria-modal="true" aria-label="ตรวจและแก้ Exception">
              <div className="pm-quick-map-panel !max-w-6xl !w-[min(1180px,96vw)]">
                <div className="flex items-start justify-between gap-3">
                  <div><div className="pm-section-kicker">Exception Review</div><h3 className="text-lg font-black text-slate-900 mt-1">ตรวจใบจริง แล้วตัดสินใจเฉพาะ Order นี้</h3><p className="text-xs font-semibold text-slate-400 mt-1">การยืนยัน/แก้เฉพาะ Order จะไม่สร้าง Shared Mapping อัตโนมัติ</p></div>
                  <button onClick={()=>setQuickMapState({ open:false, row:null, keyword:'', shortName:'' })} className="pm-icon-btn" title="ปิด" aria-label="ปิด">×</button>
                </div>
                <div className="mt-4 grid lg:grid-cols-[minmax(0,1.05fr)_minmax(380px,.95fr)] gap-4">
                  <div data-pm-review-original-pdf className="min-w-0 rounded-2xl border border-slate-200 bg-slate-100 overflow-hidden">
                    <div className="px-4 py-3 bg-white border-b border-slate-200 flex items-center justify-between gap-3"><div><div className="text-[9px] font-black uppercase tracking-[.12em] text-slate-400">ใบต้นฉบับ</div><div className="text-xs font-black text-slate-800 mt-0.5">{quickMapState.row?.order?.sourceFileName || 'PDF ต้นทาง'}{quickMapState.row?.order?.sourcePage ? ` • หน้า ${quickMapState.row.order.sourcePage}` : ''}</div></div><span className="text-[10px] font-bold text-blue-600">ภาพก่อน PackMaster เขียนทับ</span></div>
                    {quickMapState.row?.order?.pdfImage ? <div className="max-h-[72vh] overflow-auto p-3"><img src={quickMapState.row.order.pdfImage} alt="ใบออเดอร์ต้นฉบับ" className="w-full h-auto rounded-xl shadow-sm bg-white" /></div> : <div className="min-h-[320px] flex items-center justify-center p-6 text-center text-xs font-bold text-slate-400">ไม่มีภาพ PDF ต้นฉบับใน Order นี้</div>}
                  </div>
                  <div className="min-w-0 max-h-[76vh] overflow-y-auto pr-1">
                    <div className="rounded-xl border border-blue-100 bg-blue-50/55 p-3"><div className="text-[9px] uppercase tracking-[.12em] font-black text-blue-500">Order</div><div className="mt-1 font-mono text-xs font-black text-blue-950 break-all">{quickMapState.row?.order?.tracking || quickMapState.row?.order?.orderId || 'Exception'}</div><div data-pm-source-reference className="mt-2 text-[10px] font-bold text-blue-700/70">Source: {quickMapState.row?.order?.sourceFileName || '-'}{quickMapState.row?.order?.sourcePage ? ` • หน้า ${quickMapState.row.order.sourcePage}` : ''}</div></div>
                    {quickMapState.sourceText && <div className="mt-3 rounded-xl border border-slate-200 bg-white p-3"><div className="text-[9px] font-black uppercase tracking-[.1em] text-slate-400">ข้อความสินค้าจากใบจริง</div><div className="mt-1 text-xs font-bold leading-5 text-slate-700 break-words">{quickMapState.sourceText}</div></div>}

                    {(quickMapState.row?.types || []).some(type => type === 'REVIEW_SKU' || type === 'UNMAPPED') && <>
                      <div className="mt-4"><label className="pm-label">Keyword ที่ใช้จับคู่ (เฉพาะตอนบันทึกเป็น Mapping)</label><input value={quickMapState.keyword} onChange={(e)=>setQuickMapState(prev=>({ ...prev, keyword:e.target.value }))} className="pm-input" /></div>
                      <div data-pm-keyword-suggestions className="mt-3">
                        <div className="flex items-center justify-between gap-2"><label className="pm-label mb-0">Keyword แนะนำที่ผ่าน Safety Check</label><span className="text-[10px] font-semibold text-slate-400">ไม่ Auto-fill • ไม่ Auto-save</span></div>
                        {(quickMapState.suggestions || []).length > 0 ? <div className="mt-2 grid gap-2">{(quickMapState.suggestions || []).map((suggestion,index)=>{const selected=quickMapState.keyword===suggestion.value;return <button key={`${suggestion.value}-${index}`} type="button" data-pm-keyword-suggestion onClick={()=>setQuickMapState(prev => ({ ...prev, keyword: suggestion.value }))} className={`w-full rounded-xl border px-3 py-2.5 text-left transition ${selected ? 'border-blue-400 bg-blue-50 ring-2 ring-blue-100' : 'border-slate-200 bg-white hover:border-blue-200 hover:bg-blue-50/40'}`}><div className="flex items-start justify-between gap-3"><span className="text-xs font-black text-slate-800 break-words">{suggestion.value}</span><span className={`shrink-0 rounded-full border px-2 py-0.5 text-[9px] font-black ${suggestion.confidence === 'recommended' ? 'bg-emerald-50 border-emerald-200 text-emerald-700' : 'bg-amber-50 border-amber-200 text-amber-700'}`}>{suggestion.confidence === 'recommended' ? 'ปลอดภัย' : 'ตรวจอีกครั้ง'}</span></div><div className="mt-1 text-[10px] font-semibold text-slate-500">{suggestion.confidence === 'recommended' ? 'ผ่าน Smart Matcher กับคลังและ Batch ปัจจุบัน' : 'เฉพาะที่สุดจากใบจริง • ระบบจะเช็ก Safety อีกครั้งก่อนบันทึก'}</div></button>})}</div> : <div className="mt-2 rounded-xl border border-slate-200 bg-slate-50 p-3 text-xs font-semibold text-slate-500">ยังตั้งชื่อเฉพาะ Order นี้ได้ — กรุณาอ้างอิงใบจริงด้านซ้ายและใช้ Keyword ที่เฉพาะเจาะจง</div>}
                      </div>
                      <div className="mt-3"><label className="pm-label">ชื่อภายใน / ผลลัพธ์ที่จะพิมพ์</label><input autoFocus list="pm-internal-name-options" value={quickMapState.shortName} onChange={(e)=>setQuickMapState(prev=>({ ...prev, shortName:e.target.value }))} placeholder="ค้นหาจากคลัง หรือกรอกชื่อใหม่" className="pm-input text-base font-black" /><datalist id="pm-internal-name-options">{internalNameChoices.map(name=><option key={name} value={name} />)}</datalist></div>
                      <div className="mt-3 grid sm:grid-cols-2 gap-2"><button onClick={handleSaveQuickMapping} disabled={!quickMapState.keyword.trim() || !quickMapState.shortName.trim()} className="pm-secondary-btn justify-center">บันทึกเป็น Mapping และใช้</button><button onClick={handleApplyQuickOrderName} disabled={!quickMapState.shortName.trim()} className="pm-primary-btn justify-center">ใช้กับ Order นี้</button></div>
                    </>}

                    {(quickMapState.row?.types || []).includes('REVIEW_SKU') && <label data-pm-review-confirm-sku className="mt-4 flex items-start gap-3 rounded-xl border border-emerald-200 bg-emerald-50 p-3 cursor-pointer"><input type="checkbox" className="mt-0.5 w-4 h-4" checked={reviewOverridesApi ? reviewOverridesApi.getReviewAcknowledgement(quickMapState.row?.order,'sku') : false} onChange={(e)=>handleSetReviewConfirmation('sku',e.target.checked)} /><span><span className="block text-xs font-black text-emerald-900">SKU ถูกต้อง</span><span className="block text-[10px] font-semibold text-emerald-700/75 mt-0.5">ติ๊กเมื่อเทียบกับใบจริงแล้ว ชื่อ/การจับคู่ถูกต้อง</span></span></label>}

                    {(quickMapState.row?.types || []).includes('REVIEW_QTY') && <div className="mt-4 rounded-xl border border-red-200 bg-red-50/50 p-3"><div className="flex items-center justify-between gap-2"><div><div className="text-xs font-black text-red-900">ตรวจสอบ Qty</div><div className="text-[10px] font-semibold text-red-700/70 mt-0.5">แก้เฉพาะ Review layer • Qty ที่ Parser อ่านเดิมยังถูกเก็บไว้</div></div></div><div className="mt-3 space-y-2">{(quickMapState.row?.order?.parsedItems || []).map((item,index)=>{const hasDraft=Object.prototype.hasOwnProperty.call(quickMapState.qtyDrafts||{},item.text);const effectiveQty=reviewOverridesApi?reviewOverridesApi.getEffectiveItemQty(quickMapState.row.order,item):item.qty;const value=hasDraft?quickMapState.qtyDrafts[item.text]:String(effectiveQty);return <div key={`${item.text}-${index}`} className="rounded-lg bg-white border border-red-100 p-2.5"><div className="text-[10px] font-bold text-slate-600 break-words mb-2">{item.text || `รายการ ${index+1}`}</div><div className="flex items-center gap-2"><span className="text-[10px] font-black text-slate-400">Qty</span><input data-pm-review-qty-override type="number" min="1" step="1" value={value} onChange={(e)=>setQuickMapState(prev=>({ ...prev, qtyDrafts:{ ...(prev.qtyDrafts||{}), [item.text]:e.target.value } }))} className="pm-input !py-2 w-24 text-center font-black" /><span className="text-[10px] font-semibold text-slate-400">Parser เดิม: {item.qty}</span></div></div>})}</div><button onClick={handleSaveQtyReviewCorrections} className="pm-secondary-btn w-full justify-center mt-3">บันทึก Qty ที่แก้</button><label data-pm-review-confirm-qty className="mt-3 flex items-start gap-3 rounded-xl border border-emerald-200 bg-emerald-50 p-3 cursor-pointer"><input type="checkbox" className="mt-0.5 w-4 h-4" checked={reviewOverridesApi ? reviewOverridesApi.getReviewAcknowledgement(quickMapState.row?.order,'qty') : false} onChange={(e)=>handleSetReviewConfirmation('qty',e.target.checked)} /><span><span className="block text-xs font-black text-emerald-900">Qty ถูกต้อง</span><span className="block text-[10px] font-semibold text-emerald-700/75 mt-0.5">ติ๊กหลังตรวจใบจริง หรือหลังแก้ Qty ด้านบนแล้ว</span></span></label></div>}

                    <div className="mt-5 flex flex-col sm:flex-row sm:justify-between gap-2"><button onClick={handleOpenQuickMapInLibrary} className="pm-secondary-btn">เปิดคลังคำศัพท์</button><button onClick={()=>setQuickMapState({ open:false, row:null, keyword:'', shortName:'' })} className="pm-ghost-btn">ปิดหน้าต่าง</button></div>
                  </div>
                </div>
              </div>
            </div>
          )}
          
'''
)

path.write_text(html, encoding='utf-8')
print('Applied Review Confirmation UX V2 to index.html')
