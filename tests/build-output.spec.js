import fs from "node:fs";
import path from "node:path";
import { execFileSync } from "node:child_process";
import { expect, test } from "@playwright/test";

// 2단계(빌드 도입) 회귀 가드.
// 번들 산출물이 기존 스크립트 나열 방식과 동일하게 부트스트랩되는지 확인한다.
// 로직/UI 는 그대로이므로 "동작 동일" 을 검증하는 게 목적이다.

const DIST_DIR = path.resolve(process.cwd(), "dist/extension");
const WEB_ORIGIN = "https://techcourse-lms-plus-web.woowahan.com";
const API_ORIGIN = "https://techcourse-lms-plus-api.woowahan.com";

// content.js 가 부팅 전에 요구하는 전역들(requiredBootstrapGlobals 와 같은 목록).
const REQUIRED_GLOBALS = [
  "__zzkSharedUtils",
  "__zzkStorageUtils",
  "__zzkDateTimeUtils",
  "__zzkRouteUtils",
  "__zzkSlackShared",
  "__zzkRadarShared",
  "__zzkSharedConstants",
  "__zzkRadarWorkflow",
  "__zzkRadarFormSync",
  "__zzkSlackWorkflow",
  "__zzkSlackSuccessFlow",
  "__zzkFormFieldUtils",
  "__zzkLmsDataShared",
];

test.beforeAll(() => {
  // 산출물이 없거나 오래됐을 수 있으니 테스트 시작 전에 한 번 빌드한다.
  execFileSync("npx", ["vite", "build"], {
    cwd: process.cwd(),
    stdio: "pipe",
  });
});

function readBuiltManifest() {
  return JSON.parse(fs.readFileSync(path.join(DIST_DIR, "manifest.json"), "utf8"));
}

test("빌드 산출물 manifest 가 확장 로드에 필요한 형태를 갖춘다", () => {
  const manifest = readBuiltManifest();

  expect(manifest.manifest_version).toBe(3);
  expect(manifest.version).toBeTruthy();

  // content script 는 번들 청크 하나로 합쳐진다.
  const contentJs = manifest.content_scripts?.[0]?.js ?? [];
  expect(contentJs).toHaveLength(1);
  expect(fs.existsSync(path.join(DIST_DIR, contentJs[0]))).toBeTruthy();

  // 서비스워커 로더도 실제로 존재해야 한다.
  expect(fs.existsSync(path.join(DIST_DIR, manifest.background.service_worker))).toBeTruthy();
});

test("런타임에 경로로 직접 불러오는 파일들이 산출물에 그대로 있다", () => {
  // content.js 가 chrome.runtime.getURL 로 이 경로들을 문자열 그대로 부른다.
  // 번들러가 경로를 바꿔버리면 예약 훅과 Slack 모달 스타일이 조용히 깨진다.
  const runtimeLoadedPaths = [
    "assets/basecoat-dialog.css",
  ];

  const manifest = readBuiltManifest();
  const exposed = manifest.web_accessible_resources?.[0]?.resources ?? [];

  for (const relativePath of runtimeLoadedPaths) {
    expect(fs.existsSync(path.join(DIST_DIR, relativePath)), `${relativePath} 파일 없음`).toBeTruthy();
    expect(exposed, `${relativePath} 가 web_accessible_resources 에 없음`).toContain(relativePath);
  }
});

test("예약 훅이 MAIN world content script 로 선언된다", () => {
  const manifest = readBuiltManifest();

  // 페이지의 fetch/XHR 을 패치하려면 페이지와 같은 실행 환경이어야 한다.
  const mainWorldScript = manifest.content_scripts?.find((entry) => entry.world === "MAIN");
  expect(mainWorldScript, "world: MAIN content script 가 없음").toBeTruthy();
  expect(mainWorldScript.js).toHaveLength(1);
  expect(fs.existsSync(path.join(DIST_DIR, mainWorldScript.js[0]))).toBeTruthy();

  // 페이지 앱보다 먼저 떠야 초기 요청을 놓치지 않는다.
  expect(mainWorldScript.run_at).toBe("document_start");

  // 더 이상 <script> 주입을 안 하므로 훅 파일을 공개할 필요가 없다.
  const exposed = manifest.web_accessible_resources?.[0]?.resources ?? [];
  expect(exposed).not.toContain("src/page-hook/shared.js");
  expect(exposed).not.toContain("src/page-network-hook.js");
});

test("MAIN world 번들이 페이지 fetch 를 패치해 예약 이벤트를 emit 한다", async ({ page }) => {
  const manifest = readBuiltManifest();
  const mainWorldScript = manifest.content_scripts.find((entry) => entry.world === "MAIN");
  const bundlePath = path.join(DIST_DIR, mainWorldScript.js[0]);

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
  await page.route(`${API_ORIGIN}/api/space-reservations**`, async (route) => {
    await route.fulfill({
      status: 201,
      headers: {
        "access-control-allow-origin": WEB_ORIGIN,
        "access-control-allow-credentials": "true",
        "content-type": "application/json",
      },
      body: JSON.stringify({ id: 175, spaceName: "보이저", floor: 12 }),
    });
  });

  await page.goto(`${WEB_ORIGIN}/space-reservations`, { waitUntil: "domcontentloaded" });
  await page.addScriptTag({ path: bundlePath, type: "module" });

  const messages = await page.evaluate(async (apiOrigin) => {
    const collected = [];
    const handleMessage = (event) => {
      const data = event.data;
      if (data?.source === "zzk-page-reservation-hook") {
        collected.push(data.payload || {});
      }
    };
    window.addEventListener("message", handleMessage);
    try {
      await fetch(`${apiOrigin}/api/space-reservations`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ spaceId: 5, purpose: "학습" }),
      });
      await new Promise((resolve) => window.setTimeout(resolve, 150));
      return collected;
    } finally {
      window.removeEventListener("message", handleMessage);
    }
  }, API_ORIGIN);

  const withBody = messages.find((m) => m && m.responseBody);
  expect(withBody).toBeTruthy();
  expect(withBody.method).toBe("POST");
  expect(withBody.responseBody).toMatchObject({ spaceName: "보이저", floor: 12 });
});

test("번들된 content script 가 전역 부트스트랩을 동일하게 올린다", async ({ page }) => {
  const manifest = readBuiltManifest();
  const bundlePath = path.join(DIST_DIR, manifest.content_scripts[0].js[0]);

  const pageErrors = [];
  page.on("pageerror", (error) => pageErrors.push(error.message));

  await page.route(`${WEB_ORIGIN}/**`, async (route) => {
    if (route.request().resourceType() !== "document") {
      await route.continue();
      return;
    }
    await route.fulfill({
      status: 200,
      contentType: "text/html",
      body: "<html><body><main></main></body></html>",
    });
  });
  await page.route(`${API_ORIGIN}/api/**`, async (route) => {
    await route.fulfill({
      status: 200,
      headers: {
        "access-control-allow-origin": WEB_ORIGIN,
        "access-control-allow-credentials": "true",
        "content-type": "application/json",
      },
      body: "[]",
    });
  });

  await page.goto(`${WEB_ORIGIN}/space-reservations`, { waitUntil: "domcontentloaded" });
  await page.addScriptTag({ path: bundlePath, type: "module" });

  await page.waitForFunction(() => window.__zzkAvailabilityLensLoaded === true, undefined, {
    timeout: 5000,
  });

  const snapshot = await page.evaluate((globalNames) => ({
    loaded: window.__zzkAvailabilityLensLoaded === true,
    loadError: window.__zzkAvailabilityLensLoadError || null,
    bootstrapErrors: window.__zzkBootstrapLoadErrors || [],
    missing: globalNames.filter((name) => !globalThis[name]),
  }), REQUIRED_GLOBALS);

  expect(pageErrors).toEqual([]);
  expect(snapshot.loadError).toBeNull();
  expect(snapshot.bootstrapErrors).toEqual([]);
  expect(snapshot.missing).toEqual([]);
  expect(snapshot.loaded).toBeTruthy();
});

test("번들된 content script 가 레이더 UI 를 실제로 마운트한다", async ({ page }) => {
  const manifest = readBuiltManifest();
  const bundlePath = path.join(DIST_DIR, manifest.content_scripts[0].js[0]);

  const spaces = [
    {
      accessRole: "ALL",
      active: true,
      closeTime: "23:00:00",
      floor: 11,
      id: 1,
      maxReservationMinutes: 60,
      name: "금성",
      openTime: "07:00:00",
      reservationUnitMinutes: 30,
    },
  ];

  await page.route(`${WEB_ORIGIN}/**`, async (route) => {
    if (route.request().resourceType() !== "document") {
      await route.continue();
      return;
    }
    await route.fulfill({
      status: 200,
      contentType: "text/html",
      body: "<html><body><main></main></body></html>",
    });
  });
  await page.route(`${API_ORIGIN}/api/**`, async (route) => {
    const url = new URL(route.request().url());
    await route.fulfill({
      status: 200,
      headers: {
        "access-control-allow-origin": WEB_ORIGIN,
        "access-control-allow-credentials": "true",
        "content-type": "application/json",
      },
      body: JSON.stringify(url.pathname === "/api/spaces" ? spaces : []),
    });
  });

  await page.goto(`${WEB_ORIGIN}/space-reservations`, { waitUntil: "domcontentloaded" });
  await page.addScriptTag({ path: bundlePath, type: "module" });

  // 스크립트 나열 방식과 동일하게 런처와 오버레이가 뜬다.
  await expect
    .poll(() => page.evaluate(() => Boolean(document.getElementById("zzk-map-calendar-radar-launcher"))))
    .toBe(true);
  await expect
    .poll(() => page.evaluate(() => Boolean(document.getElementById("zzk-map-calendar-overlay"))))
    .toBe(true);
});
