import { expect, test } from "@playwright/test";
import {
  API_ORIGIN,
  WEB_ORIGIN,
  ensureExtensionBuild,
  jsonResponse,
  loadContentBundle,
  stubServiceDocument,
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

test("lms+ 예약 성공 시 Slack 모달이 응답 body 기반으로 뜬다", async ({ page }) => {
  await mountLmsPage(page);

  await emitReservationSuccess(page);
  await page.waitForSelector("#zzk-slack-copy-modal", { timeout: 3000 });

  // /remind 미리보기(textarea)에 시간대·목적·장소(층+회의실)가 들어있어야 한다.
  const remindText = await page.evaluate(() => {
    const modal = document.getElementById("zzk-slack-copy-modal");
    const textarea = modal ? modal.querySelector(".zzk-slack-copy-textarea") : null;
    return textarea ? textarea.value : "";
  });
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

  const modalExists = await page.evaluate(() =>
    Boolean(document.getElementById("zzk-slack-copy-modal")),
  );
  expect(modalExists).toBe(false);
});

test("같은 예약 응답이 두 번 와도 모달은 한 번만(중복 방지) 처리된다", async ({ page }) => {
  await mountLmsPage(page);

  await emitReservationSuccess(page);
  await page.waitForSelector("#zzk-slack-copy-modal", { timeout: 3000 });

  // 모달을 닫고 같은 응답을 다시 보내면, 디듀프되어 다시 뜨지 않아야 한다.
  await page.evaluate(() => {
    const modal = document.getElementById("zzk-slack-copy-modal");
    if (modal) modal.remove();
  });
  await emitReservationSuccess(page);
  await page.waitForTimeout(500);

  const reopened = await page.evaluate(() =>
    Boolean(document.getElementById("zzk-slack-copy-modal")),
  );
  expect(reopened).toBe(false);
});
