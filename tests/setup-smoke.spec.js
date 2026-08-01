import fs from "node:fs";
import path from "node:path";
import { expect, test } from "@playwright/test";

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

test("content script reports missing bootstrap dependencies instead of throwing", async ({ page }) => {
  const pageErrors = [];
  page.on("pageerror", (error) => {
    pageErrors.push(error.message);
  });

  await page.goto("https://example.com/guest/test-map", { waitUntil: "domcontentloaded" });
  await page.addScriptTag({ path: path.resolve(process.cwd(), "src/content.js") });

  const snapshot = await page.evaluate(() => {
    return {
      loaded: window.__zzkAvailabilityLensLoaded === true,
      error: window.__zzkAvailabilityLensLoadError || null,
    };
  });

  expect(pageErrors).toEqual([]);
  expect(snapshot.loaded).toBeFalsy();
  expect(snapshot.error).toMatchObject({
    reason: "missing-bootstrap-dependencies",
  });
  expect(snapshot.error.missing).toContain("__zzkSharedUtils");
});

test("storage helpers report debug events when browser storage throws", async ({ page }) => {
  await page.goto("https://example.com/guest/test-map", { waitUntil: "domcontentloaded" });
  await page.evaluate(() => {
    window.__ZZK_DEBUG_MODE__ = true;
  });
  await page.addScriptTag({ path: path.resolve(process.cwd(), "src/constants/debug.js") });
  await page.addScriptTag({ path: path.resolve(process.cwd(), "src/utils/shared.js") });
  await page.addScriptTag({ path: path.resolve(process.cwd(), "src/utils/storage.js") });

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

const bootstrapConsumerCases = [
  {
    scriptPath: "src/utils/date-time.js",
    exportedGlobal: "__zzkDateTimeUtils",
    missing: ["__zzkSharedConstants", "__zzkSharedUtils"],
  },
  {
    scriptPath: "src/features/slack/shared.js",
    exportedGlobal: "__zzkSlackShared",
    missing: ["__zzkSharedConstants", "__zzkDateTimeUtils"],
  },
  {
    scriptPath: "src/features/form-fields/shared.js",
    exportedGlobal: "__zzkFormFieldUtils",
    missing: ["__zzkSharedUtils", "__zzkSlackShared", "__zzkSharedConstants"],
  },
  {
    scriptPath: "src/services/lms-data/shared.js",
    exportedGlobal: "__zzkLmsDataShared",
    missing: ["__zzkSharedConstants", "__zzkDateTimeUtils", "__zzkLmsDataNormalizers"],
  },
  {
    scriptPath: "src/page-network-hook.js",
    exportedGlobal: "__zzkReservationHookLoaded",
    missing: ["__zzkPageHookShared"],
  },
];

for (const { scriptPath, exportedGlobal, missing } of bootstrapConsumerCases) {
  test(`${scriptPath} reports missing bootstrap dependencies instead of throwing`, async ({ page }) => {
    const pageErrors = [];
    page.on("pageerror", (error) => {
      pageErrors.push(error.message);
    });

    await page.goto("https://example.com/guest/test-map", { waitUntil: "domcontentloaded" });
    await page.addScriptTag({ path: path.resolve(process.cwd(), scriptPath) });

    const snapshot = await page.evaluate((globalName) => {
      return {
        exported: Boolean(window[globalName]),
        errors: window.__zzkBootstrapLoadErrors || [],
      };
    }, exportedGlobal);

    expect(pageErrors).toEqual([]);
    expect(snapshot.exported).toBeFalsy();
    expect(snapshot.errors).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          script: scriptPath,
          reason: "missing-bootstrap-dependencies",
          missing: expect.arrayContaining(missing),
        }),
      ]),
    );
  });
}

test("zzimkkong guest route is reachable", async ({ page }) => {
  test.skip(process.env.ZZK_E2E !== "1", "Set ZZK_E2E=1 to run live zzimkkong checks.");

  await page.goto("/guest", { waitUntil: "domcontentloaded" });
  await expect(page).toHaveURL(/\/guest(?:\?.*)?$/);
});
