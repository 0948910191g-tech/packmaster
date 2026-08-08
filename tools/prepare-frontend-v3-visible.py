from pathlib import Path

path = Path('tools/frontend-v3-visible.txt')
text = path.read_text(encoding='utf-8')

replacements = [
    (
        '<button onClick={()=>moveExceptionCursor(-1)} disabled={safeExceptionCursor<=0} className="pm-page-btn">‹</button>',
        '<button onClick={()=>moveExceptionCursor(-1)} disabled={safeExceptionCursor<=0} className="pm-page-btn" title="ก่อนหน้า" aria-label="ก่อนหน้า">‹</button>',
        'previous Exception button'
    ),
    (
        '<button onClick={()=>moveExceptionCursor(1)} disabled={safeExceptionCursor>=filteredExceptionRows.length-1} className="pm-page-btn">›</button>',
        '<button onClick={()=>moveExceptionCursor(1)} disabled={safeExceptionCursor>=filteredExceptionRows.length-1} className="pm-page-btn" title="ถัดไป" aria-label="ถัดไป">›</button>',
        'next Exception button'
    ),
    (
        'disabled={exportStatus.active||orders.length===0||printBlocked}',
        'disabled={exportStatus.active || orders.length === 0 || printBlocked}',
        'Save PDF safety expression'
    ),
    (
        'disabled={orders.length===0||printBlocked}',
        'disabled={orders.length === 0 || printBlocked}',
        'Print safety expression'
    ),
    (
        'Print / Save PDF จะถูกล็อกจนกว่าจะแก้รายการที่ต้องตรวจครบ',
        'แก้ Exception ให้ครบก่อนพิมพ์ • Print / Save PDF จะถูกล็อกจนกว่าจะแก้รายการที่ต้องตรวจครบ',
        'print safety message'
    ),
    (
        'const effectiveStatus = getEffectiveBatchStatus(batch);\n                          const statusUi = getBatchStatusUi(effectiveStatus);',
        'const statusUi = getBatchStatusUi(getEffectiveBatchStatus(batch));',
        'exception-first Batch status'
    ),
    (
        '<div className="text-lg font-black text-slate-900 mt-1">{activeBatch?.name || \'Active Batch\'}</div><div className="text-xs font-semibold text-slate-400 mt-1">สูงสุดรวม 150 ใบต่อ Batch • Duplicate Guard ทำงานอัตโนมัติ</div>',
        '<div className="flex items-center gap-2 mt-1"><div className="text-lg font-black text-slate-900">{activeBatch?.name || \'Active Batch\'}</div>{activeBatch && (() => { const ui = getBatchStatusUi(getEffectiveBatchStatus(activeBatch)); return <span className={`px-2 py-1 rounded-full border text-[9px] font-black ${ui.className}`}>{ui.label}</span>; })()}</div><div className="text-xs font-semibold text-slate-400 mt-1">สูงสุดรวม 150 ใบต่อ Batch • Duplicate Guard ทำงานอัตโนมัติ</div>',
        'active Batch status'
    )
]

for old, new, label in replacements:
    count = text.count(old)
    if count != 1:
        raise SystemExit(f'{label}: expected once, found {count}')
    text = text.replace(old, new, 1)

mapping_count = text.count('>แก้ Mapping</button>')
if mapping_count < 1:
    raise SystemExit('SKU exception action label anchor not found')
text = text.replace('>แก้ Mapping</button>', '>ตั้งชื่อ SKU</button>')

path.write_text(text, encoding='utf-8')
print('Exception navigation and Pilot Safety UI contracts preserved')
