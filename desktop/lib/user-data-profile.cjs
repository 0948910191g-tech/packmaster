'use strict';

const fs = require('node:fs');
const path = require('node:path');
const { LEGACY_STORE_ID, resolveStoreProfile } = require('./store-profiles.cjs');

function isWithin(parent, candidate) {
  const relative = path.relative(parent, candidate);
  return relative !== '' && relative !== '..' && !relative.startsWith('..' + path.sep) && !path.isAbsolute(relative);
}

function canonicalPath(candidate) {
  try {
    return fs.realpathSync.native(candidate);
  } catch (error) {
    if (error.code !== 'ENOENT' && error.code !== 'ENOTDIR') throw error;
    return null;
  }
}

function assertNoLinksWithin(profileRoot, target) {
  let current = profileRoot;
  const rootInfo = fs.lstatSync(current);
  if (rootInfo.isSymbolicLink()) throw new Error('Desktop test profile root cannot be a symlink or junction');

  const relative = path.relative(profileRoot, target);
  for (const part of relative.split(path.sep).filter(Boolean)) {
    current = path.join(current, part);
    try {
      if (fs.lstatSync(current).isSymbolicLink()) {
        throw new Error('Desktop test profile path cannot contain symlinks or junctions');
      }
    } catch (error) {
      if (error.code === 'ENOENT' || error.code === 'ENOTDIR') break;
      throw error;
    }
  }
}

function resolveUserDataPath(argv, repoRoot, appDataPath, isPackaged = false) {
  const args = Array.from(argv || []);
  const profileArgs = args.filter(arg => String(arg).startsWith('--test-profile'));
  if (profileArgs.length > 1 || profileArgs.some(arg => !String(arg).startsWith('--test-profile='))) {
    throw new Error('Use one --test-profile=<absolute path> option');
  }

  const storeArgs = args.filter(arg => String(arg).startsWith('--store-id'));
  if (storeArgs.length > 1 || storeArgs.some(arg => !String(arg).startsWith('--store-id='))) {
    throw new Error('Use one --store-id=<safe id> option');
  }
  const storeId = storeArgs.length ? String(storeArgs[0]).slice('--store-id='.length) : null;

  const appDefault = path.join(appDataPath, 'PPG', 'Packmaster Desktop');
  const smoke = args.includes('--smoke-test');
  const rawProfile = profileArgs.length ? String(profileArgs[0]).slice('--test-profile='.length) : null;
  if (rawProfile === null && !smoke) {
    if (storeId === null || storeId === LEGACY_STORE_ID) return appDefault;
    return resolveStoreProfile(appDefault, storeId);
  }
  if (isPackaged) {
    throw new Error('Desktop smoke and --test-profile require an unpackaged development build');
  }

  const repo = fs.realpathSync.native(repoRoot);
  const desktopDir = path.join(repo, 'desktop');
  const desktopInfo = fs.lstatSync(desktopDir);
  if (!desktopInfo.isDirectory() || desktopInfo.isSymbolicLink()) {
    throw new Error('Desktop test profile directory must be a real directory inside the repository');
  }
  const profileRoot = path.join(desktopDir, 'test-profiles');
  const selected = rawProfile === null ? path.join(profileRoot, 'smoke') : rawProfile;
  if (!path.isAbsolute(selected)) {
    throw new Error('Desktop test profile must be an absolute path inside desktop/test-profiles');
  }

  const target = path.resolve(selected);
  if (!isWithin(profileRoot, target) || path.resolve(target) === path.resolve(appDefault)) {
    throw new Error('Desktop test profile must be inside desktop/test-profiles');
  }
  if (!fs.existsSync(profileRoot)) fs.mkdirSync(profileRoot);
  assertNoLinksWithin(profileRoot, target);

  const canonicalRoot = canonicalPath(profileRoot);
  if (canonicalRoot !== path.join(repo, 'desktop', 'test-profiles')) {
    throw new Error('Desktop test profile root resolves outside the repository');
  }
  let probe = target;
  while (!fs.existsSync(probe)) {
    const parent = path.dirname(probe);
    if (parent === probe) throw new Error('Desktop test profile path cannot be resolved');
    probe = parent;
  }
  const canonicalProbe = canonicalPath(probe);
  if (!canonicalRoot || !canonicalProbe || !isWithin(canonicalRoot, canonicalProbe) && canonicalRoot !== canonicalProbe) {
    throw new Error('Desktop test profile resolves outside desktop/test-profiles');
  }
  if (storeId === null || storeId === LEGACY_STORE_ID) return target;
  return resolveStoreProfile(target, storeId);
}

module.exports = { resolveUserDataPath };
