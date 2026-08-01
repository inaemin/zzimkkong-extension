import fs from "node:fs";
import path from "node:path";
import { expect, test } from "@playwright/test";
import {
  WEB_ORIGIN,
  enableTestHooks,
  ensureExtensionBuild,
  loadContentBundle,
  stubServiceDocument,
} from "./helpers/extension.js";

test.beforeAll(ensureExtensionBuild);

test("playwright local setup works", async ({ page }) => {
  await page.goto("https://example.com", { waitUntil: "domcontentloaded" });
  await expect(page).toHaveTitle(/Example Domain/);
});

test("번들 진입점은 모듈 그래프에 맡기고 수동 나열을 하지 않는다", async () => {
  // 2.5-A 이전에는 전역 기반이라 진입점이 17개를 순서대로 import 했다.
  // 모듈 그래프로 바뀐 뒤로는 번들러가 순서를 판단하므로 나열이 되살아나면 안 된다.
  for (const entry of ["src/content-bundle.ts", "src/page-hook-bundle.ts"]) {
    const source = fs.readFileSync(path.resolve(process.cwd(), entry), "utf8");
    const imports = Array.from(source.matchAll(/^import "(\.\/[^"]+)";$/gm));
    expect(imports, `${entry} 는 진입점 하나만 import 해야 한다`).toHaveLength(1);
  }
});

test("background service worker reuses shared room policy constants", async () => {
  const backgroundSource = fs.readFileSync(
    path.resolve(process.cwd(), "src/background.ts"),
    "utf8",
  );

  // 서비스워커는 type:"module" 로 등록되므로 importScripts() 를 쓸 수 없다.
  // (쓰면 "Module scripts don't support importScripts()" 로 부팅이 통째로 깨진다)
  // 주석에 단어가 등장할 수 있으므로 실제 호출 형태만 본다.
  expect(backgroundSource).not.toMatch(/^\s*importScripts\s*\(/m);
  // 상수는 직접 정의하지 않고 constants/runtime.js 에서 가져다 쓴다.
  expect(backgroundSource).toMatch(/from "\.\/constants\/runtime\.js"/);
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
  await enableTestHooks(page);
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
      const api = window.__zzkTestApi;
      api.clearDebugEvents();
      const boolValue = api.storage.readStoredBoolean("zzk-test-bool", true);
      api.storage.writeStoredBoolean("zzk-test-bool", false);
      api.storage.writeStoredText("zzk-test-text", "");
      return {
        boolValue,
        events: api.getDebugEvents().filter((entry) => entry.scope === "storage"),
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
