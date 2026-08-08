from pathlib import Path
import re

path = Path('index.html')
text = path.read_text()


def replace_once(old, new, label):
    global text
    count = text.count(old)
    if count != 1:
        raise SystemExit(f'{label}: expected 1 anchor, found {count}')
    text = text.replace(old, new, 1)

replace_once(
"    .pm-order-card { background: white; border: 1px solid #dfe7f1; border-radius: 14px; padding: 12px; box-shadow: 0 4px 14px rgba(26,54,93,.04); min-width: 0; }\n",
"    .pm-order-card { background: white; border: 1px solid #dfe7f1; border-radius: 14px; padding: 12px; box-shadow: 0 4px 14px rgba(26,54,93,.04); min-width: 0; }\n    .pm-full-preview-stage { min-height: 610px; border: 1px solid #e1e8f0; border-radius: 14px; background: linear-gradient(180deg, #f8fafc 0%, #eef4fa 100%); padding: 20px; display: flex; align-items: flex-start; justify-content: center; overflow: auto; }\n    .pm-full-preview-info { border: 1px solid #e1e8f0; border-radius: 14px; background: #fbfcfe; padding: 16px; }\n",
'preview css')

replace_once(
"      const [reviewPage, setReviewPage] = useState(1);\n",
"      const [reviewPage, setReviewPage] = useState(1);\n      const [reviewPreviewIndex, setReviewPreviewIndex] = useState(0);\n",
'preview cursor state')

replace_once(
"      const [previewMode, setPreviewMode] = useState('table');\n",
"      const [previewMode, setPreviewMode] = useState('labels');\n",
'default preview mode')

replace_once(
"      const reviewPageCount = Math.max(1, Math.ceil(FilteredOrders.length / reviewPageSize));\n      const visibleReviewOrders = FilteredOrders.slice((reviewPage - 1) * reviewPageSize, reviewPage * reviewPageSize);\n\n      useEffect(() => { setSkuPage(1); }, [skuSearch, skuFilter, skuSort]);\n",
"      const reviewPageCount = Math.max(1, Math.ceil(FilteredOrders.length / reviewPageSize));\n      const visibleReviewOrders = FilteredOrders.slice((reviewPage - 1) * reviewPageSize, reviewPage * reviewPageSize);\n      const safeReviewPreviewIndex = FilteredOrders.length > 0 ? Math.min(reviewPreviewIndex, FilteredOrders.length - 1) : 0;\n      const CurrentPreviewOrder = FilteredOrders[safeReviewPreviewIndex] || null;\n      const CurrentPreviewFlags = CurrentPreviewOrder ? getReviewFlags(CurrentPreviewOrder) : null;\n\n      const moveReviewPreview = (delta) => {\n        if (FilteredOrders.length === 0) return;\n        setReviewPreviewIndex(prev => Math.max(0, Math.min(FilteredOrders.length - 1, prev + delta)));\n      };\n\n      useEffect(() => { setSkuPage(1); }, [skuSearch, skuFilter, skuSort]);\n",
'preview derived state')

replace_once(
"      useEffect(() => { setReviewPage(1); }, [reviewSearch, reviewPlatform, reviewStatus, previewMode, activeBatchId]);\n      useEffect(() => { if (skuPage > skuPageCount) setSkuPage(skuPageCount); }, [skuPage, skuPageCount]);\n      useEffect(() => { if (reviewPage > reviewPageCount) setReviewPage(reviewPageCount); }, [reviewPage, reviewPageCount]);\n",
"      useEffect(() => { setReviewPage(1); }, [reviewSearch, reviewPlatform, reviewStatus, previewMode, activeBatchId]);\n      useEffect(() => { setReviewPreviewIndex(0); }, [reviewSearch, reviewPlatform, reviewStatus, activeBatchId]);\n      useEffect(() => { if (skuPage > skuPageCount) setSkuPage(skuPageCount); }, [skuPage, skuPageCount]);\n      useEffect(() => { if (reviewPage > reviewPageCount) setReviewPage(reviewPageCount); }, [reviewPage, reviewPageCount]);\n      useEffect(() => {\n        if (reviewPreviewIndex > Math.max(0, FilteredOrders.length - 1)) setReviewPreviewIndex(Math.max(0, FilteredOrders.length - 1));\n      }, [reviewPreviewIndex, FilteredOrders.length]);\n      useEffect(() => {\n        if (activeView !== 'review' || previewMode !== 'labels' || FilteredOrders.length === 0) return;\n        const onReviewPreviewKey = (event) => {\n          const target = event.target;\n          const tag = target && target.tagName ? target.tagName.toLowerCase() : '';\n          if (['input', 'textarea', 'select'].includes(tag) || (target && target.isContentEditable)) return;\n          if (event.key === 'ArrowLeft') { event.preventDefault(); moveReviewPreview(-1); }\n          if (event.key === 'ArrowRight') { event.preventDefault(); moveReviewPreview(1); }\n        };\n        window.addEventListener('keydown', onReviewPreviewKey);\n        return () => window.removeEventListener('keydown', onReviewPreviewKey);\n      }, [activeView, previewMode, FilteredOrders.length]);\n",
'preview effects')

replace_once(
"      const printBlocked = pilotSafetyApi ? pilotSafetyApi.hasBlockingExceptions(exceptionRows) : exceptionRows.length > 0;\n",
"      const printBlocked = pilotSafetyApi ? pilotSafetyApi.hasBlockingExceptions(exceptionRows) : exceptionRows.length > 0;\n      const currentPreviewException = CurrentPreviewOrder ? exceptionRows.find(item => item.order?.id === CurrentPreviewOrder.id) : null;\n",
'current preview exception')

replace_once(
"                        <div className=\"flex p-1 bg-slate-100 rounded-lg\"><button onClick={()=>setPreviewMode('labels')} className={`pm-view-toggle ${previewMode==='labels'?'pm-view-toggle-active':''}`} title=\"Grid\"><PMIcon name=\"grid\" className=\"w-4 h-4\"/></button><button onClick={()=>setPreviewMode('table')} className={`pm-view-toggle ${previewMode==='table'?'pm-view-toggle-active':''}`} title=\"Compact list\"><PMIcon name=\"list\" className=\"w-4 h-4\"/></button></div>\n",
"                        <div className=\"flex p-1 bg-slate-100 rounded-lg\"><button onClick={()=>setPreviewMode('labels')} className={`pm-view-toggle ${previewMode==='labels'?'pm-view-toggle-active':''}`} title=\"พรีวิวเต็มหน้า\" aria-label=\"พรีวิวเต็มหน้า\"><PMIcon name=\"file\" className=\"w-4 h-4\"/></button><button onClick={()=>setPreviewMode('table')} className={`pm-view-toggle ${previewMode==='table'?'pm-view-toggle-active':''}`} title=\"มุมมองรายการ\" aria-label=\"มุมมองรายการ\"><PMIcon name=\"list\" className=\"w-4 h-4\"/></button></div>\n",
'view toggle')

start = text.find('                    ):previewMode===\'table\'?(')
if start == -1:
    raise SystemExit('review conditional start not found')
footer = text.find('                    {FilteredOrders.length>0&&<div className="pm-pagination mt-4">', start)
if footer == -1:
    raise SystemExit('review pagination footer not found')

prefix = text[:start]
suffix = text[footer:]
old_segment = text[start:footer]
if 'pm-order-card' not in old_segment or 'visibleReviewOrders.map' not in old_segment:
    raise SystemExit('review grid segment did not match expected V3 structure')

new_segment = '''                    ):previewMode==='table'?(
                      <div className="pm-card overflow-x-auto"><table className="pm-table min-w-[820px]"><thead><tr><th>Order / Platform</th><th>สถานะ</th><th className="text-center">Qty</th><th>ชื่อภายใน</th><th className="text-right">Action</th></tr></thead><tbody>{visibleReviewOrders.map(order=>{const flags=getReviewFlags(order);const row=exceptionRows.find(item=>item.order?.id===order.id);return <tr key={order.id}><td><div className="font-mono text-xs font-bold text-slate-700">{order.tracking||order.orderId||order.id}</div><PMStatusPill tone={order.platform==='TIKTOK'?'dark':'orange'}>{order.platform==='TIKTOK'?'TikTok':'Shopee'}</PMStatusPill></td><td><div className="flex flex-wrap gap-1">{flags.ready&&<PMStatusPill tone="green">พร้อมพิมพ์</PMStatusPill>}{flags.hasSkuReview&&<PMStatusPill tone="amber">ตรวจสอบ SKU</PMStatusPill>}{flags.hasQtyReview&&<PMStatusPill tone="red">ตรวจสอบ Qty</PMStatusPill>}{flags.hasUnmapped&&<PMStatusPill tone="slate">ยังไม่ตั้งชื่อ</PMStatusPill>}</div></td><td className="text-center font-black text-slate-700">{(order.parsedItems||[]).reduce((sum,item)=>sum+(Number(item.qty)||0),0)||order.originalQty||'-'}</td><td><div className="space-y-1">{(order.displayItems||[]).map((text,idx)=><div key={idx} className={`text-xs font-black ${text.includes('ตรวจสอบ')||text.includes('ยังไม่ตั้งชื่อ')?'text-red-600':'text-blue-700'}`}>{text}</div>)}</div></td><td><div className="flex justify-end gap-1">{row&&(flags.hasSkuReview||flags.hasUnmapped)&&<button onClick={()=>handleFixSkuException(row)} className="pm-secondary-btn !py-2 !px-3">ตั้งชื่อ SKU</button>}</div></td></tr>})}</tbody></table></div>
                    ):(
                      <div data-pm-review-preview="full" className="pm-card p-4 lg:p-5">
                        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-3 mb-4">
                          <div><div className="pm-section-kicker">พรีวิวเต็มหน้า</div><div className="text-sm font-black text-slate-900 mt-1">เห็น Label จริงก่อนพิมพ์ • {safeReviewPreviewIndex + 1} / {FilteredOrders.length}</div></div>
                          <div className="flex flex-wrap items-center gap-2">{CurrentPreviewFlags?.ready&&<PMStatusPill tone="green">พร้อมพิมพ์</PMStatusPill>}{CurrentPreviewFlags?.hasSkuReview&&<PMStatusPill tone="amber">ตรวจสอบ SKU</PMStatusPill>}{CurrentPreviewFlags?.hasQtyReview&&<PMStatusPill tone="red">ตรวจสอบ Qty</PMStatusPill>}{CurrentPreviewFlags?.hasUnmapped&&<PMStatusPill tone="slate">ยังไม่ตั้งชื่อ</PMStatusPill>}</div>
                        </div>
                        <div className="grid xl:grid-cols-[minmax(0,1fr)_320px] gap-4 items-start">
                          <div className="pm-full-preview-stage"><LabelCard order={CurrentPreviewOrder} thermalMode={thermalMode} /></div>
                          <aside className="pm-full-preview-info xl:sticky xl:top-4">
                            <div className="text-[9px] uppercase tracking-[.13em] font-black text-slate-400">Order</div>
                            <div className="font-mono text-sm font-black text-slate-800 break-all mt-1">{CurrentPreviewOrder?.tracking||CurrentPreviewOrder?.orderId||CurrentPreviewOrder?.id}</div>
                            <div className="mt-2"><PMStatusPill tone={CurrentPreviewOrder?.platform==='TIKTOK'?'dark':'orange'}>{CurrentPreviewOrder?.platform==='TIKTOK'?'TikTok':'Shopee'}</PMStatusPill></div>
                            <div className="grid grid-cols-2 gap-2 mt-4"><div className="pm-mini-stat"><span>Qty</span><strong>{(CurrentPreviewOrder?.parsedItems||[]).reduce((sum,item)=>sum+(Number(item.qty)||0),0)||CurrentPreviewOrder?.originalQty||'-'}</strong></div><div className="pm-mini-stat"><span>ลำดับ</span><strong>{safeReviewPreviewIndex+1}/{FilteredOrders.length}</strong></div></div>
                            <div className="mt-4 pt-4 border-t border-slate-200"><div className="text-[10px] font-black text-slate-500 mb-2">ชื่อภายใน / ผลลัพธ์ที่จะพิมพ์</div><div className="space-y-2">{(CurrentPreviewOrder?.displayItems||[]).map((text,idx)=><div key={idx} className={`rounded-lg px-3 py-2 text-sm font-black ${text.includes('ตรวจสอบ')||text.includes('ยังไม่ตั้งชื่อ')?'bg-red-50 text-red-700 border border-red-100':'bg-blue-50 text-blue-800 border border-blue-100'}`}>{text}</div>)}</div></div>
                            {currentPreviewException&&(CurrentPreviewFlags?.hasSkuReview||CurrentPreviewFlags?.hasUnmapped)&&<button onClick={()=>handleFixSkuException(currentPreviewException)} className="pm-secondary-btn w-full justify-center mt-4">ตั้งชื่อ SKU</button>}
                            <div className="grid grid-cols-2 gap-2 mt-5 pt-4 border-t border-slate-200"><button data-pm-action="review-preview-prev" onClick={()=>moveReviewPreview(-1)} disabled={safeReviewPreviewIndex<=0} className="pm-secondary-btn justify-center"><PMIcon name="arrow-left"/> ก่อนหน้า</button><button data-pm-action="review-preview-next" onClick={()=>moveReviewPreview(1)} disabled={safeReviewPreviewIndex>=FilteredOrders.length-1} className="pm-primary-btn justify-center">ถัดไป <PMIcon name="arrow-right"/></button></div>
                            <p className="text-[10px] font-semibold text-slate-400 text-center mt-2">ใช้ปุ่ม ← → บนคีย์บอร์ดได้ • เปลี่ยนเฉพาะ Preview ไม่เปลี่ยนขอบเขต Print</p>
                          </aside>
                        </div>
                      </div>
                    )}

'''
text = prefix + new_segment + suffix

replace_once(
"                    {FilteredOrders.length>0&&<div className=\"pm-pagination mt-4\">",
"                    {previewMode==='table'&&FilteredOrders.length>0&&<div className=\"pm-pagination mt-4\">",
'list-only pagination')

path.write_text(text)
print('Applied full review preview patch')
