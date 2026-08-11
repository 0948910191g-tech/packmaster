from pathlib import Path

path = Path('index.html')
text = path.read_text(encoding='utf-8')

MARKER = "const shouldBakeThermal = Boolean(thermalMode && isExport);"
if MARKER in text and 'let pdfManifests = [];' in text:
    print('Phase 2 active Batch memory patch already applied')
    raise SystemExit(0)


def replace_once(source: str, old: str, new: str, label: str) -> str:
    count = source.count(old)
    if count != 1:
        raise RuntimeError(f'{label}: expected exactly 1 match, found {count}')
    return source.replace(old, new, 1)


text = replace_once(
    text,
    "    const LabelCard = ({ order, isExport = false, thermalMode = true }) => {\n      const [displayImg, setDisplayImg] = useState(order.pdfImage);",
    "    const LabelCard = ({ order, isExport = false, thermalMode = true }) => {\n      const [displayImg, setDisplayImg] = useState(order.pdfImage);\n      const shouldBakeThermal = Boolean(thermalMode && isExport);",
    'LabelCard thermal mode gate'
)

text = replace_once(
    text,
    "        if (!thermalMode) {\n          setDisplayImg(order.pdfImage);\n          return;\n        }",
    "        if (!shouldBakeThermal) {\n          setDisplayImg(order.pdfImage);\n          return;\n        }",
    'preview thermal bypass'
)

text = replace_once(
    text,
    "      }, [order.pdfImage, thermalMode]);",
    "      }, [order.pdfImage, shouldBakeThermal]);",
    'LabelCard effect dependency'
)

text = replace_once(
    text,
    "          <img src={displayImg} alt=\"Label Base\" style={{ position: 'absolute', top: 0, left: 0, width: '100%', height: '100%', objectFit: 'fill', zIndex: 0 }} />",
    "          <img src={displayImg} alt=\"Label Base\" loading={isExport ? 'eager' : 'lazy'} decoding={isExport ? 'sync' : 'async'} style={{ position: 'absolute', top: 0, left: 0, width: '100%', height: '100%', objectFit: 'fill', zIndex: 0, filter: thermalMode && !isExport ? 'grayscale(100%) brightness(80%) contrast(200%)' : 'none' }} />",
    'preview lazy decode and CSS thermal filter'
)

old_count_pass = """          let totalNewPages = 0;
          let pdfDocuments = [];
          
          for (const file of files) {
            if (!file.name.toLowerCase().endsWith('.pdf')) continue;
            const arrayBuffer = await file.arrayBuffer();
            const pdf = await pdfjs.getDocument({ data: arrayBuffer }).promise;
            totalNewPages += pdf.numPages;
            pdfDocuments.push({ file, pdf });
          }
"""

new_count_pass = """          let totalNewPages = 0;
          let pdfManifests = [];
          
          for (const file of files) {
            if (!file.name.toLowerCase().endsWith('.pdf')) continue;
            let pdf = null;
            try {
              const arrayBuffer = await file.arrayBuffer();
              pdf = await pdfjs.getDocument({ data: arrayBuffer }).promise;
              totalNewPages += pdf.numPages;
              pdfManifests.push({ file, numPages: pdf.numPages });
            } finally {
              if (pdf) await pdf.destroy();
            }
          }
"""
text = replace_once(text, old_count_pass, new_count_pass, 'PDF count pass cleanup')

text = replace_once(
    text,
    "          for (const { file, pdf } of pdfDocuments) {\n            for (let i = 1; i <= pdf.numPages; i++) {",
    "          for (const { file, numPages } of pdfManifests) {\n            let pdf = null;\n            try {\n              const arrayBuffer = await file.arrayBuffer();\n              pdf = await pdfjs.getDocument({ data: arrayBuffer }).promise;\n              for (let i = 1; i <= numPages; i++) {",
    'sequential PDF processing start'
)

text = replace_once(
    text,
    "              await page.render({ canvasContext: context, viewport }).promise;\n              const pdfImage = canvas.toDataURL('image/jpeg', 0.9);",
    "              await page.render({ canvasContext: context, viewport }).promise;\n              const pdfImage = canvas.toDataURL('image/jpeg', 0.9);\n              canvas.width = 1;\n              canvas.height = 1;\n              if (typeof page.cleanup === 'function') page.cleanup();",
    'page canvas cleanup'
)

old_processing_end = """              allNewOrders.push({ 
                  id: `label-${Date.now()}-${allNewOrders.length}-${i}`, 
                  tracking: trackingMatch ? trackingMatch[0] : `PAGE-${i}`, 
                  parsedItems: parsedItems,
                  pdfImage,
                  sourceFileName: file.name,
                  sourcePage: i,
                  platform,
                  orderId: currentOrderId,
                  declaredTotalQty,
                  parserWarning
              });
            }
          }
          
          if (allNewOrders.length > 0) {
"""

new_processing_end = """              allNewOrders.push({ 
                  id: `label-${Date.now()}-${allNewOrders.length}-${i}`, 
                  tracking: trackingMatch ? trackingMatch[0] : `PAGE-${i}`, 
                  parsedItems: parsedItems,
                  pdfImage,
                  sourceFileName: file.name,
                  sourcePage: i,
                  platform,
                  orderId: currentOrderId,
                  declaredTotalQty,
                  parserWarning
              });
              }
            } finally {
              if (pdf) await pdf.destroy();
            }
          }
          
          if (allNewOrders.length > 0) {
"""
text = replace_once(text, old_processing_end, new_processing_end, 'sequential PDF processing cleanup')

path.write_text(text, encoding='utf-8')
print('Applied Phase 2 active Batch memory patch')
