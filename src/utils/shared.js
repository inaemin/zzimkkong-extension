import { DEBUG_MODE } from "../constants/debug.js";

// 소비처가 편하도록 여기서도 다시 내보낸다.
export { DEBUG_MODE };

export function normalizeTextForMatch(value) {
  if (typeof value !== "string") {
    return "";
  }

  return value.replace(/\s+/g, "").toLowerCase();
}

export function getErrorMessage(error) {
  if (error instanceof Error && error.message) {
    return error.message;
  }
  return "알 수 없는 오류가 발생했습니다.";
}

const DEBUG_EVENT_LIMIT = 200;
const debugEvents = [];

function cloneDebugValue(value, seen = new WeakSet()) {
  if (value == null) {
    return value;
  }
  if (typeof value === "string" || typeof value === "number" || typeof value === "boolean") {
    return value;
  }
  if (value instanceof Date) {
    return value.toISOString();
  }
  if (Array.isArray(value)) {
    return value.map((entry) => cloneDebugValue(entry, seen));
  }
  if (typeof value === "object") {
    if (seen.has(value)) {
      return "[circular]";
    }
    seen.add(value);
    const output = {};
    Object.keys(value).forEach((key) => {
      output[key] = cloneDebugValue(value[key], seen);
    });
    seen.delete(value);
    return output;
  }
  return String(value);
}

export function pushDebugEvent(scope, event, detail = {}) {
  if (!DEBUG_MODE) {
    return;
  }
  debugEvents.push({
    at: new Date().toISOString(),
    scope,
    event,
    detail: cloneDebugValue(detail),
  });
  if (debugEvents.length > DEBUG_EVENT_LIMIT) {
    debugEvents.splice(0, debugEvents.length - DEBUG_EVENT_LIMIT);
  }
}

export function debugLog(scope, message, detail = undefined) {
  if (!DEBUG_MODE || typeof console === "undefined" || typeof console.log !== "function") {
    return;
  }
  if (typeof detail === "undefined") {
    console.log("[찜꽁 레이더][debug]", scope, message);
    return;
  }
  console.log("[찜꽁 레이더][debug]", scope, message, detail);
}

export function debugWarn(scope, message, detail = undefined) {
  if (!DEBUG_MODE || typeof console === "undefined" || typeof console.warn !== "function") {
    return;
  }
  if (typeof detail === "undefined") {
    console.warn("[찜꽁 레이더][debug]", scope, message);
    return;
  }
  console.warn("[찜꽁 레이더][debug]", scope, message, detail);
}

export function getDebugEvents() {
  return debugEvents.map((entry) => cloneDebugValue(entry));
}

export function clearDebugEvents() {
  debugEvents.length = 0;
}

// content.js 등 아직 전역을 읽는 소비처를 위해 이중 등록한다.
// 소비처가 전부 import 로 옮겨지면 이 줄만 지우면 된다.
globalThis.__zzkSharedUtils = {
  normalizeTextForMatch,
  getErrorMessage,
  DEBUG_MODE,
  pushDebugEvent,
  debugLog,
  debugWarn,
  getDebugEvents,
  clearDebugEvents,
};
