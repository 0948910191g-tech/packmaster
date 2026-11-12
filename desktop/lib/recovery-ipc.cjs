'use strict';

const { createRecoveryJournal } = require('./recovery-journal.cjs');

const PREFIX = 'packmaster:recovery:';

function parseOrigin(value) {
  let parsed;
  try { parsed = new URL(value); }
  catch { throw new Error('Recovery application origin is invalid'); }
  if (parsed.username || parsed.password || parsed.pathname !== '' && parsed.pathname !== '/' || parsed.search || parsed.hash) {
    throw new Error('Recovery application origin is invalid');
  }
  return { protocol: parsed.protocol, hostname: parsed.hostname, port: parsed.port };
}

function registerRecoveryIpc({ ipcMain, win, profilePath, storeId, origin, fsOps }) {
  if (!ipcMain || typeof ipcMain.handle !== 'function') throw new Error('IPC main handler is required');
  if (!win || !win.webContents || typeof win.webContents.id !== 'number') throw new Error('Trusted application window is required');
  const expectedOrigin = parseOrigin(origin);
  const journal = createRecoveryJournal({ profilePath, storeId, fsOps });

  function assertTrusted(event) {
    if (!event || event.sender !== win.webContents || event.sender.id !== win.webContents.id) {
      throw new Error('Recovery request is restricted to the trusted application window');
    }
    const frame = event.senderFrame;
    if (win.webContents.mainFrame && frame !== win.webContents.mainFrame) {
      throw new Error('Recovery request is restricted to the trusted main frame');
    }
    let actual;
    try { actual = new URL(frame && frame.url); }
    catch { throw new Error('Recovery request origin is not trusted'); }
    if (actual.protocol !== expectedOrigin.protocol || actual.hostname !== expectedOrigin.hostname || actual.port !== expectedOrigin.port) {
      throw new Error('Recovery request origin is not trusted');
    }
  }

  const register = (name, action) => ipcMain.handle(PREFIX + name, async (event, payload) => {
    assertTrusted(event);
    try { return action(payload); }
    catch (error) {
      if (error && error.code === 'ENOSPC') throw new Error('Insufficient disk space to save the recovery snapshot');
      if (error instanceof SyntaxError) throw new Error('The recovery journal is invalid and could not be read');
      if (error && ['EACCES', 'EEXIST', 'EIO', 'EISDIR', 'ENODEV', 'ENOENT', 'ENOTDIR', 'EPERM', 'EROFS', 'EXDEV'].includes(error.code)) {
        throw new Error(`Recovery journal file operation failed (${error.code})`);
      }
      throw error;
    }
  });

  register('get-pending', () => journal.getPending());
  register('prepare', payload => journal.prepare(payload));
  register('complete', payload => journal.complete(payload));
}

module.exports = { registerRecoveryIpc };
