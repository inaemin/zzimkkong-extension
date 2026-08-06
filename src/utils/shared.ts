import { DEBUG_MODE } from "../constants/debug.js";

// 소비처가 편하도록 여기서도 다시 내보낸다.
export { DEBUG_MODE };

/**
 * String(value) 는 객체를 "[object Object]" 로 만들어 버린다.
 * 사용자에게 보이거나 매칭에 쓰는 값이라 그런 문자열이 새어나가면 안 되므로,
 * 원시값만 문자열로 바꾸고 나머지는 빈 문자열로 떨어뜨린다.
 */
export function toDisplayString(value: unknown): string {
  if (typeof value === "string") {
    return value;
  }
  if (typeof value === "number" || typeof value === "boolean" || typeof value === "bigint") {
    return String(value);
  }
  return "";
}

export function normalizeTextForMatch(value: unknown): string {
  if (typeof value !== "string") {
    return "";
  }

  return value.replace(/\s+/g, "").toLowerCase();
}

export function getErrorMessage(error: unknown): string {
  if (error instanceof Error && error.message) {
    return error.message;
  }
  return "알 수 없는 오류가 발생했습니다.";
}

const DEBUG_EVENT_LIMIT = 200;

export interface DebugEvent {
  at: string;
  scope: string;
  event: string;
  detail: unknown;
}

const debugEvents: DebugEvent[] = [];

function cloneDebugValue(value: unknown, seen: WeakSet<object> = new WeakSet()): unknown {
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
    const source = value as Record<string, unknown>;
    const output: Record<string, unknown> = {};
    Object.keys(source).forEach((key) => {
      output[key] = cloneDebugValue(source[key], seen);
    });
    seen.delete(value);
    return output;
  }
  return toDisplayString(value);
}

export function pushDebugEvent(scope: string, event: string, detail: unknown = {}): void {
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

export function debugLog(scope: string, message: string, detail?: unknown): void {
  if (!DEBUG_MODE || typeof console === "undefined" || typeof console.log !== "function") {
    return;
  }
  if (typeof detail === "undefined") {
    console.log("[찜꽁 레이더][debug]", scope, message);
    return;
  }
  console.log("[찜꽁 레이더][debug]", scope, message, detail);
}

export function debugWarn(scope: string, message: string, detail?: unknown): void {
  if (!DEBUG_MODE || typeof console === "undefined" || typeof console.warn !== "function") {
    return;
  }
  if (typeof detail === "undefined") {
    console.warn("[찜꽁 레이더][debug]", scope, message);
    return;
  }
  console.warn("[찜꽁 레이더][debug]", scope, message, detail);
}

export function getDebugEvents(): unknown[] {
  return debugEvents.map((entry) => cloneDebugValue(entry));
}

export function clearDebugEvents(): void {
  debugEvents.length = 0;
}
