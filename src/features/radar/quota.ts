import type { ReservationQuota } from "../../services/lms-data/types.js";

// 예약 한도(quota) 조회 결과를 날짜별로 잠깐 들고 있는다.
//
// 스케줄과 같은 날짜를 함께 조회하므로, 날짜를 앞뒤로 넘길 때마다 같은 요청이
// 다시 나가지 않도록 짧은 TTL 로 재사용한다. 규칙은 스케줄 캐시와 같다.
//
// 캐시 맵을 인자로 받는다 — 소유는 호출부(content.ts)가 하고, 만료 규칙만
// 여기서 정한다. 그래야 브라우저 없이 만료 동작을 확인할 수 있다.

/** 한도는 예약을 만들 때마다 바뀐다. 스케줄과 같은 주기로 다시 받는다. */
export const QUOTA_STALE_MS = 3000;

export interface QuotaCache {
  byDate: Map<string, ReservationQuota | null>;
  fetchedAtByDate: Map<string, number>;
}

export function createQuotaCache(): QuotaCache {
  return { byDate: new Map(), fetchedAtByDate: new Map() };
}

function isStale(fetchedAt: number | undefined, now: number): boolean {
  return !Number.isFinite(fetchedAt) || now - (fetchedAt ?? 0) >= QUOTA_STALE_MS;
}

/**
 * TTL 안이면 캐시된 한도, 아니면 undefined(만료분은 지운다).
 *
 * null 과 undefined 를 구분한다. null 은 "조회했더니 한도 정보가 없더라"라는
 * 결과이고, undefined 는 "캐시에 없다"는 뜻이다. 둘을 섞으면 한도 없는 계정에서
 * 매번 다시 조회하게 된다.
 */
export function readQuotaCache(
  cache: QuotaCache,
  date: string,
  now: number = Date.now(),
): ReservationQuota | null | undefined {
  if (!cache.byDate.has(date)) {
    return undefined;
  }

  if (isStale(cache.fetchedAtByDate.get(date), now)) {
    cache.byDate.delete(date);
    cache.fetchedAtByDate.delete(date);
    return undefined;
  }

  return cache.byDate.get(date);
}

export function writeQuotaCache(
  cache: QuotaCache,
  date: string,
  entry: { quota: ReservationQuota | null; now?: number },
): void {
  if (!date) {
    return;
  }
  cache.byDate.set(date, entry.quota);
  cache.fetchedAtByDate.set(date, entry.now ?? Date.now());
}

/** 예약이 생기거나 바뀌면 한도가 곧바로 낡는다. TTL 을 기다리지 않고 비운다. */
export function clearQuotaCache(cache: QuotaCache): void {
  cache.byDate.clear();
  cache.fetchedAtByDate.clear();
}

/** 화면에 그릴 한 줄(일간 또는 월간). */
export interface QuotaBar {
  label: string;
  usedMinutes: number;
  limitMinutes: number;
  remainingMinutes: number;
  /** 0~1. 막대 길이에 쓴다. */
  ratio: number;
  /** 잔여가 얼마 없을 때. 색으로 알린다. */
  low: boolean;
}

/** 잔여가 이 비율 아래로 내려가면 경고로 본다. */
const LOW_REMAINING_RATIO = 0.25;

/** 한 줄을 만들 재료. 서버가 주는 세 값이 그대로 온다. */
interface QuotaSource {
  label: string;
  limitMinutes: number | null;
  usedMinutes: number | null;
  remainingMinutes: number | null;
}

/**
 * 사용량과 잔여를 확정한다.
 *
 * 서버가 둘 중 하나만 줄 때가 있어 서로에게서 되돌려 계산한다.
 */
function resolveUsage(source: QuotaSource, limit: number): { used: number; remaining: number } {
  const hasUsed = Number.isFinite(source.usedMinutes);
  const hasRemaining = Number.isFinite(source.remainingMinutes);

  const used = hasUsed
    ? (source.usedMinutes ?? 0)
    : limit - (hasRemaining ? (source.remainingMinutes ?? 0) : limit);
  const remaining = hasRemaining ? (source.remainingMinutes ?? 0) : limit - used;

  return { used, remaining };
}

function toBar(source: QuotaSource): QuotaBar | null {
  // 한도를 모르면 막대를 그릴 수 없다(분모가 없다).
  const limit = source.limitMinutes ?? 0;
  if (!Number.isFinite(source.limitMinutes) || limit <= 0) {
    return null;
  }

  const { used, remaining } = resolveUsage(source, limit);
  const clampedUsed = Math.min(Math.max(used, 0), limit);
  const clampedRemaining = Math.min(Math.max(remaining, 0), limit);

  return {
    label: source.label,
    usedMinutes: clampedUsed,
    limitMinutes: limit,
    remainingMinutes: clampedRemaining,
    ratio: clampedUsed / limit,
    low: clampedRemaining / limit <= LOW_REMAINING_RATIO,
  };
}

/**
 * 한도 응답을 화면에 그릴 막대들로 바꾼다.
 *
 * 무제한이거나 한도를 모르면 빈 배열이다 — 보여줄 것이 없으면 자리를 차지하지
 * 않는 편이 낫다.
 */
export function buildQuotaBars(quota: ReservationQuota | null): QuotaBar[] {
  if (!quota || quota.unlimited) {
    return [];
  }

  const bars = [
    toBar({
      label: "오늘",
      limitMinutes: quota.dailyLimitMinutes,
      usedMinutes: quota.dailyUsedMinutes,
      remainingMinutes: quota.dailyRemainingMinutes,
    }),
    toBar({
      label: "이번 달",
      limitMinutes: quota.monthlyLimitMinutes,
      usedMinutes: quota.monthlyUsedMinutes,
      remainingMinutes: quota.monthlyRemainingMinutes,
    }),
  ];

  return bars.filter((bar): bar is QuotaBar => bar !== null);
}

/** 분을 "1시간 30분" 형태로. 0이면 "0분". */
export function formatQuotaMinutes(minutes: number): string {
  if (!Number.isFinite(minutes) || minutes <= 0) {
    return "0분";
  }

  const hours = Math.floor(minutes / 60);
  const rest = Math.round(minutes % 60);

  if (hours === 0) {
    return `${rest}분`;
  }
  if (rest === 0) {
    return `${hours}시간`;
  }
  return `${hours}시간 ${rest}분`;
}

/**
 * 지금 고른 구간을 예약하면 잔여가 얼마가 되는지.
 *
 * 한도를 넘어서면 0 으로 잡는다 — 음수 잔여는 화면에서 의미가 없다.
 */
export function previewRemainingMinutes(bar: QuotaBar, selectedMinutes: number): number {
  if (!Number.isFinite(selectedMinutes) || selectedMinutes <= 0) {
    return bar.remainingMinutes;
  }
  return Math.max(0, bar.remainingMinutes - selectedMinutes);
}
