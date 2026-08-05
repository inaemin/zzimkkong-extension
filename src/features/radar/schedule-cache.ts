// 스케줄·예약현황 조회 캐시.
//
// 레이더를 한 번 열거나 타임블록을 누를 때마다 회의실 수만큼 요청이 나간다.
// 같은 조건(날짜·탭·맵)이면 짧은 TTL 안에서 재사용한다.
//
// state 를 인자로 받는다 — content.ts 가 소유한 객체를 그대로 쓰되, 캐시 규칙
// 자체는 여기서만 정한다. 그래서 가짜 state 로 만료·스코프 규칙을 검증할 수 있다.

import {
  RESERVATION_SCHEDULE_STALE_MS,
  normalizeMapCalendarSpaceTab,
} from "../../constants/runtime.js";
import { isDateString, normalizeDateString } from "../../utils/date-time.js";
import type { DailyScheduleResult } from "../../services/lms-data/types.js";
import type { RadarState } from "../state.js";

/** 캐시 키를 만들 때 필요한 조건. */
export interface ScheduleScope {
  date: string;
  tab: unknown;
  sharingMapId: unknown;
}

/**
 * 캐시 키. 날짜·탭·맵이 모두 있어야 만들어진다.
 *
 * 맵 id 가 없으면 빈 문자열을 준다 — 다른 맵의 결과를 섞어 쓰면 안 되므로
 * 아예 캐시하지 않는 편이 안전하다.
 */
export function buildScheduleScopeKey({ date, tab, sharingMapId }: ScheduleScope): string {
  const normalizedDate = normalizeDateString(typeof date === "string" ? date : "");
  if (!isDateString(normalizedDate)) {
    return "";
  }

  const normalizedMapId = typeof sharingMapId === "string" ? sharingMapId.trim() : "";
  if (!normalizedMapId) {
    return "";
  }

  return `${normalizedMapId}|${normalizedDate}|${normalizeMapCalendarSpaceTab(tab)}`;
}

function isStale(fetchedAt: number | undefined): boolean {
  return (
    !Number.isFinite(fetchedAt) || Date.now() - (fetchedAt ?? 0) >= RESERVATION_SCHEDULE_STALE_MS
  );
}

/** TTL 안이면 캐시된 스케줄, 아니면 null(만료분은 지운다). */
export function readScheduleCache(
  state: RadarState,
  scope: ScheduleScope,
): DailyScheduleResult | null {
  const scopeKey = buildScheduleScopeKey(scope);
  if (!scopeKey) {
    return null;
  }

  const cached = state.scheduleCache.get(scopeKey);
  if (!cached) {
    return null;
  }

  if (isStale(state.scheduleCacheFetchedAtByDate.get(scopeKey))) {
    state.scheduleCache.delete(scopeKey);
    state.scheduleCacheFetchedAtByDate.delete(scopeKey);
    return null;
  }

  return cached;
}

export function writeScheduleCache(
  state: RadarState,
  scope: ScheduleScope,
  scheduleData: DailyScheduleResult | null,
): void {
  const scopeKey = buildScheduleScopeKey(scope);
  if (!scopeKey || !scheduleData) {
    return;
  }

  state.scheduleCache.set(scopeKey, scheduleData);
  state.scheduleCacheFetchedAtByDate.set(scopeKey, Date.now());
}

/** TTL 안이면 캐시된 예약 현황, 아니면 null(만료분은 지운다). */
export function readAvailabilityCache(state: RadarState, token: string): unknown {
  if (isStale(state.availabilityCacheFetchedAt.get(token))) {
    state.availabilityCache.delete(token);
    state.availabilityCacheFetchedAt.delete(token);
    return null;
  }
  return state.availabilityCache.get(token) ?? null;
}

export function writeAvailabilityCache(state: RadarState, token: string, data: unknown): void {
  state.availabilityCache.set(token, data);
  state.availabilityCacheFetchedAt.set(token, Date.now());
}

/** 예약이 생성·변경되면 캐시가 곧바로 낡는다. TTL 을 기다리지 않고 비운다. */
export function clearAvailabilityCache(state: RadarState): void {
  state.availabilityCache.clear();
  state.availabilityCacheFetchedAt.clear();
  state.availabilityInflightByToken.clear();
}
