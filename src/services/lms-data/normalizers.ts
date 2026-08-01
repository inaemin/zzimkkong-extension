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

  function buildTargetRooms(spaces: unknown[], roomType: SpaceTab | null = null): Room[] {
    const normalizedRoomType = normalizeRoomType(roomType);

    return spaces
      .filter((space) => getProperty(space, "active") !== false)
      .map((space) => {
        const id = Number(getProperty(space, "id"));
        const rawName = getProperty(space, "name");
        const name =
          typeof rawName === "string" && rawName.trim() !== "" ? rawName.trim() : `공간 ${id}`;
        const floor = Number(getProperty(space, "floor"));

        return {
          id,
          name,
          // API 가 색상을 주지 않으므로 기본 회색을 쓴다.
          color: "#9CA3AF",
          floor: Number.isInteger(floor) ? floor : null,
          floorLabel: normalizeFloorLabel(getProperty(space, "floor")),
          windowStartMinute: parseTimeToMinute(getProperty(space, "openTime")),
          windowEndMinute: parseTimeToMinute(getProperty(space, "closeTime")),
          reservationUnitMinutes: Number(getProperty(space, "reservationUnitMinutes")) || null,
          maxReservationMinutes: Number(getProperty(space, "maxReservationMinutes")) || null,
        };
      })
      .filter((room) => {
        if (!Number.isInteger(room.id)) {
          return false;
        }
        if (!normalizedRoomType) {
          return true;
        }
        return getRoomTypeForRoomName(room.name) === normalizedRoomType;
      })
      .sort((a, b) => {
        // 개편 서비스는 서버가 내려준 floor를 1순위 정렬 기준으로 삼는다.
        const floorA = Number.isInteger(a.floor) ? a.floor : Number.MAX_SAFE_INTEGER;
        const floorB = Number.isInteger(b.floor) ? b.floor : Number.MAX_SAFE_INTEGER;
        if (floorA !== floorB) {
          return floorA - floorB;
        }
        return a.name.localeCompare(b.name, "ko-KR") || a.id - b.id;
      });
  }

  function normalizeReservations(reservationsValue: unknown): Reservation[] {
    if (!Array.isArray(reservationsValue)) {
      return [];
    }

    return reservationsValue
      .map((reservation) => {
        const startMinute = parseTimeToMinute(getProperty(reservation, "startTime"));
        const endMinute = parseTimeToMinute(getProperty(reservation, "endTime"));

        if (!Number.isInteger(startMinute) || !Number.isInteger(endMinute)) {
          return null;
        }

        const rawPurpose = getProperty(reservation, "purpose");
        const purpose =
          typeof rawPurpose === "string" && rawPurpose.trim() !== "" ? rawPurpose.trim() : "";
        const rawOwner = getProperty(reservation, "reserverName");
        const owner = typeof rawOwner === "string" && rawOwner.trim() !== "" ? rawOwner.trim() : "";

        return {
          id: Number(getProperty(reservation, "id")),
          title: purpose || "예약",
          owner,
          mine: getProperty(reservation, "mine") === true,
          startMinute,
          endMinute,
          startTime: minuteToHourMinute(startMinute),
          endTime: minuteToHourMinute(endMinute),
        };
      })
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

  function computeTimelineRange(
    rooms: Array<Pick<Room, "windowStartMinute" | "windowEndMinute">>,
  ): TimelineRange {
    const fallbackStartMinute = 7 * 60;
    const fallbackEndMinute = 23 * 60;

    const startCandidates = rooms
      .map((room) => room.windowStartMinute)
      .filter((minute) => Number.isInteger(minute));
    const endCandidates = rooms
      .map((room) => room.windowEndMinute)
      .filter((minute) => Number.isInteger(minute));

    const rawStartMinute =
      startCandidates.length > 0 ? Math.min(...startCandidates) : fallbackStartMinute;
    const rawEndMinute = endCandidates.length > 0 ? Math.max(...endCandidates) : fallbackEndMinute;

    const startMinute = Math.max(
      0,
      Math.floor(rawStartMinute / timelineSlotMinutes) * timelineSlotMinutes,
    );
    let endMinute = Math.min(
      24 * 60,
      Math.ceil(rawEndMinute / timelineSlotMinutes) * timelineSlotMinutes,
    );

    if (endMinute <= startMinute) {
      endMinute = Math.min(24 * 60, startMinute + timelineSlotMinutes);
    }

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
    const slots: TimelineSlot[] = [];

    for (let minute = startMinute; minute < endMinute; minute += slotMinutes) {
      slots.push({
        startMinute: minute,
        endMinute: minute + slotMinutes,
        label: minuteToHourMinute(minute),
        isHourMark: minute % 60 === 0,
      });
    }

    return slots;
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
