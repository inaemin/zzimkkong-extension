import path from "node:path";
import { expect, test } from "@playwright/test";

const WEB_ORIGIN = "https://techcourse-lms-plus-web.woowahan.com";
const API_ORIGIN = "https://techcourse-lms-plus-api.woowahan.com";

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
  "src/features/radar/shared.js",
  "src/features/radar/workflow.js",
  "src/features/radar/form-sync.js",
  "src/content.js",
];

// 개편 서비스 실제 예약 폼(주신 HTML)을 축약해 재현한다.
const LMS_FORM_HTML = `
<div class="container">
  <input type="date" value="2099-01-02">
  <div>
    <p class="text-muted-foreground">13F</p>
    <div class="flex flex-wrap gap-2">
      <button class="cursor-pointer rounded-md border px-3 py-1.5 text-sm border-border">은하수</button>
      <button class="cursor-pointer rounded-md border px-3 py-1.5 text-sm border-primary bg-primary text-primary-foreground">허블</button>
    </div>
  </div>
  <div class="reserve">
    <label><span>시작 시간</span>
      <select>
        <option value="" disabled>시작 시간 선택</option>
        <option value="09:00">09:00</option>
        <option value="09:30">09:30</option>
        <option value="10:00">10:00</option>
        <option value="10:30">10:30</option>
        <option value="11:00">11:00</option>
      </select>
    </label>
    <label><span>이용 시간</span>
      <select>
        <option value="1">30분</option>
        <option value="2">60분</option>
      </select>
    </label>
    <label><span>예약 목적</span>
      <input type="text" value="">
    </label>
  </div>
</div>`;

async function mountFormPage(page, reservationsBySpaceId = {}) {
  await page.route(`${WEB_ORIGIN}/**`, async (route) => {
    if (route.request().resourceType() !== "document") {
      await route.continue();
      return;
    }
    await route.fulfill({
      status: 200,
      contentType: "text/html; charset=utf-8",
      body: `<html><head><meta charset="utf-8"></head><body><main>${LMS_FORM_HTML}</main></body></html>`,
    });
  });
  await page.route(`${API_ORIGIN}/api/**`, async (route) => {
    const url = new URL(route.request().url());
    let body = [];
    if (url.pathname === "/api/spaces") {
      body = [
        { id: 8, name: "허블", floor: 12, active: true, openTime: "07:00:00", closeTime: "23:00:00" },
        { id: 9, name: "은하수", floor: 13, active: true, openTime: "07:00:00", closeTime: "23:00:00" },
      ];
    } else if (url.pathname === "/api/space-reservations") {
      const spaceId = url.searchParams.get("spaceId");
      body = reservationsBySpaceId[spaceId] || [];
    }
    await route.fulfill({
      status: 200,
      headers: {
        "access-control-allow-origin": WEB_ORIGIN,
        "access-control-allow-credentials": "true",
        "content-type": "application/json",
      },
      body: JSON.stringify(body),
    });
  });

  await page.goto(`${WEB_ORIGIN}/space-reservations`, { waitUntil: "domcontentloaded" });
  // 실제 앱처럼 회의실 버튼 클릭 시 선택 표시(bg-primary)가 이동하도록 흉내낸다.
  await page.addScriptTag({
    content: `
      document.addEventListener("click", (event) => {
        const btn = event.target.closest("button");
        if (!btn) return;
        const label = (btn.textContent || "").trim();
        if (!["은하수", "허블"].includes(label)) return;
        document.querySelectorAll("button").forEach((b) => {
          const t = (b.textContent || "").trim();
          if (["은하수", "허블"].includes(t)) {
            b.className = b.className.replace(/\\s*border-primary\\s*/g, " ")
              .replace(/\\s*bg-primary\\s*/g, " ")
              .replace(/\\s*text-primary-foreground\\s*/g, " ") + " border-border";
          }
        });
        btn.className = btn.className.replace(/\\s*border-border\\s*/g, " ") +
          " border-primary bg-primary text-primary-foreground";
      }, true);
    `,
  });
  await page.addScriptTag({ content: "window.__ZZK_DEBUG_MODE__ = true;" });
  for (const scriptPath of CONTENT_SCRIPT_BUNDLE) {
    await page.addScriptTag({ path: path.resolve(process.cwd(), scriptPath) });
  }
  await page.waitForFunction(() => window.__zzkAvailabilityLensLoaded === true, undefined, {
    timeout: 3000,
  });
  await page.waitForFunction(() => Boolean(window.__zzkTestApi), undefined, { timeout: 3000 });
}

function readFormState(page) {
  return page.evaluate(() => {
    const selects = Array.from(document.querySelectorAll("select"));
    const startSelect = selects.find((s) =>
      Array.from(s.options).some((o) => /^\d{2}:\d{2}$/.test(o.value)),
    );
    const durationSelect = selects.find(
      (s) =>
        !Array.from(s.options).some((o) => /^\d{2}:\d{2}$/.test(o.value)) &&
        Array.from(s.options).some((o) => /^\d+$/.test(o.value)),
    );
    const selectedRoom = Array.from(document.querySelectorAll("button")).find((b) =>
      b.className.includes("bg-primary"),
    );
    const dateInput = document.querySelector('input[type="date"]');
    return {
      start: startSelect ? startSelect.value : null,
      duration: durationSelect ? durationSelect.value : null,
      room: selectedRoom ? (selectedRoom.textContent || "").trim() : null,
      date: dateInput ? dateInput.value : null,
    };
  });
}

test("syncLmsReservationForm sets room, start time, and 60min duration", async ({ page }) => {
  await mountFormPage(page);

  const result = await page.evaluate(() =>
    window.__zzkTestApi.syncLmsReservationForm({
      date: "2099-01-02",
      startTime: "10:00",
      endTime: "11:00",
      roomId: 9,
      roomName: "은하수",
    }),
  );
  expect(result).toBe(true);

  const formState = await readFormState(page);
  expect(formState.start).toBe("10:00");
  expect(formState.duration).toBe("2"); // 60분 = 30분 단위 2칸
  expect(formState.room).toBe("은하수"); // 허블 → 은하수 로 전환
});

test("syncLmsReservationForm updates the page date input when the radar date changes", async ({
  page,
}) => {
  await mountFormPage(page);

  // 페이지 기본 날짜는 2099-01-02. 레이더에서 다른 날짜를 고른 상황을 흉내낸다.
  const before = await readFormState(page);
  expect(before.date).toBe("2099-01-02");

  const result = await page.evaluate(() =>
    window.__zzkTestApi.syncLmsReservationForm({
      date: "2099-01-05",
      startTime: "10:00",
      endTime: "11:00",
      roomId: 9,
      roomName: "은하수",
    }),
  );
  expect(result).toBe(true);

  const formState = await readFormState(page);
  // 날짜가 폼 input 에 반영돼야 한다.
  expect(formState.date).toBe("2099-01-05");
  // 나머지 필드도 함께 맞춰진다.
  expect(formState.start).toBe("10:00");
  expect(formState.duration).toBe("2");
  expect(formState.room).toBe("은하수");
});

test("syncLmsReservationForm sets 30min duration for a 30-minute window", async ({ page }) => {
  await mountFormPage(page);

  const result = await page.evaluate(() =>
    window.__zzkTestApi.syncLmsReservationForm({
      date: "2099-01-02",
      startTime: "09:30",
      endTime: "10:00",
      roomId: 9,
      roomName: "은하수",
    }),
  );
  expect(result).toBe(true);

  const formState = await readFormState(page);
  expect(formState.start).toBe("09:30");
  expect(formState.duration).toBe("1"); // 30분 = 1칸
  expect(formState.room).toBe("은하수");
});

test("clicking a 30-min block wires through to the lms+ form", async ({ page }) => {
  await mountFormPage(page);

  // 부팅 시 자동 렌더(오늘 날짜)가 끝난 뒤에 미래 날짜로 다시 렌더해야 캐시/인플라이트와 안 얽힌다.
  await page.waitForSelector("#zzk-map-calendar-overlay .zzk-map-calendar-slot", { timeout: 4000 });
  // 미래 날짜(2099) 스케줄을 직접 렌더해 과거-차단 없이 슬롯을 클릭한다.
  await expect
    .poll(
      async () => {
        await page.evaluate(() => window.__zzkTestApi.renderScheduleForDate("2099-01-02"));
        return page.evaluate(() => {
          const slot = document.querySelector(".zzk-map-calendar-slot");
          return slot ? !slot.className.includes("past-blocked") : false;
        });
      },
      { timeout: 6000, intervals: [200, 300, 500, 800] },
    )
    .toBe(true);

  const clicked = await page.evaluate(() => {
    const labelRows = Array.from(
      document.querySelectorAll(".zzk-map-calendar-row.zzk-map-calendar-label-row"),
    );
    const labelRow = labelRows.find((r) => {
      const n = r.querySelector(".zzk-map-calendar-room-name");
      return n && (n.textContent || "").includes("은하수");
    });
    const row = labelRow && labelRow.__zzkTimelineRow;
    if (!row) return { ok: false };
    const slot = row.querySelector('.zzk-map-calendar-slot[data-zzk-slot-start="10:00"]');
    if (!slot) return { ok: false };
    slot.click();
    return { ok: true };
  });
  expect(clicked.ok).toBe(true);

  await expect.poll(async () => (await readFormState(page)).start).toBe("10:00");
  const formState = await readFormState(page);
  expect(formState.duration).toBe("2");
  expect(formState.room).toBe("은하수");
});

// 은하수 행의 특정 슬롯을 실제로 hover 한다.
async function hoverSlot(page, label) {
  const handle = await page.evaluateHandle((label) => {
    const labelRows = Array.from(
      document.querySelectorAll(".zzk-map-calendar-row.zzk-map-calendar-label-row"),
    );
    const labelRow = labelRows.find((r) => {
      const n = r.querySelector(".zzk-map-calendar-room-name");
      return n && (n.textContent || "").includes("은하수");
    });
    const row = labelRow && labelRow.__zzkTimelineRow;
    return row
      ? row.querySelector(`.zzk-map-calendar-slot[data-zzk-slot-start="${label}"]`)
      : null;
  }, label);
  await handle.hover();
}

function readHoverPreview(page) {
  return page.evaluate(() => {
    const labelRows = Array.from(
      document.querySelectorAll(".zzk-map-calendar-row.zzk-map-calendar-label-row"),
    );
    const labelRow = labelRows.find((r) => {
      const n = r.querySelector(".zzk-map-calendar-room-name");
      return n && (n.textContent || "").includes("은하수");
    });
    const row = labelRow && labelRow.__zzkTimelineRow;
    if (!row) return [];
    return Array.from(row.querySelectorAll(".zzk-map-calendar-slot"))
      .filter((s) => s.className.includes("hover-preview"))
      .map((s) => s.dataset.zzkSlotStart);
  });
}

test("hover previews the default 60min (2 slots), or 1 slot when the next is reserved", async ({
  page,
}) => {
  // 은하수 11:00~11:30 예약 → 10:30 hover 시 다음 칸(11:00)이 막혀 1칸만 미리보기.
  await mountFormPage(page, {
    9: [
      {
        date: "2099-01-02",
        startTime: "11:00:00",
        endTime: "11:30:00",
        spaceId: 9,
        id: 9002,
        purpose: "회의",
        reserverName: "누군가",
        mine: false,
      },
    ],
  });

  await page.waitForSelector("#zzk-map-calendar-overlay .zzk-map-calendar-slot", { timeout: 4000 });
  await expect
    .poll(
      async () => {
        await page.evaluate(() => window.__zzkTestApi.renderScheduleForDate("2099-01-02"));
        return page.evaluate(() => {
          const slot = document.querySelector(".zzk-map-calendar-slot");
          return slot ? !slot.className.includes("past-blocked") : false;
        });
      },
      { timeout: 6000, intervals: [200, 300, 500, 800] },
    )
    .toBe(true);

  // 10:00 hover → 10:00 + 10:30 두 칸 미리보기(기본 60분).
  await hoverSlot(page, "10:00");
  await expect.poll(() => readHoverPreview(page)).toEqual(["10:00", "10:30"]);

  // 10:30 hover → 다음 칸 11:00 이 예약이라 한 칸만.
  await hoverSlot(page, "10:30");
  await expect.poll(() => readHoverPreview(page)).toEqual(["10:30"]);
});

test("슬롯 hover 시 회의실 이름 셀에도 파란 배경이 적용된다", async ({ page }) => {
  await mountFormPage(page);

  await page.waitForSelector("#zzk-map-calendar-overlay .zzk-map-calendar-slot", { timeout: 4000 });
  await expect
    .poll(
      async () => {
        await page.evaluate(() => window.__zzkTestApi.renderScheduleForDate("2099-01-02"));
        return page.evaluate(() => {
          const slot = document.querySelector(".zzk-map-calendar-slot");
          return slot ? !slot.className.includes("past-blocked") : false;
        });
      },
      { timeout: 6000, intervals: [200, 300, 500, 800] },
    )
    .toBe(true);

  await hoverSlot(page, "10:00");

  const style = await page.evaluate(() => {
    const rows = Array.from(document.querySelectorAll(".zzk-map-calendar-row"));
    const row = rows.find((r) => {
      const n = r.querySelector(".zzk-map-calendar-room-name");
      return n && (n.textContent || "").includes("은하수");
    });
    if (!row) return null;
    const roomName = row.querySelector(".zzk-map-calendar-room-name");
    return {
      rowHovered: row.className.includes("hovered"),
      rowBg: getComputedStyle(row).backgroundColor,
      // 회의실 이름 셀 배경이 흰색이 아니라 파란 틴트여야 한다.
      cellBg: getComputedStyle(roomName).backgroundColor,
    };
  });

  expect(style).not.toBeNull();
  expect(style.rowHovered).toBe(true);
  // 행 배경은 반투명 파랑.
  expect(style.rowBg).toBe("rgba(14, 165, 233, 0.12)");
  // 라벨 셀 배경도 파란 틴트(#e3f4fd)로 바뀌어 라벨 쪽도 파랗게 보인다.
  expect(style.cellBg).toBe("rgb(227, 244, 253)");
});

function readOverlayScroll(page) {
  return page.evaluate(() => {
    const body = document.querySelector("#zzk-map-calendar-overlay .zzk-map-calendar-body");
    if (!body) return null;
    return { scrollLeft: body.scrollLeft, maxScroll: body.scrollWidth - body.clientWidth };
  });
}

test("today scrolls near current time; a future date resets to the start", async ({ page }) => {
  await mountFormPage(page);
  await page.setViewportSize({ width: 640, height: 600 });
  await page.waitForSelector("#zzk-map-calendar-overlay .zzk-map-calendar-slot", { timeout: 4000 });

  const todayIso = await page.evaluate(() =>
    new Date().toLocaleDateString("en-CA", { timeZone: "Asia/Seoul" }),
  );

  // 오늘 렌더 후 스크롤 위치를 기록해 둔다(현재 시각/뷰포트에 따라 값이 달라 단정하지 않는다).
  await page.evaluate((d) => window.__zzkTestApi.renderScheduleForDate(d), todayIso);
  await page.waitForTimeout(600);
  const today = await readOverlayScroll(page);
  test.skip(!today || today.maxScroll <= 0, "가로 스크롤이 없는 환경");

  // 오늘을 스크롤한 상태에서 미래로 넘긴 뒤에도 위치가 남으면 안 된다.
  // 확실히 하기 위해 스크롤을 끝으로 밀어 놓고 미래 날짜를 렌더한다.
  await page.evaluate(() => {
    const body = document.querySelector("#zzk-map-calendar-overlay .zzk-map-calendar-body");
    body.scrollLeft = body.scrollWidth;
  });

  // 미래 날짜: 재사용된 오버레이라도 맨 처음(0)으로 되돌아와야 한다.
  await page.evaluate(() => window.__zzkTestApi.renderScheduleForDate("2099-01-02"));
  await page.waitForTimeout(600);
  const future = await readOverlayScroll(page);
  expect(future.scrollLeft).toBe(0);
});

test("드래그로 옮긴 모달 위치가 저장되고 재로드 시 복원된다", async ({ page }) => {
  await mountFormPage(page);
  await page.waitForSelector("#zzk-map-calendar-overlay .zzk-map-calendar-header", { timeout: 4000 });

  // 헤더를 드래그해 모달을 옮긴다.
  const header = page.locator("#zzk-map-calendar-overlay .zzk-map-calendar-header").first();
  const box = await header.boundingBox();
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
  await page.mouse.down();
  await page.mouse.move(box.x + box.width / 2 - 80, box.y + box.height / 2 + 60, { steps: 8 });
  await page.mouse.up();

  // 저장소에 위치가 기록되어야 한다.
  const stored = await page.evaluate(() => {
    const raw = localStorage.getItem("zzk-map-calendar-offset-v1");
    return raw ? JSON.parse(raw) : null;
  });
  expect(stored).not.toBeNull();
  expect(Number.isFinite(stored.x)).toBe(true);
  expect(Number.isFinite(stored.y)).toBe(true);
  // 실제로 움직였는지 (0,0 이 아님)
  expect(Math.abs(stored.x) + Math.abs(stored.y)).toBeGreaterThan(0);

  // 재로드해도 저장된 오프셋으로 시작해야 한다.
  await page.reload({ waitUntil: "domcontentloaded" });
  await page.addScriptTag({ content: "window.__ZZK_DEBUG_MODE__ = true;" });
  for (const scriptPath of CONTENT_SCRIPT_BUNDLE) {
    await page.addScriptTag({ path: path.resolve(process.cwd(), scriptPath) });
  }
  await page.waitForFunction(() => window.__zzkAvailabilityLensLoaded === true, undefined, {
    timeout: 3000,
  });
  await page.waitForSelector("#zzk-map-calendar-overlay", { timeout: 4000 });

  const restored = await page.evaluate(() => {
    const overlay = document.getElementById("zzk-map-calendar-overlay");
    return overlay ? overlay.style.transform : null;
  });
  // translate(...) 형태로 저장된 오프셋이 반영되어야 한다.
  expect(restored).toMatch(/translate\(/);
  expect(restored).not.toBe("translate(0px, 0px)");
});
