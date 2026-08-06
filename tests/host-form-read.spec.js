import { expect, test } from "@playwright/test";

import { mountReservationPage } from "./helpers/extension.js";

// 호스트(lms+) 예약 폼에서 값을 읽어오는 쪽.
//
// host-scan.spec.js 가 "어느 input 을 고를까"(점수 규칙)를 본다면, 여기는 고른
// 뒤에 "무엇을 읽어내는가"를 본다. Slack 모달에 채울 예약자·회의실·시간이
// 여기서 나오므로, 틀리면 엉뚱한 내용이 복사된다.
//
// 호스트 마크업은 우리가 못 바꾸고 예고 없이 바뀐다. 그래서 폼을 직접 만들어
// 넣고, 실제 lms+ 마크업에는 의존하지 않는다.

/** 폼을 심고 그 안에서 읽기 함수를 돌린다. */
async function readFrom(page, html, evaluate) {
  await page.evaluate((markup) => {
    const host = document.createElement("div");
    host.id = "host-form";
    host.innerHTML = markup;
    document.body.appendChild(host);
  }, html);
  return page.evaluate(evaluate);
}

test.beforeEach(async ({ page }) => {
  await mountReservationPage(page);
  await page.evaluate(() => {
    document.getElementById("host-form")?.remove();
  });
});

test.describe("readHostReservationTimeValues", () => {
  test("시작·종료 시각을 읽는다", async ({ page }) => {
    const values = await readFrom(
      page,
      `<input name="startTime" type="time" value="09:00" />
       <input name="endTime" type="time" value="10:30" />`,
      () => {
        const root = document.getElementById("host-form");
        return window.__zzkTestApi.readHostReservationTimeValues(root);
      },
    );

    expect(values.startTime).toBe("09:00");
    expect(values.endTime).toBe("10:30");
  });

  test("시각 입력이 아예 없으면 값이 비어 온다", async ({ page }) => {
    const values = await readFrom(page, `<input name="title" type="text" />`, () => {
      const root = document.getElementById("host-form");
      return window.__zzkTestApi.readHostReservationTimeValues(root);
    });

    expect(values.startTime).toBeFalsy();
    expect(values.endTime).toBeFalsy();
  });

  test("이름이 안 맞아도 time 입력 두 개면 짝으로 읽는다", async ({ page }) => {
    // 호스트가 name 을 바꿔도 화면에는 시각 입력 두 개가 남는다.
    // 이름으로 못 찾으면 순서대로 짝지어 읽는 fallback 이 있다.
    const values = await readFrom(
      page,
      `<input name="fld_a" type="time" value="13:00" />
       <input name="fld_b" type="time" value="15:00" />`,
      () => {
        const root = document.getElementById("host-form");
        return window.__zzkTestApi.readHostReservationTimeValues(root);
      },
    );

    expect(values.startTime).toBe("13:00");
    expect(values.endTime).toBe("15:00");
  });

  test("입력이 없으면 시각 선택 버튼에서 읽는다", async ({ page }) => {
    // lms+ 는 input 대신 버튼 + 팝오버를 쓰기도 한다. 마지막 fallback.
    const values = await readFrom(
      page,
      `<form>
         <button type="button" aria-label="시작시간">09:30</button>
         <button type="button" aria-label="종료시간">11:00</button>
       </form>`,
      () => {
        const root = document.getElementById("host-form");
        return window.__zzkTestApi.readHostReservationTimeValues(root);
      },
    );

    expect(values.startTime).toBe("09:30");
    expect(values.endTime).toBe("11:00");
  });

  test("시작만 채워져 있으면 종료는 비운다", async ({ page }) => {
    const values = await readFrom(
      page,
      `<input name="startTime" type="time" value="14:00" />
       <input name="endTime" type="time" value="" />`,
      () => {
        const root = document.getElementById("host-form");
        return window.__zzkTestApi.readHostReservationTimeValues(root);
      },
    );

    expect(values.startTime).toBe("14:00");
    expect(values.endTime).toBeFalsy();
  });
});

test.describe("readHostRoomName", () => {
  test("select 에서 고른 회의실 이름을 읽는다", async ({ page }) => {
    const name = await readFrom(
      page,
      `<select name="spaceId">
         <option value="1">금성</option>
         <option value="2" selected>보이저</option>
       </select>`,
      () => {
        const root = document.getElementById("host-form");
        return window.__zzkTestApi.readHostRoomName(root);
      },
    );

    expect(name).toContain("보이저");
  });

  test("층이 붙어 있어도 아는 방 이름만 뽑는다", async ({ page }) => {
    const name = await readFrom(
      page,
      `<select name="spaceId"><option selected>12층 디스커버리</option></select>`,
      () => {
        const root = document.getElementById("host-form");
        return window.__zzkTestApi.readHostRoomName(root);
      },
    );

    expect(name).toBe("디스커버리");
  });

  test("아는 이름이 아니면 원문을 그대로 돌려준다", async ({ page }) => {
    const name = await readFrom(
      page,
      `<select name="spaceId"><option selected>새로운회의실</option></select>`,
      () => {
        const root = document.getElementById("host-form");
        return window.__zzkTestApi.readHostRoomName(root);
      },
    );

    // 표에 없는 방도 lms+ 에는 존재할 수 있다. 여기서 버리지 않고 넘긴다
    // (Slack 문구를 만들 때 자리표시자인지 따로 걸러낸다).
    expect(name).toBe("새로운회의실");
  });
});

test.describe("readHostReservationOwnerName", () => {
  test("예약자명 라벨이 붙은 입력에서 이름을 읽는다", async ({ page }) => {
    const owner = await readFrom(
      page,
      `<label for="owner">예약자명</label>
       <input id="owner" name="reserverName" type="text" value="라텔" />`,
      () => {
        const root = document.getElementById("host-form");
        return window.__zzkTestApi.readHostReservationOwnerName(root);
      },
    );

    expect(owner).toBe("라텔");
  });

  test("예약자 입력이 없으면 비어 온다", async ({ page }) => {
    const owner = await readFrom(page, `<input name="title" type="text" value="회의" />`, () => {
      const root = document.getElementById("host-form");
      return window.__zzkTestApi.readHostReservationOwnerName(root);
    });

    expect(owner).toBeFalsy();
  });
});

test.describe("findHostTimePickerButton", () => {
  test("라벨이 맞는 시각 선택 버튼을 찾는다", async ({ page }) => {
    const found = await readFrom(
      page,
      `<button type="button" aria-label="시작 시간">09:00</button>
       <button type="button" aria-label="종료 시간">10:00</button>`,
      () => {
        const root = document.getElementById("host-form");
        const button = window.__zzkTestApi.findHostTimePickerButton("종료", root);
        return button ? button.getAttribute("aria-label") : null;
      },
    );

    expect(found).toBe("종료 시간");
  });

  test("맞는 버튼이 없으면 null", async ({ page }) => {
    const found = await readFrom(page, `<button type="button">저장</button>`, () => {
      const root = document.getElementById("host-form");
      return window.__zzkTestApi.findHostTimePickerButton("시작", root) === null;
    });

    expect(found).toBe(true);
  });
});

test.describe("findHostRoomDropdownButton", () => {
  test("공간 관련 라벨이 붙은 펼침 버튼을 고른다", async ({ page }) => {
    const found = await readFrom(
      page,
      `<form>
         <button type="button">저장</button>
         <button type="button" aria-expanded="false" aria-label="회의실 선택">보이저</button>
       </form>`,
      () => {
        const root = document.getElementById("host-form");
        const button = window.__zzkTestApi.findHostRoomDropdownButton(root);
        return button ? button.getAttribute("aria-label") : null;
      },
    );

    // aria-expanded(+16)와 '회의실'(+8) 둘 다 맞는 쪽이 이긴다.
    expect(found).toBe("회의실 선택");
  });

  test("라벨이 없어도 펼침 버튼(aria-expanded)을 우선한다", async ({ page }) => {
    // 호스트가 aria-label 을 안 주는 경우가 있다. 그때는 '펼쳐지는 버튼인가'
    // 하나만으로 골라야 한다 — 이 가점이 없으면 첫 버튼이 뽑힌다.
    const found = await readFrom(
      page,
      `<form>
         <button type="button" id="plain">저장</button>
         <button type="button" id="dropdown" aria-expanded="false">보이저</button>
       </form>`,
      () => {
        const root = document.getElementById("host-form");
        const button = window.__zzkTestApi.findHostRoomDropdownButton(root);
        return button ? button.id : null;
      },
    );

    expect(found).toBe("dropdown");
  });

  test("시간 선택 버튼은 회의실 드롭다운으로 오해하지 않는다", async ({ page }) => {
    const found = await readFrom(
      page,
      `<form>
         <button type="button" aria-expanded="false" aria-label="시작시간">09:00</button>
       </form>`,
      () => {
        const root = document.getElementById("host-form");
        const button = window.__zzkTestApi.findHostRoomDropdownButton(root);
        return button ? button.getAttribute("aria-label") : null;
      },
    );

    // 시작시간/종료시간은 -12 라 뽑히면 안 된다.
    expect(found).not.toBe("시작시간");
  });
});

test.describe("getHostReservationRoot", () => {
  test("날짜 입력이 없으면 document 를 그대로 준다", async ({ page }) => {
    const isDocument = await page.evaluate(
      () => window.__zzkTestApi.getHostReservationRoot() === document,
    );

    // 범위를 좁힐 근거가 없으면 문서 전체에서 찾는다.
    expect(isDocument).toBe(true);
  });

  test("날짜 입력이 있으면 그걸 감싼 범위로 좁힌다", async ({ page }) => {
    const narrowed = await readFrom(
      page,
      `<form id="real-form"><input name="date" type="date" value="2026-08-10" /></form>`,
      () => {
        const root = window.__zzkTestApi.getHostReservationRoot();
        return root !== document && root instanceof HTMLElement;
      },
    );

    expect(narrowed).toBe(true);
  });
});

// 회의실 드롭다운은 점수로 고르는 추측이라, 회의실이 아닌 드롭다운(예약자
// 선택 등)이 뽑힐 수 있다. 그 이름이 Slack 메시지의 "at ..." 자리에 들어가면
// 회의실 대신 사람 이름이 나간다.
test("회의실이 아닌 드롭다운은 회의실 이름으로 쓰지 않는다", async ({ page }) => {
  const name = await readFrom(
    page,
    `<form>
       <button type="button" aria-expanded="false" aria-label="예약자 선택">애니(민인애)</button>
     </form>`,
    () => window.__zzkTestApi.readHostRoomName(document.getElementById("host-form")),
  );

  // 아는 회의실 이름이 아니므로 비워야 한다.
  expect(name).toBeFalsy();
});

test("회의실 드롭다운이 함께 있으면 그쪽을 고른다", async ({ page }) => {
  const name = await readFrom(
    page,
    `<form>
       <button type="button" aria-expanded="false" aria-label="예약자 선택">애니(민인애)</button>
       <button type="button" aria-expanded="false" aria-label="회의실 선택">보이저</button>
     </form>`,
    () => window.__zzkTestApi.readHostRoomName(document.getElementById("host-form")),
  );

  expect(name).toBe("보이저");
});
