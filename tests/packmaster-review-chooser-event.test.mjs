import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const registry = require('../packmaster-marketplace-registry.js');
const identity = require('../packmaster-registry-identity.js');
const matcher = require('../packmaster-registry-matcher.js');
const store = require('../data/packmaster-marketplace-registry.json');
const assignments = require('../data/packmaster-registry-assignments.json');
const html = fs.readFileSync('index.html', 'utf8');

test('real Review dropdown change keeps selected row and fills its saved name', () => {
  const rows = registry.getNameableRows(store.platforms.TIKTOK, 'TIKTOK');
  const selected = rows.find(row => row.productId === '1731446401417644870');
  const named = matcher.upsertAssignment(assignments, 'TIKTOK', {
    status: 'found', identityType: 'catalog_row', candidate: {
      platform: 'TIKTOK', productId: selected.productId, modelId: null, variantName: null
    }
  }, 'Verified HOYA 5');
  const rowKey = (platform, row) => JSON.stringify([platform, String(row.productId || row.itemId || ''), row.modelId || null, row.variantName || null]);
  const chooserStart = html.indexOf('<select id="pm-review-registry-row"');
  const eventStart = html.indexOf('onChange={event => {', chooserStart) + 'onChange={event => {'.length;
  const eventEnd = html.indexOf('}} className=', eventStart);
  assert.ok(eventEnd > eventStart);
  const context = {
    registryMatcherApi: matcher, registryIdentityApi: identity,
    marketplaceCatalogIndex: identity.buildIndex(store, registry), registryAssignments: named,
    preparedRegistryAssignments: matcher.prepareAssignments(named),
    quickMapRegistryPlatform: 'TIKTOK', quickMapRegistryRows: rows, getQuickMapRegistryRowKey: rowKey,
    event: { target: { value: rowKey('TIKTOK', selected) } },
    state: { selectedRegistryRowKey: '', shortName: '', chooserFilledShortName: false },
    setQuickMapState(fn) { context.state = fn(context.state); }
  };
  vm.createContext(context);
  const helperSource = html.slice(html.indexOf('const getRegistryRowEvidence ='), html.indexOf('const hasDuplicateRegistrySku ='));
  vm.runInContext(helperSource + '\n{' + html.slice(eventStart, eventEnd) + '\n}', context);
  assert.equal(context.state.selectedRegistryRowKey, rowKey('TIKTOK', selected));
  const saved = named.entries.find(entry => entry.platform === 'TIKTOK' && entry.productId === selected.productId);
  assert.equal(context.state.shortName, saved.shortName);
  context.event.target.value = '';
  vm.runInContext('{' + html.slice(eventStart, eventEnd) + '\n}', context);
  assert.equal(context.state.selectedRegistryRowKey, '');
  assert.equal(context.state.shortName, '');
});
