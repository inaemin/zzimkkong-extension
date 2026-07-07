import path from "node:path";
import { expect, test } from "@playwright/test";

const SCRIPT_ORDER_FOR_DIRECT_GUEST_DATA = [
  "src/utils/shared.js",
  "src/constants/runtime.js",
  "src/utils/date-time.js",
  "src/services/guest-data/normalizers.js",
  "src/services/guest-data/shared.js",
];

const API_ORIGIN = "https://k8s.zzimkkong.com";

const apiFixtures = {
  map: { mapId: 234, mapName: "우아한 회의실" },
  spaces: {
    spaces: [
      {
        id: 3,
        name: "지구",
        color: "#2563EB",
        reservationEnable: true,
        settings: [
          { settingStartTime: "09:00:00", settingEndTime: "18:30:00" },
        ],
      },
      {
        id: 4,
        name: "금성",
        color: "#F97316",
        reservationEnable: true,
        settings: [
          { settingStartTime: "08:30:00", settingEndTime: "17:00:00" },
        ],
      },
      {
        id: 15,
        name: "페1",
        color: "#10B981",
        reservationEnable: true,
        settings: [
          { settingStartTime: "10:00:00", settingEndTime: "20:00:00" },
        ],
      },
      {
        id: 99,
        name: "대상 아님",
        color: "#111827",
        reservationEnable: true,
        settings: [
          { settingStartTime: "07:00:00", settingEndTime: "23:00:00" },
        ],
      },
    ],
  },
  availability: {
    spaces: [
      { spaceId: 3, isAvailable: false },
      { spaceId: 4, isAvailable: true },
      { spaceId: 15, isAvailable: true },
    ],
  },
  reservationsBySpaceId: {
    3: {
      reservations: [
        {
          id: 301,
          description: " 지구 회의 ",
          name: " 토리 ",
          startDateTime: "2099-01-02T01:30:00.000Z",
          endDateTime: "2099-01-02T02:20:00.000Z",
        },
      ],
    },
    4: {
      reservations: [
        {
          id: 401,
          description: "",
          name: "",
          startDateTime: "2099-01-02T00:00:00.000Z",
          endDateTime: "2099-01-02T01:00:00.000Z",
        },
      ],
    },
    15: {
      reservations: [
        {
          id: 1501,
          description: "페어룸 세션",
          name: "푸",
          startDateTime: "2099-01-02T03:00:00.000Z",
          endDateTime: "2099-01-02T04:00:00.000Z",
        },
      ],
    },
  },
};

async function routeGuestApi(page) {
  await page.route(`${API_ORIGIN}/api/guests/**`, async (route) => {
    const url = new URL(route.request().url());
    let body = null;

    if (url.pathname === "/api/guests/maps") {
      body = apiFixtures.map;
    } else if (url.pathname === "/api/guests/maps/234/spaces") {
      body = apiFixtures.spaces;
    } else if (url.pathname === "/api/guests/maps/234/spaces/availability") {
      body = apiFixtures.availability;
    } else {
      const reservationsMatch = url.pathname.match(
        /^\/api\/guests\/maps\/234\/spaces\/(\d+)\/reservations$/,
      );
      if (reservationsMatch) {
        body = apiFixtures.reservationsBySpaceId[reservationsMatch[1]] || {
          reservations: [],
        };
      }
    }

    if (!body) {
      await route.fulfill({ status: 404, body: JSON.stringify({ message: "not found" }) });
      return;
    }

    await route.fulfill({
      status: 200,
      headers: {
        "access-control-allow-origin": "*",
        "content-type": "application/json",
      },
      body: JSON.stringify(body),
    });
  });
}

async function loadGuestDataScripts(page) {
  for (const scriptPath of SCRIPT_ORDER_FOR_DIRECT_GUEST_DATA) {
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
  await page.addScriptTag({ path: path.resolve(process.cwd(), "src/background.js") });
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
  await page.goto("https://example.com/guest/parity", { waitUntil: "domcontentloaded" });
  await routeGuestApi(page);
  await loadGuestDataScripts(page);
  await loadBackgroundScript(page);
});

test("background availability response matches direct fallback response", async ({ page }) => {
  const payload = {
    sharingMapId: " abc ",
    date: "2099-01-02",
    startTime: "09:00",
    endTime: "10:30",
    roomType: "meeting",
  };

  const [backgroundResponse, directData] = await Promise.all([
    sendBackgroundMessage(page, { type: "ZZK_FETCH_AVAILABILITY", payload }),
    page.evaluate((directPayload) => {
      return window.__zzkGuestDataShared.fetchAvailabilityDirect(directPayload);
    }, payload),
  ]);

  expect(backgroundResponse).toEqual({ ok: true, data: directData });
  expect(directData).toEqual(
    expect.objectContaining({
      mapId: 234,
      mapName: "우아한 회의실",
      selectedWindow: { date: "2099-01-02", startTime: "09:00", endTime: "10:30" },
      roomType: "meeting",
      counts: { total: 3, available: 1, occupied: 2 },
      rooms: [
        { id: 4, name: "금성", color: "#F97316", isAvailable: true },
        { id: 3, name: "지구", color: "#2563EB", isAvailable: false },
        { id: 99, name: "대상 아님", color: "#111827", isAvailable: false },
      ],
    }),
  );
});

test("background daily schedule response matches direct fallback response", async ({ page }) => {
  const payload = {
    sharingMapId: "abc",
    date: "2099-01-02",
    roomType: "meeting",
  };

  const [backgroundResponse, directData] = await Promise.all([
    sendBackgroundMessage(page, { type: "ZZK_FETCH_DAILY_SCHEDULE", payload }),
    page.evaluate((directPayload) => {
      return window.__zzkGuestDataShared.fetchDailyScheduleDirect(directPayload);
    }, payload),
  ]);

  expect(backgroundResponse).toEqual({ ok: true, data: directData });
  expect(directData.rooms).toEqual([
    expect.objectContaining({
      id: 4,
      name: "금성",
      reservations: [
        {
          id: 401,
          title: "예약",
          owner: "",
          startMinute: 540,
          endMinute: 600,
          startTime: "09:00",
          endTime: "10:00",
        },
      ],
    }),
    expect.objectContaining({
      id: 3,
      name: "지구",
      reservations: [
        {
          id: 301,
          title: "지구 회의",
          owner: "토리",
          startMinute: 630,
          endMinute: 680,
          startTime: "10:30",
          endTime: "11:20",
        },
      ],
    }),
    expect.objectContaining({
      id: 99,
      name: "대상 아님",
      reservations: [],
    }),
  ]);
  expect(directData.range).toEqual({
    startMinute: 420,
    endMinute: 1380,
    slotMinutes: 10,
    startTime: "07:00",
    endTime: "23:00",
  });
  expect(directData.timeline[0]).toEqual({
    startMinute: 420,
    endMinute: 430,
    label: "07:00",
    isHourMark: true,
  });
});

test("background and direct schedule reject past dates unless edit context allows them", async ({ page }) => {
  const pastPayload = {
    sharingMapId: "abc",
    date: "2020-01-02",
    roomType: "meeting",
  };

  const [backgroundRejected, directRejected] = await Promise.all([
    sendBackgroundMessage(page, { type: "ZZK_FETCH_DAILY_SCHEDULE", payload: pastPayload }),
    page.evaluate(async (directPayload) => {
      try {
        await window.__zzkGuestDataShared.fetchDailyScheduleDirect(directPayload);
        return { ok: true };
      } catch (error) {
        return { ok: false, error: error instanceof Error ? error.message : String(error) };
      }
    }, pastPayload),
  ]);

  expect(backgroundRejected).toEqual({ ok: false, error: "오늘 이전 날짜는 선택할 수 없습니다." });
  expect(directRejected).toEqual({ ok: false, error: "오늘 이전 날짜는 선택할 수 없습니다." });

  const allowedPayload = { ...pastPayload, allowPastDate: true };
  const [backgroundAllowed, directAllowed] = await Promise.all([
    sendBackgroundMessage(page, { type: "ZZK_FETCH_DAILY_SCHEDULE", payload: allowedPayload }),
    page.evaluate((directPayload) => {
      return window.__zzkGuestDataShared.fetchDailyScheduleDirect(directPayload);
    }, allowedPayload),
  ]);

  expect(backgroundAllowed).toEqual({ ok: true, data: directAllowed });
  expect(directAllowed.date).toBe("2020-01-02");
});
