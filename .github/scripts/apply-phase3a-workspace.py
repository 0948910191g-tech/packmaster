from pathlib import Path

path = Path('index.html')
text = path.read_text(encoding='utf-8')
original = text


def replace_once(old, new, label):
    global text
    count = text.count(old)
    if count != 1:
        raise SystemExit(f'{label}: expected exactly 1 anchor, found {count}')
    text = text.replace(old, new, 1)


replace_once(
    '  <script src="./packmaster-batch.js"></script>\n',
    '  <script src="./packmaster-batch.js"></script>\n  <script src="./packmaster-workspace.js"></script>\n',
    'workspace script include'
)

replace_once(
    '    function App() {\n      const batchApi = window.PackMasterBatch;\n',
    '    function App() {\n      const batchApi = window.PackMasterBatch;\n      const workspaceApi = window.PackMasterWorkspace;\n',
    'workspace api binding'
)

replace_once(
    "      const [batchStorageReady, setBatchStorageReady] = useState(false);\n      const [batchLoading, setBatchLoading] = useState(true);\n\n      const [thermalMode, setThermalMode] = useState(() => {",
    "      const [batchStorageReady, setBatchStorageReady] = useState(false);\n      const [batchLoading, setBatchLoading] = useState(true);\n\n      // Phase 3A — Workspace Backup / Restore Safety\n      const [restorePreview, setRestorePreview] = useState(null);\n      const [restoreFileName, setRestoreFileName] = useState('');\n      const [workspaceBusy, setWorkspaceBusy] = useState(false);\n\n      const [thermalMode, setThermalMode] = useState(() => {",
    'workspace state'
)

workspace_handlers = r'''      const resetRestorePreview = () => {
        setRestorePreview(null);
        setRestoreFileName('');
      };

      const handleWorkspaceBackup = async () => {
        if (!workspaceApi || !batchApi) {
          showToast('โมดูล Workspace Backup ยังไม่พร้อม', 'error');
          return;
        }
        if (!batchStorageReady) {
          showToast('Browser storage ยังไม่พร้อม จึงยังสำรอง Workspace ไม่ได้', 'error');
          return;
        }

        setWorkspaceBusy(true);
        try {
          if (activeBatchId) {
            const saved = await saveActiveBatchSnapshot();
            if (!saved) throw new Error('บันทึก Active Batch ล่าสุดไม่สำเร็จ');
          }

          const payload = await workspaceApi.collectBackupPayload({
            batchApi,
            skuRules,
            settings: { thermalMode },
            appVersion: document.title
          });
          const backup = workspaceApi.createBackup(payload, new Date());
          const summary = workspaceApi.getBackupSummary(backup);
          const blob = new Blob([JSON.stringify(backup, null, 2)], { type: 'application/json' });
          const url = URL.createObjectURL(blob);
          const link = document.createElement('a');
          const stamp = new Date().toISOString().replace(/[:T]/g, '-').slice(0, 16);
          link.href = url;
          link.download = `PackMaster_Backup_${stamp}.json`;
          document.body.appendChild(link);
          link.click();
          link.remove();
          setTimeout(() => URL.revokeObjectURL(url), 0);
          showToast(`สำรอง Workspace แล้ว • SKU ${summary.skuRules} • Batch ${summary.batches} • Orders ${summary.orders}`, 'success');
        } catch (err) {
          console.error('Workspace backup failed', err);
          showToast(err.message || 'สำรอง Workspace ไม่สำเร็จ', 'error');
        } finally {
          setWorkspaceBusy(false);
        }
      };

      const handleWorkspaceRestoreFile = async (event) => {
        const file = event.target.files && event.target.files[0];
        if (!file) return;

        setWorkspaceBusy(true);
        try {
          if (!workspaceApi) throw new Error('โมดูล Workspace Backup ยังไม่พร้อม');
          const raw = await file.text();
          const parsed = JSON.parse(raw);
          const backup = workspaceApi.validateBackup(parsed);
          const summary = workspaceApi.getBackupSummary(backup);
          setRestorePreview({ backup, summary });
          setRestoreFileName(file.name);
          showToast('ตรวจไฟล์ Backup ผ่านแล้ว กรุณาตรวจ Summary ก่อน Replace', 'success');
        } catch (err) {
          console.error('Workspace restore file validation failed', err);
          resetRestorePreview();
          showToast(`ไฟล์ Backup ใช้งานไม่ได้: ${err.message || 'รูปแบบไม่ถูกต้อง'}`, 'error');
        } finally {
          event.target.value = '';
          setWorkspaceBusy(false);
        }
      };

      const handleConfirmWorkspaceRestore = async () => {
        if (!restorePreview || !restorePreview.backup || !workspaceApi || !batchApi) return;
        if (!batchStorageReady) {
          showToast('Browser storage ยังไม่พร้อม จึงยัง Replace Workspace ไม่ได้', 'error');
          return;
        }

        const { backup, summary } = restorePreview;
        const confirmed = window.confirm(
          `Replace Workspace ปัจจุบันด้วยไฟล์ Backup นี้หรือไม่?\n\nSKU ${summary.skuRules} • Batch ${summary.batches} • Orders ${summary.orders}\n\nข้อมูล Local ปัจจุบันจะถูกแทนที่ แต่ระบบจะสร้าง Safety Snapshot ในหน่วยความจำก่อนเริ่มกู้คืน`
        );
        if (!confirmed) return;

        setWorkspaceBusy(true);
        const previousSkuRules = JSON.parse(JSON.stringify(skuRules));
        const previousThermalMode = thermalMode;
        let safetyBackup = null;
        let rollbackSucceeded = false;

        try {
          if (activeBatchId) {
            const saved = await saveActiveBatchSnapshot();
            if (!saved) throw new Error('บันทึก Active Batch ล่าสุดไม่สำเร็จ จึงยกเลิก Restore');
          }

          const restoredRules = backup.skuRules.map((rule, index) => sanitizeSkuRule(rule, `restore-${Date.now()}-${index}`));
          if (restoredRules.some(rule => !rule)) throw new Error('Backup มี SKU rule ที่ไม่ถูกต้อง');

          const safetyPayload = await workspaceApi.collectBackupPayload({
            batchApi,
            skuRules: previousSkuRules,
            settings: { thermalMode: previousThermalMode },
            appVersion: document.title
          });
          safetyBackup = workspaceApi.createBackup(safetyPayload, new Date());

          await workspaceApi.replaceWorkspaceBatches(backup, batchApi);

          setSkuRules(restoredRules);
          if (typeof backup.settings.thermalMode === 'boolean') {
            setThermalMode(backup.settings.thermalMode);
          }

          const restoredBatches = await batchApi.listBatches();
          setBatches(restoredBatches);
          setActiveBatchId(null);
          setOrders([]);
          setReviewSearch('');
          setReviewPlatform('ALL');
          setReviewStatus('ALL');
          setUploadError('');
          resetRestorePreview();
          setActiveTab('upload');
          showToast(`กู้คืน Workspace สำเร็จ • Batch ${summary.batches} • Orders ${summary.orders}`, 'success');
        } catch (err) {
          console.error('Workspace replace failed', err);

          if (safetyBackup) {
            try {
              await workspaceApi.replaceWorkspaceBatches(safetyBackup, batchApi);
              const previousBatches = await batchApi.listBatches();
              setBatches(previousBatches);
              setSkuRules(previousSkuRules);
              setThermalMode(previousThermalMode);
              rollbackSucceeded = true;
            } catch (rollbackErr) {
              console.error('Workspace rollback failed', rollbackErr);
            }
          }

          showToast(
            rollbackSucceeded
              ? `กู้คืนไม่สำเร็จ แต่คืน Workspace เดิมแล้ว: ${err.message || 'Restore failed'}`
              : `กู้คืนไม่สำเร็จและคืนข้อมูลอัตโนมัติไม่ครบ กรุณาอย่าปิดหน้านี้และใช้ไฟล์ Backup ล่าสุด: ${err.message || 'Restore failed'}`,
            'error'
          );
        } finally {
          setWorkspaceBusy(false);
        }
      };

'''

replace_once(
    '      const handleExportPDF = async () => {\n',
    workspace_handlers + '      const handleExportPDF = async () => {\n',
    'workspace handlers'
)

workspace_card = r'''                  <div className="bg-white border-2 border-blue-50 p-8 rounded-[2.5rem] shadow-xl shadow-blue-900/5 mb-10">
                    <div className="flex flex-col xl:flex-row xl:items-start justify-between gap-6">
                      <div className="max-w-2xl">
                        <div className="text-[10px] font-black text-blue-500 uppercase tracking-[0.18em] mb-2">Local Safety</div>
                        <h3 className="text-2xl font-black text-blue-950 mb-2 flex items-center gap-3"><span>🛟</span> ความปลอดภัย Workspace</h3>
                        <p className="text-sm font-semibold text-blue-950/50 leading-6">สำรองคลังคำศัพท์ การตั้งค่า และ Batch ทั้งหมดเป็นไฟล์ JSON ในเครื่องนี้ ไม่มีการส่งขึ้น Server</p>
                      </div>
                      <div className="flex flex-wrap gap-3">
                        <button type="button" onClick={handleWorkspaceBackup} disabled={workspaceBusy || !batchStorageReady} className="bg-blue-950 hover:bg-blue-900 disabled:opacity-50 text-white px-5 py-3 rounded-2xl text-sm font-black transition-all flex items-center gap-2 shadow-lg shadow-blue-900/15"><span>💾</span> สำรอง Workspace</button>
                        <label className={`bg-white border-2 border-blue-100 text-blue-900 px-5 py-3 rounded-2xl text-sm font-black transition-all flex items-center gap-2 ${workspaceBusy || !batchStorageReady ? 'opacity-50 cursor-not-allowed' : 'hover:bg-blue-50 cursor-pointer'}`}><span>♻️</span> กู้คืน Workspace<input type="file" accept=".json,application/json" disabled={workspaceBusy || !batchStorageReady} className="hidden" onChange={handleWorkspaceRestoreFile} /></label>
                      </div>
                    </div>

                    <div className="mt-5 rounded-2xl border border-amber-100 bg-amber-50/70 px-5 py-4 text-xs font-bold text-amber-800 leading-5 flex gap-3">
                      <span>⚠️</span>
                      <span>ไฟล์ Backup อาจมีข้อมูลที่อ่านจากใบออเดอร์ ควรเก็บเป็นข้อมูลภายในร้านและไม่ควรอัปโหลดไฟล์จริงเข้า GitHub หรือพื้นที่สาธารณะ</span>
                    </div>

                    {restorePreview && (
                      <div className="mt-6 border-2 border-blue-100 bg-blue-50/40 rounded-2xl p-6">
                        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-5">
                          <div>
                            <div className="text-xs font-black text-blue-950/45 mb-1">พร้อมกู้คืนจาก {restoreFileName || 'Backup JSON'}</div>
                            <div className="font-black text-blue-950">Backup {formatBatchUpdated(restorePreview.summary.createdAt)}</div>
                          </div>
                          <div className="grid grid-cols-3 gap-3 min-w-[330px]">
                            <div className="bg-white rounded-xl p-3 border border-blue-100"><div className="text-[9px] font-black uppercase tracking-wider text-blue-950/35">SKU Rules</div><div className="text-xl font-black text-blue-950">{restorePreview.summary.skuRules}</div></div>
                            <div className="bg-white rounded-xl p-3 border border-blue-100"><div className="text-[9px] font-black uppercase tracking-wider text-blue-950/35">Batches</div><div className="text-xl font-black text-blue-950">{restorePreview.summary.batches}</div></div>
                            <div className="bg-white rounded-xl p-3 border border-blue-100"><div className="text-[9px] font-black uppercase tracking-wider text-blue-950/35">Orders</div><div className="text-xl font-black text-blue-950">{restorePreview.summary.orders}</div></div>
                          </div>
                        </div>
                        <div className="mt-5 flex flex-wrap items-center justify-between gap-3 border-t border-blue-100 pt-5">
                          <p className="text-xs font-bold text-red-600">Replace Workspace จะใช้ข้อมูลจาก Backup แทนข้อมูล Local ปัจจุบันทั้งหมด</p>
                          <div className="flex gap-2">
                            <button type="button" onClick={resetRestorePreview} disabled={workspaceBusy} className="px-4 py-2.5 rounded-xl border border-blue-100 bg-white text-blue-900 text-xs font-black">ยกเลิก</button>
                            <button type="button" onClick={handleConfirmWorkspaceRestore} disabled={workspaceBusy} className="px-5 py-2.5 rounded-xl bg-red-600 hover:bg-red-700 disabled:opacity-50 text-white text-xs font-black shadow-sm">Replace Workspace</button>
                          </div>
                        </div>
                      </div>
                    )}
                  </div>

'''

calculator_anchor = '''                  <div className="bg-white border-2 border-blue-50 p-10 rounded-[2.5rem] shadow-xl shadow-blue-900/5 relative overflow-hidden">
                    <div className="relative z-10">
                      <h3 className="text-xl font-black mb-6 flex items-center gap-3 text-blue-950"><span>🧮</span> ทดสอบระบบคำนวณยอด</h3>'''

replace_once(
    calculator_anchor,
    workspace_card + calculator_anchor,
    'workspace safety card'
)

if text == original:
    raise SystemExit('No changes produced')

path.write_text(text, encoding='utf-8')
print('Phase 3A Workspace UI patch applied safely')
