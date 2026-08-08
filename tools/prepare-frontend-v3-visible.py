from pathlib import Path

path = Path('tools/frontend-v3-visible.txt')
text = path.read_text(encoding='utf-8')
old_prev = '<button onClick={()=>moveExceptionCursor(-1)} disabled={safeExceptionCursor<=0} className="pm-page-btn">‹</button>'
new_prev = '<button onClick={()=>moveExceptionCursor(-1)} disabled={safeExceptionCursor<=0} className="pm-page-btn" title="ก่อนหน้า" aria-label="ก่อนหน้า">‹</button>'
old_next = '<button onClick={()=>moveExceptionCursor(1)} disabled={safeExceptionCursor>=filteredExceptionRows.length-1} className="pm-page-btn">›</button>'
new_next = '<button onClick={()=>moveExceptionCursor(1)} disabled={safeExceptionCursor>=filteredExceptionRows.length-1} className="pm-page-btn" title="ถัดไป" aria-label="ถัดไป">›</button>'
for old, new, label in [(old_prev,new_prev,'previous'),(old_next,new_next,'next')]:
    count = text.count(old)
    if count != 1:
        raise SystemExit(f'{label} Exception button anchor expected once, found {count}')
    text = text.replace(old,new,1)
path.write_text(text, encoding='utf-8')
print('Exception navigation labels preserved')
