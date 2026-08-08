from pathlib import Path

path = Path('index.html')
text = path.read_text(encoding='utf-8')


def replace_once(old: str, new: str, label: str):
    global text
    if old not in text:
        raise SystemExit(f'{label} anchor not found')
    text = text.replace(old, new, 1)


def replace_between(start_marker: str, end_marker: str, replacement: str, label: str):
    global text
    start = text.find(start_marker)
    if start == -1:
        raise SystemExit(f'{label} start not found')
    end = text.find(end_marker, start)
    if end == -1:
        raise SystemExit(f'{label} end not found')
    text = text[:start] + replacement + text[end:]


# 1) CSS: persistent Batch context, exception banner, sticky Review actions, quick mapping modal.
css_anchor = "    .pm-review-grid-output { min-height: 36px; }\n"
css_add = css_anchor + """    .pm-active-batch-bar { position: sticky; top: 82px; z-index: 42; margin: 0; border-bottom: 1px solid #d9e5f2; background: rgba(255,255,255,.97); backdrop-filter: blur(12px); box-shadow: 0 5px 16px rgba(26,54,93,.06); padding: 9px 18px; }\n    .pm-active-batch-inner { max-width: 1520px; margin: 0 auto; display: flex; align-items: center; gap: 12px; }\n    .pm-active-batch-progress { width: 110px; height: 6px; border-radius: 999px; background: #e7edf5; overflow: hidden; }\n    .pm-active-batch-progress > span { display: block; height: 100%; border-radius: inherit; background: #10b981; }\n    .pm-exception-mode-banner { border: 1px solid #f3d49a; background: #fff9ed; border-radius: 13px; padding: 11px 13px; display: flex; align-items: center; gap: 10px; }\n    .pm-review-action-wrap { position: sticky; bottom: 12px; z-index: 35; margin-top: 18px; padding-top: 8px; }\n    .pm-review-action-bar { border: 1px solid #cfdeee; background: rgba(255,255,255,.97); backdrop-filter: blur(12px); border-radius: 15px; box-shadow: 0 14px 35px rgba(7,31,61,.16); padding: 11px 12px; display: flex; align-items: center; justify-content: space-between; gap: 12px; }\n    .pm-quick-map-backdrop { position: fixed; inset: 0; z-index: 10020; display: flex; align-items: center; justify-content: center; padding: 20px; background: rgba(7,31,61,.32); backdrop-filter: blur(4px); }\n    .pm-quick-map-panel { width: min(560px, 100%); max-height: calc(100vh - 40px); overflow: auto; background: #fff; border: 1px solid #dce6f1; border-radius: 18px; box-shadow: 0 24px 70px rgba(7,31,61,.28); padding: 20px; }\n    @media (max-width: 1023px) { .pm-active-batch-bar { position: static; padding: 8px 10px; } .pm-active-batch-inner { align-items: flex-start; flex-direction: column; } .pm-review-action-bar { align-items: stretch; flex-direction: column; } }\n"""
replace_once(css_anchor, css_add, 'CSS')

# 2) Presentation-only state.
state_anchor = "      const [activeView, setActiveView] = useState('batches');\n"
state_add = state_anchor + "      const [exceptionMode, setExceptionMode] = useState(false);\n      const [quickMapState, setQuickMapState] = useState({ open: false, row: null, keyword: '', shortName: '' });\n"
replace_once(state_anchor, state_add, 'presentation state')

# 3) Share the existing SKU rule save pathway between SKU Library and Quick Mapping.
submit_start = "      const handleSubmitRule = (e) => {\n"
submit_end = "      const handleEditClick = (rule) => {\n"
submit_replacement = """      const saveSkuRule = ({ keyword, shortName }, options = {}) => {\n        const cleanKeyword = String(keyword || '').trim();\n        const cleanShortName = String(shortName || '').trim();\n        if (!cleanKeyword || !cleanShortName) return false;\n        const targetEditingId = options.editingId || null;\n        if (targetEditingId) {\n          setSkuRules(prev => prev.map(rule => rule.id === targetEditingId ? { keyword: cleanKeyword, shortName: cleanShortName, id: targetEditingId } : rule));\n          showToast(options.successMessage || 'แก้ไขกฎสำเร็จ', 'success');\n        } else {\n          setSkuRules(prev => [{ keyword: cleanKeyword, shortName: cleanShortName, id: Date.now() }, ...prev]);\n          showToast(options.successMessage || 'เพิ่มกฎใหม่สำเร็จ', 'success');\n        }\n        return true;\n      };\n\n      const handleSubmitRule = (e) => {\n        e.preventDefault();\n        if (!newRule.keyword.trim() || !newRule.shortName.trim()) return;\n        const saved = saveSkuRule(newRule, { editingId });\n        if (!saved) return;\n        setEditingId(null);\n        setNewRule({ keyword: '', shortName: '' });\n      };\n\n"""
replace_between(submit_start, submit_end, submit_replacement, 'SKU submit')

# 4) Change SKU exception action from forced navigation to safe inline Quick Mapping.
fix_start = "      const handleFixSkuException = (row) => {\n"
fix_end = "      const sortBatchRows = (rows) =>"
fix_replacement = """      const handleFixSkuException = (row) => {\n        if (!row || !row.order || !pilotSafetyApi) return;\n        const types = row.types || [];\n        if (!types.some(type => type === 'SKU' || type === 'UNMAPPED')) {\n          openExceptionInTable(row);\n          return;\n        }\n        const seed = pilotSafetyApi.getSkuFixSeed(row, getMatchResult);\n        if (!seed) {\n          openExceptionInTable(row);\n          showToast('Exception นี้ไม่มีข้อความ SKU ที่ปลอดภัยสำหรับเติมอัตโนมัติ — เปิดในตารางแทน', 'error');\n          return;\n        }\n        setQuickMapState({ open: true, row, keyword: seed, shortName: '' });\n      };\n\n      const handleSaveQuickMapping = () => {\n        const keyword = String(quickMapState.keyword || '');\n        const shortName = String(quickMapState.shortName || '');\n        if (!keyword.trim() || !shortName.trim()) {\n          showToast('กรอก Keyword และชื่อภายในก่อนบันทึก', 'error');\n          return;\n        }\n        const saved = saveSkuRule({ keyword, shortName }, { successMessage: 'บันทึกชื่อภายในแล้ว — Review จะอัปเดตจากกฎเดียวกับคลังคำศัพท์' });\n        if (!saved) return;\n        setQuickMapState({ open: false, row: null, keyword: '', shortName: '' });\n      };\n\n      const handleOpenQuickMapInLibrary = () => {\n        const seed = String(quickMapState.keyword || '').trim();\n        setEditingId(null);\n        setSkuSearch(seed);\n        setSkuFilter('ALL');\n        setNewRule({ keyword: seed, shortName: String(quickMapState.shortName || '') });\n        setQuickMapState({ open: false, row: null, keyword: '', shortName: '' });\n        setActiveTab('settings');\n        setActiveView('sku');\n      };\n\n      const sortBatchRows = (rows) =>"""
replace_between(fix_start, fix_end, fix_replacement, 'Quick Mapping handlers')

# 5) Operational CTA wording. Current create handler already lands on Upload after successful creation.
text = text.replace('สร้าง Batch ใหม่', 'เริ่มงานแพ็กใหม่')
text = text.replace('สร้าง Batch แรก', 'เริ่มงานแพ็กแรก')

# 6) Derived presentation helpers immediately before return.
flow_anchor = "      const uploadStep = !activeBatchId ? 1 : loadingStatus.active ? 3 : orders.length === 0 ? 2 : exceptionRows.length > 0 ? 4 : 5;\n      const navigateView = (view) => setActiveView(view);\n"
flow_replacement = """      const uploadStep = !activeBatchId ? 1 : loadingStatus.active ? 3 : orders.length === 0 ? 2 : exceptionRows.length > 0 ? 4 : 5;\n      const exceptionOrderIds = new Set(exceptionRows.map(row => row.order?.id).filter(Boolean));\n      const ReviewDisplayOrders = exceptionMode ? FilteredOrders.filter(order => exceptionOrderIds.has(order.id)) : FilteredOrders;\n      const reviewDisplayPageCount = Math.max(1, Math.ceil(ReviewDisplayOrders.length / reviewPageSize));\n      const visibleReviewDisplayOrders = ReviewDisplayOrders.slice((reviewPage - 1) * reviewPageSize, reviewPage * reviewPageSize);\n      const activeBatchTotal = reviewSummary.total;\n      const activeBatchReady = reviewSummary.ready;\n      const activeBatchExceptionCount = exceptionRows.length;\n      const activeBatchReadiness = activeBatchTotal > 0 ? Math.round((activeBatchReady / activeBatchTotal) * 100) : 0;\n\n      useEffect(() => { if (reviewPage > reviewDisplayPageCount) setReviewPage(reviewDisplayPageCount); }, [reviewPage, reviewDisplayPageCount]);\n      useEffect(() => { if (exceptionMode && exceptionRows.length === 0) setExceptionMode(false); }, [exceptionMode, exceptionRows.length]);\n\n      const openExceptionMode = () => {\n        setExceptionMode(true);\n        setReviewPage(1);\n        setReviewSearch('');\n        setReviewPlatform('ALL');\n        setReviewStatus('ALL');\n        setPreviewMode('labels');\n        setActiveView('review');\n      };\n      const navigateView = (view) => setActiveView(view);\n"""
replace_once(flow_anchor, flow_replacement, 'derived usability flow')

# 7) Quick Mapping modal after Toast, before export overlay.
modal_anchor = "          {toast.show && <Toast message={toast.message} type={toast.type} onClose={() => setToast({ ...toast, show: false })} />}\n          \n          {exportStatus.active && (\n"
modal_replacement = """          {toast.show && <Toast message={toast.message} type={toast.type} onClose={() => setToast({ ...toast, show: false })} />}\n\n          {quickMapState.open && (\n            <div data-pm-quick-mapping className=\"pm-quick-map-backdrop no-print\" role=\"dialog\" aria-modal=\"true\" aria-label=\"ตั้งชื่อ SKU จาก Review\">\n              <div className=\"pm-quick-map-panel\">\n                <div className=\"flex items-start justify-between gap-3\">\n                  <div><div className=\"pm-section-kicker\">Quick Mapping</div><h3 className=\"text-lg font-black text-slate-900 mt-1\">ตั้งชื่อ SKU ตรงนี้ได้เลย</h3><p className=\"text-xs font-semibold text-slate-400 mt-1\">ใช้ Keyword ที่ Pilot Safety ตรวจแล้ว และบันทึกเป็นกฎเดียวกับคลังคำศัพท์</p></div>\n                  <button onClick={()=>setQuickMapState({ open:false, row:null, keyword:'', shortName:'' })} className=\"pm-icon-btn\" title=\"ปิด\" aria-label=\"ปิด\">×</button>\n                </div>\n                <div className=\"mt-4 rounded-xl border border-blue-100 bg-blue-50/55 p-3\"><div className=\"text-[9px] uppercase tracking-[.12em] font-black text-blue-500\">Order</div><div className=\"mt-1 font-mono text-xs font-black text-blue-950 break-all\">{quickMapState.row?.order?.tracking || quickMapState.row?.order?.orderId || 'Exception'}</div></div>\n                <div className=\"mt-4\"><label className=\"pm-label\">Keyword ที่ใช้จับคู่</label><input value={quickMapState.keyword} onChange={(e)=>setQuickMapState(prev=>({ ...prev, keyword:e.target.value }))} className=\"pm-input\" /></div>\n                <div className=\"mt-3\"><label className=\"pm-label\">ชื่อภายใน / ผลลัพธ์ที่จะพิมพ์</label><input autoFocus value={quickMapState.shortName} onChange={(e)=>setQuickMapState(prev=>({ ...prev, shortName:e.target.value }))} placeholder=\"เช่น เด้งม่วง5\" className=\"pm-input text-base font-black\" /></div>\n                <div className=\"mt-3 rounded-xl border border-slate-200 bg-slate-50 p-3 text-xs font-semibold text-slate-500\">ระบบจะไม่เดาชื่อภายในให้ — ผู้ใช้ต้องกรอกและยืนยันเอง ก่อนใช้กฎกับ Review</div>\n                <div className=\"mt-5 flex flex-col sm:flex-row sm:justify-between gap-2\"><button onClick={handleOpenQuickMapInLibrary} className=\"pm-secondary-btn\">เปิดคลังคำศัพท์</button><div className=\"flex gap-2\"><button onClick={()=>setQuickMapState({ open:false, row:null, keyword:'', shortName:'' })} className=\"pm-ghost-btn\">ยกเลิก</button><button onClick={handleSaveQuickMapping} disabled={!quickMapState.keyword.trim() || !quickMapState.shortName.trim()} className=\"pm-primary-btn\">บันทึกและใช้</button></div></div>\n              </div>\n            </div>\n          )}\n          \n          {exportStatus.active && (\n"""
replace_once(modal_anchor, modal_replacement, 'Quick Mapping modal')

# 8) Simplify top command exception action.
old_command = "<button className=\"pm-command-btn\" onClick={() => { setExceptionType('ALL'); setExceptionSearch(''); setReviewStatus('ALL'); setPreviewMode('table'); navigateView('review'); }}><PMIcon name=\"alert\" /><span>รีวิวเฉพาะ</span></button>"
new_command = "<button className=\"pm-command-btn\" onClick={openExceptionMode}><PMIcon name=\"alert\" /><span>ตรวจปัญหา</span></button>"
replace_once(old_command, new_command, 'command exception shortcut')

# 9) Desktop sidebar: exactly three primary workspaces + secondary operational tools.
aside_pos = text.find('<aside className="pm-sidebar">')
if aside_pos == -1:
    raise SystemExit('sidebar not found')
nav_start = text.find('<nav className="space-y-1.5">', aside_pos)
nav_end = text.find('</nav>', nav_start)
if nav_start == -1 or nav_end == -1:
    raise SystemExit('sidebar nav anchors not found')
nav_end += len('</nav>')
new_nav = """<nav data-pm-primary-nav className=\"space-y-1.5\">\n                    {[\n                      ['batches','box','งานแพ็ก'],\n                      ['sku','barcode','คลังคำศัพท์'],\n                      ['review','review','รีวิว & พิมพ์']\n                    ].map(([id, icon, label]) => (\n                      <button key={id} onClick={() => navigateView(id)} className={`pm-nav-btn ${activeView === id ? 'pm-nav-btn-active' : ''}`}>\n                        <PMIcon name={icon} className=\"w-[18px] h-[18px]\" />\n                        <span>{label}</span>\n                        {id === 'review' && exceptionRows.length > 0 && <span className=\"ml-auto min-w-5 h-5 px-1.5 rounded-full bg-amber-400 text-[#071f3d] text-[9px] font-black flex items-center justify-center\">{exceptionRows.length}</span>}\n                      </button>\n                    ))}\n                  </nav>\n                  <div data-pm-secondary-nav className=\"mt-4 pt-3 border-t border-white/10 space-y-1.5\">\n                    <div className=\"text-[8px] font-black tracking-[0.14em] uppercase text-blue-200/35 px-3 mb-1\">เครื่องมือ</div>\n                    {activeBatchId && <button onClick={()=>navigateView('upload')} className={`pm-nav-btn ${activeView==='upload'?'pm-nav-btn-active':''}`}><PMIcon name=\"upload\" className=\"w-[17px] h-[17px]\"/><span>อัปโหลดไฟล์</span></button>}\n                    <button onClick={()=>navigateView('safety')} className={`pm-nav-btn ${activeView==='safety'?'pm-nav-btn-active':''}`}><PMIcon name=\"shield\" className=\"w-[17px] h-[17px]\"/><span>เครื่องมือ / ความปลอดภัย</span></button>\n                  </div>"""
text = text[:nav_start] + new_nav + text[nav_end:]

# 10) Active Batch Bar inside main content, without changing sidebar geometry.
main_anchor = "              <main className=\"pm-main\">\n"
main_replacement = """              <main className=\"pm-main\">\n                {activeBatchId && activeView !== 'batches' && (\n                  <div data-pm-active-batch-bar className=\"pm-active-batch-bar no-print\">\n                    <div className=\"pm-active-batch-inner\">\n                      <div className=\"flex-1 min-w-0\"><div className=\"text-[9px] font-black uppercase tracking-[.12em] text-blue-500\">งานที่กำลังทำ</div><div className=\"text-sm font-black text-slate-900 truncate\">{activeBatch?.name || 'Active Batch'}</div></div>\n                      <div className=\"flex flex-wrap items-center gap-3 text-[10px] font-black text-slate-500\"><span><b className=\"text-slate-900\">{activeBatchTotal}</b> Orders</span><span className=\"text-emerald-700\"><b>{activeBatchReady}</b> พร้อม</span><span className={activeBatchExceptionCount>0?'text-amber-700':'text-emerald-700'}><b>{activeBatchExceptionCount}</b> ต้องตรวจ</span><div className=\"flex items-center gap-2\"><div className=\"pm-active-batch-progress\"><span style={{width:`${activeBatchReadiness}%`}}></span></div><span>{activeBatchReadiness}%</span></div></div>\n                      <div className=\"flex flex-wrap gap-2\"><button onClick={()=>navigateView('batches')} className=\"pm-ghost-btn\">กลับงานแพ็ก</button>{activeBatchExceptionCount>0?<button data-pm-action=\"resolve-active-exceptions\" onClick={openExceptionMode} className=\"pm-warning-btn\"><PMIcon name=\"alert\"/> แก้รายการที่ต้องตรวจ {activeBatchExceptionCount}</button>:activeBatchTotal>0?<button onClick={()=>{setExceptionMode(false);navigateView('review');}} className=\"pm-success-btn\"><PMIcon name=\"printer\"/> พิมพ์ Batch</button>:null}</div>\n                    </div>\n                  </div>\n                )}\n"""
replace_once(main_anchor, main_replacement, 'Active Batch Bar')

# 11) Mobile primary/secondary hierarchy.
mobile_old = """                    {[\n                      ['batches','งานแพ็ก'],['upload','อัปโหลด'],['sku','คลังคำศัพท์'],['review','รีวิว & พิมพ์'],['safety','สำรองข้อมูล']\n                    ].map(([id,label]) => <button key={id} onClick={() => navigateView(id)} className={`px-3 py-2 rounded-lg text-xs font-black ${activeView === id ? 'bg-[#0b63ce] text-white' : 'bg-slate-100 text-slate-600'}`}>{label}</button>)}\n"""
mobile_new = """                    {[\n                      ['batches','งานแพ็ก'],['sku','คลังคำศัพท์'],['review','รีวิว & พิมพ์']\n                    ].map(([id,label]) => <button key={id} onClick={() => navigateView(id)} className={`px-3 py-2 rounded-lg text-xs font-black ${activeView === id ? 'bg-[#0b63ce] text-white' : 'bg-slate-100 text-slate-600'}`}>{label}</button>)}\n                    {activeBatchId&&<button onClick={()=>navigateView('upload')} className={`px-3 py-2 rounded-lg text-xs font-black ${activeView==='upload'?'bg-[#0b63ce] text-white':'bg-slate-100 text-slate-500'}`}>อัปโหลดไฟล์</button>}\n                    <button onClick={()=>navigateView('safety')} className={`px-3 py-2 rounded-lg text-xs font-black ${activeView==='safety'?'bg-[#0b63ce] text-white':'bg-slate-100 text-slate-500'}`}>เครื่องมือ</button>\n"""
replace_once(mobile_old, mobile_new, 'mobile nav')

# 12) Exception Mode banner immediately after existing Print Safety banner.
print_safety = "                    {printBlocked && <div className=\"mb-4 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 flex items-center gap-3 text-amber-800\"><PMIcon name=\"lock\" className=\"w-5 h-5 shrink-0\"/><div className=\"flex-1\"><div className=\"text-sm font-black\">Print Safety ทำงานอยู่</div><div className=\"text-xs font-semibold opacity-70\">ยังมี {exceptionRows.length} Exception — แก้ให้ครบก่อน Print / Save PDF เพื่อป้องกันแพ็กผิด</div></div></div>}\n"
exception_banner = print_safety + """\n                    {exceptionMode && <div data-pm-exception-mode className=\"pm-exception-mode-banner mb-4\"><PMIcon name=\"alert\" className=\"w-5 h-5 text-amber-600 shrink-0\"/><div className=\"flex-1\"><div className=\"text-sm font-black text-amber-900\">โหมดตรวจปัญหา • {exceptionRows.length} รายการ</div><div className=\"text-[11px] font-semibold text-amber-700/70\">ซ่อนรายการพร้อมพิมพ์ชั่วคราว เพื่อโฟกัสเฉพาะ Order ที่ต้องตัดสินใจ</div></div><button onClick={()=>setExceptionMode(false)} className=\"pm-secondary-btn\">ออกจากโหมดตรวจปัญหา</button></div>}\n"""
replace_once(print_safety, exception_banner, 'Exception Mode banner')

# 13) Add direct Exception Mode action to Exception Inbox header.
old_inbox_head = "<div className=\"flex flex-col lg:flex-row lg:items-center justify-between gap-3 mb-3\"><div><div className=\"pm-section-kicker\">Exception Inbox</div><div className=\"text-sm font-black text-slate-900\">{filteredExceptionRows.length} รายการที่ต้องตัดสินใจ</div></div><div className=\"flex flex-wrap gap-2\"><select"
new_inbox_head = "<div className=\"flex flex-col lg:flex-row lg:items-center justify-between gap-3 mb-3\"><div><div className=\"pm-section-kicker\">รายการที่ต้องตรวจ</div><div className=\"text-sm font-black text-slate-900\">{filteredExceptionRows.length} รายการที่ต้องตัดสินใจ</div></div><div className=\"flex flex-wrap gap-2\"><button onClick={openExceptionMode} className=\"pm-warning-btn\">โหมดตรวจปัญหา</button><select"
replace_once(old_inbox_head, new_inbox_head, 'Exception Inbox action')

# 14) Review presentation uses Exception Mode derived list, but print/export remain MappedOrders.
text = text.replace('):FilteredOrders.length===0?(', '):ReviewDisplayOrders.length===0?(', 1)
text = text.replace('{visibleReviewOrders.map(order=>', '{visibleReviewDisplayOrders.map(order=>', 1)
text = text.replace('{FilteredOrders.map((order,index)=>', '{ReviewDisplayOrders.map((order,index)=>', 1)
text = text.replace('{index+1}/{FilteredOrders.length}', '{index+1}/{ReviewDisplayOrders.length}')
text = text.replace("previewMode==='table'&&FilteredOrders.length>0", "previewMode==='table'&&ReviewDisplayOrders.length>0", 1)
text = text.replace('หน้า {reviewPage} / {reviewPageCount} • แสดง {visibleReviewOrders.length} รายการ', 'หน้า {reviewPage} / {reviewDisplayPageCount} • แสดง {visibleReviewDisplayOrders.length} รายการ', 1)
text = text.replace('disabled={reviewPage>=reviewPageCount}', 'disabled={reviewPage>=reviewDisplayPageCount}', 1)
text = text.replace('setReviewPage(p=>Math.min(reviewPageCount,p+1))', 'setReviewPage(p=>Math.min(reviewDisplayPageCount,p+1))', 1)

# 15) Sticky Review action bar before Review section closes.
safety_marker = "\n                {activeView === 'safety' && (\n"
safety_pos = text.find(safety_marker)
if safety_pos == -1:
    raise SystemExit('Safety section marker not found')
review_close = text.rfind("                  </section>\n                )}\n", 0, safety_pos)
if review_close == -1:
    raise SystemExit('Review close not found')
sticky = """                    {orders.length>0&&<div className=\"pm-review-action-wrap no-print\"><div data-pm-review-action-bar className=\"pm-review-action-bar\"><div className=\"min-w-0\"><div className={`text-sm font-black ${printBlocked?'text-amber-800':'text-emerald-700'}`}>{printBlocked?`พร้อม ${reviewSummary.ready}/${reviewSummary.total} • ต้องตรวจ ${exceptionRows.length}`:`พร้อมพิมพ์ ${reviewSummary.ready}/${reviewSummary.total}`}</div><div className=\"text-[10px] font-semibold text-slate-400 mt-0.5\">{printBlocked?'แก้รายการที่ต้องตรวจให้ครบก่อน Print / Save PDF':'Batch นี้ไม่มี Exception ที่บล็อกการพิมพ์'}</div></div><div className=\"flex flex-wrap gap-2\">{printBlocked?<><button onClick={openExceptionMode} className=\"pm-warning-btn\"><PMIcon name=\"alert\"/> แก้ {exceptionRows.length} รายการ</button><button disabled className=\"pm-ghost-btn\"><PMIcon name=\"lock\"/> พิมพ์ถูกล็อก</button></>:<><button onClick={handleExportPDF} disabled={exportStatus.active||orders.length===0} className=\"pm-secondary-btn\"><PMIcon name=\"download\"/> Save PDF</button><button onClick={handlePrint} disabled={orders.length===0} className=\"pm-primary-btn\"><PMIcon name=\"printer\"/> พิมพ์ {reviewSummary.total} ใบ</button></>}</div></div></div>}\n"""
text = text[:review_close] + sticky + text[review_close:]

path.write_text(text, encoding='utf-8')
