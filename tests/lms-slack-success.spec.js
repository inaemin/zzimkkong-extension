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

// 모달 구성이 shadcn 기본형을 따르는지. 설명문은 한 줄, 푸터는 [취소][주 버튼]
// 순서로 오른쪽에 모인다. 취소는 실제로 닫혀야 한다(모양만 있으면 안 된다).
test("Slack 모달이 shadcn 기본 구성을 따른다", async ({ page }) => {
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
  await page.evaluate(() => {
    const shadow = document.getElementById("zzk-map-calendar-radar-launcher")?.shadowRoot;
    [...(shadow?.querySelectorAll("button") ?? [])]
      .find((button) => button.getAttribute("aria-label")?.includes("Slack"))
      ?.click();
  });

  const dialog = page.locator('[data-slot="dialog-content"]');
  await expect(dialog).toBeVisible();

  // 설명문은 한 줄. 예전에는 3줄이 헤더에 몰려 있어 본문이 밀렸다.
  await expect(page.locator('[data-slot="dialog-description"]')).toHaveText(
    "Slack에 붙여넣기 전에 내용을 확인해 주세요.",
  );

  // 푸터는 취소 → 주 버튼 순서.
  const footerButtons = page.locator('[data-slot="dialog-footer"] button');
  await expect(footerButtons).toHaveText(["취소", "복사하기"]);

  // 푸터는 배치만 잡는다. 공식(base-ui) 에는 없는 구분선·회색 배경을 두지 않는다.
  const footerStyle = await page.evaluate(() => {
    const findDeep = (selector) => {
      const walk = (node) => {
        const hit = node.querySelector?.(selector);
        if (hit) return hit;
        for (const element of node.querySelectorAll?.("*") ?? []) {
          if (element.shadowRoot) {
            const found = walk(element.shadowRoot);
            if (found) return found;
          }
        }
        return null;
      };
      return walk(document);
    };
    const footer = findDeep('[data-slot="dialog-footer"]');
    const style = getComputedStyle(footer);
    return { borderTopWidth: style.borderTopWidth, backgroundColor: style.backgroundColor };
  });
  expect(footerStyle.borderTopWidth).toBe("0px");
  expect(footerStyle.backgroundColor).toBe("rgba(0, 0, 0, 0)");

  await page.getByRole("button", { name: "취소" }).click();
  await expect(dialog).toBeHidden();
});

/** 개발 플래그를 켜고 Slack 모달을 연다. */
async function openSlackModalWithHistory(page, history = "") {
  await page.addInitScript((seed) => {
    globalThis.__ZZK_DEBUG_MODE__ = true;
    try {
      localStorage.setItem("zzk-manual-slack-modal-trigger-v1", "1");
      if (seed) {
        localStorage.setItem("zzk-slack-channel-history-v1", seed);
      }
    } catch {
      /* 저장소를 못 쓰면 그냥 넘어간다 */
    }
  }, history);
  await mountLmsPage(page);
  await page.evaluate(() => window.__zzkTestApi?.syncGuestUi?.());
  await page.evaluate(() => {
    const shadow = document.getElementById("zzk-map-calendar-radar-launcher")?.shadowRoot;
    [...(shadow?.querySelectorAll("button") ?? [])]
      .find((button) => button.getAttribute("aria-label")?.includes("Slack"))
      ?.click();
  });
  await page.locator('[data-slot="dialog-content"]').waitFor({ state: "visible" });
}

// 채널 선택은 chip 이 들어가는 입력 상자다. 버튼을 눌러 여는 게 아니라 상자에
// 바로 적는다. multiple 모드를 쓰지만 채널은 하나만 걸 수 있어야 한다.
test("채널을 새로 고르면 앞의 채널을 밀어낸다(칩은 항상 하나)", async ({ page }) => {
  await openSlackModalWithHistory(page, "#공지\n#개발");

  const input = page.locator('[data-slot="combobox-chip-input"]');
  const chips = page.locator('[data-slot="combobox-chip"]');

  await input.click();
  await input.fill("공지");
  await page.locator('[data-slot="combobox-item"]').first().click();
  await expect(chips).toHaveText(["#공지"]);

  await input.click();
  await input.fill("개발");
  await page.locator('[data-slot="combobox-item"]').first().click();

  // 둘 다 남으면 /remind 대상이 모호해진다.
  await expect(chips).toHaveText(["#개발"]);
});

test("고른 채널이 /remind 명령에 반영되고, 칩을 지우면 me 로 돌아온다", async ({ page }) => {
  await openSlackModalWithHistory(page, "#개발");

  const input = page.locator('[data-slot="combobox-chip-input"]');
  await input.click();
  await input.fill("개발");
  await page.locator('[data-slot="combobox-item"]').first().click();

  await expect(page.locator("#zzk-slack-message")).toHaveValue(/\/remind #개발 /);

  await page.locator('[data-slot="combobox-chip-remove"]').first().click();
  await expect(page.locator('[data-slot="combobox-chip"]')).toHaveCount(0);
  await expect(page.locator("#zzk-slack-message")).toHaveValue(/\/remind me /);
});

test("목록에 없는 채널은 새로 추가할 수 있다", async ({ page }) => {
  await openSlackModalWithHistory(page);

  const input = page.locator('[data-slot="combobox-chip-input"]');
  await input.click();
  await input.fill("새채널");

  // '# 없이' 적어도 #새채널 로 정규화된다.
  await expect(page.locator('[data-slot="combobox-item"]').first()).toContainText("#새채널");
  await page.locator('[data-slot="combobox-item"]').first().click();
  await expect(page.locator('[data-slot="combobox-chip"]')).toHaveText(["#새채널"]);
});

// 리마인드 시점은 닫혀 있어도 "10분전"처럼 라벨이 보여야 한다. Select 에
// items 를 안 넘기면 값("10")만 나온다.
test("리마인드 시점은 닫힌 상태에서도 라벨을 보여주고 채널 옆에 선다", async ({ page }) => {
  await openSlackModalWithHistory(page);

  await expect(page.locator('[data-slot="select-trigger"]')).toContainText("10분전");

  // 채널 입력과 같은 줄에 있고, 오른쪽에 붙는다.
  const sideBySide = await page.evaluate(() => {
    const findDeep = (selector) => {
      const walk = (node) => {
        const hit = node.querySelector?.(selector);
        if (hit) return hit;
        for (const element of node.querySelectorAll?.("*") ?? []) {
          if (element.shadowRoot) {
            const found = walk(element.shadowRoot);
            if (found) return found;
          }
        }
        return null;
      };
      return walk(document);
    };
    const chips = findDeep('[data-slot="combobox-chips"]').getBoundingClientRect();
    const trigger = findDeep('[data-slot="select-trigger"]').getBoundingClientRect();
    return {
      sameRow: Math.abs(chips.top - trigger.top) < 40,
      rightOfChips: trigger.left > chips.right - 5,
    };
  });

  expect(sideBySide.sameRow).toBe(true);
  expect(sideBySide.rightOfChips).toBe(true);
});
