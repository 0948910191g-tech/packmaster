from pathlib import Path
import re

path = Path('index.html')
text = path.read_text(encoding='utf-8')


def replace_once(old, new, label):
    global text
    count = text.count(old)
    if count != 1:
        raise SystemExit(f'{label}: expected exactly 1 match, found {count}')
    text = text.replace(old, new, 1)


replace_once(
    "      const [reviewPreviewIndex, setReviewPreviewIndex] = useState(0);\n",
    "",
    'remove single-preview cursor state',
)

pattern = re.compile(
    r"      const safeReviewPreviewIndex = FilteredOrders\.length > 0 \? Math\.min\(reviewPreviewIndex, FilteredOrders\.length - 1\) : 0;\n"
    r"      const CurrentPreviewOrder = FilteredOrders\[safeReviewPreviewIndex\] \|\| null;\n"
    r"      const CurrentPreviewFlags = CurrentPreviewOrder \? getReviewFlags\(CurrentPreviewOrder\) : null;\n"
    r"      const currentPreviewException = CurrentPreviewOrder \? exceptionRows\.find\(item => item\.order\?\.id === CurrentPreviewOrder\.id\) : null;\n\n"
    r"      const moveReviewPreview = \(delta\) => \{\n"
    r"        if \(FilteredOrders\.length === 0\) return;\n"
    r"        setReviewPreviewIndex\(prev => Math\.max\(0, Math\.min\(FilteredOrders\.length - 1, prev \+ delta\)\)\);\n"
    r"      \};\n\n"
)
text, count = pattern.subn('', text, count=1)
if count != 1:
    raise SystemExit(f'remove single-preview derived state: expected 1 match, found {count}')

replace_once(
    "      useEffect(() => { setReviewPreviewIndex(0); }, [reviewSearch, reviewPlatform, reviewStatus, activeBatchId]);\n",
    "",
    'remove preview cursor reset effect',
)

pattern = re.compile(
    r"      useEffect\(\(\) => \{\n"
    r"        if \(reviewPreviewIndex > Math\.max\(0, FilteredOrders\.length - 1\)\) setReviewPreviewIndex\(Math\.max\(0, FilteredOrders\.length - 1\)\);\n"
    r"      \}, \[reviewPreviewIndex, FilteredOrders\.length\]\);\n"
    r"      useEffect\(\(\) => \{\n"
    r"        if \(activeView !== 'review' \|\| previewMode !== 'labels' \|\| FilteredOrders\.length === 0\) return;\n"
    r"        const onReviewPreviewKey = \(event\) => \{\n"
    r"          const target = event\.target;\n"
    r"          const tag = target && target\.tagName \? target\.tagName\.toLowerCase\(\) : '';\n"
    r"          if \(\['input', 'textarea', 'select'\]\.includes\(tag\) \|\| \(target && target\.isContentEditable\)\) return;\n"
    r"          if \(event\.key === 'ArrowLeft'\) \{ event\.preventDefault\(\); moveReviewPreview\(-1\); \}\n"
    r"          if \(event\.key === 'ArrowRight'\) \{ event\.preventDefault\(\); moveReviewPreview\(1\); \}\n"
    r"        \};\n"
    r"        window\.addEventListener\('keydown', onReviewPreviewKey\);\n"
    r"        return \(\) => window\.removeEventListener\('keydown', onReviewPreviewKey\);\n"
    r"      \}, \[activeView, previewMode, FilteredOrders\.length\]\);\n"
)
text, count = pattern.subn('', text, count=1)
if count != 1:
    raise SystemExit(f'remove preview paging effects: expected 1 match, found {count}')

start = '                      <div data-pm-review-preview="full" className="pm-card p-4 lg:p-5">\n'
end = '                            <p className="text-[10px] font-semibold text-slate-400 text-center mt-2">ใช้ปุ่ม ← → บนคีย์บอร์ดได้ • เปลี่ยนเฉพาะ Preview ไม่เปลี่ยนขอบเขต Print</p>\n                          </aside>\n                        </div>\n                      </div>\n'
start_index = text.find(start)
if start_index == -1:
    raise SystemExit('full preview block start not found')
end_index = text.find(end, start_index)
if end_index == -1:
    raise SystemExit('full preview block end not found')
end_index += len(end)

replacement = '''                      <div data-pm-review-preview="full" className="space-y-5">
                        {FilteredOrders.map((order,index)=>{const flags=getReviewFlags(order);const row=exceptionRows.find(item=>item.order?.id===order.id);return <article key={order.id} data-pm-review-preview-item className="pm-card p-4 lg:p-5">
                          <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-3 mb-4">
                            <div><div className="pm-section-kicker">พรีวิวเต็มหน้า</div><div className="text-sm font-black text-slate-900 mt-1">เห็น Label จริงก่อนพิมพ์ • {index + 1} / {FilteredOrders.length}</div></div>
                            <div className="flex flex-wrap items-center gap-2">{flags.ready&&<PMStatusPill tone="green">พร้อมพิมพ์</PMStatusPill>}{flags.hasSkuReview&&<PMStatusPill tone="amber">ตรวจสอบ SKU</PMStatusPill>}{flags.hasQtyReview&&<PMStatusPill tone="red">ตรวจสอบ Qty</PMStatusPill>}{flags.hasUnmapped&&<PMStatusPill tone="slate">ยังไม่ตั้งชื่อ</PMStatusPill>}</div>
                          </div>
                          <div className="grid xl:grid-cols-[minmax(0,1fr)_320px] gap-4 items-start">
                            <div className="pm-full-preview-stage"><LabelCard order={order} thermalMode={thermalMode} /></div>
                            <aside className="pm-full-preview-info">
                              <div className="text-[9px] uppercase tracking-[.13em] font-black text-slate-400">Order</div>
                              <div className="font-mono text-sm font-black text-slate-800 break-all mt-1">{order.tracking||order.orderId||order.id}</div>
                              <div className="mt-2"><PMStatusPill tone={order.platform==='TIKTOK'?'dark':'orange'}>{order.platform==='TIKTOK'?'TikTok':'Shopee'}</PMStatusPill></div>
                              <div className="grid grid-cols-2 gap-2 mt-4"><div className="pm-mini-stat"><span>Qty</span><strong>{(order.parsedItems||[]).reduce((sum,item)=>sum+(Number(item.qty)||0),0)||order.originalQty||'-'}</strong></div><div className="pm-mini-stat"><span>ลำดับ</span><strong>{index+1}/{FilteredOrders.length}</strong></div></div>
                              <div className="mt-4 pt-4 border-t border-slate-200"><div className="text-[10px] font-black text-slate-500 mb-2">ชื่อภายใน / ผลลัพธ์ที่จะพิมพ์</div><div className="space-y-2">{(order.displayItems||[]).map((text,idx)=><div key={idx} className={`rounded-lg px-3 py-2 text-sm font-black ${text.includes('ตรวจสอบ')||text.includes('ยังไม่ตั้งชื่อ')?'bg-red-50 text-red-700 border border-red-100':'bg-blue-50 text-blue-800 border border-blue-100'}`}>{text}</div>)}</div></div>
                              {row&&(flags.hasSkuReview||flags.hasUnmapped)&&<button onClick={()=>handleFixSkuException(row)} className="pm-secondary-btn w-full justify-center mt-4">ตั้งชื่อ SKU</button>}
                            </aside>
                          </div>
                        </article>})}
                      </div>
'''
text = text[:start_index] + replacement + text[end_index:]

for forbidden in ('reviewPreviewIndex', 'review-preview-prev', 'review-preview-next', 'onReviewPreviewKey', 'CurrentPreviewOrder'):
    if forbidden in text:
        raise SystemExit(f'forbidden single-preview marker still present: {forbidden}')

required = [
    'FilteredOrders.map((order,index)=>',
    '<LabelCard order={order} thermalMode={thermalMode} />',
    'data-pm-review-preview="full"',
    'for (let i = 0; i < MappedOrders.length; i++)',
    'MappedOrders.map((order) => (<LabelCard key={`print-${order.id}`}',
]
for marker in required:
    if marker not in text:
        raise SystemExit(f'required safety marker missing: {marker}')

path.write_text(text, encoding='utf-8')
print('Applied show-all full review previews patch')
