import path from "node:path";
import { expect, test } from "@playwright/test";

const WIDTH_STORAGE_KEY = "zzk-map-calendar-width-v1";

async function injectContentScriptBundle(page, beforeContentScript) {
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
  if (typeof beforeContentScript === "function") {
    await beforeContentScript();
  }
  await page.addScriptTag({ path: path.resolve(process.cwd(), "src/content.js") });
  await page.waitForFunction(() => window.__zzkAvailabilityLensLoaded === true, undefined, {
    timeout: 3000,
  });
  await page.evaluate(() => {
    window.__zzkTestApi?.syncGuestUi?.();
  });
  await page.waitForTimeout(150);
}

const SPACES = [
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
  {
    id: 6,
    name: "지구",
    color: "#10b981",
    reservationEnable: true,
    settings: [{ settingStartTime: "09:00:00", settingEndTime: "18:00:00" }],
  },
];

const AVAILABILITY = [
  { spaceId: 3, isAvailable: true },
  { spaceId: 5, isAvailable: false },
  { spaceId: 6, isAvailable: true },
];

async function mountGuestMap(page, { reservationDate = "2026-12-02" } = {}) {
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
        body: JSON.stringify({ spaces: SPACES }),
      });
      return;
    }

    if (url.pathname === "/api/guests/maps/234/spaces/availability") {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({ spaces: AVAILABILITY }),
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
        <input id="reservation-date" name="date" type="date" value="${reservationDate}" />

        <label for="start-time">시작시간</label>
        <input id="start-time" name="startTime" type="time" value="10:00" />

        <label for="end-time">종료시간</label>
        <input id="end-time" name="endTime" type="time" value="10:30" />

        <label for="room-select">공간 선택</label>
        <select id="room-select" name="spaceId">
          <option value="3" selected>11층 수성</option>
          <option value="5">11층 화성</option>
          <option value="6">11층 지구</option>
        </select>

        <div id="form-action-row" style="display:flex; gap:8px; margin-top:12px;">
          <button id="form-reserve-submit" type="button">예약하기</button>
        </div>
      </form>
    </main>
  `);
}

async function openRadar(page) {
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

async function mountAndOpenRadar(page, options = {}) {
  const { seedStorage, reservationDate } = options;
  await mountGuestMap(page, { reservationDate });
  await injectContentScriptBundle(page, async () => {
    if (typeof seedStorage === "function") {
      await seedStorage();
    }
  });
  await openRadar(page);
}

// --- 기대 동작 3, 9: 너비 clamp (순수 로직) ---

test("clampMapCalendarWidth keeps widths inside the supported range", async ({ page }) => {
  await mountGuestMap(page);
  await injectContentScriptBundle(page);

  const result = await page.evaluate(() => {
    const api = window.__zzkTestApi;
    const bounds = api.getMapCalendarWidthBounds();
    return {
      bounds,
      belowMin: api.clampMapCalendarWidth(bounds.min - 500),
      aboveMax: api.clampMapCalendarWidth(bounds.max + 5000),
      inRange: api.clampMapCalendarWidth(bounds.min + 40),
      nan: api.clampMapCalendarWidth(Number.NaN),
      infinity: api.clampMapCalendarWidth(Number.POSITIVE_INFINITY),
      negative: api.clampMapCalendarWidth(-1),
      zero: api.clampMapCalendarWidth(0),
      stringNumeric: api.clampMapCalendarWidth("640"),
      garbage: api.clampMapCalendarWidth("not-a-number"),
      nullish: api.clampMapCalendarWidth(null),
    };
  });

  expect(result.bounds.min).toBeGreaterThan(0);
  expect(result.bounds.max).toBeGreaterThan(result.bounds.min);

  // 최소/최대 범위 안으로 clamp 된다.
  expect(result.belowMin).toBe(result.bounds.min);
  expect(result.aboveMax).toBe(result.bounds.max);
  expect(result.inRange).toBe(result.bounds.min + 40);

  // 깨진 값은 null 로 떨어져 호출부가 기본 너비를 쓰게 한다.
  expect(result.nan).toBeNull();
  expect(result.infinity).toBeNull();
  expect(result.garbage).toBeNull();
  expect(result.nullish).toBeNull();

  // 숫자로 해석 가능한 값은 clamp 되어 살아남는다.
  expect(result.negative).toBe(result.bounds.min);
  expect(result.zero).toBe(result.bounds.min);
  const expectedFromString = Math.min(
    result.bounds.max,
    Math.max(result.bounds.min, 640),
  );
  expect(result.stringNumeric).toBe(expectedFromString);
  expect(Number.isFinite(result.stringNumeric)).toBe(true);
});

// --- 기대 동작 1, 2: 리사이즈 핸들 ---

test("resize handle is rendered on the radar modal", async ({ page }) => {
  await mountAndOpenRadar(page);

  const handle = await page.evaluate(() => {
    const node = document.querySelector(
      "#zzk-map-calendar-overlay .zzk-map-calendar-resize-handle"
    );
    if (!(node instanceof HTMLElement)) {
      return null;
    }
    const rect = node.getBoundingClientRect();
    const style = window.getComputedStyle(node);
    return {
      present: true,
      width: rect.width,
      height: rect.height,
      cursor: style.cursor,
      role: node.getAttribute("role"),
      ariaLabel: node.getAttribute("aria-label"),
    };
  });

  expect(handle).not.toBeNull();
  expect(handle.width).toBeGreaterThan(0);
  expect(handle.height).toBeGreaterThan(0);
  expect(handle.cursor).toContain("resize");
  expect(handle.ariaLabel).toBeTruthy();
});

test("dragging the resize handle changes the modal width live", async ({ page }) => {
  await mountAndOpenRadar(page);

  const before = await page.evaluate(() => {
    const card = document.querySelector("#zzk-map-calendar-overlay .zzk-map-calendar-card");
    return card.getBoundingClientRect().width;
  });

  const handleBox = await page.locator(
    "#zzk-map-calendar-overlay .zzk-map-calendar-resize-handle"
  ).boundingBox();
  expect(handleBox).not.toBeNull();

  // 핸들은 좌측 가장자리에 있으므로 오른쪽으로 끌면 너비가 줄어든다.
  await page.mouse.move(handleBox.x + handleBox.width / 2, handleBox.y + handleBox.height / 2);
  await page.mouse.down();
  await page.mouse.move(
    handleBox.x + handleBox.width / 2 + 160,
    handleBox.y + handleBox.height / 2,
    { steps: 12 }
  );

  const during = await page.evaluate(() => {
    const card = document.querySelector("#zzk-map-calendar-overlay .zzk-map-calendar-card");
    return card.getBoundingClientRect().width;
  });

  await page.mouse.up();

  const after = await page.evaluate(() => {
    const card = document.querySelector("#zzk-map-calendar-overlay .zzk-map-calendar-card");
    return card.getBoundingClientRect().width;
  });

  // 드래그 중 실시간으로 반영되고, 놓은 뒤에도 유지된다.
  expect(during).toBeLessThan(before - 50);
  expect(Math.abs(after - during)).toBeLessThan(4);
});

test("resizing never shrinks the modal below the minimum width", async ({ page }) => {
  await mountAndOpenRadar(page);

  const handleBox = await page.locator(
    "#zzk-map-calendar-overlay .zzk-map-calendar-resize-handle"
  ).boundingBox();

  await page.mouse.move(handleBox.x + handleBox.width / 2, handleBox.y + handleBox.height / 2);
  await page.mouse.down();
  // 화면 오른쪽 끝까지 과하게 끌어당긴다.
  await page.mouse.move(handleBox.x + 5000, handleBox.y + handleBox.height / 2, { steps: 20 });
  await page.mouse.up();

  const result = await page.evaluate(() => {
    const card = document.querySelector("#zzk-map-calendar-overlay .zzk-map-calendar-card");
    return {
      width: card.getBoundingClientRect().width,
      min: window.__zzkTestApi.getMapCalendarWidthBounds().min,
    };
  });

  expect(result.width).toBeGreaterThanOrEqual(result.min - 1);
});

// --- 기대 동작 4~7: 너비 영속 ---

test("resized width is written to localStorage", async ({ page }) => {
  await mountAndOpenRadar(page);

  const handleBox = await page.locator(
    "#zzk-map-calendar-overlay .zzk-map-calendar-resize-handle"
  ).boundingBox();

  await page.mouse.move(handleBox.x + handleBox.width / 2, handleBox.y + handleBox.height / 2);
  await page.mouse.down();
  await page.mouse.move(
    handleBox.x + handleBox.width / 2 + 140,
    handleBox.y + handleBox.height / 2,
    { steps: 10 }
  );
  await page.mouse.up();

  const stored = await page.evaluate((key) => window.localStorage.getItem(key), WIDTH_STORAGE_KEY);
  const liveWidth = await page.evaluate(() => {
    const card = document.querySelector("#zzk-map-calendar-overlay .zzk-map-calendar-card");
    return card.getBoundingClientRect().width;
  });

  expect(stored).toBeTruthy();
  expect(Number(stored)).toBeGreaterThan(0);
  expect(Math.abs(Number(stored) - liveWidth)).toBeLessThan(4);
});

test("stored width is restored when the radar opens again", async ({ page }) => {
  const targetWidth = 760;

  await mountAndOpenRadar(page, {
    seedStorage: async () => {
      await page.evaluate(
        ({ key, value }) => window.localStorage.setItem(key, String(value)),
        { key: WIDTH_STORAGE_KEY, value: targetWidth }
      );
    },
  });

  const width = await page.evaluate(() => {
    const card = document.querySelector("#zzk-map-calendar-overlay .zzk-map-calendar-card");
    return card.getBoundingClientRect().width;
  });

  expect(Math.abs(width - targetWidth)).toBeLessThan(4);
});

test("stored width survives a full page reload", async ({ page }) => {
  const targetWidth = 720;

  await mountAndOpenRadar(page, {
    seedStorage: async () => {
      await page.evaluate(
        ({ key, value }) => window.localStorage.setItem(key, String(value)),
        { key: WIDTH_STORAGE_KEY, value: targetWidth }
      );
    },
  });

  // 새로고침을 흉내내기 위해 같은 origin 으로 다시 mount 한다.
  // localStorage 는 origin 단위로 유지되므로 값이 살아있어야 한다.
  await mountGuestMap(page);
  const persisted = await page.evaluate((key) => window.localStorage.getItem(key), WIDTH_STORAGE_KEY);
  expect(Number(persisted)).toBe(targetWidth);

  await injectContentScriptBundle(page);
  await openRadar(page);

  const width = await page.evaluate(() => {
    const card = document.querySelector("#zzk-map-calendar-overlay .zzk-map-calendar-card");
    return card.getBoundingClientRect().width;
  });

  expect(Math.abs(width - targetWidth)).toBeLessThan(4);
});

test("first-time users with no stored width get the default layout", async ({ page }) => {
  await mountAndOpenRadar(page);

  const result = await page.evaluate((key) => {
    const card = document.querySelector("#zzk-map-calendar-overlay .zzk-map-calendar-card");
    return {
      stored: window.localStorage.getItem(key),
      inlineWidth: card.style.width,
      width: card.getBoundingClientRect().width,
    };
  }, WIDTH_STORAGE_KEY);

  // 저장된 값이 없으면 인라인 너비를 강제하지 않고 기존 레이아웃을 그대로 쓴다.
  expect(result.stored).toBeNull();
  expect(result.inlineWidth).toBe("");
  expect(result.width).toBeGreaterThan(0);
});

test("corrupt stored widths fall back to the default layout", async ({ page }) => {
  // 숫자로 해석되지 않는 값들. 인라인 너비를 강제하지 않고 기본 레이아웃을 써야 한다.
  for (const badValue of ["not-a-number", "NaN", "", "1e9999"]) {
    await mountGuestMap(page);
    await injectContentScriptBundle(page, async () => {
      await page.evaluate(
        ({ key, value }) => window.localStorage.setItem(key, value),
        { key: WIDTH_STORAGE_KEY, value: badValue }
      );
    });
    await openRadar(page);

    const result = await page.evaluate(() => {
      const card = document.querySelector("#zzk-map-calendar-overlay .zzk-map-calendar-card");
      return {
        width: card.getBoundingClientRect().width,
        inlineWidth: card.style.width,
      };
    });

    // 저장값을 못 읽었으므로 인라인 너비가 붙지 않는다.
    expect(result.inlineWidth, `stored value: ${badValue}`).toBe("");
    expect(result.width, `stored value: ${badValue}`).toBeGreaterThan(0);
  }
});

test("out-of-range stored widths are clamped into the supported range", async ({ page }) => {
  // 숫자로 해석되는 값들. 폴백이 아니라 clamp 경로다.
  for (const [outOfRange, expectBound] of [
    ["-320", "min"],
    ["100", "min"],
    ["99999", "max"],
  ]) {
    await mountGuestMap(page);
    await injectContentScriptBundle(page, async () => {
      await page.evaluate(
        ({ key, value }) => window.localStorage.setItem(key, value),
        { key: WIDTH_STORAGE_KEY, value: outOfRange }
      );
    });
    await openRadar(page);

    const result = await page.evaluate(() => {
      const card = document.querySelector("#zzk-map-calendar-overlay .zzk-map-calendar-card");
      const bounds = window.__zzkTestApi.getMapCalendarWidthBounds();
      return {
        width: card.getBoundingClientRect().width,
        min: bounds.min,
        max: bounds.max,
      };
    });

    const expected = expectBound === "min" ? result.min : result.max;
    expect(Math.abs(result.width - expected), `stored value: ${outOfRange}`).toBeLessThan(2);
  }
});

// --- 기대 동작 10, 11: 가로 스크롤 ---

test("narrow widths make the timeline body horizontally scrollable", async ({ page }) => {
  await mountAndOpenRadar(page, {
    seedStorage: async () => {
      await page.evaluate(
        ({ key, value }) => window.localStorage.setItem(key, String(value)),
        { key: WIDTH_STORAGE_KEY, value: 620 }
      );
    },
  });

  const result = await page.evaluate(() => {
    const body = document.querySelector("#zzk-map-calendar-overlay .zzk-map-calendar-body");
    const style = window.getComputedStyle(body);
    return {
      overflowX: style.overflowX,
      scrollWidth: body.scrollWidth,
      clientWidth: body.clientWidth,
    };
  });

  expect(result.overflowX).toMatch(/auto|scroll/);
  expect(result.scrollWidth).toBeGreaterThan(result.clientWidth);
});

test("the timeline body can actually be scrolled horizontally", async ({ page }) => {
  await mountAndOpenRadar(page, {
    seedStorage: async () => {
      await page.evaluate(
        ({ key, value }) => window.localStorage.setItem(key, String(value)),
        { key: WIDTH_STORAGE_KEY, value: 620 }
      );
    },
  });

  const scrolled = await page.evaluate(() => {
    const body = document.querySelector("#zzk-map-calendar-overlay .zzk-map-calendar-body");
    body.scrollLeft = 0;
    body.scrollLeft = 200;
    return body.scrollLeft;
  });

  expect(scrolled).toBeGreaterThan(0);
});

// --- 기대 동작 11: 층 / 회의실 고정 열 ---

test("floor and room columns stay pinned while the timeline scrolls", async ({ page }) => {
  await mountAndOpenRadar(page, {
    seedStorage: async () => {
      await page.evaluate(
        ({ key, value }) => window.localStorage.setItem(key, String(value)),
        { key: WIDTH_STORAGE_KEY, value: 620 }
      );
    },
  });

  const before = await page.evaluate(() => {
    const body = document.querySelector("#zzk-map-calendar-overlay .zzk-map-calendar-body");
    body.scrollLeft = 0;
    const floorName = document.querySelector(
      "#zzk-map-calendar-overlay .zzk-map-calendar-floor-name:not(.axis)"
    );
    const roomName = document.querySelector(
      "#zzk-map-calendar-overlay .zzk-map-calendar-row .zzk-map-calendar-room-name"
    );
    return {
      floorLeft: floorName.getBoundingClientRect().left,
      roomLeft: roomName.getBoundingClientRect().left,
    };
  });

  const after = await page.evaluate(() => {
    const body = document.querySelector("#zzk-map-calendar-overlay .zzk-map-calendar-body");
    body.scrollLeft = 260;
    const floorName = document.querySelector(
      "#zzk-map-calendar-overlay .zzk-map-calendar-floor-name:not(.axis)"
    );
    const roomName = document.querySelector(
      "#zzk-map-calendar-overlay .zzk-map-calendar-row .zzk-map-calendar-room-name"
    );
    const slot = document.querySelector(
      "#zzk-map-calendar-overlay .zzk-map-calendar-row .zzk-map-calendar-slots > *"
    );
    return {
      scrollLeft: body.scrollLeft,
      floorLeft: floorName.getBoundingClientRect().left,
      roomLeft: roomName.getBoundingClientRect().left,
      slotLeft: slot.getBoundingClientRect().left,
    };
  });

  // 실제로 가로 스크롤이 일어났어야 한다.
  expect(after.scrollLeft).toBeGreaterThan(0);

  // 층 / 회의실 열은 제자리에 고정된다.
  expect(Math.abs(after.floorLeft - before.floorLeft)).toBeLessThan(2);
  expect(Math.abs(after.roomLeft - before.roomLeft)).toBeLessThan(2);

  // 타임블록은 실제로 왼쪽으로 밀려난다.
  expect(after.slotLeft).toBeLessThan(before.roomLeft);
});

test("pinned columns are opaque so timeline blocks do not show through", async ({ page }) => {
  await mountAndOpenRadar(page, {
    seedStorage: async () => {
      await page.evaluate(
        ({ key, value }) => window.localStorage.setItem(key, String(value)),
        { key: WIDTH_STORAGE_KEY, value: 620 }
      );
    },
  });

  const result = await page.evaluate(() => {
    const roomName = document.querySelector(
      "#zzk-map-calendar-overlay .zzk-map-calendar-row .zzk-map-calendar-room-name"
    );
    const floorName = document.querySelector(
      "#zzk-map-calendar-overlay .zzk-map-calendar-floor-name:not(.axis)"
    );
    const roomStyle = window.getComputedStyle(roomName);
    const floorStyle = window.getComputedStyle(floorName);
    // 배경은 셀 자체가 아니라 pseudo element 가 그린다.
    const roomBefore = window.getComputedStyle(roomName, "::before");
    const floorBefore = window.getComputedStyle(floorName, "::before");
    return {
      roomPosition: roomStyle.position,
      floorPosition: floorStyle.position,
      roomBackground: roomBefore.backgroundColor,
      floorBackground: floorBefore.backgroundColor,
      roomBeforeContent: roomBefore.content,
      floorBeforeContent: floorBefore.content,
      roomDisplay: roomStyle.display,
    };
  });

  expect(result.roomPosition).toBe("sticky");
  expect(result.floorPosition).toBe("sticky");
  // pseudo element 가 실제로 존재해야 한다.
  expect(result.roomBeforeContent).not.toBe("none");
  expect(result.floorBeforeContent).not.toBe("none");
  // 투명이면 스크롤된 타임블록이 글자 뒤로 비쳐 보인다.
  expect(result.roomBackground).not.toBe("rgba(0, 0, 0, 0)");
  expect(result.floorBackground).not.toBe("rgba(0, 0, 0, 0)");
  // inline-flex 면 글자 크기로 줄어들어 셀 일부만 덮는다.
  expect(result.roomDisplay).not.toBe("inline-flex");
});

test("pinned label cells fully cover their grid cell so nothing leaks around them", async ({
  page,
}) => {
  await mountAndOpenRadar(page, {
    seedStorage: async () => {
      await page.evaluate(
        ({ key, value }) => window.localStorage.setItem(key, String(value)),
        { key: WIDTH_STORAGE_KEY, value: 620 }
      );
    },
  });

  const result = await page.evaluate(() => {
    const body = document.querySelector("#zzk-map-calendar-overlay .zzk-map-calendar-body");
    body.scrollLeft = 300;

    const row = document.querySelector("#zzk-map-calendar-overlay .zzk-map-calendar-row");
    const roomName = row.querySelector(".zzk-map-calendar-room-name");
    const rowRect = row.getBoundingClientRect();
    const nameRect = roomName.getBoundingClientRect();

    // 회의실 셀은 그리드가 할당한 열 너비를 가득 채워야 한다.
    const columnWidth = parseFloat(
      window.getComputedStyle(row).gridTemplateColumns.split(" ")[0]
    );

    return {
      nameWidth: nameRect.width,
      columnWidth,
      nameHeight: nameRect.height,
      rowHeight: rowRect.height,
    };
  });

  // 라벨 셀이 열 너비를 거의 다 덮어야 타임블록이 옆으로 새지 않는다.
  expect(result.nameWidth).toBeGreaterThanOrEqual(result.columnWidth - 1);
  // 세로로도 행 전체를 덮어야 위아래로 새지 않는다.
  expect(result.nameHeight).toBeGreaterThanOrEqual(result.rowHeight - 1);
});

test("row gaps in the pinned columns are painted over, not see-through", async ({ page }) => {
  await mountAndOpenRadar(page, {
    seedStorage: async () => {
      await page.evaluate(
        ({ key, value }) => window.localStorage.setItem(key, String(value)),
        { key: WIDTH_STORAGE_KEY, value: 620 }
      );
    },
  });

  // 고정 열 영역의 행 사이 틈 좌표를 모은다.
  const probes = await page.evaluate(() => {
    const overlay = document.getElementById("zzk-map-calendar-overlay");
    const body = overlay.querySelector(".zzk-map-calendar-body");
    body.scrollLeft = 300;

    const overlayRect = overlay.getBoundingClientRect();
    const rows = Array.from(overlay.querySelectorAll(".zzk-map-calendar-row"));
    const points = [];

    for (let index = 0; index < rows.length - 1; index += 1) {
      const current = rows[index].getBoundingClientRect();
      const next = rows[index + 1].getBoundingClientRect();
      const gapHeight = next.top - current.bottom;
      // 층 경계(구분선이 있는 큰 간격)는 원래 선이 그려지므로 제외한다.
      if (gapHeight <= 0.5 || gapHeight > 6) {
        continue;
      }

      const roomName = rows[index].querySelector(".zzk-map-calendar-room-name");
      const nameRect = roomName.getBoundingClientRect();

      // 고정 열 너비 전체를 훑어야 어디로 새는지 잡을 수 있다.
      const y = Math.round(current.bottom + gapHeight / 2 - overlayRect.top);
      const startX = Math.round(nameRect.left - overlayRect.left);
      const endX = Math.round(nameRect.right - overlayRect.left);
      for (let x = startX + 2; x < endX - 1; x += 4) {
        points.push({ x, y });
      }
    }

    return points;
  });

  expect(probes.length).toBeGreaterThan(0);

  // 실제로 렌더된 픽셀을 확인한다. box-shadow 는 hit-test 대상이 아니라 DOM 질의로는 못 잡는다.
  const shot = await page.locator("#zzk-map-calendar-overlay").screenshot();

  // PNG 를 직접 파싱하는 대신 브라우저에 되돌려 픽셀을 읽는다.
  const leaks = await page.evaluate(
    async ({ base64, points }) => {
      const image = new Image();
      await new Promise((resolve, reject) => {
        image.onload = resolve;
        image.onerror = reject;
        image.src = `data:image/png;base64,${base64}`;
      });

      const canvas = document.createElement("canvas");
      canvas.width = image.naturalWidth;
      canvas.height = image.naturalHeight;
      const context = canvas.getContext("2d");
      context.drawImage(image, 0, 0);

      const scale = image.naturalWidth / document.getElementById("zzk-map-calendar-overlay").getBoundingClientRect().width;

      const found = [];
      for (const point of points) {
        const px = Math.round(point.x * scale);
        const py = Math.round(point.y * scale);
        if (px < 0 || py < 0 || px >= canvas.width || py >= canvas.height) {
          continue;
        }
        const [r, g, b] = context.getImageData(px, py, 1, 1).data;
        // 타임블록은 옅은 초록/빨강 계열이라 채널 간 차이가 생긴다.
        // 흰 배경과 회색 구분선은 채널 값이 서로 거의 같다.
        const maxChannel = Math.max(r, g, b);
        const minChannel = Math.min(r, g, b);
        if (maxChannel - minChannel > 4) {
          found.push({ point, rgb: [r, g, b] });
        }
      }
      return found;
    },
    { base64: shot.toString("base64"), points: probes }
  );

  expect(leaks).toEqual([]);
});

test("the radar body does not grow a vertical scrollbar when rows fit", async ({ page }) => {
  await mountAndOpenRadar(page, {
    seedStorage: async () => {
      await page.evaluate(
        ({ key, value }) => window.localStorage.setItem(key, String(value)),
        { key: WIDTH_STORAGE_KEY, value: 620 }
      );
    },
  });

  const result = await page.evaluate(() => {
    const body = document.querySelector("#zzk-map-calendar-overlay .zzk-map-calendar-body");
    const grid = document.querySelector("#zzk-map-calendar-overlay .zzk-map-calendar-grid");
    const gridWrap = document.querySelector(
      "#zzk-map-calendar-overlay .zzk-map-calendar-grid-wrap"
    );
    return {
      verticalDelta: body.scrollHeight - body.clientHeight,
      scrollable: body.classList.contains("zzk-map-calendar-body-scrollable"),
      overflowY: window.getComputedStyle(body).overflowY,
      gridHeight: grid.getBoundingClientRect().height,
      gridWrapHeight: gridWrap.getBoundingClientRect().height,
    };
  });

  // 실제 콘텐츠는 넘치지 않는데 고정 열 배경이 아래로 번져 스크롤이 생기면 안 된다.
  expect(result.verticalDelta).toBe(0);
  expect(result.scrollable).toBe(false);
  expect(result.overflowY).toBe("hidden");
  expect(Math.abs(result.gridHeight - result.gridWrapHeight)).toBeLessThan(2);
});

test("the axis header labels also stay pinned while scrolling", async ({ page }) => {
  await mountAndOpenRadar(page, {
    seedStorage: async () => {
      await page.evaluate(
        ({ key, value }) => window.localStorage.setItem(key, String(value)),
        { key: WIDTH_STORAGE_KEY, value: 620 }
      );
    },
  });

  const before = await page.evaluate(() => {
    const body = document.querySelector("#zzk-map-calendar-overlay .zzk-map-calendar-body");
    body.scrollLeft = 0;
    const axisRoom = document.querySelector(
      "#zzk-map-calendar-overlay .zzk-map-calendar-room-name.axis"
    );
    return axisRoom.getBoundingClientRect().left;
  });

  const after = await page.evaluate(() => {
    const body = document.querySelector("#zzk-map-calendar-overlay .zzk-map-calendar-body");
    body.scrollLeft = 260;
    const axisRoom = document.querySelector(
      "#zzk-map-calendar-overlay .zzk-map-calendar-room-name.axis"
    );
    return axisRoom.getBoundingClientRect().left;
  });

  expect(Math.abs(after - before)).toBeLessThan(2);
});

// --- 기대 동작 12, 13: 현재 시각 기준 스크롤 (순수 로직) ---

test("computeMapCalendarCurrentTimeScrollLeft only targets today", async ({ page }) => {
  await mountGuestMap(page);
  await injectContentScriptBundle(page);

  const result = await page.evaluate(() => {
    const api = window.__zzkTestApi;
    const timeline = [];
    for (let minute = 0; minute < 24 * 60; minute += 30) {
      timeline.push({ startMinute: minute, endMinute: minute + 30, isHourMark: minute % 60 === 0 });
    }

    const baseArgs = {
      timeline,
      trackStartOffset: 100,
      slotStride: 20,
      viewportWidth: 600,
      maxScrollLeft: 4000,
    };

    return {
      today: api.computeMapCalendarCurrentTimeScrollLeft({
        ...baseArgs,
        isToday: true,
        currentMinute: 13 * 60,
      }),
      notToday: api.computeMapCalendarCurrentTimeScrollLeft({
        ...baseArgs,
        isToday: false,
        currentMinute: 13 * 60,
      }),
      earlyMorning: api.computeMapCalendarCurrentTimeScrollLeft({
        ...baseArgs,
        isToday: true,
        currentMinute: 1 * 60,
      }),
      lateEvening: api.computeMapCalendarCurrentTimeScrollLeft({
        ...baseArgs,
        isToday: true,
        currentMinute: 23 * 60 + 30,
      }),
      noScrollNeeded: api.computeMapCalendarCurrentTimeScrollLeft({
        ...baseArgs,
        isToday: true,
        currentMinute: 13 * 60,
        maxScrollLeft: 0,
      }),
      emptyTimeline: api.computeMapCalendarCurrentTimeScrollLeft({
        ...baseArgs,
        timeline: [],
        isToday: true,
        currentMinute: 13 * 60,
      }),
    };
  });

  // 오늘이 아니면 스크롤 위치를 건드리지 않는다 (기대 동작 13).
  expect(result.notToday).toBeNull();

  // 오늘이면 현재 시각 근처로 스크롤한다 (기대 동작 12).
  expect(result.today).toBeGreaterThan(0);

  // 새벽에는 이미 맨 앞이라 스크롤이 거의 필요 없다.
  expect(result.earlyMorning).toBeLessThan(result.today);

  // 늦은 시간에는 최대 스크롤을 넘지 않는다.
  expect(result.lateEvening).toBeLessThanOrEqual(4000);

  // 가로 스크롤이 없으면 아무 것도 하지 않는다.
  expect(result.noScrollNeeded).toBeNull();

  // 타임라인이 비어 있으면 안전하게 빠져나온다.
  expect(result.emptyTimeline).toBeNull();
});

test("before the timeline starts, today's scroll stays at the very beginning", async ({ page }) => {
  await mountGuestMap(page);
  await injectContentScriptBundle(page);

  const result = await page.evaluate(() => {
    const api = window.__zzkTestApi;
    // 실제 찜꽁처럼 09:00~18:00 만 있는 타임라인
    const timeline = [];
    for (let minute = 9 * 60; minute < 18 * 60; minute += 10) {
      timeline.push({
        startMinute: minute,
        endMinute: minute + 10,
        isHourMark: minute % 60 === 0,
      });
    }

    const baseArgs = {
      timeline,
      trackStartOffset: 153,
      slotStride: 11,
      viewportWidth: 594,
      maxScrollLeft: 182,
      isToday: true,
    };

    return {
      midnight: api.computeMapCalendarCurrentTimeScrollLeft({
        ...baseArgs,
        currentMinute: 2,
      }),
      dawn: api.computeMapCalendarCurrentTimeScrollLeft({
        ...baseArgs,
        currentMinute: 6 * 60,
      }),
      justBeforeOpen: api.computeMapCalendarCurrentTimeScrollLeft({
        ...baseArgs,
        currentMinute: 8 * 60 + 40,
      }),
      afterOpen: api.computeMapCalendarCurrentTimeScrollLeft({
        ...baseArgs,
        currentMinute: 13 * 60,
      }),
    };
  });

  // 00:02, 06:00, 08:40 모두 타임라인(09:00) 시작 전이므로 맨 처음이어야 한다.
  expect(result.midnight).toBe(0);
  expect(result.dawn).toBe(0);
  expect(result.justBeforeOpen).toBe(0);

  // 영업 시간 안이면 현재 시각 쪽으로 스크롤한다.
  expect(result.afterOpen).toBeGreaterThan(0);
});

test("current-time scroll leaves a little context before the current slot", async ({ page }) => {
  await mountGuestMap(page);
  await injectContentScriptBundle(page);

  const result = await page.evaluate(() => {
    const api = window.__zzkTestApi;
    const timeline = [];
    for (let minute = 0; minute < 24 * 60; minute += 30) {
      timeline.push({ startMinute: minute, endMinute: minute + 30, isHourMark: minute % 60 === 0 });
    }

    const trackStartOffset = 100;
    const slotStride = 20;
    const currentMinute = 13 * 60;
    const slotIndex = Math.floor(currentMinute / 30);
    const rawSlotLeft = trackStartOffset + slotIndex * slotStride;

    const scrollLeft = api.computeMapCalendarCurrentTimeScrollLeft({
      timeline,
      trackStartOffset,
      slotStride,
      viewportWidth: 600,
      maxScrollLeft: 4000,
      isToday: true,
      currentMinute,
    });

    return { scrollLeft, rawSlotLeft };
  });

  // 현재 슬롯이 화면 왼쪽 끝에 딱 붙지 않고 약간의 여유를 두고 보인다.
  expect(result.scrollLeft).toBeLessThan(result.rawSlotLeft);
  expect(result.scrollLeft).toBeGreaterThan(0);
});

test("today's radar scrolls the timeline near the current time on open", async ({ page }) => {
  const today = await page.evaluate(() => {
    const parts = new Intl.DateTimeFormat("en-CA", {
      timeZone: "Asia/Seoul",
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
    }).formatToParts(new Date());
    const year = parts.find((part) => part.type === "year").value;
    const month = parts.find((part) => part.type === "month").value;
    const day = parts.find((part) => part.type === "day").value;
    return `${year}-${month}-${day}`;
  });

  await mountAndOpenRadar(page, {
    reservationDate: today,
    seedStorage: async () => {
      await page.evaluate(
        ({ key, value }) => window.localStorage.setItem(key, String(value)),
        { key: WIDTH_STORAGE_KEY, value: 620 }
      );
    },
  });

  await page.waitForTimeout(400);

  const result = await page.evaluate(() => {
    const body = document.querySelector("#zzk-map-calendar-overlay .zzk-map-calendar-body");
    return {
      scrollLeft: body.scrollLeft,
      scrollWidth: body.scrollWidth,
      clientWidth: body.clientWidth,
      currentMinute: window.__zzkTestApi.getCurrentMinuteOfDayInKST?.() ?? null,
    };
  });

  // 가로 스크롤이 존재하는 상태여야 의미가 있는 테스트다.
  expect(result.scrollWidth).toBeGreaterThan(result.clientWidth);

  // 새벽 시간대가 아니라면 스크롤이 앞쪽에서 시작하지 않아야 한다.
  if (result.currentMinute !== null && result.currentMinute > 3 * 60) {
    expect(result.scrollLeft).toBeGreaterThan(0);
  }
});

test("a non-today date opens the timeline at the start", async ({ page }) => {
  await mountAndOpenRadar(page, {
    reservationDate: "2026-12-02",
    seedStorage: async () => {
      await page.evaluate(
        ({ key, value }) => window.localStorage.setItem(key, String(value)),
        { key: WIDTH_STORAGE_KEY, value: 620 }
      );
    },
  });

  await page.waitForTimeout(400);

  const scrollLeft = await page.evaluate(() => {
    const body = document.querySelector("#zzk-map-calendar-overlay .zzk-map-calendar-body");
    return body.scrollLeft;
  });

  expect(scrollLeft).toBe(0);
});

// --- 회귀: 기존 동작 보존 ---

test("resizing keeps the radar rows and legend intact", async ({ page }) => {
  await mountAndOpenRadar(page);

  const before = await page.evaluate(() => ({
    rows: document.querySelectorAll("#zzk-map-calendar-overlay .zzk-map-calendar-row").length,
  }));

  const handleBox = await page.locator(
    "#zzk-map-calendar-overlay .zzk-map-calendar-resize-handle"
  ).boundingBox();

  await page.mouse.move(handleBox.x + handleBox.width / 2, handleBox.y + handleBox.height / 2);
  await page.mouse.down();
  await page.mouse.move(
    handleBox.x + handleBox.width / 2 + 120,
    handleBox.y + handleBox.height / 2,
    { steps: 10 }
  );
  await page.mouse.up();

  const after = await page.evaluate(() => ({
    rows: document.querySelectorAll("#zzk-map-calendar-overlay .zzk-map-calendar-row").length,
    roomNames: Array.from(
      document.querySelectorAll("#zzk-map-calendar-overlay .zzk-map-calendar-room-name")
    ).length,
  }));

  expect(after.rows).toBe(before.rows);
  expect(after.rows).toBeGreaterThan(0);
  expect(after.roomNames).toBeGreaterThan(0);
});

test("dragging the resize handle does not move the modal", async ({ page }) => {
  await mountAndOpenRadar(page);

  const beforeTransform = await page.evaluate(() => {
    const overlay = document.getElementById("zzk-map-calendar-overlay");
    return overlay.style.transform;
  });

  const handleBox = await page.locator(
    "#zzk-map-calendar-overlay .zzk-map-calendar-resize-handle"
  ).boundingBox();

  await page.mouse.move(handleBox.x + handleBox.width / 2, handleBox.y + handleBox.height / 2);
  await page.mouse.down();
  await page.mouse.move(
    handleBox.x + handleBox.width / 2 + 100,
    handleBox.y + handleBox.height / 2 + 60,
    { steps: 10 }
  );
  await page.mouse.up();

  const afterTransform = await page.evaluate(() => {
    const overlay = document.getElementById("zzk-map-calendar-overlay");
    return overlay.style.transform;
  });

  // 리사이즈는 드래그 이동과 독립적이어야 한다.
  expect(afterTransform).toBe(beforeTransform);
});
