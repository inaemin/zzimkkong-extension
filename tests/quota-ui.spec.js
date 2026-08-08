import { expect, test } from "@playwright/test";
import {
  API_ORIGIN,
  WEB_ORIGIN,
  ensureExtensionBuild,
  loadContentBundle,
} from "./helpers/extension.js";

test.beforeAll(ensureExtensionBuild);

// 레이더 안에서의 예약 한도 표시.
//
// 계산 규칙은 tests/quota.spec.js 가 본다. 여기서는 "실제로 화면에 뜨는가"와
// "무제한이면 안 뜨는가"만 확인한다 — 데이터 계층은 이미 있었고 UI 만 없었으므로
// 이 연결이 이 기능의 전부다.

const SPACES = [
  {
    accessRole: "ALL",
    active: true,
    closeTime: "23:00:00",
    floor: 11,
    id: 3,
    maxReservationMinutes: 60,
    name: "수성",
    openTime: "07:00:00",
    reservationUnitMinutes: 30,
  },
];

const LIMITED_QUOTA = {
  unlimited: false,
  dailyLimitMinutes: 240,
  dailyUsedMinutes: 60,
  dailyRemainingMinutes: 180,
  monthlyLimitMinutes: 720,
  monthlyUsedMinutes: 480,
  monthlyRemainingMinutes: 240,
};

const UNLIMITED_QUOTA = {
  unlimited: true,
  dailyLimitMinutes: null,
  dailyUsedMinutes: null,
  dailyRemainingMinutes: null,
  monthlyLimitMinutes: null,
  monthlyUsedMinutes: null,
  monthlyRemainingMinutes: null,
};

const PAGE_HTML = `<html><body>
  <main>
    <form id="reservation-form">
      <label for="reservation-date">날짜</label>
      <input id="reservation-date" name="date" type="date" value="2026-12-02" />
    </form>
  </main>
</body></html>`;

async function mountRadar(page, { quota }) {
  await page.addInitScript(() => {
    window.__ZZK_TEST_HOOKS__ = true;
  });

  await page.route(`${WEB_ORIGIN}/**`, async (route) => {
    if (route.request().resourceType() !== "document") {
      await route.continue();
      return;
    }
    await route.fulfill({ status: 200, contentType: "text/html", body: PAGE_HTML });
  });

  await page.route(`${API_ORIGIN}/api/**`, async (route) => {
    const url = new URL(route.request().url());
    let body = [];
    if (url.pathname === "/api/spaces") {
      body = SPACES;
    } else if (url.pathname === "/api/space-reservations/quota") {
      body = quota;
    }
    await route.fulfill({
      status: 200,
      headers: {
        "access-control-allow-origin": WEB_ORIGIN,
        "access-control-allow-credentials": "true",
        "content-type": "application/json",
      },
      body: JSON.stringify(body),
    });
  });

  await page.goto(`${WEB_ORIGIN}/space-reservations`, { waitUntil: "domcontentloaded" });
  await loadContentBundle(page);
  await page.waitForFunction(
    () => document.getElementById("zzk-map-calendar-radar-launcher") instanceof HTMLElement,
    undefined,
    { timeout: 5000 },
  );
  await page.evaluate(async () => {
    await window.__zzkTestApi?.loadAndOpenRadar?.();
  });
  await page.waitForSelector("#zzk-map-calendar-overlay .zzk-map-calendar-row", { timeout: 6000 });
}

test("한도가 있으면 레이더 헤더에 잔여 시간이 뜬다", async ({ page }) => {
  await mountRadar(page, { quota: LIMITED_QUOTA });

  // 한도 응답이 도착한 뒤 다시 그려질 때까지 기다린다.
  await page.waitForFunction(() => window.__zzkQuery?.('[data-testid="radar-quota"]') != null, {
    timeout: 6000,
  });

  const text = await page.evaluate(
    () => window.__zzkQuery('[data-testid="radar-quota"]').textContent,
  );

  // 오늘 잔여 180분(3시간), 이번 달 잔여 240분(4시간).
  expect(text).toContain("오늘");
  expect(text).toContain("3시간");
  expect(text).toContain("이번 달");
  expect(text).toContain("4시간");
});

test("무제한 계정에는 한도를 표시하지 않는다", async ({ page }) => {
  // 한도가 없는 사람에게 빈 막대를 보여주면 안 된다.
  await mountRadar(page, { quota: UNLIMITED_QUOTA });

  // 한도 응답이 처리될 시간을 준 뒤에도 없어야 한다.
  await page.waitForTimeout(800);

  const present = await page.evaluate(
    () => window.__zzkQuery?.('[data-testid="radar-quota"]') != null,
  );

  expect(present).toBe(false);
});
