import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const registry = require('../packmaster-marketplace-registry.js');
const identity = require('../packmaster-registry-identity.js');
const matcher = require('../packmaster-registry-matcher.js');
const bootstrap = require('../packmaster-local-registry-bootstrap.js');
const workspace = require('../packmaster-workspace.js');
const base = require('../data/packmaster-marketplace-registry.json');
const baselineNames = require('../data/packmaster-registry-assignments.json');
const html = fs.readFileSync('index.html', 'utf8');
const selected = registry.getNameableRows(base.platforms.SHOPEE, 'SHOPEE')
  .find(row => row.itemId === '57002458226' && row.variantName === '3ห่อ');
const key = (platform, row) => JSON.stringify([platform, String(row.productId || row.itemId || ''), row.modelId || null, row.variantName || null]);
const fullText = `${selected.title} ${selected.variantName}`;

const unknownText = 'HOYA Wash Gloves ถุงมือเช็ดตัว ชุดทดสอบ 3 ห่อ';
for (const [label,sourceText,names] of [
  ['catalog text',fullText,matcher.newAssignments()],
  ['unrecognised text',unknownText,matcher.newAssignments()],
  ['existing imported names',unknownText,baselineNames],
  ['existing catalog and SKU names',unknownText,bootstrap.ensureRegistryAssignments(base,baselineNames,registry,matcher,identity,baselineNames)]
]) {
test(`Shopee Review saves and rematches ${label} after reload`, async () => {
  const data = new Map();
  const storage = { getItem: key => data.get(key) ?? null, setItem: (key, value) => data.set(key, value) };
  registry.saveStore(storage, base);
  matcher.saveLocalAssignments(storage,names);
  const item = { text: sourceText, qty: 1 };
  const order = { id: 'synthetic-gloves', platform: 'SHOPEE', parsedItems: [item] };
  const context = { cloudMode:false, marketplaceRegistry:base, marketplaceRegistryApi:registry,
    registryMatcherApi:matcher, registryIdentityApi:identity, registryAssignmentsLoaded:true, registryAssignmentsError:'',
    registryAssignments:names, getQuickMapRegistryRowKey:key,
    marketplaceCatalogIndex:identity.buildIndex(base, registry),
    quickMapState:{ sourceText:item.text, itemIndex:0, row:{order,types:['UNMAPPED']}, selectedRegistryRowKey:key('SHOPEE',selected), shortName:'QA ถุงมือ3' },
    window:{localStorage:storage,confirm:()=>true},
    setQuickMapState(value){context.quickMapState=typeof value==='function'?value(context.quickMapState):value;},
    showToast(message){context.message=message;}, setRegistryAssignments(next){context.registryAssignments=next;}
  };
  vm.createContext(context);
  assert.equal(matcher.match(context.marketplaceCatalogIndex, 'SHOPEE', item, context.registryAssignments, identity).status, 'unmatched');
  const state = html.slice(html.indexOf('const quickMapRegistryPlatform ='), html.indexOf('const sortBatchRows ='));
  vm.runInContext(state + '\nglobalThis.allowed = canPersistQuickMap;', context);
  assert.equal(context.allowed, true, 'Shopee full PDF text must allow explicit row confirmation without inventing a separate variant');
  const handlers = html.slice(html.indexOf('const advanceReviewItem ='), html.indexOf('const handleLinkNewRegistrySku ='));
  await vm.runInContext(handlers + '\nhandleSaveQuickMapping();', context);
  assert.match(context.message, /บันทึกคู่/);
  const reloaded = bootstrap.loadLocalStartupSnapshot(storage, {registryApi:registry, matcherApi:matcher, sanitizeSkuRule:rule=>rule});
  const result = matcher.match(identity.buildIndex(reloaded.marketplaceRegistry.store,registry), 'SHOPEE',item,reloaded.registryAssignments,identity);
  assert.equal(result.status,'matched');
  assert.equal(result.rule.shortName,'QA ถุงมือ3');
  if (names.entries.length) {
    const catalogResult = matcher.match(identity.buildIndex(base,registry),'SHOPEE',{text:fullText},reloaded.registryAssignments,identity);
    assert.notEqual(catalogResult.status,'ambiguous','confirmed names must remain consistent between catalog and SKU entries');
  }
});
}

test('Shopee exact full-text confirmation accepts itemId and keeps other pack sizes unresolved', () => {
  const index = identity.buildIndex(base, registry);
  const item = {text:fullText};
  const saved = matcher.upsertManualSkuAlias(matcher.newAssignments(),index,'SHOPEE',item,selected,'ถุงมือ3 ห่อ',identity);
  const backup = workspace.createBackup({settings:{marketplaceRegistry:base,registryAssignments:saved},skuRules:[],batches:[],batchOrders:[],appVersion:'test'},new Date());
  const restored = workspace.validateBackup(JSON.parse(JSON.stringify(backup))).settings.registryAssignments;
  assert.equal(matcher.match(index,'SHOPEE',item,restored,identity).rule?.shortName,'ถุงมือ3 ห่อ');
  for (const text of [`${selected.title} 1ห่อ`,`${selected.title} 2ห่อ`,`${fullText} changed`]) {
    assert.notEqual(matcher.match(index,'SHOPEE',{text},restored,identity).status,'matched');
  }
  assert.throws(()=>matcher.upsertManualSkuAlias(matcher.newAssignments(),index,'SHOPEE',item,{...selected,itemId:'missing'},'Wrong',identity));
  const staleVariantIndex = identity.buildIndex(base,registry);
  staleVariantIndex.SHOPEE.registryRows = staleVariantIndex.SHOPEE.registryRows.map(row=>
    row.productId===selected.itemId && row.modelId===selected.modelId ? {...row,variantName:'6ห่อ'} : row);
  assert.notEqual(matcher.match(staleVariantIndex,'SHOPEE',item,restored,identity).status,'matched',
    'a changed variant label must still require review even when its model ID is retained');
});

test('Shopee newly created Local Wash Gloves survives startup baseline merge and rematches', () => {
  const item = {text:'Synthetic HOYA Wash Gloves unlisted 3 ห่อ',qty:1};
  const data = new Map();
  const storage = {getItem:key=>data.get(key)??null,setItem:(key,value)=>data.set(key,value)};
  registry.saveStore(storage,base);
  const context = {cloudMode:false,marketplaceRegistryLoadError:'',registryAssignmentsError:'',registryAssignmentsLoaded:true,
    marketplaceRegistryBusy:false,workspaceBusy:false,marketplaceRegistry:base,registryAssignments:matcher.newAssignments(),
    quickMapState:{itemIndex:0,shortName:'QA ถุงมือ3',row:{order:{platform:'SHOPEE',parsedItems:[item]}}},
    registryIdentityApi:identity,marketplaceRegistryApi:registry,registryMatcherApi:matcher,
    window:{localStorage:storage,confirm:()=>true},crypto:{randomUUID:()=> 'synthetic-glove'},
    showToast(message){context.message=message;},setMarketplaceRegistry(next){context.marketplaceRegistry=next;},advanceReviewItem(){}
  };
  vm.createContext(context);
  vm.runInContext(html.slice(html.indexOf('const handleCreateLocalProduct ='),html.indexOf('const handleLinkNewRegistrySku ='))+'\nhandleCreateLocalProduct();',context);
  assert.match(context.message,/สร้างสินค้า Local/);
  const reloaded = registry.loadStore(storage).store;
  const merged = bootstrap.mergeRegistryBaseline(reloaded,base,registry);
  assert.equal(matcher.match(identity.buildIndex(merged,registry),'SHOPEE',item,matcher.newAssignments(),identity).rule?.shortName,'QA ถุงมือ3');
});
