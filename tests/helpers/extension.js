import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

// 테스트 공용 하네스.
//
// 예전에는 각 스펙이 manifest 의 스크립트 목록을 그대로 베껴 addScriptTag 로
// 한 파일씩 주입했다. 소스가 ES 모듈이 되면 그 방식은 동작하지 않고, 무엇보다
// "실제로 배포되는 것"이 아니라 "소스 파일"을 검증하게 된다.
// 이제는 빌드 산출물(dist/extension)을 로드해 실제 배포 형태를 검증한다.

export const WEB_ORIGIN = "https://techcourse-lms-plus-web.woowahan.com";
export const API_ORIGIN = "https://techcourse-lms-plus-api.woowahan.com";

const DIST_DIR = path.resolve(process.cwd(), "dist/extension");

// 빌드는 playwright globalSetup 이 전체에서 한 번만 수행한다.
// 스펙들이 이미 beforeAll(ensureExtensionBuild) 를 걸어두고 있어 호환용으로 남긴다.
export function ensureExtensionBuild() {}

export function readBuiltManifest() {
  return JSON.parse(fs.readFileSync(path.join(DIST_DIR, "manifest.json"), "utf8"));
}

export function resolveBuiltPath(relativePath) {
  return path.join(DIST_DIR, relativePath);
}

// CRXJS 는 content script 를 로더 + 실제 청크로 쪼갤 수 있다.
// 로더는 chrome.runtime.getURL 로 청크를 동적 import 하므로 실제 확장에서는
// 정상 동작하지만, 테스트는 확장 컨텍스트 없이 파일 경로로 주입하기 때문에
// 로더 대신 실제 청크를 찾아 로드해야 한다.
function resolveRealChunk(entryRelativePath) {
  const entryPath = path.join(DIST_DIR, entryRelativePath);
  const source = fs.readFileSync(entryPath, "utf8");
  const loaderMatch = source.match(/chrome\.runtime\.getURL\(\s*["']([^"']+)["']\s*\)/);
  return loaderMatch ? path.join(DIST_DIR, loaderMatch[1]) : entryPath;
}

// isolated world 에서 도는 메인 번들(레이더 UI 전체).
export function getContentBundlePath() {
  const manifest = readBuiltManifest();
  const entry = manifest.content_scripts.find((script) => script.world !== "MAIN");
  return resolveRealChunk(entry.js[0]);
}

// MAIN world 에서 도는 예약 네트워크 훅.
export function getPageHookBundlePath() {
  const manifest = readBuiltManifest();
  const entry = manifest.content_scripts.find((script) => script.world === "MAIN");
  return resolveRealChunk(entry.js[0]);
}

// 서비스워커 로더가 가리키는 실제 청크.
export function getBackgroundBundlePath() {
  const manifest = readBuiltManifest();
  const loaderPath = path.join(DIST_DIR, manifest.background.service_worker);
  const source = fs.readFileSync(loaderPath, "utf8");
  const match = source.match(/import\s+["']\.\/([^"']+)["']/);
  return match ? path.join(DIST_DIR, match[1]) : loaderPath;
}

// lms+ 가 실제로 서빙하는 스타일시트. 호스트도 shadcn/Tailwind 를 쓰기 때문에
// .bg-background 같은 유틸리티 이름이 우리 것과 겹친다. 이게 없으면 우리 CSS 끼리만
// 겨루게 돼, 실제 페이지에서만 나는 우선순위 문제를 테스트가 놓친다.
// (예: 호스트의 .bg-background 가 우리 in-data-[...]:bg-transparent 를 이겨
//  달력 배경이 남던 문제.)
const HOST_PAGE_CSS = fs.readFileSync(
  path.join(path.dirname(fileURLToPath(import.meta.url)), "..", "fixtures", "host-page.css"),
  "utf8",
);

const DEFAULT_SERVICE_DOCUMENT = `<html><head><style>${HOST_PAGE_CSS}</style></head><body><main></main></body></html>`;

// 레이더 오버레이는 shadow root 안에 있다. document 쿼리로는 안 잡히므로,
// 페이지 안에서 쓸 조회 헬퍼를 심어준다.
//
// Playwright 로케이터(page.locator/click/hover)는 open shadow root 를 자동으로
// 뚫으므로 그대로 두면 된다. 문제는 page.evaluate 안의 document.querySelector 다.
export async function installRadarQueryHelpers(page) {
  await page.evaluate(() => {
    const overlayId = "zzk-map-calendar-overlay";

    /** 오버레이 호스트 엘리먼트(위치·transform 은 여기에 있다). */
    window.__zzkHost = () => document.getElementById(overlayId);

    /** 오버레이 shadow root. 없으면 null. */
    window.__zzkRoot = () => document.getElementById(overlayId)?.shadowRoot ?? null;

    /** 오버레이 안에서 하나 찾기. */
    window.__zzkQuery = (selector) => window.__zzkRoot()?.querySelector(selector) ?? null;

    /** 오버레이 안에서 모두 찾기(배열). */
    window.__zzkQueryAll = (selector) => [...(window.__zzkRoot()?.querySelectorAll(selector) ?? [])];

  });
}

// 실제 사이트는 미인증 요청을 로그인 페이지로 돌려보내므로 문서 응답을 고정한다.
export async function stubServiceDocument(page, body = DEFAULT_SERVICE_DOCUMENT) {
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

// 번들 청크가 형제 청크를 상대 경로로 import 할 수 있다(공유 청크 분리).
// 실제 확장은 chrome.runtime.getURL 로 풀지만 테스트에는 확장 컨텍스트가 없으므로,
// dist/extension 을 페이지 오리진 아래로 서빙해 모듈 그래프가 그대로 풀리게 한다.
const DIST_ROUTE_PREFIX = "/__dist__/";

// Playwright 는 나중에 등록된 라우트를 먼저 평가한다. 스펙이 자체적으로
// `${WEB_ORIGIN}/**` 를 걸면 dist 요청까지 가로채므로, 번들을 로드하는 시점에
// 매번 다시 등록해 항상 가장 마지막(=우선순위 1위)이 되게 한다.
export async function serveBuiltAssets(page) {
  await page.route(`${WEB_ORIGIN}${DIST_ROUTE_PREFIX}**`, async (route) => {
    const url = new URL(route.request().url());
    const relative = decodeURIComponent(url.pathname.slice(DIST_ROUTE_PREFIX.length));
    const filePath = resolveBuiltPath(relative);
    if (!fs.existsSync(filePath)) {
      await route.fulfill({ status: 404, body: "" });
      return;
    }
    await route.fulfill({
      status: 200,
      headers: { "content-type": "text/javascript" },
      body: fs.readFileSync(filePath, "utf8"),
    });
  });
}

async function importBuiltModule(page, absolutePath) {
  await serveBuiltAssets(page);
  const relative = path.relative(DIST_DIR, absolutePath).split(path.sep).join("/");
  await page.evaluate(
    async ({ origin, prefix, name }) => {
      await import(`${origin}${prefix}${name}`);
    },
    { origin: WEB_ORIGIN, prefix: DIST_ROUTE_PREFIX, name: relative },
  );
}

// 빌드된 content 번들을 로드하고 부트스트랩 완료까지 기다린다.
export async function loadContentBundle(page, { timeout = 5000 } = {}) {
  await importBuiltModule(page, getContentBundlePath());
  await page.waitForFunction(() => window.__zzkAvailabilityLensLoaded === true, undefined, {
    timeout,
  });
  // 모든 스펙이 이 함수를 거치므로 여기서 조회 헬퍼를 심는다.
  // (일부 스펙은 stubServiceDocument 대신 자체 page.route 를 쓴다.)
  await installRadarQueryHelpers(page);
}

export async function loadPageHookBundle(page) {
  await importBuiltModule(page, getPageHookBundlePath());
}

export async function loadBackgroundBundle(page) {
  await importBuiltModule(page, getBackgroundBundlePath());
}

// 가장 흔한 셋업: 문서 스텁 + API 스텁 + 예약 페이지 이동 + 번들 로드.
export async function mountReservationPage(
  page,
  { spaces = [], handler = null, testHooks = true } = {},
) {
  if (testHooks) {
    await enableTestHooks(page);
  }
  await stubServiceDocument(page);
  await stubLmsApi(page, { spaces, handler });
  await page.goto(`${WEB_ORIGIN}/space-reservations`, { waitUntil: "domcontentloaded" });
  await loadContentBundle(page);
}
