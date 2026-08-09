import { expect, test } from "@playwright/test";
import {
  API_ORIGIN,
  WEB_ORIGIN,
  ensureExtensionBuild,
  loadContentBundle,
} from "./helpers/extension.js";

test.beforeAll(ensureExtensionBuild);

// 호스트의 "남은 시간" 요약 블록을 우리 패널로 바꾸는 흐름.
//
// 계산 규칙은 tests/quota.spec.js 가 본다. 여기서는 페이지에 실제로 끼어드는
// 부분만 확인한다 — 이 기능은 호스트 마크업에 기대므로, 못 찾았을 때 원래대로
// 두는지가 그리는 것만큼 중요하다.

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
];

const LIMITED_QUOTA = {
  unlimited: false,
  dailyLimitMinutes: 180,
  dailyUsedMinutes: 0,
  dailyRemainingMinutes: 180,
  monthlyLimitMinutes: 1200,
  monthlyUsedMinutes: 150,
  monthlyRemainingMinutes: 1050,
};

const UNLIMITED_QUOTA = {
  unlimited: true,
  dailyLimitMinutes: null,
  dailyUsedMinutes: null,
  dailyRemainingMinutes: null,
  monthlyLimitMinutes: null,
  monthlyUsedMinutes: null,
  monthlyRemainingMinutes: null,
};

/** lms+ 가 실제로 그리는 요약 블록. 이걸 우리가 대신한다. */
const HOST_QUOTA_BLOCK = `
  <div class="flex gap-6 rounded-lg border border-border bg-muted/30 px-4 py-2 text-sm" id="host-quota">
    <div>
      <p class="text-muted-foreground">이번 달 남은 시간</p>
      <p class="font-semibold">17시간 30분<span class="ml-1 font-normal text-muted-foreground">/ 20시간</span></p>
    </div>
    <div>
      <p class="text-muted-foreground">이 날 남은 시간</p>
      <p class="font-semibold">3시간<span class="ml-1 font-normal text-muted-foreground">/ 3시간</span></p>
    </div>
  </div>`;

function buildPageHtml({ withQuotaBlock, wrapInFlex }) {
  // 실제 페이지는 요약 블록을 다른 컨트롤과 나란히 flex 로 배치한다.
  const quotaBlock = wrapInFlex
    ? `<div style="display:flex;align-items:center;gap:16px">${HOST_QUOTA_BLOCK}<button>다른 컨트롤</button></div>`
    : HOST_QUOTA_BLOCK;
  return `<html><body>
    <main>
      ${withQuotaBlock ? quotaBlock : ""}
      <form id="reservation-form">
        <label for="reservation-date">날짜</label>
        <input id="reservation-date" name="date" type="date" value="2026-12-02" />
      </form>
    </main>
  </body></html>`;
}

async function mountPage(page, { quota, withQuotaBlock = true, wrapInFlex = false }) {
  await page.addInitScript(() => {
    window.__ZZK_TEST_HOOKS__ = true;
  });

  await page.route(`${WEB_ORIGIN}/**`, async (route) => {
    if (route.request().resourceType() !== "document") {
      await route.continue();
      return;
    }
    await route.fulfill({
      status: 200,
      // charset 을 명시한다. 없으면 브라우저가 Latin-1 로 읽어 한글이 깨지고,
      // 라벨로 블록을 찾는 코드가 못 찾는다.
      contentType: "text/html; charset=utf-8",
      body: buildPageHtml({ withQuotaBlock, wrapInFlex }),
    });
  });

  await page.route(`${API_ORIGIN}/api/**`, async (route) => {
    const url = new URL(route.request().url());
    let body = [];
    if (url.pathname === "/api/spaces") {
      body = SPACES;
    } else if (url.pathname === "/api/space-reservations/quota") {
      body = quota;
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
  await loadContentBundle(page);
  await page.waitForFunction(
    () => document.getElementById("zzk-map-calendar-radar-launcher") instanceof HTMLElement,
    undefined,
    { timeout: 5000 },
  );
}

/** 우리 패널의 shadow root 안을 본다. */
async function readPanelText(page) {
  return page.evaluate(
    () =>
      document
        .getElementById("zzk-quota-panel")
        ?.shadowRoot?.querySelector("[data-testid=quota-panel]")?.textContent ?? null,
  );
}

test("호스트의 요약 블록을 우리 패널이 대신한다", async ({ page }) => {
  await mountPage(page, { quota: LIMITED_QUOTA });

  await page.waitForFunction(
    () => document.getElementById("zzk-quota-panel")?.shadowRoot?.childElementCount > 0,
    undefined,
    { timeout: 6000 },
  );

  const text = await readPanelText(page);

  // 호스트가 쓰던 문구를 그대로 쓴다.
  expect(text).toContain("이번 달 남은 시간");
  expect(text).toContain("이 날 남은 시간");
  // 잔여 1050분 = 17시간 30분, 한도 1200분 = 20시간.
  expect(text).toContain("17시간 30분");
  expect(text).toContain("20시간");

  // 원래 블록은 감춰진다(지우지 않는다).
  const hostHidden = await page.evaluate(() => {
    const node = document.getElementById("host-quota");
    return { exists: node != null, display: node?.style.display };
  });
  expect(hostHidden.exists).toBe(true);
  expect(hostHidden.display).toBe("none");
});

test("막대가 progressbar 로 노출된다", async ({ page }) => {
  // 숫자만으로는 얼마나 남았는지 안 들어온다. 막대가 그걸 대신한다.
  await mountPage(page, { quota: LIMITED_QUOTA });
  await page.waitForFunction(
    () => document.getElementById("zzk-quota-panel")?.shadowRoot?.childElementCount > 0,
    undefined,
    { timeout: 6000 },
  );

  const bars = await page.evaluate(() =>
    Array.from(
      document.getElementById("zzk-quota-panel").shadowRoot.querySelectorAll("[role=progressbar]"),
    ).map((node) => node.getAttribute("aria-valuenow")),
  );

  // 이번 달 150/1200 = 13%, 오늘 0/180 = 0%.
  expect(bars).toEqual(["13", "0"]);
});

test("호스트가 flex 로 감싸도 폭을 물려받아 라벨과 값이 한 줄에 남는다", async ({ page }) => {
  // 우리 마운트는 원래 블록 자리에 끼어든다. 그 자리가 flex 자식이면 폭을
  // 물려받지 못하고 내용만큼 줄어드는데, 그러면 값이 들어갈 자리가 모자라
  // 라벨과 값이 두 줄로 갈라진다.
  await mountPage(page, { quota: LIMITED_QUOTA, wrapInFlex: true });
  await page.waitForFunction(
    () => document.getElementById("zzk-quota-panel")?.shadowRoot?.childElementCount > 0,
    undefined,
    { timeout: 6000 },
  );

  const rows = await page.evaluate(() =>
    Array.from(
      document
        .getElementById("zzk-quota-panel")
        .shadowRoot.querySelectorAll("[data-testid=quota-item]"),
    ).map((item) => ({
      labelTop: Math.round(
        item.querySelector("[data-slot=progress-label]").getBoundingClientRect().top,
      ),
      valueTop: Math.round(
        item.querySelector("[data-slot=progress-value]").getBoundingClientRect().top,
      ),
    })),
  );

  // 같은 줄이면 top 이 같다.
  rows.forEach((row) => {
    expect(row.valueTop).toBe(row.labelTop);
  });
});

test("요약 블록이 없으면 아무것도 끼우지 않는다", async ({ page }) => {
  // 호스트 구조가 바뀌면 못 찾는다. 그때 엉뚱한 자리에 그리면 안 된다.
  await mountPage(page, { quota: LIMITED_QUOTA, withQuotaBlock: false });
  await page.waitForTimeout(1200);

  const present = await page.evaluate(() => document.getElementById("zzk-quota-panel") != null);

  expect(present).toBe(false);
});

test("무제한 계정이면 호스트 블록을 그대로 둔다", async ({ page }) => {
  // 보여줄 것이 없으면 물러나야 한다. 감춰만 두면 페이지 정보가 사라진다.
  await mountPage(page, { quota: UNLIMITED_QUOTA });
  await page.waitForTimeout(1200);

  const host = await page.evaluate(() => {
    const node = document.getElementById("host-quota");
    return { display: node?.style.display, text: node?.textContent?.includes("17시간 30분") };
  });

  expect(host.display).not.toBe("none");
  expect(host.text).toBe(true);
});
