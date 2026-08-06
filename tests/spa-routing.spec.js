import { expect, test } from "@playwright/test";

import { mountReservationPage } from "./helpers/extension.js";

// SPA 라우팅과 정리.
//
// lms+ 는 페이지를 새로 로드하지 않고 history API 로 화면을 바꾼다. 그래서
// 예약 페이지를 떠나도 우리 콘텐츠 스크립트는 계속 살아 있다 — 스스로
// 알아채고 레이더를 걷어내지 않으면 관계없는 화면에 런처가 남는다.

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

const LAUNCHER_ID = "zzk-map-calendar-radar-launcher";

test.beforeEach(async ({ page }) => {
  await mountReservationPage(page, { spaces: [buildSpace(3, "보이저", 12)] });
  await page.evaluate(() => window.__zzkTestApi.syncGuestUi());
});

test("예약 페이지에서는 런처가 붙는다", async ({ page }) => {
  const exists = await page.evaluate((id) => Boolean(document.getElementById(id)), LAUNCHER_ID);

  expect(exists).toBe(true);
});

test("예약 페이지를 떠나면 레이더를 걷어낸다", async ({ page }) => {
  const after = await page.evaluate((id) => {
    // history 로만 이동한다(문서는 그대로). 실제 lms+ 의 화면 전환과 같다.
    history.pushState({}, "", "/some-other-page");
    window.dispatchEvent(new PopStateEvent("popstate"));
    return Boolean(document.getElementById(id));
  }, LAUNCHER_ID);

  // 남아 있으면 관계없는 화면에 우리 버튼이 떠 있게 된다.
  expect(after).toBe(false);
});

test("돌아오면 다시 붙는다", async ({ page }) => {
  const states = await page.evaluate((id) => {
    history.pushState({}, "", "/some-other-page");
    window.dispatchEvent(new PopStateEvent("popstate"));
    const away = Boolean(document.getElementById(id));

    history.pushState({}, "", "/space-reservations");
    window.dispatchEvent(new PopStateEvent("popstate"));
    window.__zzkTestApi.syncGuestUi();
    return { away, back: Boolean(document.getElementById(id)) };
  }, LAUNCHER_ID);

  expect(states.away).toBe(false);
  expect(states.back).toBe(true);
});

test("pushState 로 이동해도 알아챈다", async ({ page }) => {
  // popstate 는 뒤로가기에만 온다. 앱이 pushState 로 넘어가는 경우를 잡으려면
  // history 메서드 자체를 감싸야 한다.
  const after = await page.evaluate((id) => {
    history.pushState({}, "", "/another-page");
    return Boolean(document.getElementById(id));
  }, LAUNCHER_ID);

  expect(after).toBe(false);
});

test("같은 주소로 다시 이동하면 라우팅 처리를 건너뛴다", async ({ page }) => {
  // 주소가 그대로면 다시 붙일 이유가 없다. 처리했는지는 라우팅 시각으로 본다
  // (DOM 은 ensure* 가 멱등이라 어느 쪽이든 같아 보인다).
  const result = await page.evaluate(() => {
    const here = location.pathname + location.search + location.hash;
    history.pushState({}, "", "/away");
    const afterMove = window.__zzkTestApi.getStateSnapshot().lastGuestRouteChangeAt;
    history.pushState({}, "", here);
    const afterBack = window.__zzkTestApi.getStateSnapshot().lastGuestRouteChangeAt;
    history.pushState({}, "", here);
    return {
      afterBack,
      afterRepeat: window.__zzkTestApi.getStateSnapshot().lastGuestRouteChangeAt,
      afterMove,
    };
  });

  // 돌아왔을 때는 처리되고(시각 갱신), 같은 주소 반복은 건너뛴다(시각 그대로).
  expect(result.afterBack).toBeGreaterThan(0);
  expect(result.afterRepeat).toBe(result.afterBack);
});

test.describe("예약 시도 정리", () => {
  test("처리한 시도는 목록에서 지운다", async ({ page }) => {
    const result = await page.evaluate(() => {
      const form = document.createElement("form");
      form.innerHTML = `<input name="date" type="date" value="2026-08-10" />
        <input name="startTime" type="time" value="09:00" />
        <button type="submit">예약하기</button>`;
      document.body.appendChild(form);
      form.addEventListener("submit", (event) => event.preventDefault());
      form.requestSubmit();

      const ids = window.__zzkTestApi.getStateSnapshot().pendingReservationAttemptIds;
      const deleted = window.__zzkTestApi.deletePendingReservationAttempt(ids[0]);
      return {
        deleted,
        left: window.__zzkTestApi.getStateSnapshot().pendingReservationAttemptCount,
      };
    });

    expect(result.deleted).toBe(true);
    expect(result.left).toBe(0);
  });

  test("모르는 id 를 지우라고 하면 false", async ({ page }) => {
    const results = await page.evaluate(() => [
      window.__zzkTestApi.deletePendingReservationAttempt("없는-id"),
      window.__zzkTestApi.deletePendingReservationAttempt(""),
      window.__zzkTestApi.deletePendingReservationAttempt(null),
    ]);

    expect(results).toEqual([false, false, false]);
  });

  test("다른 시도의 표식은 건드리지 않는다", async ({ page }) => {
    // 시도 id 를 documentElement.dataset 에도 적어 둔다. 지금 진행 중인 것과
    // 다른 id 로 정리를 부르면, 남의 표식을 지워 성공 응답과 짝을 못 맞춘다.
    const result = await page.evaluate(() => {
      document.documentElement.dataset.zzkReservationAttemptId = "진행중-시도";
      window.__zzkTestApi.clearReservationAttemptDataset("다른-시도");
      return document.documentElement.dataset.zzkReservationAttemptId;
    });

    expect(result).toBe("진행중-시도");
  });

  test("같은 시도의 표식은 지운다", async ({ page }) => {
    const result = await page.evaluate(() => {
      document.documentElement.dataset.zzkReservationAttemptId = "내-시도";
      window.__zzkTestApi.clearReservationAttemptDataset("내-시도");
      return document.documentElement.dataset.zzkReservationAttemptId ?? null;
    });

    expect(result).toBeFalsy();
  });
});

test("대기 중인 Slack 모달 상태를 비운다", async ({ page }) => {
  const cleared = await page.evaluate(() => {
    window.__zzkTestApi.clearPendingSlackModalState();
    return window.__zzkTestApi.getStateSnapshot().pendingSlackModalContext;
  });

  expect(cleared).toBeFalsy();
});

test.describe("자동 새로고침 예약", () => {
  test("예약된 갱신이 캐시를 써서 다시 그린다", async ({ page }) => {
    // 예약이 생기거나 바뀌면 잠시 뒤 레이더를 다시 그린다. 타이머가 걸리고
    // 실제로 돌아가는지 확인한다(연달아 불러도 마지막 것 하나만 남는다).
    const rendered = await page.evaluate(async () => {
      await window.__zzkTestApi.loadAndOpenRadar();
      window.__zzkTestApi.scheduleCalendarOverlayRefresh();
      window.__zzkTestApi.scheduleCalendarOverlayRefresh();
      await new Promise((resolve) => setTimeout(resolve, 1200));
      return Boolean(window.__zzkQuery('[data-testid="radar-body"]'));
    });

    expect(rendered).toBe(true);
  });
});

test.describe("백그라운드 경유 전송", () => {
  test("아는 API 가 아니면 백그라운드로 보낸다", async ({ page }) => {
    // 확장 컨텍스트가 없는 테스트 페이지에서는 chrome.runtime 이 없어
    // 전송이 실패한다. 그 실패가 조용히 삼켜지지 않고 응답으로 오는지 본다.
    const message = await page.evaluate(async () => {
      try {
        await window.__zzkTestApi.sendMessage({ type: "ZZK_UNKNOWN_MESSAGE" });
        return null;
      } catch (error) {
        return error instanceof Error ? error.message : String(error);
      }
    });

    // 조용히 성공한 척하지 않고 왜 못 보냈는지 알려줘야 한다.
    expect(message).toContain("chrome.runtime.sendMessage");
  });
});
