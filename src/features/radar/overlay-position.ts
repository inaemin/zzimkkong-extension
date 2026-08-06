// 레이더 모달의 위치(드래그 오프셋) 계산과 저장.
//
// 드래그는 DOM 이벤트지만 "어디로 옮길지" 계산은 순수하다. 뷰포트 크기를
// 인자로 받아 window 의존을 끊었고, 그래서 브라우저 없이 검증할 수 있다.

import { DRAG_SAFE_TOP, MAP_CALENDAR_OFFSET_STORAGE_KEY } from "../../constants/runtime.js";
import { readStoredText, writeStoredText } from "../../utils/storage.js";

/** 모달을 원래 자리에서 얼마나 옮겼는지. */
export interface OverlayOffset {
  x: number;
  y: number;
}

/** 화면 가장자리에서 띄울 최소 여백(px). */
const VIEWPORT_MARGIN = 8;

const ORIGIN: OverlayOffset = { x: 0, y: 0 };

export function readStoredMapCalendarOffset(): OverlayOffset {
  const raw = readStoredText(MAP_CALENDAR_OFFSET_STORAGE_KEY, "");
  if (!raw) {
    return ORIGIN;
  }

  try {
    const parsed: unknown = JSON.parse(raw);
    const { x, y } = parsed as { x?: unknown; y?: unknown };
    return Number.isFinite(Number(x)) && Number.isFinite(Number(y))
      ? { x: Number(x), y: Number(y) }
      : ORIGIN;
  } catch {
    // 저장된 값이 깨졌으면 기본 위치를 쓴다.
    return ORIGIN;
  }
}

export function persistMapCalendarOffset(offset: OverlayOffset): void {
  const x = Number(offset?.x);
  const y = Number(offset?.y);
  if (!Number.isFinite(x) || !Number.isFinite(y)) {
    return;
  }
  writeStoredText(MAP_CALENDAR_OFFSET_STORAGE_KEY, JSON.stringify({ x, y }));
}

export function pointInRect(
  x: number,
  y: number,
  rect: { left: number; right: number; top: number; bottom: number },
): boolean {
  return x >= rect.left && x <= rect.right && y >= rect.top && y <= rect.bottom;
}

export interface ClampInput {
  startRect: { left: number; top: number; width: number; height: number };
  baseOffset: OverlayOffset;
  deltaX: number;
  deltaY: number;
  /** 뷰포트 크기. window 를 직접 읽지 않고 받아서 검증 가능하게 한다. */
  viewport: { width: number; height: number };
}

/**
 * 드래그 결과가 화면을 벗어나지 않도록 잡아준다.
 *
 * 위쪽은 DRAG_SAFE_TOP 아래로만 갈 수 있다 — 호스트 페이지 상단 내비게이션을
 * 가리면 사용자가 페이지를 못 쓰게 된다.
 */
export function clampOffsetWithinViewport({
  startRect,
  baseOffset,
  deltaX,
  deltaY,
  viewport,
}: ClampInput): OverlayOffset {
  const maxLeft = Math.max(VIEWPORT_MARGIN, viewport.width - startRect.width - VIEWPORT_MARGIN);
  const minTop = Math.max(VIEWPORT_MARGIN, DRAG_SAFE_TOP);
  const maxTop = Math.max(minTop, viewport.height - startRect.height - VIEWPORT_MARGIN);

  const clampedLeft = Math.min(maxLeft, Math.max(VIEWPORT_MARGIN, startRect.left + deltaX));
  const clampedTop = Math.min(maxTop, Math.max(minTop, startRect.top + deltaY));

  return {
    x: baseOffset.x + (clampedLeft - startRect.left),
    y: baseOffset.y + (clampedTop - startRect.top),
  };
}
