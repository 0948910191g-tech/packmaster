'use strict';

const path = require('node:path');
const ALLOWED_HOST = 'app';
const ALLOWED_SCHEME = 'packmaster:';
const SUPPORTED_EXTENSIONS = new Set([
  '.html', '.js', '.css', '.json', '.png', '.jpg', '.jpeg', '.svg', '.ico', '.webp'
]);

function resolveAppAsset(appRoot, requestUrl) {
  let url;
  try {
    url = new URL(requestUrl);
  } catch {
    return null;
  }
  if (url.protocol !== ALLOWED_SCHEME || url.hostname !== ALLOWED_HOST || url.username || url.password) {
    return null;
  }

  let pathname;
  try {
    pathname = decodeURIComponent(url.pathname);
  } catch {
    return null;
  }
  if (pathname.includes('\0') || pathname.includes('\\') || pathname.split('/').includes('..')) return null;

  const relativePath = pathname.replace(/^\/+/, '') || 'index.html';
  if (!SUPPORTED_EXTENSIONS.has(path.extname(relativePath).toLowerCase())) return null;
  const fullPath = path.resolve(appRoot, relativePath);
  const relative = path.relative(appRoot, fullPath);
  if (relative === '..' || relative.startsWith('..' + path.sep) || path.isAbsolute(relative)) return null;
  return fullPath;
}

module.exports = { resolveAppAsset };
