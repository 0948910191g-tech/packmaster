from pathlib import Path

path = Path('index.html')
html = path.read_text(encoding='utf-8')


def replace_once(label, old, new):
    global html
    count = html.count(old)
    if count != 1:
        raise RuntimeError(f'{label}: expected 1 match, found {count}')
    html = html.replace(old, new, 1)


replace_once(
    'Qty correction resolves in same action',
    '''        setOrders(prev => prev.map(order => {
          if (order.id !== targetOrderId) return order;
          return corrections.reduce((next, entry) => reviewOverridesApi.upsertQtyOverride(next, entry.item.text, entry.qty), order);
        }));
        showToast('บันทึก Qty ที่แก้แล้ว — ตรวจใบจริงและติ๊ก “Qty ถูกต้อง” เพื่อปิด Exception', 'success');''',
    '''        const applyQtyCorrections = (order) => {
          let next = corrections.reduce((current, entry) => reviewOverridesApi.upsertQtyOverride(current, entry.item.text, entry.qty), order);
          next = reviewOverridesApi.confirmReview(next, 'qty');
          return next;
        };
        setOrders(prev => prev.map(order => order.id === targetOrderId ? applyQtyCorrections(order) : order));
        setQuickMapState(prev => prev.row?.order
          ? { ...prev, row: { ...prev.row, order: applyQtyCorrections(prev.row.order) } }
          : prev
        );
        showToast('บันทึก Qty ที่แก้และยืนยันแล้ว', 'success');'''
)

replace_once(
    'Review table effective Qty first',
    '''<td className="text-center font-black text-slate-700">{(order.parsedItems||[]).reduce((sum,item)=>sum+(Number(item.qty)||0),0)||order.originalQty||'-'}</td>''',
    '''<td className="text-center font-black text-slate-700">{order.originalQty||(order.parsedItems||[]).reduce((sum,item)=>sum+(Number(item.qty)||0),0)||'-'}</td>'''
)

replace_once(
    'Review card effective Qty first',
    '''const totalQty=(order.parsedItems||[]).reduce((sum,item)=>sum+(Number(item.qty)||0),0)||order.originalQty||'-';''',
    '''const totalQty=order.originalQty||(order.parsedItems||[]).reduce((sum,item)=>sum+(Number(item.qty)||0),0)||'-';'''
)

path.write_text(html, encoding='utf-8')
print('Applied Qty Review resolution/display fixes')
