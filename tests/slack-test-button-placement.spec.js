import path from "node:path";
import { expect, test } from "@playwright/test";

const DEFAULT_RESERVATION_SUCCESS_PAYLOAD = {
  ok: true,
  status: 200,
  method: "POST",
  url: "https://k8s.zzimkkong.com/api/guests/maps/abc/reservations",
};

async function openSlackModalFromReservationSuccess(page, payloadOverrides = {}) {
  await page.click("#form-reserve-submit");
  await page.evaluate((payload) => {
    window.postMessage(
      {
        source: "zzk-page-reservation-hook",
        type: "ZZK_RESERVATION_NETWORK_EVENT",
        payload,
      },
      "*"
    );
  }, { ...DEFAULT_RESERVATION_SUCCESS_PAYLOAD, ...payloadOverrides });
  await page.waitForSelector("#zzk-slack-copy-modal", { timeout: 3000 });
}

async function waitForContentScriptInjected(page) {
  await page.waitForFunction(() => window.__zzkAvailabilityLensLoaded === true, undefined, {
    timeout: 3000,
  });
}

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
  await waitForContentScriptInjected(page);
  await page.evaluate(() => {
    window.__zzkTestApi?.syncGuestUi?.();
  });
  await page.waitForTimeout(150);
}

test("slack modal opens on reservation success without legacy slack test trigger", async ({ page }) => {
  await page.goto("https://example.com/guest/test-map", { waitUntil: "domcontentloaded" });

  await page.setContent(`
    <main>
      <div id="top-tabs" style="display:flex; gap:8px; margin-bottom:16px;">
        <button type="button">예약현황</button>
        <button type="button">예약하기</button>
      </div>

      <form id="reservation-form" style="display:block; width:560px;">
        <label for="reservation-date">날짜</label>
        <input id="reservation-date" name="date" type="date" value="2026-03-02" />

        <label for="start-time">시작시간</label>
        <input id="start-time" name="startTime" type="time" value="12:20" />

        <label for="end-time">종료시간</label>
        <input id="end-time" name="endTime" type="time" value="13:20" />

        <label for="room-select">공간 선택</label>
        <select id="room-select" name="spaceId">
          <option value="">공간 선택</option>
          <option value="5" selected>12층 보이저</option>
        </select>

        <label for="owner-name">예약자명</label>
        <input id="owner-name" name="ownerName" type="text" value="홍길동" readonly />

        <label for="purpose">사용목적</label>
        <textarea id="purpose" name="purpose">Playwright 검증 목적</textarea>

        <div
          id="form-action-row"
          style="display:flex; flex-direction:row; flex-wrap:nowrap; gap:8px; margin-top:12px;"
        >
          <button id="form-reserve-submit" type="button">예약하기</button>
        </div>
      </form>
    </main>
  `);

  await injectContentScriptBundle(page);
  await page.waitForTimeout(700);

  await openSlackModalFromReservationSuccess(page);

  const modalState = await page.evaluate(() => {
    const modal = document.getElementById("zzk-slack-copy-modal");
    if (!(modal instanceof HTMLElement)) {
      return { opened: false, payload: "", description: "", warning: "", warningHidden: true, textareaHeight: 0 };
    }

    const textarea = modal.querySelector("textarea");
    const payload = Array.from(modal.querySelectorAll("textarea"))
      .map((node) => (node instanceof HTMLTextAreaElement ? node.value : ""))
      .join("\n");
    const descriptionNode = modal.querySelector(".zzk-slack-copy-description");
    const description =
      descriptionNode instanceof HTMLElement ? descriptionNode.textContent || "" : "";
    const channelInput = modal.querySelector(".zzk-slack-copy-channel-input");
    const reminderSelect = modal.querySelector("#zzk-slack-reminder-lead-time");

    return {
      opened: true,
      payload,
      description,
      channelValue: channelInput instanceof HTMLInputElement ? channelInput.value : "",
      reminderLeadTime:
        reminderSelect instanceof HTMLSelectElement ? reminderSelect.value : "",
      reminderLeadTimeOptions:
        reminderSelect instanceof HTMLSelectElement
          ? Array.from(reminderSelect.options).map((option) => option.textContent || "")
          : [],
      textareaHeight:
        textarea instanceof HTMLTextAreaElement ? parseFloat(window.getComputedStyle(textarea).height) : 0,
    };
  });

  expect(modalState.opened).toBeTruthy();
  expect(modalState.payload).toContain(
    '/remind me "12:20-13:20 Playwright 검증 목적 at 12F 보이저" on 2026-03-02 at 12:10'
  );
  expect(modalState.payload).not.toContain("🎉 예약이 생성되었습니다.");
  expect(modalState.payload).not.toContain("> 예약자명 : 홍길동");
  expect(modalState.payload).not.toContain("리마인더 정리:");
  expect(modalState.description).toContain("/remind list");
  expect(modalState.channelValue).toBe("");
  expect(modalState.reminderLeadTime).toBe("10");
  expect(modalState.reminderLeadTimeOptions).toEqual([
    "1분전",
    "5분전",
    "10분전",
    "15분전",
    "30분전",
    "1시간전",
  ]);
  expect(modalState.textareaHeight).toBeGreaterThan(0);
  expect(modalState.textareaHeight).toBeLessThan(210);
});

test("reservation success consumes pending attempt id and clears document dataset", async ({ page }) => {
  await page.goto("https://example.com/guest/test-map", { waitUntil: "domcontentloaded" });

  await page.setContent(`
    <main>
      <form id="reservation-form" style="display:block; width:560px;">
        <label for="reservation-date">날짜</label>
        <input id="reservation-date" name="date" type="date" value="2026-03-02" />

        <label for="start-time">시작시간</label>
        <input id="start-time" name="startTime" type="time" value="12:20" />

        <label for="end-time">종료시간</label>
        <input id="end-time" name="endTime" type="time" value="13:20" />

        <label for="room-select">공간 선택</label>
        <select id="room-select" name="spaceId">
          <option value="5" selected>12층 보이저</option>
        </select>

        <label for="purpose">사용목적</label>
        <textarea id="purpose" name="purpose">attempt cleanup 검증</textarea>

        <div id="form-action-row" style="display:flex; gap:8px; margin-top:12px;">
          <button id="form-reserve-submit" type="button">예약하기</button>
        </div>
      </form>
    </main>
  `);

  await injectContentScriptBundle(page);
  await page.waitForTimeout(700);
  await page.click("#form-reserve-submit");

  const before = await page.evaluate(() => ({
    datasetAttemptId: document.documentElement.dataset.zzkReservationAttemptId || "",
    pendingAttemptCount: window.__zzkTestApi?.getStateSnapshot?.().pendingReservationAttemptCount ?? 0,
  }));

  await page.evaluate((payload) => {
    window.postMessage(
      {
        source: "zzk-page-reservation-hook",
        type: "ZZK_RESERVATION_NETWORK_EVENT",
        payload,
      },
      "*"
    );
  }, DEFAULT_RESERVATION_SUCCESS_PAYLOAD);
  await page.waitForSelector("#zzk-slack-copy-modal", { timeout: 3000 });

  const after = await page.evaluate(() => ({
    datasetAttemptId: document.documentElement.dataset.zzkReservationAttemptId || "",
    datasetAttemptAt: document.documentElement.dataset.zzkReservationAttemptAt || "",
    pendingAttemptCount: window.__zzkTestApi?.getStateSnapshot?.().pendingReservationAttemptCount ?? 0,
    lastReservationAttemptId: window.__zzkTestApi?.getStateSnapshot?.().lastReservationAttemptId || "",
  }));

  expect(before.datasetAttemptId).toMatch(/^zzk-/);
  expect(before.pendingAttemptCount).toBe(1);
  expect(after.datasetAttemptId).toBe("");
  expect(after.datasetAttemptAt).toBe("");
  expect(after.pendingAttemptCount).toBe(0);
  expect(after.lastReservationAttemptId).toBe("");
});

test("pending reservation attempt pruning keeps newest ten attempts", async ({ page }) => {
  await page.goto("https://example.com/guest/test-map", { waitUntil: "domcontentloaded" });

  await page.setContent(`
    <main>
      <form id="reservation-form" style="display:block; width:560px;">
        <label for="reservation-date">날짜</label>
        <input id="reservation-date" name="date" type="date" value="2026-03-02" />

        <label for="start-time">시작시간</label>
        <input id="start-time" name="startTime" type="time" value="12:20" />

        <label for="end-time">종료시간</label>
        <input id="end-time" name="endTime" type="time" value="13:20" />

        <label for="room-select">공간 선택</label>
        <select id="room-select" name="spaceId">
          <option value="5" selected>12층 보이저</option>
        </select>

        <label for="purpose">사용목적</label>
        <textarea id="purpose" name="purpose">attempt pruning 검증</textarea>

        <div id="form-action-row" style="display:flex; gap:8px; margin-top:12px;">
          <button id="form-reserve-submit" type="button">예약하기</button>
        </div>
      </form>
    </main>
  `);

  await injectContentScriptBundle(page);
  await page.waitForTimeout(700);

  const snapshots = [];
  for (let index = 0; index < 11; index += 1) {
    await page.click("#form-reserve-submit");
    snapshots.push(await page.evaluate(() => window.__zzkTestApi?.getStateSnapshot?.()));
    await page.waitForTimeout(5);
  }

  const firstAttemptId = snapshots[0].lastReservationAttemptId;
  const latestSnapshot = snapshots[snapshots.length - 1];
  const datasetAttemptId = await page.evaluate(
    () => document.documentElement.dataset.zzkReservationAttemptId || "",
  );

  expect(firstAttemptId).toMatch(/^zzk-/);
  expect(latestSnapshot.pendingReservationAttemptCount).toBe(10);
  expect(latestSnapshot.pendingReservationAttemptIds).toHaveLength(10);
  expect(latestSnapshot.pendingReservationAttemptIds).not.toContain(firstAttemptId);
  expect(latestSnapshot.pendingReservationAttemptIds).toContain(latestSnapshot.lastReservationAttemptId);
  expect(datasetAttemptId).toBe(latestSnapshot.lastReservationAttemptId);
});

test("slack modal suppression resets radar launcher to closed state", async ({ page }) => {
  await page.goto("https://example.com/guest/test-map", { waitUntil: "domcontentloaded" });

  await page.setContent(`
    <main>
      <div id="top-tabs" style="display:flex; gap:8px; margin-bottom:16px;">
        <button type="button">예약현황</button>
        <button type="button">예약하기</button>
      </div>

      <form id="reservation-form" style="display:block; width:560px;">
        <label for="reservation-date">날짜</label>
        <input id="reservation-date" name="date" type="date" value="2026-03-02" />

        <label for="start-time">시작시간</label>
        <input id="start-time" name="startTime" type="time" value="12:20" />

        <label for="end-time">종료시간</label>
        <input id="end-time" name="endTime" type="time" value="13:20" />

        <label for="room-select">공간 선택</label>
        <select id="room-select" name="spaceId">
          <option value="5" selected>12층 보이저</option>
        </select>

        <label for="purpose">사용목적</label>
        <textarea id="purpose" name="purpose">레이더 상태 초기화 검증</textarea>

        <div id="form-action-row" style="display:flex; gap:8px; margin-top:12px;">
          <button id="form-reserve-submit" type="button">예약하기</button>
        </div>
      </form>
    </main>
  `);

  await injectContentScriptBundle(page);
  await page.waitForTimeout(700);

  const before = await page.evaluate(() => {
    const launcher = document.getElementById("zzk-map-calendar-radar-launcher");
    return {
      label:
        launcher instanceof HTMLElement
          ? launcher.querySelector(".zzk-map-calendar-radar-label")?.textContent || ""
          : "",
      pressed: launcher instanceof HTMLElement ? launcher.getAttribute("aria-pressed") || "" : "",
    };
  });

  await openSlackModalFromReservationSuccess(page);

  const after = await page.evaluate(() => {
    const launcher = document.getElementById("zzk-map-calendar-radar-launcher");
    const modal = document.getElementById("zzk-slack-copy-modal");
    const overlay = document.getElementById("zzk-map-calendar-overlay");
    return {
      label:
        launcher instanceof HTMLElement
          ? launcher.querySelector(".zzk-map-calendar-radar-label")?.textContent || ""
          : "",
      pressed: launcher instanceof HTMLElement ? launcher.getAttribute("aria-pressed") || "" : "",
      hasOverlay: overlay instanceof HTMLElement,
      hasModal: modal instanceof HTMLElement,
    };
  });

  expect(before.label).toContain("레이더");
  expect(after.hasModal).toBeTruthy();
  expect(after.hasOverlay).toBeFalsy();
  expect(after.label).toBe("레이더 열기");
  expect(after.pressed).toBe("false");
});

test("slack modal persists selected reminder offset across reopen", async ({ page }) => {
  await page.goto("https://example.com/guest/test-map", { waitUntil: "domcontentloaded" });

  await page.setContent(`
    <main>
      <form id="reservation-form" style="display:block; width:560px;">
        <label for="reservation-date">날짜</label>
        <input id="reservation-date" name="date" type="date" value="2026-03-02" />

        <label for="start-time">시작시간</label>
        <input id="start-time" name="startTime" type="time" value="12:20" />

        <label for="end-time">종료시간</label>
        <input id="end-time" name="endTime" type="time" value="13:20" />

        <label for="room-select">공간 선택</label>
        <select id="room-select" name="spaceId">
          <option value="5" selected>12층 보이저</option>
        </select>

        <label for="purpose">사용목적</label>
        <textarea id="purpose" name="purpose">리마인드 시점 저장 검증</textarea>

        <div id="form-action-row" style="display:flex; gap:8px; margin-top:12px;">
          <button id="form-reserve-submit" type="button">예약하기</button>
        </div>
      </form>
    </main>
  `);

  await injectContentScriptBundle(page);
  await page.waitForTimeout(700);

  await openSlackModalFromReservationSuccess(page);
  await page.selectOption("#zzk-slack-reminder-lead-time", "30");
  await page.waitForTimeout(150);
  await page.keyboard.press("Escape");
  await page.waitForTimeout(150);
  await page.fill("#purpose", "리마인드 시점 저장 검증 다시열기");

  await openSlackModalFromReservationSuccess(page);

  const snapshot = await page.evaluate(() => {
    const modal = document.getElementById("zzk-slack-copy-modal");
    if (!(modal instanceof HTMLElement)) {
      return { payload: "", reminderLeadTime: "", storedValue: "" };
    }

    const reminderSelect = modal.querySelector("#zzk-slack-reminder-lead-time");
    const payload = Array.from(modal.querySelectorAll("textarea"))
      .map((node) => (node instanceof HTMLTextAreaElement ? node.value : ""))
      .join("\n");

    return {
      payload,
      reminderLeadTime:
        reminderSelect instanceof HTMLSelectElement ? reminderSelect.value : "",
      storedValue: window.localStorage.getItem("zzk-slack-reminder-lead-time-v1") || "",
    };
  });

  expect(snapshot.reminderLeadTime).toBe("30");
  expect(snapshot.storedValue).toBe("30");
  expect(snapshot.payload).toContain(
    '/remind me "12:20-13:20 리마인드 시점 저장 검증 다시열기 at 12F 보이저" on 2026-03-02 at 11:50'
  );
});

test("slack modal uses default 10-minute reminder offset", async ({ page }) => {
  await page.goto("https://example.com/guest/test-map", { waitUntil: "domcontentloaded" });

  await page.setContent(`
    <main>
      <form id="reservation-form" style="display:block; width:560px;">
        <label for="reservation-date">날짜</label>
        <input id="reservation-date" name="date" type="date" value="2026-03-02" />

        <label for="start-time">시작시간</label>
        <input id="start-time" name="startTime" type="time" value="12:20" />

        <label for="end-time">종료시간</label>
        <input id="end-time" name="endTime" type="time" value="13:20" />

        <label for="room-select">공간 선택</label>
        <select id="room-select" name="spaceId">
          <option value="5" selected>12층 보이저</option>
        </select>

        <label for="purpose">사용목적</label>
        <textarea id="purpose" name="purpose">기본 리마인드 시점 검증</textarea>

        <div id="form-action-row" style="display:flex; gap:8px; margin-top:12px;">
          <button id="form-reserve-submit" type="button">예약하기</button>
        </div>
      </form>
    </main>
  `);

  await injectContentScriptBundle(page);
  await page.waitForTimeout(700);
  await openSlackModalFromReservationSuccess(page, { url: "https://k8s.zzimkkong.com/api/guests/maps/abc/reservations/default" });

  const snapshot = await page.evaluate(() => {
    const modal = document.getElementById("zzk-slack-copy-modal");
    if (!(modal instanceof HTMLElement)) {
      return { payload: "", reminderLeadTime: "", reminderLeadTimeOptions: [] };
    }

    const reminderSelect = modal.querySelector("#zzk-slack-reminder-lead-time");
    const payload = Array.from(modal.querySelectorAll("textarea"))
      .map((node) => (node instanceof HTMLTextAreaElement ? node.value : ""))
      .join("\n");

    return {
      payload,
      reminderLeadTime:
        reminderSelect instanceof HTMLSelectElement ? reminderSelect.value : "",
      reminderLeadTimeOptions:
        reminderSelect instanceof HTMLSelectElement
          ? Array.from(reminderSelect.options).map((option) => option.textContent || "")
          : [],
    };
  });

  expect(snapshot.reminderLeadTime).toBe("10");
  expect(snapshot.reminderLeadTimeOptions).toEqual([
    "1분전",
    "5분전",
    "10분전",
    "15분전",
    "30분전",
    "1시간전",
  ]);
  expect(snapshot.payload).toContain(
    '/remind me "12:20-13:20 기본 리마인드 시점 검증 at 12F 보이저" on 2026-03-02 at 12:10'
  );
});

test("slack modal opens channel-only input from success flow and manual trigger is present", async ({ page }) => {
  await page.goto("https://example.com/guest/test-map", { waitUntil: "domcontentloaded" });

  await page.setContent(`
    <main>
      <div id="top-tabs" style="display:flex; gap:8px; margin-bottom:16px;">
        <button type="button">예약현황</button>
        <button type="button">예약하기</button>
      </div>

      <form id="reservation-form" style="display:block; width:560px;">
        <label for="reservation-date">날짜</label>
        <input id="reservation-date" name="date" type="date" value="2026-03-02" />

        <label for="start-time">시작시간</label>
        <input id="start-time" name="startTime" type="time" value="12:20" />

        <label for="end-time">종료시간</label>
        <input id="end-time" name="endTime" type="time" value="13:20" />

        <label for="room-select">공간 선택</label>
        <select id="room-select" name="spaceId">
          <option value="5" selected>12층 보이저</option>
        </select>

        <label for="owner-name">예약자명</label>
        <input id="owner-name" name="ownerName" type="text" value="홍길동" readonly />

        <label for="purpose">사용목적</label>
        <textarea id="purpose" name="purpose">버튼 열기 테스트</textarea>

        <div id="form-action-row" style="display:flex; gap:8px; margin-top:12px;">
          <button id="form-reserve-submit" type="button">예약하기</button>
        </div>
      </form>
    </main>
  `);

  await page.evaluate(() => {
    window.__ZZK_DEBUG_MODE__ = true;
  });

  await injectContentScriptBundle(page);
  await page.waitForTimeout(700);
  const hasManualTrigger = await page.evaluate(() => {
    return document.getElementById("zzk-slack-modal-trigger") instanceof HTMLButtonElement;
  });
  expect(hasManualTrigger).toBeTruthy();

  await openSlackModalFromReservationSuccess(page);

  await page.waitForSelector("#zzk-slack-copy-modal", { timeout: 5000 });

  const snapshot = await page.evaluate(() => {
    const modal = document.getElementById("zzk-slack-copy-modal");
    const channelInput =
      modal instanceof HTMLElement ? modal.querySelector(".zzk-slack-copy-channel-input") : null;
    const importFileButton =
      modal instanceof HTMLElement ? modal.querySelector(".zzk-slack-copy-attendee-import") : null;
    const importUrlRow =
      modal instanceof HTMLElement ? modal.querySelector(".zzk-slack-copy-import-url-row") : null;
    const warningNode =
      modal instanceof HTMLElement ? modal.querySelector(".zzk-slack-copy-warning") : null;

    const payload =
      modal instanceof HTMLElement
        ? Array.from(modal.querySelectorAll("textarea"))
            .map((node) => (node instanceof HTMLTextAreaElement ? node.value : ""))
            .join("\n")
        : "";

    return {
      modalOpened: modal instanceof HTMLElement,
      hasChannelInput: channelInput instanceof HTMLInputElement,
      channelValue: channelInput instanceof HTMLInputElement ? channelInput.value : "",
      hasImportFileButton: importFileButton instanceof HTMLButtonElement,
      hasImportUrlRow: importUrlRow instanceof HTMLElement,
      hasWarning: warningNode instanceof HTMLElement,
      payload,
    };
  });

  expect(snapshot.modalOpened).toBeTruthy();
  expect(snapshot.hasChannelInput).toBeTruthy();
  expect(snapshot.channelValue).toBe("");
  expect(snapshot.hasImportFileButton).toBeFalsy();
  expect(snapshot.hasImportUrlRow).toBeFalsy();
  expect(snapshot.hasWarning).toBeFalsy();
  expect(snapshot.payload).toContain('/remind me "12:20-13:20 버튼 열기 테스트 at 12F 보이저"');
  expect(snapshot.payload).not.toContain("> 예약자명 : 홍길동");
});

test("manual modal test button opens channel-only Slack modal from current form state", async ({ page }) => {
  await page.goto("https://example.com/guest/test-map", { waitUntil: "domcontentloaded" });

  await page.setContent(`
    <main>
      <div id="top-tabs" style="display:flex; gap:8px; margin-bottom:16px;">
        <button type="button">예약현황</button>
        <button type="button">예약하기</button>
      </div>

      <form id="reservation-form" style="display:block; width:560px;">
        <label for="reservation-date">날짜</label>
        <input id="reservation-date" name="date" type="date" value="2026-03-02" />
        <label for="start-time">시작시간</label>
        <input id="start-time" name="startTime" type="time" value="12:20" />
        <label for="end-time">종료시간</label>
        <input id="end-time" name="endTime" type="time" value="13:20" />
        <label for="room-select">공간 선택</label>
        <select id="room-select" name="spaceId"><option value="5" selected>12층 보이저</option></select>
        <label for="purpose">사용목적</label>
        <textarea id="purpose" name="purpose">수동 모달 테스트</textarea>
        <div id="form-action-row" style="display:flex; gap:8px; margin-top:12px;">
          <button id="form-reserve-submit" type="button">예약하기</button>
        </div>
      </form>
    </main>
  `);

  await page.evaluate(() => {
    window.__ZZK_DEBUG_MODE__ = true;
  });

  await injectContentScriptBundle(page);
  await page.evaluate(() => {
    window.__zzkTestApi?.syncGuestUi?.();
  });
  await expect
    .poll(async () => {
      return await page.evaluate(
        () => document.getElementById("zzk-slack-modal-trigger") instanceof HTMLElement,
      );
    }, { timeout: 5000 })
    .toBeTruthy();
  await page.click("#zzk-slack-modal-trigger");

  const snapshot = await page.evaluate(() => {
    const modal = document.getElementById("zzk-slack-copy-modal");
    if (!(modal instanceof HTMLElement)) {
      return { hasModal: false, payload: "", hasChannelInput: false };
    }
    const payload = Array.from(modal.querySelectorAll("textarea"))
      .map((node) => (node instanceof HTMLTextAreaElement ? node.value : ""))
      .join("\n");
    return {
      hasModal: true,
      hasChannelInput:
        modal.querySelector(".zzk-slack-copy-channel-input") instanceof HTMLInputElement,
      payload,
    };
  });

  expect(snapshot.hasModal).toBeTruthy();
  expect(snapshot.hasChannelInput).toBeTruthy();
  expect(snapshot.payload).toContain('/remind me "12:20-13:20 수동 모달 테스트 at 12F 보이저" on 2026-03-02 at 12:10');
});

test("slack modal channel input updates preview and persists across reopen", async ({ page }) => {
  await page.goto("https://example.com/guest/test-map", { waitUntil: "domcontentloaded" });

  await page.setContent(`
    <main>
      <form id="reservation-form" style="display:block; width:560px;">
        <label for="reservation-date">날짜</label>
        <input id="reservation-date" name="date" type="date" value="2026-03-02" />
        <label for="start-time">시작시간</label>
        <input id="start-time" name="startTime" type="time" value="12:20" />
        <label for="end-time">종료시간</label>
        <input id="end-time" name="endTime" type="time" value="13:20" />
        <label for="room-select">공간 선택</label>
        <select id="room-select" name="spaceId"><option value="5" selected>12층 보이저</option></select>
        <label for="purpose">사용목적</label>
        <textarea id="purpose" name="purpose">채널 전용 테스트</textarea>
        <div id="form-action-row" style="display:flex; gap:8px; margin-top:12px;">
          <button id="form-reserve-submit" type="button">예약하기</button>
        </div>
      </form>
    </main>
  `);

  await injectContentScriptBundle(page);
  await page.waitForTimeout(700);

  await openSlackModalFromReservationSuccess(page);
  await page.fill(".zzk-slack-copy-channel-input", "channel-test");
  await page.waitForTimeout(150);

  const firstSnapshot = await page.evaluate(() => {
    const modal = document.getElementById("zzk-slack-copy-modal");
    if (!(modal instanceof HTMLElement)) {
      return { payload: "", channelValue: "", chipValue: "", storedValue: "" };
    }
    const channelInput = modal.querySelector(".zzk-slack-copy-channel-input");
    const channelChip = modal.querySelector(".zzk-slack-copy-channel-chip-label");
    const payload = Array.from(modal.querySelectorAll("textarea"))
      .map((node) => (node instanceof HTMLTextAreaElement ? node.value : ""))
      .join("\n");
    return {
      payload,
      channelValue: channelInput instanceof HTMLInputElement ? channelInput.value : "",
      chipValue: channelChip instanceof HTMLElement ? channelChip.textContent || "" : "",
      storedValue: window.localStorage.getItem("zzk-slack-channel-mention-v1") || "",
    };
  });

  expect(firstSnapshot.channelValue).toBe("channel-test");
  expect(firstSnapshot.chipValue).toBe("");
  expect(firstSnapshot.storedValue).toBe("");
  expect(firstSnapshot.payload).toContain('/remind me "12:20-13:20 채널 전용 테스트 at 12F 보이저" on 2026-03-02 at 12:10');

  await page.click(".zzk-slack-copy-channel-option");
  await page.waitForTimeout(100);

  const committedSnapshot = await page.evaluate(() => {
    const modal = document.getElementById("zzk-slack-copy-modal");
    if (!(modal instanceof HTMLElement)) {
      return { payload: "", chipValue: "" };
    }
    const channelChip = modal.querySelector(".zzk-slack-copy-channel-chip-label");
    const payload = Array.from(modal.querySelectorAll("textarea"))
      .map((node) => (node instanceof HTMLTextAreaElement ? node.value : ""))
      .join("\n");
    return {
      payload,
      chipValue: channelChip instanceof HTMLElement ? channelChip.textContent || "" : "",
    };
  });

  expect(committedSnapshot.chipValue).toBe("#channel-test");
  expect(committedSnapshot.payload).toContain('/remind #channel-test "12:20-13:20 채널 전용 테스트 at 12F 보이저 @channel" on 2026-03-02 at 12:10');

  await page.click("#zzk-slack-copy-modal .zzk-slack-copy-button.primary");
  await page.waitForTimeout(100);

  const storedAfterCopy = await page.evaluate(() => {
    return {
      mention: window.localStorage.getItem("zzk-slack-channel-mention-v1") || "",
      history: window.localStorage.getItem("zzk-slack-channel-history-v1") || "",
    };
  });

  expect(storedAfterCopy.mention).toBe("#channel-test");
  expect(storedAfterCopy.history).toContain("#channel-test");

  await page.keyboard.press("Escape");
  await page.waitForTimeout(150);
  await openSlackModalFromReservationSuccess(page, { url: "https://k8s.zzimkkong.com/api/guests/maps/abc/reservations/reopen" });
  await page.focus(".zzk-slack-copy-channel-input");
  await page.waitForTimeout(100);

  const secondSnapshot = await page.evaluate(() => {
    const modal = document.getElementById("zzk-slack-copy-modal");
    if (!(modal instanceof HTMLElement)) {
      return { channelValue: "", chipValue: "", suggestionTexts: [] };
    }
    const channelInput = modal.querySelector(".zzk-slack-copy-channel-input");
    const channelChip = modal.querySelector(".zzk-slack-copy-channel-chip-label");
    const suggestionTexts = Array.from(
      modal.querySelectorAll(".zzk-slack-copy-channel-option"),
    ).map((node) => (node instanceof HTMLElement ? node.textContent || "" : ""));
    return {
      channelValue: channelInput instanceof HTMLInputElement ? channelInput.value : "",
      chipValue: channelChip instanceof HTMLElement ? channelChip.textContent || "" : "",
      suggestionTexts,
    };
  });

  expect(secondSnapshot.channelValue).toBe("");
  expect(secondSnapshot.chipValue).toBe("#channel-test");
  expect(secondSnapshot.suggestionTexts).toContain("#channel-test");
});

test("slack modal allows selecting a remembered channel suggestion", async ({ page }) => {
  await page.goto("https://example.com/guest/test-map", { waitUntil: "domcontentloaded" });

  await page.setContent(`
    <main>
      <div id="top-tabs" style="display:flex; gap:8px; margin-bottom:16px;">
        <button type="button">예약현황</button>
        <button type="button">예약하기</button>
      </div>

      <form id="reservation-form" style="display:block; width:560px;">
        <label for="reservation-date">날짜</label>
        <input id="reservation-date" name="date" type="date" value="2026-03-02" />
        <label for="start-time">시작시간</label>
        <input id="start-time" name="startTime" type="time" value="12:20" />
        <label for="end-time">종료시간</label>
        <input id="end-time" name="endTime" type="time" value="13:20" />
        <label for="room-select">공간 선택</label>
        <select id="room-select" name="spaceId"><option value="5" selected>12층 보이저</option></select>
        <label for="purpose">사용목적</label>
        <textarea id="purpose" name="purpose">기억 채널 선택 테스트</textarea>
        <div id="form-action-row" style="display:flex; gap:8px; margin-top:12px;">
          <button id="form-reserve-submit" type="button">예약하기</button>
        </div>
      </form>
    </main>
  `);

  await page.evaluate(() => {
    window.localStorage.setItem("zzk-slack-channel-history-v1", "#frontend\n#backend");
  });
  await injectContentScriptBundle(page);
  await page.waitForTimeout(700);

  await openSlackModalFromReservationSuccess(page);
  await page.focus(".zzk-slack-copy-channel-input");
  await page.waitForTimeout(100);
  await page.evaluate(() => {
    const option = Array.from(document.querySelectorAll(".zzk-slack-copy-channel-option")).find((node) =>
      node instanceof HTMLElement && (node.textContent || "").includes("#frontend")
    );
    if (option instanceof HTMLButtonElement) {
      option.click();
    }
  });

  const snapshot = await page.evaluate(() => {
    const modal = document.getElementById("zzk-slack-copy-modal");
    if (!(modal instanceof HTMLElement)) {
      return { channelValue: "", chipValue: "", payload: "" };
    }
    const channelInput = modal.querySelector(".zzk-slack-copy-channel-input");
    const channelChip = modal.querySelector(".zzk-slack-copy-channel-chip-label");
    const payload = Array.from(modal.querySelectorAll("textarea"))
      .map((node) => (node instanceof HTMLTextAreaElement ? node.value : ""))
      .join("\n");
    return {
      channelValue: channelInput instanceof HTMLInputElement ? channelInput.value : "",
      chipValue: channelChip instanceof HTMLElement ? channelChip.textContent || "" : "",
      payload,
    };
  });

  expect(snapshot.channelValue).toBe("");
  expect(snapshot.chipValue).toBe("#frontend");
  expect(snapshot.payload).toContain('/remind #frontend "12:20-13:20 기억 채널 선택 테스트 at 12F 보이저 @channel" on 2026-03-02 at 12:10');
});

test("slack modal shows '#채널 추가' option for a new typed channel", async ({ page }) => {
  await page.goto("https://example.com/guest/test-map", { waitUntil: "domcontentloaded" });

  await page.setContent(`
    <main>
      <div id="top-tabs" style="display:flex; gap:8px; margin-bottom:16px;">
        <button type="button">예약현황</button>
        <button type="button">예약하기</button>
      </div>

      <form id="reservation-form" style="display:block; width:560px;">
        <label for="reservation-date">날짜</label>
        <input id="reservation-date" name="date" type="date" value="2026-03-02" />
        <label for="start-time">시작시간</label>
        <input id="start-time" name="startTime" type="time" value="12:20" />
        <label for="end-time">종료시간</label>
        <input id="end-time" name="endTime" type="time" value="13:20" />
        <label for="room-select">공간 선택</label>
        <select id="room-select" name="spaceId"><option value="5" selected>12층 보이저</option></select>
        <label for="purpose">사용목적</label>
        <textarea id="purpose" name="purpose">새 채널 추가 테스트</textarea>
        <div id="form-action-row" style="display:flex; gap:8px; margin-top:12px;">
          <button id="form-reserve-submit" type="button">예약하기</button>
        </div>
      </form>
    </main>
  `);

  await injectContentScriptBundle(page);
  await page.waitForTimeout(700);

  await openSlackModalFromReservationSuccess(page);
  await page.fill(".zzk-slack-copy-channel-input", "fresh-channel");
  await page.waitForTimeout(100);

  const beforeAdd = await page.evaluate(() => {
    const modal = document.getElementById("zzk-slack-copy-modal");
    if (!(modal instanceof HTMLElement)) {
      return { options: [] };
    }
    return {
      options: Array.from(modal.querySelectorAll(".zzk-slack-copy-channel-option")).map((node) =>
        node instanceof HTMLElement ? node.textContent || "" : ""
      ),
    };
  });

  expect(beforeAdd.options.some((text) => text.includes("#fresh-channel") && text.includes("추가"))).toBeTruthy();

  await page.click(".zzk-slack-copy-channel-option");

  const afterAdd = await page.evaluate(() => {
    const modal = document.getElementById("zzk-slack-copy-modal");
    if (!(modal instanceof HTMLElement)) {
      return { chipValue: "", history: "" };
    }
    const channelChip = modal.querySelector(".zzk-slack-copy-channel-chip-label");
    return {
      chipValue: channelChip instanceof HTMLElement ? channelChip.textContent || "" : "",
      history: window.localStorage.getItem("zzk-slack-channel-history-v1") || "",
    };
  });

  expect(afterAdd.chipValue).toBe("#fresh-channel");
  expect(afterAdd.history).toContain("#fresh-channel");
});

test("slack modal allows deleting a remembered channel suggestion", async ({ page }) => {
  await page.goto("https://example.com/guest/test-map", { waitUntil: "domcontentloaded" });

  await page.setContent(`
    <main>
      <div id="top-tabs" style="display:flex; gap:8px; margin-bottom:16px;">
        <button type="button">예약현황</button>
        <button type="button">예약하기</button>
      </div>

      <form id="reservation-form" style="display:block; width:560px;">
        <label for="reservation-date">날짜</label>
        <input id="reservation-date" name="date" type="date" value="2026-03-02" />
        <label for="start-time">시작시간</label>
        <input id="start-time" name="startTime" type="time" value="12:20" />
        <label for="end-time">종료시간</label>
        <input id="end-time" name="endTime" type="time" value="13:20" />
        <label for="room-select">공간 선택</label>
        <select id="room-select" name="spaceId"><option value="5" selected>12층 보이저</option></select>
        <label for="purpose">사용목적</label>
        <textarea id="purpose" name="purpose">기억 채널 삭제 테스트</textarea>
        <div id="form-action-row" style="display:flex; gap:8px; margin-top:12px;">
          <button id="form-reserve-submit" type="button">예약하기</button>
        </div>
      </form>
    </main>
  `);

  await page.evaluate(() => {
    window.localStorage.setItem("zzk-slack-channel-history-v1", "#frontend\n#backend");
  });
  await injectContentScriptBundle(page);
  await page.waitForTimeout(700);

  await openSlackModalFromReservationSuccess(page);
  await page.focus(".zzk-slack-copy-channel-input");
  await page.waitForTimeout(100);
  await page.click("button[aria-label='#frontend 채널 삭제']");

  const snapshot = await page.evaluate(() => {
    const modal = document.getElementById("zzk-slack-copy-modal");
    if (!(modal instanceof HTMLElement)) {
      return { options: [], history: "" };
    }
    return {
      options: Array.from(modal.querySelectorAll(".zzk-slack-copy-channel-option")).map((node) =>
        node instanceof HTMLElement ? node.textContent || "" : ""
      ),
      history: window.localStorage.getItem("zzk-slack-channel-history-v1") || "",
    };
  });

  expect(snapshot.options.some((text) => text.includes("#frontend"))).toBeFalsy();
  expect(snapshot.options.some((text) => text.includes("#backend"))).toBeTruthy();
  expect(snapshot.history).not.toContain("#frontend");
});

test("manual slack trigger button is not rendered on reservation edit page", async ({ page }) => {
  await page.goto("https://example.com/guest/test-map/reservation/edit", {
    waitUntil: "domcontentloaded",
  });

  await page.setContent(`
    <main>
      <div id="top-tabs" style="display:flex; gap:8px; margin-bottom:16px;">
        <button type="button">상세</button>
        <button type="button">수정</button>
      </div>

      <form id="reservation-edit-form" style="display:block; width:560px;">
        <label for="reservation-date">날짜</label>
        <input id="reservation-date" name="date" type="date" value="2026-03-04" />

        <label for="start-time">시작시간</label>
        <input id="start-time" name="startTime" type="time" value="18:00" />

        <label for="end-time">종료시간</label>
        <input id="end-time" name="endTime" type="time" value="19:00" />

        <label for="room-select">공간 선택</label>
        <select id="room-select" name="spaceId" disabled>
          <option value="4" selected>11층 금성</option>
        </select>

        <label for="owner-name">예약자명</label>
        <input id="owner-name" name="ownerName" type="text" value="애니" />

        <label for="purpose">사용목적</label>
        <textarea id="purpose" name="purpose">학습</textarea>

        <div id="form-action-row" style="display:flex; gap:8px; margin-top:12px;">
          <button id="form-update-submit" type="button">수정하기</button>
        </div>
      </form>
    </main>
  `);

  await injectContentScriptBundle(page);
  await page.waitForTimeout(700);

  const hasManualTrigger = await page.evaluate(() => {
    return document.getElementById("zzk-slack-modal-trigger") instanceof HTMLButtonElement;
  });

  expect(hasManualTrigger).toBeFalsy();
});

test("success route hides radar UI and uses requestContext for Slack message", async ({ page }) => {
  await page.goto("https://example.com/guest/test-map", { waitUntil: "domcontentloaded" });

  await page.setContent(`
    <main>
      <div id="top-tabs" style="display:flex; gap:8px; margin-bottom:16px;">
        <button type="button">예약현황</button>
        <button type="button">예약하기</button>
      </div>

      <form id="reservation-form" style="display:block; width:560px;">
        <label for="reservation-date">날짜</label>
        <input id="reservation-date" name="date" type="date" value="2026-03-02" />

        <label for="start-time">시작시간</label>
        <input id="start-time" name="startTime" type="time" value="10:00" />

        <label for="end-time">종료시간</label>
        <input id="end-time" name="endTime" type="time" value="11:00" />

        <label for="room-select">공간 선택</label>
        <select id="room-select" name="spaceId">
          <option value="">공간 선택</option>
          <option value="5" selected>12층 보이저</option>
        </select>

        <label for="owner-name">예약자명</label>
        <input id="owner-name" name="ownerName" type="text" value="기존값" />

        <label for="purpose">사용목적</label>
        <textarea id="purpose" name="purpose">기존 목적</textarea>

        <div id="form-action-row" style="display:flex; gap:8px; margin-top:12px;">
          <button id="form-reserve-submit" type="button">예약하기</button>
        </div>
      </form>
    </main>
  `);

  await injectContentScriptBundle(page);
  await page.waitForTimeout(700);

  await page.click("#form-reserve-submit");
  await page.evaluate(() => {
    history.pushState({}, "", "/guest/test-map/success");
    document.body.innerHTML = '<main><h1>예약이 완료되었습니다.</h1></main>';
  });

  await page.evaluate(() => {
    window.postMessage(
      {
        source: "zzk-page-reservation-hook",
        type: "ZZK_RESERVATION_NETWORK_EVENT",
        payload: {
          ok: true,
          status: 201,
          method: "POST",
          url: "https://k8s.zzimkkong.com/api/guests/maps/234/spaces/263/reservations",
          requestContext: {
            date: "2026-03-02",
            startTime: "10:00",
            endTime: "10:30",
            description: "연극연습",
            roomName: "11층 금성",
            ownerName: "애니",
          },
        },
      },
      "*"
    );
  });

  await page.waitForTimeout(700);

  const snapshot = await page.evaluate(() => {
    const launcher = document.getElementById("zzk-map-calendar-radar-launcher");
    const panel = document.getElementById("zzk-availability-lens-root");
    const modal = document.getElementById("zzk-slack-copy-modal");
    const payload =
      modal instanceof HTMLElement
        ? Array.from(modal.querySelectorAll("textarea"))
            .map((node) => (node instanceof HTMLTextAreaElement ? node.value : ""))
            .join("\n")
        : "";

    return {
      hasLauncher: launcher instanceof HTMLElement,
      hasPanel: panel instanceof HTMLElement,
      hasModal: modal instanceof HTMLElement,
      payload,
    };
  });

  expect(snapshot.hasLauncher).toBeFalsy();
  expect(snapshot.hasPanel).toBeFalsy();
  expect(snapshot.hasModal).toBeTruthy();
  expect(snapshot.payload).toContain('/remind me "10:00-10:30 연극연습 at 11F 금성"');
  expect(snapshot.payload).not.toContain("> 예약자명 : 애니");
});

test("reservation network message ignores untrusted event and payload URL origins", async ({ page }) => {
  await page.goto("https://example.com/guest/test-map", { waitUntil: "domcontentloaded" });

  await page.setContent(`
    <main>
      <form id="reservation-form" style="display:block; width:560px;">
        <label for="reservation-date">날짜</label>
        <input id="reservation-date" name="date" type="date" value="2026-03-02" />

        <label for="start-time">시작시간</label>
        <input id="start-time" name="startTime" type="time" value="10:00" />

        <label for="end-time">종료시간</label>
        <input id="end-time" name="endTime" type="time" value="11:00" />

        <label for="room-select">공간 선택</label>
        <select id="room-select" name="spaceId">
          <option value="5" selected>12층 보이저</option>
        </select>

        <label for="purpose">사용목적</label>
        <textarea id="purpose" name="purpose">정상 예약 컨텍스트</textarea>

        <div id="form-action-row" style="display:flex; gap:8px; margin-top:12px;">
          <button id="form-reserve-submit" type="button">예약하기</button>
        </div>
      </form>
    </main>
  `);

  await injectContentScriptBundle(page);
  await page.waitForTimeout(700);
  await page.click("#form-reserve-submit");

  await page.evaluate(() => {
    window.dispatchEvent(
      new MessageEvent("message", {
        origin: "https://evil.example",
        source: window,
        data: {
          source: "zzk-page-reservation-hook",
          type: "ZZK_RESERVATION_NETWORK_EVENT",
          payload: {
            ok: true,
            status: 201,
            method: "POST",
            url: "https://k8s.zzimkkong.com/api/guests/maps/234/spaces/263/reservations",
            requestContext: {
              date: "2026-03-02",
              startTime: "10:00",
              endTime: "10:30",
              description: "위조 이벤트 origin",
              roomName: "11층 금성",
              ownerName: "공격자",
            },
          },
        },
      })
    );

    window.postMessage(
      {
        source: "zzk-page-reservation-hook",
        type: "ZZK_RESERVATION_NETWORK_EVENT",
        payload: {
          ok: true,
          status: 201,
          method: "POST",
          url: "https://malicious.example/api/guests/maps/234/spaces/263/reservations",
          requestContext: {
            date: "2026-03-02",
            startTime: "10:00",
            endTime: "10:30",
            description: "위조 메시지",
            roomName: "11층 금성",
            ownerName: "공격자",
          },
        },
      },
      "*"
    );
  });

  await page.waitForTimeout(700);

  const snapshot = await page.evaluate(() => {
    const modal = document.getElementById("zzk-slack-copy-modal");
    return {
      hasModal: modal instanceof HTMLElement,
      pendingRaw: window.sessionStorage.getItem("zzk-pending-slack-modal-v1") || "",
    };
  });

  expect(snapshot.hasModal).toBeFalsy();
  expect(snapshot.pendingRaw).toBe("");
});

test("edit page PUT success queues Slack modal context for the returned guest page", async ({ page }) => {
  await page.goto("https://example.com/guest/test-map/reservation/edit", {
    waitUntil: "domcontentloaded",
  });

  await page.setContent(`
    <main>
      <div id="top-tabs" style="display:flex; gap:8px; margin-bottom:16px;">
        <button type="button">상세</button>
        <button type="button">수정</button>
      </div>

      <form id="reservation-edit-form" style="display:block; width:560px;">
        <label for="reservation-date">날짜</label>
        <input id="reservation-date" name="date" type="date" value="2026-03-02" />

        <label for="start-time">시작시간</label>
        <input id="start-time" name="startTime" type="time" value="10:00" />

        <label for="end-time">종료시간</label>
        <input id="end-time" name="endTime" type="time" value="10:30" />

        <label for="room-select">공간 선택</label>
        <select id="room-select" name="spaceId" disabled>
          <option value="3" selected>11층 수성</option>
        </select>

        <label for="owner-name">예약자명</label>
        <input id="owner-name" name="ownerName" type="text" value="애니" />

        <label for="purpose">사용목적</label>
        <textarea id="purpose" name="purpose">연극연습</textarea>

        <div id="form-action-row" style="display:flex; gap:8px; margin-top:12px;">
          <button id="form-update-submit" type="button">수정하기</button>
        </div>
      </form>
    </main>
  `);

  await injectContentScriptBundle(page);
  await page.waitForTimeout(700);
  await page.evaluate(() => {
    history.replaceState({}, "", "/guest/test-map/reservation/edit");
  });
  await page.waitForTimeout(100);

  await page.click("#form-update-submit");
  await page.evaluate(() => {
    window.postMessage(
      {
        source: "zzk-page-reservation-hook",
        type: "ZZK_RESERVATION_NETWORK_EVENT",
        payload: {
          ok: true,
          status: 200,
          method: "PUT",
          url: "https://k8s.zzimkkong.com/api/guests/maps/234/spaces/3/reservations/901",
          requestContext: {
            date: "2026-03-02",
            startTime: "10:00",
            endTime: "10:30",
            description: "연극연습",
            roomName: "11층 수성",
            ownerName: "애니",
          },
        },
      },
      "*"
    );
  });

  await page.waitForTimeout(700);

  const snapshot = await page.evaluate(() => {
    const modal = document.getElementById("zzk-slack-copy-modal");
    const pendingRaw = window.sessionStorage.getItem("zzk-pending-slack-modal-v1") || "";
    const pending = pendingRaw ? JSON.parse(pendingRaw) : null;

    return {
      hasModal: modal instanceof HTMLElement,
      pendingContext: pending?.context || null,
    };
  });

  expect(snapshot.hasModal).toBeFalsy();
  expect(snapshot.pendingContext).toMatchObject({
    mutationMethod: "PUT",
    date: "2026-03-02",
    startTime: "10:00",
    endTime: "10:30",
    roomName: "수성",
    description: "연극연습",
  });
});

test("blank guest recovery waits for delayed root content before marking reload", async ({ page }) => {
  await page.goto("https://example.com/guest/test-map", { waitUntil: "domcontentloaded" });
  await page.setContent(`
    <main>
      <div id="root"></div>
      <script>
        window.setTimeout(() => {
          const root = document.getElementById("root");
          if (!root) return;
          root.innerHTML = ` + JSON.stringify(`
            <form id="reservation-form">
              <label for="reservation-date">날짜</label>
              <input id="reservation-date" name="date" type="date" value="2099-01-02" />
              <button id="form-reserve-submit" type="button">예약하기</button>
            </form>
          `) + `;
        }, 250);
      </script>
    </main>
  `);

  await injectContentScriptBundle(page);
  await page.waitForTimeout(900);

  const snapshot = await page.evaluate(() => {
    const root = document.getElementById("root");
    return {
      recoveryKey: window.sessionStorage.getItem("zzk-blank-guest-recovery-v1") || "",
      hasDateInput: root?.querySelector("input[name='date']") instanceof HTMLInputElement,
      hasSubmitButton: root?.querySelector("button") instanceof HTMLButtonElement,
    };
  });

  expect(snapshot).toEqual({
    recoveryKey: "",
    hasDateInput: true,
    hasSubmitButton: true,
  });
});

test("sessionStorage failures are reported as debug storage events", async ({ page }) => {
  await page.goto("https://example.com/guest/test-map/reservation/edit", {
    waitUntil: "domcontentloaded",
  });
  await page.setContent(`
    <main>
      <form id="reservation-edit-form" style="display:block; width:560px;">
        <label for="reservation-date">날짜</label>
        <input id="reservation-date" name="date" type="date" value="2099-01-02" />
        <label for="start-time">시작시간</label>
        <input id="start-time" name="startTime" type="time" value="10:00" />
        <label for="end-time">종료시간</label>
        <input id="end-time" name="endTime" type="time" value="10:30" />
        <label for="room-select">공간 선택</label>
        <select id="room-select" name="spaceId" disabled>
          <option value="3" selected>11층 수성</option>
        </select>
        <button id="form-update-submit" type="button">수정하기</button>
      </form>
    </main>
  `);

  await page.evaluate(() => {
    window.__ZZK_DEBUG_MODE__ = true;
  });
  await injectContentScriptBundle(page);
  await page.evaluate(() => {
    Storage.prototype.setItem = function failingSetItem() {
      throw new Error("blocked session setItem");
    };
  });

  await page.click("#form-update-submit");
  await page.waitForTimeout(100);

  const storageEvents = await page.evaluate(() => {
    return (window.__zzkTestApi?.getDebugEvents?.() || []).filter((entry) => {
      return entry.scope === "storage" && entry.event === "write-failed";
    });
  });

  expect(storageEvents).toEqual(
    expect.arrayContaining([
      expect.objectContaining({
        detail: expect.objectContaining({
          area: "sessionStorage",
          key: "zzk-pending-edit-submit-v1",
        }),
      }),
    ]),
  );
});

test("same-route history replaceState does not repeat guest route synchronization", async ({ page }) => {
  await page.goto("https://example.com/guest/test-map", { waitUntil: "domcontentloaded" });

  const requestCountByPath = new Map();

  await page.route("https://k8s.zzimkkong.com/api/guests/**", async (route) => {
    const url = new URL(route.request().url());
    const key = `${url.pathname}?${url.searchParams.toString()}`;
    requestCountByPath.set(key, (requestCountByPath.get(key) || 0) + 1);

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
          spaces: [
            {
              id: 3,
              name: "수성",
              color: "#60a5fa",
              reservationEnable: true,
              settings: [{ settingStartTime: "09:00:00", settingEndTime: "18:00:00" }],
            },
          ],
        }),
      });
      return;
    }

    if (url.pathname === "/api/guests/maps/234/spaces/availability") {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({ spaces: [{ spaceId: 3, isAvailable: true }] }),
      });
      return;
    }

    if (url.pathname === "/api/guests/maps/234/spaces/3/reservations") {
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
        <input id="reservation-date" name="date" type="date" value="2026-03-02" />

        <label for="start-time">시작시간</label>
        <input id="start-time" name="startTime" type="time" value="10:00" />

        <label for="end-time">종료시간</label>
        <input id="end-time" name="endTime" type="time" value="10:30" />

        <label for="room-select">공간 선택</label>
        <select id="room-select" name="spaceId">
          <option value="3" selected>11층 수성</option>
        </select>

        <div id="form-action-row" style="display:flex; gap:8px; margin-top:12px;">
          <button id="form-reserve-submit" type="button">예약하기</button>
        </div>
      </form>
    </main>
  `);

  await page.evaluate(() => {
    window.__ZZK_DEBUG_MODE__ = true;
  });
  await injectContentScriptBundle(page);
  await page.waitForTimeout(700);

  const initialRequestTotal = Array.from(requestCountByPath.values()).reduce((sum, count) => sum + count, 0);

  await page.evaluate(() => {
    window.__zzkTestApi?.clearDebugEvents?.();
    history.replaceState({ same: true }, "", "/guest/test-map");
  });
  await page.waitForTimeout(300);

  const routeEvents = await page.evaluate(() => {
    return (window.__zzkTestApi?.getDebugEvents?.() || []).filter((entry) => {
      return entry.scope === "guest-ui" && entry.event === "location-change";
    });
  });
  const finalRequestTotal = Array.from(requestCountByPath.values()).reduce((sum, count) => sum + count, 0);

  expect(routeEvents).toHaveLength(0);
  expect(finalRequestTotal).toBe(initialRequestTotal);
});

test("leaving guest route restores page reservation network hook", async ({ page }) => {
  await page.goto("https://example.com/guest/test-map", { waitUntil: "domcontentloaded" });

  await page.setContent(`
    <main>
      <form id="reservation-form" style="display:block; width:560px;">
        <label for="reservation-date">날짜</label>
        <input id="reservation-date" name="date" type="date" value="2026-03-02" />

        <label for="start-time">시작시간</label>
        <input id="start-time" name="startTime" type="time" value="10:00" />

        <label for="end-time">종료시간</label>
        <input id="end-time" name="endTime" type="time" value="10:30" />

        <label for="room-select">공간 선택</label>
        <select id="room-select" name="spaceId">
          <option value="3" selected>11층 수성</option>
        </select>
      </form>
    </main>
  `);

  await injectContentScriptBundle(page);
  await page.waitForTimeout(300);

  await page.evaluate(() => {
    window.__zzkReservationHookLoaded = true;
    window.__zzkReservationHookRestoreCalls = 0;
    window.__zzkReservationHookRestore = () => {
      window.__zzkReservationHookRestoreCalls += 1;
      window.__zzkReservationHookLoaded = false;
      delete window.__zzkReservationHookRestore;
      return true;
    };
    history.pushState({ host: true }, "", "/host/maps");
  });
  await page.waitForTimeout(300);

  const snapshot = await page.evaluate(() => {
    return {
      restoreCalls: window.__zzkReservationHookRestoreCalls,
      loaded: window.__zzkReservationHookLoaded === true,
      hasRestore: typeof window.__zzkReservationHookRestore === "function",
    };
  });

  expect(snapshot).toMatchObject({
    restoreCalls: 1,
    loaded: false,
    hasRestore: false,
  });
});

test("late page reservation hook install is restored after leaving guest route", async ({ page }) => {
  await page.goto("https://example.com/guest/test-map", { waitUntil: "domcontentloaded" });

  await page.setContent(`
    <main>
      <form id="reservation-form" style="display:block; width:560px;">
        <label for="reservation-date">날짜</label>
        <input id="reservation-date" name="date" type="date" value="2026-03-02" />

        <label for="start-time">시작시간</label>
        <input id="start-time" name="startTime" type="time" value="10:00" />

        <label for="end-time">종료시간</label>
        <input id="end-time" name="endTime" type="time" value="10:30" />

        <label for="room-select">공간 선택</label>
        <select id="room-select" name="spaceId">
          <option value="3" selected>11층 수성</option>
        </select>
      </form>
    </main>
  `);

  await injectContentScriptBundle(page, async () => {
    await page.evaluate(() => {
      const originalHeadAppendChild = document.head.appendChild.bind(document.head);
      window.__zzkHookInstallRace = {
        networkAppended: false,
        restoreCalls: 0,
      };
      window.chrome = {
        runtime: {
          getURL(scriptPath) {
            return `https://example.com/${scriptPath}`;
          },
        },
      };
      document.head.appendChild = function patchedHeadAppendChild(node) {
        if (node instanceof HTMLScriptElement && node.dataset.zzkInjected === "true") {
          if (node.src.includes("src/page-hook/shared.js")) {
            window.__zzkHookInstallRace.releaseShared = () => {
              node.dispatchEvent(new Event("load"));
            };
            return node;
          }
          if (node.src.includes("src/page-network-hook.js")) {
            window.__zzkHookInstallRace.networkAppended = true;
            window.__zzkHookInstallRace.releaseNetwork = () => {
              window.__zzkReservationHookLoaded = true;
              window.__zzkReservationHookRestore = () => {
                window.__zzkHookInstallRace.restoreCalls += 1;
                window.__zzkReservationHookLoaded = false;
                delete window.__zzkReservationHookRestore;
                return true;
              };
              node.dispatchEvent(new Event("load"));
            };
            return node;
          }
          if (node.src.includes("src/page-network-restore.js")) {
            window.__zzkHookInstallRace.restoreBridgeAppended = true;
            window.setTimeout(() => node.dispatchEvent(new Event("load")), 0);
            return node;
          }
        }

        return originalHeadAppendChild(node);
      };
    });
  });

  await page.evaluate(() => {
    window.__zzkHookInstallRace.releaseShared();
  });
  await page.waitForFunction(() => window.__zzkHookInstallRace.networkAppended === true);

  await page.evaluate(() => {
    history.pushState({ host: true }, "", "/host/maps");
    window.__zzkHookInstallRace.releaseNetwork();
  });
  await page.waitForTimeout(300);

  const snapshot = await page.evaluate(() => {
    return {
      loaded: window.__zzkReservationHookLoaded === true,
      hasRestore: typeof window.__zzkReservationHookRestore === "function",
      restoreCalls: window.__zzkHookInstallRace.restoreCalls,
      restoreBridgeAppended: window.__zzkHookInstallRace.restoreBridgeAppended === true,
    };
  });

  expect(snapshot).toMatchObject({
    loaded: false,
    hasRestore: false,
    restoreCalls: 1,
  });
});

test("slack message reads owner from owner-labeled custom control", async ({ page }) => {
  await page.goto("https://example.com/guest/test-map", { waitUntil: "domcontentloaded" });

  await page.setContent(`
    <main>
      <div id="top-tabs" style="display:flex; gap:8px; margin-bottom:16px;">
        <button type="button">예약현황</button>
        <button type="button">예약하기</button>
      </div>

      <form id="reservation-form" style="display:block; width:560px;">
        <label for="reservation-date">날짜</label>
        <input id="reservation-date" name="date" type="date" value="2026-03-02" />

        <label for="start-time">시작시간</label>
        <input id="start-time" name="startTime" type="time" value="12:20" />

        <label for="end-time">종료시간</label>
        <input id="end-time" name="endTime" type="time" value="13:20" />

        <label for="room-select">공간 선택</label>
        <select id="room-select" name="spaceId">
          <option value="">공간 선택</option>
          <option value="5" selected>12층 보이저</option>
        </select>

        <div style="margin-top:8px;">
          <label id="owner-name-label">예약자명</label>
          <button
            id="owner-name-combobox"
            type="button"
            role="combobox"
            aria-labelledby="owner-name-label"
            aria-label="예약자명"
            style="display:inline-flex; margin-left:8px;"
          >
            애니
          </button>
        </div>

        <label for="purpose">사용목적</label>
        <textarea id="purpose" name="purpose">커스텀 이름 추출 검증</textarea>

        <div id="form-action-row" style="display:flex; flex-direction:row; flex-wrap:nowrap; gap:8px; margin-top:12px;">
          <button id="form-reserve-submit" type="button">예약하기</button>
        </div>
      </form>
    </main>
  `);

  await injectContentScriptBundle(page);
  await page.waitForTimeout(700);

  await openSlackModalFromReservationSuccess(page);

  const payload = await page.evaluate(() => {
    const modal = document.getElementById("zzk-slack-copy-modal");
    if (!(modal instanceof HTMLElement)) {
      return "";
    }

    return Array.from(modal.querySelectorAll("textarea"))
      .map((node) => (node instanceof HTMLTextAreaElement ? node.value : ""))
      .join("\n");
  });

  expect(payload).toContain('/remind me "12:20-13:20 커스텀 이름 추출 검증 at 12F 보이저"');
  expect(payload).not.toContain("> 예약자명 : 애니");
});

test("reservation intent snapshot preserves owner when form value is cleared before network success", async ({ page }) => {
  await page.goto("https://example.com/guest/test-map", { waitUntil: "domcontentloaded" });

  await page.setContent(`
    <main>
      <form id="reservation-form" style="display:block; width:560px;">
        <label for="reservation-date">날짜</label>
        <input id="reservation-date" name="date" type="date" value="2026-03-02" />

        <label for="start-time">시작시간</label>
        <input id="start-time" name="startTime" type="time" value="12:20" />

        <label for="end-time">종료시간</label>
        <input id="end-time" name="endTime" type="time" value="13:20" />

        <label for="room-select">공간 선택</label>
        <select id="room-select" name="spaceId">
          <option value="">공간 선택</option>
          <option value="5" selected>12층 보이저</option>
        </select>

        <label for="owner-name">이름</label>
        <input id="owner-name" name="name" type="text" value="애니" />

        <label for="purpose">사용목적</label>
        <textarea id="purpose" name="purpose">intent snapshot 검증</textarea>

        <div id="form-action-row" style="display:flex; flex-direction:row; flex-wrap:nowrap; gap:8px; margin-top:12px;">
          <button id="form-reserve-submit" type="button">예약하기</button>
        </div>
      </form>
    </main>
  `);

  await injectContentScriptBundle(page);
  await page.waitForTimeout(700);

  await page.click("#form-reserve-submit");
  await page.evaluate(() => {
    const ownerInput = document.querySelector("input[name='name']");
    if (ownerInput instanceof HTMLInputElement) {
      ownerInput.value = "";
      ownerInput.dispatchEvent(new Event("input", { bubbles: true }));
      ownerInput.dispatchEvent(new Event("change", { bubbles: true }));
    }
  });

  await page.evaluate(() => {
    window.postMessage(
      {
        source: "zzk-page-reservation-hook",
        type: "ZZK_RESERVATION_NETWORK_EVENT",
        payload: {
          ok: true,
          status: 200,
          method: "POST",
          url: "https://k8s.zzimkkong.com/api/guests/maps/abc/reservations",
        },
      },
      "*"
    );
  });

  await page.waitForTimeout(500);

  const payload = await page.evaluate(() => {
    const modal = document.getElementById("zzk-slack-copy-modal");
    if (!(modal instanceof HTMLElement)) {
      return "";
    }

    return Array.from(modal.querySelectorAll("textarea"))
      .map((node) => (node instanceof HTMLTextAreaElement ? node.value : ""))
      .join("\n");
  });

  expect(payload).toContain('/remind me "12:20-13:20 intent snapshot 검증 at 12F 보이저"');
  expect(payload).not.toContain("> 예약자명 : 애니");
});

test("ambiguous late reservation success after a newer submit does not reuse the newer snapshot", async ({ page }) => {
  await page.goto("https://example.com/guest/test-map", { waitUntil: "domcontentloaded" });

  await page.setContent(`
    <main>
      <form id="reservation-form" style="display:block; width:560px;">
        <label for="reservation-date">날짜</label>
        <input id="reservation-date" name="date" type="date" value="2026-03-02" />

        <label for="start-time">시작시간</label>
        <input id="start-time" name="startTime" type="time" value="09:00" />

        <label for="end-time">종료시간</label>
        <input id="end-time" name="endTime" type="time" value="10:00" />

        <label for="room-select">공간 선택</label>
        <select id="room-select" name="spaceId">
          <option value="3" selected>11층 수성</option>
          <option value="5">12층 보이저</option>
        </select>

        <label for="purpose">사용목적</label>
        <textarea id="purpose" name="purpose">첫 번째 예약</textarea>

        <div id="form-action-row" style="display:flex; gap:8px; margin-top:12px;">
          <button id="form-reserve-submit" type="button">예약하기</button>
        </div>
      </form>
    </main>
  `);

  await page.evaluate(() => {
    window.__ZZK_DEBUG_MODE__ = true;
  });
  await injectContentScriptBundle(page);
  await page.waitForTimeout(700);

  await page.click("#form-reserve-submit");
  await page.evaluate(() => {
    const startInput = document.getElementById("start-time");
    const endInput = document.getElementById("end-time");
    const roomSelect = document.getElementById("room-select");
    const purposeInput = document.getElementById("purpose");
    if (startInput instanceof HTMLInputElement) {
      startInput.value = "15:00";
      startInput.dispatchEvent(new Event("input", { bubbles: true }));
      startInput.dispatchEvent(new Event("change", { bubbles: true }));
    }
    if (endInput instanceof HTMLInputElement) {
      endInput.value = "16:00";
      endInput.dispatchEvent(new Event("input", { bubbles: true }));
      endInput.dispatchEvent(new Event("change", { bubbles: true }));
    }
    if (roomSelect instanceof HTMLSelectElement) {
      roomSelect.value = "5";
      roomSelect.dispatchEvent(new Event("change", { bubbles: true }));
    }
    if (purposeInput instanceof HTMLTextAreaElement) {
      purposeInput.value = "두 번째 예약";
      purposeInput.dispatchEvent(new Event("input", { bubbles: true }));
      purposeInput.dispatchEvent(new Event("change", { bubbles: true }));
    }
  });
  await page.click("#form-reserve-submit");

  await page.evaluate(() => {
    window.__zzkTestApi?.clearDebugEvents?.();
    window.postMessage(
      {
        source: "zzk-page-reservation-hook",
        type: "ZZK_RESERVATION_NETWORK_EVENT",
        payload: {
          ok: true,
          status: 200,
          method: "POST",
          url: "https://k8s.zzimkkong.com/api/guests/maps/abc/reservations",
        },
      },
      "*"
    );
  });
  await page.waitForTimeout(500);

  const snapshot = await page.evaluate(() => {
    const modal = document.getElementById("zzk-slack-copy-modal");
    const ignoredEvents = (window.__zzkTestApi?.getDebugEvents?.() || []).filter((entry) => {
      return entry.scope === "slack-success" && entry.event === "ignored-ambiguous-success";
    });
    return {
      hasModal: modal instanceof HTMLElement,
      ignoredCount: ignoredEvents.length,
    };
  });

  expect(snapshot.hasModal).toBeFalsy();
  expect(snapshot.ignoredCount).toBe(1);
});

test("matched reservation attempt success tolerates changed API path after the old 20 second window", async ({ page }) => {
  await page.goto("https://example.com/guest/test-map", { waitUntil: "domcontentloaded" });

  await page.route("**/api/guests/maps/abc/bookings/complete", async (route) => {
    await route.fulfill({
      status: 200,
      headers: {
        "access-control-allow-origin": "https://example.com",
        "access-control-allow-methods": "POST, OPTIONS",
        "access-control-allow-headers": "content-type",
      },
      contentType: "application/json",
      body: "{}",
    });
  });

  await page.setContent(`
    <main>
      <form id="reservation-form" style="display:block; width:560px;">
        <label for="reservation-date">날짜</label>
        <input id="reservation-date" name="date" type="date" value="2026-03-02" />
        <label for="start-time">시작시간</label>
        <input id="start-time" name="startTime" type="time" value="09:30" />
        <label for="end-time">종료시간</label>
        <input id="end-time" name="endTime" type="time" value="10:30" />
        <label for="room-select">공간 선택</label>
        <select id="room-select" name="spaceId">
          <option value="3" selected>11층 수성</option>
        </select>
        <label for="purpose">사용목적</label>
        <textarea id="purpose" name="purpose">느린 응답 매칭</textarea>
        <div id="form-action-row" style="display:flex; gap:8px; margin-top:12px;">
          <button id="form-reserve-submit" type="button">예약하기</button>
        </div>
      </form>
    </main>
  `);

  await injectContentScriptBundle(page);
  await page.waitForTimeout(700);
  await page.addScriptTag({ path: path.resolve(process.cwd(), "src/page-hook/shared.js") });
  await page.addScriptTag({ path: path.resolve(process.cwd(), "src/page-network-hook.js") });
  await page.click("#form-reserve-submit");

  const attemptId = await page.evaluate(() => {
    return document.documentElement.dataset.zzkReservationAttemptId || "";
  });
  expect(attemptId).not.toBe("");

  await page.evaluate(async () => {
    const originalNow = Date.now;
    window.__zzkRestoreDateNow = () => {
      Date.now = originalNow;
      delete window.__zzkRestoreDateNow;
    };
    Date.now = () => originalNow() + 21000;
    await fetch("/api/guests/maps/abc/bookings/complete", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        date: "2026-03-02",
        startTime: "09:30",
        endTime: "10:30",
        description: "느린 응답 매칭",
        roomName: "11층 수성",
      }),
    });
  });
  await page.waitForTimeout(500);
  await page.evaluate(() => {
    window.__zzkRestoreDateNow?.();
  });

  const payload = await page.evaluate(() => {
    const modal = document.getElementById("zzk-slack-copy-modal");
    if (!(modal instanceof HTMLElement)) {
      return "";
    }
    return Array.from(modal.querySelectorAll("textarea"))
      .map((node) => (node instanceof HTMLTextAreaElement ? node.value : ""))
      .join("\n");
  });

  expect(payload).toContain('/remind me "09:30-10:30 느린 응답 매칭 at 11F 수성"');
});

test("network payload ownerNameCandidate backfills owner when form fields are empty", async ({ page }) => {
  await page.goto("https://example.com/guest/test-map", { waitUntil: "domcontentloaded" });

  await page.setContent(`
    <main>
      <form id="reservation-form" style="display:block; width:560px;">
        <label for="reservation-date">날짜</label>
        <input id="reservation-date" name="date" type="date" value="2026-03-02" />

        <label for="start-time">시작시간</label>
        <input id="start-time" name="startTime" type="time" value="15:30" />

        <label for="end-time">종료시간</label>
        <input id="end-time" name="endTime" type="time" value="16:30" />

        <label for="room-select">공간 선택</label>
        <select id="room-select" name="spaceId">
          <option value="">공간 선택</option>
          <option value="5" selected>11층 금성</option>
        </select>

        <label for="owner-name">이름</label>
        <input id="owner-name" name="name" type="text" value="" />

        <div id="form-action-row" style="display:flex; gap:8px; margin-top:12px;">
          <button id="form-reserve-submit" type="button">예약하기</button>
        </div>
      </form>
    </main>
  `);

  await injectContentScriptBundle(page);
  await page.waitForTimeout(700);

  await page.click("#form-reserve-submit");
  await page.evaluate(() => {
    window.postMessage(
      {
        source: "zzk-page-reservation-hook",
        type: "ZZK_RESERVATION_NETWORK_EVENT",
        payload: {
          ok: true,
          status: 200,
          method: "POST",
          url: "https://k8s.zzimkkong.com/api/guests/maps/abc/reservations",
          ownerNameCandidate: "애니",
        },
      },
      "*"
    );
  });

  await page.waitForTimeout(500);

  const payload = await page.evaluate(() => {
    const modal = document.getElementById("zzk-slack-copy-modal");
    if (!(modal instanceof HTMLElement)) {
      return "";
    }

    return Array.from(modal.querySelectorAll("textarea"))
      .map((node) => (node instanceof HTMLTextAreaElement ? node.value : ""))
      .join("\n");
  });

  expect(payload).toContain('/remind me "15:30-16:30 회의 at 11F 금성"');
  expect(payload).not.toContain("> 예약자명 : 애니");
});

test("owner input watcher keeps last typed owner for Slack test modal after field cleared", async ({ page }) => {
  await page.goto("https://example.com/guest/test-map", { waitUntil: "domcontentloaded" });

  await page.setContent(`
    <main>
      <form id="reservation-form" style="display:block; width:560px;">
        <label for="reservation-date">날짜</label>
        <input id="reservation-date" name="date" type="date" value="2026-03-02" />

        <label for="start-time">시작시간</label>
        <input id="start-time" name="startTime" type="time" value="13:00" />

        <label for="end-time">종료시간</label>
        <input id="end-time" name="endTime" type="time" value="14:00" />

        <label for="owner-name">이름</label>
        <input id="owner-name" name="name" type="text" value="" />

        <div id="form-action-row" style="display:flex; gap:8px; margin-top:12px;">
          <button id="form-reserve-submit" type="button">예약하기</button>
        </div>
      </form>
    </main>
  `);

  await injectContentScriptBundle(page);

  await page.fill("#owner-name", "애니");
  await page.evaluate(() => {
    const ownerInput = document.getElementById("owner-name");
    if (ownerInput instanceof HTMLInputElement) {
      ownerInput.value = "";
      ownerInput.dispatchEvent(new Event("input", { bubbles: true }));
      ownerInput.dispatchEvent(new Event("change", { bubbles: true }));
    }
  });

  await openSlackModalFromReservationSuccess(page);

  const payload = await page.evaluate(() => {
    const modal = document.getElementById("zzk-slack-copy-modal");
    if (!(modal instanceof HTMLElement)) {
      return "";
    }

    return Array.from(modal.querySelectorAll("textarea"))
      .map((node) => (node instanceof HTMLTextAreaElement ? node.value : ""))
      .join("\n");
  });

  expect(payload).toContain('/remind me "13:00-14:00 회의 at 회의실"');
  expect(payload).not.toContain("> 예약자명 : 애니");
});

test("disabled owner input value is used for Slack owner line", async ({ page }) => {
  await page.goto("https://example.com/guest/test-map", { waitUntil: "domcontentloaded" });

  await page.setContent(`
    <main>
      <form id="reservation-form" style="display:block; width:560px;">
        <label for="reservation-date">날짜</label>
        <input id="reservation-date" name="date" type="date" value="2026-03-02" />

        <label for="start-time">시작시간</label>
        <input id="start-time" name="startTime" type="time" value="15:10" />

        <label for="end-time">종료시간</label>
        <input id="end-time" name="endTime" type="time" value="16:10" />

        <label for="room-select">공간 선택</label>
        <select id="room-select" name="spaceId">
          <option value="5" selected>11층 금성</option>
        </select>

        <label for="owner-name">이름</label>
        <input id="owner-name" name="name" type="text" value="애니" disabled />

        <div id="form-action-row" style="display:flex; gap:8px; margin-top:12px;">
          <button id="form-reserve-submit" type="button">예약하기</button>
        </div>
      </form>
    </main>
  `);

  await injectContentScriptBundle(page);
  await page.waitForTimeout(700);

  await openSlackModalFromReservationSuccess(page);

  const payload = await page.evaluate(() => {
    const modal = document.getElementById("zzk-slack-copy-modal");
    if (!(modal instanceof HTMLElement)) {
      return "";
    }

    return Array.from(modal.querySelectorAll("textarea"))
      .map((node) => (node instanceof HTMLTextAreaElement ? node.value : ""))
      .join("\n");
  });

  expect(payload).toContain('/remind me "15:10-16:10 회의 at 11F 금성"');
  expect(payload).not.toContain("> 예약자명 : 애니");
});

test("radar launcher mounts beside room title without a legacy slack test trigger", async ({ page }) => {
  await page.goto("https://example.com/guest/test-map/reservation/edit", { waitUntil: "domcontentloaded" });

  await page.setContent(`
    <main>
      <section style="display:flex; align-items:center; gap:10px; margin-bottom:8px;">
        <h2 id="room-title" style="margin:0;">수성</h2>
      </section>

      <div id="top-tabs" style="display:flex; gap:8px; margin-bottom:16px;">
        <button type="button">예약현황</button>
        <button type="button">예약하기</button>
      </div>

      <form id="reservation-form" style="display:block; width:560px;">
        <label for="reservation-date">날짜</label>
        <input id="reservation-date" name="date" type="date" value="2026-03-02" />

        <label for="start-time">시작시간</label>
        <input id="start-time" name="startTime" type="time" value="12:20" />

        <label for="end-time">종료시간</label>
        <input id="end-time" name="endTime" type="time" value="13:20" />

        <label for="room-select">공간 선택</label>
        <select id="room-select" name="spaceId">
          <option value="">공간 선택</option>
          <option value="3" selected>11층 수성</option>
        </select>

        <div id="form-action-row" style="display:flex; gap:8px; margin-top:12px;">
          <button id="form-reserve-submit" type="button">예약하기</button>
        </div>
      </form>
    </main>
  `);

  await injectContentScriptBundle(page);
  await page.waitForTimeout(800);

  const snapshot = await page.evaluate(() => {
    const roomTitle = document.getElementById("room-title");
    const launcher = document.getElementById("zzk-map-calendar-radar-launcher");
    const launcherMountedBesideTitle =
      roomTitle instanceof HTMLElement &&
      launcher instanceof HTMLElement &&
      roomTitle.contains(launcher) &&
      launcher.dataset.zzkMountType === "room-title";

    return {
      launcherMountedBesideTitle,
      launcherLabel:
        launcher instanceof HTMLElement
          ? launcher.querySelector(".zzk-map-calendar-radar-label")?.textContent || ""
          : "",
    };
  });

  expect(snapshot.launcherMountedBesideTitle).toBeTruthy();
  expect(snapshot.launcherLabel).toContain("레이더");
});

test("edit page delays radar mount until host form is ready", async ({ page }) => {
  await page.goto("https://example.com/guest/test-map/reservation/edit", { waitUntil: "domcontentloaded" });

  await page.setContent(`
    <main>
      <section style="display:flex; align-items:center; gap:10px; margin-bottom:8px;">
        <h2 id="room-title" style="margin:0;">수성</h2>
      </section>
    </main>
  `);

  await injectContentScriptBundle(page);

  const beforeReady = await page.evaluate(() => {
    const launcher = document.getElementById("zzk-map-calendar-radar-launcher");
    const overlay = document.getElementById("zzk-map-calendar-overlay");
    return {
      hasLauncher: launcher instanceof HTMLElement,
      hasOverlay: overlay instanceof HTMLElement,
    };
  });

  expect(beforeReady).toEqual({
    hasLauncher: false,
    hasOverlay: false,
  });

  await page.evaluate(() => {
    const main = document.querySelector("main");
    if (!(main instanceof HTMLElement)) {
      return;
    }

    const form = document.createElement("form");
    form.id = "reservation-form";
    form.style.display = "block";
    form.style.width = "560px";
    form.innerHTML = `
      <label for="reservation-date">날짜</label>
      <input id="reservation-date" name="date" type="date" value="2026-03-02" />

      <label for="start-time">시작시간</label>
      <input id="start-time" name="startTime" type="time" value="12:20" />

      <label for="end-time">종료시간</label>
      <input id="end-time" name="endTime" type="time" value="13:20" />

      <label for="room-select">공간 선택</label>
      <select id="room-select" name="spaceId">
        <option value="3" selected>11층 수성</option>
      </select>
    `;

    main.appendChild(form);
  });

  await page.waitForTimeout(500);

  const stillWaiting = await page.evaluate(() => {
    const launcher = document.getElementById("zzk-map-calendar-radar-launcher");
    const overlay = document.getElementById("zzk-map-calendar-overlay");
    return {
      hasLauncher: launcher instanceof HTMLElement,
      hasOverlay: overlay instanceof HTMLElement,
    };
  });

  expect(stillWaiting).toEqual({
    hasLauncher: false,
    hasOverlay: false,
  });

  await page.evaluate(() => {
    const form = document.getElementById("reservation-form");
    if (!(form instanceof HTMLFormElement)) {
      return;
    }

    const actionRow = document.createElement("div");
    actionRow.id = "form-action-row";
    actionRow.style.display = "flex";
    actionRow.style.gap = "8px";
    actionRow.style.marginTop = "12px";

    const submitButton = document.createElement("button");
    submitButton.id = "form-update-submit";
    submitButton.type = "button";
    submitButton.textContent = "예약 수정하기";

    actionRow.appendChild(submitButton);
    form.appendChild(actionRow);
  });
  await page.evaluate(() => {
    window.__zzkTestApi?.syncGuestUi?.();
  });

  await expect
    .poll(async () => {
      return await page.evaluate(() => {
        const roomTitle = document.getElementById("room-title");
        const launcher = document.getElementById("zzk-map-calendar-radar-launcher");
        return {
          hasLauncher: launcher instanceof HTMLElement,
          launcherMountedBesideTitle:
            roomTitle instanceof HTMLElement &&
            launcher instanceof HTMLElement &&
            roomTitle.contains(launcher) &&
            launcher.dataset.zzkMountType === "room-title",
        };
      });
    }, { timeout: 15000 })
    .toMatchObject({
      hasLauncher: true,
      launcherMountedBesideTitle: true,
    });
});

test("reservation page mounts radar launcher near tabs, not room selector", async ({ page }) => {
  await page.goto("https://example.com/guest/test-map", { waitUntil: "domcontentloaded" });

  await page.setContent(`
    <main>
      <div id="top-tabs" style="display:flex; gap:8px; margin-bottom:16px;">
        <button type="button">예약현황</button>
        <button type="button">예약하기</button>
      </div>

      <form id="reservation-form" style="display:block; width:560px;">
        <label for="reservation-date">날짜</label>
        <input id="reservation-date" name="date" type="date" value="2026-03-02" />

        <label for="room-select">공간 선택</label>
        <select id="room-select" name="spaceId">
          <option value="3" selected>11층 수성</option>
          <option value="4">11층 금성</option>
        </select>

        <div id="form-action-row" style="display:flex; gap:8px; margin-top:12px;">
          <button id="form-reserve-submit" type="button">예약하기</button>
        </div>
      </form>
    </main>
  `);

  await injectContentScriptBundle(page);

  const snapshot = await page.evaluate(() => {
    const launcher = document.getElementById("zzk-map-calendar-radar-launcher");
    const roomSelect = document.getElementById("room-select");
    const topTabs = document.getElementById("top-tabs");

    const isInsideRoomSelector =
      launcher instanceof HTMLElement &&
      roomSelect instanceof HTMLElement &&
      roomSelect.contains(launcher);
    const isMountedNearTabs =
      launcher instanceof HTMLElement &&
      topTabs instanceof HTMLElement &&
      topTabs.contains(launcher);

    return {
      hasLauncher: launcher instanceof HTMLElement,
      mountType: launcher instanceof HTMLElement ? launcher.dataset.zzkMountType || "" : "",
      isInsideRoomSelector,
      isMountedNearTabs,
    };
  });

  expect(snapshot.hasLauncher).toBeTruthy();
  expect(snapshot.mountType).toBe("default");
  expect(snapshot.isInsideRoomSelector).toBeFalsy();
  expect(snapshot.isMountedNearTabs).toBeTruthy();
});

test("guest detail page delays radar mount until reservation tabs are ready", async ({ page }) => {
  await page.goto("https://example.com/guest/test-map", { waitUntil: "domcontentloaded" });

  await page.setContent(`
    <main>
      <section>
        <h2 style="margin:0 0 8px;">로딩 중</h2>
      </section>
    </main>
  `);

  await injectContentScriptBundle(page);

  const beforeReady = await page.evaluate(() => {
    const launcher = document.getElementById("zzk-map-calendar-radar-launcher");
    return {
      hasLauncher: launcher instanceof HTMLElement,
      bodyContainsLauncher:
        launcher instanceof HTMLElement && launcher.parentElement === document.body,
    };
  });

  expect(beforeReady).toEqual({
    hasLauncher: false,
    bodyContainsLauncher: false,
  });

  await page.evaluate(() => {
    const main = document.querySelector("main");
    if (!(main instanceof HTMLElement)) {
      return;
    }

    const tabs = document.createElement("div");
    tabs.id = "top-tabs";
    tabs.style.display = "flex";
    tabs.style.gap = "8px";
    tabs.style.marginBottom = "16px";
    tabs.innerHTML = `
      <button type="button">예약현황</button>
      <button type="button">예약하기</button>
    `;

    const form = document.createElement("form");
    form.id = "reservation-form";
    form.style.display = "block";
    form.style.width = "560px";
    form.innerHTML = `
      <label for="room-select">공간 선택</label>
      <select id="room-select" name="spaceId">
        <option value="3" selected>11층 수성</option>
      </select>
      <div id="form-action-row" style="display:flex; gap:8px; margin-top:12px;">
        <button id="form-reserve-submit" type="button">예약하기</button>
      </div>
    `;

    main.prepend(tabs);
    main.appendChild(form);
  });
  await page.evaluate(() => {
    window.__zzkTestApi?.syncGuestUi?.();
  });

  await page.waitForTimeout(500);

  const stillWaiting = await page.evaluate(() => {
    const launcher = document.getElementById("zzk-map-calendar-radar-launcher");
    return {
      hasLauncher: launcher instanceof HTMLElement,
      bodyContainsLauncher:
        launcher instanceof HTMLElement && launcher.parentElement === document.body,
    };
  });

  expect(stillWaiting).toEqual({
    hasLauncher: false,
    bodyContainsLauncher: false,
  });

  await page.evaluate(() => {
    const form = document.getElementById("reservation-form");
    if (!(form instanceof HTMLFormElement)) {
      return;
    }

    const dateLabel = document.createElement("label");
    dateLabel.setAttribute("for", "reservation-date");
    dateLabel.textContent = "날짜";

    const dateInput = document.createElement("input");
    dateInput.id = "reservation-date";
    dateInput.name = "date";
    dateInput.type = "date";
    dateInput.value = "2026-03-02";

    const actionRow = document.createElement("div");
    actionRow.id = "form-action-row";
    actionRow.style.display = "flex";
    actionRow.style.gap = "8px";
    actionRow.style.marginTop = "12px";

    const submitButton = document.createElement("button");
    submitButton.id = "form-reserve-submit";
    submitButton.type = "button";
    submitButton.textContent = "예약하기";

    actionRow.appendChild(submitButton);
    form.prepend(dateInput);
    form.prepend(dateLabel);
    form.appendChild(actionRow);
  });
  await page.evaluate(() => {
    window.__zzkTestApi?.syncGuestUi?.();
  });

  await expect
    .poll(async () => {
      return await page.evaluate(() => {
        const launcher = document.getElementById("zzk-map-calendar-radar-launcher");
        const topTabs = document.getElementById("top-tabs");
        return {
          hasLauncher: launcher instanceof HTMLElement,
          mountType: launcher instanceof HTMLElement ? launcher.dataset.zzkMountType || "" : "",
          isMountedNearTabs:
            launcher instanceof HTMLElement &&
            topTabs instanceof HTMLElement &&
            topTabs.contains(launcher),
        };
      });
    }, { timeout: 15000 })
    .toMatchObject({
      hasLauncher: true,
      mountType: "default",
      isMountedNearTabs: true,
    });
});

test("edit page radar locks selection to current room and grays out other rooms", async ({ page }) => {
  await page.goto("https://example.com/guest/test-map/reservation/edit", {
    waitUntil: "domcontentloaded",
  });

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
          spaces: [
            {
              id: 3,
              name: "수성",
              color: "#60a5fa",
              reservationEnable: true,
              settings: [{ settingStartTime: "09:00:00", settingEndTime: "18:00:00" }],
            },
            {
              id: 4,
              name: "금성",
              color: "#f97316",
              reservationEnable: true,
              settings: [{ settingStartTime: "09:00:00", settingEndTime: "18:00:00" }],
            },
          ],
        }),
      });
      return;
    }

    if (url.pathname === "/api/guests/maps/234/spaces/availability") {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          spaces: [
            { spaceId: 3, isAvailable: true },
            { spaceId: 4, isAvailable: false },
          ],
        }),
      });
      return;
    }

    if (url.pathname === "/api/guests/maps/234/spaces/3/reservations") {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({ reservations: [] }),
      });
      return;
    }

    if (url.pathname === "/api/guests/maps/234/spaces/4/reservations") {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          reservations: [
            {
              id: 700,
              name: "팀A",
              description: "이미 예약됨",
              startDateTime: "2026-12-02T10:10:00+09:00",
              endDateTime: "2026-12-02T10:40:00+09:00",
            },
          ],
        }),
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
      <section style="display:flex; align-items:center; gap:10px; margin-bottom:8px;">
        <h2 id="room-title" style="margin:0;">수성</h2>
      </section>

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
        <input id="end-time" name="endTime" type="time" value="10:50" />

        <label for="room-select">공간 선택</label>
        <select id="room-select" name="spaceId" disabled>
          <option value="3" selected>11층 수성</option>
          <option value="4">11층 금성</option>
        </select>

        <div id="form-action-row" style="display:flex; gap:8px; margin-top:12px;">
          <button id="form-update-submit" type="button">예약 수정하기</button>
        </div>
      </form>
    </main>
  `);

  await injectContentScriptBundle(page);
  await page.waitForTimeout(1200);

  await page.evaluate(() => {
    const overlayRows = document.querySelectorAll("#zzk-map-calendar-overlay .zzk-map-calendar-row");
    if (overlayRows.length > 0) {
      return;
    }

    const launcher = document.getElementById("zzk-map-calendar-radar-launcher");
    if (launcher instanceof HTMLButtonElement) {
      launcher.click();
    }
  });

  await page.waitForSelector("#zzk-map-calendar-overlay .zzk-map-calendar-row", { timeout: 6000 });

  const overlayDateNavSnapshot = await page.evaluate(() => {
    const overlay = document.getElementById("zzk-map-calendar-overlay");
    if (!(overlay instanceof HTMLElement)) {
      return {
        hasOverlay: false,
        hasPrevButton: false,
        hasNextButton: false,
        hasTodayButton: false,
      };
    }

    overlay.dataset.keepMountedProbe = "1";
    const prevButton = overlay.querySelector(".zzk-map-calendar-date-nav.prev");
    const nextButton = overlay.querySelector(".zzk-map-calendar-date-nav.next");
    const todayButton = overlay.querySelector(".zzk-map-calendar-date-nav.today");
    if (nextButton instanceof HTMLButtonElement) {
      nextButton.click();
    }

    return {
      hasOverlay: true,
      hasPrevButton: prevButton instanceof HTMLButtonElement,
      hasNextButton: nextButton instanceof HTMLButtonElement,
      hasTodayButton: todayButton instanceof HTMLButtonElement,
    };
  });

  expect(overlayDateNavSnapshot.hasOverlay).toBeTruthy();
  expect(overlayDateNavSnapshot.hasPrevButton).toBeTruthy();
  expect(overlayDateNavSnapshot.hasNextButton).toBeTruthy();
  expect(overlayDateNavSnapshot.hasTodayButton).toBeTruthy();

  await expect
    .poll(async () => {
      return await page.evaluate(() => {
        const overlay = document.getElementById("zzk-map-calendar-overlay");
        const dateInput =
          overlay instanceof HTMLElement
            ? overlay.querySelector(".zzk-map-calendar-control.zzk-date")
            : null;
        const isSameOverlay =
          overlay instanceof HTMLElement && overlay.dataset.keepMountedProbe === "1";
        const dateValue = dateInput instanceof HTMLInputElement ? dateInput.value : "";
        const overlayCount = document.querySelectorAll("#zzk-map-calendar-overlay").length;

        return `${isSameOverlay ? "1" : "0"}|${dateValue}|${overlayCount}`;
      });
    })
    .toBe("1|2026-12-03|1");

  const snapshot = await page.evaluate(() => {
    const launcher = document.getElementById("zzk-map-calendar-radar-launcher");
    const launcherStyle =
      launcher instanceof HTMLElement
        ? {
            borderRadius: getComputedStyle(launcher).borderRadius,
            paddingLeft: getComputedStyle(launcher).paddingLeft,
            paddingRight: getComputedStyle(launcher).paddingRight,
          }
        : null;

    const rows = Array.from(document.querySelectorAll("#zzk-map-calendar-overlay .zzk-map-calendar-row"));
    const findRowByRoom = (needle) => {
      return rows.find((row) => {
        if (!(row instanceof HTMLElement)) {
          return false;
        }
        const roomName = row.querySelector(".zzk-map-calendar-room-name");
        const text = roomName instanceof HTMLElement ? roomName.textContent || "" : "";
        return text.includes(needle);
      });
    };

    const suseongRow = findRowByRoom("수성");
    const geumseongRow = findRowByRoom("금성");
    const overlayDateRow = document.querySelector(
      "#zzk-map-calendar-overlay .zzk-map-calendar-date-row"
    );
    const overlayDateInput = document.querySelector(
      "#zzk-map-calendar-overlay .zzk-map-calendar-control.zzk-date"
    );
    const overlayDatePrevButton = document.querySelector(
      "#zzk-map-calendar-overlay .zzk-map-calendar-date-nav.prev"
    );
    const overlayDateNextButton = document.querySelector(
      "#zzk-map-calendar-overlay .zzk-map-calendar-date-nav.next"
    );
    const overlayDateTodayButton = document.querySelector(
      "#zzk-map-calendar-overlay .zzk-map-calendar-date-nav.today"
    );
    const overlayDateWeekdayLabel = document.querySelector(
      "#zzk-map-calendar-overlay .zzk-map-calendar-date-display"
    );
    const gridWrap = document.querySelector("#zzk-map-calendar-overlay .zzk-map-calendar-grid-wrap");
    const boundaryLayer = document.querySelector(
      "#zzk-map-calendar-overlay .zzk-map-calendar-hour-boundary-layer"
    );
    const boundaryTrack = document.querySelector(
      "#zzk-map-calendar-overlay .zzk-map-calendar-hour-boundary-track"
    );
    const dividerLayer = document.querySelector(
      "#zzk-map-calendar-overlay .zzk-map-calendar-divider-layer"
    );
    const dividerTrack = document.querySelector(
      "#zzk-map-calendar-overlay .zzk-map-calendar-divider-track"
    );
    const firstRowSlots = document.querySelector(
      "#zzk-map-calendar-overlay .zzk-map-calendar-row .zzk-map-calendar-slots"
    );
    const boundaryCells =
      boundaryTrack instanceof HTMLElement
        ? Array.from(boundaryTrack.querySelectorAll(".zzk-map-calendar-hour-boundary-cell"))
        : [];
    const rowBoundaryCells =
      firstRowSlots instanceof HTMLElement
        ? Array.from(firstRowSlots.querySelectorAll(".zzk-map-calendar-hour-boundary-cell"))
        : [];
    const trackRect = boundaryTrack instanceof HTMLElement ? boundaryTrack.getBoundingClientRect() : null;
    const gridWrapRect = gridWrap instanceof HTMLElement ? gridWrap.getBoundingClientRect() : null;
    const boundaryCoverageDiffs = boundaryCells
      .map((cell) => {
        if (!(cell instanceof HTMLElement) || trackRect == null) {
          return Number.NaN;
        }
        const rect = cell.getBoundingClientRect();
        return Math.abs(trackRect.height - rect.height);
      })
      .filter((value) => Number.isFinite(value));
    const maxBoundaryCoverageDiff =
      boundaryCoverageDiffs.length > 0 ? Math.max(...boundaryCoverageDiffs) : null;
    const firstRowGap =
      rows.length >= 2 && rows[0] instanceof HTMLElement && rows[1] instanceof HTMLElement
        ? rows[1].getBoundingClientRect().top - rows[0].getBoundingClientRect().bottom
        : null;
    const trackSpanDiff =
      trackRect != null && gridWrapRect != null ? Math.abs(trackRect.height - gridWrapRect.height) : null;

    return {
      hasSuseongRow: suseongRow instanceof HTMLElement,
      hasGeumseongRow: geumseongRow instanceof HTMLElement,
      suseongDisabled:
        suseongRow instanceof HTMLElement && suseongRow.classList.contains("room-locked-disabled"),
      suseongFreeSlotCount:
        suseongRow instanceof HTMLElement
          ? suseongRow.querySelectorAll(".zzk-map-calendar-slot.free").length
          : 0,
      suseongLockedSlotCount:
        suseongRow instanceof HTMLElement
          ? suseongRow.querySelectorAll(".zzk-map-calendar-slot.room-locked-disabled").length
          : 0,
      geumseongFreeSlotCount:
        geumseongRow instanceof HTMLElement
          ? geumseongRow.querySelectorAll(".zzk-map-calendar-slot.free").length
          : 0,
      geumseongDisabled:
        geumseongRow instanceof HTMLElement && geumseongRow.classList.contains("room-locked-disabled"),
      geumseongLockedSlotCount:
        geumseongRow instanceof HTMLElement
          ? geumseongRow.querySelectorAll(".zzk-map-calendar-slot.room-locked-disabled").length
          : 0,
      hasOverlayDateRow: overlayDateRow instanceof HTMLElement,
      hasOverlayDateInput: overlayDateInput instanceof HTMLInputElement,
      hasOverlayDatePrevButton: overlayDatePrevButton instanceof HTMLButtonElement,
      hasOverlayDateNextButton: overlayDateNextButton instanceof HTMLButtonElement,
      hasOverlayDateTodayButton: overlayDateTodayButton instanceof HTMLButtonElement,
      overlayDatePrevTitle:
        overlayDatePrevButton instanceof HTMLButtonElement ? overlayDatePrevButton.title || "" : "",
      overlayDateNextTitle:
        overlayDateNextButton instanceof HTMLButtonElement ? overlayDateNextButton.title || "" : "",
      overlayDateTodayTitle:
        overlayDateTodayButton instanceof HTMLButtonElement ? overlayDateTodayButton.title || "" : "",
      overlayDateWeekday:
        overlayDateWeekdayLabel instanceof HTMLElement ? overlayDateWeekdayLabel.textContent || "" : "",
      hasBoundaryLayer: boundaryLayer instanceof HTMLElement,
      hasBoundaryTrack: boundaryTrack instanceof HTMLElement,
      hasDividerLayer: dividerLayer instanceof HTMLElement,
      hasDividerTrack: dividerTrack instanceof HTMLElement,
      boundaryCellCount: boundaryCells.length,
      rowBoundaryCellCount: rowBoundaryCells.length,
      maxBoundaryCoverageDiff,
      firstRowGap,
      trackSpanDiff,
      hasTimeContext:
        document.querySelector("#zzk-map-calendar-overlay .zzk-map-calendar-time-context") instanceof
        HTMLElement,
      readonlyTimeCount: document.querySelectorAll(
        "#zzk-map-calendar-overlay .zzk-map-calendar-control.zzk-time.zzk-time-readonly"
      ).length,
      launcherStyle,
    };
  });

  expect(snapshot.hasSuseongRow).toBeTruthy();
  expect(snapshot.hasGeumseongRow).toBeTruthy();
  expect(snapshot.suseongDisabled).toBeFalsy();
  expect(snapshot.suseongFreeSlotCount).toBeGreaterThan(0);
  expect(snapshot.suseongLockedSlotCount).toBe(0);
  expect(snapshot.geumseongDisabled).toBeTruthy();
  expect(snapshot.geumseongFreeSlotCount).toBeGreaterThan(0);
  expect(snapshot.geumseongLockedSlotCount).toBeGreaterThan(0);
  expect(snapshot.hasOverlayDateRow).toBeTruthy();
  expect(snapshot.hasOverlayDateInput).toBeTruthy();
  expect(snapshot.hasOverlayDatePrevButton).toBeTruthy();
  expect(snapshot.hasOverlayDateNextButton).toBeTruthy();
  expect(snapshot.hasOverlayDateTodayButton).toBeTruthy();
  expect(snapshot.overlayDatePrevTitle).toContain("2026-12-02");
  expect(snapshot.overlayDateNextTitle).toContain("2026-12-04");
  expect(snapshot.overlayDateTodayTitle).toMatch(/^오늘 \(\d{4}-\d{2}-\d{2}\)$/);
  expect(snapshot.overlayDateWeekday).toMatch(/^2026\.12\.03 \([월화수목금토일]\)$/);
  expect(snapshot.hasBoundaryLayer).toBeTruthy();
  expect(snapshot.hasBoundaryTrack).toBeTruthy();
  expect(snapshot.hasDividerLayer).toBeTruthy();
  expect(snapshot.hasDividerTrack).toBeTruthy();
  expect(snapshot.boundaryCellCount).toBeGreaterThan(0);
  expect(snapshot.rowBoundaryCellCount).toBe(0);
  expect(snapshot.maxBoundaryCoverageDiff).not.toBeNull();
  expect(snapshot.maxBoundaryCoverageDiff).toBeLessThanOrEqual(1);
  expect(snapshot.firstRowGap).toBeGreaterThan(0);
  expect(snapshot.trackSpanDiff).not.toBeNull();
  expect(snapshot.trackSpanDiff).toBeLessThanOrEqual(8);
  expect(snapshot.hasTimeContext).toBeFalsy();
  expect(snapshot.readonlyTimeCount).toBe(0);
  expect(Number.parseFloat(snapshot.launcherStyle?.borderRadius || "0")).toBeGreaterThanOrEqual(16);
  expect(Number.parseFloat(snapshot.launcherStyle?.paddingLeft || "0")).toBeGreaterThanOrEqual(8);
  expect(Number.parseFloat(snapshot.launcherStyle?.paddingRight || "0")).toBeGreaterThanOrEqual(8);
});

test("changing date triggers single reservations fetch cycle per room", async ({ page }) => {
  await page.goto("https://example.com/guest/test-map", { waitUntil: "domcontentloaded" });

  const reservationRequestCountByKey = new Map();

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
          spaces: [
            {
              id: 3,
              name: "수성",
              color: "#60a5fa",
              reservationEnable: true,
              settings: [{ settingStartTime: "09:00:00", settingEndTime: "18:00:00" }],
            },
            {
              id: 4,
              name: "금성",
              color: "#f59e0b",
              reservationEnable: true,
              settings: [{ settingStartTime: "09:00:00", settingEndTime: "18:00:00" }],
            },
          ],
        }),
      });
      return;
    }

    if (url.pathname === "/api/guests/maps/234/spaces/availability") {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          spaces: [
            { spaceId: 3, isAvailable: true },
            { spaceId: 4, isAvailable: true },
          ],
        }),
      });
      return;
    }

    const reservationPathMatch = url.pathname.match(
      /^\/api\/guests\/maps\/234\/spaces\/(\d+)\/reservations$/
    );
    if (reservationPathMatch) {
      const roomId = reservationPathMatch[1];
      const date = url.searchParams.get("date") || "";
      const key = `${date}:${roomId}`;
      reservationRequestCountByKey.set(key, (reservationRequestCountByKey.get(key) || 0) + 1);

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
      <section style="display:flex; align-items:center; gap:10px; margin-bottom:8px;">
        <h2 id="room-title" style="margin:0;">수성</h2>
      </section>

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
          <option value="3" selected>11층 수성</option>
          <option value="4">11층 금성</option>
        </select>

        <div id="form-action-row" style="display:flex; gap:8px; margin-top:12px;">
          <button id="form-reserve-submit" type="button">예약하기</button>
        </div>
      </form>
    </main>
  `);

  await injectContentScriptBundle(page);
  await waitForContentScriptInjected(page);
  await page.waitForTimeout(700);

  await expect.poll(() => {
    const countRoom3 = reservationRequestCountByKey.get("2026-12-02:3") || 0;
    const countRoom4 = reservationRequestCountByKey.get("2026-12-02:4") || 0;
    return countRoom3 + countRoom4;
  }).toBe(2);

  reservationRequestCountByKey.clear();

  await page.evaluate(() => {
    const nextDayButton = document.querySelector("#zzk-map-calendar-overlay .zzk-map-calendar-date-nav.next");
    if (nextDayButton instanceof HTMLButtonElement) {
      nextDayButton.click();
    }
  });

  const navSnapshot = await page.evaluate(() => {
    const prevDayButton = document.querySelector("#zzk-map-calendar-overlay .zzk-map-calendar-date-nav.prev");
    const nextDayButton = document.querySelector("#zzk-map-calendar-overlay .zzk-map-calendar-date-nav.next");
    const todayButton = document.querySelector("#zzk-map-calendar-overlay .zzk-map-calendar-date-nav.today");
    const weekdayLabel = document.querySelector("#zzk-map-calendar-overlay .zzk-map-calendar-date-display");
    const dateInput = document.querySelector("#zzk-map-calendar-overlay .zzk-map-calendar-date-native");

    return {
      hasPrevDayButton: prevDayButton instanceof HTMLButtonElement,
      hasNextDayButton: nextDayButton instanceof HTMLButtonElement,
      hasTodayButton: todayButton instanceof HTMLButtonElement,
      prevTitle: prevDayButton instanceof HTMLButtonElement ? prevDayButton.title || "" : "",
      nextTitle: nextDayButton instanceof HTMLButtonElement ? nextDayButton.title || "" : "",
      todayTitle: todayButton instanceof HTMLButtonElement ? todayButton.title || "" : "",
      weekdayText: weekdayLabel instanceof HTMLElement ? weekdayLabel.textContent || "" : "",
      dateValue: dateInput instanceof HTMLInputElement ? dateInput.value : "",
    };
  });

  expect(navSnapshot.hasPrevDayButton).toBeTruthy();
  expect(navSnapshot.hasNextDayButton).toBeTruthy();
  expect(navSnapshot.hasTodayButton).toBeTruthy();
  expect(navSnapshot.prevTitle).toContain("2026-12-02");
  expect(navSnapshot.nextTitle).toContain("2026-12-04");
  expect(navSnapshot.todayTitle).toMatch(/^오늘 \(\d{4}-\d{2}-\d{2}\)$/);
  expect(navSnapshot.weekdayText).toMatch(/^2026\.12\.03 \([월화수목금토일]\)$/);
  expect(navSnapshot.dateValue).toBe("2026-12-03");

  await page.click("#zzk-map-calendar-overlay .zzk-map-calendar-date-nav.today");

  const todaySnapshot = await page.evaluate(() => {
    const dateInput = document.querySelector("#zzk-map-calendar-overlay .zzk-map-calendar-date-native");
    const todayButton = document.querySelector("#zzk-map-calendar-overlay .zzk-map-calendar-date-nav.today");
    const weekdayLabel = document.querySelector("#zzk-map-calendar-overlay .zzk-map-calendar-date-display");

    return {
      dateValue: dateInput instanceof HTMLInputElement ? dateInput.value : "",
      minValue: dateInput instanceof HTMLInputElement ? dateInput.min : "",
      todayDisabled: todayButton instanceof HTMLButtonElement ? todayButton.disabled : null,
      weekdayText: weekdayLabel instanceof HTMLElement ? weekdayLabel.textContent || "" : "",
    };
  });

  expect(todaySnapshot.dateValue).toBe(todaySnapshot.minValue);
  expect(todaySnapshot.todayDisabled).toBeTruthy();
  expect(todaySnapshot.weekdayText).toMatch(/^\d{4}\.\d{2}\.\d{2} \([월화수목금토일]\)$/);

  await expect.poll(() => {
    const countRoom3 = reservationRequestCountByKey.get("2026-12-03:3") || 0;
    const countRoom4 = reservationRequestCountByKey.get("2026-12-03:4") || 0;
    return countRoom3 + countRoom4;
  }).toBe(2);

  await page.waitForTimeout(500);

  expect(reservationRequestCountByKey.get("2026-12-03:3") || 0).toBe(1);
  expect(reservationRequestCountByKey.get("2026-12-03:4") || 0).toBe(1);
});

test("unrelated DOM churn batches MutationObserver guest UI sync without extra API refresh", async ({ page }) => {
  await page.goto("https://example.com/guest/test-map", { waitUntil: "domcontentloaded" });

  const requestCountByPath = new Map();

  await page.route("https://k8s.zzimkkong.com/api/guests/**", async (route) => {
    const url = new URL(route.request().url());
    const key = `${url.pathname}?${url.searchParams.toString()}`;
    requestCountByPath.set(key, (requestCountByPath.get(key) || 0) + 1);

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
          spaces: [
            {
              id: 3,
              name: "수성",
              color: "#60a5fa",
              reservationEnable: true,
              settings: [{ settingStartTime: "09:00:00", settingEndTime: "18:00:00" }],
            },
          ],
        }),
      });
      return;
    }

    if (url.pathname === "/api/guests/maps/234/spaces/availability") {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({ spaces: [{ spaceId: 3, isAvailable: true }] }),
      });
      return;
    }

    if (url.pathname === "/api/guests/maps/234/spaces/3/reservations") {
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
      <section style="display:flex; align-items:center; gap:10px; margin-bottom:8px;">
        <h2 id="room-title" style="margin:0;">수성</h2>
      </section>

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
          <option value="3" selected>11층 수성</option>
        </select>

        <div id="form-action-row" style="display:flex; gap:8px; margin-top:12px;">
          <button id="form-reserve-submit" type="button">예약하기</button>
        </div>

        <div id="host-churn-root"></div>
      </form>
    </main>
  `);

  await page.evaluate(() => {
    window.__ZZK_DEBUG_MODE__ = true;
  });
  await injectContentScriptBundle(page);
  await waitForContentScriptInjected(page);
  await page.waitForTimeout(700);

  const initialRequestTotal = Array.from(requestCountByPath.values()).reduce((sum, count) => sum + count, 0);

  await page.evaluate(() => {
    window.__zzkTestApi?.clearDebugEvents?.();
    const churnRoot = document.getElementById("host-churn-root");
    for (let index = 0; index < 12; index += 1) {
      window.setTimeout(() => {
        const node = document.createElement("span");
        node.textContent = `host update ${index}`;
        churnRoot?.appendChild(node);
      }, index * 10);
    }
  });

  await page.waitForTimeout(700);

  const snapshot = await page.evaluate(() => {
    const syncEvents = (window.__zzkTestApi?.getDebugEvents?.() || []).filter((entry) => {
      return entry.scope === "guest-ui" && entry.event === "mutation-sync";
    });

    return {
      syncEventCount: syncEvents.length,
      reasons: syncEvents.map((entry) => entry.detail?.reason || ""),
    };
  });
  const finalRequestTotal = Array.from(requestCountByPath.values()).reduce((sum, count) => sum + count, 0);

  expect(snapshot.syncEventCount).toBe(1);
  expect(snapshot.reasons).toEqual(["mutation-observer"]);
  expect(finalRequestTotal).toBe(initialRequestTotal);
});

test("timeblock tabs switch between meeting rooms and pair rooms and persist selection", async ({ page }) => {
  await page.goto("https://example.com/guest/test-map", { waitUntil: "domcontentloaded" });

  const reservationRequestRoomIds = [];

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
          spaces: [
            {
              id: 3,
              name: "수성",
              color: "#60a5fa",
              reservationEnable: true,
              settings: [{ settingStartTime: "09:00:00", settingEndTime: "18:00:00" }],
            },
            {
              id: 4,
              name: "금성",
              color: "#f97316",
              reservationEnable: true,
              settings: [{ settingStartTime: "09:00:00", settingEndTime: "18:00:00" }],
            },
            {
              id: 21,
              name: "페1",
              color: "#10b981",
              reservationEnable: true,
              settings: [{ settingStartTime: "09:00:00", settingEndTime: "18:00:00" }],
            },
            {
              id: 27,
              name: "페7",
              color: "#14b8a6",
              reservationEnable: true,
              settings: [{ settingStartTime: "09:00:00", settingEndTime: "18:00:00" }],
            },
          ],
        }),
      });
      return;
    }

    if (url.pathname === "/api/guests/maps/234/spaces/availability") {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          spaces: [
            { spaceId: 3, isAvailable: true },
            { spaceId: 4, isAvailable: false },
            { spaceId: 21, isAvailable: true },
            { spaceId: 27, isAvailable: false },
          ],
        }),
      });
      return;
    }

    if (url.pathname.match(/^\/api\/guests\/maps\/234\/spaces\/\d+\/reservations$/)) {
      const roomIdMatch = url.pathname.match(/^\/api\/guests\/maps\/234\/spaces\/(\d+)\/reservations$/);
      if (roomIdMatch) {
        reservationRequestRoomIds.push(Number(roomIdMatch[1]));
      }
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

  const setGuestPageContent = async () => {
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
            <option value="3" selected>11층 수성</option>
            <option value="4">11층 금성</option>
            <option value="21">13층 페1</option>
            <option value="27">12층 페7</option>
          </select>

          <div id="form-action-row" style="display:flex; gap:8px; margin-top:12px;">
            <button id="form-reserve-submit" type="button">예약하기</button>
          </div>
        </form>
      </main>
    `);
  };

  const mountContentScript = async () => {
    await injectContentScriptBundle(page);
    await waitForContentScriptInjected(page);
  await page.waitForTimeout(700);

    await page.evaluate(() => {
      const hasOverlayRows =
        document.querySelectorAll("#zzk-map-calendar-overlay .zzk-map-calendar-row").length > 0;
      if (hasOverlayRows) {
        return;
      }

      const launcher = document.getElementById("zzk-map-calendar-radar-launcher");
      if (launcher instanceof HTMLButtonElement) {
        launcher.click();
      }
    });

    await page.waitForSelector("#zzk-map-calendar-overlay .zzk-map-calendar-row", { timeout: 6000 });
  };

  const readTabSnapshot = async () => {
    return await page.evaluate(() => {
      const overlayRoomNames = Array.from(
        document.querySelectorAll("#zzk-map-calendar-overlay .zzk-map-calendar-room-name")
      )
        .map((node) => (node instanceof HTMLElement ? (node.textContent || "").trim() : ""))
        .filter((name) => Boolean(name) && name !== "회의실" && name !== "페어룸")
        .sort();
      const overlayFloorNames = Array.from(
        document.querySelectorAll("#zzk-map-calendar-overlay .zzk-map-calendar-floor-name")
      )
        .map((node) => (node instanceof HTMLElement ? (node.textContent || "").trim() : ""))
        .filter((name) => Boolean(name) && name !== "층")
        .sort();
      const overlayMeetingButton = document.querySelector(
        "#zzk-map-calendar-overlay .zzk-map-calendar-space-tab:first-child"
      );
      const overlayPairButton = document.querySelector(
        "#zzk-map-calendar-overlay .zzk-map-calendar-space-tab:last-child"
      );
      const overlayInternalTabCount = document.querySelectorAll(
        "#zzk-map-calendar-overlay .zzk-map-calendar-space-tab"
      ).length;
      const overlayBoundaryLayer = document.querySelector(
        "#zzk-map-calendar-overlay .zzk-map-calendar-hour-boundary-layer"
      );
      const overlayBoundaryTrack = document.querySelector(
        "#zzk-map-calendar-overlay .zzk-map-calendar-hour-boundary-track"
      );
      const firstOverlayRowSlots = document.querySelector(
        "#zzk-map-calendar-overlay .zzk-map-calendar-row .zzk-map-calendar-slots"
      );

      return {
        overlayRoomNames,
        overlayFloorNames,
        overlayMeetingVisible: overlayMeetingButton instanceof HTMLButtonElement,
        overlayPairVisible: overlayPairButton instanceof HTMLButtonElement,
        overlayMeetingSelected:
          overlayMeetingButton instanceof HTMLButtonElement &&
          overlayMeetingButton.getAttribute("aria-selected") === "true",
        overlayPairSelected:
          overlayPairButton instanceof HTMLButtonElement &&
          overlayPairButton.getAttribute("aria-selected") === "true",
        overlayInternalTabCount,
        overlayBoundaryLayerVisible: overlayBoundaryLayer instanceof HTMLElement,
        overlayBoundaryTrackVisible: overlayBoundaryTrack instanceof HTMLElement,
        overlayRowBoundaryCellCount:
          firstOverlayRowSlots instanceof HTMLElement
            ? firstOverlayRowSlots.querySelectorAll(".zzk-map-calendar-hour-boundary-cell").length
            : 0,
        storedTab: window.localStorage.getItem("zzk-map-calendar-space-tab-v1") || "",
      };
    });
  };

  const clickPanelTab = async (tab) => {
    await clickModalTab(tab);
  };

  const clickModalTab = async (tab) => {
    await page.evaluate((targetTab) => {
      const selector =
        targetTab === "pair"
          ? "#zzk-map-calendar-overlay #zzk-map-calendar-overlay-tab-pair"
          : "#zzk-map-calendar-overlay #zzk-map-calendar-overlay-tab-meeting";
      const button = document.querySelector(selector);
      if (button instanceof HTMLButtonElement) {
        button.click();
      }
    }, tab);
  };

  await page.evaluate(() => {
    window.localStorage.removeItem("zzk-map-calendar-space-tab-v1");
  });

  await setGuestPageContent();
  await mountContentScript();

  await expect.poll(() => reservationRequestRoomIds.slice().sort((a, b) => a - b)).toEqual([3, 4]);

  await expect.poll(readTabSnapshot).toMatchObject({
    overlayRoomNames: ["금성", "수성"],
    overlayFloorNames: ["11층"],
    overlayMeetingVisible: true,
    overlayPairVisible: true,
    overlayMeetingSelected: true,
    overlayPairSelected: false,
    overlayInternalTabCount: 2,
    overlayBoundaryLayerVisible: true,
    overlayBoundaryTrackVisible: true,
    overlayRowBoundaryCellCount: 0,
    storedTab: "",
  });

  await clickPanelTab("pair");

  await expect.poll(() => reservationRequestRoomIds.slice().sort((a, b) => a - b)).toEqual([3, 4, 21, 27]);

  await expect.poll(readTabSnapshot).toMatchObject({
    overlayRoomNames: ["페1", "페7"],
    overlayFloorNames: ["12층", "13층"],
    overlayMeetingVisible: true,
    overlayPairVisible: true,
    overlayMeetingSelected: false,
    overlayPairSelected: true,
    overlayInternalTabCount: 2,
    overlayBoundaryLayerVisible: true,
    overlayBoundaryTrackVisible: true,
    overlayRowBoundaryCellCount: 0,
    storedTab: "pair",
  });

  await clickModalTab("meeting");

  await expect.poll(() => reservationRequestRoomIds.slice().sort((a, b) => a - b)).toEqual([3, 4, 21, 27]);

  await expect.poll(readTabSnapshot).toMatchObject({
    overlayRoomNames: ["금성", "수성"],
    overlayFloorNames: ["11층"],
    overlayMeetingVisible: true,
    overlayPairVisible: true,
    overlayMeetingSelected: true,
    overlayPairSelected: false,
    overlayInternalTabCount: 2,
    overlayBoundaryLayerVisible: true,
    overlayBoundaryTrackVisible: true,
    overlayRowBoundaryCellCount: 0,
    storedTab: "meeting",
  });

  await clickModalTab("pair");

  await page.goto("https://example.com/guest/test-map", { waitUntil: "domcontentloaded" });
  await setGuestPageContent();
  await mountContentScript();

  await expect.poll(readTabSnapshot).toMatchObject({
    overlayRoomNames: ["페1", "페7"],
    overlayFloorNames: ["12층", "13층"],
    overlayMeetingVisible: true,
    overlayPairVisible: true,
    overlayMeetingSelected: false,
    overlayPairSelected: true,
    overlayInternalTabCount: 2,
    overlayBoundaryLayerVisible: true,
    overlayBoundaryTrackVisible: true,
    overlayRowBoundaryCellCount: 0,
    storedTab: "pair",
  });
});

test("clicking the visible timeblock date control opens the custom date popover", async ({ page }) => {
  await page.setViewportSize({ width: 1365, height: 1100 });
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
          spaces: [
            {
              id: 3,
              name: "수성",
              color: "#60a5fa",
              reservationEnable: true,
              settings: [{ settingStartTime: "09:00:00", settingEndTime: "18:00:00" }],
            },
            {
              id: 4,
              name: "금성",
              color: "#f97316",
              reservationEnable: true,
              settings: [{ settingStartTime: "09:00:00", settingEndTime: "18:00:00" }],
            },
          ],
        }),
      });
      return;
    }

    if (url.pathname === "/api/guests/maps/234/spaces/availability") {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          spaces: [
            { spaceId: 3, isAvailable: true },
            { spaceId: 4, isAvailable: false },
          ],
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
          <option value="3" selected>11층 수성</option>
          <option value="4">11층 금성</option>
        </select>

        <div id="form-action-row" style="display:flex; gap:8px; margin-top:12px;">
          <button id="form-reserve-submit" type="button">예약하기</button>
        </div>
      </form>
    </main>
  `);

  await injectContentScriptBundle(page);
  await page.waitForSelector("#zzk-map-calendar-overlay .zzk-map-calendar-date-display-wrap", {
    timeout: 6000,
  });

  await page.evaluate(() => {
    const input = document.querySelector("#zzk-map-calendar-overlay input[type='date']");
    if (!(input instanceof HTMLInputElement)) {
      return;
    }

    window.__zzkShowPickerCalls = 0;
    const originalShowPicker = input.showPicker?.bind(input);
    input.showPicker = () => {
      window.__zzkShowPickerCalls += 1;
      if (typeof originalShowPicker === "function") {
        try {
          originalShowPicker();
        } catch (_error) {
        }
      }
    };
  });

  await page.click("#zzk-map-calendar-overlay .zzk-map-calendar-date-display-wrap");

  await expect
    .poll(async () => {
      return await page.evaluate(() => {
        const popover = document.querySelector(".zzk-map-calendar-date-popover-floating");
        const dateWrap = document.querySelector("#zzk-map-calendar-overlay .zzk-map-calendar-date-display-wrap");
        const activeElement = document.activeElement;
        const popoverRect = popover instanceof HTMLElement ? popover.getBoundingClientRect() : null;
        const dateWrapRect = dateWrap instanceof HTMLElement ? dateWrap.getBoundingClientRect() : null;
        return {
          showPickerCalls: window.__zzkShowPickerCalls || 0,
          popoverVisible: popover instanceof HTMLElement && !popover.hidden,
          popoverPosition: popover instanceof HTMLElement ? getComputedStyle(popover).position : "",
          alignedLeft:
            popoverRect != null && dateWrapRect != null
              ? Math.round(popoverRect.left) === Math.round(dateWrapRect.left)
              : false,
          belowDateWrap:
            popoverRect != null && dateWrapRect != null ? popoverRect.top >= dateWrapRect.bottom : false,
          activeTag: activeElement ? activeElement.tagName : "",
          activeType: activeElement instanceof HTMLInputElement ? activeElement.type : "",
        };
      });
    })
    .toMatchObject({
      showPickerCalls: 0,
      popoverVisible: true,
      popoverPosition: "fixed",
      alignedLeft: true,
      belowDateWrap: true,
    });
});

test("schedule cache becomes stale after 3 seconds and refetches", async ({ page }) => {
  await page.goto("https://example.com/guest/test-map", { waitUntil: "domcontentloaded" });

  const reservationRequestCountByDate = new Map();

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
          spaces: [
            {
              id: 3,
              name: "수성",
              color: "#60a5fa",
              reservationEnable: true,
              settings: [{ settingStartTime: "09:00:00", settingEndTime: "18:00:00" }],
            },
          ],
        }),
      });
      return;
    }

    if (url.pathname === "/api/guests/maps/234/spaces/availability") {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          spaces: [{ spaceId: 3, isAvailable: true }],
        }),
      });
      return;
    }

    if (url.pathname === "/api/guests/maps/234/spaces/3/reservations") {
      const date = url.searchParams.get("date") || "";
      reservationRequestCountByDate.set(date, (reservationRequestCountByDate.get(date) || 0) + 1);
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
      <section style="display:flex; align-items:center; gap:10px; margin-bottom:8px;">
        <h2 id="room-title" style="margin:0;">수성</h2>
      </section>

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
          <option value="3" selected>11층 수성</option>
        </select>

        <div id="form-action-row" style="display:flex; gap:8px; margin-top:12px;">
          <button id="form-reserve-submit" type="button">예약하기</button>
        </div>
      </form>
    </main>
  `);

  await injectContentScriptBundle(page);
  await waitForContentScriptInjected(page);
  await page.waitForTimeout(700);

  await expect.poll(() => reservationRequestCountByDate.get("2026-12-02") || 0).toBe(1);

  await page.evaluate(() => {
    const nextDayButton = document.querySelector("#zzk-map-calendar-overlay .zzk-map-calendar-date-nav.next");
    if (nextDayButton instanceof HTMLButtonElement) {
      nextDayButton.click();
    }
  });

  await expect.poll(() => reservationRequestCountByDate.get("2026-12-03") || 0).toBe(1);

  await page.click("#zzk-map-calendar-overlay .zzk-map-calendar-date-nav.prev");

  await page.waitForTimeout(450);
  expect(reservationRequestCountByDate.get("2026-12-02") || 0).toBe(1);

  await page.waitForTimeout(3200);

  await page.evaluate(() => {
    const nextDayButton = document.querySelector("#zzk-map-calendar-overlay .zzk-map-calendar-date-nav.next");
    if (nextDayButton instanceof HTMLButtonElement) {
      nextDayButton.click();
    }
  });
  await page.click("#zzk-map-calendar-overlay .zzk-map-calendar-date-nav.prev");

  await expect.poll(() => reservationRequestCountByDate.get("2026-12-02") || 0).toBe(2);
});

test("delayed runtime schedule response does not trigger direct fallback duplicate reservations fetch", async ({ page }) => {
  await page.goto("https://example.com/guest/test-map", { waitUntil: "domcontentloaded" });

  const reservationRequestCountByRoom = new Map();

  await page.route("https://k8s.zzimkkong.com/api/guests/**", async (route) => {
    const url = new URL(route.request().url());

    if (url.pathname === "/api/guests/maps/234/spaces") {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          spaces: [
            {
              id: 3,
              name: "수성",
              color: "#60a5fa",
              reservationEnable: true,
              settings: [{ settingStartTime: "09:00:00", settingEndTime: "18:00:00" }],
            },
          ],
        }),
      });
      return;
    }

    if (url.pathname === "/api/guests/maps/234/spaces/3/reservations") {
      const roomId = "3";
      reservationRequestCountByRoom.set(roomId, (reservationRequestCountByRoom.get(roomId) || 0) + 1);
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({ reservations: [] }),
      });
      return;
    }

    if (url.pathname === "/api/guests/maps" && url.searchParams.get("sharingMapId") === "test-map") {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({ mapId: 234, mapName: "테스트 맵" }),
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
      <section style="display:flex; align-items:center; gap:10px; margin-bottom:8px;">
        <h2 id="room-title" style="margin:0;">수성</h2>
      </section>

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
          <option value="3" selected>11층 수성</option>
        </select>

        <div id="form-action-row" style="display:flex; gap:8px; margin-top:12px;">
          <button id="form-reserve-submit" type="button">예약하기</button>
        </div>
      </form>
    </main>
  `);

  await page.evaluate(() => {
    const runtimeStub = {
      lastError: null,
      sendMessage(message, callback) {
        if (message?.type === "ZZK_FETCH_AVAILABILITY") {
          callback({
            ok: true,
            data: {
              mapId: 234,
              mapName: "테스트 맵",
              selectedWindow: message.payload,
              roomType: message.payload.roomType,
              counts: { total: 1, available: 1, occupied: 0 },
              rooms: [{ id: 3, name: "수성", color: "#60a5fa", isAvailable: true }],
            },
          });
          return;
        }

        if (message?.type === "ZZK_FETCH_DAILY_SCHEDULE") {
          window.setTimeout(async () => {
            await window.fetch(
              "https://k8s.zzimkkong.com/api/guests/maps/234/spaces/3/reservations?date=2026-12-02",
            );
            callback({
              ok: true,
              data: {
                mapId: 234,
                mapName: "테스트 맵",
                date: "2026-12-02",
                roomType: message.payload.roomType,
                range: { startMinute: 540, endMinute: 1080 },
                timeline: [{ startMinute: 540, endMinute: 550, label: "09:00" }],
                rooms: [
                  {
                    id: 3,
                    name: "수성",
                    color: "#60a5fa",
                    windowStartMinute: 540,
                    windowEndMinute: 1080,
                    reservations: [],
                  },
                ],
              },
            });
          }, 3200);
        }
      },
    };

    if (window.chrome && typeof window.chrome === "object") {
      Object.defineProperty(window.chrome, "runtime", {
        configurable: true,
        value: runtimeStub,
      });
      return;
    }

    Object.defineProperty(window, "chrome", {
      configurable: true,
      value: {
        runtime: {
          ...runtimeStub,
        },
      },
    });
  });

  await injectContentScriptBundle(page);
  await waitForContentScriptInjected(page);
  await page.waitForTimeout(3800);

  expect(reservationRequestCountByRoom.get("3") || 0).toBe(1);
});

test("date change shows loading indicator on timeblocks until schedule fetch completes", async ({ page }) => {
  await page.goto("https://example.com/guest/test-map", { waitUntil: "domcontentloaded" });

  let releaseDelayedSchedule = null;
  const delayedSchedulePromise = new Promise((resolve) => {
    releaseDelayedSchedule = resolve;
  });
  const reservationRequestCountByDate = new Map();

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
          spaces: [
            {
              id: 3,
              name: "수성",
              color: "#60a5fa",
              reservationEnable: true,
              settings: [{ settingStartTime: "09:00:00", settingEndTime: "18:00:00" }],
            },
          ],
        }),
      });
      return;
    }

    if (url.pathname === "/api/guests/maps/234/spaces/availability") {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          spaces: [{ spaceId: 3, isAvailable: true }],
        }),
      });
      return;
    }

    if (url.pathname === "/api/guests/maps/234/spaces/3/reservations") {
      const date = url.searchParams.get("date") || "";
      reservationRequestCountByDate.set(date, (reservationRequestCountByDate.get(date) || 0) + 1);

      if (date === "2026-12-03") {
        await delayedSchedulePromise;
      }

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
      <section style="display:flex; align-items:center; gap:10px; margin-bottom:8px;">
        <h2 id="room-title" style="margin:0;">수성</h2>
      </section>

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
          <option value="3" selected>11층 수성</option>
        </select>

        <div id="form-action-row" style="display:flex; gap:8px; margin-top:12px;">
          <button id="form-reserve-submit" type="button">예약하기</button>
        </div>
      </form>
    </main>
  `);

  await injectContentScriptBundle(page);
  await waitForContentScriptInjected(page);
  await page.waitForTimeout(700);

  await page.evaluate(() => {
    const overlayRows = document.querySelectorAll("#zzk-map-calendar-overlay .zzk-map-calendar-row");
    if (overlayRows.length > 0) {
      return;
    }

    const launcher = document.getElementById("zzk-map-calendar-radar-launcher");
    if (launcher instanceof HTMLButtonElement) {
      launcher.click();
    }
  });

  await page.waitForSelector("#zzk-map-calendar-overlay .zzk-map-calendar-row", { timeout: 6000 });

  await page.evaluate(() => {
    const nextDayButton = document.querySelector("#zzk-map-calendar-overlay .zzk-map-calendar-date-nav.next");
    if (nextDayButton instanceof HTMLButtonElement) {
      nextDayButton.click();
    }
  });

  await expect
    .poll(async () => {
      return await page.evaluate(() => {
        const body = document.querySelector("#zzk-map-calendar-overlay .zzk-map-calendar-body");
        const loadingOverlay =
          body instanceof HTMLElement ? body.querySelector(".zzk-map-calendar-loading-overlay") : null;
        const loadingText =
          loadingOverlay instanceof HTMLElement
            ? (loadingOverlay.textContent || "").replace(/\s+/g, " ").trim()
            : "";

        return {
          ariaBusy: body instanceof HTMLElement ? body.getAttribute("aria-busy") || "" : "",
          hasLoadingClass:
            body instanceof HTMLElement && body.classList.contains("zzk-map-calendar-body-loading"),
          loadingVisible:
            loadingOverlay instanceof HTMLElement && loadingOverlay.getAttribute("aria-hidden") !== "true",
          loadingText,
        };
      });
    })
    .toMatchObject({
      ariaBusy: "true",
      hasLoadingClass: true,
      loadingVisible: true,
    });

  await expect
    .poll(async () => {
      return await page.evaluate(() => {
        const body = document.querySelector("#zzk-map-calendar-overlay .zzk-map-calendar-body");
        const loadingOverlay =
          body instanceof HTMLElement ? body.querySelector(".zzk-map-calendar-loading-overlay") : null;
        const loadingText =
          loadingOverlay instanceof HTMLElement
            ? (loadingOverlay.textContent || "").replace(/\s+/g, " ").trim()
            : "";
        return loadingText;
      });
    })
    .toContain("예약 현황 로딩 중");

  if (typeof releaseDelayedSchedule === "function") {
    releaseDelayedSchedule();
  }

  await expect
    .poll(async () => {
      return await page.evaluate(() => {
        const body = document.querySelector("#zzk-map-calendar-overlay .zzk-map-calendar-body");
        const loadingOverlay =
          body instanceof HTMLElement ? body.querySelector(".zzk-map-calendar-loading-overlay") : null;
        const dateDisplay = document.querySelector(
          "#zzk-map-calendar-overlay .zzk-map-calendar-date-display"
        );

        return {
          ariaBusy: body instanceof HTMLElement ? body.getAttribute("aria-busy") || "" : "",
          hasLoadingClass:
            body instanceof HTMLElement && body.classList.contains("zzk-map-calendar-body-loading"),
          loadingVisible:
            loadingOverlay instanceof HTMLElement && loadingOverlay.getAttribute("aria-hidden") !== "true",
          dateLabel: dateDisplay instanceof HTMLElement ? dateDisplay.textContent || "" : "",
        };
      });
    })
    .toMatchObject({
      ariaBusy: "false",
      hasLoadingClass: false,
      loadingVisible: false,
      dateLabel: "2026.12.03 (목)",
    });

  expect(reservationRequestCountByDate.get("2026-12-03") || 0).toBe(1);
});

test("weekday token uses blue on saturday and red on sunday", async ({ page }) => {
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
          spaces: [
            {
              id: 3,
              name: "수성",
              color: "#60a5fa",
              reservationEnable: true,
              settings: [{ settingStartTime: "09:00:00", settingEndTime: "18:00:00" }],
            },
          ],
        }),
      });
      return;
    }

    if (url.pathname === "/api/guests/maps/234/spaces/availability") {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          spaces: [{ spaceId: 3, isAvailable: true }],
        }),
      });
      return;
    }

    if (url.pathname === "/api/guests/maps/234/spaces/3/reservations") {
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
        <input id="reservation-date" name="date" type="date" value="2026-12-04" />

        <label for="start-time">시작시간</label>
        <input id="start-time" name="startTime" type="time" value="10:00" />

        <label for="end-time">종료시간</label>
        <input id="end-time" name="endTime" type="time" value="10:30" />

        <label for="room-select">공간 선택</label>
        <select id="room-select" name="spaceId">
          <option value="3" selected>11층 수성</option>
        </select>

        <div id="form-action-row" style="display:flex; gap:8px; margin-top:12px;">
          <button id="form-reserve-submit" type="button">예약하기</button>
        </div>
      </form>
    </main>
  `);

  await injectContentScriptBundle(page);
  await waitForContentScriptInjected(page);
  await page.waitForTimeout(700);
  await page.waitForTimeout(1200);

  await page.evaluate(() => {
    const overlay = document.getElementById("zzk-map-calendar-overlay");
    if (overlay instanceof HTMLElement) {
      return;
    }

    const launcher = document.getElementById("zzk-map-calendar-radar-launcher");
    if (launcher instanceof HTMLButtonElement) {
      launcher.click();
    }
  });

  await page.waitForSelector("#zzk-map-calendar-overlay", {
    state: "attached",
    timeout: 6000,
  });
  await page.waitForSelector("#zzk-map-calendar-overlay .zzk-map-calendar-date-display .zzk-date-display-weekday", {
    state: "attached",
    timeout: 6000,
  });

  const setOverlayDate = async (value) => {
    await page.evaluate((nextDate) => {
      const dateInput = document.querySelector("#zzk-map-calendar-overlay .zzk-map-calendar-date-native");
      if (dateInput instanceof HTMLInputElement) {
        dateInput.value = nextDate;
        dateInput.dispatchEvent(new Event("change", { bubbles: true }));
      }
    }, value);
  };

  const readDateColorSnapshot = async () => {
    return await page.evaluate(() => {
      const overlayDisplay = document.querySelector("#zzk-map-calendar-overlay .zzk-map-calendar-date-display");
      const overlayWeekdayToken =
        overlayDisplay instanceof HTMLElement
          ? overlayDisplay.querySelector(".zzk-date-display-weekday")
          : null;

      return {
        overlayText: overlayDisplay instanceof HTMLElement ? overlayDisplay.textContent || "" : "",
        overlayToken:
          overlayWeekdayToken instanceof HTMLElement ? overlayWeekdayToken.textContent || "" : "",
        overlayColor:
          overlayWeekdayToken instanceof HTMLElement
            ? getComputedStyle(overlayWeekdayToken).color
            : "",
      };
    });
  };

  await setOverlayDate("2026-12-05");
  await expect
    .poll(async () => {
      const snapshot = await readDateColorSnapshot();
      return snapshot.overlayText;
    })
    .toBe("2026.12.05 (토)");

  const saturdaySnapshot = await readDateColorSnapshot();
  expect(saturdaySnapshot.overlayToken).toBe("토");
  expect(saturdaySnapshot.overlayColor).toBe("rgb(37, 99, 235)");

  await setOverlayDate("2026-12-06");
  await expect
    .poll(async () => {
      const snapshot = await readDateColorSnapshot();
      return snapshot.overlayText;
    })
    .toBe("2026.12.06 (일)");

  const sundaySnapshot = await readDateColorSnapshot();
  expect(sundaySnapshot.overlayToken).toBe("일");
  expect(sundaySnapshot.overlayColor).toBe("rgb(220, 38, 38)");
});

test("edit page allows extending time from current reservation window in locked room", async ({ page }) => {
  await page.goto("https://example.com/guest/test-map/reservation/edit", {
    waitUntil: "domcontentloaded",
  });

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
          spaces: [
            {
              id: 3,
              name: "수성",
              color: "#60a5fa",
              reservationEnable: true,
              settings: [{ settingStartTime: "09:00:00", settingEndTime: "18:00:00" }],
            },
          ],
        }),
      });
      return;
    }

    if (url.pathname === "/api/guests/maps/234/spaces/availability") {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          spaces: [{ spaceId: 3, isAvailable: true }],
        }),
      });
      return;
    }

    if (url.pathname === "/api/guests/maps/234/spaces/3/reservations") {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          reservations: [
            {
              id: 901,
              name: "애니",
              description: "기존 예약",
              startDateTime: "2026-12-02T10:00:00+09:00",
              endDateTime: "2026-12-02T10:30:00+09:00",
            },
          ],
        }),
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
      <section style="display:flex; align-items:center; gap:10px; margin-bottom:8px;">
        <h2 id="room-title" style="margin:0;">수성</h2>
      </section>

      <div id="top-tabs" style="display:flex; gap:8px; margin-bottom:16px;">
        <button type="button">예약현황</button>
        <button type="button">예약하기</button>
      </div>

      <form id="reservation-form" style="display:block; width:560px;">
        <label for="reservation-date">날짜</label>
        <input id="reservation-date" name="date" type="date" value="2026-12-02" />

        <label for="start-time-helper">시작시간 안내</label>
        <input id="start-time-helper" name="startTimeHelper" type="time" value="10:00" />

        <label for="start-time">시작시간</label>
        <input id="start-time" name="startTime" type="time" value="10:00" />

        <label for="end-time">종료시간</label>
        <input id="end-time" name="endTime" type="time" value="10:30" />

        <label for="room-select">공간 선택</label>
        <select id="room-select" name="spaceId" disabled>
          <option value="3" selected>11층 수성</option>
        </select>

        <div id="form-action-row" style="display:flex; gap:8px; margin-top:12px;">
          <button id="form-reserve-submit" type="button">수정하기</button>
        </div>
      </form>
    </main>
  `);

  await injectContentScriptBundle(page);
  await waitForContentScriptInjected(page);
  await page.waitForTimeout(700);
  await page.waitForTimeout(1200);

  await page.evaluate(() => {
    const overlayRows = document.querySelectorAll("#zzk-map-calendar-overlay .zzk-map-calendar-row");
    if (overlayRows.length > 0) {
      return;
    }

    const launcher = document.getElementById("zzk-map-calendar-radar-launcher");
    if (launcher instanceof HTMLButtonElement) {
      launcher.click();
    }
  });

  await page.waitForSelector("#zzk-map-calendar-overlay .zzk-map-calendar-row", { timeout: 6000 });

  await page.evaluate(() => {
    const targetSlot = Array.from(
      document.querySelectorAll("#zzk-map-calendar-overlay .zzk-map-calendar-row .zzk-map-calendar-slot")
    ).find((slot) => {
      if (!(slot instanceof HTMLElement)) {
        return false;
      }

      const title = slot.getAttribute("title") || "";
      return (
        title.includes("10:10~10:20") &&
        !slot.classList.contains("busy") &&
        !slot.classList.contains("past-blocked") &&
        !slot.classList.contains("room-locked-disabled")
      );
    });

    if (targetSlot instanceof HTMLElement) {
      targetSlot.click();
    }
  });

  await page.waitForTimeout(800);

  const snapshot = await page.evaluate(() => {
    const startInput = document.getElementById("start-time");
    const helperInput = document.getElementById("start-time-helper");
    const endInput = document.getElementById("end-time");

    return {
      startValue: startInput instanceof HTMLInputElement ? startInput.value : "",
      helperValue: helperInput instanceof HTMLInputElement ? helperInput.value : "",
      endValue: endInput instanceof HTMLInputElement ? endInput.value : "",
    };
  });

  expect(snapshot.startValue).toBe("10:10");
  expect(snapshot.helperValue).toBe("10:00");
  expect(snapshot.endValue).not.toBe("10:30");
});

test("edit page preserves a past reservation date instead of clamping it to today", async ({ page }) => {
  await page.goto("https://example.com/guest/test-map/reservation/edit", {
    waitUntil: "domcontentloaded",
  });

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
          spaces: [
            {
              id: 3,
              name: "수성",
              color: "#60a5fa",
              reservationEnable: true,
              settings: [{ settingStartTime: "09:00:00", settingEndTime: "18:00:00" }],
            },
          ],
        }),
      });
      return;
    }

    if (url.pathname === "/api/guests/maps/234/spaces/availability") {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({ spaces: [{ spaceId: 3, isAvailable: true }] }),
      });
      return;
    }

    if (url.pathname === "/api/guests/maps/234/spaces/3/reservations") {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          reservations: [
            {
              id: 901,
              name: "애니",
              description: "과거 예약",
              startDateTime: "2020-01-02T10:00:00+09:00",
              endDateTime: "2020-01-02T10:30:00+09:00",
            },
          ],
        }),
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
      <section style="display:flex; align-items:center; gap:10px; margin-bottom:8px;">
        <h2 id="room-title" style="margin:0;">수성</h2>
      </section>

      <div id="top-tabs" style="display:flex; gap:8px; margin-bottom:16px;">
        <button type="button">예약현황</button>
        <button type="button">예약하기</button>
      </div>

      <form id="reservation-form" style="display:block; width:560px;">
        <label for="reservation-date">날짜</label>
        <input id="reservation-date" name="date" type="date" value="2020-01-02" />

        <label for="start-time">시작시간</label>
        <input id="start-time" name="startTime" type="time" value="10:00" />

        <label for="end-time">종료시간</label>
        <input id="end-time" name="endTime" type="time" value="10:30" />

        <label for="room-select">공간 선택</label>
        <select id="room-select" name="spaceId" disabled>
          <option value="3" selected>11층 수성</option>
        </select>

        <div id="form-action-row" style="display:flex; gap:8px; margin-top:12px;">
          <button id="form-reserve-submit" type="button">수정하기</button>
        </div>
      </form>
    </main>
  `);

  await injectContentScriptBundle(page);
  await page.waitForTimeout(700);

  const snapshot = await page.evaluate(() => {
    const hostDateInput = document.getElementById("reservation-date");
    const radarDateInput = document.querySelector("#zzk-map-calendar-overlay input[type='date'], .zzk-map-calendar-date-native");

    return {
      hostDate: hostDateInput instanceof HTMLInputElement ? hostDateInput.value : "",
      radarDate: radarDateInput instanceof HTMLInputElement ? radarDateInput.value : "",
      radarMin: radarDateInput instanceof HTMLInputElement ? radarDateInput.min : "",
      today: window.__zzkDateTimeUtils.getTodayDateInKST(),
    };
  });

  expect(snapshot.hostDate).toBe("2020-01-02");
  expect(snapshot.radarDate).toBe("2020-01-02");
  expect(snapshot.radarDate).not.toBe(snapshot.today);
  expect(snapshot.radarMin).toBe("");

  await page.evaluate(() => {
    const overlayRows = document.querySelectorAll("#zzk-map-calendar-overlay .zzk-map-calendar-row");
    if (overlayRows.length > 0) {
      return;
    }
    const launcher = document.getElementById("zzk-map-calendar-radar-launcher");
    if (launcher instanceof HTMLButtonElement) {
      launcher.click();
    }
  });
  await page.waitForSelector("#zzk-map-calendar-overlay .zzk-map-calendar-row", { timeout: 6000 });

  const slotSnapshot = await page.evaluate(() => {
    const targetSlot = Array.from(
      document.querySelectorAll("#zzk-map-calendar-overlay .zzk-map-calendar-row .zzk-map-calendar-slot"),
    ).find((slot) => {
      if (!(slot instanceof HTMLElement)) {
        return false;
      }
      const title = slot.getAttribute("title") || "";
      return title.includes("10:00~10:10");
    });

    return {
      found: targetSlot instanceof HTMLElement,
      pastBlocked:
        targetSlot instanceof HTMLElement && targetSlot.classList.contains("past-blocked"),
    };
  });

  expect(slotSnapshot).toEqual({ found: true, pastBlocked: false });
});

test("edit page timeline click does not auto-close first time-input interaction", async ({ page }) => {
  await page.goto("https://example.com/guest/test-map/reservation/edit", {
    waitUntil: "domcontentloaded",
  });

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
          spaces: [
            {
              id: 3,
              name: "수성",
              color: "#60a5fa",
              reservationEnable: true,
              settings: [{ settingStartTime: "09:00:00", settingEndTime: "18:00:00" }],
            },
          ],
        }),
      });
      return;
    }

    if (url.pathname === "/api/guests/maps/234/spaces/availability") {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          spaces: [{ spaceId: 3, isAvailable: true }],
        }),
      });
      return;
    }

    if (url.pathname === "/api/guests/maps/234/spaces/3/reservations") {
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
      <section style="display:flex; align-items:center; gap:10px; margin-bottom:8px;">
        <h2 id="room-title" style="margin:0;">수성</h2>
      </section>

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
        <select id="room-select" name="spaceId" disabled>
          <option value="3" selected>11층 수성</option>
        </select>

        <div id="form-action-row" style="display:flex; gap:8px; margin-top:12px;">
          <button id="form-reserve-submit" type="button">수정하기</button>
        </div>
      </form>
    </main>
  `);

  await injectContentScriptBundle(page);
  await waitForContentScriptInjected(page);
  await page.waitForTimeout(700);
  await page.waitForTimeout(1200);

  await page.evaluate(() => {
    const overlayRows = document.querySelectorAll("#zzk-map-calendar-overlay .zzk-map-calendar-row");
    if (overlayRows.length > 0) {
      return;
    }

    const launcher = document.getElementById("zzk-map-calendar-radar-launcher");
    if (launcher instanceof HTMLButtonElement) {
      launcher.click();
    }
  });
  await page.waitForSelector("#zzk-map-calendar-overlay .zzk-map-calendar-row", { timeout: 6000 });

  const snapshot = await page.evaluate(async () => {
    const startInput = document.getElementById("start-time");
    if (!(startInput instanceof HTMLInputElement)) {
      return { blurCount: -1, activeElementId: "" };
    }

    window.__zzkBlurCount = 0;
    startInput.addEventListener("blur", () => {
      window.__zzkBlurCount += 1;
    });

    const targetSlot = Array.from(
      document.querySelectorAll("#zzk-map-calendar-overlay .zzk-map-calendar-row .zzk-map-calendar-slot")
    ).find((slot) => {
      if (!(slot instanceof HTMLElement)) {
        return false;
      }
      const title = slot.getAttribute("title") || "";
      return title.includes("10:10~10:20");
    });

    if (targetSlot instanceof HTMLElement) {
      targetSlot.click();
    }

    startInput.focus();
    startInput.click();
    await new Promise((resolve) => window.setTimeout(resolve, 900));

    return {
      blurCount: Number(window.__zzkBlurCount || 0),
      activeElementId: document.activeElement instanceof HTMLElement ? document.activeElement.id || "" : "",
    };
  });

  expect(snapshot.blurCount).toBe(0);
  expect(snapshot.activeElementId).toBe("start-time");
});

test("edit page keeps original reservation window selectable after moving away and back", async ({ page }) => {
  await page.goto("https://example.com/guest/test-map/reservation/edit", {
    waitUntil: "domcontentloaded",
  });

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
          spaces: [
            {
              id: 3,
              name: "수성",
              color: "#60a5fa",
              reservationEnable: true,
              settings: [{ settingStartTime: "09:00:00", settingEndTime: "18:00:00" }],
            },
          ],
        }),
      });
      return;
    }

    if (url.pathname === "/api/guests/maps/234/spaces/availability") {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          spaces: [{ spaceId: 3, isAvailable: true }],
        }),
      });
      return;
    }

    if (url.pathname === "/api/guests/maps/234/spaces/3/reservations") {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          reservations: [
            {
              id: 901,
              name: "애니",
              description: "기존 예약",
              startDateTime: "2026-12-02T10:00:00+09:00",
              endDateTime: "2026-12-02T10:30:00+09:00",
            },
          ],
        }),
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
      <section style="display:flex; align-items:center; gap:10px; margin-bottom:8px;">
        <h2 id="room-title" style="margin:0;">수성</h2>
      </section>

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
        <select id="room-select" name="spaceId" disabled>
          <option value="3" selected>11층 수성</option>
        </select>

        <div id="form-action-row" style="display:flex; gap:8px; margin-top:12px;">
          <button id="form-reserve-submit" type="button">수정하기</button>
        </div>
      </form>
    </main>
  `);

  await injectContentScriptBundle(page);
  await waitForContentScriptInjected(page);
  await page.waitForTimeout(700);
  await page.waitForTimeout(1200);

  await page.evaluate(() => {
    const overlayRows = document.querySelectorAll("#zzk-map-calendar-overlay .zzk-map-calendar-row");
    if (overlayRows.length > 0) {
      return;
    }

    const launcher = document.getElementById("zzk-map-calendar-radar-launcher");
    if (launcher instanceof HTMLButtonElement) {
      launcher.click();
    }
  });

  await page.waitForSelector("#zzk-map-calendar-overlay .zzk-map-calendar-row", { timeout: 6000 });

  await page.evaluate(() => {
    const slotNodes = Array.from(
      document.querySelectorAll("#zzk-map-calendar-overlay .zzk-map-calendar-row .zzk-map-calendar-slot")
    );

    const pickSlot = (label) => {
      const target = slotNodes.find((slot) => {
        if (!(slot instanceof HTMLElement)) {
          return false;
        }
        const title = slot.getAttribute("title") || "";
        return (
          title.includes(label) &&
          !slot.classList.contains("busy") &&
          !slot.classList.contains("past-blocked") &&
          !slot.classList.contains("room-locked-disabled")
        );
      });

      if (target instanceof HTMLElement) {
        target.click();
      }
    };

    pickSlot("10:40~10:50");
  });

  await page.waitForTimeout(700);

  await page.evaluate(() => {
    const slotNodes = Array.from(
      document.querySelectorAll("#zzk-map-calendar-overlay .zzk-map-calendar-row .zzk-map-calendar-slot")
    );
    const target = slotNodes.find((slot) => {
      if (!(slot instanceof HTMLElement)) {
        return false;
      }
      const title = slot.getAttribute("title") || "";
      return (
        title.includes("10:00~10:10") &&
        !slot.classList.contains("busy") &&
        !slot.classList.contains("past-blocked") &&
        !slot.classList.contains("room-locked-disabled")
      );
    });

    if (target instanceof HTMLElement) {
      target.click();
    }
  });

  await page.waitForTimeout(800);

  const snapshot = await page.evaluate(() => {
    const startInput = document.getElementById("start-time");
    const endInput = document.getElementById("end-time");

    return {
      startValue: startInput instanceof HTMLInputElement ? startInput.value : "",
      endValue: endInput instanceof HTMLInputElement ? endInput.value : "",
    };
  });

  expect(snapshot.startValue).toBe("10:00");
  expect(snapshot.endValue).not.toBe("10:50");
});
