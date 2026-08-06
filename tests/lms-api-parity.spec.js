import path from "node:path";
import { expect, test } from "@playwright/test";
import { ensureExtensionBuild, loadBackgroundBundle } from "./helpers/extension.js";

test.beforeAll(ensureExtensionBuild);

// background.js 는 서비스워커 밖에서는 importScripts 가 없어 전역이 미리 올라와 있어야 한다.
const SCRIPT_ORDER_FOR_LMS_DATA = [
  "src/utils/shared.js",
  "src/constants/runtime.js",
  "src/utils/date-time.js",
  "src/utils/routes.js",
  "src/services/lms-data/normalizers.js",
  "src/services/lms-data/shared.js",
];

const API_ORIGIN = "https://techcourse-lms-plus-api.woowahan.com";
const WEB_ORIGIN = "https://techcourse-lms-plus-web.woowahan.com";

// 개편 서비스 실제 응답 형태를 그대로 옮긴 픽스처.
const spacesFixture = [
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
  {
    accessRole: "ALL",
    active: true,
    closeTime: "23:00:00",
    floor: 13,
    id: 9,
    maxReservationMinutes: 60,
    name: "은하수",
    openTime: "07:00:00",
    reservationUnitMinutes: 30,
  },
  {
    accessRole: "ALL",
    active: true,
    closeTime: "23:00:00",
    floor: 13,
    id: 10,
    maxReservationMinutes: 60,
    name: "페어룸 01",
    openTime: "07:00:00",
    reservationUnitMinutes: 30,
  },
  // active:false 공간은 레이더에서 제외되어야 한다.
  {
    accessRole: "ALL",
    active: false,
    closeTime: "23:00:00",
    floor: 11,
    id: 77,
    maxReservationMinutes: 60,
    name: "수성",
    openTime: "07:00:00",
    reservationUnitMinutes: 30,
  },
];

const reservationsBySpaceId = {
  9: [
    {
      date: "2099-01-02",
      endTime: "11:30:00",
      floor: 13,
      id: 139,
      mine: false,
      purpose: "회의",
      reserverName: "모카(최영철)",
      spaceId: 9,
      spaceName: "은하수",
      startTime: "10:30:00",
    },
    {
      date: "2099-01-02",
      endTime: "14:30:00",
      floor: 13,
      id: 132,
      mine: true,
      purpose: "근로 회의",
      reserverName: "마이찬(나의찬)",
      spaceId: 9,
      spaceName: "은하수",
      startTime: "13:30:00",
    },
  ],
  1: [],
  10: [],
};

const quotaFixture = {
  unlimited: false,
  dailyLimitMinutes: 180,
  dailyUsedMinutes: 0,
  dailyRemainingMinutes: 180,
  monthlyLimitMinutes: 1200,
  monthlyUsedMinutes: 0,
  monthlyRemainingMinutes: 1200,
};

// 실제 사이트는 미인증 요청을 로그인 페이지로 돌려보내므로, 경로 판별을 검증하려면
// 문서 응답을 빈 HTML 로 고정해 /space-reservations 에 머무르게 한다.
async function stubServiceDocument(page) {
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

async function routeLmsApi(page) {
  await page.route(`${API_ORIGIN}/api/**`, async (route) => {
    const url = new URL(route.request().url());
    let body = null;

    if (url.pathname === "/api/spaces") {
      body = spacesFixture;
    } else if (url.pathname === "/api/space-reservations/quota") {
      body = quotaFixture;
    } else if (url.pathname === "/api/space-reservations") {
      const spaceId = url.searchParams.get("spaceId");
      body = reservationsBySpaceId[spaceId] || [];
    }

    if (!body) {
      await route.fulfill({
        status: 404,
        headers: {
          "access-control-allow-origin": WEB_ORIGIN,
          "access-control-allow-credentials": "true",
          "content-type": "application/json",
        },
        body: JSON.stringify({ message: "not found" }),
      });
      return;
    }

    await route.fulfill({
      status: 200,
      headers: {
        // credentials: "include" 요청은 와일드카드 origin 을 허용하지 않는다.
        "access-control-allow-origin": WEB_ORIGIN,
        "access-control-allow-credentials": "true",
        "content-type": "application/json",
      },
      body: JSON.stringify(body),
    });
  });
}

async function loadLmsDataScripts(page) {
  for (const scriptPath of SCRIPT_ORDER_FOR_LMS_DATA) {
    await page.addScriptTag({ path: path.resolve(process.cwd(), scriptPath) });
  }
}

async function loadBackgroundScript(page) {
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
  // background.js 는 이제 ES 모듈(type:"module" 서비스워커)이라 소스 주입이 안 된다.
  // 빌드된 워커 청크를 실제 모듈 그래프대로 로드한다.
  await loadBackgroundBundle(page);
}

async function sendBackgroundMessage(page, message) {
  return page.evaluate((runtimeMessage) => {
    const listener = window.__zzkBackgroundListeners?.[0];
    if (typeof listener !== "function") {
      throw new Error("background listener was not registered");
    }

    return new Promise((resolve) => {
      listener(runtimeMessage, {}, resolve);
    });
  }, message);
}

test.beforeEach(async ({ page }) => {
  await stubServiceDocument(page);
  await page.goto("https://techcourse-lms-plus-web.woowahan.com/space-reservations", {
    waitUntil: "domcontentloaded",
  });
  await routeLmsApi(page);
  await loadLmsDataScripts(page);
  await loadBackgroundScript(page);
});

test("route utils treat the lms+ reservation page as radar-supported", async ({ page }) => {
  const snapshot = await page.evaluate(() => ({
    isReservationPage: window.__zzkRouteUtils.isLmsSpaceReservationPage(),
    supported: window.__zzkRouteUtils.isRadarSupportedPage(),
    sharingMapId: window.__zzkRouteUtils.getSharingMapId(),
  }));

  expect(snapshot).toEqual({
    isReservationPage: true,
    supported: true,
    sharingMapId: "lms",
  });
});

test("lms daily schedule normalizes reservations and sorts rooms by server floor", async ({ page }) => {
  const payload = {
    serviceKind: "lms",
    date: "2099-01-02",
    roomType: null,
  };

  const [backgroundResponse, directData] = await Promise.all([
    sendBackgroundMessage(page, { type: "ZZK_FETCH_DAILY_SCHEDULE", payload }),
    page.evaluate((directPayload) => {
      return window.__zzkLmsDataShared.fetchDailySchedule(directPayload);
    }, payload),
  ]);

  expect(backgroundResponse).toEqual({ ok: true, data: directData });

  // active:false 인 수성(77)은 빠지고, 11층 -> 13층 순으로 정렬된다.
  expect(directData.rooms.map((room) => room.id)).toEqual([1, 9, 10]);
  expect(directData.rooms.map((room) => room.floorLabel)).toEqual(["11층", "13층", "13층"]);

  expect(directData.rooms[1]).toEqual(
    expect.objectContaining({
      id: 9,
      name: "은하수",
      windowStartMinute: 420,
      windowEndMinute: 1380,
      reservations: [
        {
          id: 139,
          title: "회의",
          owner: "모카(최영철)",
          mine: false,
          startMinute: 630,
          endMinute: 690,
          startTime: "10:30",
          endTime: "11:30",
        },
        {
          id: 132,
          title: "근로 회의",
          owner: "마이찬(나의찬)",
          mine: true,
          startMinute: 810,
          endMinute: 870,
          startTime: "13:30",
          endTime: "14:30",
        },
      ],
    }),
  );

  // lms+ 는 30분 단위 타임블록을 쓴다.
  expect(directData.range).toEqual({
    startMinute: 420,
    endMinute: 1380,
    slotMinutes: 30,
    startTime: "07:00",
    endTime: "23:00",
  });
  // 07:00, 07:30, 08:00 ... 순으로 30분 간격 슬롯이어야 한다.
  expect(directData.timeline[0]).toEqual({
    startMinute: 420,
    endMinute: 450,
    label: "07:00",
    isHourMark: true,
  });
  expect(directData.timeline[1]).toEqual({
    startMinute: 450,
    endMinute: 480,
    label: "07:30",
    isHourMark: false,
  });
});

test("lms availability is derived from overlapping reservations", async ({ page }) => {
  // 은하수(9)는 10:30~11:30 예약이 있어 겹치는 구간에서는 예약 불가여야 한다.
  const payload = {
    serviceKind: "lms",
    date: "2099-01-02",
    startTime: "11:00",
    endTime: "12:00",
    roomType: null,
  };

  const [backgroundResponse, directData] = await Promise.all([
    sendBackgroundMessage(page, { type: "ZZK_FETCH_AVAILABILITY", payload }),
    page.evaluate((directPayload) => {
      return window.__zzkLmsDataShared.fetchAvailability(directPayload);
    }, payload),
  ]);

  expect(backgroundResponse).toEqual({ ok: true, data: directData });
  expect(directData.counts).toEqual({ total: 3, available: 2, occupied: 1 });
  expect(directData.rooms.find((room) => room.id === 9).isAvailable).toBe(false);
  expect(directData.rooms.find((room) => room.id === 1).isAvailable).toBe(true);
});

test("lms availability treats a window touching a reservation edge as free", async ({ page }) => {
  // 11:30~12:00 은 10:30~11:30 예약과 경계만 맞닿으므로 겹치지 않는다.
  const directData = await page.evaluate(() => {
    return window.__zzkLmsDataShared.fetchAvailability({
      serviceKind: "lms",
      date: "2099-01-02",
      startTime: "11:30",
      endTime: "12:00",
      roomType: null,
    });
  });

  expect(directData.rooms.find((room) => room.id === 9).isAvailable).toBe(true);
  expect(directData.counts).toEqual({ total: 3, available: 3, occupied: 0 });
});

test("lms quota response is normalized", async ({ page }) => {
  const quota = await page.evaluate(() => {
    return window.__zzkLmsDataShared.fetchQuota({ date: "2099-01-02" });
  });

  expect(quota).toEqual({
    unlimited: false,
    dailyLimitMinutes: 180,
    dailyUsedMinutes: 0,
    dailyRemainingMinutes: 180,
    monthlyLimitMinutes: 1200,
    monthlyUsedMinutes: 0,
    monthlyRemainingMinutes: 1200,
  });
});
