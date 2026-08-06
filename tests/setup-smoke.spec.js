import fs from "node:fs";
import path from "node:path";
import { expect, test } from "@playwright/test";
import {
  WEB_ORIGIN,
  ensureExtensionBuild,
  loadContentBundle,
  stubServiceDocument,
} from "./helpers/extension.js";

test.beforeAll(ensureExtensionBuild);

test("playwright local setup works", async ({ page }) => {
  await page.goto("https://example.com", { waitUntil: "domcontentloaded" });
  await expect(page).toHaveTitle(/Example Domain/);
});

test("content bundle import order preserves global bootstrap dependencies", async () => {
  // 소스가 전역(globalThis.__zzk*) 기반 IIFE 라 로드 순서가 곧 의존성 순서다.
  // manifest 는 이제 빌드가 생성하므로, 순서 계약은 번들 진입점이 들고 있다.
  const bundleSource = fs.readFileSync(
    path.resolve(process.cwd(), "src/content-bundle.js"),
    "utf8",
  );
  const importedPaths = Array.from(
    bundleSource.matchAll(/^import "(\.\/[^"]+)";$/gm),
  ).map((match) => match[1].replace(/^\.\//, "src/"));

  expect(importedPaths).toEqual([
    "src/constants/debug.js",
    "src/utils/shared.js",
    "src/utils/storage.js",
    "src/constants/runtime.js",
    "src/utils/date-time.js",
    "src/utils/routes.js",
    "src/features/slack/shared.js",
    "src/features/slack/workflow.js",
    "src/features/slack/success-flow.js",
    "src/features/form-fields/shared.js",
    "src/services/lms-data/normalizers.js",
    "src/services/lms-data/shared.js",
    "src/features/radar/floor-maps.js",
    "src/features/radar/shared.js",
    "src/features/radar/workflow.js",
    "src/features/radar/form-sync.js",
    "src/content.js",
  ]);
});

test("MAIN world 번들도 의존 순서를 지킨다", async () => {
  const bundleSource = fs.readFileSync(
    path.resolve(process.cwd(), "src/page-hook-bundle.js"),
    "utf8",
  );
  const importedPaths = Array.from(
    bundleSource.matchAll(/^import "(\.\/[^"]+)";$/gm),
  ).map((match) => match[1].replace(/^\.\//, "src/"));

  // shared 가 globalThis.__zzkPageHookShared 를 올리고 hook 이 그걸 읽는다.
  expect(importedPaths).toEqual([
    "src/page-hook/shared.js",
    "src/page-network-hook.js",
  ]);
});

test("background service worker reuses shared room policy constants", async () => {
  const backgroundSource = fs.readFileSync(
    path.resolve(process.cwd(), "src/background.js"),
    "utf8",
  );

  // 서비스워커는 type:"module" 로 등록되므로 importScripts() 를 쓸 수 없다.
  // (쓰면 "Module scripts don't support importScripts()" 로 부팅이 통째로 깨진다)
  // 주석에 단어가 등장할 수 있으므로 실제 호출 형태만 본다.
  expect(backgroundSource).not.toMatch(/^\s*importScripts\s*\(/m);
  expect(backgroundSource).toContain('import "./constants/runtime.js"');
  expect(backgroundSource).not.toMatch(/const\s+TARGET_ROOM_NAMES\s*=\s*\[/);
});

test("레이더를 띄울 수 없는 페이지에서는 부팅해도 UI 를 만들지 않는다", async ({ page }) => {
  const pageErrors = [];
  page.on("pageerror", (error) => pageErrors.push(error.message));

  await stubServiceDocument(page);
  // /space-reservations 가 아니므로 레이더 대상이 아니다.
  await page.goto(`${WEB_ORIGIN}/mypage`, { waitUntil: "domcontentloaded" });
  await loadContentBundle(page);

  const snapshot = await page.evaluate(() => ({
    loaded: window.__zzkAvailabilityLensLoaded === true,
    launcher: Boolean(document.getElementById("zzk-map-calendar-radar-launcher")),
    overlay: Boolean(document.getElementById("zzk-map-calendar-overlay")),
  }));

  // 스크립트는 정상 부팅하되(에러 없음) UI 는 붙지 않아야 한다.
  expect(pageErrors).toEqual([]);
  expect(snapshot.loaded).toBeTruthy();
  expect(snapshot.launcher).toBeFalsy();
  expect(snapshot.overlay).toBeFalsy();
});

test("storage helpers report debug events when browser storage throws", async ({ page }) => {
  // 브라우저가 저장소를 막는 건 런타임에 실제로 일어난다(모듈 전환과 무관).
  // 던지지 않고 디버그 이벤트로 남기는지 확인한다.
  await page.addInitScript(() => {
    window.__ZZK_DEBUG_MODE__ = true;
  });
  await stubServiceDocument(page);
  await page.goto(`${WEB_ORIGIN}/space-reservations`, { waitUntil: "domcontentloaded" });
  await loadContentBundle(page);

  const snapshot = await page.evaluate(() => {
    const originalGetItem = Storage.prototype.getItem;
    const originalSetItem = Storage.prototype.setItem;
    const originalRemoveItem = Storage.prototype.removeItem;
    Storage.prototype.getItem = function failingGetItem() {
      throw new Error("blocked getItem");
    };
    Storage.prototype.setItem = function failingSetItem() {
      throw new Error("blocked setItem");
    };
    Storage.prototype.removeItem = function failingRemoveItem() {
      throw new Error("blocked removeItem");
    };

    try {
      window.__zzkSharedUtils.clearDebugEvents();
      const boolValue = window.__zzkStorageUtils.readStoredBoolean("zzk-test-bool", true);
      window.__zzkStorageUtils.writeStoredBoolean("zzk-test-bool", false);
      window.__zzkStorageUtils.writeStoredText("zzk-test-text", "");
      return {
        boolValue,
        events: window.__zzkSharedUtils.getDebugEvents().filter((entry) => entry.scope === "storage"),
      };
    } finally {
      Storage.prototype.getItem = originalGetItem;
      Storage.prototype.setItem = originalSetItem;
      Storage.prototype.removeItem = originalRemoveItem;
    }
  });

  expect(snapshot.boolValue).toBeTruthy();
  expect(snapshot.events).toEqual(
    expect.arrayContaining([
      expect.objectContaining({ event: "read-failed" }),
      expect.objectContaining({ event: "write-failed" }),
      expect.objectContaining({ event: "remove-failed" }),
    ]),
  );
});

// 예전에는 각 모듈을 의존성 없이 주입해 "부트스트랩 실패"를 검증했다.
// 번들이 한 덩어리라 그 상황 자체를 만들 수 없고, 실제 배포 형태도 아니다.
// 대신 번들이 통째로 정상 부팅하는지를 확인한다.
test("번들이 부트스트랩 전역을 빠짐없이 올린다", async ({ page }) => {
  const pageErrors = [];
  page.on("pageerror", (error) => pageErrors.push(error.message));

  await stubServiceDocument(page);
  await page.goto(`${WEB_ORIGIN}/space-reservations`, { waitUntil: "domcontentloaded" });
  await loadContentBundle(page);

  const snapshot = await page.evaluate(() => ({
    bootstrapErrors: window.__zzkBootstrapLoadErrors || [],
    loadError: window.__zzkAvailabilityLensLoadError || null,
  }));

  expect(pageErrors).toEqual([]);
  expect(snapshot.bootstrapErrors).toEqual([]);
  expect(snapshot.loadError).toBeNull();
});
