// 페이지 앱이 보낸 예약 요청에서 뽑아낸 정보. Slack 모달 컨텍스트의 재료가 된다.
export interface ReservationRequestContext {
  date?: string;
  startTime?: string;
  endTime?: string;
  description?: string;
  roomName?: string;
  roomId?: number;
}

/** MAIN world 훅이 isolated world 로 postMessage 하는 payload. */
export interface ReservationEventPayload {
  via: string;
  url: string;
  method: unknown;
  status: number;
  ok: boolean;
  timestamp: number;
  ownerNameCandidate: string;
  requestContext: ReservationRequestContext | null;
  reservationAttemptId?: string;
  /** lms+ 예약 생성 응답 body(spaceName/floor/reserverName 등). */
  responseBody?: unknown;
}

/**
 * String(value) 는 객체를 "[object Object]" 로 만든다. 매칭·표시에 쓰는 값이라
 * 그런 문자열이 새어나가면 안 되므로 원시값만 문자열로 바꾼다.
 *
 * utils/shared.ts 에 같은 함수가 있지만 여기서 import 하지 않는다.
 * 이 파일은 MAIN world 번들의 뿌리라, 다른 모듈을 끌어오면 Vite 가 공유 청크를
 * 분리하면서 진입점에 로더가 생긴다(주입 방식이 달라져 테스트가 깨진다).
 */
function toDisplayString(value: unknown): string {
  if (typeof value === "string") {
    return value;
  }
  if (typeof value === "number" || typeof value === "boolean" || typeof value === "bigint") {
    return String(value);
  }
  return "";
}

export const MESSAGE_SOURCE = "zzk-page-reservation-hook";
export const MESSAGE_TYPE = "ZZK_RESERVATION_NETWORK_EVENT";

export function normalizeMethod(methodValue: unknown): string {
  if (typeof methodValue !== "string" || methodValue.trim() === "") {
    return "GET";
  }

  return methodValue.trim().toUpperCase();
}

export function parseUrl(urlValue: unknown): URL | null {
  if (typeof urlValue !== "string" || urlValue.trim() === "") {
    return null;
  }

  try {
    return new URL(urlValue, location.href);
  } catch (error) {
    const ignoredError = error;
    void ignoredError;
    return null;
  }
}

export function normalizeText(value: unknown): string {
  if (typeof value !== "string") {
    return "";
  }

  return value.replace(/\s+/g, " ").trim();
}

export function normalizeOwnerCandidate(value: unknown): string {
  const normalized = normalizeText(toDisplayString(value));
  if (!normalized) {
    return "";
  }

  const normalizedKey = normalized.replace(/\s+/g, "").toLowerCase();
  const ignored = new Set([
    "-",
    "name",
    "이름",
    "예약자",
    "예약자명",
    "신청자",
    "신청자명",
    "owner",
    "ownername",
    "requester",
    "booker",
    "guest",
    "guestname",
    "select",
    "선택",
    "입력",
  ]);
  if (ignored.has(normalizedKey)) {
    return "";
  }

  return normalized;
}

export function isOwnerFieldKey(key: unknown): boolean {
  const normalized = normalizeText(toDisplayString(key)).replace(/\s+/g, "").toLowerCase();
  if (!normalized) {
    return false;
  }

  const exactMatch = [
    "name",
    "owner",
    "ownername",
    "requester",
    "requestername",
    "reserver",
    "reservername",
    "booker",
    "bookername",
    "guest",
    "guestname",
    "reservationowner",
    "reservationownername",
    "applicant",
    "applicantname",
    "username",
    "이름",
    "예약자",
    "예약자명",
    "신청자",
    "신청자명",
  ].includes(normalized);
  if (exactMatch) {
    return true;
  }

  const isCompositeNameField =
    normalized.endsWith(".name") || normalized.endsWith("[name]") || normalized.endsWith("_name");
  if (!isCompositeNameField) {
    return false;
  }

  const hasOwnerContext = [
    "owner",
    "requester",
    "booker",
    "guest",
    "applicant",
    "reservation",
    "user",
    "예약자",
    "신청자",
  ].some((token) => normalized.includes(token));
  const hasRoomContext = ["room", "space", "map", "resource", "회의실", "공간", "장소"].some(
    (token) => normalized.includes(token),
  );
  return hasOwnerContext && !hasRoomContext;
}

export function extractOwnerCandidateFromEntries(entries: Array<[string, unknown]>): string {
  if (!Array.isArray(entries) || entries.length === 0) {
    return "";
  }

  for (const [rawKey, rawValue] of entries) {
    if (!isOwnerFieldKey(rawKey)) {
      continue;
    }

    const candidate = normalizeOwnerCandidate(rawValue);
    if (candidate) {
      return candidate;
    }
  }

  return "";
}

export function extractOwnerCandidateFromObject(value: unknown, depth = 0): string {
  if (!value || typeof value !== "object" || depth > 3) {
    return "";
  }

  if (Array.isArray(value)) {
    for (const item of value) {
      const nested = extractOwnerCandidateFromObject(item, depth + 1);
      if (nested) {
        return nested;
      }
    }
    return "";
  }

  const entries = Object.entries(value);
  const direct = extractOwnerCandidateFromEntries(entries);
  if (direct) {
    return direct;
  }

  for (const [, nestedValue] of entries) {
    const nested = extractOwnerCandidateFromObject(nestedValue, depth + 1);
    if (nested) {
      return nested;
    }
  }

  return "";
}

export function extractOwnerCandidateFromBody(body: unknown): string {
  if (body == null) {
    return "";
  }

  if (typeof FormData !== "undefined" && body instanceof FormData) {
    const entries = [];
    body.forEach((value, key) => {
      entries.push([key, typeof value === "string" ? value : ""]);
    });
    return extractOwnerCandidateFromEntries(entries);
  }

  if (typeof URLSearchParams !== "undefined" && body instanceof URLSearchParams) {
    return extractOwnerCandidateFromEntries(Array.from(body.entries()));
  }

  if (typeof body === "string") {
    const trimmed = body.trim();
    if (!trimmed) {
      return "";
    }

    try {
      const parsedJson = JSON.parse(trimmed);
      const candidateFromJson = extractOwnerCandidateFromObject(parsedJson);
      if (candidateFromJson) {
        return candidateFromJson;
      }
    } catch (error) {
      const ignoredError = error;
      void ignoredError;
    }

    try {
      const searchParams = new URLSearchParams(trimmed);
      const candidateFromParams = extractOwnerCandidateFromEntries(
        Array.from(searchParams.entries()),
      );
      if (candidateFromParams) {
        return candidateFromParams;
      }
    } catch (error) {
      const ignoredError = error;
      void ignoredError;
    }

    return "";
  }

  if (typeof body === "object") {
    return extractOwnerCandidateFromObject(body);
  }

  return "";
}

export async function extractOwnerCandidateFromFetchRequest(
  input: unknown,
  init?: RequestInit,
): Promise<string> {
  const fromInit = init && typeof init === "object" ? extractOwnerCandidateFromBody(init.body) : "";
  if (fromInit) {
    return fromInit;
  }

  if (typeof Request !== "undefined" && input instanceof Request) {
    try {
      const clonedRequest = input.clone();
      if (typeof clonedRequest.formData === "function") {
        try {
          const formData = await clonedRequest.formData();
          const candidateFromFormData = extractOwnerCandidateFromBody(formData);
          if (candidateFromFormData) {
            return candidateFromFormData;
          }
        } catch (error) {
          const ignoredError = error;
          void ignoredError;
        }
      }

      const secondClone = input.clone();
      if (typeof secondClone.json === "function") {
        try {
          const jsonValue = await secondClone.json();
          const candidateFromJson = extractOwnerCandidateFromBody(jsonValue);
          if (candidateFromJson) {
            return candidateFromJson;
          }
        } catch (error) {
          const ignoredError = error;
          void ignoredError;
        }
      }

      const thirdClone = input.clone();
      const text = await thirdClone.text();
      return extractOwnerCandidateFromBody(text);
    } catch (error) {
      const ignoredError = error;
      void ignoredError;
    }
  }

  return "";
}

export function normalizeFieldKey(value: unknown): string {
  return normalizeText(toDisplayString(value)).replace(/\s+/g, "").toLowerCase();
}

export function normalizeDateCandidate(value: unknown): string {
  const normalized = normalizeText(toDisplayString(value));
  const match = normalized.match(/(\d{4}-\d{2}-\d{2})/);
  return match ? match[1] : "";
}

export function normalizeTimeCandidate(value: unknown): string {
  const normalized = normalizeText(toDisplayString(value));
  const match = normalized.match(/(\d{1,2}):(\d{2})/);
  if (!match) {
    return "";
  }

  const hour = String(Number.parseInt(match[1], 10)).padStart(2, "0");
  const minute = match[2];
  if (!/^\d{2}$/.test(minute)) {
    return "";
  }
  return `${hour}:${minute}`;
}

export function extractDateTimeParts(value: unknown): { date: string; time: string } {
  return {
    date: normalizeDateCandidate(value),
    time: normalizeTimeCandidate(value),
  };
}

export function normalizeDescriptionCandidate(value: unknown): string {
  const normalized = normalizeText(toDisplayString(value));
  if (!normalized) {
    return "";
  }

  if (
    ["-", "--", "description", "purpose", "사용목적", "이용목적", "예약내용"].includes(normalized)
  ) {
    return "";
  }

  return normalized;
}

export function isStartDateTimeFieldKey(normalizedKey: string): boolean {
  return (
    normalizedKey.includes("startdatetime") ||
    normalizedKey.includes("starttime") ||
    normalizedKey.endsWith("start") ||
    normalizedKey.endsWith("from")
  );
}

export function isEndDateTimeFieldKey(normalizedKey: string): boolean {
  return (
    normalizedKey.includes("enddatetime") ||
    normalizedKey.includes("endtime") ||
    normalizedKey.endsWith("end") ||
    normalizedKey.endsWith("to")
  );
}

export function isDateFieldKey(normalizedKey: string): boolean {
  return (
    normalizedKey === "date" ||
    normalizedKey.endsWith("date") ||
    normalizedKey.includes("reservationdate") ||
    normalizedKey.includes("bookdate")
  );
}

export function isDescriptionFieldKey(normalizedKey: string): boolean {
  return (
    normalizedKey.includes("description") ||
    normalizedKey.includes("purpose") ||
    normalizedKey.includes("memo") ||
    normalizedKey.includes("content") ||
    normalizedKey.includes("사용목적") ||
    normalizedKey.includes("예약내용")
  );
}

export function isRoomNameFieldKey(normalizedKey: string): boolean {
  return (
    normalizedKey.includes("roomname") ||
    normalizedKey.includes("spacename") ||
    normalizedKey.includes("room") ||
    normalizedKey.includes("space")
  );
}

export function isRoomIdFieldKey(normalizedKey: string): boolean {
  return (
    normalizedKey === "roomid" ||
    normalizedKey === "spaceid" ||
    normalizedKey === "room_id" ||
    normalizedKey === "space_id" ||
    normalizedKey.endsWith("roomid") ||
    normalizedKey.endsWith("spaceid")
  );
}

export function parseReservationRoomIdCandidate(value: unknown): number | null {
  if (typeof value === "number" && Number.isInteger(value)) {
    return value;
  }

  const normalized = normalizeText(toDisplayString(value));
  if (!/^\d+$/.test(normalized)) {
    return null;
  }

  const roomId = Number.parseInt(normalized, 10);
  return Number.isInteger(roomId) ? roomId : null;
}

export function mergeReservationRequestContext(
  baseContext: ReservationRequestContext | null,
  patchContext: ReservationRequestContext | null,
): ReservationRequestContext {
  const base = baseContext && typeof baseContext === "object" ? { ...baseContext } : {};
  if (!patchContext || typeof patchContext !== "object") {
    return base;
  }

  const next = { ...base };
  ["date", "startTime", "endTime", "description", "roomName"].forEach((key) => {
    const value = normalizeText(String(patchContext[key] || ""));
    if (!value) {
      return;
    }
    if (!next[key]) {
      next[key] = value;
    }
  });

  if (Number.isInteger(patchContext.roomId) && !Number.isInteger(next.roomId)) {
    next.roomId = patchContext.roomId;
  }

  return next;
}

export function finalizeReservationRequestContext(
  context: ReservationRequestContext | null,
): ReservationRequestContext | null {
  if (!context || typeof context !== "object") {
    return null;
  }

  const date = normalizeDateCandidate(context.date || "");
  const startTime = normalizeTimeCandidate(context.startTime || "");
  const endTime = normalizeTimeCandidate(context.endTime || "");
  const description = normalizeDescriptionCandidate(context.description || "");
  const roomName = normalizeText(String(context.roomName || ""));
  const roomId = Number.isInteger(context.roomId) ? context.roomId : null;

  const normalized: ReservationRequestContext = {
    date,
    startTime,
    endTime,
    description,
    roomName,
  };
  if (typeof roomId === "number" && Number.isInteger(roomId)) {
    normalized.roomId = roomId;
  }

  const hasValue = Object.values(normalized).some((value) => {
    if (typeof value === "number") {
      return Number.isFinite(value);
    }
    return typeof value === "string" && value !== "";
  });

  return hasValue ? normalized : null;
}

export function extractReservationRequestContextFromEntries(
  entries: Array<[string, unknown]>,
  initialContext: ReservationRequestContext | null = null,
): ReservationRequestContext | null {
  if (!Array.isArray(entries) || entries.length === 0) {
    return finalizeReservationRequestContext(initialContext);
  }

  // 항목 하나가 문맥에 더할 조각. 해당 없으면 null 이라 병합하지 않는다.
  const patchForEntry = (rawKey, rawValue) => {
    const normalizedKey = normalizeFieldKey(rawKey);
    if (!normalizedKey) {
      return null;
    }

    const stringValue = typeof rawValue === "string" ? rawValue : toDisplayString(rawValue);
    if (!normalizeText(stringValue)) {
      return null;
    }

    if (isStartDateTimeFieldKey(normalizedKey)) {
      const parts = extractDateTimeParts(stringValue);
      return { date: parts.date, startTime: parts.time };
    }
    if (isEndDateTimeFieldKey(normalizedKey)) {
      const parts = extractDateTimeParts(stringValue);
      return { date: parts.date, endTime: parts.time };
    }
    if (isDateFieldKey(normalizedKey)) {
      return { date: normalizeDateCandidate(stringValue) };
    }
    if (isDescriptionFieldKey(normalizedKey)) {
      return { description: normalizeDescriptionCandidate(stringValue) };
    }
    if (isRoomIdFieldKey(normalizedKey)) {
      const roomId = parseReservationRoomIdCandidate(rawValue);
      return Number.isInteger(roomId) ? { roomId } : null;
    }
    if (isRoomNameFieldKey(normalizedKey)) {
      return { roomName: normalizeText(stringValue) };
    }
    return null;
  };

  const context = entries.reduce(
    (acc, [rawKey, rawValue]) => {
      const patch = patchForEntry(rawKey, rawValue);
      return patch ? mergeReservationRequestContext(acc, patch) : acc;
    },
    initialContext && typeof initialContext === "object" ? { ...initialContext } : {},
  );

  return finalizeReservationRequestContext(context);
}

export function extractReservationRequestContextFromObject(
  value,
  depth = 0,
  initialContext = null,
) {
  if (value == null || depth > 4) {
    return finalizeReservationRequestContext(initialContext);
  }

  if (Array.isArray(value)) {
    return value.reduce((acc, item) => {
      return extractReservationRequestContextFromObject(item, depth + 1, acc);
    }, initialContext);
  }

  if (typeof value !== "object") {
    return finalizeReservationRequestContext(initialContext);
  }

  const entries = Object.entries(value);
  const context = entries.reduce(
    (acc, [, nestedValue]) =>
      extractReservationRequestContextFromObject(nestedValue, depth + 1, acc),
    extractReservationRequestContextFromEntries(entries, initialContext),
  );
  return finalizeReservationRequestContext(context);
}

export function extractReservationRequestContextFromBody(
  body: unknown,
): ReservationRequestContext | null {
  if (body == null) {
    return null;
  }

  if (typeof FormData !== "undefined" && body instanceof FormData) {
    const entries = [];
    body.forEach((value, key) => {
      entries.push([key, typeof value === "string" ? value : ""]);
    });
    return extractReservationRequestContextFromEntries(entries);
  }

  if (typeof URLSearchParams !== "undefined" && body instanceof URLSearchParams) {
    return extractReservationRequestContextFromEntries(Array.from(body.entries()));
  }

  if (typeof body === "string") {
    const trimmed = body.trim();
    if (!trimmed) {
      return null;
    }

    try {
      const parsed = JSON.parse(trimmed);
      const fromJson = extractReservationRequestContextFromObject(parsed);
      if (fromJson) {
        return fromJson;
      }
    } catch (error) {
      const ignoredError = error;
      void ignoredError;
    }

    try {
      const fromParams = extractReservationRequestContextFromEntries(
        Array.from(new URLSearchParams(trimmed).entries()),
      );
      if (fromParams) {
        return fromParams;
      }
    } catch (error) {
      const ignoredError = error;
      void ignoredError;
    }

    return null;
  }

  if (typeof body === "object") {
    return extractReservationRequestContextFromObject(body);
  }

  return null;
}

export function extractReservationContextFromUrl(
  urlValue: unknown,
): ReservationRequestContext | null {
  const parsed = parseUrl(urlValue);
  if (!parsed) {
    return null;
  }

  // lms+ 는 경로가 아니라 본문의 spaceId 를 쓰므로 여기서는 못 찾고,
  // body 기반 추출 결과와 병합된다.
  const roomMatch = parsed.pathname.match(/\/spaces\/(\d+)\/reserv/i);
  if (!roomMatch) {
    return null;
  }

  const roomId = Number.parseInt(roomMatch[1], 10);
  if (!Number.isInteger(roomId)) {
    return null;
  }

  return { roomId };
}

export function resolveReservationRequestContextForEmit(
  urlValue: unknown,
  bodyContext: ReservationRequestContext | null,
): ReservationRequestContext | null {
  const mergedContext = mergeReservationRequestContext(
    extractReservationContextFromUrl(urlValue),
    bodyContext && typeof bodyContext === "object" ? bodyContext : null,
  );
  return finalizeReservationRequestContext(mergedContext);
}

export async function extractReservationRequestContextFromFetchRequest(
  input: unknown,
  init?: RequestInit,
): Promise<ReservationRequestContext | null> {
  // Request 본문은 formData → json → text 순으로 세 번 clone 해서 읽는다.
  // 앞이 실패해야 뒤를 시도하는 순차 누적이라 reduce 로 옮기면 오히려 흐름이
  // 가려진다. 여기서만 let 을 허용한다.
  // eslint-disable-next-line no-restricted-syntax
  let context =
    init && typeof init === "object" ? extractReservationRequestContextFromBody(init.body) : null;

  if (typeof Request !== "undefined" && input instanceof Request) {
    try {
      const clonedRequest = input.clone();
      if (typeof clonedRequest.formData === "function") {
        try {
          const formData = await clonedRequest.formData();
          context = mergeReservationRequestContext(
            context,
            extractReservationRequestContextFromBody(formData),
          );
        } catch (error) {
          const ignoredError = error;
          void ignoredError;
        }
      }

      const secondClone = input.clone();
      if (typeof secondClone.json === "function") {
        try {
          const jsonValue = await secondClone.json();
          context = mergeReservationRequestContext(
            context,
            extractReservationRequestContextFromBody(jsonValue),
          );
        } catch (error) {
          const ignoredError = error;
          void ignoredError;
        }
      }

      const thirdClone = input.clone();
      const text = await thirdClone.text();
      context = mergeReservationRequestContext(
        context,
        extractReservationRequestContextFromBody(text),
      );
    } catch (error) {
      const ignoredError = error;
      void ignoredError;
    }
  }

  return finalizeReservationRequestContext(context);
}

export function isReservationMutationRequest(urlValue: unknown, methodValue: unknown): boolean {
  if (!isReservationApiMutationRequest(urlValue, methodValue)) {
    return false;
  }

  const parsed = parseUrl(urlValue);
  if (!parsed) {
    return false;
  }

  return isReservationMutationPath(parsed.pathname);
}

function isReservationMutationPath(pathname: unknown): boolean {
  // lms+: /api/space-reservations/{id}
  return /\/api\/space-reservations(?:\/\d+)?\/?$/i.test(toDisplayString(pathname));
}

export function shouldEmitReservationMutationEvent(
  urlValue: unknown,
  methodValue: unknown,
): boolean {
  return isReservationMutationRequest(urlValue, methodValue);
}

function isReservationApiMutationRequest(urlValue: unknown, methodValue: unknown): boolean {
  const method = normalizeMethod(methodValue);
  if (method === "GET" || method === "HEAD" || method === "OPTIONS") {
    return false;
  }

  const parsed = parseUrl(urlValue);
  if (!parsed) {
    return false;
  }

  return parsed.pathname.toLowerCase().includes("/api/space-reservations");
}

export function emitReservationEvent(payload: ReservationEventPayload): void {
  window.postMessage(
    {
      source: MESSAGE_SOURCE,
      type: MESSAGE_TYPE,
      payload,
    },
    location.origin,
  );
}

export function readReservationAttemptId(): string {
  const value =
    document.documentElement &&
    document.documentElement.dataset &&
    typeof document.documentElement.dataset.zzkReservationAttemptId === "string"
      ? document.documentElement.dataset.zzkReservationAttemptId.trim()
      : "";
  return value || "";
}

export function buildReservationMutationEventPayload(
  options: Record<string, unknown>,
): ReservationEventPayload {
  const eventUrl = toDisplayString(options?.url);
  const reservationAttemptId =
    options &&
    typeof options.reservationAttemptId === "string" &&
    options.reservationAttemptId.trim()
      ? options.reservationAttemptId.trim()
      : readReservationAttemptId();

  const payload: ReservationEventPayload = {
    via: options && typeof options.via === "string" ? options.via : "fetch",
    url: eventUrl,
    method: options ? options.method : "",
    status: Number(options && options.status),
    ok: true,
    timestamp: Date.now(),
    ownerNameCandidate: normalizeOwnerCandidate(options && options.ownerNameCandidate),
    requestContext: resolveReservationRequestContextForEmit(
      eventUrl,
      options && options.requestContext != null ? options.requestContext : null,
    ),
  };

  if (reservationAttemptId) {
    payload.reservationAttemptId = reservationAttemptId;
  }

  // 개편 서비스(lms+) 예약 생성 응답 body(spaceName/floor/reserverName/시간/purpose 등).
  if (options && options.responseBody && typeof options.responseBody === "object") {
    payload.responseBody = options.responseBody;
  }

  return payload;
}
