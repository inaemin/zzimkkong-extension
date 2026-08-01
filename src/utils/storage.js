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

export function readStoredBoolean(storageKey, fallbackValue = false) {
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

export function writeStoredBoolean(storageKey, value) {
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

export function readStoredText(storageKey, fallbackValue = "") {
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

export function writeStoredText(storageKey, value) {
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

export function readStoredNumber(storageKey, fallbackValue = null) {
  const normalizedFallback = Number.isFinite(fallbackValue) ? fallbackValue : null;

  if (typeof storageKey !== "string" || storageKey === "") {
    return normalizedFallback;
  }

  let rawValue = null;
  try {
    rawValue = window.localStorage.getItem(storageKey);
  } catch (error) {
    reportStorageFailure("read-failed", storageKey, error);
    return normalizedFallback;
  }

  if (typeof rawValue !== "string" || rawValue.trim() === "") {
    return normalizedFallback;
  }

  const parsed = Number(rawValue);
  if (!Number.isFinite(parsed)) {
    return normalizedFallback;
  }

  return parsed;
}

export function writeStoredNumber(storageKey, value) {
  if (typeof storageKey !== "string" || storageKey === "") {
    return;
  }

  if (!Number.isFinite(value)) {
    try {
      window.localStorage.removeItem(storageKey);
    } catch (error) {
      reportStorageFailure("remove-failed", storageKey, error);
    }
    return;
  }

  try {
    window.localStorage.setItem(storageKey, String(value));
  } catch (error) {
    reportStorageFailure("write-failed", storageKey, error);
  }
}

// content.js 등 아직 전역을 읽는 소비처를 위해 이중 등록한다.
// 소비처가 전부 import 로 옮겨지면 이 줄만 지우면 된다.
globalThis.__zzkStorageUtils = {
  readStoredBoolean,
  writeStoredBoolean,
  readStoredText,
  writeStoredText,
  readStoredNumber,
  writeStoredNumber,
};
