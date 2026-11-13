(function (root, factory) {
  const api = factory();
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  root.PackMasterRestoreRunner = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';

  // Control flow of a confirmed web/Desktop workspace restore. The page supplies every side effect
  // as a dependency, so the order and the failure handling can be tested without React.
  //
  // Order: preflight -> build safety copy -> download it -> user confirms it was saved
  //        -> journal + replace (runRecoveredReplace) -> on failure: rollback, complete or reload.
  //
  // Nothing destructive happens before the confirmed safety copy. If the user declines at the second
  // confirm, the restore stops with no write at all.
  async function runWorkspaceRestore(deps) {
    const outcome = {
      status: 'failed',
      replacementStarted: false,
      rollbackSucceeded: false,
      safetyCopyFilename: null,
      recoveryId: null,
      error: null,
      rollbackError: null,
      completeError: null,
      reloadRequested: false
    };
    let safetyBackup = null;

    try {
      await deps.preflight();
      safetyBackup = await deps.buildSafetyCopy();
      outcome.safetyCopyFilename = deps.downloadSafetyCopy(safetyBackup);
      const saved = await deps.confirmSafetyCopySaved(outcome.safetyCopyFilename);
      if (!saved) throw new Error('ยังไม่ได้ยืนยันไฟล์สำเนาข้อมูลเดิม');

      await deps.runRecoveredReplace({
        backup: safetyBackup,
        onPrepared: prepared => { outcome.recoveryId = prepared.id; },
        markReplacementStarted: () => { outcome.replacementStarted = true; },
        replace: () => (typeof deps.replace === 'function' ? deps.replace({ markReplacementStarted: () => { outcome.replacementStarted = true; } }) : undefined)
      });
      outcome.status = 'replaced';
      return outcome;
    } catch (error) {
      outcome.error = error;
      if (safetyBackup && outcome.replacementStarted) {
        try {
          await deps.rollback(safetyBackup);
          outcome.rollbackSucceeded = true;
        } catch (rollbackError) {
          outcome.rollbackError = rollbackError;
        }
      }
      // Nothing was replaced when replacementStarted is false, so the journal entry is completed
      // instead of leaving a pending restore that would reload the app into the recovery gate.
      if (outcome.recoveryId && (outcome.rollbackSucceeded || !outcome.replacementStarted)) {
        try {
          await deps.completeRecovery(outcome.recoveryId);
        } catch (completeError) {
          outcome.completeError = completeError;
        }
      }
      // deps.reloadIfPending is the Desktop recovery check: it reloads only while the journal still
      // holds the entry, and it reloads when the journal cannot be read (fail closed).
      if (outcome.recoveryId) outcome.reloadRequested = Boolean(await deps.reloadIfPending(outcome.recoveryId));
      return outcome;
    }
  }

  return { runWorkspaceRestore };
});
