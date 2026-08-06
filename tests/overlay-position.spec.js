import { expect, test } from "@playwright/test";

import { clampOffsetWithinViewport, pointInRect } from "../src/features/radar/overlay-position.ts";

// 모달을 드래그해 옮길 때의 위치 계산.
//
// 드래그 자체는 DOM 이벤트지만 "어디로 옮길지"는 순수 계산이다. 뷰포트를
// 인자로 받게 바꿔서 브라우저 없이 경계를 확인할 수 있다.

const VIEWPORT = { width: 1000, height: 800 };
const RECT = { left: 100, top: 200, width: 300, height: 400 };
const ORIGIN = { x: 0, y: 0 };

test.describe("clampOffsetWithinViewport", () => {
  test("화면 안이면 이동한 만큼 그대로 옮긴다", () => {
    const offset = clampOffsetWithinViewport({
      startRect: RECT,
      baseOffset: ORIGIN,
      deltaX: 50,
      deltaY: 30,
      viewport: VIEWPORT,
    });
    expect(offset).toEqual({ x: 50, y: 30 });
  });

  test("왼쪽으로 너무 끌면 여백에서 멈춘다", () => {
    const offset = clampOffsetWithinViewport({
      startRect: RECT,
      baseOffset: ORIGIN,
      deltaX: -9999,
      deltaY: 0,
      viewport: VIEWPORT,
    });
    // left 100 → 8(여백)에서 멈추므로 -92 만큼만 옮겨진다.
    expect(offset.x).toBe(-92);
  });

  test("오른쪽으로 너무 끌면 화면 밖으로 안 나간다", () => {
    const offset = clampOffsetWithinViewport({
      startRect: RECT,
      baseOffset: ORIGIN,
      deltaX: 9999,
      deltaY: 0,
      viewport: VIEWPORT,
    });
    // maxLeft = 1000 - 300 - 8 = 692. left 100 에서 592 만큼.
    expect(offset.x).toBe(592);
  });

  test("위로 끌어도 상단 내비게이션을 가리지 않는다", () => {
    const offset = clampOffsetWithinViewport({
      startRect: RECT,
      baseOffset: ORIGIN,
      deltaX: 0,
      deltaY: -9999,
      viewport: VIEWPORT,
    });
    // DRAG_SAFE_TOP 아래로만 갈 수 있다 = 위로 올라간 거리가 제한된다.
    expect(offset.y).toBeGreaterThan(-RECT.top);
  });

  test("아래로 너무 끌면 화면 밖으로 안 나간다", () => {
    const offset = clampOffsetWithinViewport({
      startRect: RECT,
      baseOffset: ORIGIN,
      deltaX: 0,
      deltaY: 9999,
      viewport: VIEWPORT,
    });
    // maxTop = 800 - 400 - 8 = 392. top 200 에서 192 만큼.
    expect(offset.y).toBe(192);
  });

  test("이미 옮겨진 상태에서는 그 위에 더한다", () => {
    const offset = clampOffsetWithinViewport({
      startRect: RECT,
      baseOffset: { x: 10, y: 20 },
      deltaX: 5,
      deltaY: 5,
      viewport: VIEWPORT,
    });
    expect(offset).toEqual({ x: 15, y: 25 });
  });

  test("모달이 뷰포트보다 크면 여백 위치로 몰린다", () => {
    const offset = clampOffsetWithinViewport({
      startRect: { left: 0, top: 0, width: 2000, height: 2000 },
      baseOffset: ORIGIN,
      deltaX: 100,
      deltaY: 100,
      viewport: VIEWPORT,
    });
    // maxLeft/maxTop 이 최소값(여백)으로 접히므로 그 자리에 붙는다.
    expect(offset.x).toBe(8);
    expect(offset.y).toBeGreaterThan(0);
  });
});

test.describe("pointInRect", () => {
  const rect = { left: 10, right: 90, top: 20, bottom: 80 };

  test("안쪽이면 true", () => {
    expect(pointInRect(50, 50, rect)).toBe(true);
  });

  test("경계선 위도 안쪽으로 친다", () => {
    expect(pointInRect(10, 20, rect)).toBe(true);
    expect(pointInRect(90, 80, rect)).toBe(true);
  });

  test("바깥이면 false", () => {
    expect(pointInRect(9, 50, rect)).toBe(false);
    expect(pointInRect(50, 81, rect)).toBe(false);
  });
});
