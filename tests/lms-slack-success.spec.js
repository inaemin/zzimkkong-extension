import { expect, test } from "@playwright/test";
import {
  API_ORIGIN,
  WEB_ORIGIN,
  ensureExtensionBuild,
  loadContentBundle,
} from "./helpers/extension.js";

test.beforeAll(ensureExtensionBuild);

const spacesFixture = [
  { id: 5, name: "보이저", floor: 12, active: true, openTime: "07:00:00", closeTime: "23:00:00" },
];

// 실제 POST /api/space-reservations 성공 응답 형태.
const RESERVATION_RESPONSE = {
  date: "2099-01-02",
  endTime: "21:00:00",
  floor: 12,
  id: 175,
  mine: true,
  purpose: "학습",
  reserverName: "애니(민인애)",
  spaceId: 5,
  spaceName: "보이저",
  startTime: "20:00:00",
};

async function mountLmsPage(page) {
  await page.route(`${WEB_ORIGIN}/**`, async (route) => {
    if (route.request().resourceType() !== "document") {
      await route.continue();
      return;
    }
    await route.fulfill({
      status: 200,
      contentType: "text/html; charset=utf-8",
      body: "<html><head><meta charset='utf-8'></head><body><main></main></body></html>",
    });
  });
  await page.route(`${API_ORIGIN}/api/**`, async (route) => {
    const url = new URL(route.request().url());
    const body = url.pathname === "/api/spaces" ? spacesFixture : [];
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
  await loadContentBundle(page);
}

function emitReservationSuccess(page, payloadOverrides = {}) {
  return page.evaluate(
    (payload) => {
      window.postMessage(
        {
          source: "zzk-page-reservation-hook",
          type: "ZZK_RESERVATION_NETWORK_EVENT",
          payload,
        },
        "*",
      );
    },
    {
      ok: true,
      status: 200,
      method: "POST",
      url: "https://techcourse-lms-plus-api.woowahan.com/api/space-reservations",
      responseBody: RESERVATION_RESPONSE,
      ...payloadOverrides,
    },
  );
}

/** React 모달은 shadow root 안에 있어 document 쿼리로는 안 잡힌다. */
async function slackModalExists(page) {
  return page.evaluate(() => {
    const host = document.getElementById("zzk-slack-copy-root");
    return Boolean(host?.shadowRoot?.querySelector("#zzk-slack-message"));
  });
}

test("lms+ 예약 성공 시 Slack 모달이 응답 body 기반으로 뜬다", async ({ page }) => {
  await mountLmsPage(page);

  await emitReservationSuccess(page);
  await page.waitForSelector("#zzk-slack-message", { timeout: 3000 });

  // /remind 미리보기(textarea)에 시간대·목적·장소(층+회의실)가 들어있어야 한다.
  const remindText = await page.locator("#zzk-slack-message").inputValue();
  expect(remindText).toContain("20:00-21:00");
  expect(remindText).toContain("학습");
  expect(remindText).toContain("보이저");
  // 층은 12F 로 표기된다.
  expect(remindText).toContain("12F");
});

test("예약 실패(4xx)나 응답 body 없으면 Slack 모달이 뜨지 않는다", async ({ page }) => {
  await mountLmsPage(page);

  // 4xx
  await emitReservationSuccess(page, { ok: false, status: 400 });
  // body 없음
  await emitReservationSuccess(page, { responseBody: null });
  await page.waitForTimeout(500);

  const modalExists = await slackModalExists(page);
  expect(modalExists).toBe(false);
});

test("같은 예약 응답이 두 번 와도 모달은 한 번만(중복 방지) 처리된다", async ({ page }) => {
  await mountLmsPage(page);

  await emitReservationSuccess(page);
  await page.waitForSelector("#zzk-slack-message", { timeout: 3000 });

  // 모달을 닫고 같은 응답을 다시 보내면, 디듀프되어 다시 뜨지 않아야 한다.
  await page.evaluate(() => {
    document.getElementById("zzk-slack-copy-root")?.remove();
  });
  await emitReservationSuccess(page);
  await page.waitForTimeout(500);

  const reopened = await slackModalExists(page);
  expect(reopened).toBe(false);
});

// Slack 모달 테스트 버튼은 개발 전용이다. 예전에는 호스트의 예약 탭 바에
// 끼워 넣어서, 그 바가 없는 화면에서는 아예 안 보였다. 지금은 레이더 런처
// 옆에 붙어 레이더가 뜨는 곳이면 항상 보인다.
test("개발 플래그를 켜면 런처 옆에 Slack 모달 버튼이 뜨고 눌리면 모달이 열린다", async ({
  page,
}) => {
  await page.addInitScript(() => {
    globalThis.__ZZK_DEBUG_MODE__ = true;
    try {
      localStorage.setItem("zzk-manual-slack-modal-trigger-v1", "1");
    } catch {
      /* 저장소를 못 쓰면 그냥 넘어간다 */
    }
  });
  await mountLmsPage(page);
  await page.evaluate(() => window.__zzkTestApi?.syncGuestUi?.());

  const readLauncherButtons = () =>
    page.evaluate(() =>
      [
        ...(document
          .getElementById("zzk-map-calendar-radar-launcher")
          ?.shadowRoot?.querySelectorAll("button") ?? []),
      ].map((button) => button.getAttribute("aria-label")),
    );

  await expect.poll(readLauncherButtons).toContain("Slack 모달 테스트 (개발 전용)");

  await page.evaluate(() => {
    const shadow = document.getElementById("zzk-map-calendar-radar-launcher")?.shadowRoot;
    const button = [...(shadow?.querySelectorAll("button") ?? [])].find(
      (candidate) => candidate.getAttribute("aria-label") === "Slack 모달 테스트 (개발 전용)",
    );
    button?.click();
  });

  // 모달이 실제로 떠야 한다. 안 뜨면 버튼만 있고 기능이 없는 셈이다.
  await expect(page.locator('[data-slot="dialog-content"]')).toBeVisible({ timeout: 4000 });
});

test("개발 플래그가 없으면 Slack 모달 버튼이 뜨지 않는다", async ({ page }) => {
  await mountLmsPage(page);
  await page.evaluate(() => window.__zzkTestApi?.syncGuestUi?.());
  await page.waitForTimeout(300);

  const labels = await page.evaluate(() =>
    [
      ...(document
        .getElementById("zzk-map-calendar-radar-launcher")
        ?.shadowRoot?.querySelectorAll("button") ?? []),
    ].map((button) => button.getAttribute("aria-label")),
  );

  expect(labels).not.toContain("Slack 모달 테스트 (개발 전용)");
});
