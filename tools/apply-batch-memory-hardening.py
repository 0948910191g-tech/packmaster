from pathlib import Path
import re

path = Path('index.html')
text = path.read_text(encoding='utf-8')

if 'const thermalImagePromiseCache = new Map();' in text and 'exportRenderOrder &&' in text and 'batch.sourceFileNames' in text:
    print('Batch memory hardening already applied')
    raise SystemExit(0)


def replace_once(source, old, new, label):
    count = source.count(old)
    if count != 1:
        raise RuntimeError(f'{label}: expected exactly 1 match, found {count}')
    return source.replace(old, new, 1)


def regex_once(source, pattern, replacement, label):
    compiled = re.compile(pattern, re.S)
    matches = list(compiled.finditer(source))
    if len(matches) != 1:
        raise RuntimeError(f'{label}: expected exactly 1 regex match, found {len(matches)}')
    return compiled.sub(replacement, source, count=1)

label_block = '''    const thermalImagePromiseCache = new Map();

    const acquireThermalImage = (pdfImage) => {
      if (!pdfImage) return Promise.resolve('');
      let entry = thermalImagePromiseCache.get(pdfImage);
      if (!entry) {
        const promise = new Promise((resolve, reject) => {
          const img = new Image();
          img.onload = () => {
            try {
              const cvs = document.createElement('canvas');
              cvs.width = img.width;
              cvs.height = img.height;
              const ctx = cvs.getContext('2d');
              ctx.filter = 'grayscale(100%) brightness(80%) contrast(200%)';
              ctx.drawImage(img, 0, 0);
              const thermalImage = cvs.toDataURL('image/jpeg', 0.9);
              cvs.width = 1;
              cvs.height = 1;
              resolve(thermalImage);
            } catch (error) {
              thermalImagePromiseCache.delete(pdfImage);
              reject(error);
            }
          };
          img.onerror = () => {
            thermalImagePromiseCache.delete(pdfImage);
            reject(new Error('แปลงภาพ Thermal ไม่สำเร็จ'));
          };
          img.src = pdfImage;
        });
        entry = { refs: 0, promise };
        thermalImagePromiseCache.set(pdfImage, entry);
      }
      entry.refs += 1;
      return entry.promise;
    };

    const releaseThermalImage = (pdfImage) => {
      const entry = thermalImagePromiseCache.get(pdfImage);
      if (!entry) return;
      entry.refs = Math.max(0, (entry.refs || 0) - 1);
      if (entry.refs === 0) thermalImagePromiseCache.delete(pdfImage);
    };

    const LabelCard = ({ order, isExport = false, thermalMode = true }) => {
      const [displayImg, setDisplayImg] = useState(order.pdfImage);

      useEffect(() => {
        if (!order || !order.pdfImage) return;
        if (!thermalMode) {
          setDisplayImg(order.pdfImage);
          return;
        }

        let cancelled = false;
        setDisplayImg(order.pdfImage);
        acquireThermalImage(order.pdfImage)
          .then((thermalImage) => {
            if (!cancelled) setDisplayImg(thermalImage);
          })
          .catch((error) => {
            console.warn('Thermal preview fallback to original image', error);
            if (!cancelled) setDisplayImg(order.pdfImage);
          });

        return () => {
          cancelled = true;
          releaseThermalImage(order.pdfImage);
        };
      }, [order.pdfImage, thermalMode]);

      if (!order || !order.pdfImage) return null;
      
      const itemCount = order.displayItems ? order.displayItems.length : 0;
      let maxLen = itemCount > 0 ? Math.max(...order.displayItems.map(t => t.length), 0) : 0;
      
      let fontSize = '42pt';
      let lineHeight = 1.2;
      
      if (itemCount === 1) {
          fontSize = maxLen > 20 ? '18pt' : maxLen > 12 ? '24pt' : maxLen > 8 ? '32pt' : '40pt';
          lineHeight = 1.1;
      } else if (itemCount === 2) {
          fontSize = maxLen > 22 ? '13pt' : maxLen > 15 ? '16pt' : maxLen > 10 ? '20pt' : '22pt';
          lineHeight = 1.1;
      } else if (itemCount === 3) {
          fontSize = maxLen > 20 ? '11pt' : '13pt'; 
          lineHeight = 1.1;
      } else {
          fontSize = '10pt'; 
          lineHeight = 1.0;
      }

      return (
        <div className={`shrink-0 box-border ${isExport ? '' : 'border-2 border-blue-50 shadow-xl shadow-blue-900/5 rounded-2xl'}`} style={{ width: '100mm', height: '150mm', backgroundColor: '#ffffff', position: 'relative', overflow: 'hidden', pageBreakAfter: 'always', margin: 0, display: 'block', isolation: 'isolate' }}>
          <img src={displayImg} alt="Label Base" style={{ position: 'absolute', top: 0, left: 0, width: '100%', height: '100%', objectFit: 'fill', zIndex: 0 }} />
          
          {order.displayItems && order.displayItems.length > 0 && (
            <div className="label-overlay" style={{ position: 'absolute', zIndex: 10, boxSizing: 'border-box', bottom: '24px', left: '16px', right: '16px', height: '18%', border: '4px dashed #172554', borderRadius: '14px', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: '8px', gap: '4px', backgroundColor: 'rgba(255,255,255,0.90)', backdropFilter: 'blur(2px)', overflow: 'hidden' }}>
              {order.displayItems.map((text, idx) => (
                <p key={idx} className="label-overlay-text" style={{ fontFamily: '\"Noto Sans Thai\", sans-serif', fontWeight: 800, color: '#172554', lineHeight: lineHeight, margin: 0, textAlign: 'center', wordBreak: 'break-word', width: '100%', letterSpacing: '-0.02em', fontSize: fontSize, textShadow: '3px 3px 0 #fff, -3px -3px 0 #fff, 3px -3px 0 #fff, -3px 3px 0 #fff, 0 3px 0 #fff, 0 -3px 0 #fff, 3px 0 0 #fff, -3px 0 0 #fff, 2px 4px 8px rgba(23, 37, 84, 0.15)' }}>
                  {text}
                </p>
              ))}
            </div>
          )}
        </div>
      );
    };

    const normalizeRuleKeyword'''

text = regex_once(
    text,
    r'''    const LabelCard = \(\{ order, isExport = false, thermalMode = true \}\) => \{.*?\n    \};\n\n    const normalizeRuleKeyword''',
    label_block,
    'LabelCard thermal sharing'
)

text = replace_once(
    text,
    "      const [exportStatus, setExportStatus] = useState({ active: false, current: 0, total: 0 });\n      const [previewMode, setPreviewMode] = useState('labels');",
    "      const [exportStatus, setExportStatus] = useState({ active: false, current: 0, total: 0 });\n      const [exportRenderOrder, setExportRenderOrder] = useState(null);\n      const [printRenderActive, setPrintRenderActive] = useState(false);\n      const [previewMode, setPreviewMode] = useState('labels');",
    'render lifecycle state'
)

text = regex_once(
    text,
    r'''      useEffect\(\(\) => \{\n        let cancelled = false;\n        const loadBatchSourceSummaries = async \(\) => \{.*?\n      \}, \[visibleBatches, activeBatchId, orders, batchApi, batchSourceFilesApi\]\);''',
    '''      useEffect(() => {
        if (!batchSourceFilesApi || !batchApi) {
          setBatchSourceSummaries({});
          return;
        }
        const entries = visibleBatches.map((batch) => {
          const sourceFileNames = batch.id === activeBatchId
            ? batchApi.extractSourceFileNames(orders)
            : (Array.isArray(batch.sourceFileNames) ? batch.sourceFileNames : []);
          const summary = batchSourceFilesApi.summarizeBatchSourceFiles(
            sourceFileNames.map((sourceFileName) => ({ sourceFileName })),
            2
          );
          if (batch.id !== activeBatchId && !Array.isArray(batch.sourceFileNames) && Number(batch.totalOrders) > 0) {
            summary.label = 'เปิด Batch ครั้งหนึ่งเพื่ออัปเดตชื่อไฟล์';
          }
          return [batch.id, summary];
        });
        setBatchSourceSummaries(Object.fromEntries(entries));
      }, [visibleBatches, activeBatchId, orders, batchApi, batchSourceFilesApi]);''',
    'lightweight Batch source summaries'
)

text = replace_once(
    text,
    "          await batchApi.saveBatch(updated, orders);\n          return true;",
    "          const storedMeta = await batchApi.saveBatch(updated, orders);\n          upsertBatchMeta(storedMeta);\n          return true;",
    'snapshot metadata refresh'
)

text = replace_once(
    text,
    "            await batchApi.saveBatch(updated, orders);\n            upsertBatchMeta(updated);",
    "            const storedMeta = await batchApi.saveBatch(updated, orders);\n            upsertBatchMeta(storedMeta);",
    'autosave metadata refresh'
)

print_wait_helper = '''

    const waitForPrintRender = async (container, scopedOrders, thermalMode, timeoutMs = 15000) => {
      if (!container) throw new Error('ไม่พบพื้นที่สำหรับพิมพ์');
      const orders = Array.isArray(scopedOrders) ? scopedOrders : [];
      const startedAt = Date.now();
      while (true) {
        const images = Array.from(container.querySelectorAll('img[alt="Label Base"]'));
        const ready = images.length === orders.length && images.every((image, index) => {
          const sourceOrder = orders[index];
          return image.complete && image.naturalWidth > 0 && (!thermalMode || !sourceOrder || image.src !== sourceOrder.pdfImage);
        });
        if (ready) return;
        if (Date.now() - startedAt > timeoutMs) {
          throw new Error('รอเตรียมภาพสำหรับพิมพ์ไม่สำเร็จภายในเวลาที่กำหนด');
        }
        await new Promise(resolve => setTimeout(resolve, 50));
      }
    };
'''
text = replace_once(
    text,
    "    // PackMaster Frontend V3 — presentation-only helpers.",
    print_wait_helper + "\n    // PackMaster Frontend V3 — presentation-only helpers.",
    'print readiness helper'
)

text = regex_once(
    text,
    r'''      const handlePrint = async \(mode = 'FULL_BATCH', override = false\) => \{.*?\n      \};\n\n      const handleEmergencyPrint''',
    '''      const handlePrint = async (mode = 'FULL_BATCH', override = false) => {
        if (mode === 'FULL_BATCH' && printBlocked && !override) {
          showToast(`ยังพิมพ์ทั้ง Batch ไม่ได้ — มี Exception ${exceptionRows.length} รายการ`, 'error');
          return;
        }
        const scopedOrders = printScopeApi
          ? printScopeApi.selectPrintOrders(MappedOrders, mode, order => getReviewFlags(order).ready)
          : (mode === 'READY_ONLY' ? MappedOrders.filter(order => getReviewFlags(order).ready) : MappedOrders);
        if (scopedOrders.length === 0) {
          showToast('ไม่มีรายการพร้อมพิมพ์ใน Scope นี้', 'error');
          return;
        }
        if (mode === 'FULL_BATCH' && printBlocked && override) {
          const confirmed = window.confirm(`Batch นี้ยังมี ${exceptionRows.length} Exception\\n\\nต้องการพิมพ์ทั้ง Batch ต่อหรือไม่? รายการที่ยังไม่พร้อมอาจมีชื่อสินค้าไม่สมบูรณ์`);
          if (!confirmed) return;
        }

        setPrintScopeMode(mode);
        setPrintRenderActive(true);
        await new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)));

        try {
          await waitForPrintRender(document.querySelector('.print-area'), scopedOrders, thermalMode);
          if (mode === 'FULL_BATCH' && !printBlocked) await markActiveBatchPrinted();
          window.print();
        } catch (err) {
          console.error('PackMaster print preparation failed:', err);
          showToast(err.message || 'เตรียมหน้าพิมพ์ไม่สำเร็จ', 'error');
        } finally {
          setPrintRenderActive(false);
        }
      };

      const handleEmergencyPrint''',
    'lazy print lifecycle'
)

text = replace_once(
    text,
    "            const element = document.getElementById(`render-target-${order.id}`);",
    "            setExportRenderOrder(order);\n            await new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)));\n\n            const element = document.getElementById(`render-target-${order.id}`);",
    'lazy export target activation'
)

text = replace_once(
    text,
    "            pdf.addImage(canvas.toDataURL('image/jpeg', 0.98), 'JPEG', 0, 0, 100, 150);\n            exportedPages++;",
    "            const exportedImage = canvas.toDataURL('image/jpeg', 0.98);\n            pdf.addImage(exportedImage, 'JPEG', 0, 0, 100, 150);\n            canvas.width = 1;\n            canvas.height = 1;\n            exportedPages++;",
    'release export canvas'
)

text = replace_once(
    text,
    "        } finally {\n          setExportStatus({ active: false, current: 0, total: 0 });\n        }\n      };",
    "        } finally {\n          setExportRenderOrder(null);\n          setExportStatus({ active: false, current: 0, total: 0 });\n        }\n      };",
    'export target cleanup'
)

text = replace_once(
    text,
    "{ReviewDisplayOrders.map((order,index)=>{const flags=getReviewFlags(order);",
    "{visibleReviewDisplayOrders.map((order,index)=>{const displayIndex=(reviewPage-1)*reviewPageSize+index;const flags=getReviewFlags(order);",
    'paginated label preview'
)
text = text.replace('ลำดับ {index+1}/{ReviewDisplayOrders.length}', 'ลำดับ {displayIndex+1}/{ReviewDisplayOrders.length}', 1)
text = text.replace('<strong>{index+1}/{ReviewDisplayOrders.length}</strong>', '<strong>{displayIndex+1}/{ReviewDisplayOrders.length}</strong>', 1)
text = replace_once(
    text,
    "{previewMode==='table'&&ReviewDisplayOrders.length>0&&<div className=\"pm-pagination mt-4\">",
    "{ReviewDisplayOrders.length>0&&<div className=\"pm-pagination mt-4\">",
    'preview pagination visibility'
)

text = regex_once(
    text,
    r'''          <div className="fixed pointer-events-none opacity-0" style=\{\{ top: 0, left: 0, width: '100mm', height: 0, overflow: 'hidden', zIndex: -100 \}\}>\n            \{MappedOrders\.map\(\(order\) => \(\n              <div key=\{`render-arena-\$\{order\.id\}`\} id=\{`render-target-\$\{order\.id\}`\} style=\{\{ position: 'relative', width: '100mm', height: '150mm', backgroundColor: 'white' \}\}>\n                <LabelCard order=\{order\} thermalMode=\{thermalMode\} isExport=\{true\} />\n              </div>\n            \)\)}\n          </div>\n          <div className="hidden print-area w-full text-black">\n            \{PrintScopedOrders\.map\(\(order\) => \(<LabelCard key=\{`print-\$\{order\.id\}`\} order=\{order\} thermalMode=\{thermalMode\} isExport=\{true\} />\)\)}\n          </div>''',
    '''          {exportRenderOrder && <div className="fixed pointer-events-none opacity-0" style={{ top: 0, left: 0, width: '100mm', height: 0, overflow: 'hidden', zIndex: -100 }}>
            <div key={`render-arena-${exportRenderOrder.id}`} id={`render-target-${exportRenderOrder.id}`} style={{ position: 'relative', width: '100mm', height: '150mm', backgroundColor: 'white' }}>
              <LabelCard order={exportRenderOrder} thermalMode={thermalMode} isExport={true} />
            </div>
          </div>}
          {printRenderActive && <div className="hidden print-area w-full text-black">
            {PrintScopedOrders.map((order) => (<LabelCard key={`print-${order.id}`} order={order} thermalMode={thermalMode} isExport={true} />))}
          </div>}''',
    'lazy hidden render arenas'
)

path.write_text(text, encoding='utf-8')
print('Applied guarded Batch memory hardening to index.html')
