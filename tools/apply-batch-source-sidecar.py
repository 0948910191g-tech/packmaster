from pathlib import Path

path = Path('index.html')
text = path.read_text(encoding='utf-8')

if 'batchSourceFilesApi.getBatchSourceFileNames(batch.id)' in text:
    print('Batch filename sidecar UI already applied')
    raise SystemExit(0)

old = '''      useEffect(() => {
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
      }, [visibleBatches, activeBatchId, orders, batchApi, batchSourceFilesApi]);'''

new = '''      useEffect(() => {
        if (!batchSourceFilesApi) {
          setBatchSourceSummaries({});
          return;
        }

        if (activeBatchId) {
          batchSourceFilesApi.rememberBatchSourceFiles(activeBatchId, orders);
        }

        const entries = visibleBatches.map((batch) => {
          if (batch.id === activeBatchId) {
            return [batch.id, batchSourceFilesApi.summarizeBatchSourceFiles(orders, 2)];
          }

          const sourceFileNames = batchSourceFilesApi.getBatchSourceFileNames(batch.id);
          if (sourceFileNames === null) {
            return [batch.id, {
              names: [],
              total: 0,
              hiddenCount: 0,
              label: Number(batch.totalOrders) > 0
                ? 'เปิด Batch ครั้งหนึ่งเพื่ออัปเดตชื่อไฟล์'
                : 'ยังไม่มีไฟล์'
            }];
          }

          return [batch.id, batchSourceFilesApi.summarizeBatchSourceFiles(
            sourceFileNames.map((sourceFileName) => ({ sourceFileName })),
            2
          )];
        });
        setBatchSourceSummaries(Object.fromEntries(entries));
      }, [visibleBatches, activeBatchId, orders, batchSourceFilesApi]);'''

if text.count(old) != 1:
    raise RuntimeError(f'Expected exactly one Batch source summary effect, found {text.count(old)}')
text = text.replace(old, new, 1)

# Keep the tiny filename sidecar tidy when a Batch is explicitly deleted.
delete_marker = '          await batchApi.deleteBatch(batch.id);'
if text.count(delete_marker) == 1:
    text = text.replace(
        delete_marker,
        delete_marker + "\n          if (batchSourceFilesApi) batchSourceFilesApi.forgetBatchSourceFiles(batch.id);",
        1
    )
elif text.count(delete_marker) > 1:
    raise RuntimeError(f'Expected at most one Batch delete marker, found {text.count(delete_marker)}')

path.write_text(text, encoding='utf-8')
print('Applied lightweight Batch filename sidecar UI')
