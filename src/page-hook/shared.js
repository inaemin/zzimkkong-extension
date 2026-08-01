export const MESSAGE_SOURCE = "zzk-page-reservation-hook";
export const MESSAGE_TYPE = "ZZK_RESERVATION_NETWORK_EVENT";

export function normalizeMethod(methodValue) {
  if (typeof methodValue !== "string" || methodValue.trim() === "") {
    return "GET";
  }

  return methodValue.trim().toUpperCase();
}

export function parseUrl(urlValue) {
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

export function normalizeText(value) {
  if (typeof value !== "string") {
    return "";
  }

  return value.replace(/\s+/g, " ").trim();
}

export function normalizeOwnerCandidate(value) {
  const normalized = normalizeText(String(value || ""));
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

export function isOwnerFieldKey(key) {
  const normalized = normalizeText(String(key || ""))
    .replace(/\s+/g, "")
    .toLowerCase();
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

export function extractOwnerCandidateFromEntries(entries) {
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

export function extractOwnerCandidateFromObject(value, depth = 0) {
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

export function extractOwnerCandidateFromBody(body) {
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

export async function extractOwnerCandidateFromFetchRequest(input, init) {
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

export function normalizeFieldKey(value) {
  return normalizeText(String(value || ""))
    .replace(/\s+/g, "")
    .toLowerCase();
}

export function normalizeDateCandidate(value) {
  const normalized = normalizeText(String(value || ""));
  const match = normalized.match(/(\d{4}-\d{2}-\d{2})/);
  return match ? match[1] : "";
}

export function normalizeTimeCandidate(value) {
  const normalized = normalizeText(String(value || ""));
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

export function extractDateTimeParts(value) {
  return {
    date: normalizeDateCandidate(value),
    time: normalizeTimeCandidate(value),
  };
}

export function normalizeDescriptionCandidate(value) {
  const normalized = normalizeText(String(value || ""));
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

export function isStartDateTimeFieldKey(normalizedKey) {
  return (
    normalizedKey.includes("startdatetime") ||
    normalizedKey.includes("starttime") ||
    normalizedKey.endsWith("start") ||
    normalizedKey.endsWith("from")
  );
}

export function isEndDateTimeFieldKey(normalizedKey) {
  return (
    normalizedKey.includes("enddatetime") ||
    normalizedKey.includes("endtime") ||
    normalizedKey.endsWith("end") ||
    normalizedKey.endsWith("to")
  );
}

export function isDateFieldKey(normalizedKey) {
  return (
    normalizedKey === "date" ||
    normalizedKey.endsWith("date") ||
    normalizedKey.includes("reservationdate") ||
    normalizedKey.includes("bookdate")
  );
}

export function isDescriptionFieldKey(normalizedKey) {
  return (
    normalizedKey.includes("description") ||
    normalizedKey.includes("purpose") ||
    normalizedKey.includes("memo") ||
    normalizedKey.includes("content") ||
    normalizedKey.includes("사용목적") ||
    normalizedKey.includes("예약내용")
  );
}

export function isRoomNameFieldKey(normalizedKey) {
  return (
    normalizedKey.includes("roomname") ||
    normalizedKey.includes("spacename") ||
    normalizedKey.includes("room") ||
    normalizedKey.includes("space")
  );
}

export function isRoomIdFieldKey(normalizedKey) {
  return (
    normalizedKey === "roomid" ||
    normalizedKey === "spaceid" ||
    normalizedKey === "room_id" ||
    normalizedKey === "space_id" ||
    normalizedKey.endsWith("roomid") ||
    normalizedKey.endsWith("spaceid")
  );
}

export function parseReservationRoomIdCandidate(value) {
  if (Number.isInteger(value)) {
    return value;
  }

  const normalized = normalizeText(String(value || ""));
  if (!/^\d+$/.test(normalized)) {
    return null;
  }

  const roomId = Number.parseInt(normalized, 10);
  return Number.isInteger(roomId) ? roomId : null;
}

export function mergeReservationRequestContext(baseContext, patchContext) {
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

export function finalizeReservationRequestContext(context) {
  if (!context || typeof context !== "object") {
    return null;
  }

  const date = normalizeDateCandidate(context.date || "");
  const startTime = normalizeTimeCandidate(context.startTime || "");
  const endTime = normalizeTimeCandidate(context.endTime || "");
  const description = normalizeDescriptionCandidate(context.description || "");
  const roomName = normalizeText(String(context.roomName || ""));
  const roomId = Number.isInteger(context.roomId) ? context.roomId : null;

  const normalized = {
    date,
    startTime,
    endTime,
    description,
    roomName,
  };
  if (Number.isInteger(roomId)) {
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

export function extractReservationRequestContextFromEntries(entries, initialContext = null) {
  if (!Array.isArray(entries) || entries.length === 0) {
    return finalizeReservationRequestContext(initialContext);
  }

  let context = initialContext && typeof initialContext === "object" ? { ...initialContext } : {};
  entries.forEach(([rawKey, rawValue]) => {
    const normalizedKey = normalizeFieldKey(rawKey);
    if (!normalizedKey) {
      return;
    }

    const stringValue = typeof rawValue === "string" ? rawValue : String(rawValue || "");
    if (!normalizeText(stringValue)) {
      return;
    }

    if (isStartDateTimeFieldKey(normalizedKey)) {
      const parts = extractDateTimeParts(stringValue);
      context = mergeReservationRequestContext(context, {
        date: parts.date,
        startTime: parts.time,
      });
      return;
    }

    if (isEndDateTimeFieldKey(normalizedKey)) {
      const parts = extractDateTimeParts(stringValue);
      context = mergeReservationRequestContext(context, {
        date: parts.date,
        endTime: parts.time,
      });
      return;
    }

    if (isDateFieldKey(normalizedKey)) {
      const date = normalizeDateCandidate(stringValue);
      context = mergeReservationRequestContext(context, { date });
      return;
    }

    if (isDescriptionFieldKey(normalizedKey)) {
      const description = normalizeDescriptionCandidate(stringValue);
      context = mergeReservationRequestContext(context, { description });
      return;
    }

    if (isRoomIdFieldKey(normalizedKey)) {
      const roomId = parseReservationRoomIdCandidate(rawValue);
      if (Number.isInteger(roomId)) {
        context = mergeReservationRequestContext(context, { roomId });
      }
      return;
    }

    if (isRoomNameFieldKey(normalizedKey)) {
      const roomName = normalizeText(stringValue);
      context = mergeReservationRequestContext(context, { roomName });
    }
  });

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
  let context = extractReservationRequestContextFromEntries(entries, initialContext);
  entries.forEach(([, nestedValue]) => {
    context = extractReservationRequestContextFromObject(nestedValue, depth + 1, context);
  });
  return finalizeReservationRequestContext(context);
}

export function extractReservationRequestContextFromBody(body) {
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

export function extractReservationContextFromUrl(urlValue) {
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

export function resolveReservationRequestContextForEmit(urlValue, bodyContext) {
  const mergedContext = mergeReservationRequestContext(
    extractReservationContextFromUrl(urlValue),
    bodyContext && typeof bodyContext === "object" ? bodyContext : null,
  );
  return finalizeReservationRequestContext(mergedContext);
}

export async function extractReservationRequestContextFromFetchRequest(input, init) {
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

export function isReservationMutationRequest(urlValue, methodValue) {
  if (!isReservationApiMutationRequest(urlValue, methodValue)) {
    return false;
  }

  const parsed = parseUrl(urlValue);
  if (!parsed) {
    return false;
  }

  return isReservationMutationPath(parsed.pathname);
}

function isReservationMutationPath(pathname) {
  // lms+: /api/space-reservations/{id}
  return /\/api\/space-reservations(?:\/\d+)?\/?$/i.test(String(pathname || ""));
}

export function shouldEmitReservationMutationEvent(urlValue, methodValue) {
  return isReservationMutationRequest(urlValue, methodValue);
}

function isReservationApiMutationRequest(urlValue, methodValue) {
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

export function emitReservationEvent(payload) {
  window.postMessage(
    {
      source: MESSAGE_SOURCE,
      type: MESSAGE_TYPE,
      payload,
    },
    location.origin,
  );
}

export function readReservationAttemptId() {
  const value =
    document.documentElement &&
    document.documentElement.dataset &&
    typeof document.documentElement.dataset.zzkReservationAttemptId === "string"
      ? document.documentElement.dataset.zzkReservationAttemptId.trim()
      : "";
  return value || "";
}

export function buildReservationMutationEventPayload(options) {
  const eventUrl = String(options && options.url ? options.url : "");
  const reservationAttemptId =
    options &&
    typeof options.reservationAttemptId === "string" &&
    options.reservationAttemptId.trim()
      ? options.reservationAttemptId.trim()
      : readReservationAttemptId();

  const payload = {
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

// content.js 등 아직 전역을 읽는 소비처를 위해 이중 등록한다.
// 소비처가 전부 import 로 옮겨지면 이 줄만 지우면 된다.
globalThis.__zzkPageHookShared = {
  MESSAGE_SOURCE,
  MESSAGE_TYPE,
  normalizeMethod,
  parseUrl,
  normalizeText,
  normalizeOwnerCandidate,
  isOwnerFieldKey,
  extractOwnerCandidateFromEntries,
  extractOwnerCandidateFromObject,
  extractOwnerCandidateFromBody,
  extractOwnerCandidateFromFetchRequest,
  normalizeFieldKey,
  normalizeDateCandidate,
  normalizeTimeCandidate,
  extractDateTimeParts,
  normalizeDescriptionCandidate,
  isStartDateTimeFieldKey,
  isEndDateTimeFieldKey,
  isDateFieldKey,
  isDescriptionFieldKey,
  isRoomNameFieldKey,
  isRoomIdFieldKey,
  parseReservationRoomIdCandidate,
  mergeReservationRequestContext,
  finalizeReservationRequestContext,
  extractReservationRequestContextFromEntries,
  extractReservationRequestContextFromObject,
  extractReservationRequestContextFromBody,
  extractReservationContextFromUrl,
  resolveReservationRequestContextForEmit,
  extractReservationRequestContextFromFetchRequest,
  isReservationMutationRequest,
  shouldEmitReservationMutationEvent,
  emitReservationEvent,
  buildReservationMutationEventPayload,
  readReservationAttemptId,
};
