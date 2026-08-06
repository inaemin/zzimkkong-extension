import { expect, test } from "@playwright/test";
import {
  API_ORIGIN,
  WEB_ORIGIN,
  enableTestHooks,
  ensureExtensionBuild,
  loadContentBundle,
  stubServiceDocument,
} from "./helpers/extension.js";

test.beforeAll(ensureExtensionBuild);

// 실제 앱이 저장하는 형태를 흉내낸 가짜 JWT (서명부는 임의값).
const FAKE_JWT =
  "eyJhbGciOiJIUzUxMiJ9.eyJzdWIiOiI1NyIsInJvbGVzIjpbIlJPTEVfVVNFUiJdfQ.AAAABBBBCCCCDDDDEEEEFFFF";

async function stubDocument(page) {
  await enableTestHooks(page);
  await stubServiceDocument(page, "<html><body></body></html>");
}

// 데이터 계층(__zzkTestApi.lmsData)만 필요하지만, 번들이 한 덩어리라 content 번들을 쓴다.
async function loadScripts(page) {
  await loadContentBundle(page);
}

test("attaches Authorization: Bearer from a JWT in localStorage", async ({ page }) => {
  await stubDocument(page);

  let seenAuth = null;
  await page.route(`${API_ORIGIN}/api/spaces`, async (route) => {
    seenAuth = route.request().headers()["authorization"] || null;
    await route.fulfill({
      status: 200,
      headers: {
        "access-control-allow-origin": WEB_ORIGIN,
        "access-control-allow-credentials": "true",
        "content-type": "application/json",
      },
      body: JSON.stringify([
        {
          id: 1,
          name: "금성",
          floor: 11,
          active: true,
          openTime: "07:00:00",
          closeTime: "23:00:00",
        },
      ]),
    });
  });

  await page.goto(`${WEB_ORIGIN}/space-reservations`, { waitUntil: "domcontentloaded" });
  // 앱이 흔히 하듯 JSON 래핑된 토큰으로 저장해도 추출되는지 확인한다.
  await page.evaluate((jwt) => {
    localStorage.setItem(
      "some-app-auth",
      JSON.stringify({ accessToken: jwt, tokenType: "Bearer" }),
    );
  }, FAKE_JWT);
  await loadScripts(page);

  const context = await page.evaluate(() => window.__zzkTestApi.lmsData.loadSpaceContext(null));
  expect(context.targetRooms.length).toBe(1);
  expect(seenAuth).toBe(`Bearer ${FAKE_JWT}`);
});

test("reads a bare JWT stored directly under a key", async ({ page }) => {
  await stubDocument(page);

  let seenAuth = null;
  await page.route(`${API_ORIGIN}/api/spaces`, async (route) => {
    seenAuth = route.request().headers()["authorization"] || null;
    await route.fulfill({
      status: 200,
      headers: {
        "access-control-allow-origin": WEB_ORIGIN,
        "access-control-allow-credentials": "true",
        "content-type": "application/json",
      },
      body: JSON.stringify([]),
    });
  });

  await page.goto(`${WEB_ORIGIN}/space-reservations`, { waitUntil: "domcontentloaded" });
  await page.evaluate((jwt) => localStorage.setItem("accessToken", jwt), FAKE_JWT);
  await loadScripts(page);

  await page.evaluate(() => window.__zzkTestApi.lmsData.loadSpaceContext(null));
  expect(seenAuth).toBe(`Bearer ${FAKE_JWT}`);
});

test("403 surfaces a friendly login error instead of a raw status", async ({ page }) => {
  await stubDocument(page);
  await page.route(`${API_ORIGIN}/api/**`, async (route) => {
    await route.fulfill({
      status: 403,
      headers: {
        "access-control-allow-origin": WEB_ORIGIN,
        "access-control-allow-credentials": "true",
        "content-type": "application/json",
      },
      body: "",
    });
  });

  await page.goto(`${WEB_ORIGIN}/space-reservations`, { waitUntil: "domcontentloaded" });
  await loadScripts(page);

  const result = await page.evaluate(async () => {
    try {
      await window.__zzkTestApi.lmsData.fetchDailySchedule({ date: "2099-01-02", roomType: null });
      return { threw: false };
    } catch (error) {
      return { threw: true, message: error instanceof Error ? error.message : String(error) };
    }
  });

  expect(result.threw).toBe(true);
  // 토큰이 없을 때: 로그인 안내
  expect(result.message).toContain("로그인");
});
