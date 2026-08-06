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

// 하드코딩된 방 메타데이터(TARGET_ROOM_METADATA)는 legacy 제거 후에도 lms+ 에서 계속 쓰인다.
// 창 태그·크루 제외·회의실 정렬 순서가 lms+ /api/spaces 응답 기준으로도 유지되는지 검증한다.



function buildSpace(id, name, floor, overrides = {}) {
  return {
    accessRole: "ALL",
    active: true,
    closeTime: "23:00:00",
    floor,
    id,
    maxReservationMinutes: 60,
    name,
    openTime: "07:00:00",
    reservationUnitMinutes: 30,
    ...overrides,
  };
}

async function mountRadar(page, spaces) {
  await page.addInitScript(() => {
    window.__ZZK_TEST_HOOKS__ = true;
  });

  // 실제 사이트는 미인증 요청을 로그인 페이지로 돌려보내므로 문서 응답을 고정한다.
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

  await page.route(`${API_ORIGIN}/api/**`, async (route) => {
    const url = new URL(route.request().url());
    const body = url.pathname === "/api/spaces" ? spaces : [];
    await route.fulfill({
      status: 200,
      headers: {
        // credentials: "include" 요청은 와일드카드 origin 을 허용하지 않는다.
        "access-control-allow-origin": WEB_ORIGIN,
        "access-control-allow-credentials": "true",
        "content-type": "application/json",
      },
      body: JSON.stringify(body),
    });
  });

  await page.goto(`${WEB_ORIGIN}/space-reservations`, { waitUntil: "domcontentloaded" });

  await loadContentBundle(page);
  await page.waitForSelector("#zzk-map-calendar-overlay .zzk-map-calendar-row", {
    timeout: 6000,
  });
}

async function readRoomLabels(page) {
  return await page.evaluate(() =>
    Array.from(
      document.querySelectorAll("#zzk-map-calendar-overlay .zzk-map-calendar-room-name"),
    ).map((node) => node.textContent || ""),
  );
}

test("창 태그가 붙은 회의실은 창 배지를 보여준다", async ({ page }) => {
  // 금성/보이저는 tags: ["window"], 수성/아폴로는 태그 없음.
  await mountRadar(page, [
    buildSpace(1, "금성", 11),
    buildSpace(2, "수성", 11),
    buildSpace(3, "보이저", 12),
    buildSpace(4, "아폴로", 12),
  ]);

  const snapshot = await page.evaluate(() => {
    const rows = Array.from(
      document.querySelectorAll("#zzk-map-calendar-overlay .zzk-map-calendar-room-name"),
    );
    return rows.map((node) => ({
      text: (node.textContent || "").replace(/\s+/g, ""),
      // 배지 글자는 CSS ::before 의 content: attr(data-label) 로 그려져
      // textContent 가 비어 있다. 따라서 data-label 을 읽는다.
      badges: Array.from(node.querySelectorAll(".zzk-room-tag-badge")).map(
        (badge) => badge.getAttribute("data-label") || "",
      ),
    }));
  });

  const byName = (name) => snapshot.find((row) => row.text.includes(name));

  expect(byName("금성")).toBeTruthy();
  expect(byName("수성")).toBeTruthy();

  // 창 태그가 있는 방에만 "창" 배지가 붙는다.
  expect(byName("금성").badges.join("")).toContain("창");
  expect(byName("보이저").badges.join("")).toContain("창");
  expect(byName("수성").badges.join("")).not.toContain("창");
  expect(byName("아폴로").badges.join("")).not.toContain("창");
});

test("active:false 인 방은 레이더에서 걸러진다", async ({ page }) => {
  // 크루가 예약할 수 없는 방은 서버가 아예 안 내려주거나 active:false 로 준다.
  // 확장에는 이름 기반 제외 목록이 없고, 이 필터가 유일한 방어선이다.
  await mountRadar(page, [
    buildSpace(9, "은하수", 13),
    buildSpace(100, "목성", 13, { active: false }),
    buildSpace(101, "천왕성", 13, { active: false }),
  ]);

  const roomLabels = await readRoomLabels(page);

  expect(roomLabels.some((label) => label.includes("은하수"))).toBeTruthy();
  expect(roomLabels.some((label) => label.includes("목성"))).toBeFalsy();
  expect(roomLabels.some((label) => label.includes("천왕성"))).toBeFalsy();
});

test("페어룸은 API 이름(페어룸 01)으로 메타데이터에 매칭돼 페어룸 탭으로 분류된다", async ({ page }) => {
  await mountRadar(page, [
    buildSpace(9, "은하수", 13),
    buildSpace(10, "페어룸 01", 13),
    buildSpace(16, "페어룸 07", 12),
  ]);

  // 기본 탭(회의실)에는 페어룸이 안 보인다.
  const meetingLabels = await readRoomLabels(page);
  expect(meetingLabels.some((label) => label.includes("은하수"))).toBeTruthy();
  expect(meetingLabels.some((label) => label.includes("페어룸"))).toBeFalsy();

  // 페어룸 탭으로 전환하면 페어룸만 보인다.
  await page.click("#zzk-map-calendar-overlay-tab-pair");
  await page.waitForTimeout(200);

  const pairLabels = await readRoomLabels(page);
  expect(pairLabels.some((label) => label.includes("페어룸 01"))).toBeTruthy();
  expect(pairLabels.some((label) => label.includes("페어룸 07"))).toBeTruthy();
  expect(pairLabels.some((label) => label.includes("은하수"))).toBeFalsy();
});

test("12층 회의실은 API 순서가 아니라 크루 기준 순서로 정렬된다", async ({ page }) => {
  // API 가 역순으로 내려줘도 메타데이터 순서(보이저>디스커버리>아폴로>허블)를 따라야 한다.
  const roomNamesInApiOrder = ["허블", "아폴로", "디스커버리", "보이저"];

  await mountRadar(
    page,
    roomNamesInApiOrder.map((name, index) => buildSpace(200 + index, name, 12)),
  );

  const roomLabels = await readRoomLabels(page);
  const normalizedRoomNames = roomLabels
    .map((label) => label.replace(/\s+/g, ""))
    .filter((label) => roomNamesInApiOrder.includes(label));

  expect(normalizedRoomNames).toEqual(["보이저", "디스커버리", "아폴로", "허블"]);
});

test("메타데이터에 없는 방도 spaces API 가 주면 그대로 보여준다", async ({ page }) => {
  await mountRadar(page, [
    buildSpace(1, "수성", 11),
    buildSpace(500, "새회의실", 11),
  ]);

  const roomLabels = await readRoomLabels(page);

  expect(roomLabels.some((label) => label.includes("수성"))).toBeTruthy();
  expect(roomLabels.some((label) => label.includes("새회의실"))).toBeTruthy();
});
