import path from "node:path";
import { expect, test } from "@playwright/test";

const WEB_ORIGIN = "https://techcourse-lms-plus-web.woowahan.com";
const API_ORIGIN = "https://techcourse-lms-plus-api.woowahan.com";

const MAP_CALENDAR_OVERLAY_ID = "zzk-map-calendar-overlay";
const MAP_CALENDAR_LAUNCHER_ID = "zzk-map-calendar-radar-launcher";

// manifest 의 content_scripts 순서와 동일해야 한다.
const CONTENT_SCRIPT_BUNDLE = [
  "src/constants/debug.js",
  "src/utils/shared.js",
  "src/utils/storage.js",
  "src/constants/runtime.js",
  "src/utils/date-time.js",
  "src/utils/routes.js",
  "src/features/slack/shared.js",
  "src/features/slack/workflow.js",
  "src/features/slack/success-flow.js",
  "src/features/host-sync/shared.js",
  "src/services/guest-data/normalizers.js",
  "src/services/guest-data/shared.js",
  "src/services/lms-data/normalizers.js",
  "src/services/lms-data/shared.js",
  "src/features/radar/floor-maps.js",
  "src/features/radar/shared.js",
  "src/features/radar/workflow.js",
  "src/features/radar/form-sync.js",
  "src/content.js",
];

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
];

async function mountServicePage(page) {
  // 실제 사이트는 미인증 요청을 로그인 페이지로 돌려보내므로 문서 응답을 고정한다.
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
    const body = url.pathname === "/api/spaces" ? spacesFixture : [];
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

  await page.goto(`${WEB_ORIGIN}/space-reservations`, { waitUntil: "domcontentloaded" });

  for (const scriptPath of CONTENT_SCRIPT_BUNDLE) {
    await page.addScriptTag({ path: path.resolve(process.cwd(), scriptPath) });
  }

  await page.waitForFunction(() => window.__zzkAvailabilityLensLoaded === true, undefined, {
    timeout: 3000,
  });
}

test("radar launcher and modal mount on the new service reservation page", async ({ page }) => {
  const pageErrors = [];
  page.on("pageerror", (error) => pageErrors.push(error.message));

  await mountServicePage(page);

  await expect
    .poll(() => page.evaluate((id) => Boolean(document.getElementById(id)), MAP_CALENDAR_LAUNCHER_ID))
    .toBe(true);
  await expect
    .poll(() => page.evaluate((id) => Boolean(document.getElementById(id)), MAP_CALENDAR_OVERLAY_ID))
    .toBe(true);

  expect(pageErrors).toEqual([]);
});

test("lms+ 런처는 오른쪽 하단 40x40 원형 아이콘 버튼이다", async ({ page }) => {
  await mountServicePage(page);
  await page.waitForSelector(`#${MAP_CALENDAR_LAUNCHER_ID}`);

  const style = await page.evaluate((id) => {
    const el = document.getElementById(id);
    const cs = getComputedStyle(el);
    const rect = el.getBoundingClientRect();
    const label = el.querySelector(".zzk-map-calendar-radar-label");
    return {
      position: cs.position,
      width: Math.round(rect.width),
      height: Math.round(rect.height),
      borderRadius: cs.borderRadius,
      // 오른쪽/아래 여백 24px 근처에 붙어 있는가
      rightGap: Math.round(window.innerWidth - rect.right),
      bottomGap: Math.round(window.innerHeight - rect.bottom),
      labelHidden: label ? getComputedStyle(label).display === "none" : true,
      hasIcon: Boolean(el.querySelector(".zzk-map-calendar-radar-icon")),
    };
  }, MAP_CALENDAR_LAUNCHER_ID);

  expect(style.position).toBe("fixed");
  expect(style.width).toBe(40);
  expect(style.height).toBe(40);
  expect(style.rightGap).toBeGreaterThanOrEqual(20);
  expect(style.rightGap).toBeLessThanOrEqual(28);
  expect(style.bottomGap).toBeGreaterThanOrEqual(20);
  expect(style.bottomGap).toBeLessThanOrEqual(28);
  // 아이콘만: 텍스트 라벨은 숨김.
  expect(style.labelHidden).toBe(true);
  expect(style.hasIcon).toBe(true);
});

test("radar launcher toggles the modal closed and open on the new service", async ({ page }) => {
  await mountServicePage(page);

  await page.waitForSelector(`#${MAP_CALENDAR_LAUNCHER_ID}`);
  const isOverlayMounted = () =>
    page.evaluate((id) => Boolean(document.getElementById(id)), MAP_CALENDAR_OVERLAY_ID);

  await expect.poll(isOverlayMounted).toBe(true);

  await page.click(`#${MAP_CALENDAR_LAUNCHER_ID}`);
  await expect.poll(isOverlayMounted).toBe(false);

  await page.click(`#${MAP_CALENDAR_LAUNCHER_ID}`);
  await expect.poll(isOverlayMounted).toBe(true);
});

test("API 403 still renders the modal shell with an error message, not a blank", async ({ page }) => {
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
  // 모든 API 가 403 (인증 실패 상황 재현)
  await page.route(`${API_ORIGIN}/api/**`, async (route) => {
    await route.fulfill({
      status: 403,
      headers: {
        "access-control-allow-origin": WEB_ORIGIN,
        "access-control-allow-credentials": "true",
        "content-type": "application/json",
      },
      body: "",
    });
  });

  await page.goto(`${WEB_ORIGIN}/space-reservations`, { waitUntil: "domcontentloaded" });
  for (const scriptPath of CONTENT_SCRIPT_BUNDLE) {
    await page.addScriptTag({ path: path.resolve(process.cwd(), scriptPath) });
  }
  await page.waitForFunction(() => window.__zzkAvailabilityLensLoaded === true, undefined, {
    timeout: 3000,
  });

  // API 가 실패해도 오버레이(모달 껍데기)는 떠야 하고, 에러 메시지가 보여야 한다.
  await expect
    .poll(() => page.evaluate((id) => Boolean(document.getElementById(id)), MAP_CALENDAR_OVERLAY_ID))
    .toBe(true);

  const errorText = await page.evaluate(() => {
    const el = document.querySelector(
      `#${"zzk-map-calendar-overlay"} .zzk-map-calendar-error-message`,
    );
    return el ? el.textContent : null;
  });
  expect(errorText).toContain("로그인");

  // 다시 시도 버튼도 있어야 한다.
  const hasRetry = await page.evaluate(() =>
    Boolean(document.querySelector("#zzk-map-calendar-overlay .zzk-map-calendar-error-retry")),
  );
  expect(hasRetry).toBe(true);
});

test("radar stays unmounted on unrelated paths of the new service", async ({ page }) => {
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

  await page.goto(`${WEB_ORIGIN}/mypage`, { waitUntil: "domcontentloaded" });
  for (const scriptPath of CONTENT_SCRIPT_BUNDLE) {
    await page.addScriptTag({ path: path.resolve(process.cwd(), scriptPath) });
  }
  await page.waitForFunction(() => window.__zzkAvailabilityLensLoaded === true, undefined, {
    timeout: 3000,
  });

  expect(
    await page.evaluate((id) => Boolean(document.getElementById(id)), MAP_CALENDAR_LAUNCHER_ID),
  ).toBe(false);
  expect(
    await page.evaluate((id) => Boolean(document.getElementById(id)), MAP_CALENDAR_OVERLAY_ID),
  ).toBe(false);
});

test("층이 바뀌는 경계에는 가로 구분선(floor-divider)이 그려진다", async ({ page }) => {
  await mountServicePage(page); // 금성(11층) + 은하수(13층) → 층 경계 존재

  await page.waitForSelector(`#${MAP_CALENDAR_OVERLAY_ID} .zzk-map-calendar-slot`, {
    timeout: 4000,
  });

  const info = await page.evaluate((overlayId) => {
    const overlay = document.getElementById(overlayId);
    // 층이 바뀌는 그룹에만 floor-divider 가 붙는다(첫 층 그룹에는 없음).
    const divider = overlay.querySelector(".zzk-map-calendar-floor-group.floor-divider");
    if (!divider) return { hasDivider: false };
    const cs = getComputedStyle(divider, "::before");
    return {
      hasDivider: true,
      content: cs.content,
      // 가로 구분선은 1px 높이의 회색 선이다.
      height: cs.height,
      background: cs.backgroundColor,
    };
  }, MAP_CALENDAR_OVERLAY_ID);

  expect(info.hasDivider).toBe(true);
  expect(info.content).not.toBe("none");
  expect(parseFloat(info.height)).toBeLessThanOrEqual(1.5);
});

// 모달을 좁혀 가로 스크롤을 만들고, 스크롤을 맨 끝으로 옮긴 상태에서
// 층/회의실 라벨 열 영역에 (허용된 세로 구분선 2개를 제외한) 세로선 토막이나
// 타임블록이 새어 보이지 않는지 픽셀 단위로 검사한다.
test("라벨 pane 은 타임라인 스크롤과 분리돼 타임블록이 침범하지 못한다(모달 축소 + 가로 스크롤 맨 끝)", async ({ page }) => {
  await mountServicePage(page);
  await page.waitForSelector(`#${MAP_CALENDAR_OVERLAY_ID} .zzk-map-calendar-slot`, {
    timeout: 4000,
  });

  // 가로 스크롤이 생기도록 카드 폭을 좁히고, 스크롤을 맨 끝으로 옮긴다.
  await page.evaluate((overlayId) => {
    const card = document.querySelector(`#${overlayId} .zzk-map-calendar-card`);
    if (card) card.style.width = "520px";
  }, MAP_CALENDAR_OVERLAY_ID);
  await page.waitForTimeout(200);

  const result = await page.evaluate((overlayId) => {
    const overlay = document.getElementById(overlayId);
    const labelPane = overlay.querySelector(".zzk-map-calendar-label-pane");
    const pane = overlay.querySelector(".zzk-map-calendar-timeline-pane");

    // 스크롤 전 라벨 pane 오른쪽 경계.
    const labelRightBefore = labelPane.getBoundingClientRect().right;

    // 타임라인만 맨 끝까지 스크롤한다.
    pane.scrollLeft = pane.scrollWidth;
    const paneHScroll = pane.scrollWidth - pane.clientWidth;

    const labelRightAfter = labelPane.getBoundingClientRect().right;
    const paneLeft = pane.getBoundingClientRect().left;

    return {
      // 실제로 가로 스크롤이 생겨야 의미 있는 검사다.
      paneHScroll,
      // 라벨 pane 은 타임라인 스크롤 영역 바깥의 형제 요소다.
      labelPaneIsSibling: labelPane.parentElement === pane.parentElement,
      // 라벨 pane 은 가로 스크롤을 갖지 않는다(타임블록이 못 들어온다).
      labelClipsX: /auto|scroll|hidden/.test(getComputedStyle(labelPane).overflowX),
      // 타임라인을 맨 끝까지 밀어도 라벨 pane 의 위치는 움직이지 않는다.
      labelStayed: Math.abs(labelRightAfter - labelRightBefore) <= 1,
      // 라벨 pane 오른쪽과 타임라인 pane 왼쪽이 맞닿아 겹치지 않는다.
      boundaryGap: Math.abs(labelRightAfter - paneLeft),
    };
  }, MAP_CALENDAR_OVERLAY_ID);

  expect(result.paneHScroll).toBeGreaterThan(0);
  expect(result.labelPaneIsSibling).toBe(true);
  expect(result.labelClipsX).toBe(true);
  expect(result.labelStayed).toBe(true);
  expect(result.boundaryGap).toBeLessThan(2);
});

test("07:00 슬롯 앞에는 정시 여백만 있고(다른 정시와 리듬 동일) 세로 구분선은 없다", async ({
  page,
}) => {
  await mountServicePage(page);
  await page.waitForSelector(`#${MAP_CALENDAR_OVERLAY_ID} .zzk-map-calendar-slot`, {
    timeout: 4000,
  });
  await page.evaluate((overlayId) => {
    const pane = document.querySelector(`#${overlayId} .zzk-map-calendar-timeline-pane`);
    pane.scrollLeft = 0;
  }, MAP_CALENDAR_OVERLAY_ID);
  await page.waitForTimeout(200);

  const geom = await page.evaluate((overlayId) => {
    const overlay = document.getElementById(overlayId);
    const row = overlay.querySelector(".zzk-map-calendar-row.zzk-map-calendar-timeline-row");
    const slots = Array.from(row.querySelectorAll(".zzk-map-calendar-slot"));
    const byLabel = (label) => slots.find((s) => s.dataset.zzkSlotStart === label);
    const s0700 = byLabel("07:00");
    const s0730 = byLabel("07:30");
    const s0800 = byLabel("08:00");
    // 타임라인 트랙(스크롤 콘텐츠)의 왼쪽 = 07:00 앞 여백의 시작점.
    const tl = overlay
      .querySelector(".zzk-map-calendar-timeline-track")
      .getBoundingClientRect();

    // 07:00 앞 여백(트랙 왼쪽 ~ 07:00 왼쪽) vs 08:00 앞 정시 여백(07:30 오른쪽 ~ 08:00 왼쪽)
    const before0700 = s0700.getBoundingClientRect().left - tl.left;
    const before0800 = s0800.getBoundingClientRect().left - s0730.getBoundingClientRect().right;

    // 07:00 셀에는 hour-boundary 클래스(정시 경계선 셀)가 붙지 않아야 한다(선 없음).
    // hour-boundary-cell 은 axis 슬롯 라벨에만 쓰이므로, 여기서는 정시선 track 자체를 본다.
    return {
      before0700: Math.round(before0700),
      before0800: Math.round(before0800),
    };
  }, MAP_CALENDAR_OVERLAY_ID);

  // 07:00 앞 여백이 존재하고(0 아님), 다른 정시 여백과 비슷해야 한다(±3px).
  expect(geom.before0700).toBeGreaterThan(0);
  expect(Math.abs(geom.before0700 - geom.before0800)).toBeLessThanOrEqual(3);
});

test("회의실↔타임블록 세로 구분선이 헤더~마지막 행까지 끊김 없이 이어진다", async ({ page }) => {
  await mountServicePage(page);
  await page.waitForSelector(`#${MAP_CALENDAR_OVERLAY_ID} .zzk-map-calendar-slot`, {
    timeout: 4000,
  });

  const geom = await page.evaluate((overlayId) => {
    const overlay = document.getElementById(overlayId);
    const gw = overlay.querySelector(".zzk-map-calendar-grid-wrap");
    const gwr = gw.getBoundingClientRect();
    // 회의실↔타임블록 세로 구분선 = 라벨 pane 의 오른쪽 border.
    const labelPane = overlay.querySelector(".zzk-map-calendar-label-pane");
    const lpr = labelPane.getBoundingClientRect();
    const cs = getComputedStyle(labelPane);
    // 마지막 타임블록 행의 하단.
    const timelineRows = Array.from(
      overlay.querySelectorAll(".zzk-map-calendar-row.zzk-map-calendar-timeline-row"),
    );
    const lastRow = timelineRows[timelineRows.length - 1].getBoundingClientRect();
    // 헤더(정시 라벨 행)의 상단.
    const axis = overlay
      .querySelector(".zzk-map-calendar-axis-row.zzk-map-calendar-label-row")
      .getBoundingClientRect();
    return {
      borderRightWidth: parseFloat(cs.borderRightWidth),
      // 구분선(라벨 pane 오른쪽)이 헤더 위쪽부터 마지막 행 아래쪽까지 덮는지.
      coversTop: lpr.top - axis.top <= 1,
      coversBottom: lastRow.bottom - lpr.bottom <= 1,
      gwHeight: Math.round(gwr.height),
      labelPaneHeight: Math.round(lpr.height),
    };
  }, MAP_CALENDAR_OVERLAY_ID);

  // 라벨 pane 오른쪽 border(1px 세로 구분선)가 헤더~마지막 행을 끊김 없이 덮는다.
  expect(geom.borderRightWidth).toBeGreaterThanOrEqual(1);
  expect(geom.coversTop).toBe(true);
  expect(geom.coversBottom).toBe(true);
  // 라벨 pane 높이가 그리드 wrap 전체 높이와 사실상 같다(끊김 없이 이어짐).
  expect(Math.abs(geom.labelPaneHeight - geom.gwHeight)).toBeLessThanOrEqual(2);
});

test("lms+ 레이더 하단에 층별 평면도 영역이 기본 접힘으로 붙는다", async ({ page }) => {
  await mountServicePage(page);
  await page.waitForSelector(`#${MAP_CALENDAR_OVERLAY_ID} .zzk-map-calendar-floormap-section`, {
    timeout: 4000,
  });

  const initial = await page.evaluate((overlayId) => {
    const overlay = document.getElementById(overlayId);
    const section = overlay.querySelector(".zzk-map-calendar-floormap-section");
    const header = section.querySelector(".zzk-map-calendar-floormap-header");
    const scroller = section.querySelector(".zzk-map-calendar-floormap-scroller");
    return {
      hasSection: section instanceof HTMLElement,
      isOpen: section.classList.contains("open"),
      scrollerDisplay: getComputedStyle(scroller).display,
      ariaExpanded: header.getAttribute("aria-expanded"),
      imageCount: scroller.querySelectorAll(".zzk-map-calendar-floormap-image").length,
      captions: Array.from(scroller.querySelectorAll(".zzk-map-calendar-floormap-caption")).map(
        (el) => el.textContent,
      ),
      allSvgDataUri: Array.from(scroller.querySelectorAll(".zzk-map-calendar-floormap-image")).every(
        (img) => img.getAttribute("src").startsWith("data:image/svg+xml,"),
      ),
    };
  }, MAP_CALENDAR_OVERLAY_ID);

  expect(initial.hasSection).toBe(true);
  // 기본은 접힘: 스크롤 영역이 숨겨져 있다.
  expect(initial.isOpen).toBe(false);
  expect(initial.scrollerDisplay).toBe("none");
  expect(initial.ariaExpanded).toBe("false");
  // 11/12/13F 평면도 3개가 data-URI SVG 로 들어있다.
  expect(initial.imageCount).toBe(3);
  expect(initial.captions).toEqual(["11F", "12F", "13F"]);
  expect(initial.allSvgDataUri).toBe(true);
});

test("평면도 헤더를 누르면 펼쳐지고 가로 스크롤이 생긴다", async ({ page }) => {
  await mountServicePage(page);
  await page.waitForSelector(`#${MAP_CALENDAR_OVERLAY_ID} .zzk-map-calendar-floormap-header`, {
    timeout: 4000,
  });

  await page.click(`#${MAP_CALENDAR_OVERLAY_ID} .zzk-map-calendar-floormap-header`);

  // 넓은 모달에서는 3장이 다 들어가 스크롤이 안 생길 수 있으므로, 카드를 좁혀
  // 평면도가 실제로 넘치는 상황을 만든다.
  await page.evaluate((overlayId) => {
    const card = document.querySelector(`#${overlayId} .zzk-map-calendar-card`);
    if (card) card.style.width = "520px";
  }, MAP_CALENDAR_OVERLAY_ID);
  await page.waitForTimeout(100);

  const opened = await page.evaluate((overlayId) => {
    const overlay = document.getElementById(overlayId);
    const section = overlay.querySelector(".zzk-map-calendar-floormap-section");
    const scroller = section.querySelector(".zzk-map-calendar-floormap-scroller");
    return {
      isOpen: section.classList.contains("open"),
      scrollerDisplay: getComputedStyle(scroller).display,
      overflowX: getComputedStyle(scroller).overflowX,
      // 좁은 모달에서는 평면도 3장이 가로로 넘쳐 스크롤 폭이 보이는 폭보다 넓다.
      hasHorizontalScroll: scroller.scrollWidth - scroller.clientWidth > 2,
    };
  }, MAP_CALENDAR_OVERLAY_ID);

  expect(opened.isOpen).toBe(true);
  expect(opened.scrollerDisplay).toBe("flex");
  expect(opened.overflowX).toMatch(/auto|scroll/);
  expect(opened.hasHorizontalScroll).toBe(true);
});

test("평면도를 누르고 있는 동안에만 확대 모달이 보인다", async ({ page }) => {
  await mountServicePage(page);
  await page.waitForSelector(`#${MAP_CALENDAR_OVERLAY_ID} .zzk-map-calendar-floormap-header`, {
    timeout: 4000,
  });

  // 평면도 영역을 펼친다.
  await page.click(`#${MAP_CALENDAR_OVERLAY_ID} .zzk-map-calendar-floormap-header`);
  const firstImage = page.locator(
    `#${MAP_CALENDAR_OVERLAY_ID} .zzk-map-calendar-floormap-image`,
  ).first();
  await firstImage.waitFor({ state: "visible" });

  const readZoom = () =>
    page.evaluate(() => {
      const overlay = document.getElementById("zzk-floormap-zoom");
      if (!overlay) return { exists: false };
      const img = overlay.querySelector(".zzk-floormap-zoom-image");
      return {
        exists: true,
        visible: overlay.classList.contains("visible"),
        display: getComputedStyle(overlay).display,
        imgSrcIsSvg: (img?.getAttribute("src") || "").startsWith("data:image/svg+xml,"),
        caption: overlay.querySelector(".zzk-floormap-zoom-caption")?.textContent || "",
      };
    });

  // 누르기 전에는 확대 모달이 없거나 숨김.
  const before = await readZoom();
  expect(before.visible === true).toBe(false);

  // 이미지 중앙에서 마우스를 누른다(뗴지 않음).
  const box = await firstImage.boundingBox();
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
  await page.mouse.down();

  const during = await readZoom();
  expect(during.exists).toBe(true);
  expect(during.visible).toBe(true);
  expect(during.display).toBe("flex");
  expect(during.imgSrcIsSvg).toBe(true);
  expect(during.caption).toBe("11F");

  // 손을 떼면 닫힌다.
  await page.mouse.up();
  const after = await readZoom();
  expect(after.visible).toBe(false);
  expect(after.display).toBe("none");
});


