(function (root, factory) {
  const api = factory();
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  root.PackMasterBatchTransition = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';

  const createCoordinator = () => {
    let busy = false;
    const run = async ({ hasCurrent, saveCurrent, transition }) => {
      if (busy) return { ok: false, reason: 'busy' };
      if (typeof transition !== 'function') throw new Error('transition must be a function');
      busy = true;
      try {
        if (hasCurrent) {
          if (typeof saveCurrent !== 'function') return { ok: false, reason: 'save-unavailable' };
          let saved = false;
          try { saved = await saveCurrent(); }
          catch (error) { return { ok: false, reason: 'save-failed', error }; }
          if (!saved) return { ok: false, reason: 'save-failed' };
        }
        try { await transition(); }
        catch (error) { return { ok: false, reason: 'transition-failed', error }; }
        return { ok: true };
      } finally {
        busy = false;
      }
    };
    return { run };
  };

  return { createCoordinator };
});
