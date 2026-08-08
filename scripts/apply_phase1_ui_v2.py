from pathlib import Path

INDEX = Path('index.html')
text = INDEX.read_text(encoding='utf-8')

MARKER = '// Phase 1 UI/UX V2 — presentation-only controls'
if MARKER in text:
    print('Phase 1 UI/UX V2 already applied; no changes needed.')
    raise SystemExit(0)


def replace_once(source: str, old: str, new: str, label: str) -> str:
    count = source.count(old)
    if count != 1:
        raise RuntimeError(f'{label}: expected exactly 1 match, found {count}')
    return source.replace(old, new, 1)

# 1) Presentation-only UI state. Core parser/matcher/qty state remains untouched.
old = """      const [testQty, setTestQty] = useState('1');
      const [toast, setToast] = useState({ show: false, message: '', type: 'success' });

      const [thermalMode, setThermalMode] = useState(() => {"""
new = """      const [testQty, setTestQty] = useState('1');
      const [toast, setToast] = useState({ show: false, message: '', type: 'success' });

      // Phase 1 UI/UX V2 — presentation-only controls
      const [reviewSearch, setReviewSearch] = useState('');
      const [reviewPlatform, setReviewPlatform] = useState('ALL');
      const [reviewStatus, setReviewStatus] = useState('ALL');
      const [skuSearch, setSkuSearch] = useState('');
      const [skuFilter, setSkuFilter] = useState('ALL');

      const [thermalMode, setThermalMode] = useState(() => {"""
text = replace_once(text, old, new, 'add UI state')

# 2) Derive review flags, summary and visible-only filtered orders from existing MappedOrders.
old = """        return { ...o, displayItems: finalDisplayItems, originalQty: totalQty, qtyWarning };
      }), [orders, getMatchResult]);

      const handleExportPDF = async () => {"""
new = """        return { ...o, displayItems: finalDisplayItems, originalQty: totalQty, qtyWarning };
      }), [orders, getMatchResult]);

      const getReviewFlags = useCallback((order) => {
        const outputText = (order.displayItems || []).join(' ');
        const hasSkuReview = outputText.includes('ตรวจสอบ SKU');
        const hasQtyReview = Boolean(order.qtyWarning || outputText.includes('ตรวจสอบ Qty'));
        const hasUnmapped = outputText.includes('ยังไม่ตั้งชื่อ');
        return {
          hasSkuReview,
          hasQtyReview,
          hasUnmapped,
          ready: !hasSkuReview && !hasQtyReview && !hasUnmapped
        };
      }, []);

      const reviewSummary = useMemo(() => {
        return MappedOrders.reduce((summary, order) => {
          const flags = getReviewFlags(order);
          summary.total += 1;
          if (flags.ready) summary.ready += 1;
          if (flags.hasSkuReview) summary.reviewSku += 1;
          if (flags.hasQtyReview) summary.reviewQty += 1;
          if (flags.hasUnmapped) summary.unmapped += 1;
          return summary;
        }, { total: 0, ready: 0, reviewSku: 0, reviewQty: 0, unmapped: 0 });
      }, [MappedOrders, getReviewFlags]);

      const FilteredOrders = useMemo(() => {
        const query = reviewSearch.trim().toLowerCase();
        return MappedOrders.filter(order => {
          if (reviewPlatform !== 'ALL' && order.platform !== reviewPlatform) return false;

          const flags = getReviewFlags(order);
          if (reviewStatus === 'READY' && !flags.ready) return false;
          if (reviewStatus === 'REVIEW_SKU' && !flags.hasSkuReview) return false;
          if (reviewStatus === 'REVIEW_QTY' && !flags.hasQtyReview) return false;
          if (reviewStatus === 'UNMAPPED' && !flags.hasUnmapped) return false;

          if (!query) return true;
          const searchArea = [
            order.tracking,
            order.orderId,
            order.platform,
            ...(order.displayItems || []),
            ...(order.parsedItems || []).map(item => item.text)
          ].filter(Boolean).join(' ').toLowerCase();
          return searchArea.includes(query);
        });
      }, [MappedOrders, reviewSearch, reviewPlatform, reviewStatus, getReviewFlags]);

      const handleExportPDF = async () => {"""
text = replace_once(text, old, new, 'add review derived data')

# 3) SKU Library search/filter derives from skuRules only; no data-shape mutation.
old = """      }, [testInput, testQty, getMatchResult]);

      return ("""
new = """      }, [testInput, testQty, getMatchResult]);

      const skuFilterOptions = [
        { id: 'ALL', label: 'ทั้งหมด' },
        { id: 'HOYA', label: 'HOYA' },
        { id: 'HAKU', label: 'HAKU' },
        { id: 'BUNDLE', label: 'Bundle' },
        { id: 'COOLING', label: 'Cooling' },
        { id: 'VALUE', label: 'Value Pack' }
      ];

      const filteredSkuRules = useMemo(() => {
        const query = skuSearch.trim().toLowerCase();
        return skuRules.filter(rule => {
          const searchArea = `${rule.keyword || ''} ${rule.shortName || ''}`.toLowerCase();
          if (query && !searchArea.includes(query)) return false;
          if (skuFilter === 'HOYA' && !searchArea.includes('hoya')) return false;
          if (skuFilter === 'HAKU' && !searchArea.includes('haku')) return false;
          if (skuFilter === 'BUNDLE' && !/(แถม|free|\\d+\\s*\\+\\s*\\d+)/i.test(searchArea)) return false;
          if (skuFilter === 'COOLING' && !/(cooling|คูล|เย็น)/i.test(searchArea)) return false;
          if (skuFilter === 'VALUE' && !/(value\\s*pack|valuepack|แวลู|แวล)/i.test(searchArea)) return false;
          return true;
        });
      }, [skuRules, skuSearch, skuFilter]);

      return ("""
text = replace_once(text, old, new, 'add SKU derived filter')

# 4) App-shell labels: clearer operational navigation, same tab behavior.
text = replace_once(text, '<span className="text-[15px]">อัปโหลดคำสั่งซื้อ</span>', '<span className="text-[15px]">งานแพ็ก</span>', 'rename upload nav')
text = replace_once(text, '<span className="text-[15px]">ตั้งค่ารหัสสินค้า</span>', '<span className="text-[15px]">คลังคำศัพท์</span>', 'rename settings nav')
text = replace_once(text, '<span className="text-[15px]">พรีวิว & สั่งพิมพ์</span>', '<span className="text-[15px]">รีวิว & พิมพ์</span>', 'rename preview nav')
text = replace_once(text, '>Navy Minimal</span>', '>Local-first</span>', 'update shell badge')

# 5) SKU Library toolbar and filtered rendering.
old = """                    <div className="max-h-[400px] overflow-y-auto">
                        <table className="w-full text-left">"""
new = """                    <div className="px-8 py-5 border-b-2 border-blue-50 bg-slate-50/60">
                      <div className="flex flex-col lg:flex-row gap-4 lg:items-center lg:justify-between">
                        <div className="relative flex-1 max-w-xl">
                          <span className="absolute left-4 top-1/2 -translate-y-1/2 text-blue-950/30">🔎</span>
                          <input type="search" value={skuSearch} onChange={(e) => setSkuSearch(e.target.value)} placeholder="ค้นหา Keyword หรือ Base SKU..." className="w-full border-2 border-blue-100 bg-white pl-11 pr-4 py-3 rounded-2xl outline-none focus:ring-4 focus:ring-blue-100 focus:border-blue-900 text-sm font-bold text-blue-950" />
                        </div>
                        <div className="flex flex-wrap gap-2">
                          {skuFilterOptions.map(option => (
                            <button key={option.id} type="button" onClick={() => setSkuFilter(option.id)} className={`px-4 py-2 rounded-xl text-xs font-black border transition-all ${skuFilter === option.id ? 'bg-blue-950 text-white border-blue-950 shadow-sm' : 'bg-white text-blue-950/60 border-blue-100 hover:border-blue-200 hover:text-blue-900'}`}>{option.label}</button>
                          ))}
                        </div>
                      </div>
                      <div className="mt-3 text-xs font-bold text-blue-950/40">แสดง {filteredSkuRules.length} จาก {skuRules.length} กฎ</div>
                    </div>
                    <div className="max-h-[460px] overflow-y-auto">
                        <table className="w-full text-left">"""
text = replace_once(text, old, new, 'add SKU toolbar')
text = replace_once(text, '{skuRules.map((rule, idx) => (', '{filteredSkuRules.map((rule, idx) => (', 'render filtered SKU rules')
old = """                        {skuRules.length === 0 && <tr><td colSpan="4" className="p-24 text-center text-blue-950/30 text-sm font-bold">ไม่มีข้อมูลคลังคำศัพท์</td></tr>}"""
new = """                        {filteredSkuRules.length === 0 && <tr><td colSpan="4" className="p-20 text-center text-blue-950/30 text-sm font-bold">{skuRules.length === 0 ? 'ไม่มีข้อมูลคลังคำศัพท์' : 'ไม่พบกฎที่ตรงกับการค้นหา / ตัวกรอง'}</td></tr>}"""
text = replace_once(text, old, new, 'SKU empty state')

# 6) Review & Print: summary cards + search/platform/status filters.
old = """                  </div>

                  {orders.length === 0 ? (
                    <div className="bg-white p-32 rounded-[3rem] text-center border-2 border-blue-50 flex flex-col items-center justify-center shadow-sm">"""
new = """                  </div>

                  {orders.length > 0 && (
                    <>
                      <div className="grid grid-cols-2 xl:grid-cols-5 gap-4 mb-5">
                        <button onClick={() => setReviewStatus('ALL')} className={`text-left p-5 rounded-2xl border-2 transition-all ${reviewStatus === 'ALL' ? 'bg-blue-950 text-white border-blue-950 shadow-lg shadow-blue-900/10' : 'bg-white border-blue-50 hover:border-blue-100'}`}>
                          <div className={`text-xs font-black ${reviewStatus === 'ALL' ? 'text-blue-100' : 'text-blue-950/40'}`}>ทั้งหมด</div><div className="text-3xl font-black mt-1">{reviewSummary.total}</div>
                        </button>
                        <button onClick={() => setReviewStatus('READY')} className={`text-left p-5 rounded-2xl border-2 transition-all ${reviewStatus === 'READY' ? 'bg-green-600 text-white border-green-600 shadow-lg shadow-green-600/10' : 'bg-white border-green-100 hover:border-green-200'}`}>
                          <div className={`text-xs font-black ${reviewStatus === 'READY' ? 'text-green-50' : 'text-green-700/60'}`}>พร้อมพิมพ์</div><div className="text-3xl font-black mt-1">{reviewSummary.ready}</div>
                        </button>
                        <button onClick={() => setReviewStatus('REVIEW_SKU')} className={`text-left p-5 rounded-2xl border-2 transition-all ${reviewStatus === 'REVIEW_SKU' ? 'bg-amber-500 text-white border-amber-500 shadow-lg shadow-amber-500/10' : 'bg-white border-amber-100 hover:border-amber-200'}`}>
                          <div className={`text-xs font-black ${reviewStatus === 'REVIEW_SKU' ? 'text-amber-50' : 'text-amber-700/60'}`}>ตรวจสอบ SKU</div><div className="text-3xl font-black mt-1">{reviewSummary.reviewSku}</div>
                        </button>
                        <button onClick={() => setReviewStatus('REVIEW_QTY')} className={`text-left p-5 rounded-2xl border-2 transition-all ${reviewStatus === 'REVIEW_QTY' ? 'bg-red-500 text-white border-red-500 shadow-lg shadow-red-500/10' : 'bg-white border-red-100 hover:border-red-200'}`}>
                          <div className={`text-xs font-black ${reviewStatus === 'REVIEW_QTY' ? 'text-red-50' : 'text-red-700/60'}`}>ตรวจสอบ Qty</div><div className="text-3xl font-black mt-1">{reviewSummary.reviewQty}</div>
                        </button>
                        <button onClick={() => setReviewStatus('UNMAPPED')} className={`text-left p-5 rounded-2xl border-2 transition-all col-span-2 xl:col-span-1 ${reviewStatus === 'UNMAPPED' ? 'bg-slate-600 text-white border-slate-600 shadow-lg shadow-slate-600/10' : 'bg-white border-slate-200 hover:border-slate-300'}`}>
                          <div className={`text-xs font-black ${reviewStatus === 'UNMAPPED' ? 'text-slate-100' : 'text-slate-500'}`}>ยังไม่ตั้งชื่อ</div><div className="text-3xl font-black mt-1">{reviewSummary.unmapped}</div>
                        </button>
                      </div>

                      <div className="bg-white border-2 border-blue-50 rounded-2xl p-4 mb-8 shadow-sm">
                        <div className="flex flex-col xl:flex-row gap-3 xl:items-center">
                          <div className="relative flex-1">
                            <span className="absolute left-4 top-1/2 -translate-y-1/2 text-blue-950/30">🔎</span>
                            <input type="search" value={reviewSearch} onChange={(e) => setReviewSearch(e.target.value)} placeholder="ค้นหา Tracking, Order, SKU หรือชื่อภายใน..." className="w-full border-2 border-blue-100 bg-slate-50/50 pl-11 pr-4 py-3 rounded-xl outline-none focus:ring-4 focus:ring-blue-100 focus:border-blue-900 text-sm font-bold text-blue-950" />
                          </div>
                          <select value={reviewPlatform} onChange={(e) => setReviewPlatform(e.target.value)} className="border-2 border-blue-100 bg-white px-4 py-3 rounded-xl text-sm font-black text-blue-950 outline-none focus:border-blue-900">
                            <option value="ALL">ทุกแพลตฟอร์ม</option><option value="SHOPEE">Shopee</option><option value="TIKTOK">TikTok</option>
                          </select>
                          <select value={reviewStatus} onChange={(e) => setReviewStatus(e.target.value)} className="border-2 border-blue-100 bg-white px-4 py-3 rounded-xl text-sm font-black text-blue-950 outline-none focus:border-blue-900">
                            <option value="ALL">ทุกสถานะ</option><option value="READY">พร้อมพิมพ์</option><option value="REVIEW_SKU">ตรวจสอบ SKU</option><option value="REVIEW_QTY">ตรวจสอบ Qty</option><option value="UNMAPPED">ยังไม่ตั้งชื่อ</option>
                          </select>
                          {(reviewSearch || reviewPlatform !== 'ALL' || reviewStatus !== 'ALL') && <button onClick={() => { setReviewSearch(''); setReviewPlatform('ALL'); setReviewStatus('ALL'); }} className="px-4 py-3 rounded-xl text-sm font-black text-blue-700 bg-blue-50 hover:bg-blue-100">ล้างตัวกรอง</button>}
                        </div>
                        <div className="mt-3 flex items-center justify-between text-xs font-bold text-blue-950/40"><span>แสดง {FilteredOrders.length} จาก {MappedOrders.length} รายการ</span><span>Filter ใช้สำหรับรีวิวเท่านั้น • Print / Save PDF ยังใช้ข้อมูลเต็มชุด</span></div>
                      </div>
                    </>
                  )}

                  {orders.length === 0 ? (
                    <div className="bg-white p-32 rounded-[3rem] text-center border-2 border-blue-50 flex flex-col items-center justify-center shadow-sm">"""
text = replace_once(text, old, new, 'add review summary and filters')

# 7) Clear filtered-result empty state before table/grid mode.
old = """                    </div>
                  ) : previewMode === 'table' ? (
                    <div className="bg-white rounded-[2.5rem] shadow-xl shadow-blue-900/5 overflow-hidden no-print border-2 border-blue-50">"""
new = """                    </div>
                  ) : FilteredOrders.length === 0 ? (
                    <div className="bg-white p-20 rounded-[2.5rem] text-center border-2 border-blue-50 shadow-sm">
                      <div className="text-4xl mb-4">🔎</div><h3 className="font-black text-xl text-blue-950/50">ไม่พบรายการที่ตรงกับตัวกรอง</h3><p className="text-blue-950/30 text-sm mt-2 font-bold">ลองล้างคำค้นหา หรือเลือกสถานะ / แพลตฟอร์มอื่น</p>
                    </div>
                  ) : previewMode === 'table' ? (
                    <div className="bg-white rounded-[2.5rem] shadow-xl shadow-blue-900/5 overflow-hidden no-print border-2 border-blue-50">"""
text = replace_once(text, old, new, 'add review empty filter state')

# 8) Replace visible review table only. Hidden export/print continues to use MappedOrders.
old = """                      <table className="w-full text-left">
                        <thead><tr className="bg-blue-50/50 text-blue-950/50 uppercase tracking-widest text-[10px] font-black border-b-2 border-blue-50"><th className="px-10 py-6">Tracking</th><th className="px-10 py-6 text-center">Qty</th><th className="px-10 py-6">Output Label</th></tr></thead>
                        <tbody className="divide-y-2 divide-blue-50/50">
                          {MappedOrders.map((order) => (
                            <tr key={order.id} className="hover:bg-blue-50/30 transition-colors">
                              <td className="px-10 py-6 font-mono text-[15px] font-bold text-blue-950/60">{order.tracking}</td>
                              <td className="px-10 py-6 text-center font-black text-2xl text-blue-950/40">
                                {order.originalQty > 0 ? order.originalQty : '-'}
                                {order.qtyWarning && <div className="mt-1 text-[10px] font-black text-red-500">⚠️ ตรวจสอบ Qty</div>}
                              </td>
                              <td className="px-10 py-6">
                                <div className="flex flex-col gap-2 items-start">
                                  {order.displayItems && order.displayItems.length > 0 ? (
                                    order.displayItems.map((text, idx) => (
                                      <span key={idx} className={`font-black text-xl px-4 py-1.5 rounded-xl inline-block ${text.includes('ยังไม่ตั้งชื่อ') || text.includes('ตรวจสอบ') ? 'text-red-500 bg-red-50' : 'text-blue-900 bg-blue-100/50'}`}>
                                        {text}
                                      </span>
                                    ))
                                  ) : (
                                    <span className="text-blue-950/30 font-bold text-sm">(หน้าต่อท้ายบิล)</span>
                                  )}
                                </div>
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>"""
new = """                      <table className="w-full text-left">
                        <thead><tr className="bg-blue-50/50 text-blue-950/50 uppercase tracking-widest text-[10px] font-black border-b-2 border-blue-50"><th className="px-7 py-5">Tracking / Platform</th><th className="px-7 py-5">Status</th><th className="px-7 py-5 text-center">Qty</th><th className="px-7 py-5">Output Label</th></tr></thead>
                        <tbody className="divide-y-2 divide-blue-50/50">
                          {FilteredOrders.map((order) => {
                            const flags = getReviewFlags(order);
                            return (
                              <tr key={order.id} className="hover:bg-blue-50/30 transition-colors align-top">
                                <td className="px-7 py-5"><div className="font-mono text-sm font-bold text-blue-950/70">{order.tracking}</div><div className="mt-2"><span className={`text-[10px] font-black px-2.5 py-1 rounded-lg ${order.platform === 'TIKTOK' ? 'bg-slate-900 text-white' : 'bg-orange-50 text-orange-600'}`}>{order.platform === 'TIKTOK' ? 'TikTok' : 'Shopee'}</span></div></td>
                                <td className="px-7 py-5"><div className="flex flex-wrap gap-1.5 max-w-[180px]">{flags.ready && <span className="text-[10px] font-black px-2.5 py-1.5 rounded-lg bg-green-50 text-green-700 border border-green-100">พร้อมพิมพ์</span>}{flags.hasSkuReview && <span className="text-[10px] font-black px-2.5 py-1.5 rounded-lg bg-amber-50 text-amber-700 border border-amber-100">ตรวจสอบ SKU</span>}{flags.hasQtyReview && <span className="text-[10px] font-black px-2.5 py-1.5 rounded-lg bg-red-50 text-red-600 border border-red-100">ตรวจสอบ Qty</span>}{flags.hasUnmapped && <span className="text-[10px] font-black px-2.5 py-1.5 rounded-lg bg-slate-100 text-slate-600 border border-slate-200">ยังไม่ตั้งชื่อ</span>}</div></td>
                                <td className="px-7 py-5 text-center font-black text-xl text-blue-950/50">{order.originalQty > 0 ? order.originalQty : '-'}</td>
                                <td className="px-7 py-5"><div className="flex flex-col gap-2 items-start">{order.displayItems && order.displayItems.length > 0 ? order.displayItems.map((labelText, idx) => (<span key={idx} className={`font-black text-base px-3 py-1.5 rounded-lg inline-block ${labelText.includes('ยังไม่ตั้งชื่อ') || labelText.includes('ตรวจสอบ') ? 'text-red-500 bg-red-50' : 'text-blue-900 bg-blue-100/50'}`}>{labelText}</span>)) : <span className="text-blue-950/30 font-bold text-sm">(หน้าต่อท้ายบิล)</span>}</div></td>
                              </tr>
                            );
                          })}
                        </tbody>
                      </table>"""
text = replace_once(text, old, new, 'replace review table')

# 9) Visible label grid follows filters; hidden print/export does not.
old = """                    <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-10 justify-items-center pb-20 no-print">
                      {MappedOrders.map((order) => (<div key={`prev-${order.id}`} className="transform hover:scale-[1.01] transition-transform duration-200"><LabelCard order={order} thermalMode={thermalMode} /></div>))}
                    </div>"""
new = """                    <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-10 justify-items-center pb-20 no-print">
                      {FilteredOrders.map((order) => (<div key={`prev-${order.id}`} className="transform hover:scale-[1.01] transition-transform duration-200"><LabelCard order={order} thermalMode={thermalMode} /></div>))}
                    </div>"""
text = replace_once(text, old, new, 'filter visible label grid')

# 10) Review header wording only.
text = replace_once(text, 'ตรวจสอบความถูกต้อง {orders.length} รายการ (อัลบั้มสะสม)', 'โฟกัสเฉพาะรายการที่ต้องตรวจ • ทั้งหมด {orders.length} รายการ', 'review header copy')

# Safety invariants: filter must never enter export/print data paths.
if 'for (let i = 0; i < MappedOrders.length; i++)' not in text:
    raise RuntimeError('Export invariant changed: handleExportPDF must still iterate MappedOrders')
if 'setExportStatus({ active: true, current: 0, total: MappedOrders.length })' not in text:
    raise RuntimeError('Export invariant changed: export total must still be MappedOrders')
if '{MappedOrders.map((order) => (\n              <div key={`render-arena-${order.id}`}' not in text:
    raise RuntimeError('Hidden export render arena must still use MappedOrders')
if '{MappedOrders.map((order) => (<LabelCard key={`print-${order.id}`}' not in text:
    raise RuntimeError('Print area must still use MappedOrders')

INDEX.write_text(text, encoding='utf-8')
print('Applied PackMaster Phase 1 UI/UX V2 presentation-only changes.')
