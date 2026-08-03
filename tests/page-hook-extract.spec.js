import { expect, test } from "@playwright/test";

import {
  extractOwnerCandidateFromEntries,
  extractOwnerCandidateFromObject,
  extractReservationRequestContextFromEntries,
  extractReservationRequestContextFromObject,
  normalizeMethod,
  parseUrl,
} from "../src/page-hook/shared.ts";

// MAIN world 예약 훅의 본문 추출 로직. 브라우저가 필요 없어 함수만 직접 검증한다.
//
// 이 함수들은 지금까지 page-network-hook.spec.js 가 fetch/XHR 을 실제로 patch 한
// 뒤 결과로만 간접 확인했다. 그래서 하위 유틸의 경계 조건(중첩 깊이, 키 별칭,
// 자정 넘김 등)은 덮이지 않았다.
//
// 예약 감지가 조용히 멈추면 Slack 모달이 안 뜨는 것으로만 드러나서 원인을 찾기
// 어렵다. 구조를 바꾸기 전에 여기서 먼저 고정한다.

test.describe("extractOwnerCandidateFromEntries", () => {
  test("예약자 키를 찾아 값을 돌려준다", () => {
    expect(extractOwnerCandidateFromEntries([["reserverName", "아무개"]])).toBe("아무개");
  });

  test("예약자 키가 없으면 빈 문자열이다", () => {
    expect(extractOwnerCandidateFromEntries([["spaceId", "5"]])).toBe("");
  });

  test("앞선 항목이 비어 있으면 다음 항목을 본다", () => {
    expect(
      extractOwnerCandidateFromEntries([
        ["reserverName", "   "],
        ["userName", "아무개"],
      ]),
    ).toBe("아무개");
  });

  test("배열이 아니거나 비어 있으면 빈 문자열이다", () => {
    expect(extractOwnerCandidateFromEntries([])).toBe("");
    expect(extractOwnerCandidateFromEntries(null)).toBe("");
  });
});

test.describe("extractOwnerCandidateFromObject", () => {
  test("중첩된 객체 안에서도 찾는다", () => {
    expect(extractOwnerCandidateFromObject({ data: { reserverName: "아무개" } })).toBe("아무개");
  });

  test("배열 안의 객체도 훑는다", () => {
    expect(extractOwnerCandidateFromObject([{ reserverName: "아무개" }])).toBe("아무개");
  });

  test("너무 깊으면 포기한다 — 무한 재귀를 막는 장치다", () => {
    // depth > 3 에서 멈춘다. 5단계로 감싸면 못 찾아야 한다.
    const deep = { a: { b: { c: { d: { reserverName: "아무개" } } } } };
    expect(extractOwnerCandidateFromObject(deep)).toBe("");
  });

  test("객체가 아니면 빈 문자열이다", () => {
    expect(extractOwnerCandidateFromObject(null)).toBe("");
    expect(extractOwnerCandidateFromObject("아무개")).toBe("");
  });
});

test.describe("extractReservationRequestContextFromEntries", () => {
  test("날짜·시작·종료를 한 번에 모은다", () => {
    const context = extractReservationRequestContextFromEntries([
      ["date", "2026-08-03"],
      ["startDateTime", "2026-08-03T09:00:00"],
      ["endDateTime", "2026-08-03T10:00:00"],
    ]);

    expect(context.date).toBe("2026-08-03");
    expect(context.startTime).toBe("09:00");
    expect(context.endTime).toBe("10:00");
  });

  test("방 id 는 정수일 때만 담는다", () => {
    expect(extractReservationRequestContextFromEntries([["spaceId", "5"]]).roomId).toBe(5);
    // 정수로 못 읽으면 아무것도 안 담기고, 그러면 문맥 자체가 null 이 된다.
    expect(extractReservationRequestContextFromEntries([["spaceId", "abc"]])).toBeNull();
  });

  test("건질 게 하나도 없으면 문맥은 null 이다", () => {
    // finalizeReservationRequestContext 가 "값이 하나라도 있는지" 로 거른다.
    expect(
      extractReservationRequestContextFromEntries([
        ["date", "   "],
        ["description", ""],
      ]),
    ).toBeNull();
  });

  test("initialContext 를 이어받는다", () => {
    const context = extractReservationRequestContextFromEntries([["spaceId", "5"]], {
      date: "2026-08-03",
    });
    expect(context.date).toBe("2026-08-03");
    expect(context.roomId).toBe(5);
  });
});

test.describe("extractReservationRequestContextFromObject", () => {
  test("중첩 객체에서 모은다", () => {
    const context = extractReservationRequestContextFromObject({
      reservation: { date: "2026-08-03", spaceId: 5 },
    });
    expect(context.date).toBe("2026-08-03");
    expect(context.roomId).toBe(5);
  });

  test("깊이 제한을 넘으면 더 내려가지 않는다", () => {
    const deep = { a: { b: { c: { d: { e: { spaceId: 5 } } } } } };
    expect(extractReservationRequestContextFromObject(deep)?.roomId ?? null).toBeNull();
  });
});

test.describe("normalizeMethod", () => {
  test("대문자로 맞춘다", () => {
    expect(normalizeMethod("post")).toBe("POST");
    expect(normalizeMethod("Get")).toBe("GET");
  });

  test("값이 없으면 GET 이다", () => {
    expect(normalizeMethod(null)).toBe("GET");
    expect(normalizeMethod("")).toBe("GET");
  });
});

test.describe("parseUrl", () => {
  // parseUrl 은 상대 경로를 풀려고 location.href 를 base 로 쓴다. Node 에는
  // location 이 없어 절대 URL 도 throw → null 이 된다. 실제 동작(MAIN world)은
  // page-network-hook.spec.js 가 브라우저에서 검증한다.
  test("브라우저 밖에서는 location 이 없어 null 이다", () => {
    expect(parseUrl("https://example.com/api/space-reservations")).toBeNull();
  });

  test("파싱할 수 없으면 null 이다", () => {
    expect(parseUrl(null)).toBeNull();
    expect(parseUrl("")).toBeNull();
  });
});
