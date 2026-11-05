(function (root, factory) {
  const api = factory();
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  root.PackMasterCloudMappingController = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';

  function createController({ read, write, onState = () => {} }) {
    if (typeof read !== 'function' || typeof write !== 'function' || typeof onState !== 'function') {
      throw new Error('Cloud Mapping requires read/write callbacks');
    }
    let status = 'idle';
    let lastSaved = null;
    let writeQueue = Promise.resolve();

    function setStatus(next) {
      status = next;
      onState(status);
    }
    function validate(value) {
      if (!Array.isArray(value) || value.some(rule =>
        !rule || typeof rule !== 'object' ||
        typeof rule.keyword !== 'string' || !rule.keyword.trim() ||
        typeof rule.shortName !== 'string' || !rule.shortName.trim())) {
        throw new Error('Cloud mapping is not a valid rule array');
      }
      return JSON.stringify(value);
    }
    async function initialize() {
      if (status !== 'idle') throw new Error('Cloud Mapping is already initialized');
      setStatus('loading');
      try {
        const result = await read();
        const values = result?.value === null ? [] : result?.value;
        lastSaved = validate(values);
        setStatus('ready');
        return JSON.parse(lastSaved);
      } catch (error) {
        setStatus('blocked');
        throw error;
      }
    }
    function persist(value) {
      if (status !== 'ready') return Promise.reject(new Error('Cloud Mapping is not ready for writes'));
      const serialized = validate(value);
      const writeOnce = writeQueue.then(async () => {
        if (status !== 'ready') throw new Error('Cloud Mapping writes are blocked');
        if (serialized === lastSaved) return false;
        try {
          await write(JSON.parse(serialized));
          lastSaved = serialized;
          return true;
        } catch (error) {
          setStatus('blocked');
          throw error;
        }
      });
      writeQueue = writeOnce.catch(() => {});
      return writeOnce;
    }

    return { initialize, persist, getStatus: () => status };
  }

  return { createController };
});
