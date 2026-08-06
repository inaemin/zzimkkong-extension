import { expect, test } from "@playwright/test";
import {
  API_ORIGIN,
  WEB_ORIGIN,
  ensureExtensionBuild,
  enableTestHooks,
  jsonResponse,
  loadContentBundle,
  stubServiceDocument,
} from "./helpers/extension.js";

// 예약 현황(availability)은 회의실 수만큼 /api/space-reservations 를 부른다.
// 타임블록을 연속으로 누르면 그때마다 전량 재조회되므로 3초 TTL 로 재사용한다.

test.beforeAll(ensureExtensionBuild);

const SPACES = [1, 2, 3].map((id) => ({
  accessRole: "ALL",
  active: true,
  closeTime: "23:00:00",
  floor: 11,
  id,
  maxReservationMinutes: 60,
  name: ["금성", "수성", "지구"][id - 1],
  openTime: "07:00:00",
  reservationUnitMinutes: 30,
}));

async function mountWithRequestCounter(page) {
  await enableTestHooks(page);
  await stubServiceDocument(page);

  const reservationRequests = [];
  await page.route(`${API_ORIGIN}/api/**`, async (route) => {
    const url = new URL(route.request().url());
    if (url.pathname === "/api/space-reservations") {
      reservationRequests.push(url.searchParams.get("spaceId"));
    }
    await route.fulfill(jsonResponse(url.pathname === "/api/spaces" ? SPACES : []));
  });

  await page.goto(`${WEB_ORIGIN}/space-reservations`, { waitUntil: "domcontentloaded" });
  await loadContentBundle(page);
  await page.waitForSelector("#zzk-map-calendar-overlay .zzk-map-calendar-row", {
    timeout: 6000,
  });

  return reservationRequests;
}

test("TTL 안에 같은 조건으로 다시 조회하면 회의실별 요청을 다시 보내지 않는다", async ({
  page,
}) => {
  const reservationRequests = await mountWithRequestCounter(page);

  const afterMount = reservationRequests.length;
  expect(afterMount).toBeGreaterThan(0);

  // 같은 날짜·시간·탭으로 즉시 재조회 → 캐시 히트라 요청이 늘지 않아야 한다.
  await page.evaluate(() => window.__zzkTestApi?.refreshAvailability?.());
  await page.waitForTimeout(300);

  expect(reservationRequests.length).toBe(afterMount);
});

test("TTL 이 지나면 다시 조회한다", async ({ page }) => {
  const reservationRequests = await mountWithRequestCounter(page);
  const afterMount = reservationRequests.length;

  // RESERVATION_SCHEDULE_STALE_MS(3초)를 넘긴 뒤에는 캐시가 만료된다.
  await page.waitForTimeout(3200);
  await page.evaluate(() => window.__zzkTestApi?.refreshAvailability?.());
  await page.waitForTimeout(500);

  expect(reservationRequests.length).toBeGreaterThan(afterMount);
});

test("응답 도착 전에 연속으로 눌러도 회의실별 요청이 중복되지 않는다", async ({ page }) => {
  await enableTestHooks(page);
  await stubServiceDocument(page);

  const reservationRequests = [];
  let releaseReservations = null;
  const gate = new Promise((resolve) => {
    releaseReservations = resolve;
  });

  await page.route(`${API_ORIGIN}/api/**`, async (route) => {
    const url = new URL(route.request().url());
    if (url.pathname === "/api/space-reservations") {
      reservationRequests.push(url.searchParams.get("spaceId"));
      // 첫 배치를 붙잡아 두고 그 사이에 클릭이 더 들어오게 한다.
      await gate;
    }
    await route.fulfill(jsonResponse(url.pathname === "/api/spaces" ? SPACES : []));
  });

  await page.goto(`${WEB_ORIGIN}/space-reservations`, { waitUntil: "domcontentloaded" });
  await loadContentBundle(page);

  // 응답이 막혀 있는 동안 추가로 여러 번 조회를 요청한다.
  await page.evaluate(() => {
    window.__zzkTestApi?.refreshAvailability?.();
    window.__zzkTestApi?.refreshAvailability?.();
    window.__zzkTestApi?.refreshAvailability?.();
  });
  await page.waitForTimeout(200);

  const duringFlight = reservationRequests.length;
  releaseReservations();
  await page.waitForTimeout(600);

  // 회의실 하나당 정확히 한 번씩만 나가야 한다.
  // (availability 와 dailySchedule 이 같은 엔드포인트를 부르므로 캐시가 없으면 2배가 된다)
  expect(duringFlight).toBe(SPACES.length);
  expect(reservationRequests.length).toBe(SPACES.length);
  expect(new Set(reservationRequests).size).toBe(SPACES.length);
});

test("예약 성공 시 TTL 을 기다리지 않고 캐시가 즉시 무효화된다", async ({ page }) => {
  const reservationRequests = await mountWithRequestCounter(page);
  const afterMount = reservationRequests.length;

  // TTL(3초) 안이라 그냥 재조회하면 캐시 히트여야 한다.
  await page.evaluate(() => window.__zzkTestApi?.refreshAvailability?.());
  await page.waitForTimeout(200);
  expect(reservationRequests.length).toBe(afterMount);

  // 예약 생성 성공 이벤트를 페이지 훅이 보낸 것처럼 흘려보낸다.
  await page.evaluate(() => {
    window.postMessage(
      {
        source: "zzk-page-reservation-hook",
        type: "ZZK_RESERVATION_NETWORK_EVENT",
        payload: {
          via: "fetch",
          ok: true,
          status: 201,
          method: "POST",
          url: "https://techcourse-lms-plus-api.woowahan.com/api/space-reservations",
          responseBody: {
            id: 1,
            spaceId: 1,
            spaceName: "금성",
            floor: 11,
            date: "2099-01-02",
            startTime: "10:00:00",
            endTime: "11:00:00",
            purpose: "학습",
            reserverName: "애니",
          },
        },
      },
      "*",
    );
  });
  await page.waitForTimeout(200);

  // 무효화됐으므로 TTL 이 안 지났어도 다시 조회한다.
  await page.evaluate(() => window.__zzkTestApi?.refreshAvailability?.());
  await page.waitForTimeout(500);

  expect(reservationRequests.length).toBeGreaterThan(afterMount);
});
