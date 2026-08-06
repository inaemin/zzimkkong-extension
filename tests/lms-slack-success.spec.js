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

  // fill() 은 입력 이벤트를 제대로 흘리지 않아 필터가 안 걸린다. 실제로 친다.
  await input.click();
  await input.pressSequentially("공지");
  await page.locator('[data-slot="combobox-item"]').first().click();
  await expect(chips).toHaveText(["#공지"]);

  // 고르면 입력이 비고 팝업이 닫힌다. 다시 열어 다른 채널을 친다.
  await expect(input).toHaveValue("");
  await input.click();
  await input.pressSequentially("개발");
  await expect(page.locator('[data-slot="combobox-item"]').first()).toContainText("#개발");
  await page.locator('[data-slot="combobox-item"]').first().click();

  // 둘 다 남으면 /remind 대상이 모호해진다.
  await expect(chips).toHaveText(["#개발"]);
});

test("고른 채널이 /remind 명령에 반영되고, 칩을 지우면 me 로 돌아온다", async ({ page }) => {
  await openSlackModalWithHistory(page, "#개발");

  const input = page.locator('[data-slot="combobox-chip-input"]');
  await input.click();
  await input.pressSequentially("개발");
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
  await input.pressSequentially("새채널");

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

// 채널 입력과 리마인드 시점은 나란히 놓이므로 높이가 어긋나면 바로 보인다.
// 칩이 들어와도 같은 높이를 유지해야 한다.
test("채널 입력과 리마인드 시점의 높이가 같다", async ({ page }) => {
  await openSlackModalWithHistory(page, "#공지");

  const measure = () =>
    page.evaluate(() => {
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
      return {
        chips: Math.round(findDeep('[data-slot="combobox-chips"]').getBoundingClientRect().height),
        select: Math.round(findDeep('[data-slot="select-trigger"]').getBoundingClientRect().height),
      };
    });

  const empty = await measure();
  expect(empty.chips).toBe(empty.select);

  // 칩이 생겨도 그대로여야 한다(칩이 상자보다 크면 밀려 나온다).
  const input = page.locator('[data-slot="combobox-chip-input"]');
  await input.click();
  await input.pressSequentially("공지");
  await page.locator('[data-slot="combobox-item"]').first().click();
  await expect(page.locator('[data-slot="combobox-chip"]')).toHaveCount(1);

  const filled = await measure();
  expect(filled.chips).toBe(filled.select);
});

// select 팝업은 항목이 모서리에 닿으면 안 된다. 여백이 없으면 하이라이트가
// 가장자리까지 번지고 둥근 모서리도 잘려 보인다.
test("리마인드 시점 팝업의 항목이 모서리에 닿지 않는다", async ({ page }) => {
  await openSlackModalWithHistory(page);
  await page.locator('[data-slot="select-trigger"]').click();
  await page.locator('[data-slot="select-item"]').first().waitFor({ state: "visible" });

  const inset = await page.evaluate(() => {
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
    const popup = findDeep('[data-slot="select-content"]');
    const items = [...popup.querySelectorAll('[data-slot="select-item"]')];
    const popupRect = popup.getBoundingClientRect();
    const first = items[0].getBoundingClientRect();
    const last = items[items.length - 1].getBoundingClientRect();
    return {
      count: items.length,
      top: Math.round(first.top - popupRect.top),
      bottom: Math.round(popupRect.bottom - last.bottom),
      left: Math.round(first.left - popupRect.left),
    };
  });

  expect(inset.count).toBeGreaterThan(1);
  expect(inset.top).toBeGreaterThan(0);
  expect(inset.bottom).toBeGreaterThan(0);
  expect(inset.left).toBeGreaterThan(0);
});

// 드롭다운에 내용 없는 줄이 끼면 안 된다. ComboboxEmpty 는 목록이 비지 않아도
// 노드가 남아서, 여백을 무조건 주면 빈 줄 하나가 생겼다.
test("채널 드롭다운에 빈 줄이 없다", async ({ page }) => {
  await openSlackModalWithHistory(page);

  const input = page.locator('[data-slot="combobox-chip-input"]');
  await input.click();
  await input.pressSequentially("8기-poudy");
  await page.locator('[data-slot="combobox-item"]').first().waitFor({ state: "visible" });

  const rows = await page.evaluate(() => {
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
    const popup = findDeep('[data-slot="combobox-content"]');
    // 화면을 차지하는데 글자가 없는 자식이 있으면 빈 줄이다.
    return [...popup.children]
      .flatMap((child) => [child, ...child.children])
      .filter((node) => {
        const rect = node.getBoundingClientRect();
        return rect.height > 4 && (node.textContent || "").trim() === "";
      }).length;
  });

  expect(rows).toBe(0);
});

// 팝업은 트리거 폭에 맞고 바로 아래에 붙어야 하며, 열고 닫을 때 애니메이션이
// 돈다. animate-in/out 유틸리티는 tw-animate-css 에서 온다 — 빠지면 조용히
// 애니메이션만 사라지므로 여기서 고정한다.
test("리마인드 시점 팝업이 트리거에 맞춰 뜨고 애니메이션이 돈다", async ({ page }) => {
  await openSlackModalWithHistory(page);

  const trigger = page.locator('[data-slot="select-trigger"]');
  await trigger.click();
  await page.locator('[data-slot="select-item"]').first().waitFor({ state: "visible" });

  // 애니메이션이 도는지는 열리자마자 봐야 한다(끝나면 none 으로 돌아간다).
  const animation = await page.evaluate(() => {
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
    return getComputedStyle(findDeep('[data-slot="select-content"]')).animationName;
  });

  // tw-animate-css 가 빠지면 animate-in 이 사라져 none 이 된다.
  expect(animation).not.toBe("none");

  // 크기·위치는 애니메이션이 끝난 뒤에 잰다(도중에는 zoom 중이라 값이 흔들린다).
  const layout = await page.evaluate(async () => {
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
    const content = findDeep('[data-slot="select-content"]');
    const triggerElement = findDeep('[data-slot="select-trigger"]');
    await Promise.all(document.getAnimations().map((item) => item.finished.catch(() => {})));
    const contentRect = content.getBoundingClientRect();
    const triggerRect = triggerElement.getBoundingClientRect();
    return {
      popupWidth: Math.round(contentRect.width),
      triggerWidth: Math.round(triggerRect.width),
      popupTop: contentRect.top,
      triggerTop: triggerRect.top,
    };
  });

  // 트리거 폭에 맞는다. min-w-36 이 붙어 있으면 16px 넓어지므로 그걸 잡는 게
  // 목적이다(테두리·서브픽셀 차이는 몇 px 허용).
  expect(Math.abs(layout.popupWidth - layout.triggerWidth)).toBeLessThan(8);
  // 트리거 아래에 붙는다(alignItemWithTrigger=false).
  expect(layout.popupTop).toBeGreaterThan(layout.triggerTop);
});

// 기록 삭제 버튼은 채널명 바로 옆이 아니라 줄 오른쪽 끝에 붙어야 한다.
// 채널명 길이에 따라 버튼 위치가 들쭉날쭉하면 누르기 어렵다.
test("기록 삭제 버튼이 줄 오른쪽 끝에 붙는다", async ({ page }) => {
  await openSlackModalWithHistory(page, "#공지\n#8기-poudy");

  await page.locator('[data-slot="combobox-chip-input"]').click();
  await page.locator('[data-slot="combobox-item"]').first().waitFor({ state: "visible" });

  const rows = await page.evaluate(() => {
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
    const popup = findDeep('[data-slot="combobox-content"]');
    return [...popup.querySelectorAll('[data-slot="combobox-item"]')]
      .map((item) => {
        const button = item.querySelector("button");
        if (!button) return null;
        const itemRect = item.getBoundingClientRect();
        const buttonRect = button.getBoundingClientRect();
        return {
          // 줄 오른쪽 끝에서 얼마나 떨어져 있는지(항목 padding 만큼만 떨어져야 한다)
          gapFromRight: Math.round(itemRect.right - buttonRect.right),
          label: (item.textContent || "").trim(),
        };
      })
      .filter(Boolean);
  });

  expect(rows.length).toBeGreaterThan(1);
  // 채널명 길이가 달라도 오른쪽 여백은 같아야 한다.
  const gaps = new Set(rows.map((row) => row.gapFromRight));
  expect(gaps.size).toBe(1);
  expect([...gaps][0]).toBeLessThanOrEqual(12);
});

// 목록의 "삭제"는 칩을 빼는 게 아니라 최근 사용 기록에서 지우는 버튼이다.
// 저장소에서 지우고 목록에서도 사라져야 하며, 고른 칩은 건드리면 안 된다.
test("기록 삭제는 저장소와 목록에서만 지우고 고른 칩은 남긴다", async ({ page }) => {
  await openSlackModalWithHistory(page, "#공지\n#개발");

  const input = page.locator('[data-slot="combobox-chip-input"]');
  const chips = page.locator('[data-slot="combobox-chip"]');
  const items = page.locator('[data-slot="combobox-item"]');

  // #공지 를 골라 칩으로 만든다.
  await input.click();
  await input.pressSequentially("공지");
  await items.first().click();
  await expect(chips).toHaveText(["#공지"]);

  // 목록을 열어 #개발 의 삭제를 누른다.
  await input.click();
  await expect(items).toHaveCount(2);
  await page.evaluate(() => {
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
    const popup = findDeep('[data-slot="combobox-content"]');
    const row = [...popup.querySelectorAll('[data-slot="combobox-item"]')].find((item) =>
      (item.textContent || "").includes("개발"),
    );
    // 이 버튼은 pointerdown 에서 처리한다(선택으로 번지지 않게).
    row?.querySelector("button")?.dispatchEvent(new PointerEvent("pointerdown", { bubbles: true }));
  });

  // 목록에서 사라진다.
  await expect(items).toHaveCount(1);
  // 저장소에서도 사라진다(다음에 열 때 다시 나오면 안 된다).
  await expect
    .poll(() => page.evaluate(() => localStorage.getItem("zzk-slack-channel-history-v1")))
    .toBe("#공지");
  // 고른 칩은 그대로다.
  await expect(chips).toHaveText(["#공지"]);
});

// 아무것도 입력하지 않았으면 저장된 채널이 전부 보여야 한다. 필터를 직접
// 걸다 보니 빈 문자열을 잘못 다루면 목록이 통째로 사라질 수 있다.
test("입력이 비어 있으면 저장된 채널이 모두 나온다", async ({ page }) => {
  await openSlackModalWithHistory(page, "#공지\n#개발\n#8기-poudy");

  const input = page.locator('[data-slot="combobox-chip-input"]');
  const items = page.locator('[data-slot="combobox-item"]');

  // 1) 처음 열었을 때
  await input.click();
  await expect(items).toHaveCount(3);

  // 2) 쳤다가 다 지웠을 때도 되돌아와야 한다.
  await input.pressSequentially("개발");
  await expect(items).toHaveCount(1);
  await input.press("Backspace");
  await input.press("Backspace");
  await expect(input).toHaveValue("");
  await expect(items).toHaveCount(3);

  // 3) 채널을 고른 뒤에도 목록은 그대로다(고른 것도 계속 보인다).
  await items.first().click();
  await expect(page.locator('[data-slot="combobox-chip"]')).toHaveCount(1);
  await input.click();
  await expect(items).toHaveCount(3);
});
