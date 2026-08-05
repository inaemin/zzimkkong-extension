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

/**
 * 예약자 이름이 아니라 자리표시자·라벨인 값들.
 *
 * 호출마다 Set 을 새로 만들 이유가 없어 모듈 상수로 둔다.
 */
const IGNORED_OWNER_VALUES = new Set([
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

export function normalizeOwnerCandidate(value: unknown): string {
  const normalized = normalizeText(toDisplayString(value));
  if (!normalized) {
    return "";
  }

  const normalizedKey = normalized.replace(/\s+/g, "").toLowerCase();
  return IGNORED_OWNER_VALUES.has(normalizedKey) ? "" : normalized;
}

/** 예약자 이름이 들어오는 필드 키. lms+ 가 요청마다 다른 이름을 쓴다. */
const OWNER_FIELD_KEYS = new Set([
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
]);

/** `xxx.name` 앞부분이 사람을 가리키는지 판단할 때 쓰는 조각들. */
const OWNER_CONTEXT_TOKENS = [
  "owner",
  "requester",
  "booker",
  "guest",
  "applicant",
  "reservation",
  "user",
  "예약자",
  "신청자",
];

/** 같은 자리에서 공간을 가리키면 예약자 필드가 아니다. */
const ROOM_CONTEXT_TOKENS = ["room", "space", "map", "resource", "회의실", "공간", "장소"];

export function isOwnerFieldKey(key: unknown): boolean {
  const normalized = normalizeText(toDisplayString(key)).replace(/\s+/g, "").toLowerCase();
  if (!normalized) {
    return false;
  }

  if (OWNER_FIELD_KEYS.has(normalized)) {
    return true;
  }

  const isCompositeNameField =
    normalized.endsWith(".name") || normalized.endsWith("[name]") || normalized.endsWith("_name");
  if (!isCompositeNameField) {
    return false;
  }

  // xxx.name 형태는 앞부분이 사람인지 공간인지에 따라 갈린다.
  const hasOwnerContext = OWNER_CONTEXT_TOKENS.some((token) => normalized.includes(token));
  const hasRoomContext = ROOM_CONTEXT_TOKENS.some((token) => normalized.includes(token));
  return hasOwnerContext && !hasRoomContext;
}

/**
 * 첫 번째로 값이 나오는 항목을 돌려준다.
 *
 * "찾을 때까지 순회하다 멈춘다"를 한 겹 중첩 없이 쓰기 위한 헬퍼다.
 * map 이 전체를 훑지 않도록 find 로 먼저 거른 뒤 한 번만 변환한다.
 */
function firstNonEmpty<T>(items: T[], toValue: (item: T) => string): string {
  const found = items.find((item) => Boolean(toValue(item)));
  return found === undefined ? "" : toValue(found);
}

/** 던지면 빈 문자열. try 를 각 자리에 두면 중첩이 한 겹씩 늘어난다. */
function attempt(read: () => string): string {
  try {
    return read();
  } catch {
    return "";
  }
}

/** 값을 돌려주는 판. 던지면 null. */
function attemptSync<T>(read: () => T): T | null {
  try {
    return read();
  } catch {
    return null;
  }
}

/** 비동기판. 실패하면 null. */
async function attemptAsync<T>(read: () => Promise<T>): Promise<T | null> {
  try {
    return await read();
  } catch {
    return null;
  }
}

export function extractOwnerCandidateFromEntries(entries: Array<[string, unknown]>): string {
  if (!Array.isArray(entries) || entries.length === 0) {
    return "";
  }

  return (
    entries
      .filter(([rawKey]) => isOwnerFieldKey(rawKey))
      .map(([, rawValue]) => normalizeOwnerCandidate(rawValue))
      .find((candidate) => Boolean(candidate)) || ""
  );
}

export function extractOwnerCandidateFromObject(value: unknown, depth = 0): string {
  if (!value || typeof value !== "object" || depth > 3) {
    return "";
  }

  if (Array.isArray(value)) {
    return firstNonEmpty(value, (item) => extractOwnerCandidateFromObject(item, depth + 1));
  }

  const entries = Object.entries(value);
  const direct = extractOwnerCandidateFromEntries(entries);
  if (direct) {
    return direct;
  }

  return firstNonEmpty(entries, ([, nestedValue]) =>
    extractOwnerCandidateFromObject(nestedValue, depth + 1),
  );
}

/** 문자열 본문에서 예약자. JSON 을 먼저 보고 form-urlencoded 로 넘어간다. */
function ownerFromStringBody(trimmed: string): string {
  if (!trimmed) {
    return "";
  }
  return (
    attempt(() => extractOwnerCandidateFromObject(JSON.parse(trimmed))) ||
    attempt(() =>
      extractOwnerCandidateFromEntries(Array.from(new URLSearchParams(trimmed).entries())),
    )
  );
}

/** FormData 를 [key, value] 쌍으로. 파일 값은 빈 문자열로 둔다. */
function toEntryPairs(formData: FormData): Array<[string, string]> {
  const entries: Array<[string, string]> = [];
  formData.forEach((value, key) => {
    entries.push([key, typeof value === "string" ? value : ""]);
  });
  return entries;
}

export function extractOwnerCandidateFromBody(body: unknown): string {
  if (body == null) {
    return "";
  }

  if (typeof FormData !== "undefined" && body instanceof FormData) {
    return extractOwnerCandidateFromEntries(toEntryPairs(body));
  }

  if (typeof URLSearchParams !== "undefined" && body instanceof URLSearchParams) {
    return extractOwnerCandidateFromEntries(Array.from(body.entries()));
  }

  if (typeof body === "string") {
    return ownerFromStringBody(body.trim());
  }

  if (typeof body === "object") {
    return extractOwnerCandidateFromObject(body);
  }

  return "";
}

/**
 * Request 본문을 formData → json → text 순으로 읽어 각각 넘겨준다.
 *
 * 본문은 한 번만 소비할 수 있어 매번 clone 한다. 세 형태를 모두 시도하는
 * 이유는 lms+ 가 요청마다 다른 인코딩을 쓰기 때문이다. 두 추출기(예약자/문맥)가
 * 같은 절차를 쓰므로 여기로 모았다.
 */
async function readRequestBodies(input: Request): Promise<unknown[]> {
  const formData = await attemptAsync(() => input.clone().formData());
  const json = await attemptAsync<unknown>(() => input.clone().json());
  const text = await attemptAsync(() => input.clone().text());
  return [formData, json, text].filter((body) => body !== null);
}

export async function extractOwnerCandidateFromFetchRequest(
  input: unknown,
  init?: RequestInit,
): Promise<string> {
  const fromInit = init && typeof init === "object" ? extractOwnerCandidateFromBody(init.body) : "";
  if (fromInit) {
    return fromInit;
  }

  if (typeof Request === "undefined" || !(input instanceof Request)) {
    return "";
  }

  const bodies = await readRequestBodies(input);
  return firstNonEmpty(bodies, (body) => extractOwnerCandidateFromBody(body));
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

/** 비어 있는 문자열 필드만 patch 로 채운다. 이미 값이 있으면 두 번 덮지 않는다. */
function mergeTextFields(
  next: ReservationRequestContext,
  patchContext: ReservationRequestContext,
): ReservationRequestContext {
  const keys = ["date", "startTime", "endTime", "description", "roomName"] as const;
  return keys.reduce((acc, key) => {
    const value = normalizeText(String(patchContext[key] || ""));
    return value && !acc[key] ? { ...acc, [key]: value } : acc;
  }, next);
}

export function mergeReservationRequestContext(
  baseContext: ReservationRequestContext | null,
  patchContext: ReservationRequestContext | null,
): ReservationRequestContext {
  const base = baseContext && typeof baseContext === "object" ? { ...baseContext } : {};
  if (!patchContext || typeof patchContext !== "object") {
    return base;
  }

  // 먼저 채워진 값이 이긴다(앞선 항목이 더 구체적인 경우가 많다).
  const next = mergeTextFields({ ...base }, patchContext);

  if (Number.isInteger(patchContext.roomId) && !Number.isInteger(next.roomId)) {
    next.roomId = patchContext.roomId;
  }

  return next;
}

/** 값이 하나라도 채워져 있는지. */
function hasAnyValue(context: ReservationRequestContext): boolean {
  return Object.values(context).some((value) =>
    typeof value === "number" ? Number.isFinite(value) : typeof value === "string" && value !== "",
  );
}

export function finalizeReservationRequestContext(
  context: ReservationRequestContext | null,
): ReservationRequestContext | null {
  if (!context || typeof context !== "object") {
    return null;
  }

  const normalized: ReservationRequestContext = {
    date: normalizeDateCandidate(context.date || ""),
    startTime: normalizeTimeCandidate(context.startTime || ""),
    endTime: normalizeTimeCandidate(context.endTime || ""),
    description: normalizeDescriptionCandidate(context.description || ""),
    roomName: normalizeText(String(context.roomName || "")),
  };
  if (Number.isInteger(context.roomId)) {
    normalized.roomId = context.roomId;
  }

  // 하나라도 건진 게 있어야 문맥으로 인정한다. 전부 비었으면 null.
  return hasAnyValue(normalized) ? normalized : null;
}

/**
 * 항목 하나가 예약 문맥에 더할 조각. 해당 없으면 null 이라 병합하지 않는다.
 *
 * lms+ 가 요청마다 다른 키를 써서 별칭 판정(isXxxFieldKey)이 여럿이다.
 */
/** 키 종류별로 문맥 조각을 만든다. 해당 없으면 null. */
/**
 * 키 종류 → 문맥 조각. 위에서부터 처음 맞는 것을 쓴다.
 *
 * 시작/종료는 "2026-08-05T09:00" 처럼 날짜와 시각이 붙어 온다.
 */
const FIELD_PATCH_RULES: Array<{
  matches: (key: string) => boolean;
  toPatch: (stringValue: string, rawValue: unknown) => ReservationRequestContext | null;
}> = [
  {
    matches: isStartDateTimeFieldKey,
    toPatch: (value) => {
      const { date, time } = extractDateTimeParts(value);
      return { date, startTime: time };
    },
  },
  {
    matches: isEndDateTimeFieldKey,
    toPatch: (value) => {
      const { date, time } = extractDateTimeParts(value);
      return { date, endTime: time };
    },
  },
  { matches: isDateFieldKey, toPatch: (value) => ({ date: normalizeDateCandidate(value) }) },
  {
    matches: isDescriptionFieldKey,
    toPatch: (value) => ({ description: normalizeDescriptionCandidate(value) }),
  },
  {
    matches: isRoomIdFieldKey,
    toPatch: (_value, rawValue) => {
      const roomId = parseReservationRoomIdCandidate(rawValue);
      return Number.isInteger(roomId) ? { roomId } : null;
    },
  },
  { matches: isRoomNameFieldKey, toPatch: (value) => ({ roomName: normalizeText(value) }) },
];

function patchForKnownKey(normalizedKey: string, stringValue: string, rawValue: unknown) {
  const rule = FIELD_PATCH_RULES.find((candidate) => candidate.matches(normalizedKey));
  return rule ? rule.toPatch(stringValue, rawValue) : null;
}

function patchForEntry(rawKey: string, rawValue: unknown) {
  const normalizedKey = normalizeFieldKey(rawKey);
  if (!normalizedKey) {
    return null;
  }

  const stringValue = typeof rawValue === "string" ? rawValue : toDisplayString(rawValue);
  if (!normalizeText(stringValue)) {
    return null;
  }

  return patchForKnownKey(normalizedKey, stringValue, rawValue);
}

export function extractReservationRequestContextFromEntries(
  entries: Array<[string, unknown]>,
  initialContext: ReservationRequestContext | null = null,
): ReservationRequestContext | null {
  if (!Array.isArray(entries) || entries.length === 0) {
    return finalizeReservationRequestContext(initialContext);
  }

  const context = entries.reduce(
    (acc, [rawKey, rawValue]) => {
      const patch = patchForEntry(rawKey, rawValue);
      return patch ? mergeReservationRequestContext(acc, patch) : acc;
    },
    initialContext && typeof initialContext === "object" ? { ...initialContext } : {},
  );

  return finalizeReservationRequestContext(context);
}

/** 객체의 키를 먼저 훑고, 그다음 각 값 안으로 한 단계 더 들어간다. */
function mergeNestedContexts(
  value: object,
  depth: number,
  initialContext: ReservationRequestContext | null,
): ReservationRequestContext | null {
  const entries = Object.entries(value);
  return entries.reduce(
    (acc, [, nestedValue]) =>
      extractReservationRequestContextFromObject(nestedValue, depth + 1, acc),
    extractReservationRequestContextFromEntries(entries, initialContext),
  );
}

export function extractReservationRequestContextFromObject(
  value: unknown,
  depth = 0,
  initialContext: ReservationRequestContext | null = null,
): ReservationRequestContext | null {
  if (value == null || depth > 4) {
    return finalizeReservationRequestContext(initialContext);
  }

  if (Array.isArray(value)) {
    return value.reduce<ReservationRequestContext | null>(
      (acc, item) => extractReservationRequestContextFromObject(item, depth + 1, acc),
      initialContext,
    );
  }
  if (typeof value !== "object") {
    return finalizeReservationRequestContext(initialContext);
  }

  return finalizeReservationRequestContext(mergeNestedContexts(value, depth, initialContext));
}

/** 문자열 본문에서 예약 문맥. 예약자 쪽과 같은 순서(JSON → form)로 본다. */
function contextFromStringBody(trimmed: string): ReservationRequestContext | null {
  if (!trimmed) {
    return null;
  }
  const fromJson = attemptSync(() =>
    extractReservationRequestContextFromObject(JSON.parse(trimmed)),
  );
  if (fromJson) {
    return fromJson;
  }
  return attemptSync(() =>
    extractReservationRequestContextFromEntries(Array.from(new URLSearchParams(trimmed).entries())),
  );
}

export function extractReservationRequestContextFromBody(
  body: unknown,
): ReservationRequestContext | null {
  if (body == null) {
    return null;
  }

  if (typeof FormData !== "undefined" && body instanceof FormData) {
    return extractReservationRequestContextFromEntries(toEntryPairs(body));
  }

  if (typeof URLSearchParams !== "undefined" && body instanceof URLSearchParams) {
    return extractReservationRequestContextFromEntries(Array.from(body.entries()));
  }

  if (typeof body === "string") {
    return contextFromStringBody(body.trim());
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
  const fromInit =
    init && typeof init === "object" ? extractReservationRequestContextFromBody(init.body) : null;

  if (typeof Request === "undefined" || !(input instanceof Request)) {
    return finalizeReservationRequestContext(fromInit);
  }

  // 본문 형태마다 담긴 정보가 달라서, 읽히는 것을 모두 합친다.
  const bodies = await readRequestBodies(input);
  const context = bodies.reduce(
    (acc, body) =>
      mergeReservationRequestContext(acc, extractReservationRequestContextFromBody(body)),
    fromInit,
  );

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

/** 옵션에 실려 온 attemptId 를 쓰되, 없으면 문서에서 다시 읽는다. */
function resolveAttemptId(options: Record<string, unknown> | undefined): string {
  const fromOptions = options?.reservationAttemptId;
  if (typeof fromOptions === "string" && fromOptions.trim()) {
    return fromOptions.trim();
  }
  return readReservationAttemptId();
}

/** 항상 실리는 필드들. attemptId·responseBody 는 있을 때만 뒤에서 붙인다. */
function buildBasePayload(
  options: Record<string, unknown>,
  eventUrl: string,
): ReservationEventPayload {
  return {
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
}

export function buildReservationMutationEventPayload(
  options: Record<string, unknown>,
): ReservationEventPayload {
  const eventUrl = toDisplayString(options?.url);
  const reservationAttemptId = resolveAttemptId(options);

  const payload = buildBasePayload(options, eventUrl);

  if (reservationAttemptId) {
    payload.reservationAttemptId = reservationAttemptId;
  }

  // 개편 서비스(lms+) 예약 생성 응답 body(spaceName/floor/reserverName/시간/purpose 등).
  if (options && options.responseBody && typeof options.responseBody === "object") {
    payload.responseBody = options.responseBody;
  }

  return payload;
}
