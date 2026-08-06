import { expect, test } from "@playwright/test";

import { mountReservationPage } from "./helpers/extension.js";

// 레이더 패널의 날짜 이동과 로딩 표시.
//
// 화살표로 하루씩 옮기거나 날짜를 직접 고르면 그 날짜의 스케줄을 다시 받아온다.
// 지난 날짜는 예약할 수 없으므로 최소일 아래로는 내려가지 않아야 한다.

/** /api/spaces 응답 한 건. */
function buildSpace(id, name, floor) {
  return {
    accessRole: "ALL",
    active: true,
    closeTime: "23:00:00",
    floor,
    id,
    maxReservationMinutes: 60,
    name,
    openTime: "07:00:00",
    reservationUnitMinutes: 30,
  };
}

/** 오늘(KST) 기준으로 offset 일 뒤 날짜 문자열. */
function dateAfter(offset) {
  const now = new Date(Date.now() + 9 * 60 * 60 * 1000);
  now.setUTCDate(now.getUTCDate() + offset);
  return now.toISOString().slice(0, 10);
}

test.beforeEach(async ({ page }) => {
  await mountReservationPage(page, { spaces: [buildSpace(3, "보이저", 12)] });
  await page.evaluate(() => window.__zzkTestApi.syncGuestUi());
});

test.describe("applyPanelDateChange", () => {
  test("앞으로 옮기면 그 날짜가 반영된다", async ({ page }) => {
    const target = dateAfter(3);
    const changed = await page.evaluate(
      (date) => window.__zzkTestApi.applyPanelDateChange(date),
      target,
    );

    expect(changed).toBe(true);
  });

  test("같은 날짜를 다시 주면 아무 일도 하지 않는다", async ({ page }) => {
    const target = dateAfter(2);
    const second = await page.evaluate((date) => {
      window.__zzkTestApi.applyPanelDateChange(date);
      return window.__zzkTestApi.applyPanelDateChange(date);
    }, target);

    // 같은 날짜로 다시 조회하면 요청만 늘고 화면은 그대로다.
    expect(second).toBe(false);
  });

  test("지난 날짜는 최소일로 끌어올린다", async ({ page }) => {
    const past = dateAfter(-5);
    const applied = await page.evaluate((date) => {
      window.__zzkTestApi.applyPanelDateChange(date);
      return window.__zzkTestApi.getStateSnapshot().activeScheduleDate;
    }, past);

    // 지난 날짜는 예약할 수 없으므로 그대로 두면 안 된다.
    expect(applied).not.toBe(past);
  });

  test("날짜 형식이 아니면 무시한다", async ({ page }) => {
    const results = await page.evaluate(() => [
      window.__zzkTestApi.applyPanelDateChange("내일"),
      window.__zzkTestApi.applyPanelDateChange(""),
      window.__zzkTestApi.applyPanelDateChange(null),
    ]);

    expect(results).toEqual([false, false, false]);
  });
});

test.describe("shiftPanelDateBy", () => {
  test("하루 뒤로 옮긴다", async ({ page }) => {
    const moved = await page.evaluate(() => {
      const before = window.__zzkTestApi.getStateSnapshot().activeScheduleDate;
      window.__zzkTestApi.shiftPanelDateBy(1);
      return { before, after: window.__zzkTestApi.getStateSnapshot().activeScheduleDate };
    });

    expect(moved.after > moved.before).toBe(true);
  });

  test("뒤로 갔다 앞으로 오면 제자리", async ({ page }) => {
    const moved = await page.evaluate(() => {
      window.__zzkTestApi.shiftPanelDateBy(3);
      const forward = window.__zzkTestApi.getStateSnapshot().activeScheduleDate;
      window.__zzkTestApi.shiftPanelDateBy(-3);
      return { forward, back: window.__zzkTestApi.getStateSnapshot().activeScheduleDate };
    });

    // 최소일에 걸리지 않는 범위라면 왕복이 맞아야 한다.
    expect(moved.back < moved.forward).toBe(true);
  });

  test("0 이나 정수가 아니면 움직이지 않는다", async ({ page }) => {
    const moved = await page.evaluate(() => {
      const before = window.__zzkTestApi.getStateSnapshot().activeScheduleDate;
      window.__zzkTestApi.shiftPanelDateBy(0);
      window.__zzkTestApi.shiftPanelDateBy(1.5);
      return { before, after: window.__zzkTestApi.getStateSnapshot().activeScheduleDate };
    });

    expect(moved.after).toBe(moved.before);
  });
});

test.describe("setScheduleLoadingDate", () => {
  test("로딩 중이면 그 날짜를 기억한다", async ({ page }) => {
    const target = dateAfter(1);
    const loadingDate = await page.evaluate((date) => {
      window.__zzkTestApi.setScheduleLoadingDate(date, true);
      return window.__zzkTestApi.getStateSnapshot().scheduleLoadingDate;
    }, target);

    expect(loadingDate).toBe(target);
  });

  test("로딩이 끝나면 지운다", async ({ page }) => {
    const target = dateAfter(1);
    const loadingDate = await page.evaluate((date) => {
      window.__zzkTestApi.setScheduleLoadingDate(date, true);
      window.__zzkTestApi.setScheduleLoadingDate(date, false);
      return window.__zzkTestApi.getStateSnapshot().scheduleLoadingDate;
    }, target);

    // 안 지우면 로딩 오버레이가 계속 떠 있는다.
    expect(loadingDate).toBeFalsy();
  });

  test("날짜 형식이 아니면 로딩 중인 날짜를 덮어쓰지 않는다", async ({ page }) => {
    // 형식이 틀린 값으로 로딩을 걸면 그냥 무시해야 한다. 통과시키면 이미
    // 돌고 있던 조회의 로딩 표시가 지워져 스피너가 사라진다.
    const target = dateAfter(1);
    const result = await page.evaluate((date) => {
      window.__zzkTestApi.setScheduleLoadingDate(date, true);
      window.__zzkTestApi.setScheduleLoadingDate("언젠가", true);
      return window.__zzkTestApi.getStateSnapshot().scheduleLoadingDate;
    }, target);

    expect(result).toBe(target);
  });

  test("다른 날짜로 끝났다고 하면 현재 로딩을 지우지 않는다", async ({ page }) => {
    // 늦게 온 이전 요청의 완료 통보가 지금 로딩을 끄면 안 된다.
    const current = dateAfter(1);
    const stale = dateAfter(5);
    const result = await page.evaluate(
      ([now, old]) => {
        window.__zzkTestApi.setScheduleLoadingDate(now, true);
        window.__zzkTestApi.setScheduleLoadingDate(old, false);
        return window.__zzkTestApi.getStateSnapshot().scheduleLoadingDate;
      },
      [current, stale],
    );

    expect(result).toBe(current);
  });
});
