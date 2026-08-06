import { expect, test } from "@playwright/test";

import {
  buildMapCalendarTimelineGridLayout,
  computeMapCalendarCurrentTimeScrollLeft,
} from "../src/features/radar/timeline-layout.ts";

// 타임라인 그리드의 열 계산과 스크롤 위치.
//
// content.js 안에 있을 때는 브라우저를 띄워 렌더 결과로만 확인할 수 있었다.
// 모듈로 나온 지금은 경계 조건을 직접 넣어볼 수 있다.

/** 07:00 부터 30분 슬롯 count 개. */
function makeTimeline(count, startMinute = 7 * 60) {
  return Array.from({ length: count }, (_, index) => {
    const begin = startMinute + index * 30;
    return {
      startMinute: begin,
      endMinute: begin + 30,
      label: `${String(Math.floor(begin / 60)).padStart(2, "0")}:${String(begin % 60).padStart(2, "0")}`,
      isHourMark: begin % 60 === 0,
    };
  });
}

test.describe("buildMapCalendarTimelineGridLayout", () => {
  test("빈 타임라인은 빈 레이아웃이다", () => {
    const layout = buildMapCalendarTimelineGridLayout([], false);
    expect(layout.templateColumns).toBe("");
    expect(layout.slotColumnStarts).toEqual([]);
    expect(layout.trackWidth).toBe(0);
  });

  test("슬롯마다 시작 열이 하나씩 나온다", () => {
    const layout = buildMapCalendarTimelineGridLayout(makeTimeline(4), false);
    expect(layout.slotColumnStarts).toHaveLength(4);
    // 열 번호는 1-based 이고 뒤로 갈수록 커진다.
    expect(layout.slotColumnStarts[0]).toBeGreaterThan(0);
    for (let i = 1; i < layout.slotColumnStarts.length; i += 1) {
      expect(layout.slotColumnStarts[i]).toBeGreaterThan(layout.slotColumnStarts[i - 1]);
    }
  });

  test("첫 슬롯이 정시여도 경계선을 긋지 않는다", () => {
    // 회의실↔타임블록 세로 구분선과 겹쳐 이중선처럼 보이기 때문이다.
    const layout = buildMapCalendarTimelineGridLayout(makeTimeline(4), false);
    // 07:00(정시)로 시작하지만 첫 경계는 08:00 자리에만 생긴다.
    expect(layout.boundaryColumnStarts).toHaveLength(1);
  });

  test("중간 정시마다 경계선이 하나씩 늘어난다", () => {
    // 07:00~09:00 = 슬롯 4개, 그중 정시는 08:00 하나(07:00 은 첫 칸이라 제외).
    expect(buildMapCalendarTimelineGridLayout(makeTimeline(4), false).boundaryColumnStarts).toEqual(
      [expect.any(Number)],
    );
    // 슬롯 6개면 08:00·09:00 두 개.
    expect(
      buildMapCalendarTimelineGridLayout(makeTimeline(6), false).boundaryColumnStarts,
    ).toHaveLength(2);
  });

  test("마지막 경계를 요청하면 하나 더 붙는다", () => {
    const without = buildMapCalendarTimelineGridLayout(makeTimeline(4), false);
    const withTerminal = buildMapCalendarTimelineGridLayout(makeTimeline(4), true);
    expect(withTerminal.boundaryColumnStarts).toHaveLength(without.boundaryColumnStarts.length + 1);
    expect(withTerminal.trackWidth).toBeGreaterThan(without.trackWidth);
  });

  test("trackWidth 는 모든 열 폭의 합이다", () => {
    const layout = buildMapCalendarTimelineGridLayout(makeTimeline(5), false);
    const sum = layout.templateColumns
      .split(" ")
      .map((value) => Number(value.replace("px", "")))
      .reduce((total, width) => total + width, 0);
    expect(layout.trackWidth).toBe(sum);
  });
});

test.describe("computeMapCalendarCurrentTimeScrollLeft", () => {
  const base = {
    timeline: makeTimeline(12), // 07:00~13:00
    slotStride: 100,
    maxScrollLeft: 2000,
    isToday: true,
    currentMinute: 10 * 60, // 10:00
  };

  test("오늘이 아니면 계산하지 않는다", () => {
    expect(computeMapCalendarCurrentTimeScrollLeft({ ...base, isToday: false })).toBeNull();
  });

  test("스크롤할 여지가 없으면 null 이다", () => {
    expect(computeMapCalendarCurrentTimeScrollLeft({ ...base, maxScrollLeft: 0 })).toBeNull();
  });

  test("타임라인이 비어 있으면 null 이다", () => {
    expect(computeMapCalendarCurrentTimeScrollLeft({ ...base, timeline: [] })).toBeNull();
  });

  test("현재 시각이 타임라인 시작 이전이면 맨 처음이다", () => {
    // 새벽 4시. 07:00 로 끌어올려져 첫 칸을 가리킨다.
    expect(computeMapCalendarCurrentTimeScrollLeft({ ...base, currentMinute: 4 * 60 })).toBe(0);
  });

  test("현재 시각이 타임라인 끝을 넘으면 마지막 칸이다", () => {
    const scrollLeft = computeMapCalendarCurrentTimeScrollLeft({
      ...base,
      currentMinute: 23 * 60,
    });
    // 마지막 인덱스(11) × 100 = 1100. maxScrollLeft(2000)보다 작으므로 그대로.
    expect(scrollLeft).toBe(1100);
  });

  test("maxScrollLeft 를 넘지 않는다", () => {
    const scrollLeft = computeMapCalendarCurrentTimeScrollLeft({
      ...base,
      currentMinute: 23 * 60,
      maxScrollLeft: 300,
    });
    expect(scrollLeft).toBe(300);
  });

  test("현재 시각보다 조금 앞선 칸을 보여준다", () => {
    // 10:00 이면 그보다 lead 만큼 앞 칸이 왼쪽 끝에 온다.
    const scrollLeft = computeMapCalendarCurrentTimeScrollLeft(base);
    expect(scrollLeft).toBeGreaterThan(0);
    expect(scrollLeft % base.slotStride).toBe(0);
  });
});
