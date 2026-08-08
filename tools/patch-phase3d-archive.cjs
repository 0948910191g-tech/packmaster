const fs = require('fs');
const path = require('path');
const file = path.resolve(__dirname, '../index.html');
let html = fs.readFileSync(file, 'utf8');

function replaceOnce(from, to, label) {
  if (html.includes(to)) return;
  const count = html.split(from).length - 1;
  if (count !== 1) throw new Error(`${label}: expected 1 anchor, found ${count}`);
  html = html.replace(from, to);
}

replaceOnce(
  "      const [batchLoading, setBatchLoading] = useState(true);\n",
  "      const [batchLoading, setBatchLoading] = useState(true);\n      const [batchViewFilter, setBatchViewFilter] = useState('ACTIVE');\n      const [selectedArchivedBatchIds, setSelectedArchivedBatchIds] = useState([]);\n",
  'archive state'
);

replaceOnce(
  "      const activeBatch = useMemo(() => batches.find(batch => batch.id === activeBatchId) || null, [batches, activeBatchId]);\n",
  `      const activeBatch = useMemo(() => batches.find(batch => batch.id === activeBatchId) || null, [batches, activeBatchId]);\n      const visibleBatches = useMemo(() => batches.filter(batch => {\n        if (batchViewFilter === 'ARCHIVED') return Boolean(batch.archivedAt);\n        if (batchViewFilter === 'ACTIVE') return !batch.archivedAt;\n        return true;\n      }), [batches, batchViewFilter]);\n      const archivedBatchCount = useMemo(() => batches.filter(batch => Boolean(batch.archivedAt)).length, [batches]);\n`,
  'archive derived batches'
);

const handlerAnchor = `      const handleDeleteBatch = async (batch) => {`;
const handlers = `      const handleArchiveBatch = async (batch) => {\n        if (!batch || !batch.id || !batchApi || !batchStorageReady) { showToast('Browser storage ยังไม่พร้อม', 'error'); return; }\n        const unresolved = (batch.reviewSkuCount || 0) + (batch.reviewQtyCount || 0) + (batch.unmappedCount || 0);\n        if (unresolved > 0 && !window.confirm(\`Batch นี้ยังมี \${unresolved} รายการที่ต้องตรวจ\\n\\nต้องการเก็บเข้าคลังต่อหรือไม่?\`)) return;\n        try {\n          const updated = await batchApi.archiveBatch(batch.id, new Date());\n          upsertBatchMeta(updated);\n          setSelectedArchivedBatchIds(prev => prev.filter(id => id !== batch.id));\n          showToast('เก็บ Batch เข้าคลังแล้ว', 'success');\n        } catch (err) { console.error('Archive batch failed', err); showToast('เก็บ Batch เข้าคลังไม่สำเร็จ — ข้อมูลเดิมยังอยู่', 'error'); }\n      };\n\n      const handleRestoreArchivedBatch = async (batch) => {\n        if (!batch || !batch.id || !batchApi || !batchStorageReady) { showToast('Browser storage ยังไม่พร้อม', 'error'); return; }\n        try {\n          const updated = await batchApi.restoreArchivedBatch(batch.id, new Date());\n          upsertBatchMeta(updated);\n          setSelectedArchivedBatchIds(prev => prev.filter(id => id !== batch.id));\n          showToast('นำ Batch กลับจากคลังแล้ว', 'success');\n        } catch (err) { console.error('Restore archived batch failed', err); showToast('นำ Batch กลับไม่สำเร็จ — ข้อมูลเดิมยังอยู่', 'error'); }\n      };\n\n      const toggleArchivedSelection = (batchId) => {\n        setSelectedArchivedBatchIds(prev => prev.includes(batchId) ? prev.filter(id => id !== batchId) : [...prev, batchId]);\n      };\n\n      const handleDeleteSelectedArchived = async () => {\n        if (!batchApi || !batchStorageReady || selectedArchivedBatchIds.length === 0) return;\n        if (!window.confirm(\`ลบ Batch ที่เก็บเข้าคลังแล้ว \${selectedArchivedBatchIds.length} รายการถาวรจาก Browser นี้หรือไม่?\\n\\nการลบนี้ย้อนกลับไม่ได้ เว้นแต่มี Workspace Backup\`)) return;\n        try {\n          const result = await batchApi.deleteArchivedBatches(selectedArchivedBatchIds);\n          const removed = new Set(selectedArchivedBatchIds);\n          setBatches(prev => prev.filter(batch => !removed.has(batch.id) || !batch.archivedAt));\n          setSelectedArchivedBatchIds([]);\n          showToast(\`ลบ Archived Batch แล้ว \${result.deleted} รายการ\`, 'success');\n        } catch (err) { console.error('Delete archived batches failed', err); showToast('ลบ Archived Batch ไม่สำเร็จ — ข้อมูลที่ลบไม่สำเร็จยังอยู่', 'error'); }\n      };\n\n      const handleDeleteBatch = async (batch) => {`;
replaceOnce(handlerAnchor, handlers, 'archive handlers');

const afterHeader = `                      {!batchStorageReady && !batchLoading && (`;
const filterUi = `                      <div className="mb-6 flex flex-col md:flex-row md:items-center justify-between gap-3">\n                        <div className="inline-flex bg-white border-2 border-blue-50 rounded-2xl p-1.5 shadow-sm">\n                          {[['ACTIVE','Active'],['ARCHIVED','Archived'],['ALL','All']].map(([id,label]) => (\n                            <button key={id} onClick={() => { setBatchViewFilter(id); setSelectedArchivedBatchIds([]); }} className={\`px-4 py-2 rounded-xl text-xs font-black transition-all \${batchViewFilter === id ? 'bg-blue-950 text-white' : 'text-blue-950/50 hover:bg-blue-50'}\`}>{label}{id === 'ARCHIVED' ? \` (\${archivedBatchCount})\` : ''}</button>\n                          ))}\n                        </div>\n                        {batchViewFilter === 'ARCHIVED' && selectedArchivedBatchIds.length > 0 && (\n                          <button onClick={handleDeleteSelectedArchived} className="px-4 py-2.5 rounded-xl bg-red-50 border border-red-100 text-red-600 text-xs font-black">ลบที่เลือก ({selectedArchivedBatchIds.length})</button>\n                        )}\n                      </div>\n\n                      {!batchStorageReady && !batchLoading && (`;
replaceOnce(afterHeader, filterUi, 'archive filter UI');

replaceOnce(
  `                      ) : batches.length === 0 ? (`,
  `                      ) : batches.length === 0 ? (`,
  'no-op batches empty anchor'
);

replaceOnce(
  `                        <div className="grid grid-cols-1 xl:grid-cols-2 gap-5">\n                          {batches.map((batch) => {`,
  `                        <div className="grid grid-cols-1 xl:grid-cols-2 gap-5">\n                          {visibleBatches.map((batch) => {`,
  'visible batch map'
);

replaceOnce(
  `<button onClick={() => handleDeleteBatch(batch)} className="shrink-0 w-10 h-10 rounded-xl border border-slate-100 text-slate-400 hover:text-red-500 hover:bg-red-50 hover:border-red-100 transition-all" title="ลบ Batch">🗑️</button>`,
  `{batch.archivedAt ? (\n                                    <label className="shrink-0 flex items-center gap-2 text-[10px] font-black text-slate-500 cursor-pointer"><input type="checkbox" checked={selectedArchivedBatchIds.includes(batch.id)} onChange={() => toggleArchivedSelection(batch.id)} className="w-4 h-4" /> เลือก</label>\n                                  ) : (\n                                    <button onClick={() => handleArchiveBatch(batch)} className="shrink-0 px-3 py-2 rounded-xl border border-slate-100 text-slate-500 hover:text-blue-700 hover:bg-blue-50 hover:border-blue-100 transition-all text-xs font-black" title="เก็บเข้าคลัง">เก็บเข้าคลัง</button>\n                                  )}`,
  'archive card action'
);

replaceOnce(
  `                                <button onClick={() => handleOpenBatch(batch)} className="w-full bg-blue-50 hover:bg-blue-100 text-blue-900 border border-blue-100 px-5 py-3.5 rounded-2xl font-black text-sm transition-all flex items-center justify-center gap-2">\n                                  เปิดงาน <span>→</span>\n                                </button>`,
  `                                <div className="flex gap-2">\n                                  <button onClick={() => handleOpenBatch(batch)} className="flex-1 bg-blue-50 hover:bg-blue-100 text-blue-900 border border-blue-100 px-5 py-3.5 rounded-2xl font-black text-sm transition-all flex items-center justify-center gap-2">เปิดงาน <span>→</span></button>\n                                  {batch.archivedAt && <button onClick={() => handleRestoreArchivedBatch(batch)} className="px-5 py-3.5 rounded-2xl border border-green-100 bg-green-50 text-green-700 font-black text-sm">นำกลับ</button>}\n                                </div>`,
  'archive restore button'
);

// Empty state for a filter without changing the global no-batch state.
replaceOnce(
  `                      ) : (\n                        <div className="grid grid-cols-1 xl:grid-cols-2 gap-5">\n                          {visibleBatches.map((batch) => {`,
  `                      ) : visibleBatches.length === 0 ? (\n                        <div className="bg-white border-2 border-dashed border-blue-100 rounded-[2rem] p-12 text-center text-blue-950/40 font-bold">ไม่มี Batch ในมุมมองนี้</div>\n                      ) : (\n                        <div className="grid grid-cols-1 xl:grid-cols-2 gap-5">\n                          {visibleBatches.map((batch) => {`,
  'filtered empty state'
);

fs.writeFileSync(file, html);
console.log('Applied Phase 3D archive lifecycle UI patch');
