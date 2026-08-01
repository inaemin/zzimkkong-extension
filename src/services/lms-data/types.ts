// lms+ API 응답을 레이더가 쓰는 형태로 정규화한 결과의 도메인 타입.
//
// 정규화 경계에 두는 이유: 여기서 나온 타입이 그대로 3단계 React 컴포넌트의
// props 가 된다. API 응답 형태(snake/축약/누락)를 컴포넌트까지 끌고 가지 않는다.

import type { SpaceTab } from "../../constants/runtime.js";

/** 레이더가 한 줄로 그리는 공간. */
export interface Room {
  id: number;
  name: string;
  /** lms+ API 는 색상을 안 주므로 기본 회색이 들어간다. */
  color: string;
  floor: number | null;
  /** "11층" 같은 표시용 문자열. floor 가 없으면 빈 문자열. */
  floorLabel: string;
  /** 예약 가능 시작/종료(분). openTime/closeTime 을 분으로 바꾼 값. */
  windowStartMinute: number | null;
  windowEndMinute: number | null;
  reservationUnitMinutes: number | null;
  maxReservationMinutes: number | null;
}

/** 가용 여부까지 계산된 공간(availability 조회 결과). */
export interface RoomAvailability extends Pick<
  Room,
  "id" | "name" | "color" | "floor" | "floorLabel"
> {
  isAvailable: boolean;
}

/** 타임라인에 블록으로 그려지는 예약 하나. */
export interface Reservation {
  id: number;
  /** 예약 목적. 비어 있으면 "예약". */
  title: string;
  owner: string;
  /** 내 예약인지. 강조 표시에 쓴다. */
  mine: boolean;
  startMinute: number;
  endMinute: number;
  /** "HH:MM" 표시용. startMinute/endMinute 에서 파생. */
  startTime: string;
  endTime: string;
}

/**
 * 예약 목록까지 붙은 공간(일정 조회 결과).
 * 타임라인 렌더에 필요한 필드만 싣는다 — 예약 단위/최대 시간은 폼 쪽 관심사라 빠진다.
 */
export interface RoomSchedule extends Pick<
  Room,
  "id" | "name" | "color" | "floor" | "floorLabel" | "windowStartMinute" | "windowEndMinute"
> {
  reservations: Reservation[];
}

/** 타임라인이 그리는 시간 범위. */
export interface TimelineRange {
  startMinute: number;
  endMinute: number;
  slotMinutes: number;
  startTime: string;
  endTime: string;
}

/** 클릭 대상이 되는 타임블록 한 칸. */
export interface TimelineSlot {
  startMinute: number;
  endMinute: number;
  /** "HH:MM" 축 라벨. */
  label: string;
  /** 정시 눈금인지(세로선 표시에 쓴다). */
  isHourMark: boolean;
}

/** 일/월 예약 한도 잔량. */
export interface ReservationQuota {
  unlimited: boolean;
  dailyLimitMinutes: number | null;
  dailyUsedMinutes: number | null;
  dailyRemainingMinutes: number | null;
  monthlyLimitMinutes: number | null;
  monthlyUsedMinutes: number | null;
  monthlyRemainingMinutes: number | null;
}

/** availability 조회 응답. */
export interface AvailabilityResult {
  mapId: number | null;
  mapName: string;
  selectedWindow: {
    date: string;
    startTime: string;
    endTime: string;
  };
  roomType: SpaceTab | null;
  counts: {
    total: number;
    available: number;
    occupied: number;
  };
  rooms: RoomAvailability[];
}

/** 일정 조회 응답. */
export interface DailyScheduleResult {
  mapId: number | null;
  mapName: string;
  date: string;
  roomType: SpaceTab | null;
  range: TimelineRange;
  timeline: TimelineSlot[];
  rooms: RoomSchedule[];
}
