import type * as React from "react";

import { Button } from "@/ui/components/ui/button";

// 스케줄을 못 불러왔을 때 오버레이 자리에 뜨는 화면.
//
// 껍데기(카드/헤더)는 정상 오버레이와 같은 클래스를 쓰되, 여기서는 탭도 본문도
// 없으므로 RadarShell 을 쓰지 않고 필요한 만큼만 그린다.

export interface RadarErrorProps {
  message: string;
  onRetry: () => void;
  onClose: () => void;
  /** 드래그 대상. content.js 의 bindDraggableHeader 가 잡는다. */
  headerRef?: React.Ref<HTMLDivElement>;
}

export function RadarError({ message, onRetry, onClose, headerRef }: RadarErrorProps) {
  // 카드 안의 입력이 페이지로 새지 않게 막는다(정상 오버레이와 같은 이유).
  const stop = (event: React.SyntheticEvent) => {
    event.stopPropagation();
  };

  return (
    <div className="zzk-map-calendar-shell">
      <div
        className="zzk-map-calendar-card"
        onPointerDown={stop}
        onMouseDown={stop}
        onMouseUp={stop}
        onClick={stop}
        onDoubleClick={stop}
        onTouchStart={stop}
        onTouchEnd={stop}
      >
        <div className="zzk-map-calendar-header" data-testid="radar-header" ref={headerRef}>
          <div className="zzk-map-calendar-title-controls">
            <strong>예약 현황</strong>
          </div>
          <div className="zzk-map-calendar-header-right">
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="h-7 px-2 text-xs"
              aria-label="레이더 닫기"
              onClick={onClose}
            >
              닫기
            </Button>
          </div>
        </div>

        <div className="zzk-map-calendar-body zzk-map-calendar-error-body">
          <div className="zzk-map-calendar-error">
            <p className="zzk-map-calendar-error-message" data-testid="radar-error-message">
              {message}
            </p>
            <Button
              type="button"
              variant="secondary"
              size="sm"
              className="zzk-map-calendar-error-retry"
              data-testid="radar-error-retry"
              onClick={onRetry}
            >
              다시 시도
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}
