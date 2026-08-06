import { expect, test } from "@playwright/test";

import { mountReservationPage } from "./helpers/extension.js";

// Slack 채널 기억.
//
// /remind 를 보낼 채널은 사람마다 다르고 자주 바뀌지 않는다. 그래서 한 번 쓴
// 채널을 저장해 두고 다음에 콤보박스에서 바로 고르게 한다.
//
// 저장이 안 되면 매번 다시 입력해야 하고, 정규화가 어긋나면 "#dev" 와 "dev"
// 가 다른 항목으로 쌓인다.

test.beforeEach(async ({ page }) => {
  await mountReservationPage(page);
  await page.evaluate(() => localStorage.clear());
});

test("쓴 채널을 기억한다", async ({ page }) => {
  const history = await page.evaluate(() =>
    window.__zzkTestApi.rememberSlackChannelMention("#dev"),
  );

  expect(history).toContain("#dev");
});

test("최근에 쓴 것이 앞에 온다", async ({ page }) => {
  const history = await page.evaluate(() => {
    window.__zzkTestApi.rememberSlackChannelMention("#first");
    window.__zzkTestApi.rememberSlackChannelMention("#second");
    return window.__zzkTestApi.rememberSlackChannelMention("#third");
  });

  expect(history[0]).toBe("#third");
});

test("같은 채널을 다시 써도 중복으로 쌓이지 않는다", async ({ page }) => {
  const history = await page.evaluate(() => {
    window.__zzkTestApi.rememberSlackChannelMention("#dev");
    window.__zzkTestApi.rememberSlackChannelMention("#ops");
    return window.__zzkTestApi.rememberSlackChannelMention("#dev");
  });

  expect(history.filter((token) => token === "#dev")).toHaveLength(1);
  // 다시 쓴 것이 맨 앞으로 올라온다.
  expect(history[0]).toBe("#dev");
});

test("# 없는 값은 기억하지 않는다", async ({ page }) => {
  const history = await page.evaluate(() => window.__zzkTestApi.rememberSlackChannelMention("dev"));

  // 채널인지 사람 이름인지 구분할 수 없어 저장하지 않는다.
  expect(history).toEqual([]);
});

test("지우면 목록에서 빠진다", async ({ page }) => {
  const history = await page.evaluate(() => {
    window.__zzkTestApi.rememberSlackChannelMention("#dev");
    window.__zzkTestApi.rememberSlackChannelMention("#ops");
    return window.__zzkTestApi.forgetSlackChannelMention("#dev");
  });

  expect(history).not.toContain("#dev");
  expect(history).toContain("#ops");
});

test("페이지를 새로 열어도 기억이 남는다", async ({ page }) => {
  await page.evaluate(() => window.__zzkTestApi.rememberSlackChannelMention("#persist"));

  await page.reload({ waitUntil: "domcontentloaded" });
  const stored = await page.evaluate(() =>
    Object.entries(localStorage).find(([key]) => key.includes("channel-history")),
  );

  // localStorage 에 남아야 다음 방문에서 콤보박스가 채워진다.
  expect(JSON.stringify(stored)).toContain("#persist");
});
