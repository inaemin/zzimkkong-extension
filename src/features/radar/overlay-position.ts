// 레이더 모달의 위치(드래그 오프셋) 계산과 저장.
//
// 드래그는 DOM 이벤트지만 "어디로 옮길지" 계산은 순수하다. 뷰포트 크기를
// 인자로 받아 window 의존을 끊었고, 그래서 브라우저 없이 검증할 수 있다.

import { DRAG_SAFE_TOP } from "../../constants/runtime.js";
import { getRadarSettings, updateRadarSettings } from "../settings/store.js";

/** 모달을 원래 자리에서 얼마나 옮겼는지. */
export interface OverlayOffset {
  x: number;
  y: number;
}

/** 화면 가장자리에서 띄울 최소 여백(px). */
const VIEWPORT_MARGIN = 8;

export function readStoredMapCalendarOffset(): OverlayOffset {
  // 값 검사·기본값은 설정 스토어가 한다.
  //
  // 복사해서 돌려준다. 캐시 안의 객체를 그대로 주면 드래그 계산이 그 자리에서
  // 값을 고칠 때 저장된 설정까지 조용히 따라 바뀐다.
  const { x, y } = getRadarSettings().overlayOffset;
  return { x, y };
}

export function persistMapCalendarOffset(offset: OverlayOffset): void {
  const x = Number(offset?.x);
  const y = Number(offset?.y);
  if (!Number.isFinite(x) || !Number.isFinite(y)) {
    return;
  }
  updateRadarSettings({ overlayOffset: { x, y } });
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
