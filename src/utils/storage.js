(() => {
  if (globalThis.__zzkStorageUtils) {
    return;
  }

  function reportStorageFailure(event, storageKey, error) {
    const detail = {
      key: typeof storageKey === "string" ? storageKey : "",
      error: getStorageErrorMessage(error),
    };
    if (typeof globalThis.__zzkSharedUtils?.pushDebugEvent === "function") {
      globalThis.__zzkSharedUtils.pushDebugEvent("storage", event, detail);
    }
    if (typeof globalThis.__zzkSharedUtils?.debugWarn === "function") {
      globalThis.__zzkSharedUtils.debugWarn("storage", event, detail);
    }
  }

  function getStorageErrorMessage(error) {
    if (error instanceof Error && error.message) {
      return error.message;
    }
    return String(error || "unknown storage error");
  }

  function readStoredBoolean(storageKey, fallbackValue = false) {
    if (typeof storageKey !== "string" || storageKey === "") {
      return Boolean(fallbackValue);
    }

    try {
      const rawValue = window.localStorage.getItem(storageKey);
      if (rawValue === "1" || rawValue === "true") {
        return true;
      }
      if (rawValue === "0" || rawValue === "false") {
        return false;
      }
    } catch (error) {
      reportStorageFailure("read-failed", storageKey, error);
      return Boolean(fallbackValue);
    }

    return Boolean(fallbackValue);
  }

  function writeStoredBoolean(storageKey, value) {
    if (typeof storageKey !== "string" || storageKey === "") {
      return;
    }

    try {
      window.localStorage.setItem(storageKey, value ? "1" : "0");
    } catch (error) {
      reportStorageFailure("write-failed", storageKey, error);
      return;
    }
  }

  function readStoredText(storageKey, fallbackValue = "") {
    if (typeof storageKey !== "string" || storageKey === "") {
      return typeof fallbackValue === "string" ? fallbackValue : "";
    }

    try {
      const rawValue = window.localStorage.getItem(storageKey);
      if (typeof rawValue === "string") {
        return rawValue;
      }
    } catch (error) {
      reportStorageFailure("read-failed", storageKey, error);
      return typeof fallbackValue === "string" ? fallbackValue : "";
    }

    return typeof fallbackValue === "string" ? fallbackValue : "";
  }

  function writeStoredText(storageKey, value) {
    if (typeof storageKey !== "string" || storageKey === "") {
      return;
    }

    try {
      const normalized = typeof value === "string" ? value : "";
      if (normalized === "") {
        try {
          window.localStorage.removeItem(storageKey);
        } catch (error) {
          reportStorageFailure("remove-failed", storageKey, error);
        }
        return;
      }

      window.localStorage.setItem(storageKey, normalized);
    } catch (error) {
      reportStorageFailure("write-failed", storageKey, error);
      return;
    }
  }

  globalThis.__zzkStorageUtils = {
    readStoredBoolean,
    writeStoredBoolean,
    readStoredText,
    writeStoredText,
  };
})();
