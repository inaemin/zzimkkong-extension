import path from "node:path";
import { expect, test } from "@playwright/test";

const WEB_ORIGIN = "https://techcourse-lms-plus-web.woowahan.com";
const API_ORIGIN = "https://techcourse-lms-plus-api.woowahan.com";

// 실제 앱이 저장하는 형태를 흉내낸 가짜 JWT (서명부는 임의값).
const FAKE_JWT =
  "eyJhbGciOiJIUzUxMiJ9.eyJzdWIiOiI1NyIsInJvbGVzIjpbIlJPTEVfVVNFUiJdfQ.AAAABBBBCCCCDDDDEEEEFFFF";

const LMS_DATA_SCRIPTS = [
  "src/utils/shared.js",
  "src/constants/runtime.js",
  "src/utils/date-time.js",
  "src/utils/routes.js",
  "src/services/guest-data/normalizers.js",
  "src/services/lms-data/normalizers.js",
  "src/services/lms-data/shared.js",
];

async function stubDocument(page) {
  await page.route(`${WEB_ORIGIN}/**`, async (route) => {
    if (route.request().resourceType() !== "document") {
      await route.continue();
      return;
    }
    await route.fulfill({
      status: 200,
      contentType: "text/html",
      body: "<html><body></body></html>",
    });
  });
}

async function loadScripts(page) {
  for (const scriptPath of LMS_DATA_SCRIPTS) {
    await page.addScriptTag({ path: path.resolve(process.cwd(), scriptPath) });
  }
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
      body: JSON.stringify([{ id: 1, name: "금성", floor: 11, active: true, openTime: "07:00:00", closeTime: "23:00:00" }]),
    });
  });

  await page.goto(`${WEB_ORIGIN}/space-reservations`, { waitUntil: "domcontentloaded" });
  // 앱이 흔히 하듯 JSON 래핑된 토큰으로 저장해도 추출되는지 확인한다.
  await page.evaluate((jwt) => {
    localStorage.setItem("some-app-auth", JSON.stringify({ accessToken: jwt, tokenType: "Bearer" }));
  }, FAKE_JWT);
  await loadScripts(page);

  const context = await page.evaluate(() => window.__zzkLmsDataShared.loadSpaceContext(null));
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

  await page.evaluate(() => window.__zzkLmsDataShared.loadSpaceContext(null));
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
      await window.__zzkLmsDataShared.fetchDailySchedule({ date: "2099-01-02", roomType: null });
      return { threw: false };
    } catch (error) {
      return { threw: true, message: error instanceof Error ? error.message : String(error) };
    }
  });

  expect(result.threw).toBe(true);
  // 토큰이 없을 때: 로그인 안내
  expect(result.message).toContain("로그인");
});
