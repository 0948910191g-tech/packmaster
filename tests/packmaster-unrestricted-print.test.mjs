import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import {createRequire} from 'node:module';
const require=createRequire(import.meta.url);
const html=fs.readFileSync(new URL('../index.html',import.meta.url),'utf8');
const snapshots=require('../packmaster-reprint-snapshot.js');
const safety=require('../packmaster-pilot-safety.js');
const batch=require('../packmaster-batch.js');

test('unresolved full Batch prints and remains marked printed',async()=>{
 const events=[];let saved;
 const store=new Map();const storage={getItem:k=>store.get(k)||null,setItem:(k,v)=>store.set(k,v)};
 const order={id:'o1',displayItems:['ยังไม่ตั้งชื่อ'],originalQty:1,qtyWarning:true,unresolvedSku:true,resolvedAudit:[]};
 const s={Date,console,activeBatch:{id:'b1'},activeBatchId:'b1',batchApi:{...batch,saveBatch:async m=>(saved=m),loadBatch:async()=>({meta:saved,orders:[order]})},batchStorageReady:true,reprintSnapshotApi:{...snapshots,validateSnapshot:value=>snapshots.validateSnapshot(value),getBatchSnapshot:id=>snapshots.getBatchSnapshot(id,storage),clearBatchSnapshot:id=>snapshots.clearBatchSnapshot(id,storage)},reviewSummary:{total:1,ready:0,reviewSku:1},LiveMappedOrders:[order],MappedOrders:[order],orders:[order],getReviewFlags:()=>({ready:false}),upsertBatchMeta:()=>{},showToast:m=>events.push(m),printScopeApi:null,exceptionRows:[{types:['UNMAPPED']}],setPrintScopeMode(){},setPrintRenderActive(){},requestAnimationFrame:f=>f(),waitForPrintRender:async()=>{},document:{querySelector:()=>({})},thermalMode:false,window:{print:()=>events.push('print'),confirm:()=>false}};
 vm.createContext(s);
 const mark=html.slice(html.indexOf('const markActiveBatchPrinted ='),html.indexOf('const handleClearActiveBatch'));
 const print=html.slice(html.indexOf('const handlePrint ='),html.indexOf('useEffect(() => {',html.indexOf('const handlePrint =')));
 vm.runInContext(mark+print+'\nglobalThis.runPrint=handlePrint;',s);
 await s.runPrint('FULL_BATCH');
 assert.ok(events.includes('print'),'full Batch must print without blocking or confirmation');
 assert.ok(saved?.printedAt,'printed status must be persisted');
 assert.equal(safety.getEffectiveBatchStatus({...saved,totalOrders:1,unmappedCount:1}),'COMPLETED');
 assert.equal(saved.resolvedSnapshot.orders[0].displayItems[0],'ยังไม่ตั้งชื่อ');
});

test('registry results and warnings can be saved as printed history',()=>{
 const store=new Map();const storage={getItem:k=>store.get(k)||null,setItem:(k,v)=>store.set(k,v)};
 const order={id:'o2',displayItems:['ยังไม่ตั้งชื่อ','SKU'],originalQty:1,qtyWarning:true,unresolvedSku:true,resolvedAudit:[{sourceText:'SKU',effectiveQty:1,resolution:'registry',keyword:'SKU',shortName:'สินค้า'}]};
 const result=snapshots.saveBatchSnapshot('b2',[order],'2026-11-05T00:00:00Z',()=>true,storage);
 assert.equal(result.orders[0].resolvedAudit[0].resolution,'registry');
 assert.equal(snapshots.getBatchSnapshot('b2',storage).orders[0].unresolvedSku,true);
});

test('full PDF export proceeds and records printed status with unresolved items',async()=>{
 const events=[];const order={id:'o3'};
 class PDF {addImage(){} save(){events.push('download')} addPage(){}}
 const s={Date,console,MappedOrders:[order],exceptionRows:[{}],printScopeApi:null,getReviewFlags:()=>({ready:false}),setExportStatus:()=>{},setExportRenderOrder:()=>{},setTimeout:f=>f(),requestAnimationFrame:f=>f(),document:{getElementById:()=>({})},waitForLabelRender:async()=>{},thermalMode:false,window:{jspdf:{jsPDF:PDF},html2canvas:async()=>({toDataURL:()=>'',width:2,height:2}),confirm:()=>false},markActiveBatchPrinted:async()=>(events.push('marked'),true),showToast:()=>{}};
 vm.createContext(s);const start=html.indexOf('const handleExportPDF =');const end=html.indexOf('const prepareSkuRules',start);vm.runInContext(html.slice(start,end)+'\nglobalThis.runExport=handleExportPDF;',s);
 await s.runExport('FULL_BATCH');assert.deepEqual(events,['download','marked']);
});

test('autosave does not erase printed timestamp merely because exceptions remain',()=>{
 assert.match(html,/printedAt: activeBatch\.printedAt/);
 assert.doesNotMatch(html,/printedAt: printBlocked \? null/);
});
