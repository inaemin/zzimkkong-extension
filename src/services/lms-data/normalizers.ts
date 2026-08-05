import type { SpaceTab } from "../../constants/runtime.js";

import type { Reservation, Room, ReservationQuota, TimelineRange, TimelineSlot } from "./types.js";

// content.js 와 background.js 가 각자 구현을 주입한다(서비스워커에는 DOM 이 없다).
export interface LmsDataNormalizerDeps {
  getProperty: (source: unknown, key: string) => unknown;
  normalizeRoomType: (value: unknown) => SpaceTab | null;
  getRoomTypeForRoomName: (roomName: string) => SpaceTab;
  timelineSlotMinutes: number;
  minuteToHourMinute: (totalMinute: number) => string;
}

// lms+ 응답을 레이더가 쓰는 공통 형태로 바꾼다.
// DI 팩토리 래퍼: 길이가 곧 복잡도가 아니다(안쪽 함수는 개별 측정된다).
// eslint-disable-next-line max-lines-per-function
export function createLmsDataNormalizers(deps: LmsDataNormalizerDeps) {
  const {
    getProperty,
    normalizeRoomType,
    getRoomTypeForRoomName,
    timelineSlotMinutes,
    minuteToHourMinute,
  } = deps;

  function normalizeSpaces(spacesResponse: unknown): unknown[] {
    if (Array.isArray(spacesResponse)) {
      return spacesResponse;
    }
    const nestedSpaces = getProperty(spacesResponse, "spaces");
    return Array.isArray(nestedSpaces) ? nestedSpaces : [];
  }

  // "HH:MM:SS" / "HH:MM" -> 분. 개편 API는 이미 KST 벽시계 시각을 주므로
  // 이미 KST 벽시계 시각이라 타임존 변환이 필요 없다.
  function parseTimeToMinute(value: unknown): number | null {
    if (typeof value !== "string") {
      return null;
    }

    const match = value.trim().match(/^(\d{1,2}):(\d{2})(?::(\d{2}))?$/);
    if (!match) {
      return null;
    }

    const hour = Number(match[1]);
    const minute = Number(match[2]);
    if (!Number.isInteger(hour) || !Number.isInteger(minute)) {
      return null;
    }
    if (hour < 0 || hour > 24 || minute < 0 || minute > 59) {
      return null;
    }

    return hour * 60 + minute;
  }

  function normalizeFloorLabel(floorValue: unknown): string {
    const floor = Number(floorValue);
    return Number.isInteger(floor) ? `${floor}층` : "";
  }

  /** API 의 space 한 건을 Room 으로. */
  function toRoom(space: unknown): Room {
    const id = Number(getProperty(space, "id"));
    const rawName = getProperty(space, "name");
    const floor = Number(getProperty(space, "floor"));

    return {
      id,
      name: typeof rawName === "string" && rawName.trim() !== "" ? rawName.trim() : `공간 ${id}`,
      // API 가 색상을 주지 않으므로 기본 회색을 쓴다.
      color: "#9CA3AF",
      floor: Number.isInteger(floor) ? floor : null,
      floorLabel: normalizeFloorLabel(getProperty(space, "floor")),
      windowStartMinute: parseTimeToMinute(getProperty(space, "openTime")),
      windowEndMinute: parseTimeToMinute(getProperty(space, "closeTime")),
      reservationUnitMinutes: Number(getProperty(space, "reservationUnitMinutes")) || null,
      maxReservationMinutes: Number(getProperty(space, "maxReservationMinutes")) || null,
    };
  }

  /** 층 → 이름 → id 순. 서버가 내려준 floor 가 1순위다. */
  function compareRooms(a: Room, b: Room): number {
    const floorA = a.floor ?? Number.MAX_SAFE_INTEGER;
    const floorB = b.floor ?? Number.MAX_SAFE_INTEGER;
    if (floorA !== floorB) {
      return floorA - floorB;
    }
    return a.name.localeCompare(b.name, "ko-KR") || a.id - b.id;
  }

  function buildTargetRooms(spaces: unknown[], roomType: SpaceTab | null = null): Room[] {
    const normalizedRoomType = normalizeRoomType(roomType);
    const matchesType = (room: Room) =>
      !normalizedRoomType || getRoomTypeForRoomName(room.name) === normalizedRoomType;

    return spaces
      .filter((space) => getProperty(space, "active") !== false)
      .map(toRoom)
      .filter((room) => Number.isInteger(room.id) && matchesType(room))
      .sort(compareRooms);
  }

  /** 문자열 필드를 다듬는다. 비어 있으면 빈 문자열. */
  function trimmedString(value: unknown): string {
    return typeof value === "string" && value.trim() !== "" ? value.trim() : "";
  }

  /** 예약 한 건. 시작·끝을 못 읽으면 null(호출부가 걸러낸다). */
  function toReservation(reservation: unknown): Reservation | null {
    const startMinute = parseTimeToMinute(getProperty(reservation, "startTime"));
    const endMinute = parseTimeToMinute(getProperty(reservation, "endTime"));
    if (startMinute === null || endMinute === null) {
      return null;
    }

    return {
      id: Number(getProperty(reservation, "id")),
      title: trimmedString(getProperty(reservation, "purpose")) || "예약",
      owner: trimmedString(getProperty(reservation, "reserverName")),
      mine: getProperty(reservation, "mine") === true,
      startMinute,
      endMinute,
      startTime: minuteToHourMinute(startMinute),
      endTime: minuteToHourMinute(endMinute),
    };
  }

  function normalizeReservations(reservationsValue: unknown): Reservation[] {
    if (!Array.isArray(reservationsValue)) {
      return [];
    }

    return reservationsValue
      .map(toReservation)
      .filter((reservation) => reservation != null)
      .sort((a, b) => a.startMinute - b.startMinute);
  }

  // lms+ 에는 /spaces/availability 에 대응하는 API가 없어서
  // 예약 목록과 요청 구간의 겹침으로 예약 가능 여부를 직접 판정한다.
  function isRoomAvailableInWindow(
    reservations: Reservation[],
    startMinute: number,
    endMinute: number,
  ): boolean {
    if (!Array.isArray(reservations)) {
      return true;
    }

    return !reservations.some(
      (reservation) =>
        Number.isInteger(reservation?.startMinute) &&
        Number.isInteger(reservation?.endMinute) &&
        reservation.startMinute < endMinute &&
        reservation.endMinute > startMinute,
    );
  }

  /** 방들의 운영 시간에서 가장 이른 시작·가장 늦은 끝. 없으면 07:00~23:00. */
  function collectWindowBounds(rooms: Array<Pick<Room, "windowStartMinute" | "windowEndMinute">>): {
    rawStartMinute: number;
    rawEndMinute: number;
  } {
    const isMinute = (value: number | null): value is number => value !== null;
    const starts = rooms.map((room) => room.windowStartMinute).filter(isMinute);
    const ends = rooms.map((room) => room.windowEndMinute).filter(isMinute);
    return {
      rawStartMinute: starts.length > 0 ? Math.min(...starts) : 7 * 60,
      rawEndMinute: ends.length > 0 ? Math.max(...ends) : 23 * 60,
    };
  }

  /** 슬롯 경계에 맞춰 시작은 내리고 끝은 올린다. 최소 한 칸은 확보한다. */
  function alignToSlots(
    rawStartMinute: number,
    rawEndMinute: number,
  ): { startMinute: number; endMinute: number } {
    const startMinute = Math.max(
      0,
      Math.floor(rawStartMinute / timelineSlotMinutes) * timelineSlotMinutes,
    );
    const alignedEnd = Math.min(
      24 * 60,
      Math.ceil(rawEndMinute / timelineSlotMinutes) * timelineSlotMinutes,
    );
    const endMinute =
      alignedEnd <= startMinute ? Math.min(24 * 60, startMinute + timelineSlotMinutes) : alignedEnd;
    return { startMinute, endMinute };
  }

  function computeTimelineRange(
    rooms: Array<Pick<Room, "windowStartMinute" | "windowEndMinute">>,
  ): TimelineRange {
    const { rawStartMinute, rawEndMinute } = collectWindowBounds(rooms);

    const { startMinute, endMinute } = alignToSlots(rawStartMinute, rawEndMinute);

    return {
      startMinute,
      endMinute,
      slotMinutes: timelineSlotMinutes,
      startTime: minuteToHourMinute(startMinute),
      endTime: minuteToHourMinute(endMinute),
    };
  }

  function buildTimelineSlots(
    startMinute: number,
    endMinute: number,
    slotMinutes: number,
  ): TimelineSlot[] {
    const slotCount = Math.max(0, Math.ceil((endMinute - startMinute) / slotMinutes));

    return Array.from({ length: slotCount }, (_, index) => {
      const minute = startMinute + index * slotMinutes;
      return {
        startMinute: minute,
        endMinute: minute + slotMinutes,
        label: minuteToHourMinute(minute),
        isHourMark: minute % 60 === 0,
      };
    });
  }

  function normalizeQuota(quotaResponse: unknown): ReservationQuota | null {
    if (quotaResponse == null || typeof quotaResponse !== "object") {
      return null;
    }

    const toMinutes = (key: string) => {
      const value = Number(getProperty(quotaResponse, key));
      return Number.isFinite(value) ? value : null;
    };

    return {
      unlimited: getProperty(quotaResponse, "unlimited") === true,
      dailyLimitMinutes: toMinutes("dailyLimitMinutes"),
      dailyUsedMinutes: toMinutes("dailyUsedMinutes"),
      dailyRemainingMinutes: toMinutes("dailyRemainingMinutes"),
      monthlyLimitMinutes: toMinutes("monthlyLimitMinutes"),
      monthlyUsedMinutes: toMinutes("monthlyUsedMinutes"),
      monthlyRemainingMinutes: toMinutes("monthlyRemainingMinutes"),
    };
  }

  return {
    normalizeSpaces,
    buildTargetRooms,
    normalizeReservations,
    isRoomAvailableInWindow,
    parseTimeToMinute,
    normalizeFloorLabel,
    computeTimelineRange,
    buildTimelineSlots,
    normalizeQuota,
  };
}
