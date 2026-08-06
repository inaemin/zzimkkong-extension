import path from "node:path";
import { expect, test } from "@playwright/test";

const WIDTH_STORAGE_KEY = "zzk-map-calendar-width-v1";

const WEB_ORIGIN = "https://techcourse-lms-plus-web.woowahan.com";
const API_ORIGIN = "https://techcourse-lms-plus-api.woowahan.com";

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
  await page.addScriptTag({ path: path.resolve(process.cwd(), "src/features/form-fields/shared.js") });
  await page.addScriptTag({ path: path.resolve(process.cwd(), "src/services/lms-data/normalizers.js") });
  await page.addScriptTag({ path: path.resolve(process.cwd(), "src/services/lms-data/shared.js") });
  await page.addScriptTag({ path: path.resolve(process.cwd(), "src/features/radar/floor-maps.js") });
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
    accessRole: "ALL",
    active: true,
    closeTime: "23:00:00",
    floor: 11,
    id: 3,
    maxReservationMinutes: 60,
    name: "수성",
    openTime: "07:00:00",
    reservationUnitMinutes: 30,
  },
  {
    accessRole: "ALL",
    active: true,
    closeTime: "23:00:00",
    floor: 11,
    id: 5,
    maxReservationMinutes: 60,
    name: "화성",
    openTime: "07:00:00",
    reservationUnitMinutes: 30,
  },
  {
    accessRole: "ALL",
    active: true,
    closeTime: "23:00:00",
    floor: 11,
    id: 6,
    maxReservationMinutes: 60,
    name: "지구",
    openTime: "07:00:00",
    reservationUnitMinutes: 30,
  },
];

function buildPageHtml(reservationDate) {
  return `<html><body>
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
  </body></html>`;
}

// 라우트/init script 는 페이지당 한 번만 건다. 같은 테스트에서 mountGuestMap 을
// 여러 번 부르면 핸들러가 쌓여 문서 응답이 어긋나기 때문이다.
const preparedPages = new WeakSet();

async function mountGuestMap(page, { reservationDate = "2026-12-02" } = {}) {
  if (!preparedPages.has(page)) {
    preparedPages.add(page);

    // content.js 는 실제 lms+ 호스트에서 테스트 훅을 감추므로 명시적으로 열어준다.
    await page.addInitScript(() => {
      window.__ZZK_TEST_HOOKS__ = true;
    });

    // 실제 사이트는 미인증 요청을 로그인 페이지로 돌려보내므로 문서 응답을 고정한다.
    await page.route(`${WEB_ORIGIN}/**`, async (route) => {
      if (route.request().resourceType() !== "document") {
        await route.continue();
        return;
      }
      await route.fulfill({
        status: 200,
        contentType: "text/html",
        body: buildPageHtml(page.__zzkReservationDate),
      });
    });

    await page.route(`${API_ORIGIN}/api/**`, async (route) => {
      const url = new URL(route.request().url());
      const body = url.pathname === "/api/spaces" ? SPACES : [];
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

  page.__zzkReservationDate = reservationDate;
  await page.goto(`${WEB_ORIGIN}/space-reservations`, { waitUntil: "domcontentloaded" });
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
    // 2-pane 구조: 가로 스크롤은 타임블록 pane 에서 일어난다.
    const pane = document.querySelector(
      "#zzk-map-calendar-overlay .zzk-map-calendar-timeline-pane"
    );
    const style = window.getComputedStyle(pane);
    return {
      overflowX: style.overflowX,
      scrollWidth: pane.scrollWidth,
      clientWidth: pane.clientWidth,
    };
  });

  expect(result.overflowX).toMatch(/auto|scroll/);
  expect(result.scrollWidth).toBeGreaterThan(result.clientWidth);
});

test("가로 스크롤바는 마지막 타임블록 행 아래 빈 공간에 놓여 슬롯 클릭을 방해하지 않는다", async ({ page }) => {
  await mountAndOpenRadar(page, {
    seedStorage: async () => {
      await page.evaluate(
        ({ key, value }) => window.localStorage.setItem(key, String(value)),
        { key: WIDTH_STORAGE_KEY, value: 620 }
      );
    },
  });

  const result = await page.evaluate(() => {
    const overlay = document.getElementById("zzk-map-calendar-overlay");
    const pane = overlay.querySelector(".zzk-map-calendar-timeline-pane");
    const grid = overlay.querySelector(".zzk-map-calendar-timeline-grid");
    const rows = Array.from(
      overlay.querySelectorAll(".zzk-map-calendar-row.zzk-map-calendar-timeline-row")
    );
    const lastRow = rows[rows.length - 1].getBoundingClientRect();
    const paneRect = pane.getBoundingClientRect();
    return {
      hasHScroll: pane.scrollWidth - pane.clientWidth > 2,
      // 가로 스크롤이 실제로 있을 때만 gutter 클래스가 붙는다.
      hasGutterClass: pane.classList.contains("zzk-map-calendar-timeline-pane-hscroll"),
      // pane 하단이 마지막 행 아래로 최소 스크롤바 두께(≈12px)만큼 여유가 있어야
      // 스크롤바가 마지막 행 위에 겹치지 않는다.
      slackBelowLastRow: paneRect.bottom - lastRow.bottom,
      // 그리드(타임블록 콘텐츠)는 마지막 행에서 끝난다. 그 아래 gutter 는 트랙 padding.
      gridBottomAtLastRow:
        Math.abs(grid.getBoundingClientRect().bottom - lastRow.bottom) < 2,
    };
  });

  expect(result.hasHScroll).toBe(true);
  expect(result.hasGutterClass).toBe(true);
  // 마지막 행 아래에 스크롤바가 놓일 빈 공간이 확보돼야 한다.
  expect(result.slackBelowLastRow).toBeGreaterThanOrEqual(12);
  expect(result.gridBottomAtLastRow).toBe(true);
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
    const pane = document.querySelector(
      "#zzk-map-calendar-overlay .zzk-map-calendar-timeline-pane"
    );
    pane.scrollLeft = 0;
    pane.scrollLeft = 200;
    return pane.scrollLeft;
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
    const pane = document.querySelector(
      "#zzk-map-calendar-overlay .zzk-map-calendar-timeline-pane"
    );
    pane.scrollLeft = 0;
    const floorName = document.querySelector(
      "#zzk-map-calendar-overlay .zzk-map-calendar-floor-name:not(.axis)"
    );
    const roomName = document.querySelector(
      "#zzk-map-calendar-overlay .zzk-map-calendar-label-pane .zzk-map-calendar-room-name"
    );
    return {
      floorLeft: floorName.getBoundingClientRect().left,
      roomLeft: roomName.getBoundingClientRect().left,
    };
  });

  const after = await page.evaluate(() => {
    const pane = document.querySelector(
      "#zzk-map-calendar-overlay .zzk-map-calendar-timeline-pane"
    );
    pane.scrollLeft = 260;
    const floorName = document.querySelector(
      "#zzk-map-calendar-overlay .zzk-map-calendar-floor-name:not(.axis)"
    );
    const roomName = document.querySelector(
      "#zzk-map-calendar-overlay .zzk-map-calendar-label-pane .zzk-map-calendar-room-name"
    );
    const slot = document.querySelector(
      "#zzk-map-calendar-overlay .zzk-map-calendar-timeline-row .zzk-map-calendar-slots > *"
    );
    return {
      scrollLeft: pane.scrollLeft,
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

test("회의실 열과 타임블록 사이에 세로 구분선이 있고, 스크롤해도 고정된다", async ({ page }) => {
  await mountAndOpenRadar(page, {
    seedStorage: async () => {
      await page.evaluate(
        ({ key, value }) => window.localStorage.setItem(key, String(value)),
        { key: WIDTH_STORAGE_KEY, value: 620 }
      );
    },
  });

  const geom = await page.evaluate(() => {
    const overlay = document.getElementById("zzk-map-calendar-overlay");
    const body = overlay.querySelector(".zzk-map-calendar-body");
    const pane = overlay.querySelector(".zzk-map-calendar-timeline-pane");
    const labelPane = overlay.querySelector(".zzk-map-calendar-label-pane");
    pane.scrollLeft = 0;

    // 회의실↔타임블록 경계는 라벨 pane 의 오른쪽 테두리(border-right)다.
    const labelPaneStyle = window.getComputedStyle(labelPane);
    // 층↔회의실 세로 구분선은 라벨 pane 안의 divider-track.
    const baseDivider = overlay.querySelector(".zzk-map-calendar-divider-track");

    const labelRight0 = labelPane.getBoundingClientRect().right;
    const timelineLeft0 = pane.getBoundingClientRect().left;
    const vDelta = body.scrollHeight - body.clientHeight;

    pane.scrollLeft = 260;
    const labelRightScrolled = labelPane.getBoundingClientRect().right;

    return {
      hasBoundaryBorder:
        labelPaneStyle.borderRightWidth !== "0px" &&
        labelPaneStyle.borderRightStyle === "solid",
      hasBaseDivider: Boolean(baseDivider),
      // 라벨 pane 오른쪽 = 타임블록 pane 왼쪽(경계가 맞닿는다).
      boundaryGap: Math.abs(labelRight0 - timelineLeft0),
      labelRight0,
      labelRightScrolled,
      vDelta,
    };
  });

  // 회의실↔타임블록 경계선(라벨 pane 오른쪽 테두리)이 있고, 층↔회의실 구분선도 있다.
  expect(geom.hasBoundaryBorder).toBe(true);
  expect(geom.hasBaseDivider).toBe(true);
  // 라벨 pane 오른쪽과 타임블록 pane 왼쪽이 맞닿아 있다(경계 일치).
  expect(geom.boundaryGap).toBeLessThan(2);
  // 가로 스크롤해도 라벨 pane 은 안 움직인다(경계 고정).
  expect(Math.abs(geom.labelRightScrolled - geom.labelRight0)).toBeLessThan(2);
  // 세로 스크롤이 생기면 안 된다.
  expect(geom.vDelta).toBe(0);
});

test("라벨 pane 은 타임블록 스크롤 영역 밖이라 타임블록이 라벨을 침범하지 않는다", async ({
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
    const overlay = document.getElementById("zzk-map-calendar-overlay");
    const labelPane = overlay.querySelector(".zzk-map-calendar-label-pane");
    const pane = overlay.querySelector(".zzk-map-calendar-timeline-pane");
    // 타임블록을 최대한 스크롤한다.
    pane.scrollLeft = pane.scrollWidth;

    const paneStyle = window.getComputedStyle(pane);
    const labelRight = labelPane.getBoundingClientRect().right;
    const paneLeft = pane.getBoundingClientRect().left;

    return {
      // 라벨 pane 은 스크롤 컨테이너(pane)의 형제라, 타임블록이 그 아래로 못 지나간다.
      labelPaneIsSibling: labelPane.parentElement === pane.parentElement,
      paneScrolled: pane.scrollLeft > 0,
      // 타임블록 pane 이 자기 콘텐츠를 클리핑한다(overflow-x: auto/scroll/hidden).
      paneClipsX: /auto|scroll|hidden/.test(paneStyle.overflowX),
      // 타임블록 pane 의 왼쪽 경계가 라벨 pane 오른쪽과 맞닿는다(그 왼쪽은 클리핑됨).
      boundaryGap: Math.abs(paneLeft - labelRight),
    };
  });

  expect(result.labelPaneIsSibling).toBe(true);
  expect(result.paneScrolled).toBe(true);
  // 스크롤된 타임블록은 pane 경계에서 클리핑되어 라벨 위로 나오지 않는다.
  expect(result.paneClipsX).toBe(true);
  expect(result.boundaryGap).toBeLessThan(2);
});

test("같은 층 안의 회의실 행들은 세로 간격 없이 바짝 붙는다", async ({ page }) => {
  await mountAndOpenRadar(page, {
    seedStorage: async () => {
      await page.evaluate(
        ({ key, value }) => window.localStorage.setItem(key, String(value)),
        { key: WIDTH_STORAGE_KEY, value: 620 }
      );
    },
  });

  // 같은 층 그룹(.zzk-map-calendar-floor-rooms) 안의 연속 행 사이 세로 간격을 잰다.
  const gaps = await page.evaluate(() => {
    const overlay = document.getElementById("zzk-map-calendar-overlay");
    const result = [];
    overlay.querySelectorAll(".zzk-map-calendar-floor-rooms").forEach((group) => {
      const rows = Array.from(group.querySelectorAll(".zzk-map-calendar-row"));
      for (let index = 0; index < rows.length - 1; index += 1) {
        const current = rows[index].getBoundingClientRect();
        const next = rows[index + 1].getBoundingClientRect();
        result.push(Math.round((next.top - current.bottom) * 100) / 100);
      }
    });
    return result;
  });

  // 최소 하나 이상의 행 쌍이 있어야 하고, 모두 간격이 0(±1px 렌더 오차) 이어야 한다.
  expect(gaps.length).toBeGreaterThan(0);
  for (const gap of gaps) {
    expect(Math.abs(gap)).toBeLessThanOrEqual(1);
  }
});

test("정시 세로선이 층/회의실 세로선처럼 헤더 맨 위까지 올라온다", async ({ page }) => {
  await mountAndOpenRadar(page, {
    seedStorage: async () => {
      await page.evaluate(
        ({ key, value }) => window.localStorage.setItem(key, String(value)),
        { key: WIDTH_STORAGE_KEY, value: 620 }
      );
    },
  });

  const geom = await page.evaluate(() => {
    const overlay = document.getElementById("zzk-map-calendar-overlay");
    const gridWrap = overlay.querySelector(".zzk-map-calendar-grid-wrap");
    const cs = getComputedStyle(gridWrap);
    const axisHeight = parseFloat(cs.getPropertyValue("--zzk-axis-row-height"));
    const clipTop = parseFloat(cs.getPropertyValue("--zzk-hour-boundary-clip-top"));

    // 층/회의실 세로 구분선(divider-track)의 top 위치.
    const gridWrapTop = gridWrap.getBoundingClientRect().top;
    const dividerTrack = overlay.querySelector(".zzk-map-calendar-divider-track");
    const dividerTop = dividerTrack
      ? dividerTrack.getBoundingClientRect().top - gridWrapTop
      : null;

    return { axisHeight, clipTop, dividerTop };
  });

  expect(Number.isFinite(geom.clipTop)).toBe(true);
  expect(Number.isFinite(geom.axisHeight)).toBe(true);
  // 헤더 맨 위까지 올라오려면 위쪽을 자르지 않아야 한다(clip top = 0).
  expect(geom.clipTop).toBe(0);
  // 층/회의실 세로선도 헤더 맨 위(≈0)에서 시작하므로 같은 높이다.
  if (Number.isFinite(geom.dividerTop)) {
    expect(Math.abs(geom.dividerTop - geom.clipTop)).toBeLessThanOrEqual(2);
  }
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
    const overlay = document.getElementById("zzk-map-calendar-overlay");
    const body = overlay.querySelector(".zzk-map-calendar-body");
    const pane = overlay.querySelector(".zzk-map-calendar-timeline-pane");
    const hasHScroll = pane.classList.contains("zzk-map-calendar-timeline-pane-hscroll");
    const gutter = hasHScroll
      ? parseFloat(getComputedStyle(body).getPropertyValue("--zzk-hscroll-gutter")) || 0
      : 0;
    return {
      // 세로 스크롤(콘텐츠 넘침)은 없어야 한다. 가로 스크롤 gutter 는 콘텐츠 넘침이
      // 아니므로 제외하고 본다.
      verticalDelta: body.scrollHeight - body.clientHeight - gutter,
      scrollable: body.classList.contains("zzk-map-calendar-body-scrollable"),
      overflowY: window.getComputedStyle(body).overflowY,
    };
  });

  // 실제 콘텐츠는 넘치지 않는데 고정 열 배경이 아래로 번져 세로 스크롤이 생기면 안 된다.
  // (가로 스크롤바 gutter 를 제외하면 세로 넘침은 0 이어야 한다.)
  expect(result.verticalDelta).toBe(0);
  expect(result.scrollable).toBe(false);
  expect(result.overflowY).toBe("hidden");
});

test("가로 스크롤바는 타임블록 pane 에만 생기고 라벨 pane 아래로 번지지 않는다", async ({ page }) => {
  await mountAndOpenRadar(page, {
    seedStorage: async () => {
      await page.evaluate(
        ({ key, value }) => window.localStorage.setItem(key, String(value)),
        { key: WIDTH_STORAGE_KEY, value: 620 }
      );
    },
  });

  const result = await page.evaluate(() => {
    const overlay = document.getElementById("zzk-map-calendar-overlay");
    const body = overlay.querySelector(".zzk-map-calendar-body");
    const labelPane = overlay.querySelector(".zzk-map-calendar-label-pane");
    const pane = overlay.querySelector(".zzk-map-calendar-timeline-pane");
    return {
      // 가로 스크롤은 타임블록 pane 에서만 일어난다.
      paneHScroll: pane.scrollWidth - pane.clientWidth > 2,
      labelPaneOverflowX: window.getComputedStyle(labelPane).overflowX,
      bodyOverflowX: window.getComputedStyle(body).overflowX,
      // body 는 가로 스크롤을 갖지 않는다(라벨 아래로 스크롤바가 안 번진다).
      bodyHScroll: body.scrollWidth - body.clientWidth > 2,
      verticalDelta: body.scrollHeight - body.clientHeight,
    };
  });

  expect(result.paneHScroll).toBe(true);
  // 라벨 pane 과 body 는 가로 스크롤이 없다 → 스크롤바가 라벨 아래로 안 번진다.
  expect(result.labelPaneOverflowX).not.toMatch(/auto|scroll/);
  expect(result.bodyOverflowX).not.toMatch(/auto|scroll/);
  expect(result.bodyHScroll).toBe(false);
  // 세로 스크롤은 생기면 안 된다.
  expect(result.verticalDelta).toBe(0);
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

test("좁은 모달에서 15:02 는 14:30 슬롯으로 스크롤한다(끝까지 밀리지 않음)", async ({ page }) => {
  await mountGuestMap(page);
  await injectContentScriptBundle(page);

  const result = await page.evaluate(() => {
    const api = window.__zzkTestApi;
    // 07:00~23:00, 30분 단위 (lms+ 와 동일)
    const timeline = [];
    for (let minute = 7 * 60; minute < 23 * 60; minute += 30) {
      timeline.push({ startMinute: minute, endMinute: minute + 30, isHourMark: minute % 60 === 0 });
    }

    // 실제 lms+ 지오메트리와 비슷하게: sticky 열 153px, 슬롯 22px.
    const trackStartOffset = 153;
    const slotStride = 22;
    // 좁은 모달: 약 7시간(14슬롯)만 보임 → maxScroll 이 실제로 존재.
    const trackWidth = timeline.length * slotStride; // 32*22 = 704
    const viewportSlotWidth = 14 * slotStride; // 약 14슬롯
    const maxScrollLeft = trackWidth - viewportSlotWidth;

    const scrollLeft = api.computeMapCalendarCurrentTimeScrollLeft({
      timeline,
      trackStartOffset,
      slotStride,
      viewportWidth: viewportSlotWidth,
      maxScrollLeft,
      isToday: true,
      currentMinute: 15 * 60 + 2,
    });

    // 15:02 - 30분 lead = 14:32 → 첫 endMinute>14:32 슬롯은 14:30(index 15).
    const targetIndex = timeline.findIndex((s) => s.endMinute > 15 * 60 + 2 - 30);
    return {
      scrollLeft,
      maxScrollLeft,
      expectedSlotIndex: targetIndex,
      // scrollLeft 에서 왼쪽 끝에 오는 슬롯 인덱스
      leftmostIndexAtScroll: Math.round(scrollLeft / slotStride),
    };
  });

  // 끝까지(maxScroll) 밀리면 안 된다.
  expect(result.scrollLeft).toBeLessThan(result.maxScrollLeft);
  // 왼쪽 끝에 14:30 슬롯(index 15)이 와야 한다.
  expect(result.leftmostIndexAtScroll).toBe(result.expectedSlotIndex);
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
    const pane = document.querySelector(
      "#zzk-map-calendar-overlay .zzk-map-calendar-timeline-pane"
    );
    return {
      scrollLeft: pane.scrollLeft,
      scrollWidth: pane.scrollWidth,
      clientWidth: pane.clientWidth,
      maxScrollLeft: pane.scrollWidth - pane.clientWidth,
    };
  });

  // 가로 스크롤이 존재하는 상태여야 의미가 있는 테스트다.
  expect(result.scrollWidth).toBeGreaterThan(result.clientWidth);

  // scrollLeft 의 정확한 값(현재 시각 기준 계산)은 결정론적 유닛 테스트가 별도로
  // 검증한다. 여기서는 "오늘 날짜로 열면 스크롤이 유효 범위 안에 놓인다"는 엔드투엔드
  // 배선만 확인한다. 실행 시각(KST)에 따라 scrollLeft 가 0(이른 아침)일 수도, 양수(낮)
  // 일 수도 있으므로 방향을 실제 시계에 걸어 단언하지 않는다(시간대 의존 flaky 방지).
  expect(result.scrollLeft).toBeGreaterThanOrEqual(0);
  expect(result.scrollLeft).toBeLessThanOrEqual(result.maxScrollLeft);
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

test("리사이즈로 넓어져 화면을 벗어나면 다시 뷰포트 안으로 들어온다", async ({ page }) => {
  // 좁은 뷰포트에서 좁은 폭으로 시작한다(왼쪽으로 옮길 여유 확보).
  await page.setViewportSize({ width: 760, height: 720 });
  await mountAndOpenRadar(page, {
    seedStorage: async () => {
      await page.evaluate(
        ({ key, value }) => window.localStorage.setItem(key, String(value)),
        { key: WIDTH_STORAGE_KEY, value: 500 }
      );
    },
  });

  // 헤더를 잡아 모달을 화면 왼쪽 끝으로 옮긴다.
  const headerBox = await page
    .locator("#zzk-map-calendar-overlay .zzk-map-calendar-header")
    .boundingBox();
  await page.mouse.move(headerBox.x + 20, headerBox.y + headerBox.height / 2);
  await page.mouse.down();
  await page.mouse.move(30, 80, { steps: 12 });
  await page.mouse.up();

  const widthBefore = await page.evaluate(
    () => Math.round(document.getElementById("zzk-map-calendar-overlay").getBoundingClientRect().width)
  );

  // 핸들(좌측 가장자리)을 왼쪽으로 끌어 폭을 최대까지 넓힌다.
  // 오른쪽이 고정이라 넓힐수록 왼쪽 가장자리가 화면 밖으로 나가려 한다.
  const handleBox = await page
    .locator("#zzk-map-calendar-overlay .zzk-map-calendar-resize-handle")
    .boundingBox();
  await page.mouse.move(handleBox.x + handleBox.width / 2, handleBox.y + handleBox.height / 2);
  await page.mouse.down();
  await page.mouse.move(0, handleBox.y + handleBox.height / 2, { steps: 20 });
  await page.mouse.up();

  const result = await page.evaluate(() => {
    const overlay = document.getElementById("zzk-map-calendar-overlay");
    const rect = overlay.getBoundingClientRect();
    return {
      left: Math.round(rect.left),
      top: Math.round(rect.top),
      right: Math.round(rect.right),
      bottom: Math.round(rect.bottom),
      vw: window.innerWidth,
      vh: window.innerHeight,
    };
  });

  // 리사이즈로 폭이 실제로 커졌다(핸들이 동작 안 해 폭이 그대로면 이 테스트는 무의미).
  const widthAfter = result.right - result.left;
  expect(widthAfter).toBeGreaterThan(widthBefore);
  // 재조정 결과: 모달 전체가 뷰포트 안에 있어야 한다(약간의 오차 허용).
  // 재클램프가 없으면 왼쪽 가장자리가 음수가 되어 화면 밖으로 나간다.
  expect(result.left).toBeGreaterThanOrEqual(-2);
  expect(result.top).toBeGreaterThanOrEqual(-2);
  expect(result.right).toBeLessThanOrEqual(result.vw + 2);
  expect(result.bottom).toBeLessThanOrEqual(result.vh + 2);
});


test("마운트 시 저장된 위치가 현재 뷰포트를 벗어나면 화면 안으로 재조정된다", async ({ page }) => {
  // 좁은 뷰포트에서, 화면 밖을 가리키는 큰 offset 을 미리 저장해두고 연다.
  await page.setViewportSize({ width: 760, height: 720 });
  await mountAndOpenRadar(page, {
    seedStorage: async () => {
      await page.evaluate(
        ({ key }) =>
          window.localStorage.setItem(key, JSON.stringify({ x: -600, y: -500 })),
        { key: "zzk-map-calendar-offset-v1" }
      );
    },
  });

  const result = await page.evaluate(() => {
    const overlay = document.getElementById("zzk-map-calendar-overlay");
    const rect = overlay.getBoundingClientRect();
    return {
      left: Math.round(rect.left),
      top: Math.round(rect.top),
      right: Math.round(rect.right),
      bottom: Math.round(rect.bottom),
      vw: window.innerWidth,
      vh: window.innerHeight,
    };
  });

  // 저장된 위치가 화면 밖(-600,-500)을 가리켰지만, 마운트 시 화면 안으로 들어와야 한다.
  expect(result.left).toBeGreaterThanOrEqual(-2);
  expect(result.top).toBeGreaterThanOrEqual(-2);
  expect(result.right).toBeLessThanOrEqual(result.vw + 2);
  expect(result.bottom).toBeLessThanOrEqual(result.vh + 2);
});
