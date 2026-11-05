import test from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const { createController } = require('../packmaster-cloud-mapping-controller.js');
const rule = (keyword, shortName) => ({ keyword, shortName, id: keyword });

test('cloud mapping hydrates from server, never from stale browser values', async () => {
  let writes = 0;
  const states = [];
  const controller = createController({
    async read() { return { value: [rule('central', 'Central SKU')], revision: 2 }; },
    async write() { writes++; },
    onState(value) { states.push(value); }
  });
  await assert.rejects(controller.persist([rule('local', 'Old SKU')]), /not ready/);
  assert.deepEqual(await controller.initialize(), [rule('central', 'Central SKU')]);
  assert.deepEqual(states, ['loading', 'ready']);
  assert.equal(await controller.persist([rule('central', 'Central SKU')]), false);
  assert.equal(writes, 0);
});

test('cloud mapping serializes rapid edits and prevents same-revision collisions', async () => {
  let remoteRevision = 0;
  let remoteRules = [];
  const saved = [];
  const controller = createController({
    async read() { return { value: remoteRules, revision: remoteRevision }; },
    async write(next) {
      const expectedRevision = saved.length;
      if (remoteRevision !== expectedRevision) throw Object.assign(new Error('revision_conflict'), { status: 409 });
      remoteRevision++;
      remoteRules = next;
      saved.push(next);
    }
  });
  await controller.initialize();
  const a = controller.persist([rule('1', 'First')]);
  const b = controller.persist([rule('1', 'First'), rule('2', 'Second')]);
  const c = controller.persist([rule('1', 'First'), rule('2', 'Second'), rule('3', 'Third')]);
  assert.deepEqual(await Promise.all([a,b,c]), [true,true,true]);
  assert.equal(remoteRevision, 3);
  assert.equal(remoteRules.length, 3);
  assert.equal(controller.getStatus(), 'ready');
});

test('conflicts block further edits rather than silently overwriting another device', async () => {
  let writes = 0;
  const states = [];
  const controller = createController({
    async read() { return { value: [], revision: 1 }; },
    async write() { writes++; throw Object.assign(new Error('revision_conflict'), { status: 409 }); },
    onState(state) { states.push(state); }
  });
  await controller.initialize();
  const first = controller.persist([rule('x', 'X')]);
  const second = controller.persist([rule('y', 'Y')]);
  await assert.rejects(first, { status: 409 });
  await assert.rejects(second, /blocked/);
  await assert.rejects(controller.persist([rule('z', 'Z')]), /not ready/);
  assert.equal(writes, 1);
  assert.equal(controller.getStatus(), 'blocked');
  assert.deepEqual(states, ['loading','ready','blocked']);
});

test('malformed Cloud mapping fails closed and never overwrites it with local state', async () => {
  const controller = createController({
    async read() { return { value: { keyword: 'broken' }, revision: 1 }; },
    async write() { throw new Error('must not save'); }
  });
  await assert.rejects(controller.initialize(), /valid rule array/);
  assert.equal(controller.getStatus(), 'blocked');
});
