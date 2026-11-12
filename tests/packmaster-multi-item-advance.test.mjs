import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
const html = fs.readFileSync('index.html', 'utf8');

test('advance picks the next unresolved item by index and clears the previous selection', () => {
  const source = html.slice(html.indexOf('const advanceReviewItem ='), html.indexOf('const handleSaveQuickMapping ='));
  assert.ok(source.includes('const advanceReviewItem ='));
  const items = [{text:'same'}, {text:'same'}, {text:'other'}];
  const order = {parsedItems: items};
  const context = { reviewOverridesApi: {getManualSkuOverride: (_o,_s,i) => i === 2 ? {shortName:'done'} : null},
    state: {open:true, selectedRegistryRowKey:'old', shortName:'wrong', registrySearch:'old'},
    setQuickMapState(value) { context.state = typeof value === 'function' ? value(context.state) : value; } };
  vm.createContext(context);
  vm.runInContext(source + '\nglobalThis.advance = advanceReviewItem;', context);
  context.advance(order, 0, () => ({status:'unmatched'}));
  assert.equal(context.state.itemIndex, 1);
  assert.equal(context.state.selectedRegistryRowKey, '');
  assert.equal(context.state.shortName, '');
  assert.equal(context.state.registrySearch, '');
  context.advance(order, 1, item => ({status: item === items[0] ? 'matched' : 'unmatched'}));
  assert.equal(context.state.open, false);
});
