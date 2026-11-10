(() => {
  "use strict";

  const { DEFAULT_PREMIUM, STATE_VERSION, STORAGE_KEY } = window.BetterToBid.constants;

  const defaultState = {
    version: STATE_VERSION,
    lots: {},
    settings: {
      defaultBuyerPremium: DEFAULT_PREMIUM,
      autoRefresh: true,
      alertOnChanges: true,
      aiApiKey: "",
      aiCollectingFocus: "",
      aiModel: "gpt-5.4-nano",
      aiProvider: "local",
      aiStrategy: "balanced",
      pageInsightMode: "full"
    }
  };

  async function loadState() {
    const stored = await safeStorageGet(STORAGE_KEY);
    return mergeState(defaultState, migrateState(stored?.[STORAGE_KEY] || {}));
  }

  async function saveState(state) {
    await safeStorageSet({ [STORAGE_KEY]: mergeState(defaultState, migrateState(state || {})) });
  }

  function migrateState(stored) {
    return {
      ...stored,
      version: stored.version || 1
    };
  }

  function mergeState(base, stored) {
    return {
      ...base,
      ...stored,
      lots: { ...(base.lots || {}), ...(stored.lots || {}) },
      settings: { ...(base.settings || {}), ...(stored.settings || {}) }
    };
  }

  function createSaver(getState) {
    let saveTimer = null;
    return function queueSave() {
      clearTimeout(saveTimer);
      saveTimer = setTimeout(() => {
        safeStorageSet({ [STORAGE_KEY]: getState() });
      }, 200);
    };
  }

  async function safeStorageGet(key) {
    if (!hasExtensionContext()) return {};
    try {
      return await chrome.storage.local.get(key);
    } catch (error) {
      handleStorageError(error);
      return {};
    }
  }

  async function safeStorageSet(payload) {
    if (!hasExtensionContext()) return false;
    try {
      await chrome.storage.local.set(payload);
      return true;
    } catch (error) {
      handleStorageError(error);
      return false;
    }
  }

  function hasExtensionContext() {
    try {
      return typeof chrome !== "undefined" && Boolean(chrome.runtime?.id && chrome.storage?.local);
    } catch (_error) {
      return false;
    }
  }

  function handleStorageError(error) {
    const message = error?.message || String(error);
    if (/Extension context invalidated/i.test(message)) return;
    console.warn("[BetterToBid] Storage operation failed", error);
  }

  window.BetterToBid.storage = {
    createSaver,
    loadState,
    saveState
  };
})();
