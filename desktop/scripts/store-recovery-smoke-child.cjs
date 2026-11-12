'use strict';
const fs = require('node:fs');
const path = require('node:path');
const { pathToFileURL } = require('node:url');
const { app, BrowserWindow, protocol, net, ipcMain, session } = require('electron');
const { resolveStoreProfile, listStores } = require('../lib/store-profiles.cjs');
const { resolveAppAsset } = require('../lib/asset-path.cjs');
const { registerRecoveryIpc } = require('../lib/recovery-ipc.cjs');
const repo = fs.realpathSync.native(path.resolve(__dirname, '../..'));
const [baseArg, storeId, phase, label] = process.argv.slice(2);
const base = fs.realpathSync.native(baseArg);
const allowed = fs.realpathSync.native(path.join(repo, 'desktop/test-profiles'));
const relative = path.relative(allowed, base);
if (!relative || relative.startsWith('..') || path.isAbsolute(relative)) throw Error('Unsafe smoke profile');
app.setPath('userData', resolveStoreProfile(base, storeId));
app.setPath('sessionData', app.getPath('userData'));
protocol.registerSchemesAsPrivileged([{ scheme: 'packmaster', privileges: { standard: true, secure: true, supportFetchAPI: true, corsEnabled: true } }]);
const pause = ms => new Promise(resolve => setTimeout(resolve, ms));
async function ready(win) {
  for (let n = 0; n < 100; n++) {
    try {
      if (await win.webContents.executeJavaScript('Boolean(document.querySelector("[data-pm-view]")) || Boolean(document.querySelector("[data-pm-desktop-recovery-restore]"))')) return;
    } catch {}
    await pause(200);
  }
  throw Error('Renderer did not become ready');
}
app.whenReady().then(async () => {
  const assets = path.join(repo, 'desktop/app');
  protocol.handle('packmaster', request => {
    const file = resolveAppAsset(assets, request.url);
    return file ? net.fetch(pathToFileURL(file).href) : new Response('', { status: 403 });
  });
  session.defaultSession.webRequest.onBeforeRequest({ urls: ['http://*/*', 'https://*/*'] }, (_request, done) => done({ cancel: true }));
  const win = new BrowserWindow({ show: false, webPreferences: { preload: path.join(repo, 'desktop/preload.cjs'), sandbox: true, contextIsolation: true, nodeIntegration: false } });
  win.webContents.on('console-message', (_event, details) => {
    if (details && details.level === 'error') console.error('RENDERER_ERROR ' + String(details.message).slice(0, 500));
  });
  const context = { storeId, id: storeId, label, legacy: storeId === 'legacy' };
  ipcMain.handle('packmaster:stores:context', () => context);
  ipcMain.handle('packmaster:stores:list', () => listStores(base));
  registerRecoveryIpc({ ipcMain, win, profilePath: app.getPath('userData'), storeId, origin: 'packmaster://app' });
  await win.loadURL('packmaster://app/index.html');
  await ready(win);
  if (phase === 'seed' || phase === 'verify' || phase === 'empty') {
    const controls = await win.webContents.executeJavaScript(`(async () => {
      const trigger=document.querySelector('button[aria-label="เลือกพื้นที่จัดเก็บ"]');
      if(!trigger)throw Error('Store selector missing');trigger.click();
      const panel=document.querySelector('[role="dialog"][aria-label="จัดการพื้นที่จัดเก็บ"]');
      const select=panel&&panel.querySelector('select');
      if(!select||select.options.length!==3)throw Error('Store list does not expose both stores and legacy');
      select.dispatchEvent(new KeyboardEvent('keydown',{key:'Escape',bubbles:true}));
      return {closed:panel.style.display==='none',focused:document.activeElement===trigger};
    })()`);
    if(!controls.closed||!controls.focused)throw Error('Store selector keyboard close failed');
    win.webContents.debugger.attach('1.3');
    try {
      await win.webContents.debugger.sendCommand('Emulation.setEmulatedMedia',{media:'print'});
      const hidden=await win.webContents.executeJavaScript(`['#packmaster-desktop-data-notice','button[aria-label="เลือกพื้นที่จัดเก็บ"]','[role="dialog"][aria-label="จัดการพื้นที่จัดเก็บ"]'].every(selector=>getComputedStyle(document.querySelector(selector)).display==='none')`);
      if(!hidden)throw Error('Desktop controls leak into label print media');
      await win.webContents.debugger.sendCommand('Emulation.setEmulatedMedia',{media:'screen'});
    } finally { win.webContents.debugger.detach(); }
  }
  if (phase === 'seed') {
    await win.webContents.executeJavaScript(`(async () => {
      const label = ${JSON.stringify(label)};
      if ((await PackMasterBatch.listBatches()).length || localStorage.getItem('storeIsolationProbe')) throw Error('New store is not empty');
      const registry = PackMasterMarketplaceRegistry.createEmptyStore();
      PackMasterMarketplaceRegistry.saveStore(localStorage, registry);
      PackMasterRegistryMatcher.saveLocalAssignments(localStorage, {schema: 'packmaster-registry-sku-assignments', version: 1, entries: [{platform:'TIKTOK',sellerSku:'SAME-SKU',productId:'same-product',modelId:null,shortName:label+' name'}]});
      localStorage.setItem('skuMappingRules', JSON.stringify([{keyword:'SAME-SKU',shortName:label+' name'}]));
      localStorage.setItem('storeIsolationProbe', label);
      await PackMasterBatch.saveBatch({id:'same-batch',name:label+' batch'},[{id:'same-order',platform:'TIKTOK',parsedItems:[{text:label+' item',qty:2}]}]);
    })()`);
  } else if (phase === 'ui-restore') {
    await win.webContents.executeJavaScript(`(async () => {
      const settings = {
        desktopStore: await packmasterDesktop.getContext(),
        thermalMode: JSON.parse(localStorage.getItem('thermalMode') || 'true'),
        marketplaceRegistry: PackMasterMarketplaceRegistry.loadStore(localStorage).store,
        registryAssignments: PackMasterRegistryMatcher.loadLocalAssignments(localStorage),
        duplicateFingerprints: PackMasterDuplicate.exportFingerprintStore(),
        archiveState: PackMasterArchive.exportArchiveStore(),
        reprintSnapshots: PackMasterReprintSnapshot.exportStore()
      };
      const payload = await PackMasterWorkspace.collectBackupPayload({batchApi:PackMasterBatch,
        skuRules:JSON.parse(localStorage.getItem('skuMappingRules')),settings,appVersion:'synthetic-ui-restore'});
      window.__syntheticRestoreBackup = PackMasterWorkspace.createBackup(payload);
      document.querySelector('button[aria-label="เครื่องมือ / ความปลอดภัย"]').click();
    })()`);
    await pause(300);
    await win.webContents.executeJavaScript(`(() => {
      const label = [...document.querySelectorAll('label')].find(node=>node.textContent.includes('กู้คืน Workspace'));
      const input = label&&label.querySelector('input[type="file"]');
      if(!input||input.disabled)throw Error('Restore file input unavailable');
      const transfer = new DataTransfer();
      transfer.items.add(new File([JSON.stringify(window.__syntheticRestoreBackup)],'synthetic-restore.json',{type:'application/json'}));
      input.files=transfer.files;input.dispatchEvent(new Event('change',{bubbles:true}));
    })()`);
    let completed = false;
    for(let n=0;n<100;n++) {
      const preview = await win.webContents.executeJavaScript(`Boolean(document.querySelector('[data-pm-desktop-restore-store-scope]'))`);
      if(preview)break;
      await pause(100);
    }
    await win.webContents.executeJavaScript(`(() => {
      const button=[...document.querySelectorAll('button')].find(node=>node.textContent.trim()==='Replace Workspace');
      if(!button||button.disabled)throw Error('Restore confirmation unavailable');
      window.confirm=()=>true;button.click();
    })()`);
    for(let n=0;n<150;n++) {
      if(await win.webContents.executeJavaScript(`(async()=>Boolean(document.querySelector('[data-pm-view="batches"]'))&&!document.querySelector('[data-pm-desktop-restore-store-scope]')&&!(await packmasterDesktop.recovery.getPending()))()`)) {completed=true;break;}
      await pause(100);
    }
    if(!completed)throw Error('Actual Restore UI did not complete its journaled operation');
  } else if (phase === 'interrupt') {
    await win.webContents.executeJavaScript(`(async () => {
      const settings = {marketplaceRegistry:PackMasterMarketplaceRegistry.loadStore(localStorage).store,registryAssignments:PackMasterRegistryMatcher.loadLocalAssignments(localStorage)};
      const payload = await PackMasterWorkspace.collectBackupPayload({batchApi:PackMasterBatch,skuRules:JSON.parse(localStorage.getItem('skuMappingRules')),settings,appVersion:'synthetic-before-interruption'});
      const backup = PackMasterWorkspace.createBackup(payload);
      const localStorageEntries = Object.keys(localStorage).map(key=>[key,localStorage.getItem(key)]);
      await packmasterDesktop.recovery.prepare({backup,localStorageEntries});
      const replacement = PackMasterWorkspace.createBackup({appVersion:'synthetic-incomplete',settings:{},skuRules:[],batches:[],batchOrders:[]});
      await PackMasterWorkspace.replaceWorkspaceBatches(replacement,PackMasterBatch);
      localStorage.setItem('storeIsolationProbe','INTERRUPTED');
    })()`);
  } else if (phase === 'recover') {
    for (let n = 0; n < 100; n++) {
      if (await win.webContents.executeJavaScript('Boolean(document.querySelector("[data-pm-desktop-recovery-restore]"))')) break;
      await pause(200);
    }
    await win.webContents.executeJavaScript(`(() => {
      const gate=document.querySelector('[data-pm-desktop-recovery-gate]');
      const button=document.querySelector('[data-pm-desktop-recovery-restore]');
      if(!gate||!button)throw Error('Pending journal did not block startup');button.click();
    })()`);
    for (let n = 0; n < 150; n++) {
      try {
        if (await win.webContents.executeJavaScript(`(async()=>!(await packmasterDesktop.recovery.getPending())&&!document.querySelector('[data-pm-desktop-recovery-gate]'))()`)) break;
      } catch {}
      await pause(200);
    }
    await ready(win);
  }
  if (phase === 'verify' || phase === 'recover' || phase === 'ui-restore') {
    const actual = await win.webContents.executeJavaScript(`(async()=>({probe:localStorage.getItem('storeIsolationProbe'),names:PackMasterRegistryMatcher.loadLocalAssignments(localStorage).entries.map(e=>e.shortName),batch:await PackMasterBatch.loadBatch('same-batch',{requireOrders:true}),pending:await packmasterDesktop.recovery.getPending()}))()`);
    if (actual.probe !== label || actual.names[0] !== label + ' name' || actual.batch.meta.name !== label + ' batch' || actual.batch.orders[0].parsedItems[0].text !== label + ' item' || actual.pending) throw Error('Isolation/recovery verification failed: ' + JSON.stringify(actual));
  }
  if (phase === 'empty') {
    const empty = await win.webContents.executeJavaScript(`(async()=>!(await PackMasterBatch.listBatches()).length&&!localStorage.getItem('storeIsolationProbe')&&!PackMasterRegistryMatcher.loadLocalAssignments(localStorage).entries.length)()`);
    if (!empty) throw Error('Legacy workspace changed or received store data');
  }
  session.defaultSession.flushStorageData();
  await pause(300);
  app.exit(0);
}).catch(error => { console.error(error); app.exit(1); });
