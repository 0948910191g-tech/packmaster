import assert from 'node:assert/strict';
import fs from 'node:fs';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const transitions = require('../packmaster-batch-transition.js');

const coordinator = transitions.createCoordinator();
let releaseSave;
const delayedSave = new Promise(resolve => { releaseSave = resolve; });
const events = [];

const first = coordinator.run({
  hasCurrent: true,
  saveCurrent: async () => { events.push('save-start'); await delayedSave; events.push('save-done'); return true; },
  transition: async () => { events.push('transition-a'); }
});
const second = await coordinator.run({
  hasCurrent: true,
  saveCurrent: async () => true,
  transition: async () => { events.push('transition-b'); }
});
assert.equal(second.ok, false);
assert.equal(second.reason, 'busy', 'fast repeated switching must not start a second transition while save is pending');
releaseSave();
const firstResult = await first;
assert.equal(firstResult.ok, true);
assert.deepEqual(events, ['save-start', 'save-done', 'transition-a']);

let transitionRan = false;
const failed = await coordinator.run({
  hasCurrent: true,
  saveCurrent: async () => false,
  transition: async () => { transitionRan = true; }
});
assert.equal(failed.ok, false);
assert.equal(failed.reason, 'save-failed');
assert.equal(transitionRan, false, 'failed save must block transition');

const noCurrent = await coordinator.run({
  hasCurrent: false,
  transition: async () => { transitionRan = true; }
});
assert.equal(noCurrent.ok, true);
assert.equal(transitionRan, true);
console.log('PackMaster batch transition coordinator tests passed');
const html = fs.readFileSync('index.html', 'utf8');
assert.match(html, /<script src="\.\/packmaster-batch-transition\.js"><\/script>/);
assert.match(html, /const batchTransitionApi = window\.PackMasterBatchTransition;/);
assert.match(html, /const batchTransitionCoordinator = useMemo\(\(\) => batchTransitionApi \? batchTransitionApi\.createCoordinator\(\)/);
assert.match(html, /const runBatchTransition = async \(transition\) =>/);
assert.match(html, /const handleCreateBatch = async \(\) => \{[\s\S]*?runBatchTransition\(async \(\) =>/);
assert.match(html, /const handleOpenBatch = async \(batch\) => \{[\s\S]*?runBatchTransition\(async \(\) =>/);
assert.match(html, /const handleBackToBatchList = async \(\) => \{[\s\S]*?runBatchTransition\(async \(\) =>/);
