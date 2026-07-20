import path from "node:path";
import { expect, test } from "@playwright/test";

async function injectContentScriptBundle(page) {
  await page.addScriptTag({ path: path.resolve(process.cwd(), "src/constants/debug.js") });
  await page.addScriptTag({ path: path.resolve(process.cwd(), "src/utils/shared.js") });
  await page.addScriptTag({ path: path.resolve(process.cwd(), "src/utils/storage.js") });
  await page.addScriptTag({ path: path.resolve(process.cwd(), "src/constants/runtime.js") });
  await page.addScriptTag({ path: path.resolve(process.cwd(), "src/utils/date-time.js") });
  await page.addScriptTag({ path: path.resolve(process.cwd(), "src/utils/routes.js") });
  await page.addScriptTag({ path: path.resolve(process.cwd(), "src/features/slack/shared.js") });
  await page.addScriptTag({ path: path.resolve(process.cwd(), "src/features/slack/workflow.js") });
  await page.addScriptTag({ path: path.resolve(process.cwd(), "src/features/slack/success-flow.js") });
  await page.addScriptTag({ path: path.resolve(process.cwd(), "src/features/host-sync/shared.js") });
  await page.addScriptTag({ path: path.resolve(process.cwd(), "src/services/guest-data/normalizers.js") });
  await page.addScriptTag({ path: path.resolve(process.cwd(), "src/services/guest-data/shared.js") });
  await page.addScriptTag({ path: path.resolve(process.cwd(), "src/features/radar/shared.js") });
  await page.addScriptTag({ path: path.resolve(process.cwd(), "src/features/radar/workflow.js") });
  await page.addScriptTag({ path: path.resolve(process.cwd(), "src/features/radar/form-sync.js") });
  await page.addScriptTag({ path: path.resolve(process.cwd(), "src/content.js") });
  await page.waitForFunction(() => window.__zzkAvailabilityLensLoaded === true, undefined, {
    timeout: 3000,
  });
  await page.evaluate(() => {
    window.__zzkTestApi?.syncGuestUi?.();
  });
  await page.waitForTimeout(150);
}

async function mountGuestMap(page, { spaces, availability, selectedOptionText }) {
  await page.goto("https://example.com/guest/test-map", { waitUntil: "domcontentloaded" });

  await page.route("https://k8s.zzimkkong.com/api/guests/**", async (route) => {
    const url = new URL(route.request().url());

    if (url.pathname === "/api/guests/maps" && url.searchParams.get("sharingMapId") === "test-map") {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({ mapId: 234, mapName: "테스트 맵" }),
      });
      return;
    }

    if (url.pathname === "/api/guests/maps/234/spaces") {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          spaces,
        }),
      });
      return;
    }

    if (url.pathname === "/api/guests/maps/234/spaces/availability") {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          spaces: availability,
        }),
      });
      return;
    }

    if (url.pathname.match(/^\/api\/guests\/maps\/234\/spaces\/\d+\/reservations$/)) {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({ reservations: [] }),
      });
      return;
    }

    await route.fulfill({
      status: 404,
      contentType: "application/json",
      body: JSON.stringify({ message: "not found" }),
    });
  });

  await page.setContent(`
    <main>
      <div id="top-tabs" style="display:flex; gap:8px; margin-bottom:16px;">
        <button type="button">예약현황</button>
        <button type="button">예약하기</button>
      </div>

      <form id="reservation-form" style="display:block; width:560px;">
        <label for="reservation-date">날짜</label>
        <input id="reservation-date" name="date" type="date" value="2026-12-02" />

        <label for="start-time">시작시간</label>
        <input id="start-time" name="startTime" type="time" value="10:00" />

        <label for="end-time">종료시간</label>
        <input id="end-time" name="endTime" type="time" value="10:30" />

        <label for="room-select">공간 선택</label>
        <select id="room-select" name="spaceId">
          ${selectedOptionText}
        </select>

        <div id="form-action-row" style="display:flex; gap:8px; margin-top:12px;">
          <button id="form-reserve-submit" type="button">예약하기</button>
        </div>
      </form>
    </main>
  `);

  await injectContentScriptBundle(page);
  await page.waitForFunction(
    () => document.getElementById("zzk-map-calendar-radar-launcher") instanceof HTMLElement,
    undefined,
    { timeout: 5000 }
  );
  await page.waitForTimeout(1200);

  await page.evaluate(async () => {
    const hasOverlayRows =
      document.querySelectorAll("#zzk-map-calendar-overlay .zzk-map-calendar-row").length > 0;
    if (hasOverlayRows) {
      return;
    }

    await window.__zzkTestApi?.loadAndOpenRadar?.();
  });

  await page.waitForSelector("#zzk-map-calendar-overlay .zzk-map-calendar-row", { timeout: 6000 });
}

test("room tags stay hidden when metadata tags are empty", async ({ page }) => {
  await mountGuestMap(page, {
    spaces: [
      {
        id: 3,
        name: "수성",
        color: "#60a5fa",
        reservationEnable: true,
        settings: [{ settingStartTime: "09:00:00", settingEndTime: "18:00:00" }],
      },
      {
        id: 5,
        name: "화성",
        color: "#f97316",
        reservationEnable: true,
        settings: [{ settingStartTime: "09:00:00", settingEndTime: "18:00:00" }],
      },
    ],
    availability: [
      { spaceId: 3, isAvailable: true },
      { spaceId: 5, isAvailable: false },
    ],
    selectedOptionText: `
      <option value="3" selected>11층 수성</option>
      <option value="5">11층 화성</option>
    `,
  });

  const snapshot = await page.evaluate(() => {
    const panelHost = document.getElementById("zzk-availability-lens-root");

    const overlayLegend = document.querySelector("#zzk-map-calendar-overlay .zzk-room-tag-legend");
    const overlayBadges = document.querySelectorAll(
      "#zzk-map-calendar-overlay .zzk-room-tag-badge"
    ).length;

    return {
      hasPanelHost: panelHost instanceof HTMLElement,
      overlayLegendHidden: overlayLegend instanceof HTMLElement ? overlayLegend.hidden : null,
      overlayBadges,
    };
  });

  expect(snapshot).toMatchObject({
    hasPanelHost: false,
    overlayLegendHidden: true,
    overlayBadges: 0,
  });
});

test("window-tagged rooms show 창 badges without a legend entry", async ({ page }) => {
  await mountGuestMap(page, {
    spaces: [
      {
        id: 4,
        name: "금성",
        color: "#f97316",
        reservationEnable: true,
        settings: [{ settingStartTime: "09:00:00", settingEndTime: "18:00:00" }],
      },
      {
        id: 6,
        name: "지구",
        color: "#10b981",
        reservationEnable: true,
        settings: [{ settingStartTime: "09:00:00", settingEndTime: "18:00:00" }],
      },
      {
        id: 8,
        name: "디스커버리",
        color: "#8b5cf6",
        reservationEnable: true,
        settings: [{ settingStartTime: "09:00:00", settingEndTime: "18:00:00" }],
      },
    ],
    availability: [
      { spaceId: 4, isAvailable: true },
      { spaceId: 6, isAvailable: false },
      { spaceId: 8, isAvailable: true },
    ],
    selectedOptionText: `
      <option value="4" selected>11층 금성</option>
      <option value="6">11층 지구</option>
      <option value="8">12층 디스커버리</option>
    `,
  });

  const snapshot = await page.evaluate(() => {
    const panelHost = document.getElementById("zzk-availability-lens-root");

    const overlayLegend = document.querySelector("#zzk-map-calendar-overlay .zzk-room-tag-legend");
    const overlayBadges = Array.from(
      document.querySelectorAll("#zzk-map-calendar-overlay .zzk-room-tag-badge")
    ).map((node) => node.getAttribute("data-label") || "");
    const overlayLegendText = overlayLegend instanceof HTMLElement ? overlayLegend.textContent || "" : "";

    return {
      hasPanelHost: panelHost instanceof HTMLElement,
      overlayLegendHidden: overlayLegend instanceof HTMLElement ? overlayLegend.hidden : null,
      overlayBadges,
      overlayLegendText,
    };
  });

  expect(snapshot.hasPanelHost).toBeFalsy();
  // 범례에서는 태그 항목을 노출하지 않는다. 회의실 이름 옆 배지만 남긴다.
  expect(snapshot.overlayLegendHidden).toBeTruthy();
  expect(snapshot.overlayLegendText).toBe("");
  expect(snapshot.overlayBadges).toContain("창");
});

test("rooms returned by spaces API are shown even when metadata is missing", async ({ page }) => {
  await mountGuestMap(page, {
    spaces: [
      {
        id: 3,
        name: "수성",
        color: "#60a5fa",
        reservationEnable: true,
        settings: [{ settingStartTime: "09:00:00", settingEndTime: "18:00:00" }],
      },
      {
        id: 77,
        name: "새회의실",
        color: "#22c55e",
        reservationEnable: true,
        settings: [{ settingStartTime: "09:00:00", settingEndTime: "18:00:00" }],
      },
    ],
    availability: [
      { spaceId: 3, isAvailable: true },
      { spaceId: 77, isAvailable: true },
    ],
    selectedOptionText: `
      <option value="3" selected>11층 수성</option>
      <option value="77">14층 새회의실</option>
    `,
  });

  const roomLabels = await page.evaluate(() => {
    return Array.from(
      document.querySelectorAll("#zzk-map-calendar-overlay .zzk-map-calendar-room-name"),
    ).map((node) => node.textContent || "");
  });

  expect(roomLabels.some((label) => label.includes("수성"))).toBeTruthy();
  expect(roomLabels.some((label) => label.includes("새회의실"))).toBeTruthy();
});

test("13th floor rooms unavailable to crew stay hidden except 은하수", async ({ page }) => {
  const restrictedRooms = [
    { id: 100, name: "목성" },
    { id: 101, name: "스튜디오" },
    { id: 276, name: "안드로메다같은방" },
    { id: 103, name: "천왕성" },
    { id: 104, name: "코치1" },
    { id: 105, name: "코치2" },
    { id: 106, name: "토성" },
  ];
  const restrictedRoomNames = restrictedRooms.map((room) => room.name);
  const spaces = [
    {
      id: 9,
      name: "은하수",
      color: "#6366f1",
      reservationEnable: true,
      settings: [{ settingStartTime: "09:00:00", settingEndTime: "18:00:00" }],
    },
    ...restrictedRooms.map((room) => ({
      id: room.id,
      name: room.name,
      color: "#64748b",
      reservationEnable: true,
      settings: [{ settingStartTime: "09:00:00", settingEndTime: "18:00:00" }],
    })),
  ];

  await mountGuestMap(page, {
    spaces,
    availability: spaces.map((space) => ({ spaceId: space.id, isAvailable: true })),
    selectedOptionText: spaces
      .map((space) => `<option value="${space.id}">13층 ${space.name}</option>`)
      .join(""),
  });

  const roomLabels = await page.evaluate(() => {
    return Array.from(
      document.querySelectorAll("#zzk-map-calendar-overlay .zzk-map-calendar-room-name"),
    ).map((node) => node.textContent || "");
  });

  expect(roomLabels.some((label) => label.includes("은하수"))).toBeTruthy();
  for (const restrictedRoomName of restrictedRoomNames) {
    expect(roomLabels.some((label) => label.includes(restrictedRoomName))).toBeFalsy();
  }
});

test("12th floor meeting rooms follow the crew-facing order", async ({ page }) => {
  const roomNamesInApiOrder = ["허블", "아폴로", "디스커버리", "보이저"];
  const spaces = roomNamesInApiOrder.map((name, index) => ({
    id: 200 + index,
    name,
    color: "#60a5fa",
    reservationEnable: true,
    settings: [{ settingStartTime: "09:00:00", settingEndTime: "18:00:00" }],
  }));

  await mountGuestMap(page, {
    spaces,
    availability: spaces.map((space) => ({ spaceId: space.id, isAvailable: true })),
    selectedOptionText: spaces
      .map((space) => `<option value="${space.id}">12층 ${space.name}</option>`)
      .join(""),
  });

  const roomLabels = await page.evaluate(() => {
    return Array.from(
      document.querySelectorAll("#zzk-map-calendar-overlay .zzk-map-calendar-room-name"),
    ).map((node) => node.textContent || "");
  });

  const normalizedRoomNames = roomLabels
    .map((label) => label.replace(/\s+/g, ""))
    .filter((label) => roomNamesInApiOrder.includes(label));

  expect(normalizedRoomNames).toEqual(["보이저", "디스커버리", "아폴로", "허블"]);
});
