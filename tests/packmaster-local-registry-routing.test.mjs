import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const matcher = require('../packmaster-registry-matcher.js');

test('Local registry assignments persist across reload and reject corrupt data', () => {
  const data = new Map();
  const storage = {getItem: k => data.get(k) ?? null, setItem: (k,v) => data.set(k,v)};
  const assignments = {schema:matcher.SCHEMA,version:1,entries:[{platform:'TIKTOK',sellerSku:'SKU-1',productId:'p1',modelId:null,shortName:'สินค้า'}]};
  matcher.saveLocalAssignments(storage,assignments);
  assert.deepEqual(matcher.loadLocalAssignments(storage),assignments);
  storage.setItem(matcher.LOCAL_ASSIGNMENTS_KEY,'invalid');
  assert.throws(() => matcher.loadLocalAssignments(storage));
});

test('Local packing uses the registry matcher and never falls back to keyword rules', () => {
  const html = fs.readFileSync(new URL('../index.html', import.meta.url), 'utf8');
  const start = html.indexOf('const getMatchResult = useCallback(');
  const end = html.indexOf('const handleFileUpload =', start);
  assert.ok(start >= 0 && end > start);
  const context = {
    cloudMode: false, skuRules: [{keyword:'SKU',shortName:'legacy'}],
    matchSkuRule: () => ({status:'matched',rule:{shortName:'legacy'}}),
    registryMatcherApi: {match: () => ({status:'matched',rule:{shortName:'registry'}})},
    marketplaceCatalogIndex:{},registryAssignmentsLoaded:true,registryAssignments:{},registryIdentityApi:{},registryAssignmentsError:'',
    useCallback: fn => fn,
  };
  vm.createContext(context);
  vm.runInContext(html.slice(start,end)+'\nglobalThis.match = getMatchResult;',context);
  assert.equal(context.match({sellerSku:'SKU'},'TIKTOK').rule.shortName,'registry');
});

test('Local assignment handler persists verified SKU before updating state', async () => {
  const html = fs.readFileSync(new URL('../index.html', import.meta.url), 'utf8');
  const start = html.indexOf('const saveRegistryAssignment =');
  const end = html.indexOf('const handleSaveQuickMapping =', start);
  const data = new Map();
  const storage = {getItem:k=>data.get(k) ?? null,setItem:(k,v)=>data.set(k,v)};
  let state=matcher.newAssignments();
  const identity = {resolve:()=>({status:'found',sellerSku:'SKU-1',candidate:{platform:'TIKTOK',productId:'p1',modelId:null}})};
  const c={registryMatcherApi:matcher,registryIdentityApi:identity,marketplaceCatalogIndex:{},registryAssignmentsLoaded:true,registryAssignmentsError:'',registryAssignmentsBusy:false,registryAssignments:state,cloudMode:false,window:{localStorage:storage},setRegistryAssignmentsBusy(){},setRegistryAssignments:v=>state=v};
  vm.createContext(c);
  vm.runInContext(html.slice(start,end)+'\nglobalThis.save=saveRegistryAssignment;',c);
  await c.save('TIKTOK',{sellerSku:'SKU-1'},'สินค้า A');
  assert.equal(state.entries[0].shortName,'สินค้า A');
  assert.deepEqual(matcher.loadLocalAssignments(storage),state);
  c.registryAssignments=state;
  storage.setItem=()=>{throw new Error('quota exceeded')};
  await assert.rejects(c.save('TIKTOK',{sellerSku:'SKU-1'},'สินค้า B'),/quota/);
  assert.equal(state.entries[0].shortName,'สินค้า A');
});

test('Workspace backup and restore preserve verified registry assignments', () => {
  const html = fs.readFileSync(new URL('../index.html', import.meta.url), 'utf8');
  assert.match(html, /registryAssignments:\s*registryAssignments\s*\|\|\s*null/,
    'Workspace backup must include verified registry assignments');
  assert.match(html, /backup\.settings\.registryAssignments\s*!=\s*null/);
  assert.match(html, /registryMatcherApi\.validateAssignments\(backup\.settings\.registryAssignments\)/);
  assert.match(html, /registryMatcherApi\.saveLocalAssignments\(window\.localStorage, restoredAssignments\)/,
    'Restore must persist verified assignments before updating UI state');
  assert.match(html, /previousRegistryAssignmentsRaw/,
    'Rollback must preserve the previous assignment storage payload');
});
