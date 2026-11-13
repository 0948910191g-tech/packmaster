import test from 'node:test';
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import fs from 'node:fs';
import vm from 'node:vm';
const require = createRequire(import.meta.url);
const registry = require('../packmaster-marketplace-registry.js');
const identity = require('../packmaster-registry-identity.js');
const matcher = require('../packmaster-registry-matcher.js');
const workspace = require('../packmaster-workspace.js');

test('Local product persists through registry and backup without fabricating marketplace IDs', () => {
  const base = require('../data/packmaster-marketplace-registry.json');
  const source = { text: 'Synthetic unlisted wipes | 5 packs', sellerSku: null };
  const local = { id: 'local-test-123', platform: 'TIKTOK', productText: 'Synthetic unlisted wipes', variantText: '5 packs', sellerSku: '', shortName: 'New product' };
  const updated = registry.addLocalProduct(base, local);
  assert.equal(updated.localProducts[0].id, local.id);
  assert.equal(updated.localProducts[0].productId, undefined);
  assert.equal(matcher.match(identity.buildIndex(updated, registry), 'TIKTOK', source, matcher.newAssignments(), identity).rule.shortName, 'New product');
  assert.notEqual(matcher.match(identity.buildIndex(updated, registry), 'TIKTOK', { text: 'Synthetic unlisted wipes | 10 packs' }, matcher.newAssignments(), identity).status, 'matched');
  assert.throws(() => registry.addLocalProduct(updated, {...local, id: 'local-test-456'}), /duplicate/i);
  assert.throws(() => registry.addLocalProduct(updated, {...local, id: 'local-test-456', variantText: '6 packs', productId: 'fake-marketplace-id'}), /invalid/i);
  assert.throws(() => registry.validateStore({...updated, localProducts: 'corrupt'}), /invalid/i);
  const backup = workspace.createBackup({ settings: { marketplaceRegistry: updated }, skuRules: [], batches: [], batchOrders: [], appVersion: 'test' }, new Date());
  const restored = workspace.validateBackup(JSON.parse(JSON.stringify(backup))).settings.marketplaceRegistry;
  assert.deepEqual(registry.validateStore(restored).localProducts, updated.localProducts);
  const reimported = registry.replacePlatformRegistry(updated, base.platforms.TIKTOK);
  assert.deepEqual(reimported.localProducts, updated.localProducts);
});

test('Review creates once in Local and refuses the same identity after it is mapped', () => {
  const html = fs.readFileSync('index.html', 'utf8');
  const handlers = html.slice(html.indexOf('const handleCreateLocalProduct ='), html.indexOf('const handleLinkNewRegistrySku ='));
  const base = require('../data/packmaster-marketplace-registry.json');
  const memory = new Map();
  const storage = { getItem: k => memory.get(k) ?? null, setItem: (k,v) => memory.set(k,v) };
  registry.saveStore(storage, base);
  const item = { text: 'Synthetic Fresh Wipes | 3 packs', sellerSku:null };
  const context = {cloudMode:false, marketplaceRegistryLoadError:'', registryAssignmentsError:'', registryAssignmentsLoaded:true,
    marketplaceRegistryBusy:false, workspaceBusy:false, marketplaceRegistry:base, registryAssignments:matcher.newAssignments(),
    quickMapState:{itemIndex:0, shortName:'QA NEW',row:{order:{platform:'TIKTOK',parsedItems:[item]}}},
    registryIdentityApi:identity, marketplaceRegistryApi:registry, registryMatcherApi:matcher,
    window:{localStorage:storage,confirm:()=>true}, crypto:{randomUUID:()=> 'synthetic-uuid'},
    showToast(message){context.message=message;}, setMarketplaceRegistry(next){context.marketplaceRegistry=next;},
    advanceReviewItem(){}, };
  vm.createContext(context);
  vm.runInContext(handlers + '\nglobalThis.create=handleCreateLocalProduct;', context);
  context.create();
  assert.equal(registry.loadStore(storage).store.localProducts.length,1);
  assert.match(context.message,/สร้างสินค้า Local/);
  context.create();
  assert.equal(registry.loadStore(storage).store.localProducts.length,1);
  assert.match(context.message,/มีชื่อหรือข้อมูลขัดแย้ง/);
});

test('an imported marketplace identity takes precedence as a conflict over a saved Local product', () => {
  const store = require('../data/packmaster-marketplace-registry.json');
  const row = registry.getNameableRows(store.platforms.TIKTOK, 'TIKTOK').find(item => item.productId === '1731567939424716614' && item.variantName);
  const local = {id:'local-conflict',platform:'TIKTOK',productText:row.productName,variantText:row.variantName,sellerSku:'',shortName:'Wrong'};
  assert.throws(() => registry.addLocalProduct(store, {...local, variantText:null}), /invalid/i, 'variant metadata must be explicit');
  const updated = registry.addLocalProduct(store, local);
  const result = matcher.match(identity.buildIndex(updated, registry), 'TIKTOK', {text:`${row.productName} | ${row.variantName}`}, matcher.newAssignments(), identity);
  assert.equal(result.status, 'ambiguous');
  assert.equal(result.reason, 'local_catalog_conflict');
});

test('a Local product with no variant uses only the complete exact source text', () => {
  const base = require('../data/packmaster-marketplace-registry.json');
  const local = {id:'local-no-variant',platform:'SHOPEE',productText:'Synthetic unlisted product exact',variantText:'',sellerSku:'',shortName:'No variant'};
  const updated = registry.addLocalProduct(base, local);
  const index = identity.buildIndex(updated, registry);
  assert.equal(matcher.match(index, 'SHOPEE', {text:local.productText}, matcher.newAssignments(), identity).rule.shortName, 'No variant');
  assert.notEqual(matcher.match(index, 'SHOPEE', {text:local.productText + ' different'}, matcher.newAssignments(), identity).status, 'matched');
});

for (const change of ['registry', 'assignments']) test(`Local creation preserves concurrent ${change} changes during confirmation`, () => {
  const html = fs.readFileSync('index.html', 'utf8');
  const handlers = html.slice(html.indexOf('const handleCreateLocalProduct ='), html.indexOf('const handleLinkNewRegistrySku ='));
  const base = require('../data/packmaster-marketplace-registry.json');
  const memory = new Map();
  const storage = {getItem:k=>memory.get(k)??null,setItem:(k,v)=>memory.set(k,v)};
  registry.saveStore(storage, base);
  matcher.saveLocalAssignments(storage, matcher.newAssignments());
  let changedStore;
  const context = {cloudMode:false,marketplaceRegistryLoadError:'',registryAssignmentsError:'',registryAssignmentsLoaded:true,
    marketplaceRegistryBusy:false,workspaceBusy:false,marketplaceRegistry:base,registryAssignments:matcher.newAssignments(),
    quickMapState:{itemIndex:0,shortName:'New',row:{order:{platform:'SHOPEE',parsedItems:[{text:'Synthetic new item'}]}}},
    registryIdentityApi:identity,marketplaceRegistryApi:registry,registryMatcherApi:matcher,
    window:{localStorage:storage,confirm:()=>{
      if(change==='registry') {
        changedStore=registry.addLocalProduct(base,{id:'local-other-tab',platform:'SHOPEE',productText:'Other saved product',variantText:'',sellerSku:'',shortName:'Other'});
        registry.saveStore(storage,changedStore);
      } else {
        storage.setItem(matcher.LOCAL_ASSIGNMENTS_KEY,'broken');
      }
      return true;
    }},crypto:{randomUUID:()=> 'new'},showToast(message){context.message=message;},
    setMarketplaceRegistry(next){context.marketplaceRegistry=next;},advanceReviewItem(){}};
  vm.createContext(context);
  vm.runInContext(handlers+'\nglobalThis.create=handleCreateLocalProduct;',context);
  context.create();
  assert.deepEqual(registry.loadStore(storage).store,changedStore||base,'must not overwrite or add after concurrent state change');
  assert.match(context.message,/เปลี่ยน|โหลด|ข้อมูล/);
});
