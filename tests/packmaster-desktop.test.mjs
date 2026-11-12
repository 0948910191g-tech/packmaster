import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';

const require = createRequire(import.meta.url);
const repo = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const { resolveAppAsset } = require('../desktop/lib/asset-path.cjs');
const { resolveUserDataPath } = require('../desktop/lib/user-data-profile.cjs');
const sourceMain = readFileSync(path.join(repo, 'desktop', 'main.cjs'), 'utf8');
const packageConfig = JSON.parse(readFileSync(path.join(repo, 'package.json'), 'utf8'));

test('desktop routes only its own public app files', () => {
  const root = path.resolve('C:/Test Packmaster/app');
  assert.equal(resolveAppAsset(root, 'packmaster://app/'), path.join(root, 'index.html'));
  assert.equal(resolveAppAsset(root, 'packmaster://app/index.html'), path.join(root, 'index.html'));
  assert.equal(resolveAppAsset(root, 'packmaster://app/data/packmaster-marketplace-registry.json'),
    path.join(root, 'data', 'packmaster-marketplace-registry.json'));
  for (const url of [
    'https://evil.test/app.js',
    'file:///C:/Windows/system.ini',
    'packmaster://evil/index.html',
    'packmaster://app/%2e%2e%2fsecret.js',
    'packmaster://app/%5cWindows%5csystem.ini',
    'packmaster://app/exfiltrate.exe',
    'not-a-url'
  ]) {
    assert.equal(resolveAppAsset(root, url), null, url);
  }
});

test('desktop renderer has no Node API and no external requests', () => {
  assert.match(sourceMain, /nodeIntegration:\s*false/);
  assert.match(sourceMain, /contextIsolation:\s*true/);
  assert.match(sourceMain, /sandbox:\s*true/);
  assert.match(sourceMain, /webSecurity:\s*true/);
  assert.match(sourceMain, /setPermissionRequestHandler/);
  assert.match(sourceMain, /callback\(\{ cancel: true \}\)/);
  assert.match(sourceMain, /requestSingleInstanceLock/);
  assert.match(sourceMain, /'app\.asar\.unpacked'/);
});

test('desktop test profiles are constrained and smoke uses a stable isolated profile', () => {
  const appData = path.join(repo, 'test-appdata');
  const profileRoot = path.join(repo, 'desktop', 'test-profiles');
  const smokeProfile = path.join(profileRoot, 'smoke');
  assert.equal(resolveUserDataPath([], repo, appData), path.join(appData, 'PPG', 'Packmaster Desktop'));
  assert.equal(resolveUserDataPath(['--smoke-test'], repo, appData), smokeProfile);
  assert.throws(() => resolveUserDataPath(['--smoke-test'], repo, appData, true), /unpackaged/i);
  assert.equal(resolveUserDataPath(['--smoke-test'], repo, appData), smokeProfile);
  assert.throws(() => resolveUserDataPath(['--smoke-test'], repo, appData, true), /unpackaged/i);
  assert.equal(resolveUserDataPath(['--test-profile=' + path.join(profileRoot, 'case-a')], repo, appData),
    path.join(profileRoot, 'case-a'));
  for (const value of ['', path.join(repo, 'userdata'), path.join(profileRoot, '..', 'userdata')]) {
    assert.throws(() => resolveUserDataPath(['--test-profile=' + value], repo, appData), /test profile/i);
  }
  assert.throws(() => resolveUserDataPath(['--smoke-test', '--test-profile=' + path.join(appData, 'PPG', 'Packmaster Desktop')], repo, appData), /test profile/i);
});

test('desktop uses its selected data profile before taking the single-instance lock', () => {
  assert.ok(sourceMain.indexOf('app.setPath(\'userData\'') < sourceMain.indexOf('app.requestSingleInstanceLock()'));
  assert.match(sourceMain, /resolveUserDataPath/);
  assert.doesNotMatch(sourceMain, /autoUpdater|checkForUpdates|downloadUpdate/i);
});

test('desktop build is isolated from GitHub Pages and targets Windows installer', () => {
  assert.equal(packageConfig.build.appId, 'com.ppg.packmaster.desktop');
  assert.equal(packageConfig.main, 'desktop/main.cjs');
  assert.equal(packageConfig.build.win.target[0].target, 'nsis');
  assert.ok(packageConfig.build.files.some(p => p.includes('desktop/app')));
  assert.ok(!packageConfig.build.files.includes('**/*'));
});

test('prepared desktop page uses bundled scripts and offline PDF worker', t => {
  const htmlFile = path.join(repo, 'desktop', 'app', 'index.html');
  if (!existsSync(htmlFile)) return t.skip('Run npm run desktop:prepare first');
  const html = readFileSync(htmlFile, 'utf8');
  for (const needle of [
    './vendor/react.production.min.js',
    './vendor/react-dom.production.min.js',
    './vendor/babel.min.js',
    './vendor/pdf.min.js',
    './vendor/pdf.worker.min.js',
    './vendor/html2canvas.min.js',
    './vendor/jspdf.umd.min.js',
    './vendor/tailwind.css',
    'Content-Security-Policy'
  ]) assert.ok(html.includes(needle), 'missing bundled asset: ' + needle);
  for (const url of [
    'https://cdn.tailwindcss.com',
    'https://fonts.googleapis.com',
    'https://unpkg.com',
    'https://cdnjs.cloudflare.com'
  ]) assert.ok(!html.includes(url), 'remote asset found: ' + url);
  assert.ok(!html.includes('tailwind.config ='), 'Tailwind browser compiler was not removed');
});

test('desktop preparation excludes real registry baselines and explains separate web data', () => {
  const prepare = readFileSync(path.join(repo, 'desktop', 'scripts', 'prepare.mjs'), 'utf8');
  assert.doesNotMatch(prepare, /readdirSync\(path\.join\(repo, 'data'\)\)/);
  assert.match(prepare, /Packmaster Web และ Desktop แยกเก็บกัน/);
  assert.match(prepare, /สำรองข้อมูล Workspace \(Backup\).*กู้คืน \(Restore\)/s);
  for (const filename of ['packmaster-marketplace-registry.json', 'packmaster-registry-assignments.json']) {
    assert.equal(existsSync(path.join(repo, 'desktop', 'app', 'data', filename)), false, 'bundled baseline found: ' + filename);
  }
});
