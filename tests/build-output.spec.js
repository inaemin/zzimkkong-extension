import fs from "node:fs";
import path from "node:path";
import { expect, test } from "@playwright/test";
import {
  API_ORIGIN,
  WEB_ORIGIN,
  ensureExtensionBuild,
  getContentBundlePath,
  getBackgroundBundlePath,
  loadBackgroundBundle,
  loadContentBundle,
  loadPageHookBundle,
  readBuiltManifest,
  stubServiceDocument,
} from "./helpers/extension.js";

// 2단계(빌드 도입) 회귀 가드.
// 번들 산출물이 기존 스크립트 나열 방식과 동일하게 부트스트랩되는지 확인한다.
// 로직/UI 는 그대로이므로 "동작 동일" 을 검증하는 게 목적이다.

const DIST_DIR = path.resolve(process.cwd(), "dist/extension");

test.beforeAll(ensureExtensionBuild);

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

test("직접 선언한 web_accessible_resources 가 없다", () => {
  // 예전에는 content.js 가 chrome.runtime.getURL 로 Slack 모달 CSS 를 불러와서
  // manifest 에 직접 자산을 공개했다. 지금은 모달이 shadow root 안에서 Tailwind
  // 를 쓰므로 우리가 공개할 자산이 없다.
  //
  // 목록 자체가 비진 않는다 — CRXJS 가 번들 청크를 자기 항목으로 넣는다. 그래서
  // "우리가 손으로 적은 자산" 만 없는지 본다. 다시 생긴다면 그 파일이 산출물에
  // 실제로 있는지도 함께 확인해야 한다.
  const manifest = readBuiltManifest();
  const resources = (manifest.web_accessible_resources ?? []).flatMap(
    (entry) => entry.resources ?? [],
  );

  const handWritten = resources.filter((resource) => !resource.startsWith("assets/"));
  expect(handWritten).toEqual([]);
  expect(resources).not.toContain("assets/basecoat-dialog.css");
  expect(fs.existsSync(path.join(DIST_DIR, "assets/basecoat-dialog.css"))).toBe(false);
});

// 패키징 스크립트가 "런타임에 직접 부르는 파일"을 검사하는데, 그 목록이 실제
// 산출물과 어긋나면 릴리스 태그를 밀 때서야 터진다(v1.0.0 에서 실제로 겪었다).
// CI 에서 미리 잡는다.
test("패키징이 요구하는 런타임 리소스가 실제로 존재한다", () => {
  const script = fs.readFileSync(
    path.resolve(process.cwd(), "scripts/package-extension.mjs"),
    "utf8",
  );
  const declared = script.match(/const runtimeLoadedPaths = \[([^\]]*)\]/)?.[1] ?? "";
  const paths = [...declared.matchAll(/"([^"]+)"/g)].map((match) => match[1]);

  for (const relativePath of paths) {
    expect(
      fs.existsSync(path.join(DIST_DIR, relativePath)),
      `패키징이 요구하는 ${relativePath} 가 빌드 산출물에 없다`,
    ).toBe(true);
  }
});

test("서비스워커 번들이 모듈로 실제 실행된다", async ({ page }) => {
  // CRXJS 는 서비스워커를 type:"module" 로 등록한다. ES 모듈에서 importScripts()
  // 를 쓰면 "Module scripts don't support importScripts()" 로 부팅이 통째로 깨진다.
  // 파일 존재만 확인하면 못 잡으므로 실제로 실행해 본다.
  const manifest = readBuiltManifest();
  const chunkPath = getBackgroundBundlePath();

  expect(manifest.background.type).toBe("module");
  // 산출물 어디에도 importScripts 가 남아 있으면 안 된다.
  expect(fs.readFileSync(chunkPath, "utf8")).not.toContain("importScripts");

  const pageErrors = [];
  page.on("pageerror", (error) => pageErrors.push(error.message));

  await stubServiceDocument(page);
  await page.goto(`${WEB_ORIGIN}/space-reservations`, { waitUntil: "domcontentloaded" });
  // 워커는 chrome.runtime.onMessage 로 리스너를 등록한다. 페이지에는 없으니 흉내낸다.
  await page.evaluate(() => {
    window.__zzkBackgroundListeners = [];
    window.chrome = {
      runtime: {
        onMessage: {
          addListener(listener) {
            window.__zzkBackgroundListeners.push(listener);
          },
        },
      },
    };
  });
  await loadBackgroundBundle(page);

  // 부팅이 깨지면 import 단계에서 예외가 나므로 pageerror 로 잡힌다.
  // (importScripts 를 쓰면 "Module scripts don't support importScripts()" 가 여기 뜬다)
  // 2.5-A 이후 전역 배럴이 없어 전역 존재로는 확인할 수 없다.
  expect(pageErrors).toEqual([]);

  // 메시지 리스너를 등록했는지로 실제 초기화 완료를 확인한다.
  const registeredListener = await page.evaluate(
    () =>
      Array.isArray(window.__zzkBackgroundListeners) && window.__zzkBackgroundListeners.length > 0,
  );
  expect(registeredListener).toBeTruthy();
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
  await loadPageHookBundle(page);

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
  await loadContentBundle(page);

  // 2.5-A 이후 모듈 그래프로 연결되므로 전역 배럴은 더 이상 없다.
  // 번들이 정상 부팅했는지는 로드 플래그와 테스트 API 로 확인한다.
  const snapshot = await page.evaluate(() => ({
    loaded: window.__zzkAvailabilityLensLoaded === true,
    loadError: window.__zzkAvailabilityLensLoadError || null,
    bootstrapErrors: window.__zzkBootstrapLoadErrors || [],
    missing: [],
  }));

  expect(pageErrors).toEqual([]);
  expect(snapshot.loadError).toBeNull();
  expect(snapshot.bootstrapErrors).toEqual([]);
  expect(snapshot.missing).toEqual([]);
  expect(snapshot.loaded).toBeTruthy();
});

test("번들된 content script 가 레이더 UI 를 실제로 마운트한다", async ({ page }) => {
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
  await loadContentBundle(page);

  // 스크립트 나열 방식과 동일하게 런처와 오버레이가 뜬다.
  await expect
    .poll(() =>
      page.evaluate(() => Boolean(document.getElementById("zzk-map-calendar-radar-launcher"))),
    )
    .toBe(true);
  await expect
    .poll(() => page.evaluate(() => Boolean(document.getElementById("zzk-map-calendar-overlay"))))
    .toBe(true);
});

// Slack 모달 테스트 버튼은 개발 빌드 전용이다. 배포 빌드(`npm run build`)에서는
// DEV_BUILD 가 false 리터럴로 박혀 버튼이 붙지 않아야 한다.
//
// 테스트 스위트는 기본 빌드(= 배포 모드)를 쓰므로 여기서 확인할 수 있다.
test("배포 빌드에는 개발 플래그가 꺼진 채로 박힌다", () => {
  const bundle = fs.readFileSync(getContentBundlePath(), "utf8");

  // vite define 이 리터럴로 치환한다. true 로 박히면 사용자에게 테스트 버튼이 보인다.
  expect(bundle).toContain("DEV_BUILD: false");
  expect(bundle).not.toContain("DEV_BUILD: true");
});
