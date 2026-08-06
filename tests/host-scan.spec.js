import { expect, test } from "@playwright/test";

import { mountReservationPage } from "./helpers/extension.js";

// lms+ 예약 폼에서 날짜·시간 입력을 찾아내는 스캔 로직.
//
// 호스트 마크업은 우리가 못 바꾸고 예고 없이 바뀔 수 있다. 그래서 "이름이
// date 다" 같은 단정 대신 여러 신호에 점수를 매겨 가장 그럴듯한 것을 고른다.
// 그 점수 규칙이 맞는지 확인한다.
//
// 이 함수들은 instanceof HTMLInputElement 로 판정하므로 진짜 DOM 이 필요하다.
// 그래서 페이지 안에서 돌린다 — 다만 폼을 직접 만들어 넣으므로 실제 lms+
// 마크업에는 의존하지 않는다.

/** 페이지에 폼을 심고, 그 안에서 스캔 함수를 돌린다. */
async function scanWith(page, html, evaluate) {
  await page.evaluate((markup) => {
    document.body.innerHTML = markup;
  }, html);
  return page.evaluate(evaluate);
}

test.beforeEach(async ({ page }) => {
  await mountReservationPage(page);
});

test("이름이 정확히 맞는 시각 입력을 고른다", async ({ page }) => {
  const picked = await scanWith(
    page,
    `<input name="someStartField" type="time" />
     <input name="startTime" type="time" />`,
    () => {
      const api = window.__zzkTestApi;
      const input = api.queryHostTimeInput(["start", "starttime", "시작"]);
      return input ? input.name : null;
    },
  );

  // someStartField 도 키워드에 걸리지만 정확히 맞는 쪽이 이긴다.
  expect(picked).toBe("startTime");
});

test("종료를 찾을 때 시작 입력을 고르지 않는다", async ({ page }) => {
  const picked = await scanWith(
    page,
    `<input name="startTime" type="time" />
     <input name="endTime" type="time" />`,
    () => {
      const input = window.__zzkTestApi.queryHostTimeInput(["end", "endtime", "종료"]);
      return input ? input.name : null;
    },
  );

  expect(picked).toBe("endTime");
});

test("시각 입력이 아니면 키워드가 맞아도 고르지 않는다", async ({ page }) => {
  const picked = await scanWith(
    page,
    `<input name="startRoom" type="text" value="보이저" />`,
    () => {
      const input = window.__zzkTestApi.queryHostTimeInput(["start", "시작"]);
      return input ? input.name : null;
    },
  );

  expect(picked).toBeNull();
});

test("날짜 입력을 이름과 타입으로 찾는다", async ({ page }) => {
  const picked = await scanWith(
    page,
    `<input name="title" type="text" />
     <input name="date" type="date" />`,
    () => {
      const input = window.__zzkTestApi.queryHostDateInput();
      return input ? input.name : null;
    },
  );

  expect(picked).toBe("date");
});

test("날짜다운 신호가 없으면 아무것도 고르지 않는다", async ({ page }) => {
  const picked = await scanWith(page, `<input name="title" type="text" />`, () => {
    const input = window.__zzkTestApi.queryHostDateInput();
    return input ? input.name : null;
  });

  // 최소 점수에 못 미치면 null 이다. 엉뚱한 입력에 날짜를 쓰면 안 된다.
  expect(picked).toBeNull();
});

test("hidden 입력은 후보에서 뺀다", async ({ page }) => {
  const picked = await scanWith(
    page,
    `<input name="date" type="hidden" />
     <input name="reservationDate" type="date" />`,
    () => {
      const input = window.__zzkTestApi.queryHostDateInput();
      return input ? input.name : null;
    },
  );

  expect(picked).toBe("reservationDate");
});
