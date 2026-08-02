import { expect, test } from "@playwright/test";

import {
  addDaysToDateString,
  formatDateSelectorText,
  getEarliestSelectableMinuteForDate,
  isDateString,
  minuteToHourMinute,
  normalizeHourMinute,
  parseHourMinute,
} from "../src/utils/date-time.ts";

// 날짜·시각 유틸. 브라우저가 필요 없어 함수만 직접 검증한다.
//
// 레이더가 이 함수들 위에 서 있다 — 슬롯 경계, 날짜 이동, 최소 선택 시각이
// 전부 여기서 나온다. 잘못된 입력을 어떻게 다루는지가 특히 중요하다.

test.describe("parseHourMinute", () => {
  test('"HH:MM" 을 분으로 바꾼다', () => {
    expect(parseHourMinute("00:00")).toBe(0);
    expect(parseHourMinute("07:30")).toBe(450);
    expect(parseHourMinute("23:59")).toBe(1439);
  });

  test("형식이 맞지 않으면 null 이다", () => {
    // 한 자리 시각, 초 포함, 빈 값 등은 받지 않는다.
    expect(parseHourMinute("7:30")).toBeNull();
    expect(parseHourMinute("07:30:00")).toBeNull();
    expect(parseHourMinute("")).toBeNull();
    expect(parseHourMinute(null)).toBeNull();
    expect(parseHourMinute(730)).toBeNull();
  });

  test("범위를 벗어난 값은 null 이다", () => {
    expect(parseHourMinute("24:00")).toBeNull();
    expect(parseHourMinute("12:60")).toBeNull();
  });
});

test.describe("minuteToHourMinute", () => {
  test("분을 'HH:MM' 으로 바꾼다", () => {
    expect(minuteToHourMinute(0)).toBe("00:00");
    expect(minuteToHourMinute(450)).toBe("07:30");
    expect(minuteToHourMinute(1439)).toBe("23:59");
  });

  test("하루를 넘거나 음수여도 하루 안으로 돌린다", () => {
    expect(minuteToHourMinute(1440)).toBe("00:00");
    expect(minuteToHourMinute(1500)).toBe("01:00");
    expect(minuteToHourMinute(-30)).toBe("23:30");
  });

  test("숫자가 아니면 00:00 이다", () => {
    expect(minuteToHourMinute(Number.NaN)).toBe("00:00");
    expect(minuteToHourMinute(Number.POSITIVE_INFINITY)).toBe("00:00");
  });

  test("parseHourMinute 와 왕복한다", () => {
    for (const label of ["00:00", "07:30", "12:00", "23:59"]) {
      expect(minuteToHourMinute(parseHourMinute(label))).toBe(label);
    }
  });
});

test.describe("isDateString", () => {
  test('"YYYY-MM-DD" 만 통과시킨다', () => {
    expect(isDateString("2026-08-02")).toBe(true);
    expect(isDateString("2026-8-2")).toBe(false);
    expect(isDateString("20260802")).toBe(false);
    expect(isDateString("")).toBe(false);
    expect(isDateString(null)).toBe(false);
  });
});

test.describe("addDaysToDateString", () => {
  test("하루씩 앞뒤로 옮긴다", () => {
    expect(addDaysToDateString("2026-08-02", 1)).toBe("2026-08-03");
    expect(addDaysToDateString("2026-08-02", -1)).toBe("2026-08-01");
    expect(addDaysToDateString("2026-08-02", 0)).toBe("2026-08-02");
  });

  test("달·해 경계를 넘는다", () => {
    expect(addDaysToDateString("2026-08-31", 1)).toBe("2026-09-01");
    expect(addDaysToDateString("2026-01-01", -1)).toBe("2025-12-31");
  });

  test("윤년 2월을 올바르게 넘는다", () => {
    // 2028 은 윤년이라 2/29 가 있다.
    expect(addDaysToDateString("2028-02-28", 1)).toBe("2028-02-29");
    // 2026 은 평년.
    expect(addDaysToDateString("2026-02-28", 1)).toBe("2026-03-01");
  });

  test("입력이 이상하면 그대로 돌려준다", () => {
    expect(addDaysToDateString("아무거나", 1)).toBe("아무거나");
    expect(addDaysToDateString("2026-08-02", 1.5)).toBe("2026-08-02");
  });
});

test.describe("getEarliestSelectableMinuteForDate", () => {
  test("지난 날짜는 하루 전체가 막힌다", () => {
    // 24*60 = 그날의 어떤 슬롯도 고를 수 없다는 뜻.
    const yesterday = addDaysToDateString(todayInKST(), -1);
    expect(getEarliestSelectableMinuteForDate(yesterday)).toBe(1440);
  });

  test("미래 날짜는 처음부터 고를 수 있다", () => {
    const tomorrow = addDaysToDateString(todayInKST(), 1);
    expect(getEarliestSelectableMinuteForDate(tomorrow)).toBe(0);
  });

  test("날짜 형식이 아니면 0 이다", () => {
    expect(getEarliestSelectableMinuteForDate("아무거나")).toBe(0);
    expect(getEarliestSelectableMinuteForDate(null)).toBe(0);
  });

  test("오늘은 0 과 하루 사이의 값이다", () => {
    const value = getEarliestSelectableMinuteForDate(todayInKST());
    expect(value).toBeGreaterThanOrEqual(0);
    expect(value).toBeLessThanOrEqual(1440);
  });
});

test.describe("normalizeHourMinute", () => {
  test("정상 값은 그대로 둔다", () => {
    expect(normalizeHourMinute("07:30")).toBe("07:30");
  });

  test("한글 표기도 알아듣는다", () => {
    // lms+ 폼이 "오후 3시 30분" 같은 표기를 쓰는 경우가 있다.
    expect(normalizeHourMinute("오후 3시 30분")).toBe("15:30");
  });

  test("해석할 수 없으면 null 이다", () => {
    // 반환 타입이 string 으로 선언돼 있지만 실제로는 null 을 준다.
    // 지금 동작을 그대로 기록해 둔다 — 고칠 때 이 테스트가 알려준다.
    expect(normalizeHourMinute("아무거나")).toBeNull();
    expect(normalizeHourMinute("")).toBeNull();
    expect(normalizeHourMinute(null)).toBeNull();
  });
});

test.describe("formatDateSelectorText", () => {
  test("요일까지 붙여 보여준다", () => {
    // 2026-08-02 는 일요일.
    expect(formatDateSelectorText("2026-08-02")).toContain("2026.08.02");
    expect(formatDateSelectorText("2026-08-02")).toContain("일");
  });

  test("날짜가 아니면 빈 문자열이다", () => {
    expect(formatDateSelectorText("아무거나")).toBe("");
  });
});

/** KST 기준 오늘. 테스트가 실행 시각 타임존에 흔들리지 않게 한다. */
function todayInKST() {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Seoul",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date());
}
