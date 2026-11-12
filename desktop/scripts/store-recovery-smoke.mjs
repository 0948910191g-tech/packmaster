import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';
import { spawnSync } from 'node:child_process';

const require = createRequire(import.meta.url);
const repo = fs.realpathSync.native(path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..'));
const root = path.join(repo, 'desktop/test-profiles');
fs.mkdirSync(root, { recursive: true });
const base = fs.mkdtempSync(path.join(root, 'store-recovery-'));
const { createStore } = require('../lib/store-profiles.cjs');
const a = createStore({ basePath: base, label: 'Synthetic A' });
const b = createStore({ basePath: base, label: 'Synthetic B' });
const executable = require('electron');
const electronEnvironment = { ...process.env };
delete electronEnvironment.ELECTRON_RUN_AS_NODE;
for (const [phase, id, label] of [
  ['seed', a.id, 'A'], ['seed', b.id, 'B'], ['verify', a.id, 'A'], ['ui-restore', a.id, 'A'],
  ['interrupt', a.id, 'A'], ['recover', a.id, 'A'],
  ['verify', b.id, 'B'], ['empty', 'legacy', 'legacy']
]) {
  const result = spawnSync(executable, [path.join(repo, 'desktop/scripts/store-recovery-smoke-child.cjs'), base, id, phase, label],
    { encoding: 'utf8', timeout: 60000, windowsHide: true, env: electronEnvironment });
  if (result.error || result.status !== 0) {
    process.stderr.write(result.stdout || '');
    process.stderr.write(result.stderr || '');
    throw result.error || new Error(`Store/recovery phase ${phase}/${label} exited ${result.status}`);
  }
  process.stdout.write(`STORE_RECOVERY_PHASE_OK ${phase}/${label}\n`);
}
console.log('STORE_RECOVERY_PROCESS_SMOKE_OK ' + base);
