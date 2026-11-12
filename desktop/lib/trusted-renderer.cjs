'use strict';

function isTrustedTopFrame(event, win, expectedOrigin = 'packmaster://app') {
  if (!event || !win || typeof win.isDestroyed !== 'function' || win.isDestroyed() ||
      !win.webContents || event.sender !== win.webContents ||
      event.senderFrame !== win.webContents.mainFrame) return false;
  try {
    const url = new URL(event.senderFrame.url);
    const expected = new URL(expectedOrigin);
    return !url.username && !url.password && !url.port &&
      url.protocol === expected.protocol && url.hostname === expected.hostname &&
      url.port === expected.port && !expected.username && !expected.password;
  } catch {
    return false;
  }
}

module.exports = { isTrustedTopFrame };
