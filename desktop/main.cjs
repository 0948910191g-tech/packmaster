'use strict';

const fs = require('node:fs');
const path = require('node:path');
const { pathToFileURL } = require('node:url');
const {
  app, BrowserWindow, Menu, net, protocol, session, ipcMain
} = require('electron');
const { resolveAppAsset } = require('./lib/asset-path.cjs');
const { isTrustedTopFrame } = require('./lib/trusted-renderer.cjs');
const { resolveUserDataPath } = require('./lib/user-data-profile.cjs');
const { createStore, getPreferredStore, setPreferredStore, listStores, resolveStoreProfile, LEGACY_STORE_ID } = require('./lib/store-profiles.cjs');

const APP_ORIGIN = 'packmaster://app';
const APP_START_URL = APP_ORIGIN + '/index.html';
const SMOKE_TEST = process.argv.includes('--smoke-test');

protocol.registerSchemesAsPrivileged([{
  scheme: 'packmaster',
  privileges: {
    standard: true,
    secure: true,
    supportFetchAPI: true,
    stream: true,
    corsEnabled: true
  }
}]);

const repoRoot = path.resolve(__dirname, '..');
const storeArgs = process.argv.filter(arg => String(arg).startsWith('--store-id'));
if (storeArgs.length > 1 || storeArgs.some(arg => !String(arg).startsWith('--store-id='))) {
  throw new Error('Use one --store-id=<safe id> option');
}
const argsWithoutStore = process.argv.filter(arg => !String(arg).startsWith('--store-id'));
const storeArg = process.argv.find(arg => String(arg).startsWith('--store-id='));
const BASE_PROFILE_PATH = resolveUserDataPath(argsWithoutStore, repoRoot, app.getPath('appData'), app.isPackaged);
fs.mkdirSync(BASE_PROFILE_PATH, { recursive: true });
const baseProfileInfo = fs.lstatSync(BASE_PROFILE_PATH);
if (!baseProfileInfo.isDirectory() || baseProfileInfo.isSymbolicLink()) {
  throw new Error('Desktop base profile must be a real directory');
}
const ACTIVE_STORE_ID = storeArg ? String(storeArg).slice('--store-id='.length) : (getPreferredStore(BASE_PROFILE_PATH) ?? LEGACY_STORE_ID);
const ACTIVE_PROFILE_PATH = ACTIVE_STORE_ID === LEGACY_STORE_ID
  ? BASE_PROFILE_PATH
  : resolveStoreProfile(BASE_PROFILE_PATH, ACTIVE_STORE_ID);

if (resolveUserDataPath(argsWithoutStore, repoRoot, app.getPath('appData'), app.isPackaged) !== BASE_PROFILE_PATH) {
  throw new Error('Desktop base profile path changed during validation');
}

// Keep documents, IndexedDB and registry mappings isolated from Chrome
// and stable across desktop upgrades. Set userData before Electron locks.
app.setPath('userData', ACTIVE_PROFILE_PATH);
app.setPath('sessionData', ACTIVE_PROFILE_PATH);
const hasLock = app.requestSingleInstanceLock();
if (!hasLock) app.quit();

let mainWindow = null;

function appRoot() {
  return app.isPackaged
    ? path.join(process.resourcesPath, 'app.asar.unpacked', 'desktop', 'app')
    : path.join(__dirname, 'app');
}

function registerAppProtocol() {
  const root = appRoot();
  protocol.handle('packmaster', request => {
    const filePath = resolveAppAsset(root, request.url);
    if (!filePath) return new Response('Asset is not accessible', { status: 403 });
    return net.fetch(pathToFileURL(filePath).href);
  });
}

function configureSession() {
  const storageSession = session.defaultSession;
  storageSession.setPermissionRequestHandler((_contents, _permission, reply) => reply(false));

  // Offline-first: the desktop shell never loads remote scripts or transmits
  // orders. Future Cloud connections need a separate security review.
  storageSession.webRequest.onBeforeRequest({
    urls: ['http://*/*', 'https://*/*']
  }, (_details, callback) => callback({ cancel: true }));

  storageSession.on('will-download', (_event, item) => {
    item.setSaveDialogOptions({
      title: 'บันทึกไฟล์จาก Packmaster',
      defaultPath: item.getFilename()
    });
  });
}

function registerStoreIpc(win) {
  const handlers = {
    'packmaster:stores:context': event => {
      if (!isTrustedTopFrame(event, win)) throw new Error('Untrusted Packmaster renderer');
      const stores = listStores(BASE_PROFILE_PATH);
      const active = stores.find(store => store.id === ACTIVE_STORE_ID);
      if (!active) throw new Error('Active store is missing from the store catalog');
      return { id: active.id, label: active.label, legacy: active.legacy };
    },
    'packmaster:stores:list': event => {
      if (!isTrustedTopFrame(event, win)) throw new Error('Untrusted Packmaster renderer');
      return listStores(BASE_PROFILE_PATH).map(({ id, label, legacy }) => ({ id, label, legacy }));
    },
    'packmaster:stores:create': (event, payload) => {
      if (!isTrustedTopFrame(event, win)) throw new Error('Untrusted Packmaster renderer');
      if (!payload || typeof payload !== 'object' || Array.isArray(payload) || Object.keys(payload).some(key => key !== 'label')) {
        throw new Error('Invalid store request');
      }
      const created = createStore({ basePath: BASE_PROFILE_PATH, label: payload.label });
      return { id: created.id, label: created.label };
    },
    'packmaster:stores:switch': async (event, payload) => {
      if (!isTrustedTopFrame(event, win)) throw new Error('Untrusted Packmaster renderer');
      if (!payload || typeof payload !== 'object' || Array.isArray(payload) ||
          Object.keys(payload).some(key => key !== 'id') || typeof payload.id !== 'string') {
        throw new Error('Invalid store selection');
      }
      resolveStoreProfile(BASE_PROFILE_PATH, payload.id);
      if (payload.id === ACTIVE_STORE_ID) return { switched: false };
      if (win && !win.isDestroyed() && win.webContents && win.webContents.session && typeof win.webContents.session.flushStorageData === 'function') {
        try {
          await win.webContents.session.flushStorageData();
        } catch (_) {}
      }
      setPreferredStore(BASE_PROFILE_PATH, payload.id);
      const args = process.argv.slice(1).filter(arg => !String(arg).startsWith('--store-id'));
      app.relaunch({ args: [...args, `--store-id=${payload.id}`] });
      setImmediate(() => app.exit(0));
      return { switched: true };
    }
  };
  for (const [channel, handler] of Object.entries(handlers)) {
    ipcMain.removeHandler(channel);
    ipcMain.handle(channel, handler);
  }
}

function makeMenu(win) {
  return Menu.buildFromTemplate([
    {
      label: 'ไฟล์',
      submenu: [
        {
          label: 'เปิดหน้าหลัก',
          click: () => win.loadURL(APP_START_URL)
        },
        { type: 'separator' },
        {
          label: 'พิมพ์',
          accelerator: 'CmdOrCtrl+P',
          click: () => win.webContents.print({
            silent: false,
            printBackground: true
          }, (_success, failureReason) => {
            if (failureReason && !SMOKE_TEST) console.error('Print:', failureReason);
          })
        },
        { type: 'separator' },
        { role: 'quit', label: 'ออกจากโปรแกรม' }
      ]
    },
    {
      label: 'มุมมอง',
      submenu: [
        { role: 'reload', label: 'รีโหลด' },
        { role: 'resetZoom', label: 'ขนาดปกติ' },
        { role: 'zoomIn', label: 'ขยาย' },
        { role: 'zoomOut', label: 'ย่อ' },
        { role: 'togglefullscreen', label: 'เต็มจอ' }
      ]
    }
  ]);
}

function createWindow() {
  const win = new BrowserWindow({
    width: 1480,
    height: 960,
    minWidth: 1000,
    minHeight: 680,
    show: !SMOKE_TEST,
    title: 'Packmaster Desktop | PPG',
    backgroundColor: '#f4f7fb',
    autoHideMenuBar: false,
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
      sandbox: true,
      webSecurity: true,
      allowRunningInsecureContent: false,
      spellcheck: false,
      preload: path.join(__dirname, 'preload.cjs')
    }
  });
  mainWindow = win;
  registerStoreIpc(win);
  for (const action of ['get-pending', 'prepare', 'complete', 'discard']) ipcMain.removeHandler(`packmaster:recovery:${action}`);
  const { registerRecoveryIpc } = require('./lib/recovery-ipc.cjs');
  registerRecoveryIpc({ ipcMain, win, profilePath: ACTIVE_PROFILE_PATH, storeId: ACTIVE_STORE_ID, origin: APP_ORIGIN });
  Menu.setApplicationMenu(makeMenu(win));

  win.webContents.setWindowOpenHandler(() => ({ action: 'deny' }));
  win.webContents.on('will-navigate', (event, destination) => {
    if (!destination.startsWith(APP_ORIGIN + '/')) event.preventDefault();
  });

  win.loadURL(APP_START_URL).catch(error => {
    console.error('Packmaster cannot load:', error.message);
    if (SMOKE_TEST) app.exit(3);
  });
  win.on('closed', () => { if (mainWindow === win) mainWindow = null; });
  return win;
}

async function verifyBundledPdf(win) {
  return win.webContents.executeJavaScript(`(async () => {
    const document = new window.jspdf.jsPDF();
    document.text('Packmaster PDF smoke test', 12, 12);
    const pdfBytes = document.output('arraybuffer');
    const parsed = await window.pdfjsLib.getDocument({
      data: pdfBytes, isEvalSupported: false
    }).promise;
    const pages = parsed.numPages;
    await parsed.destroy();
    return { pdfPages: pages };
  })()`);
}

async function reloadAndWaitForSmokePage(win) {
  const loaded = new Promise(resolve => win.webContents.once('did-finish-load', resolve));
  win.webContents.reload();
  await loaded;
  const started = Date.now();
  while (Date.now() - started < 12000) {
    try {
      const ready = await win.webContents.executeJavaScript(`Boolean(
        document.querySelector('[data-pm-view="batches"]') ||
        document.querySelector('[data-pm-view="marketplace-registry"]'))`);
      if (ready) return;
    } catch {}
    await new Promise(resolve => setTimeout(resolve, 250));
  }
  throw new Error('Smoke page did not render after reload');
}

async function verifyCorruptLocalDataSurvivesReload(win) {
  const keys = [
    'packmasterMarketplaceRegistryV1',
    'packmasterRegistrySkuAssignmentsV1',
    'skuMappingRules'
  ];
  const phaseKey = '__packmasterDesktopSmokePhase';
  const snapshotKey = '__packmasterDesktopSmokeOriginals';
  const phase = await win.webContents.executeJavaScript(`localStorage.getItem(${JSON.stringify(phaseKey)})`);
  if (!phase) {
    await win.webContents.executeJavaScript(`(() => {
      const keys = ${JSON.stringify(keys)};
      const originals = Object.fromEntries(keys.map(key => [key, localStorage.getItem(key)]));
      localStorage.setItem(${JSON.stringify(snapshotKey)}, JSON.stringify(originals));
      localStorage.setItem('packmasterMarketplaceRegistryV1', '{"corrupt":"smoke"');
      localStorage.setItem('packmasterRegistrySkuAssignmentsV1', '{"corrupt":"smoke"');
      localStorage.setItem('skuMappingRules', '{"corrupt":"smoke"}');
      localStorage.setItem(${JSON.stringify(phaseKey)}, 'seeded');
    })()`);
    await reloadAndWaitForSmokePage(win);
  }

  let verified = false;
  try {
    const result = await win.webContents.executeJavaScript(`(async () => {
      const expected = {
        packmasterMarketplaceRegistryV1: '{"corrupt":"smoke"',
        packmasterRegistrySkuAssignmentsV1: '{"corrupt":"smoke"',
        skuMappingRules: '{"corrupt":"smoke"}'
      };
      const preserved = Object.entries(expected).every(([key, value]) => localStorage.getItem(key) === value);
      const storeError = window.PackMasterMarketplaceRegistry.loadStore(localStorage).error;
      const assignmentsError = window.PackMasterLocalRegistryBootstrap.loadLocalStartupSnapshot(localStorage, {
        registryApi: window.PackMasterMarketplaceRegistry,
        matcherApi: window.PackMasterRegistryMatcher,
        sanitizeSkuRule: rule => rule
      }).registryAssignmentsError;
      const skuError = window.PackMasterLocalRegistryBootstrap.loadLocalStartupSnapshot(localStorage, {
        registryApi: window.PackMasterMarketplaceRegistry,
        matcherApi: window.PackMasterRegistryMatcher,
        sanitizeSkuRule: rule => rule
      }).skuRulesError;
      document.querySelector('button[aria-label="ทะเบียนสินค้า Marketplace"]')?.click();
      await new Promise(resolve => setTimeout(resolve, 150));
      const visibleAlerts = [...document.querySelectorAll('[role="alert"]')]
        .filter(node => node.getClientRects().length > 0).length;
      return { preserved, storeError: Boolean(storeError), assignmentsError: Boolean(assignmentsError),
        skuError: Boolean(skuError), visibleAlerts };
    })()`);
    if (!result.preserved || !result.storeError || !result.assignmentsError || !result.skuError || result.visibleAlerts < 3) {
      throw new Error('Corrupt local data smoke failed: ' + JSON.stringify(result));
    }
    verified = true;
  } finally {
    await win.webContents.executeJavaScript(`(() => {
      const originals = JSON.parse(localStorage.getItem(${JSON.stringify(snapshotKey)}) || '{}');
      for (const key of ${JSON.stringify(keys)}) {
        if (Object.prototype.hasOwnProperty.call(originals, key) && originals[key] !== null) localStorage.setItem(key, originals[key]);
        else localStorage.removeItem(key);
      }
      localStorage.removeItem(${JSON.stringify(phaseKey)});
      localStorage.removeItem(${JSON.stringify(snapshotKey)});
    })()`);
    await reloadAndWaitForSmokePage(win);
  }
  return verified;
}

async function verifySyntheticBackupRestoreRoundTrip(win) {
  const phaseKey = '__packmasterDesktopBackupSmokePhase';
  const snapshotKey = '__packmasterDesktopBackupSmokeOriginal';
  const keys = [
    'packmasterMarketplaceRegistryV1',
    'packmasterRegistrySkuAssignmentsV1',
    'skuMappingRules'
  ];

  let phase = await win.webContents.executeJavaScript(`sessionStorage.getItem(${JSON.stringify(phaseKey)})`);
  if (!phase) {
    await win.webContents.executeJavaScript(`(async () => {
      const workspace = window.PackMasterWorkspace;
      const batchApi = window.PackMasterBatch;
      if (!workspace || !batchApi) throw new Error('Workspace Backup API is unavailable');
      const keys = ${JSON.stringify(keys)};
      let skuRules = [];
      try {
        const parsed = JSON.parse(localStorage.getItem('skuMappingRules') || '[]');
        if (Array.isArray(parsed)) skuRules = parsed;
      } catch {}
      const raw = Object.fromEntries(keys.map(key => [key, localStorage.getItem(key)]));
      const payload = await workspace.collectBackupPayload({
        batchApi, skuRules, settings: {}, appVersion: 'desktop-smoke-original'
      });
      const original = workspace.createBackup(payload, new Date('2026-11-11T00:00:00.000Z'));
      sessionStorage.setItem(${JSON.stringify(snapshotKey)}, JSON.stringify({ original, raw }));
      const registryApi = window.PackMasterMarketplaceRegistry;
      let marketplaceRegistry = registryApi.createEmptyStore();
      for (const platform of ['TIKTOK', 'SHOPEE']) {
        const isTikTok = platform === 'TIKTOK';
        const idField = isTikTok ? 'productId' : 'itemId';
        const nameField = isTikTok ? 'productName' : 'title';
        const productId = 'desktop-smoke-' + platform.toLowerCase();
        const sellerSku = 'SMOKE-' + platform;
        const product = { platform, [idField]: productId, [nameField]: 'Synthetic ' + platform + ' product', sellerSku, variants: [] };
        const skuRow = { ...product, sellerSkuStatus: 'present', sourceRowType: isTikTok ? 'product_sku' : 'variant',
          ...(isTikTok ? {} : { modelId: 'smoke-model' }) };
        const source = {
          schemaVersion: 1, registryType: 'marketplace_product_sku_source_registry', platform,
          source: { shop: 'synthetic-desktop-smoke', captureDate: '2026-11-11' },
          products: [product], skuRows: [skuRow], productsWithoutAnySellerSku: [], pages: [{ products: 1 }],
          summary: { listedProductCount: 1, uniqueProductIdCount: 1, skuModelRowCount: 1,
            sellerSkuPresentRowCount: 1, sellerSkuMissingInRowsCount: 0, productsWithoutAnySellerSkuCount: 0 }
        };
        marketplaceRegistry = registryApi.replacePlatformRegistry(marketplaceRegistry, source);
      }
      const registryAssignments = window.PackMasterRegistryMatcher.validateAssignments({
        schema: 'packmaster-registry-sku-assignments', version: 1, entries: [{
          platform: 'TIKTOK', identityType: 'catalog_row', sellerSku: null,
          productId: 'desktop-smoke-product', modelId: null, variantName: null,
          shortName: 'Smoke registry name'
        }]
      });
      const synthetic = workspace.createBackup({
        appVersion: 'desktop-smoke-synthetic',
        settings: { marketplaceRegistry, registryAssignments },
        skuRules: [{ keyword: 'PACKMASTER DESKTOP SMOKE SKU', shortName: 'Smoke item' }],
        batches: [{ id: 'desktop-smoke-roundtrip', name: 'Synthetic Desktop smoke batch' }],
        batchOrders: [{ batchId: 'desktop-smoke-roundtrip', orders: [{
          id: 'desktop-smoke-roundtrip-order', platform: 'TIKTOK',
          parsedItems: [{ text: 'SANITIZED DESKTOP SMOKE SKU', qty: 2 }]
        }] }]
      }, new Date('2026-11-11T00:00:01.000Z'));
      await workspace.replaceWorkspaceBatches(synthetic, batchApi);
      localStorage.setItem('skuMappingRules', JSON.stringify(synthetic.skuRules));
      window.PackMasterMarketplaceRegistry.saveStore(localStorage, synthetic.settings.marketplaceRegistry);
      window.PackMasterRegistryMatcher.saveLocalAssignments(localStorage, synthetic.settings.registryAssignments);
      sessionStorage.setItem(${JSON.stringify(phaseKey)}, 'synthetic-restored');
    })()`);
    await reloadAndWaitForSmokePage(win);
    phase = 'synthetic-restored';
  }

  const snapshot = await win.webContents.executeJavaScript(`JSON.parse(sessionStorage.getItem(${JSON.stringify(snapshotKey)}))`);
  if (!snapshot || !snapshot.original) throw new Error('Smoke restore snapshot is missing');

  if (phase === 'synthetic-restored') {
    let syntheticOk = false;
    try {
      const result = await win.webContents.executeJavaScript(`(async () => {
        const workspace = window.PackMasterWorkspace;
        const payload = await workspace.collectBackupPayload({
          batchApi: window.PackMasterBatch,
          skuRules: JSON.parse(localStorage.getItem('skuMappingRules') || '[]'),
          settings: {}, appVersion: 'desktop-smoke-verification'
        });
        const backup = workspace.createBackup(payload, new Date('2026-11-11T00:00:02.000Z'));
        const assignments = window.PackMasterRegistryMatcher.loadLocalAssignments(localStorage);
        const registry = window.PackMasterMarketplaceRegistry.loadStore(localStorage);
        return {
          schema: backup.schema,
          registryError: registry.error,
          registryPlatforms: Object.keys(registry.store.platforms),
          assignmentName: assignments.entries[0]?.shortName,
          batches: backup.batches.map(batch => batch.id),
          orders: backup.batchOrders.flatMap(row => row.orders).map(order => ({
            id: order.id, items: order.parsedItems.map(item => ({ text: item.text, qty: item.qty }))
          })),
          skuRules: backup.skuRules.map(rule => ({ keyword: rule.keyword, shortName: rule.shortName }))
        };
      })()`);
      if (result.schema !== 'packmaster-workspace-backup' || result.registryError ||
          result.assignmentName !== 'Smoke registry name' || result.registryPlatforms.length !== 2 ||
          result.batches.length !== 1 || result.batches[0] !== 'desktop-smoke-roundtrip' ||
          result.orders.length !== 1 || result.orders[0].id !== 'desktop-smoke-roundtrip-order' ||
          result.orders[0].items.length !== 1 || result.orders[0].items[0].qty !== 2 ||
          result.skuRules.length !== 1 || result.skuRules[0].shortName !== 'Smoke item') {
        throw new Error('Synthetic Workspace restore did not survive reload: ' + JSON.stringify(result));
      }
      syntheticOk = true;
    } finally {
      await win.webContents.executeJavaScript(`(async () => {
        const snapshot = JSON.parse(sessionStorage.getItem(${JSON.stringify(snapshotKey)}));
        await window.PackMasterWorkspace.replaceWorkspaceBatches(snapshot.original, window.PackMasterBatch);
        for (const key of ${JSON.stringify(keys)}) {
          if (Object.prototype.hasOwnProperty.call(snapshot.raw, key) && snapshot.raw[key] !== null) localStorage.setItem(key, snapshot.raw[key]);
          else localStorage.removeItem(key);
        }
        sessionStorage.setItem(${JSON.stringify(phaseKey)}, 'original-restored');
      })()`);
      await reloadAndWaitForSmokePage(win);
    }
    if (!syntheticOk) throw new Error('Synthetic Workspace Backup/Restore smoke failed');
    phase = 'original-restored';
  }

  if (phase === 'original-restored') {
    const result = await win.webContents.executeJavaScript(`(async () => {
      const snapshot = JSON.parse(sessionStorage.getItem(${JSON.stringify(snapshotKey)}));
      const payload = await window.PackMasterWorkspace.collectBackupPayload({
        batchApi: window.PackMasterBatch,
        skuRules: (() => { try { const parsed = JSON.parse(localStorage.getItem('skuMappingRules') || '[]'); return Array.isArray(parsed) ? parsed : []; } catch { return []; } })(),
        settings: {}, appVersion: 'desktop-smoke-restored-original'
      });
      const current = window.PackMasterWorkspace.createBackup(payload, new Date('2026-11-11T00:00:03.000Z'));
      const ids = value => value.batches.map(batch => batch.id).sort();
      const rawMatches = ${JSON.stringify(keys)}.every(key => localStorage.getItem(key) === snapshot.raw[key]);
      return { idsMatch: JSON.stringify(ids(current)) === JSON.stringify(ids(snapshot.original)), rawMatches,
        orderCounts: current.batchOrders.map(row => row.orders.length),
        originalOrderCounts: snapshot.original.batchOrders.map(row => row.orders.length) };
    })()`);
    if (!result.idsMatch || !result.rawMatches || JSON.stringify(result.orderCounts) !== JSON.stringify(result.originalOrderCounts)) {
      throw new Error('Smoke profile was not restored after synthetic Backup/Restore: ' + JSON.stringify(result));
    }
    await win.webContents.executeJavaScript(`sessionStorage.removeItem(${JSON.stringify(phaseKey)}); sessionStorage.removeItem(${JSON.stringify(snapshotKey)});`);
    return true;
  }
  throw new Error('Unexpected Backup/Restore smoke phase: ' + phase);
}

async function smokeWindow(win) {
  const started = Date.now();
  let lastError = '';
  while (Date.now() - started < 25000) {
    try {
      const result = await win.webContents.executeJavaScript(`(async () => {
        let storeBridge = false;
        try {
          const bridge = window.packmasterDesktop;
          const context = await bridge.getContext();
          const stores = await bridge.listStores();
          storeBridge = Boolean(context && typeof context.id === 'string' && typeof context.label === 'string' &&
            Array.isArray(stores) && stores.some(store => store.id === context.id));
        } catch {}
        return {
          origin: location.origin,
          title: document.title,
          rendered: Boolean(document.querySelector('[data-pm-view="batches"]') ||
            document.querySelector('[data-pm-view="marketplace-registry"]')),
          registry: Boolean(window.PackMasterMarketplaceRegistry),
          matcher: Boolean(window.PackMasterRegistryMatcher),
          pdf: Boolean(window.pdfjsLib),
          react: Boolean(window.React),
          indexedDb: Boolean(window.indexedDB),
          storage: (() => { try { localStorage.setItem('packmasterSmoke', 'ok');
            const value = localStorage.getItem('packmasterSmoke');
            localStorage.removeItem('packmasterSmoke'); return value === 'ok';
          } catch { return false; } })(),
          storeBridge,
          storeSelector: Boolean(document.querySelector('button[aria-label="เลือกพื้นที่จัดเก็บ"]'))
        };
      })()`);
      if (result.rendered && result.registry && result.matcher && result.pdf &&
          result.react && result.indexedDb && result.storage && result.storeBridge && result.storeSelector) {
        let pdfAndCatalog;
        try {
          pdfAndCatalog = await verifyBundledPdf(win);
        } catch (error) {
          console.error('PACKMASTER_DESKTOP_PDF_SMOKE_FAILED ' + error.message);
          app.exit(6);
          return;
        }
        if (pdfAndCatalog.pdfPages !== 1) {
          console.error('PACKMASTER_DESKTOP_PDF_SMOKE_FAILED ' + JSON.stringify(pdfAndCatalog));
          app.exit(7);
          return;
        }
        const corruptDataSurvivedReload = await verifyCorruptLocalDataSurvivesReload(win);
        const syntheticBackupRoundTrip = await verifySyntheticBackupRestoreRoundTrip(win);
        console.log('PACKMASTER_DESKTOP_SMOKE_OK ' + JSON.stringify({ ...result, ...pdfAndCatalog, corruptDataSurvivedReload, syntheticBackupRoundTrip }));
        app.exit(0);
        return;
      }
      lastError = JSON.stringify(result);
    } catch (error) {
      lastError = error.message;
    }
    await new Promise(resolve => setTimeout(resolve, 600));
  }
  console.error('PACKMASTER_DESKTOP_SMOKE_FAILED ' + lastError);
  app.exit(2);
}

if (hasLock) {
  app.on('second-instance', () => {
    if (mainWindow) {
      if (mainWindow.isMinimized()) mainWindow.restore();
      mainWindow.focus();
    }
  });
  app.whenReady().then(() => {
    registerAppProtocol();
    configureSession();
    const win = createWindow();
    if (SMOKE_TEST) smokeWindow(win).catch(error => {
      console.error('Smoke error:', error);
      app.exit(4);
    });
  }).catch(error => {
    console.error('Desktop startup:', error);
    app.exit(5);
  });
  app.on('window-all-closed', () => { if (process.platform !== 'darwin') app.quit(); });
  app.on('activate', () => { if (!BrowserWindow.getAllWindows().length) createWindow(); });
}
