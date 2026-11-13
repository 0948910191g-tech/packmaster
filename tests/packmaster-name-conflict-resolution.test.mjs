import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import {createRequire} from 'node:module';
const require=createRequire(import.meta.url);
const r=require('../packmaster-marketplace-registry.js'),i=require('../packmaster-registry-identity.js'),m=require('../packmaster-registry-matcher.js');
const store=require('../data/packmaster-marketplace-registry.json');
const row=r.getNameableRows(store.platforms.SHOPEE,'SHOPEE').find(x=>x.itemId==='50301286439');
const index=i.buildIndex(store,r);
const catalog={platform:'SHOPEE',identityType:'catalog_row',sellerSku:null,productId:row.itemId,modelId:row.modelId,variantName:null,shortName:'เด้งม่วง5 ชม5'};
const sku={...catalog,identityType:'seller_sku',sellerSku:'5แถม5',variantName:'5แถม5',shortName:'5แถม5'};
const names=m.validateAssignments({...m.newAssignments(),entries:[catalog,sku]});
// Product text only, read from affected Review; no order/customer identifiers.
const item={text:'(5 แถม 5) HOYA baby ทิชชูเปียกสูตรมีกลิ่นและไมมีกลิ่น 80 แผน / 5 แถม 5 หอ สูตรออนโยนผานุมชุมชื้นไมบาดผิว',qty:2};
function conflict() {try{m.upsertManualSkuAlias(names,index,'SHOPEE',item,row,'5แถม5',i);}catch(error){return error;}throw Error('Expected conflict');}
test('actual two-name pattern reports both entries without changing data',()=>{
 const before=JSON.stringify(names),error=conflict();
 assert.equal(error.code,'registry_name_conflict');
 assert.deepEqual(error.conflictingEntries.map(x=>x.shortName),['เด้งม่วง5 ชม5','5แถม5']);
 assert.equal(JSON.stringify(names),before);
});
test('explicit confirmation reconciles only this target and rematches actual PDF text',()=>{
 const entries=conflict().conflictingEntries;
 const saved=m.upsertManualSkuAlias(names,index,'SHOPEE',item,row,'5แถม5',i,{confirmedConflictEntries:entries});
 assert.equal(saved.entries.length,2);
 assert.ok(saved.entries.every(x=>x.shortName==='5แถม5'));
 const reloaded=m.validateAssignments(JSON.parse(JSON.stringify(saved)));
 assert.equal(m.match(index,'SHOPEE',item,reloaded,i).rule?.shortName,'5แถม5');
 assert.notEqual(m.match(index,'SHOPEE',{text:item.text+' changed'},reloaded,i).status,'matched');
 assert.throws(()=>m.upsertManualSkuAlias(names,index,'SHOPEE',item,row,'5แถม5',i,{confirmedConflictEntries:[]}),/ชื่อ|changed|conflict/i);
});
for(const [accept,stale] of [[false,false],[true,false],[true,true]]) test(`Review conflict confirmation ${stale?'detects concurrent changes':accept?'accepts':'cancels'} safely`,async()=>{
 const html=fs.readFileSync('index.html','utf8'),memory=new Map();
 const storage={getItem:k=>memory.get(k)??null,setItem:(k,v)=>memory.set(k,v)};
 r.saveStore(storage,store);m.saveLocalAssignments(storage,names);
 const key=(p,x)=>JSON.stringify([p,String(x.productId||x.itemId||''),x.modelId||null,x.variantName||null]);
 const messages=[];
 const context={cloudMode:false,marketplaceRegistry:store,marketplaceRegistryApi:r,registryMatcherApi:m,registryIdentityApi:i,
 registryAssignmentsLoaded:true,registryAssignmentsError:'',registryAssignments:names,getQuickMapRegistryRowKey:key,
 marketplaceCatalogIndex:index,canPersistQuickMap:true,quickMapSelectedRegistryRow:row,
 quickMapState:{itemIndex:0,shortName:'5แถม5',selectedRegistryRowKey:key('SHOPEE',row),row:{order:{platform:'SHOPEE',parsedItems:[item]}}},
 window:{localStorage:storage,confirm:message=>{messages.push(message);
   if(stale&&messages.length===2)m.saveLocalAssignments(storage,{...names,entries:[catalog,{...sku,shortName:'Changed in other tab'}]});
   return messages.length===1||accept;}},
 setRegistryAssignments(){},advanceReviewItem(){},showToast(message){context.message=message;}};
 vm.createContext(context);
 await vm.runInContext(html.slice(html.indexOf('const handleSaveQuickMapping ='),html.indexOf('const handleCreateLocalProduct ='))+'\nhandleSaveQuickMapping();',context);
 assert.equal(messages.length,2,'must explain existing names and ask separately');
 assert.ok(messages[1].includes('เด้งม่วง5 ชม5')&&messages[1].includes('5แถม5'));
 const saved=m.loadLocalAssignments(storage);
 if(stale){assert.equal(saved.entries[1].shortName,'Changed in other tab');assert.match(context.message,/ข้อมูลเปลี่ยนระหว่างยืนยัน/);}
 else if(accept)assert.equal(m.match(index,'SHOPEE',item,saved,i).rule?.shortName,'5แถม5');
 else assert.deepEqual(saved,names);
});
