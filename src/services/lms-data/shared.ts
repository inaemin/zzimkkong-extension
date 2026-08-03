import {
  LMS_API_BASE_URL,
  LMS_TIME_STEP_MINUTES,
  MAP_CALENDAR_SPACE_TAB_MEETING,
  RESERVATION_SCHEDULE_STALE_MS,
  TARGET_ROOM_METADATA_BY_NORMALIZED_NAME,
  normalizeFetchRoomType,
  normalizeTargetRoomName,
} from "../../constants/runtime.js";
import {
  minuteToHourMinute,
  sanitizeDateForApi,
  sanitizeTimeForApi,
} from "../../utils/date-time.js";
import type { SpaceTab } from "../../constants/runtime.js";

import { createLmsDataNormalizers } from "./normalizers.js";
import type {
  AvailabilityResult,
  DailyScheduleResult,
  ReservationQuota,
  Reservation,
  Room,
} from "./types.js";

/** 공간 목록 + 표시용 맵 정보. */
interface SpaceContext {
  mapId: number | null;
  mapName: string;
  targetRooms: Room[];
}

/** 조회 요청 페이로드. content.js 와 background.js 가 같은 형태로 보낸다. */
interface FetchPayload {
  date?: unknown;
  startTime?: unknown;
  endTime?: unknown;
  roomType?: unknown;
  allowPastDate?: boolean;
}

function getRoomTypeForRoomName(roomName: string): SpaceTab {
  const normalizedName = normalizeTargetRoomName(roomName);
  const metadata = TARGET_ROOM_METADATA_BY_NORMALIZED_NAME.get(normalizedName);
  return (
    metadata?.kind || (normalizedName.startsWith("페") ? "pair" : MAP_CALENDAR_SPACE_TAB_MEETING)
  );
}

const lmsDataNormalizers = createLmsDataNormalizers({
  getProperty(source, key) {
    if (source == null || (typeof source !== "object" && typeof source !== "function")) {
      return undefined;
    }
    return source[key];
  },
  normalizeRoomType: normalizeFetchRoomType,
  getRoomTypeForRoomName,
  timelineSlotMinutes: LMS_TIME_STEP_MINUTES,
  minuteToHourMinute,
});

export async function loadSpaceContext(roomType: SpaceTab | null = null): Promise<SpaceContext> {
  const spacesResponse = await fetchApiJson(`${LMS_API_BASE_URL}/api/spaces`);
  const spaces = lmsDataNormalizers.normalizeSpaces(spacesResponse);

  return {
    mapId: null,
    mapName: "회의실",
    targetRooms: lmsDataNormalizers.buildTargetRooms(spaces, roomType),
  };
}

// 방·날짜별 예약 목록 캐시.
//
// fetchAvailability 와 fetchDailySchedule 이 똑같은
// /api/space-reservations?date=&spaceId= 를 부른다(전자는 겹침 여부만 계산).
// 레이더를 한 번 열거나 타임블록을 누를 때마다 회의실 수 x 2 만큼 요청이 나가므로,
// 짧은 TTL 로 같은 요청을 합친다. inflight 도 함께 묶어 응답 전 중복 호출을 막는다.
const reservationCache = new Map();
const reservationInflight = new Map();

// 예약이 생성/변경되면 캐시가 곧바로 낡는다. TTL(3초)을 기다리지 않고 비운다.
export function clearReservationCache(): void {
  reservationCache.clear();
  reservationInflight.clear();
}

function readCachedReservations(cacheKey: string): Reservation[] | null {
  const entry = reservationCache.get(cacheKey);
  if (!entry) {
    return null;
  }
  if (Date.now() - entry.fetchedAt >= RESERVATION_SCHEDULE_STALE_MS) {
    reservationCache.delete(cacheKey);
    return null;
  }
  return entry.reservations;
}

/** 그 사이 다른 요청이 자리를 차지했으면 건드리지 않는다. */
function releaseInflight(query: string, request: Promise<Reservation[]>): void {
  if (reservationInflight.get(query) !== request) {
    return;
  }
  reservationInflight.delete(query);
}

export async function fetchReservationsForRoom(
  roomId: number,
  date: string,
): Promise<Reservation[]> {
  const query = new URLSearchParams({
    date,
    spaceId: String(roomId),
  }).toString();

  const cached = readCachedReservations(query);
  if (cached) {
    return cached;
  }

  const pending = reservationInflight.get(query);
  if (pending) {
    return pending;
  }

  const request = (async () => {
    const response = await fetchApiJson(`${LMS_API_BASE_URL}/api/space-reservations?${query}`);
    const reservationsValue = Array.isArray(response)
      ? response
      : (response as { reservations?: unknown } | null)?.reservations;
    const reservations = lmsDataNormalizers.normalizeReservations(reservationsValue);
    reservationCache.set(query, { reservations, fetchedAt: Date.now() });
    return reservations;
  })();

  reservationInflight.set(query, request);
  try {
    return await request;
  } finally {
    releaseInflight(query, request);
  }
}

// 개편 서비스에는 availability 엔드포인트가 없어서, 각 공간의 당일 예약을 받아와
// 요청 구간과 겹치는지로 예약 가능 여부를 계산한다.
/** 요청 구간을 검증해 정규화한다. 형식이 틀리면 여기서 던진다. */
function sanitizeAvailabilityWindow(payload: FetchPayload) {
  const date = sanitizeDateForApi(payload && payload.date, {
    allowPastDate: payload?.allowPastDate === true,
  });
  const startTime = sanitizeTimeForApi(payload && payload.startTime);
  const endTime = sanitizeTimeForApi(payload && payload.endTime);

  if (startTime >= endTime) {
    throw new Error("종료 시간은 시작 시간보다 늦어야 합니다.");
  }

  return {
    date,
    startTime,
    endTime,
    roomType: normalizeFetchRoomType(payload && payload.roomType),
  };
}

/** 방마다 그날 예약을 받아와 요청 구간과 겹치는지 판정한다. */
async function resolveRoomAvailability(
  rooms: Room[],
  window: { date: string; startMinute: number; endMinute: number },
) {
  return Promise.all(
    rooms.map(async (room) => ({
      id: room.id,
      name: room.name,
      color: room.color,
      floor: room.floor,
      floorLabel: room.floorLabel,
      isAvailable: lmsDataNormalizers.isRoomAvailableInWindow(
        await fetchReservationsForRoom(room.id, window.date),
        window.startMinute,
        window.endMinute,
      ),
    })),
  );
}

export async function fetchAvailability(payload: FetchPayload): Promise<AvailabilityResult> {
  const { date, startTime, endTime, roomType } = sanitizeAvailabilityWindow(payload);
  const spaceContext = await loadSpaceContext(roomType);

  const rooms = await resolveRoomAvailability(spaceContext.targetRooms, {
    date,
    startMinute: lmsDataNormalizers.parseTimeToMinute(startTime),
    endMinute: lmsDataNormalizers.parseTimeToMinute(endTime),
  });

  const availableCount = rooms.filter((room) => room.isAvailable).length;

  return {
    mapId: spaceContext.mapId,
    mapName: spaceContext.mapName,
    selectedWindow: {
      date,
      startTime,
      endTime,
    },
    roomType,
    counts: {
      total: rooms.length,
      available: availableCount,
      occupied: rooms.length - availableCount,
    },
    rooms,
  };
}

export async function fetchDailySchedule(payload: FetchPayload): Promise<DailyScheduleResult> {
  const date = sanitizeDateForApi(payload && payload.date, {
    allowPastDate: payload?.allowPastDate === true,
  });
  const roomType = normalizeFetchRoomType(payload && payload.roomType);
  const spaceContext = await loadSpaceContext(roomType);

  const rooms = await Promise.all(
    spaceContext.targetRooms.map(async (room) => ({
      id: room.id,
      name: room.name,
      color: room.color,
      floor: room.floor,
      floorLabel: room.floorLabel,
      windowStartMinute: room.windowStartMinute,
      windowEndMinute: room.windowEndMinute,
      reservations: await fetchReservationsForRoom(room.id, date),
    })),
  );

  const range = lmsDataNormalizers.computeTimelineRange(rooms);
  const timeline = lmsDataNormalizers.buildTimelineSlots(
    range.startMinute,
    range.endMinute,
    LMS_TIME_STEP_MINUTES,
  );

  return {
    mapId: spaceContext.mapId,
    mapName: spaceContext.mapName,
    date,
    roomType,
    range,
    timeline,
    rooms,
  };
}

// 개편 서비스 전용. 일/월 예약 한도 잔량을 보여줄 때 쓴다.
export async function fetchQuota(payload: FetchPayload): Promise<ReservationQuota | null> {
  const date = sanitizeDateForApi(payload && payload.date, {
    allowPastDate: payload?.allowPastDate === true,
  });

  const response = await fetchApiJson(
    `${LMS_API_BASE_URL}/api/space-reservations/quota?date=${encodeURIComponent(date)}`,
  );

  return lmsDataNormalizers.normalizeQuota(response);
}

// 개편 서비스 API 는 Authorization: Bearer <JWT> 로 인증한다. 이 토큰은 페이지 앱이
// 저장소에 넣어두므로(콘텐츠 스크립트는 같은 origin 의 localStorage 를 읽을 수 있다),
// 요청 시점에 읽어 헤더로 붙인다. 토큰을 코드에 하드코딩하지 않는다.
const JWT_PATTERN = /eyJ[\w-]+\.[\w-]+\.[\w-]+/;

function stripBearer(value: unknown): string {
  return typeof value === "string" ? value.replace(/^Bearer\s+/i, "").trim() : "";
}

/** 저장소 접근은 권한·오리진에 따라 던진다. 실패하면 기본값을 준다. */
function safely<T>(read: () => T, fallback: T): T {
  try {
    return read();
  } catch {
    return fallback;
  }
}

function extractJwtFromValue(rawValue: unknown): string {
  if (typeof rawValue !== "string" || rawValue === "") {
    return "";
  }
  const bare = stripBearer(rawValue);
  if (JWT_PATTERN.test(bare) && /^eyJ[\w-]+\.[\w-]+\.[\w-]+$/.test(bare)) {
    return bare;
  }
  // 값이 JSON 이면 그 안에서 JWT 를 찾는다 (예: {"accessToken":"eyJ..."}).
  const match = rawValue.match(JWT_PATTERN);
  return match ? match[0] : "";
}

/** 접근 가능한 저장소만 모은다(오리진에 따라 접근 자체가 던진다). */
function readableStores(): Storage[] {
  return [
    safely(() => (typeof localStorage !== "undefined" ? localStorage : null), null),
    safely(() => (typeof sessionStorage !== "undefined" ? sessionStorage : null), null),
  ].filter((store): store is Storage => store !== null);
}

function readLmsAuthToken(): string {
  // 저장소×키를 한 줄로 펼쳐 중첩을 없앤다.
  const candidates = readableStores().flatMap((store) => {
    const length = safely(() => store.length, 0);
    return Array.from({ length }, (_, index) => safely(() => store.key(index), null))
      .filter((key): key is string => Boolean(key))
      .map((key) => safely(() => store.getItem(key) || "", ""));
  });

  return (
    candidates
      .filter((value) => value.includes("eyJ"))
      .map((value) => extractJwtFromValue(value))
      .find((token) => Boolean(token)) || ""
  );
}

/** 401/403 은 로그인 문제라 문구를 따로 준다. */
function isAuthStatus(status: number): boolean {
  return status === 401 || status === 403;
}

function authErrorMessage(hasToken: boolean): string {
  return hasToken
    ? "로그인 정보가 만료되었어요. 페이지를 새로고침한 뒤 다시 시도해 주세요."
    : "로그인이 필요해요. 회의실 예약 페이지에 로그인한 뒤 다시 시도해 주세요.";
}

export async function fetchApiJson(url: string): Promise<unknown> {
  const headers: Record<string, string> = {
    accept: "application/json",
  };
  const token = readLmsAuthToken();
  if (token) {
    headers.authorization = `Bearer ${token}`;
  }

  const response = await fetch(url, {
    headers,
    // 쿠키도 함께 보낸다(일부 엔드포인트가 세션 쿠키를 병행할 수 있음).
    credentials: "include",
  });

  const text = await response.text();
  const data: unknown = text ? safely(() => JSON.parse(text) as unknown, null) : null;

  if (!response.ok && isAuthStatus(response.status)) {
    throw new Error(authErrorMessage(Boolean(token)));
  }

  if (!response.ok) {
    // 에러 본문의 message 는 있을 수도 없을 수도 있다. 좁혀서 읽는다.
    const serverMessage =
      data && typeof data === "object" && "message" in data && typeof data.message === "string"
        ? data.message
        : null;
    throw new Error(serverMessage ?? `요청 실패 (${response.status})`);
  }

  if (data == null || typeof data !== "object") {
    throw new Error("서버 응답 형식이 올바르지 않습니다.");
  }

  return data;
}
