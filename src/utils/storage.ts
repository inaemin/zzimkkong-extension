import { debugWarn, pushDebugEvent, toDisplayString } from "./shared.js";

function reportStorageFailure(event: string, storageKey: unknown, error: unknown): void {
  const detail = {
    key: typeof storageKey === "string" ? storageKey : "",
    error: getStorageErrorMessage(error),
  };
  pushDebugEvent("storage", event, detail);
  debugWarn("storage", event, detail);
}

function getStorageErrorMessage(error: unknown): string {
  if (error instanceof Error && error.message) {
    return error.message;
  }
  return toDisplayString(error) || "unknown storage error";
}

/**
 * localStorage 읽기. 실패하면 보고하고 null 을 준다.
 *
 * 저장소 접근은 오리진·설정에 따라 던진다. try 를 각 함수에 두면 그 자체로
 * 중첩이 한 겹 늘어나서, 읽기만 여기로 모은다.
 */
function readRawStorageValue(storageKey: string): string | null {
  try {
    return window.localStorage.getItem(storageKey);
  } catch (error) {
    reportStorageFailure("read-failed", storageKey, error);
    return null;
  }
}

/** localStorage 삭제. 실패는 보고만 하고 넘어간다. */
function removeRawStorageValue(storageKey: string): void {
  try {
    window.localStorage.removeItem(storageKey);
  } catch (error) {
    reportStorageFailure("remove-failed", storageKey, error);
  }
}

export function readStoredBoolean(storageKey: string, fallbackValue = false): boolean {
  if (typeof storageKey !== "string" || storageKey === "") {
    return Boolean(fallbackValue);
  }

  const rawValue = readRawStorageValue(storageKey);
  if (rawValue === "1" || rawValue === "true") {
    return true;
  }
  if (rawValue === "0" || rawValue === "false") {
    return false;
  }

  return Boolean(fallbackValue);
}

export function writeStoredBoolean(storageKey: string, value: boolean): void {
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

export function readStoredText(storageKey: string, fallbackValue = ""): string {
  if (typeof storageKey !== "string" || storageKey === "") {
    return typeof fallbackValue === "string" ? fallbackValue : "";
  }

  const rawValue = readRawStorageValue(storageKey);
  if (typeof rawValue === "string") {
    return rawValue;
  }

  return typeof fallbackValue === "string" ? fallbackValue : "";
}

export function writeStoredText(storageKey: string, value: string): void {
  if (typeof storageKey !== "string" || storageKey === "") {
    return;
  }

  const normalized = typeof value === "string" ? value : "";
  if (normalized === "") {
    removeRawStorageValue(storageKey);
    return;
  }

  try {
    window.localStorage.setItem(storageKey, normalized);
  } catch (error) {
    reportStorageFailure("write-failed", storageKey, error);
  }
}

export function readStoredNumber(
  storageKey: string,
  fallbackValue: number | null = null,
): number | null {
  const normalizedFallback = Number.isFinite(fallbackValue) ? fallbackValue : null;

  if (typeof storageKey !== "string" || storageKey === "") {
    return normalizedFallback;
  }

  const rawValue = readRawStorageValue(storageKey);

  if (typeof rawValue !== "string" || rawValue.trim() === "") {
    return normalizedFallback;
  }

  const parsed = Number(rawValue);
  if (!Number.isFinite(parsed)) {
    return normalizedFallback;
  }

  return parsed;
}

export function writeStoredNumber(storageKey: string, value: number): void {
  if (typeof storageKey !== "string" || storageKey === "") {
    return;
  }

  if (!Number.isFinite(value)) {
    removeRawStorageValue(storageKey);
    return;
  }

  try {
    window.localStorage.setItem(storageKey, String(value));
  } catch (error) {
    reportStorageFailure("write-failed", storageKey, error);
  }
}
