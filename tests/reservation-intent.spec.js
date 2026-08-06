import { expect, test } from "@playwright/test";

import { mountReservationPage } from "./helpers/extension.js";

// 예약 시도 추적.
//
// 사용자가 lms+ 에서 "예약하기"를 누르면 그 순간의 폼 내용을 기억해 둔다.
// 잠시 뒤 네트워크 응답이 성공으로 오면 그 기억을 꺼내 Slack 모달을 채운다.
// 두 사건 사이를 잇는 게 pendingReservationAttempts 다.
//
// 기억이 없으면 모달이 빈 채로 뜨고, 안 지워지면 엉뚱한 예약 내용이 뜬다.

/** 호스트 예약 폼을 심는다. 클릭/제출로 의도를 감지하는 조건을 만족시킨다. */
async function installHostForm(page) {
  await page.evaluate(() => {
    document.getElementById("intent-form")?.remove();
    const form = document.createElement("form");
    form.id = "intent-form";
    form.innerHTML = `
      <input name="date" type="date" value="2026-08-10" />
      <input name="startTime" type="time" value="09:00" />
      <input name="endTime" type="time" value="10:00" />
      <select name="spaceId"><option value="2" selected>보이저</option></select>
      <label for="who">예약자명</label>
      <input id="who" name="reserverName" type="text" value="라텔" />
      <button type="submit">예약하기</button>`;
    document.body.appendChild(form);
    // 실제 제출은 페이지를 떠나므로 막는다. 캡처 단계 리스너는 이미 실행된 뒤다.
    form.addEventListener("submit", (event) => event.preventDefault());
  });
}

/** /api/spaces 응답 한 건. */
function buildSpace(id, name, floor) {
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
  };
}

test.beforeEach(async ({ page }) => {
  await mountReservationPage(page, {
    spaces: [buildSpace(1, "금성", 11), buildSpace(3, "보이저", 12)],
  });
});

test("예약 폼을 제출하면 그 시도를 기억한다", async ({ page }) => {
  await installHostForm(page);

  const before = await page.evaluate(
    () => window.__zzkTestApi.getStateSnapshot().pendingReservationAttemptCount,
  );
  await page.evaluate(() => {
    document.getElementById("intent-form").requestSubmit();
  });
  const after = await page.evaluate(() => window.__zzkTestApi.getStateSnapshot());

  expect(before).toBe(0);
  expect(after.pendingReservationAttemptCount).toBe(1);
  // 폼에서 읽어낸 내용이 함께 기억돼야 Slack 모달을 채울 수 있다.
  expect(after.lastReservationContext).not.toBeNull();
});

test("예약하기 버튼 클릭도 시도로 잡는다", async ({ page }) => {
  await installHostForm(page);

  await page.evaluate(() => {
    document.querySelector("#intent-form button[type=submit]").click();
  });

  const snapshot = await page.evaluate(() => window.__zzkTestApi.getStateSnapshot());
  expect(snapshot.pendingReservationAttemptCount).toBeGreaterThan(0);
});

test("예약과 무관한 폼은 무시한다", async ({ page }) => {
  await page.evaluate(() => {
    const form = document.createElement("form");
    form.id = "search-form";
    form.innerHTML = `<input name="q" type="text" /><button type="submit">검색</button>`;
    document.body.appendChild(form);
    form.addEventListener("submit", (event) => event.preventDefault());
    form.requestSubmit();
  });

  const snapshot = await page.evaluate(() => window.__zzkTestApi.getStateSnapshot());
  // 날짜/시간 입력이 없고 '예약' 글자도 없으면 건드리지 않는다.
  expect(snapshot.pendingReservationAttemptCount).toBe(0);
});

test("우리 확장 UI 안에서 누른 건 호스트 예약으로 치지 않는다", async ({ page }) => {
  await page.evaluate(() => {
    // 레이더 오버레이 안의 버튼은 호스트 폼이 아니다.
    const surface = document.createElement("div");
    surface.id = "zzk-map-calendar-overlay";
    surface.innerHTML = `<form><input name="date" type="date" />
      <button type="submit">예약하기</button></form>`;
    document.body.appendChild(surface);
    const form = surface.querySelector("form");
    form.addEventListener("submit", (event) => event.preventDefault());
    form.requestSubmit();
  });

  const snapshot = await page.evaluate(() => window.__zzkTestApi.getStateSnapshot());
  expect(snapshot.pendingReservationAttemptCount).toBe(0);
});

test("시도마다 다른 id 가 붙는다", async ({ page }) => {
  const ids = await page.evaluate(() => [
    window.__zzkTestApi.createReservationAttemptId(),
    window.__zzkTestApi.createReservationAttemptId(),
  ]);

  // 같은 밀리초에 두 번 눌러도 겹치면 안 된다(일련번호가 붙는 이유).
  expect(ids[0]).not.toBe(ids[1]);
});

test.describe("isMeaningfulSlackContextValue", () => {
  test("실제 값이면 참", async ({ page }) => {
    const results = await page.evaluate(() => [
      window.__zzkTestApi.isMeaningfulSlackContextValue("보이저"),
      window.__zzkTestApi.isMeaningfulSlackContextValue("스프린트 회의"),
    ]);
    expect(results).toEqual([true, true]);
  });

  test("빈 값과 자리표시자는 거짓", async ({ page }) => {
    // lms+ 는 미입력을 "-" 로 표시한다. 그대로 Slack 에 넣으면 안 된다.
    const results = await page.evaluate(() => [
      window.__zzkTestApi.isMeaningfulSlackContextValue(""),
      window.__zzkTestApi.isMeaningfulSlackContextValue("   "),
      window.__zzkTestApi.isMeaningfulSlackContextValue("-"),
      window.__zzkTestApi.isMeaningfulSlackContextValue(null),
    ]);
    expect(results).toEqual([false, false, false, false]);
  });
});

test.describe("getLatestKnownRooms", () => {
  test("탭별로 받아둔 회의실을 하나로 합친다", async ({ page }) => {
    // 회의실 탭과 페어룸 탭을 오가면 각각 따로 저장된다. Slack 모달은
    // 어느 탭이든 방 이름을 찾을 수 있어야 한다.
    const names = await page.evaluate(async () => {
      await window.__zzkTestApi.loadAndOpenRadar();
      return window.__zzkTestApi.getLatestKnownRooms().map((room) => room.name);
    });

    expect(names.length).toBeGreaterThan(0);
    // 중복 없이 합쳐진다(같은 방이 두 출처에 있어도 하나).
    expect(new Set(names).size).toBe(names.length);
  });
});
