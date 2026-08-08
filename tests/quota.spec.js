import { expect, test } from "@playwright/test";

import {
  QUOTA_STALE_MS,
  buildQuotaBars,
  clearQuotaCache,
  createQuotaCache,
  formatQuotaMinutes,
  previewRemainingMinutes,
  readQuotaCache,
  writeQuotaCache,
} from "../src/features/radar/quota.ts";

// 예약 한도 표시에 쓰는 계산과 캐시.
//
// 화면에 그리는 부분은 React 라 여기서 보지 않는다. 대신 "무엇을 그릴지"를
// 정하는 규칙(무제한이면 숨김, 한도를 모르면 숨김, 잔여 계산)을 고정한다.
// 이 규칙이 틀리면 없는 한도를 보여주거나, 있는 한도를 숨긴다.

const FULL = {
  unlimited: false,
  dailyLimitMinutes: 240,
  dailyUsedMinutes: 60,
  dailyRemainingMinutes: 180,
  monthlyLimitMinutes: 720,
  monthlyUsedMinutes: 480,
  monthlyRemainingMinutes: 240,
};

test.describe("buildQuotaBars", () => {
  test("일간·월간 두 줄을 만든다", () => {
    const bars = buildQuotaBars(FULL);

    expect(bars.map((bar) => bar.label)).toEqual(["오늘", "이번 달"]);
  });

  test("무제한이면 아무것도 그리지 않는다", () => {
    // 한도가 없는 계정에 "0 / 0" 같은 걸 보여주면 안 된다.
    expect(buildQuotaBars({ ...FULL, unlimited: true })).toEqual([]);
  });

  test("응답이 없으면 아무것도 그리지 않는다", () => {
    expect(buildQuotaBars(null)).toEqual([]);
  });

  test("한도를 모르는 줄은 빼고 아는 줄만 그린다", () => {
    // 분모가 없으면 막대를 그릴 수 없다. 그렇다고 아는 쪽까지 버릴 이유는 없다.
    const bars = buildQuotaBars({
      ...FULL,
      dailyLimitMinutes: null,
      dailyUsedMinutes: null,
      dailyRemainingMinutes: null,
    });

    expect(bars.map((bar) => bar.label)).toEqual(["이번 달"]);
  });

  test("사용량이 없으면 잔여에서 되돌려 계산한다", () => {
    // 서버가 둘 중 하나만 줄 때가 있다.
    const [today] = buildQuotaBars({
      ...FULL,
      dailyUsedMinutes: null,
      dailyRemainingMinutes: 180,
    });

    expect(today.usedMinutes).toBe(60);
  });

  test("잔여가 얼마 없으면 경고로 표시한다", () => {
    const [today] = buildQuotaBars({
      ...FULL,
      dailyUsedMinutes: 220,
      dailyRemainingMinutes: 20,
    });

    expect(today.low).toBe(true);
  });

  test("잔여가 넉넉하면 경고하지 않는다", () => {
    const [today] = buildQuotaBars(FULL);

    expect(today.low).toBe(false);
  });

  test("사용량이 한도를 넘어도 막대가 범위를 벗어나지 않는다", () => {
    const [today] = buildQuotaBars({
      ...FULL,
      dailyUsedMinutes: 999,
      dailyRemainingMinutes: -60,
    });

    expect(today.ratio).toBeLessThanOrEqual(1);
    expect(today.remainingMinutes).toBe(0);
  });
});

test.describe("previewRemainingMinutes", () => {
  test("고른 구간만큼 잔여가 줄어든 값을 준다", () => {
    const [today] = buildQuotaBars(FULL);

    expect(previewRemainingMinutes(today, 60)).toBe(120);
  });

  test("고른 게 없으면 지금 잔여 그대로다", () => {
    const [today] = buildQuotaBars(FULL);

    expect(previewRemainingMinutes(today, 0)).toBe(today.remainingMinutes);
  });

  test("한도를 넘겨도 음수가 되지 않는다", () => {
    // 음수 잔여는 화면에서 의미가 없다.
    const [today] = buildQuotaBars(FULL);

    expect(previewRemainingMinutes(today, 9999)).toBe(0);
  });
});

test.describe("formatQuotaMinutes", () => {
  test("시간과 분을 함께 읽어준다", () => {
    expect(formatQuotaMinutes(90)).toBe("1시간 30분");
  });

  test("딱 떨어지면 시간만 쓴다", () => {
    expect(formatQuotaMinutes(120)).toBe("2시간");
  });

  test("한 시간이 안 되면 분만 쓴다", () => {
    expect(formatQuotaMinutes(45)).toBe("45분");
  });

  test("0 이하는 0분이다", () => {
    expect(formatQuotaMinutes(0)).toBe("0분");
    expect(formatQuotaMinutes(-10)).toBe("0분");
  });
});

test.describe("캐시", () => {
  test("넣은 값을 다시 읽는다", () => {
    const cache = createQuotaCache();
    writeQuotaCache(cache, "2026-08-10", { quota: FULL });

    expect(readQuotaCache(cache, "2026-08-10")).toEqual(FULL);
  });

  test("없는 날짜는 undefined 다", () => {
    const cache = createQuotaCache();

    expect(readQuotaCache(cache, "2026-08-10")).toBeUndefined();
  });

  test("한도 없는 계정(null)도 캐시한다", () => {
    // null 을 "캐시에 없음"으로 다루면 매번 다시 조회하게 된다.
    const cache = createQuotaCache();
    writeQuotaCache(cache, "2026-08-10", { quota: null });

    expect(readQuotaCache(cache, "2026-08-10")).toBeNull();
  });

  test("TTL 이 지나면 버린다", () => {
    const cache = createQuotaCache();
    const now = 1_000_000;
    writeQuotaCache(cache, "2026-08-10", { quota: FULL, now });

    expect(readQuotaCache(cache, "2026-08-10", now + QUOTA_STALE_MS)).toBeUndefined();
  });

  test("TTL 안이면 그대로 쓴다", () => {
    const cache = createQuotaCache();
    const now = 1_000_000;
    writeQuotaCache(cache, "2026-08-10", { quota: FULL, now });

    expect(readQuotaCache(cache, "2026-08-10", now + QUOTA_STALE_MS - 1)).toEqual(FULL);
  });

  test("예약이 바뀌면 통째로 비운다", () => {
    // 예약을 만들면 사용량이 곧바로 바뀐다. TTL 을 기다리면 방금 만든 예약이
    // 반영되지 않은 한도를 보여준다.
    const cache = createQuotaCache();
    writeQuotaCache(cache, "2026-08-10", { quota: FULL });

    clearQuotaCache(cache);

    expect(readQuotaCache(cache, "2026-08-10")).toBeUndefined();
  });
});
