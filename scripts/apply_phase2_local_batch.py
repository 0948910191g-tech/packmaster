from pathlib import Path

INDEX = Path('index.html')
text = INDEX.read_text(encoding='utf-8')


def replace_once(old: str, new: str, label: str):
    global text
    count = text.count(old)
    if count != 1:
        raise SystemExit(f'{label}: expected exactly 1 match, found {count}')
    text = text.replace(old, new, 1)


replace_once(
    '  <script src="https://cdnjs.cloudflare.com/ajax/libs/jspdf/2.5.1/jspdf.umd.min.js"></script>\n\n  <script>',
    '  <script src="https://cdnjs.cloudflare.com/ajax/libs/jspdf/2.5.1/jspdf.umd.min.js"></script>\n  <script src="./packmaster-batch.js"></script>\n\n  <script>',
    'batch adapter script tag'
)

replace_once(
    "    function App() {\n      const [activeTab, setActiveTab] = useState('upload');",
    "    function App() {\n      const batchApi = window.PackMasterBatch;\n      const [activeTab, setActiveTab] = useState('upload');",
    'batch api binding'
)

replace_once(
    "      const [skuSearch, setSkuSearch] = useState('');\n      const [skuFilter, setSkuFilter] = useState('ALL');\n\n      const [thermalMode, setThermalMode] = useState(() => {",
    "      const [skuSearch, setSkuSearch] = useState('');\n      const [skuFilter, setSkuFilter] = useState('ALL');\n\n      // Phase 2 — Local-first Batch System\n      const [batches, setBatches] = useState([]);\n      const [activeBatchId, setActiveBatchId] = useState(null);\n      const [batchStorageReady, setBatchStorageReady] = useState(false);\n      const [batchLoading, setBatchLoading] = useState(true);\n\n      const [thermalMode, setThermalMode] = useState(() => {",
    'batch states'
)

replace_once(
    "      const [thermalMode, setThermalMode] = useState(() => {\n        try { const saved = localStorage.getItem('thermalMode'); if (saved !== null) return JSON.parse(saved); } catch (e) {} return true;\n      });\n\n      useEffect(() => { localStorage.setItem('skuMappingRules', JSON.stringify(skuRules)); }, [skuRules]);\n      useEffect(() => { localStorage.setItem('thermalMode', JSON.stringify(thermalMode)); }, [thermalMode]);\n\n      const showToast = (message, type = 'success') => setToast({ show: true, message, type });",
    "      const [thermalMode, setThermalMode] = useState(() => {\n        try { const saved = localStorage.getItem('thermalMode'); if (saved !== null) return JSON.parse(saved); } catch (e) {} return true;\n      });\n\n      const activeBatch = useMemo(() => batches.find(batch => batch.id === activeBatchId) || null, [batches, activeBatchId]);\n\n      useEffect(() => { localStorage.setItem('skuMappingRules', JSON.stringify(skuRules)); }, [skuRules]);\n      useEffect(() => { localStorage.setItem('thermalMode', JSON.stringify(thermalMode)); }, [thermalMode]);\n\n      useEffect(() => {\n        let cancelled = false;\n\n        const loadLocalBatches = async () => {\n          if (!batchApi) {\n            if (!cancelled) {\n              setBatchLoading(false);\n              setToast({ show: true, message: 'โหลด Local Batch module ไม่สำเร็จ — ยังใช้งานแบบ Session ได้', type: 'error' });\n            }\n            return;\n          }\n\n          try {\n            const storedBatches = await batchApi.listBatches();\n            if (!cancelled) {\n              setBatches(storedBatches);\n              setBatchStorageReady(true);\n            }\n          } catch (err) {\n            console.error('PackMaster IndexedDB init failed', err);\n            if (!cancelled) {\n              setBatchStorageReady(false);\n              setToast({ show: true, message: 'เปิด Local Batch storage ไม่สำเร็จ — งานปัจจุบันยังใช้ต่อได้ใน Session นี้', type: 'error' });\n            }\n          } finally {\n            if (!cancelled) setBatchLoading(false);\n          }\n        };\n\n        loadLocalBatches();\n        return () => { cancelled = true; };\n      }, []);\n\n      const showToast = (message, type = 'success') => setToast({ show: true, message, type });",
    'batch initialization'
)

replace_once(
    "      const handleFileUpload = async (e) => {\n        const files = Array.from(e.target.files);\n        if (files.length === 0) return;",
    "      const handleFileUpload = async (e) => {\n        const files = Array.from(e.target.files);\n        if (files.length === 0) return;\n\n        if (!activeBatchId) {\n          showToast('กรุณาสร้างหรือเปิด Batch ก่อนอัปโหลดไฟล์', 'error');\n          e.target.value = null;\n          return;\n        }",
    'active batch upload guard'
)

replace_once(
    "          if (allNewOrders.length > 0) {\n            setOrders(prev => [...prev, ...allNewOrders]); \n            setActiveTab('preview');\n            showToast(`เพิ่มข้อมูลสำเร็จ ${allNewOrders.length} ใบ`, 'success');\n          }",
    "          if (allNewOrders.length > 0) {\n            resetActiveBatchCompletion();\n            setOrders(prev => [...prev, ...allNewOrders]); \n            setActiveTab('preview');\n            showToast(`เพิ่มข้อมูลสำเร็จ ${allNewOrders.length} ใบ`, 'success');\n          }",
    'reset completion on successful upload'
)

batch_logic_anchor = "      }, [MappedOrders, reviewSearch, reviewPlatform, reviewStatus, getReviewFlags]);\n\n      const handleExportPDF = async () => {"
batch_logic = r'''      }, [MappedOrders, reviewSearch, reviewPlatform, reviewStatus, getReviewFlags]);

      const sortBatchRows = (rows) => [...rows].sort((a, b) => String(b.updatedAt || '').localeCompare(String(a.updatedAt || '')));

      const upsertBatchMeta = (meta) => {
        if (!meta || !meta.id) return;
        setBatches(prev => sortBatchRows([meta, ...prev.filter(batch => batch.id !== meta.id)]));
      };

      const getBatchStatusUi = (status) => {
        const map = {
          WAITING: { label: 'รออัปโหลด', className: 'bg-slate-100 text-slate-600 border-slate-200' },
          READY: { label: 'พร้อมพิมพ์', className: 'bg-green-50 text-green-700 border-green-200' },
          REVIEW: { label: 'ต้องตรวจ', className: 'bg-amber-50 text-amber-700 border-amber-200' },
          COMPLETED: { label: 'พิมพ์แล้ว', className: 'bg-blue-50 text-blue-800 border-blue-200' }
        };
        return map[status] || map.WAITING;
      };

      const formatBatchUpdated = (value) => {
        if (!value) return '-';
        try {
          return new Intl.DateTimeFormat('th-TH', { dateStyle: 'short', timeStyle: 'short' }).format(new Date(value));
        } catch (err) {
          return String(value);
        }
      };

      const saveActiveBatchSnapshot = async (overrides = {}) => {
        if (!activeBatch || !batchApi) return true;
        const updated = batchApi.buildBatchMeta(activeBatch, reviewSummary, overrides);
        upsertBatchMeta(updated);

        if (!batchStorageReady) return false;

        try {
          await batchApi.saveBatch(updated, orders);
          return true;
        } catch (err) {
          console.error('Save active batch failed', err);
          showToast('บันทึก Batch ไม่สำเร็จ — ยังไม่สลับงานเพื่อป้องกันข้อมูลหาย', 'error');
          return false;
        }
      };

      const handleCreateBatch = async () => {
        if (!batchApi) {
          showToast('Local Batch module ยังไม่พร้อม', 'error');
          return;
        }

        const nextBatch = batchApi.createBatchMeta(batches, new Date());
        setBatchLoading(true);

        try {
          if (batchStorageReady) {
            await batchApi.saveBatch(nextBatch, []);
          } else {
            showToast('สร้าง Batch แบบ Session ชั่วคราว — Browser storage ยังไม่พร้อม', 'error');
          }

          upsertBatchMeta(nextBatch);
          setActiveBatchId(nextBatch.id);
          setOrders([]);
          setReviewSearch('');
          setReviewPlatform('ALL');
          setReviewStatus('ALL');
          setUploadError('');
          setActiveTab('upload');
        } catch (err) {
          console.error('Create batch failed', err);
          showToast('สร้าง Batch ไม่สำเร็จ กรุณาลองใหม่', 'error');
        } finally {
          setBatchLoading(false);
        }
      };

      const handleOpenBatch = async (batch) => {
        if (!batch || !batch.id) return;
        if (!batchStorageReady || !batchApi) {
          showToast('Browser storage ยังไม่พร้อม จึงยังเปิด Batch เก่าไม่ได้', 'error');
          return;
        }

        setBatchLoading(true);
        try {
          const stored = await batchApi.loadBatch(batch.id);
          if (!stored.meta) throw new Error('Batch metadata not found');
          upsertBatchMeta(stored.meta);
          setActiveBatchId(stored.meta.id);
          setOrders(Array.isArray(stored.orders) ? stored.orders : []);
          setReviewSearch('');
          setReviewPlatform('ALL');
          setReviewStatus('ALL');
          setUploadError('');
          setActiveTab('upload');
        } catch (err) {
          console.error('Open batch failed', err);
          showToast('เปิด Batch ไม่สำเร็จ', 'error');
        } finally {
          setBatchLoading(false);
        }
      };

      const handleBackToBatchList = async () => {
        if (!activeBatchId) return;
        if (!batchStorageReady) {
          showToast('ยังสลับ Batch ไม่ได้ เพราะ Browser storage ไม่พร้อม — งานปัจจุบันยังอยู่ใน Session นี้', 'error');
          return;
        }

        const saved = await saveActiveBatchSnapshot();
        if (!saved) return;

        setActiveBatchId(null);
        setOrders([]);
        setReviewSearch('');
        setReviewPlatform('ALL');
        setReviewStatus('ALL');
        setUploadError('');
        setActiveTab('upload');
      };

      const handleDeleteBatch = async (batch) => {
        if (!batch || !batch.id || !batchApi) return;
        if (!batchStorageReady) {
          showToast('Browser storage ยังไม่พร้อม', 'error');
          return;
        }
        if (!window.confirm(`ลบ ${batch.name} และข้อมูลใบปะหน้าที่เก็บในเครื่องนี้หรือไม่?`)) return;

        try {
          await batchApi.deleteBatch(batch.id);
          setBatches(prev => prev.filter(item => item.id !== batch.id));
          showToast('ลบ Batch เรียบร้อย', 'success');
        } catch (err) {
          console.error('Delete batch failed', err);
          showToast('ลบ Batch ไม่สำเร็จ', 'error');
        }
      };

      const resetActiveBatchCompletion = () => {
        if (!activeBatch || !activeBatch.printedAt || !batchApi) return;
        const resetMeta = batchApi.buildBatchMeta(activeBatch, reviewSummary, { printedAt: null, now: new Date() });
        upsertBatchMeta(resetMeta);
        if (batchStorageReady) {
          batchApi.saveBatch(resetMeta, orders).catch(err => console.error('Reset completed batch failed', err));
        }
      };

      const markActiveBatchPrinted = async () => {
        if (!activeBatch || !batchApi) return;
        const printedAt = new Date().toISOString();
        const completedMeta = batchApi.buildBatchMeta(activeBatch, reviewSummary, { printedAt, now: new Date() });
        upsertBatchMeta(completedMeta);

        if (!batchStorageReady) return;
        try {
          await batchApi.saveBatch(completedMeta, orders);
        } catch (err) {
          console.error('Mark batch completed failed', err);
          showToast('พิมพ์ได้ แต่บันทึกสถานะ Completed ไม่สำเร็จ', 'error');
        }
      };

      const handleClearActiveBatch = async () => {
        if (orders.length === 0) return;
        if (!window.confirm('ล้าง Orders ใน Batch นี้หรือไม่? ตัว Batch จะยังอยู่')) return;

        setOrders([]);
        if (activeBatch && batchApi) {
          const emptySummary = { total: 0, ready: 0, reviewSku: 0, reviewQty: 0, unmapped: 0 };
          const resetMeta = batchApi.buildBatchMeta(activeBatch, emptySummary, { printedAt: null, now: new Date() });
          upsertBatchMeta(resetMeta);
          if (batchStorageReady) {
            try {
              await batchApi.saveBatch(resetMeta, []);
            } catch (err) {
              console.error('Clear active batch save failed', err);
              showToast('ล้างในหน้าจอแล้ว แต่บันทึกลง Browser storage ไม่สำเร็จ', 'error');
              return;
            }
          }
        }
        showToast('ล้าง Orders ใน Batch เรียบร้อย', 'success');
      };

      const handlePrint = async () => {
        await markActiveBatchPrinted();
        window.print();
      };

      useEffect(() => {
        if (!activeBatchId || !activeBatch || !batchApi || !batchStorageReady || batchLoading) return;

        const timer = setTimeout(async () => {
          try {
            const updated = batchApi.buildBatchMeta(activeBatch, reviewSummary, { now: new Date() });
            await batchApi.saveBatch(updated, orders);
            upsertBatchMeta(updated);
          } catch (err) {
            console.error('Auto-save batch failed', err);
            showToast('Auto-save Batch ไม่สำเร็จ กรุณาอย่าเพิ่งสลับงาน', 'error');
          }
        }, 600);

        return () => clearTimeout(timer);
      }, [
        activeBatchId,
        orders,
        reviewSummary.total,
        reviewSummary.ready,
        reviewSummary.reviewSku,
        reviewSummary.reviewQty,
        reviewSummary.unmapped,
        activeBatch && activeBatch.printedAt,
        batchStorageReady,
        batchLoading
      ]);

      const handleExportPDF = async () => {'''
replace_once(batch_logic_anchor, batch_logic, 'batch handlers and autosave')

replace_once(
    "          pdf.save(`PackMaster_Labels_${new Date().getTime()}.pdf`);\n          showToast(`ดาวน์โหลด PDF เรียบร้อย ${exportedPages} หน้า`, 'success');",
    "          pdf.save(`PackMaster_Labels_${new Date().getTime()}.pdf`);\n          await markActiveBatchPrinted();\n          showToast(`ดาวน์โหลด PDF เรียบร้อย ${exportedPages} หน้า`, 'success');",
    'mark completed after export'
)

upload_start = "              {activeTab === 'upload' && ("
upload_end = "\n\n              {activeTab === 'settings' && ("
start_index = text.find(upload_start)
end_index = text.find(upload_end, start_index)
if start_index < 0 or end_index < 0:
    raise SystemExit('upload UI block markers not found')

new_upload = r'''              {activeTab === 'upload' && (
                <div className="p-12 max-w-6xl mx-auto animate-in fade-in slide-in-from-bottom-8 duration-500">
                  {!activeBatchId ? (
                    <>
                      <div className="flex flex-col lg:flex-row lg:items-end justify-between gap-6 mb-10">
                        <div>
                          <div className="text-[11px] font-black text-blue-500 uppercase tracking-[0.18em] mb-3">Packing Jobs</div>
                          <h2 className="text-4xl font-black text-blue-950 mb-3 tracking-tight">งานแพ็ก</h2>
                          <p className="text-blue-950/55 text-base font-semibold">แยกงานเป็น Batch แล้วสลับรอบได้โดยไม่ต้องล้างข้อมูลชุดก่อนหน้า</p>
                        </div>
                        <button onClick={handleCreateBatch} disabled={batchLoading} className="bg-blue-950 hover:bg-blue-900 disabled:opacity-50 text-white px-7 py-4 rounded-2xl font-black text-sm shadow-lg shadow-blue-900/20 flex items-center gap-2 transition-all active:scale-95">
                          <span className="text-lg">＋</span> สร้าง Batch ใหม่
                        </button>
                      </div>

                      {!batchStorageReady && !batchLoading && (
                        <div className="mb-8 rounded-2xl border border-amber-200 bg-amber-50 px-5 py-4 text-amber-800 text-sm font-bold flex items-start gap-3">
                          <span>⚠️</span>
                          <span>Local storage ยังไม่พร้อม — งานที่เปิดอยู่ยังทำต่อได้ใน Session นี้ แต่ยังไม่ควรสลับ Batch จนกว่าจะรีเฟรชแล้วระบบกลับมาปกติ</span>
                        </div>
                      )}

                      {batchLoading ? (
                        <div className="bg-white border-2 border-blue-50 rounded-[2.5rem] p-20 text-center shadow-sm">
                          <span className="text-4xl animate-spin inline-block mb-4">⏳</span>
                          <div className="font-black text-blue-950">กำลังโหลด Batch ในเครื่อง</div>
                        </div>
                      ) : batches.length === 0 ? (
                        <div className="bg-white border-2 border-dashed border-blue-100 rounded-[2.5rem] p-20 text-center shadow-sm">
                          <div className="w-20 h-20 rounded-3xl bg-blue-50 flex items-center justify-center mx-auto mb-6 text-3xl">📦</div>
                          <h3 className="text-2xl font-black text-blue-950 mb-2">ยังไม่มี Batch</h3>
                          <p className="text-blue-950/45 font-semibold text-sm mb-7">สร้างงานแพ็กรอบแรก แล้วอัปโหลด Shopee / TikTok ได้เลย</p>
                          <button onClick={handleCreateBatch} className="bg-blue-950 text-white px-7 py-3.5 rounded-2xl font-black text-sm">＋ สร้าง Batch แรก</button>
                        </div>
                      ) : (
                        <div className="grid grid-cols-1 xl:grid-cols-2 gap-5">
                          {batches.map((batch) => {
                            const statusUi = getBatchStatusUi(batch.status);
                            return (
                              <div key={batch.id} className="bg-white border-2 border-blue-50 rounded-[2rem] p-7 shadow-lg shadow-blue-900/[0.03] hover:border-blue-100 transition-all">
                                <div className="flex items-start justify-between gap-4 mb-6">
                                  <div className="min-w-0">
                                    <div className="flex flex-wrap items-center gap-2 mb-2">
                                      <h3 className="text-xl font-black text-blue-950 truncate">{batch.name}</h3>
                                      <span className={`px-3 py-1 rounded-full border text-[10px] font-black ${statusUi.className}`}>{statusUi.label}</span>
                                    </div>
                                    <p className="text-xs font-bold text-blue-950/35">อัปเดต {formatBatchUpdated(batch.updatedAt)}</p>
                                  </div>
                                  <button onClick={() => handleDeleteBatch(batch)} className="shrink-0 w-10 h-10 rounded-xl border border-slate-100 text-slate-400 hover:text-red-500 hover:bg-red-50 hover:border-red-100 transition-all" title="ลบ Batch">🗑️</button>
                                </div>

                                <div className="grid grid-cols-4 gap-3 mb-6">
                                  <div className="bg-slate-50 rounded-2xl p-3"><div className="text-[9px] uppercase tracking-wider font-black text-slate-400 mb-1">Orders</div><div className="text-2xl font-black text-blue-950">{batch.totalOrders || 0}</div></div>
                                  <div className="bg-green-50/60 rounded-2xl p-3"><div className="text-[9px] uppercase tracking-wider font-black text-green-500 mb-1">Ready</div><div className="text-2xl font-black text-green-700">{batch.readyCount || 0}</div></div>
                                  <div className="bg-amber-50/70 rounded-2xl p-3"><div className="text-[9px] uppercase tracking-wider font-black text-amber-500 mb-1">SKU / Qty</div><div className="text-lg font-black text-amber-700">{batch.reviewSkuCount || 0} / {batch.reviewQtyCount || 0}</div></div>
                                  <div className="bg-slate-50 rounded-2xl p-3"><div className="text-[9px] uppercase tracking-wider font-black text-slate-400 mb-1">Unmapped</div><div className="text-2xl font-black text-slate-600">{batch.unmappedCount || 0}</div></div>
                                </div>

                                <button onClick={() => handleOpenBatch(batch)} className="w-full bg-blue-50 hover:bg-blue-100 text-blue-900 border border-blue-100 px-5 py-3.5 rounded-2xl font-black text-sm transition-all flex items-center justify-center gap-2">
                                  เปิดงาน <span>→</span>
                                </button>
                              </div>
                            );
                          })}
                        </div>
                      )}
                    </>
                  ) : (
                    <>
                      <div className="mb-8">
                        <button onClick={handleBackToBatchList} className="text-blue-700 hover:text-blue-950 text-sm font-black flex items-center gap-2 mb-5 transition-colors">← กลับรายการ Batch</button>
                        <div className="bg-white border-2 border-blue-50 rounded-[2rem] p-7 shadow-lg shadow-blue-900/[0.03]">
                          <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-5">
                            <div>
                              <div className="flex flex-wrap items-center gap-3 mb-2">
                                <h2 className="text-3xl font-black text-blue-950 tracking-tight">{activeBatch ? activeBatch.name : 'Active Batch'}</h2>
                                {activeBatch && (() => { const ui = getBatchStatusUi(activeBatch.status); return <span className={`px-3 py-1 rounded-full border text-[10px] font-black ${ui.className}`}>{ui.label}</span>; })()}
                              </div>
                              <p className="text-sm font-semibold text-blue-950/45">ข้อมูล Batch นี้บันทึกใน Browser เครื่องนี้แบบ Local-first</p>
                            </div>
                            {orders.length > 0 && (
                              <button onClick={() => setActiveTab('preview')} className="bg-blue-950 hover:bg-blue-900 text-white px-6 py-3.5 rounded-2xl font-black text-sm flex items-center gap-2 shadow-lg shadow-blue-900/15">รีวิว & พิมพ์ <span>→</span></button>
                            )}
                          </div>

                          <div className="grid grid-cols-2 md:grid-cols-5 gap-3 mt-6 pt-6 border-t border-blue-50">
                            <div><div className="text-[10px] font-black text-blue-950/35 uppercase tracking-wider">ทั้งหมด</div><div className="text-2xl font-black text-blue-950">{reviewSummary.total}</div></div>
                            <div><div className="text-[10px] font-black text-green-500 uppercase tracking-wider">พร้อมพิมพ์</div><div className="text-2xl font-black text-green-700">{reviewSummary.ready}</div></div>
                            <div><div className="text-[10px] font-black text-amber-500 uppercase tracking-wider">ตรวจ SKU</div><div className="text-2xl font-black text-amber-700">{reviewSummary.reviewSku}</div></div>
                            <div><div className="text-[10px] font-black text-red-400 uppercase tracking-wider">ตรวจ Qty</div><div className="text-2xl font-black text-red-600">{reviewSummary.reviewQty}</div></div>
                            <div><div className="text-[10px] font-black text-slate-400 uppercase tracking-wider">ยังไม่ตั้งชื่อ</div><div className="text-2xl font-black text-slate-600">{reviewSummary.unmapped}</div></div>
                          </div>
                        </div>
                      </div>

                      <div className="mb-8 text-center">
                        <h3 className="text-3xl font-black text-blue-950 mb-3 tracking-tight">เพิ่มใบปะหน้าเข้า Batch</h3>
                        <p className="text-blue-950/50 text-base font-medium">Shopee และ TikTok • เพิ่มหลายไฟล์ได้ • สูงสุดรวม 150 ใบต่อ Batch</p>
                      </div>

                      <div className={`bg-white p-16 rounded-[3rem] border-2 transition-all duration-300 shadow-xl shadow-blue-900/5 ${loadingStatus.active ? 'border-blue-200 bg-blue-50/30' : 'border-blue-50 hover:border-blue-100'}`}>
                        {loadingStatus.active ? (
                          <div className="flex flex-col items-center py-4"><span className="text-6xl animate-spin inline-block mb-6">⏳</span><h3 className="text-xl font-black text-blue-950 mb-2">กำลังประมวลผล PDF</h3><p className="text-blue-900/60 font-bold text-sm">อ่านข้อมูลหน้าที่ {loadingStatus.current} (รวมหลายไฟล์)</p></div>
                        ) : (
                          <div className="text-center py-4">
                            <div className="w-24 h-24 bg-blue-50/80 rounded-3xl flex items-center justify-center mx-auto mb-8 border border-blue-100/50 text-4xl shadow-sm">☁️</div>
                            <h3 className="text-2xl font-black mb-3 text-blue-950">เลือกไฟล์ PDF ของ Batch นี้</h3>
                            <p className="text-blue-950/50 font-semibold text-sm mb-10">ไฟล์ใหม่จะถูกเพิ่มเฉพาะใน {activeBatch ? activeBatch.name : 'Batch ปัจจุบัน'}</p>
                            <label className="bg-blue-950 hover:bg-blue-900 text-white px-10 py-4 rounded-2xl cursor-pointer font-bold text-sm transition-all inline-flex items-center gap-3 shadow-lg shadow-blue-900/20 active:scale-95"><span>📥</span> เลือกไฟล์ PDF <input type="file" accept=".pdf" multiple className="hidden" onChange={handleFileUpload} /></label>
                            {uploadError && <div className="mt-8 p-4 bg-red-50 text-red-600 rounded-2xl flex items-center justify-center gap-2 border border-red-100 font-bold text-sm"><span>⚠️</span> {uploadError}</div>}
                          </div>
                        )}
                      </div>
                    </>
                  )}
                </div>
              )}'''

text = text[:start_index] + new_upload + text[end_index:]

replace_once(
    '<div className="text-center xl:text-left"><h2 className="text-4xl font-black text-blue-950 mb-2 tracking-tight">รีวิวและพิมพ์</h2><p className="text-blue-950/60 text-base font-semibold">โฟกัสเฉพาะรายการที่ต้องตรวจ • ทั้งหมด {orders.length} รายการ</p></div>',
    '<div className="text-center xl:text-left"><h2 className="text-4xl font-black text-blue-950 mb-2 tracking-tight">รีวิวและพิมพ์</h2><p className="text-blue-950/60 text-base font-semibold">{activeBatch ? `${activeBatch.name} • ` : \'\'}โฟกัสเฉพาะรายการที่ต้องตรวจ • ทั้งหมด {orders.length} รายการ</p></div>',
    'review active batch title'
)

replace_once(
    '<button onClick={() => { setOrders([]); showToast(\'ล้างข้อมูลอัลบั้มสำเร็จ\'); }} disabled={orders.length === 0} className="bg-white border-2 border-blue-50 hover:bg-red-50 hover:border-red-100 hover:text-red-600 text-blue-950/60 disabled:opacity-50 px-5 py-3 rounded-2xl font-bold text-sm shadow-sm flex items-center gap-2 transition-all"><span>🔄</span> ล้างข้อมูล</button>',
    '<button onClick={handleClearActiveBatch} disabled={orders.length === 0} className="bg-white border-2 border-blue-50 hover:bg-red-50 hover:border-red-100 hover:text-red-600 text-blue-950/60 disabled:opacity-50 px-5 py-3 rounded-2xl font-bold text-sm shadow-sm flex items-center gap-2 transition-all"><span>🔄</span> ล้างออเดอร์</button>',
    'clear active batch action'
)

replace_once(
    '<button onClick={() => window.print()} disabled={orders.length === 0} className="bg-blue-950 hover:bg-blue-900 disabled:opacity-50 text-white px-8 py-3 rounded-2xl font-bold text-sm shadow-lg shadow-blue-900/20 flex items-center gap-2 transition-all active:scale-95"><span>🖨️</span> พิมพ์</button>',
    '<button onClick={handlePrint} disabled={orders.length === 0} className="bg-blue-950 hover:bg-blue-900 disabled:opacity-50 text-white px-8 py-3 rounded-2xl font-bold text-sm shadow-lg shadow-blue-900/20 flex items-center gap-2 transition-all active:scale-95"><span>🖨️</span> พิมพ์</button>',
    'batch-aware print action'
)

INDEX.write_text(text, encoding='utf-8')
print('Applied PackMaster Phase 2 Local Batch UI patch')
