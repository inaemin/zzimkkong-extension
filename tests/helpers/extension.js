import fs from "node:fs";
import path from "node:path";
import { execFileSync } from "node:child_process";

// 테스트 공용 하네스.
//
// 예전에는 각 스펙이 manifest 의 스크립트 목록을 그대로 베껴 addScriptTag 로
// 한 파일씩 주입했다. 소스가 ES 모듈이 되면 그 방식은 동작하지 않고, 무엇보다
// "실제로 배포되는 것"이 아니라 "소스 파일"을 검증하게 된다.
// 이제는 빌드 산출물(dist/extension)을 로드해 실제 배포 형태를 검증한다.

export const WEB_ORIGIN = "https://techcourse-lms-plus-web.woowahan.com";
export const API_ORIGIN = "https://techcourse-lms-plus-api.woowahan.com";

const DIST_DIR = path.resolve(process.cwd(), "dist/extension");

let buildPromise = null;

// 스펙마다 빌드하면 느리므로 프로세스당 한 번만 빌드한다.
export function ensureExtensionBuild() {
  if (!buildPromise) {
    buildPromise = new Promise((resolve, reject) => {
      try {
        execFileSync("npx", ["vite", "build"], { cwd: process.cwd(), stdio: "pipe" });
        resolve();
      } catch (error) {
        reject(error);
      }
    });
  }
  return buildPromise;
}

export function readBuiltManifest() {
  return JSON.parse(fs.readFileSync(path.join(DIST_DIR, "manifest.json"), "utf8"));
}

export function resolveBuiltPath(relativePath) {
  return path.join(DIST_DIR, relativePath);
}

// isolated world 에서 도는 메인 번들(레이더 UI 전체).
export function getContentBundlePath() {
  const manifest = readBuiltManifest();
  const entry = manifest.content_scripts.find((script) => script.world !== "MAIN");
  return path.join(DIST_DIR, entry.js[0]);
}

// MAIN world 에서 도는 예약 네트워크 훅.
export function getPageHookBundlePath() {
  const manifest = readBuiltManifest();
  const entry = manifest.content_scripts.find((script) => script.world === "MAIN");
  return path.join(DIST_DIR, entry.js[0]);
}

// 실제 사이트는 미인증 요청을 로그인 페이지로 돌려보내므로 문서 응답을 고정한다.
export async function stubServiceDocument(page, body = "<html><body><main></main></body></html>") {
  await page.route(`${WEB_ORIGIN}/**`, async (route) => {
    if (route.request().resourceType() !== "document") {
      await route.continue();
      return;
    }
    await route.fulfill({ status: 200, contentType: "text/html", body });
  });
}

export function jsonResponse(body, status = 200) {
  return {
    status,
    headers: {
      // credentials: "include" 요청은 와일드카드 origin 을 허용하지 않는다.
      "access-control-allow-origin": WEB_ORIGIN,
      "access-control-allow-credentials": "true",
      "content-type": "application/json",
    },
    body: typeof body === "string" ? body : JSON.stringify(body),
  };
}

// /api/spaces 는 spaces 를, 나머지는 빈 배열을 준다.
export async function stubLmsApi(page, { spaces = [], handler = null } = {}) {
  await page.route(`${API_ORIGIN}/api/**`, async (route) => {
    if (typeof handler === "function") {
      const handled = await handler(route);
      if (handled) {
        return;
      }
    }
    const url = new URL(route.request().url());
    await route.fulfill(jsonResponse(url.pathname === "/api/spaces" ? spaces : []));
  });
}

// content.js 는 실제 lms+ 호스트에서 테스트 훅을 감추므로 명시적으로 열어준다.
export async function enableTestHooks(page) {
  await page.addInitScript(() => {
    window.__ZZK_TEST_HOOKS__ = true;
  });
}

// 빌드된 content 번들을 로드하고 부트스트랩 완료까지 기다린다.
export async function loadContentBundle(page, { timeout = 5000 } = {}) {
  await page.addScriptTag({ path: getContentBundlePath(), type: "module" });
  await page.waitForFunction(() => window.__zzkAvailabilityLensLoaded === true, undefined, {
    timeout,
  });
}

export async function loadPageHookBundle(page) {
  await page.addScriptTag({ path: getPageHookBundlePath(), type: "module" });
}

// 가장 흔한 셋업: 문서 스텁 + API 스텁 + 예약 페이지 이동 + 번들 로드.
export async function mountReservationPage(page, { spaces = [], handler = null, testHooks = true } = {}) {
  if (testHooks) {
    await enableTestHooks(page);
  }
  await stubServiceDocument(page);
  await stubLmsApi(page, { spaces, handler });
  await page.goto(`${WEB_ORIGIN}/space-reservations`, { waitUntil: "domcontentloaded" });
  await loadContentBundle(page);
}
