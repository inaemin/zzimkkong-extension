import { expect, test } from "@playwright/test";
import { WEB_ORIGIN, ensureExtensionBuild, loadContentBundle } from "./helpers/extension.js";

test.beforeAll(ensureExtensionBuild);

// 예약 목적 칸 찾기·채우기.
//
// 이 기능이 지켜야 할 선은 하나다: **사용자가 쓴 것을 덮어쓰지 않는다.**
// 자동 입력이 할 수 있는 가장 나쁜 일이라, 빈 칸일 때만 채운다.
//
// 실제 번들의 테스트 API 를 통해 확인한다. 페이지에 규칙을 다시 구현하면
// 그 사본만 검증하게 된다.

async function mountForm(page, formHtml, { myReservations = [] } = {}) {
  await page.addInitScript(() => {
    window.__ZZK_TEST_HOOKS__ = true;
  });
  await page.route(/api\.woowahan\.com\/api\//, async (route) => {
    const path = new URL(route.request().url()).pathname;
    const body = path === "/api/space-reservations/me" ? myReservations : [];
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

  await page.route(`${WEB_ORIGIN}/**`, async (route) => {
    if (route.request().resourceType() !== "document") {
      await route.continue();
      return;
    }
    await route.fulfill({
      status: 200,
      contentType: "text/html; charset=utf-8",
      body: `<html><body><main>${formHtml}</main></body></html>`,
    });
  });
  await page.goto(`${WEB_ORIGIN}/space-reservations`, { waitUntil: "domcontentloaded" });
  await loadContentBundle(page);
  await page.waitForFunction(() => window.__zzkTestApi?.purposeField != null, undefined, {
    timeout: 5000,
  });
}

/** 지금 목적 칸으로 인식되는 요소의 id. 없으면 null. */
function findId(page) {
  return page.evaluate(() => window.__zzkTestApi.purposeField.find()?.id ?? null);
}

test("라벨로 목적 칸을 찾는다", async ({ page }) => {
  await mountForm(
    page,
    `<form>
      <label for="d">날짜</label><input id="d" type="date" />
      <label for="p">사용 목적</label><input id="p" type="text" />
    </form>`,
  );

  expect(await findId(page)).toBe("p");
});

test("값이 비어 있어도 찾는다", async ({ page }) => {
  // 채우려는 대상이 바로 "빈 목적 칸"이다. 값이 있어야 찾는 규칙이면 쓸 수 없다.
  await mountForm(page, `<form><label for="p">예약 목적</label><input id="p" value="" /></form>`);

  expect(await findId(page)).toBe("p");
});

test("textarea 도 목적 칸이 될 수 있다", async ({ page }) => {
  await mountForm(
    page,
    `<form><label for="p">이용 목적</label><textarea id="p"></textarea></form>`,
  );

  expect(await findId(page)).toBe("p");
});

test("목적 칸이 없으면 아무것도 고르지 않는다", async ({ page }) => {
  // 엉뚱한 칸에 목적을 적으면 예약 정보가 망가진다.
  await mountForm(
    page,
    `<form>
      <label for="n">예약자</label><input id="n" />
      <label for="d">날짜</label><input id="d" type="date" />
    </form>`,
  );

  expect(await findId(page)).toBeNull();
});

test("읽기 전용·비활성 칸은 고르지 않는다", async ({ page }) => {
  // 채울 수 없는 칸을 골라 두면 조용히 실패한다.
  await mountForm(
    page,
    `<form>
      <label for="a">사용 목적</label><input id="a" readonly />
      <label for="b">사용 목적</label><input id="b" disabled />
    </form>`,
  );

  expect(await findId(page)).toBeNull();
});

test("빈 칸을 채운다", async ({ page }) => {
  await mountForm(page, `<form><label for="p">사용 목적</label><input id="p" /></form>`);

  const filled = await page.evaluate(() => window.__zzkTestApi.purposeField.fill("팀 회의"));

  expect(filled).toBe(true);
  await expect(page.locator("#p")).toHaveValue("팀 회의");
});

test("이미 적혀 있으면 덮어쓰지 않는다", async ({ page }) => {
  // 이 스펙이 이 파일에서 가장 중요하다. 사용자가 쓴 것을 자동 입력이 지우면
  // 의도하지 않은 목적으로 예약이 만들어진다.
  await mountForm(
    page,
    `<form><label for="p">사용 목적</label><input id="p" value="직접 적은 목적" /></form>`,
  );

  const filled = await page.evaluate(() => window.__zzkTestApi.purposeField.fill("팀 회의"));

  expect(filled).toBe(false);
  await expect(page.locator("#p")).toHaveValue("직접 적은 목적");
});

test("채울 문구가 없으면 아무것도 하지 않는다", async ({ page }) => {
  await mountForm(page, `<form><label for="p">사용 목적</label><input id="p" /></form>`);

  const filled = await page.evaluate(() => window.__zzkTestApi.purposeField.fill("   "));

  expect(filled).toBe(false);
  await expect(page.locator("#p")).toHaveValue("");
});

test("타임블록 선택이 목적까지 함께 채운다", async ({ page }) => {
  // 이 기능의 실제 흐름이다. /me 로 기억한 목적이 폼 반영 때 같이 들어간다.
  await mountForm(
    page,
    `<form>
      <label for="d">날짜</label><input id="d" name="date" type="date" value="2026-12-02" />
      <div><button type="button">수성</button></div>
      <label for="s">시작 시간</label>
      <select id="s"><option value="">선택</option><option value="09:30">09:30</option></select>
      <label for="u">이용 시간</label>
      <select id="u"><option value="1">30분</option><option value="2">60분</option></select>
      <label for="p">사용 목적</label><input id="p" type="text" />
    </form>`,
    {
      myReservations: [
        {
          id: 1,
          date: "2026-08-05",
          startTime: "16:30:00",
          endTime: "17:30:00",
          spaceId: 2,
          spaceName: "수성",
          floor: 11,
          purpose: "팀 회의",
        },
      ],
    },
  );

  await page.waitForFunction(
    () => window.__zzkTestApi?.settings?.get?.().recentPurposes?.length > 0,
    undefined,
    { timeout: 6000 },
  );

  await page.evaluate(() =>
    window.__zzkTestApi.syncLmsReservationForm({
      date: "2026-12-02",
      startTime: "09:30",
      endTime: "10:30",
      roomName: "수성",
    }),
  );

  await expect(page.locator("#p")).toHaveValue("팀 회의");
  // 나머지 칸도 함께 채워진다.
  await expect(page.locator("#s")).toHaveValue("09:30");
});
