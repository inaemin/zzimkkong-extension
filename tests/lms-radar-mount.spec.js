import { expect, test } from "@playwright/test";
import {
  API_ORIGIN,
  WEB_ORIGIN,
  ensureExtensionBuild,
  jsonResponse,
  loadContentBundle,
  stubServiceDocument,
} from "./helpers/extension.js";

const MAP_CALENDAR_OVERLAY_ID = "zzk-map-calendar-overlay";
const MAP_CALENDAR_LAUNCHER_ID = "zzk-map-calendar-radar-launcher";

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

test.beforeAll(ensureExtensionBuild);

async function mountServicePage(page) {
  await stubServiceDocument(page);
  await page.route(`${API_ORIGIN}/api/**`, async (route) => {
    const url = new URL(route.request().url());
    await route.fulfill(jsonResponse(url.pathname === "/api/spaces" ? spacesFixture : []));
  });
  await page.goto(`${WEB_ORIGIN}/space-reservations`, { waitUntil: "domcontentloaded" });
  await loadContentBundle(page);
}

test("radar launcher and modal mount on the new service reservation page", async ({ page }) => {
  const pageErrors = [];
  page.on("pageerror", (error) => pageErrors.push(error.message));

  await mountServicePage(page);

  await expect
    .poll(() =>
      page.evaluate((id) => Boolean(document.getElementById(id)), MAP_CALENDAR_LAUNCHER_ID),
    )
    .toBe(true);
  await expect
    .poll(() =>
      page.evaluate((id) => Boolean(document.getElementById(id)), MAP_CALENDAR_OVERLAY_ID),
    )
    .toBe(true);

  expect(pageErrors).toEqual([]);
});

test("lms+ 런처는 오른쪽 하단 40x40 원형 아이콘 버튼이다", async ({ page }) => {
  await mountServicePage(page);
  await page.waitForSelector(`#${MAP_CALENDAR_LAUNCHER_ID}`);

  const style = await page.evaluate((id) => {
    const host = document.getElementById(id);
    // 버튼은 shadow root 안에 있다. 위치는 호스트가, 모양은 버튼이 갖는다.
    const button = host.shadowRoot.querySelector("button");
    const rect = button.getBoundingClientRect();
    return {
      position: getComputedStyle(host).position,
      width: Math.round(rect.width),
      height: Math.round(rect.height),
      borderRadius: getComputedStyle(button).borderRadius,
      // 오른쪽/아래 여백 24px 근처에 붙어 있는가
      rightGap: Math.round(window.innerWidth - rect.right),
      bottomGap: Math.round(window.innerHeight - rect.bottom),
      // 아이콘만 있고 글자는 없다.
      textContent: button.textContent.trim(),
      hasIcon: Boolean(button.querySelector("svg")),
      // 토글이므로 눌림 상태를 노출한다.
      pressed: button.getAttribute("aria-pressed"),
    };
  }, MAP_CALENDAR_LAUNCHER_ID);

  expect(style.position).toBe("fixed");
  expect(style.width).toBe(40);
  expect(style.height).toBe(40);
  expect(style.rightGap).toBeGreaterThanOrEqual(20);
  expect(style.rightGap).toBeLessThanOrEqual(28);
  expect(style.bottomGap).toBeGreaterThanOrEqual(20);
  expect(style.bottomGap).toBeLessThanOrEqual(28);
  // 아이콘만: 글자는 없다.
  expect(style.textContent).toBe("");
  expect(style.hasIcon).toBe(true);
  expect(style.pressed).not.toBeNull();
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

test("API 403 still renders the modal shell with an error message, not a blank", async ({
  page,
}) => {
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
  await loadContentBundle(page);

  // API 가 실패해도 오버레이(모달 껍데기)는 떠야 하고, 에러 메시지가 보여야 한다.
  await expect
    .poll(() =>
      page.evaluate((id) => Boolean(document.getElementById(id)), MAP_CALENDAR_OVERLAY_ID),
    )
    .toBe(true);

  const errorText = await page.evaluate(() => {
    const el = window.__zzkQuery('[data-testid="radar-error-message"]');
    return el ? el.textContent : null;
  });
  expect(errorText).toContain("로그인");

  // 다시 시도 버튼도 있어야 한다.
  const hasRetry = await page.evaluate(() =>
    Boolean(window.__zzkQuery('[data-testid="radar-error-retry"]')),
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
  await loadContentBundle(page);

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
    const overlay = window.__zzkRoot();
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
test("라벨 pane 은 타임라인 스크롤과 분리돼 타임블록이 침범하지 못한다(모달 축소 + 가로 스크롤 맨 끝)", async ({
  page,
}) => {
  await mountServicePage(page);
  await page.waitForSelector(`#${MAP_CALENDAR_OVERLAY_ID} .zzk-map-calendar-slot`, {
    timeout: 4000,
  });

  // 가로 스크롤이 생기도록 카드 폭을 좁히고, 스크롤을 맨 끝으로 옮긴다.
  await page.evaluate((overlayId) => {
    const card = window.__zzkQuery('[data-testid="radar-card"]');
    if (card) card.style.width = "520px";
  }, MAP_CALENDAR_OVERLAY_ID);
  await page.waitForTimeout(200);

  const result = await page.evaluate((overlayId) => {
    const overlay = window.__zzkRoot();
    const labelPane = overlay.querySelector('[data-testid="radar-label-pane"]');
    const pane = overlay.querySelector('[data-testid="radar-timeline-pane"]');

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
    const pane = window.__zzkQuery('[data-testid="radar-timeline-pane"]');
    pane.scrollLeft = 0;
  }, MAP_CALENDAR_OVERLAY_ID);
  await page.waitForTimeout(200);

  const geom = await page.evaluate((overlayId) => {
    const overlay = window.__zzkRoot();
    const row = overlay.querySelector(".zzk-map-calendar-row.zzk-map-calendar-timeline-row");
    const slots = Array.from(row.querySelectorAll(".zzk-map-calendar-slot"));
    const byLabel = (label) => slots.find((s) => s.dataset.zzkSlotStart === label);
    const s0700 = byLabel("07:00");
    const s0730 = byLabel("07:30");
    const s0800 = byLabel("08:00");
    // 타임라인 트랙(스크롤 콘텐츠)의 왼쪽 = 07:00 앞 여백의 시작점.
    const tl = overlay.querySelector(".zzk-map-calendar-timeline-track").getBoundingClientRect();

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
    const overlay = window.__zzkRoot();
    const gw = overlay.querySelector(".zzk-map-calendar-grid-wrap");
    const gwr = gw.getBoundingClientRect();
    // 회의실↔타임블록 세로 구분선 = 라벨 pane 의 오른쪽 border.
    const labelPane = overlay.querySelector('[data-testid="radar-label-pane"]');
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
  await page.waitForSelector(`#${MAP_CALENDAR_OVERLAY_ID} [data-testid="radar-floormaps"]`, {
    timeout: 4000,
  });

  const initial = await page.evaluate((overlayId) => {
    const overlay = window.__zzkRoot();
    const section = overlay.querySelector('[data-testid="radar-floormaps"]');
    const header = section.querySelector('[data-testid="radar-floormaps-toggle"]');
    const scroller = section.querySelector('[data-testid="radar-floormaps-scroller"]');
    return {
      hasSection: section instanceof HTMLElement,
      isOpen: section.classList.contains("open"),
      scrollerDisplay: getComputedStyle(scroller).display,
      ariaExpanded: header.getAttribute("aria-expanded"),
      imageCount: scroller.querySelectorAll(".zzk-map-calendar-floormap-image").length,
      captions: Array.from(scroller.querySelectorAll(".zzk-map-calendar-floormap-caption")).map(
        (el) => el.textContent,
      ),
      allSvgDataUri: Array.from(
        scroller.querySelectorAll(".zzk-map-calendar-floormap-image"),
      ).every((img) => img.getAttribute("src").startsWith("data:image/svg+xml,")),
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
  await page.waitForSelector(`#${MAP_CALENDAR_OVERLAY_ID} [data-testid="radar-floormaps-toggle"]`, {
    timeout: 4000,
  });

  await page.click(`#${MAP_CALENDAR_OVERLAY_ID} [data-testid="radar-floormaps-toggle"]`);

  // 넓은 모달에서는 3장이 다 들어가 스크롤이 안 생길 수 있으므로, 카드를 좁혀
  // 평면도가 실제로 넘치는 상황을 만든다.
  await page.evaluate((overlayId) => {
    const card = window.__zzkQuery('[data-testid="radar-card"]');
    if (card) card.style.width = "520px";
  }, MAP_CALENDAR_OVERLAY_ID);

  // 폭 변경이 레이아웃에 반영돼 가로 넘침이 생길 때까지 고정 대기 대신 조건을 폴링한다.
  await expect
    .poll(
      () =>
        page.evaluate((overlayId) => {
          const scroller = window.__zzkQuery('[data-testid="radar-floormaps-scroller"]');
          return scroller ? scroller.scrollWidth - scroller.clientWidth > 2 : false;
        }, MAP_CALENDAR_OVERLAY_ID),
      { timeout: 3000 },
    )
    .toBe(true);

  const opened = await page.evaluate((overlayId) => {
    const overlay = window.__zzkRoot();
    const section = overlay.querySelector('[data-testid="radar-floormaps"]');
    const scroller = section.querySelector('[data-testid="radar-floormaps-scroller"]');
    return {
      isOpen: section.classList.contains("open"),
      scrollerDisplay: getComputedStyle(scroller).display,
      overflowX: getComputedStyle(scroller).overflowX,
    };
  }, MAP_CALENDAR_OVERLAY_ID);

  expect(opened.isOpen).toBe(true);
  expect(opened.scrollerDisplay).toBe("flex");
  expect(opened.overflowX).toMatch(/auto|scroll/);
});

test("평면도를 누르고 있는 동안에만 확대 모달이 보인다", async ({ page }) => {
  await mountServicePage(page);
  await page.waitForSelector(`#${MAP_CALENDAR_OVERLAY_ID} [data-testid="radar-floormaps-toggle"]`, {
    timeout: 4000,
  });

  // 평면도 영역을 펼친다.
  await page.click(`#${MAP_CALENDAR_OVERLAY_ID} [data-testid="radar-floormaps-toggle"]`);
  const firstImage = page
    .locator(`#${MAP_CALENDAR_OVERLAY_ID} .zzk-map-calendar-floormap-image`)
    .first();
  await firstImage.waitFor({ state: "visible" });

  const readZoom = () =>
    page.evaluate(() => {
      // 확대 뷰는 React 마운트(shadow root) 안에 있다.
      const host = document.getElementById("zzk-floormap-zoom-root");
      const overlay = host?.shadowRoot?.getElementById("zzk-floormap-zoom");
      if (!overlay) return { exists: false };
      const img = overlay.querySelector(".zzk-floormap-zoom-image");
      return {
        exists: true,
        visible: overlay.dataset.visible === "true",
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

test("리렌더돼도 평면도 가로 스크롤 위치가 유지된다", async ({ page }) => {
  await mountServicePage(page);
  await page.waitForSelector(`#${MAP_CALENDAR_OVERLAY_ID} [data-testid="radar-floormaps-toggle"]`, {
    timeout: 4000,
  });

  // 평면도를 펼치고, 가로로 넘치도록 카드를 좁힌다.
  await page.click(`#${MAP_CALENDAR_OVERLAY_ID} [data-testid="radar-floormaps-toggle"]`);
  await page.evaluate((overlayId) => {
    const card = window.__zzkQuery('[data-testid="radar-card"]');
    if (card) card.style.width = "520px";
  }, MAP_CALENDAR_OVERLAY_ID);
  await expect
    .poll(() =>
      page.evaluate((overlayId) => {
        const s = window.__zzkQuery('[data-testid="radar-floormaps-scroller"]');
        return s ? s.scrollWidth - s.clientWidth > 2 : false;
      }, MAP_CALENDAR_OVERLAY_ID),
    )
    .toBe(true);

  // 평면도를 오른쪽으로 스크롤한다.
  await page.evaluate((overlayId) => {
    const s = window.__zzkQuery('[data-testid="radar-floormaps-scroller"]');
    s.scrollLeft = s.scrollWidth - s.clientWidth; // 맨 오른쪽(13F)
  }, MAP_CALENDAR_OVERLAY_ID);
  const scrolled = await page.evaluate(
    (overlayId) =>
      Math.round(window.__zzkQuery('[data-testid="radar-floormaps-scroller"]').scrollLeft),
    MAP_CALENDAR_OVERLAY_ID,
  );
  expect(scrolled).toBeGreaterThan(0);

  // 리렌더를 유발한다(슬롯 hover 로 자주 일어나는 그 재렌더).
  await page.evaluate(() => window.__zzkTestApi?.renderScheduleForDate?.("2099-01-02"));
  // 좁힌 카드 폭은 리렌더로 초기화되므로 다시 좁히고, 스크롤 복원(다음 프레임)을 기다린다.
  await page.evaluate((overlayId) => {
    const card = window.__zzkQuery('[data-testid="radar-card"]');
    if (card) card.style.width = "520px";
  }, MAP_CALENDAR_OVERLAY_ID);

  // 리렌더 후에도 평면도 스크롤 위치가 맨 앞(0)으로 튀지 않고 유지돼야 한다.
  await expect
    .poll(() =>
      page.evaluate(
        (overlayId) =>
          Math.round(window.__zzkQuery('[data-testid="radar-floormaps-scroller"]').scrollLeft),
        MAP_CALENDAR_OVERLAY_ID,
      ),
    )
    .toBeGreaterThan(0);
});

// 호스트(lms+)도 shadcn/Tailwind 를 쓰므로 .bg-background 같은 유틸리티 이름이 겹친다.
// 우리 스타일시트는 head 앞쪽에 주입돼서, 명시도가 같으면 뒤에 오는 호스트가 이긴다.
// 달력이 그 영향으로 불투명해지면 팝오버 그림자를 덮어버린다.
test("호스트 CSS 가 있어도 달력 배경은 투명하다", async ({ page }) => {
  await mountServicePage(page);
  await page.waitForSelector(`#${MAP_CALENDAR_OVERLAY_ID} [aria-label="지도 날짜 선택"]`, {
    timeout: 4000,
  });
  await page.click(`#${MAP_CALENDAR_OVERLAY_ID} [aria-label="지도 날짜 선택"]`);

  const calendar = page.locator('[data-slot="calendar"]');
  await calendar.waitFor({ state: "visible" });

  const rendered = await page.evaluate(() => {
    const host = [...document.head.querySelectorAll("style")].find(
      (style) => !style.id.startsWith("zzk-"),
    );
    const calendarElement = window.__zzkQuery('[data-slot="calendar"]');
    return {
      // 호스트 CSS 가 실제로 로드된 상태에서 검증하는지 확인한다.
      hostStyleHasBgBackground: Boolean(host?.textContent.includes(".bg-background")),
      calendarBackground: getComputedStyle(calendarElement).backgroundColor,
    };
  });

  expect(rendered.hostStyleHasBgBackground).toBe(true);
  expect(rendered.calendarBackground).toBe("rgba(0, 0, 0, 0)");
});

// 지난 시간이면서 예약도 있었던 칸은 "그냥 비어 있던 과거"와 구분해서 보여준다.
// 둘 다 못 고르는 건 같지만, 예약이 있었다면 누가 썼는지가 정보로 남는다.
test("지난 예약 칸은 더 진하고 예약 내용을 알려준다", async ({ page }) => {
  // 시각을 고정한다. "지금"에 의존하면 실행 시각에 따라 결과가 달라진다 —
  // 예를 들어 운영 종료(23:00) 뒤에 돌리면 오늘 전체가 과거라 레이더가 다음 날을
  // 띄우고, 그러면 "지난 칸"이 하나도 안 생긴다.
  // 날짜는 실제 오늘을 쓰고 시각만 정오로 고정한다. 날짜를 박아두면 언젠가
  // 만료되고, 시각을 안 고정하면 실행 시각에 따라 결과가 달라진다.
  const today = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Seoul",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date());
  await page.clock.setFixedTime(new Date(`${today}T12:00:00+09:00`));

  await stubServiceDocument(page);

  await page.route(`${API_ORIGIN}/api/**`, async (route) => {
    const url = new URL(route.request().url());
    if (url.pathname === "/api/spaces") {
      await route.fulfill(jsonResponse(spacesFixture));
      return;
    }
    // 07:00~08:00 은 항상 과거다(레이더는 07:00 부터 그린다).
    await route.fulfill(
      jsonResponse([
        {
          id: 999,
          spaceId: spacesFixture[0].id,
          spaceName: spacesFixture[0].name,
          floor: spacesFixture[0].floor,
          date: today,
          startTime: "07:00:00",
          endTime: "08:00:00",
          mine: false,
          purpose: "학습",
          reserverName: "아무개",
        },
      ]),
    );
  });

  await page.goto(`${WEB_ORIGIN}/space-reservations`, { waitUntil: "domcontentloaded" });
  await loadContentBundle(page);
  await page.waitForSelector(`#${MAP_CALENDAR_OVERLAY_ID} .zzk-map-calendar-slot`, {
    timeout: 4000,
  });

  const rendered = await page.evaluate((overlayId) => {
    const overlay = window.__zzkRoot();
    const pastReserved = overlay.querySelector(".zzk-map-calendar-slot.past-reserved");
    const pastEmpty = overlay.querySelector(
      ".zzk-map-calendar-slot.past-blocked:not(.past-reserved)",
    );
    const alpha = (color) => Number(color.match(/[\d.]+\)$/)?.[0].replace(")", "") ?? 1);
    return {
      count: overlay.querySelectorAll(".past-reserved").length,
      reservedAlpha: alpha(getComputedStyle(pastReserved).backgroundColor),
      emptyAlpha: alpha(getComputedStyle(pastEmpty).backgroundColor),
    };
  }, MAP_CALENDAR_OVERLAY_ID);

  expect(rendered.count).toBeGreaterThan(0);
  // 빈 과거보다 진해야 구분이 된다.
  expect(rendered.reservedAlpha).toBeGreaterThan(rendered.emptyAlpha);

  // 예약 내용은 툴팁으로 알려준다(hover 즉시 뜬다).
  const pastReservedSlot = page
    .locator(`#${MAP_CALENDAR_OVERLAY_ID} .zzk-map-calendar-slot.past-reserved`)
    .first();
  const slotBox = await pastReservedSlot.boundingBox();
  await page.mouse.move(slotBox.x + slotBox.width / 2, slotBox.y + slotBox.height / 2);

  const tooltip = page.locator('[data-slot="tooltip-content"]');
  await expect(tooltip).toContainText("지난 예약");
  await expect(tooltip).toContainText("아무개");

  // 예약 내용은 줄을 바꿔 보여준다(한 줄로 붙으면 읽기 어렵다).
  const tooltipText = await tooltip.textContent();
  expect(tooltipText).toContain("\n");

  // 예약이 없는 칸은 툴팁을 띄우지 않는다. "예약 없음"도 "선택 불가(현재 시간
  // 이전)"도 칸 색으로 이미 드러나고, 둘을 합치면 대부분의 칸이라 지나갈 때마다
  // 뜨면 방해가 된다.
  for (const selector of [
    ".zzk-map-calendar-slot.free:not(.past-blocked)",
    // 지나갔지만 예약은 없었던 칸.
    ".zzk-map-calendar-slot.past-blocked:not(.past-reserved)",
  ]) {
    const quietSlot = page.locator(`#${MAP_CALENDAR_OVERLAY_ID} ${selector}`).first();
    const quietBox = await quietSlot.boundingBox();
    await page.mouse.move(quietBox.x + quietBox.width / 2, quietBox.y + quietBox.height / 2);
    await expect(tooltip, `${selector} 에 툴팁이 뜨면 안 된다`).toHaveCount(0);
  }
});

// 정보 버튼 팝오버는 카드 바깥 층에 뜬다.
//
// 카드 안(헤더)에 렌더하면 카드가 position: relative + overflow: hidden 이라
// 팝오버 높이만큼 scrollHeight 가 늘어 레이아웃이 밀린다(155 → 218px).
test("범례 팝오버가 카드 크기를 바꾸지 않는다", async ({ page }) => {
  await mountServicePage(page);
  await page.waitForSelector(`#${MAP_CALENDAR_OVERLAY_ID} .zzk-map-calendar-slot`, {
    timeout: 4000,
  });

  const measure = () =>
    page.evaluate(() => {
      const card = window.__zzkQuery('[data-testid="radar-card"]');
      return { scrollHeight: card.scrollHeight, scrollWidth: card.scrollWidth };
    });

  const before = await measure();

  const trigger = page.locator(`#${MAP_CALENDAR_OVERLAY_ID} button[aria-label="타임블록 색 설명"]`);
  await trigger.hover();
  await expect(page.locator('[data-slot="popover-content"]')).toBeVisible();

  expect(await measure()).toEqual(before);
});

// 에러 화면과 정상 오버레이는 같은 엘리먼트에 그려진다(React 루트 공유).
// 한쪽이 남은 DOM 을 다른 쪽이 만나면 깨지므로 전환을 확인한다.
test("에러 화면에서 다시 시도하면 정상 오버레이로 바뀐다", async ({ page }) => {
  let shouldFail = true;

  await stubServiceDocument(page);
  await page.route(`${API_ORIGIN}/api/**`, async (route) => {
    const url = new URL(route.request().url());
    if (url.pathname !== "/api/spaces") {
      await route.fulfill(jsonResponse([]));
      return;
    }
    if (shouldFail) {
      await route.fulfill({
        status: 401,
        headers: {
          "access-control-allow-origin": WEB_ORIGIN,
          "access-control-allow-credentials": "true",
          "content-type": "application/json",
        },
        body: "",
      });
      return;
    }
    await route.fulfill(jsonResponse(spacesFixture));
  });

  await page.goto(`${WEB_ORIGIN}/space-reservations`, { waitUntil: "domcontentloaded" });
  await loadContentBundle(page);

  await page.waitForSelector(`#${MAP_CALENDAR_OVERLAY_ID} [data-testid="radar-error-message"]`, {
    timeout: 5000,
  });

  shouldFail = false;
  await page.click(`#${MAP_CALENDAR_OVERLAY_ID} [data-testid="radar-error-retry"]`);

  // 에러가 사라지고 슬롯이 그려져야 한다.
  await expect
    .poll(() =>
      page.evaluate(
        (overlayId) => window.__zzkQueryAll(".zzk-map-calendar-slot").length,
        MAP_CALENDAR_OVERLAY_ID,
      ),
    )
    .toBeGreaterThan(0);

  const stillHasError = await page.evaluate(
    (overlayId) => Boolean(window.__zzkQuery('[data-testid="radar-error-message"]')),
    MAP_CALENDAR_OVERLAY_ID,
  );
  expect(stillHasError).toBe(false);
});

// 공간이 하나도 없으면 그리드 대신 안내 문구를 보여준다.
// (평면도는 일정과 무관하게 유용하므로 계속 보여준다.)
test("표시할 일정이 없으면 안내 문구가 뜬다", async ({ page }) => {
  await stubServiceDocument(page);
  await page.route(`${API_ORIGIN}/api/**`, async (route) => {
    await route.fulfill(jsonResponse([]));
  });

  await page.goto(`${WEB_ORIGIN}/space-reservations`, { waitUntil: "domcontentloaded" });
  await loadContentBundle(page);

  await expect
    .poll(() =>
      page.evaluate(
        (overlayId) => window.__zzkQuery('[data-testid="radar-empty"]')?.textContent ?? null,
        MAP_CALENDAR_OVERLAY_ID,
      ),
    )
    .toContain("표시할");

  const rendered = await page.evaluate((overlayId) => {
    const overlay = window.__zzkRoot();
    return {
      slots: overlay.querySelectorAll(".zzk-map-calendar-slot").length,
      hasFloorMaps: Boolean(overlay.querySelector('[data-testid="radar-floormaps"]')),
    };
  }, MAP_CALENDAR_OVERLAY_ID);

  expect(rendered.slots).toBe(0);
  expect(rendered.hasFloorMaps).toBe(true);
});

// "항상 열기"를 끄면 오버레이가 열린 채로 남는다. 그때 헤더를 다시 그리지 않으면
// 값만 바뀌고 스위치는 켜진 채로 보인다.
test("항상 열기 스위치가 양방향으로 토글된다", async ({ page }) => {
  await mountServicePage(page);

  const switchSelector = `#${MAP_CALENDAR_OVERLAY_ID} [aria-label="지도 타임블록 항상 열기"]`;
  await page.waitForSelector(switchSelector, { timeout: 4000 });

  const readChecked = () =>
    page.evaluate(() =>
      window.__zzkQuery('[aria-label="지도 타임블록 항상 열기"]')?.getAttribute("aria-checked"),
    );

  expect(await readChecked()).toBe("true");

  await page.click(switchSelector);
  await expect.poll(readChecked).toBe("false");

  await page.click(switchSelector);
  await expect.poll(readChecked).toBe("true");
});

// 범례는 잠깐 확인하고 마는 정보라 클릭 없이 hover 로 열린다.
test("범례는 hover 만으로 열리고 벗어나면 닫힌다", async ({ page }) => {
  await mountServicePage(page);

  const legendButton = `#${MAP_CALENDAR_OVERLAY_ID} [aria-label="타임블록 색 설명"]`;
  await page.waitForSelector(legendButton, { timeout: 4000 });

  const box = await page.locator(legendButton).boundingBox();
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);

  // 5개 항목(비어 있음/예약 있음/선택한 시간/지난 시간/지난 예약)이 모두 있어야 한다.
  await expect
    .poll(() =>
      page.evaluate(() => window.__zzkQueryAll('[data-slot="popover-content"] li').length),
    )
    .toBe(5);

  await page.mouse.move(box.x - 200, box.y + 200);
  await expect
    .poll(() => page.evaluate(() => Boolean(window.__zzkQuery('[data-slot="popover-content"]'))))
    .toBe(false);
});
