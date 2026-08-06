import { expect, test } from "@playwright/test";

import { mountReservationPage } from "./helpers/extension.js";

// 레이더 접기/펼치기.
//
// 헤더의 "접기" 버튼은 본문을 감추고 헤더 줄만 남긴다. 타임블록을 다 보지
// 않아도 되는데 화면을 많이 차지할 때 쓴다.
//
// 접힘 표시는 카드의 collapsed 클래스로 하고, CSS 가 본문을 display:none 한다.
// 클래스가 안 붙으면 접기 버튼이 아무 일도 안 하는 것처럼 보인다.

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

test.beforeEach(async ({ page }) => {
  await mountReservationPage(page, {
    spaces: [buildSpace(1, "금성", 11), buildSpace(3, "보이저", 12)],
  });
  await page.evaluate(async () => {
    await window.__zzkTestApi.loadAndOpenRadar();
  });
});

/** 카드가 접혀 있는지. */
async function isCollapsed(page) {
  return page.evaluate(
    () => window.__zzkQuery('[data-testid="radar-card"]')?.classList.contains("collapsed") ?? null,
  );
}

test("처음에는 펼쳐져 있다", async ({ page }) => {
  expect(await isCollapsed(page)).toBe(false);
});

test("접기를 누르면 카드가 접힌다", async ({ page }) => {
  await page.evaluate(() => {
    const buttons = Array.from(window.__zzkQueryAll("button"));
    buttons.find((button) => (button.textContent || "").includes("접기"))?.click();
  });

  expect(await isCollapsed(page)).toBe(true);
});

test("다시 누르면 펼쳐진다", async ({ page }) => {
  const toggle = () =>
    page.evaluate(() => {
      const buttons = Array.from(window.__zzkQueryAll("button"));
      buttons
        .find((button) => {
          const text = button.textContent || "";
          return text.includes("접기") || text.includes("열기");
        })
        ?.click();
    });

  await toggle();
  expect(await isCollapsed(page)).toBe(true);

  await toggle();
  expect(await isCollapsed(page)).toBe(false);
});

test("접히면 버튼 글자가 '열기' 로 바뀐다", async ({ page }) => {
  await page.evaluate(() => {
    const buttons = Array.from(window.__zzkQueryAll("button"));
    buttons.find((button) => (button.textContent || "").includes("접기"))?.click();
  });

  const label = await page.evaluate(() => {
    const buttons = Array.from(window.__zzkQueryAll("button"));
    return (
      buttons.find((button) => (button.textContent || "").includes("열기"))?.textContent ?? null
    );
  });

  // 글자가 안 바뀌면 다시 펼칠 방법을 사용자가 못 찾는다.
  expect(label).toContain("열기");
});

test("접어도 본문 요소 자체는 남는다", async ({ page }) => {
  await page.evaluate(() => {
    const buttons = Array.from(window.__zzkQueryAll("button"));
    buttons.find((button) => (button.textContent || "").includes("접기"))?.click();
  });

  // 감추는 건 CSS 가 한다. DOM 에서 걷어내면 펼칠 때 다시 그려야 해 느려진다.
  const bodyExists = await page.evaluate(() =>
    Boolean(window.__zzkQuery('[data-testid="radar-body"]')),
  );
  expect(bodyExists).toBe(true);
});
