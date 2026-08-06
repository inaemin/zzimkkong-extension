import { expect, test } from "@playwright/test";

import { mountReservationPage } from "./helpers/extension.js";

// 백그라운드 전송과 직접 호출 fallback.
//
// lms+ 는 페이지 localStorage 의 JWT 를 Authorization 헤더로 붙여야 하는데,
// 백그라운드 서비스워커는 페이지 저장소를 못 읽는다. 그래서 API 요청은
// 백그라운드를 거치지 않고 콘텐츠 스크립트에서 바로 처리한다.
//
// 이 판정이 틀리면 요청이 백그라운드로 갔다가 인증 없이 실패한다.

test.beforeEach(async ({ page }) => {
  await mountReservationPage(page);
});

test.describe("shouldUseDirectApiFallback", () => {
  test("아는 API 요청은 직접 처리한다", async ({ page }) => {
    const results = await page.evaluate(() => [
      window.__zzkTestApi.shouldUseDirectApiFallback({ type: "ZZK_FETCH_AVAILABILITY" }),
      window.__zzkTestApi.shouldUseDirectApiFallback({ type: "ZZK_FETCH_DAILY_SCHEDULE" }),
    ]);

    expect(results).toEqual([true, true]);
  });

  test("모르는 메시지는 백그라운드로 보낸다", async ({ page }) => {
    const results = await page.evaluate(() => [
      window.__zzkTestApi.shouldUseDirectApiFallback({ type: "ZZK_SOMETHING_ELSE" }),
      window.__zzkTestApi.shouldUseDirectApiFallback({}),
      window.__zzkTestApi.shouldUseDirectApiFallback(null),
    ]);

    expect(results).toEqual([false, false, false]);
  });
});

test.describe("runtime 타임아웃 오류", () => {
  test("전용 오류를 만들고 알아본다", async ({ page }) => {
    const result = await page.evaluate(() => {
      const error = window.__zzkTestApi.createRuntimeMessageTimeoutError();
      return {
        isTimeout: window.__zzkTestApi.isRuntimeMessageTimeoutError(error),
        name: error.name,
      };
    });

    // 이 이름으로 구분해서 "백그라운드가 안 뜬 것"과 진짜 실패를 가른다.
    expect(result.isTimeout).toBe(true);
    expect(result.name).toBe("ZzkRuntimeMessageTimeoutError");
  });

  test("다른 오류는 타임아웃으로 보지 않는다", async ({ page }) => {
    const results = await page.evaluate(() => [
      window.__zzkTestApi.isRuntimeMessageTimeoutError(new Error("그냥 오류")),
      window.__zzkTestApi.isRuntimeMessageTimeoutError("문자열"),
      window.__zzkTestApi.isRuntimeMessageTimeoutError(null),
    ]);

    expect(results).toEqual([false, false, false]);
  });
});

test.describe("createSlackMessageFingerprint", () => {
  test("같은 예약이면 같은 지문", async ({ page }) => {
    const same = await page.evaluate(() => {
      const context = {
        date: "2026-08-10",
        startTime: "09:00",
        endTime: "10:00",
        roomName: "보이저",
        ownerName: "라텔",
        description: "회의",
      };
      const payload = { url: "/api/space-reservations" };
      return (
        window.__zzkTestApi.createSlackMessageFingerprint(context, payload) ===
        window.__zzkTestApi.createSlackMessageFingerprint({ ...context }, { ...payload })
      );
    });

    // 같으면 중복 모달을 건너뛴다. 달라지면 같은 예약에 모달이 두 번 뜬다.
    expect(same).toBe(true);
  });

  test("내용이 하나라도 다르면 다른 지문", async ({ page }) => {
    const differs = await page.evaluate(() => {
      const base = {
        date: "2026-08-10",
        startTime: "09:00",
        endTime: "10:00",
        roomName: "보이저",
      };
      const payload = { url: "/api/space-reservations" };
      const first = window.__zzkTestApi.createSlackMessageFingerprint(base, payload);
      return {
        byRoom:
          first !==
          window.__zzkTestApi.createSlackMessageFingerprint({ ...base, roomName: "금성" }, payload),
        byTime:
          first !==
          window.__zzkTestApi.createSlackMessageFingerprint(
            { ...base, startTime: "11:00" },
            payload,
          ),
      };
    });

    expect(differs.byRoom).toBe(true);
    expect(differs.byTime).toBe(true);
  });
});
