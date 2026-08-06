import * as React from "react";

import {
  MAP_CALENDAR_OVERLAY_TAB_MEETING_ID,
  MAP_CALENDAR_OVERLAY_TAB_PAIR_ID,
  MAP_CALENDAR_SPACE_TAB_MEETING,
  MAP_CALENDAR_SPACE_TAB_PAIR,
  type SpaceTab,
} from "@/constants/runtime";

// 레이더 오버레이의 껍데기. 공간 유형 탭 + 카드(헤더/본문 자리)까지만 담당하고,
// 안쪽 내용(헤더 컨트롤·슬롯 그리드·평면도)은 children 으로 받는다.
//
// 전환 중에는 children 이 아직 명령형으로 만들어진 DOM 이다. 그래서 이 컴포넌트는
// 자식 트리를 직접 그리지 않고 붙일 자리(bodyRef)만 내준다.

export interface RadarShellProps {
  spaceTab: SpaceTab;
  onSpaceTabChange: (tab: SpaceTab) => void;

  /** 드래그 대상이 되는 헤더. content.js 의 bindDraggableHeader 가 잡는다. */
  headerRef?: React.Ref<HTMLDivElement>;
  /** 너비 조절 손잡이. bindMapCalendarResizeHandle 이 잡는다. */
  resizeHandleRef?: React.Ref<HTMLDivElement>;
  /** 접힌 상태. 접히면 본문을 감추고 헤더만 남긴다(CSS 가 처리). */
  collapsed?: boolean;
  cardRef?: React.Ref<HTMLDivElement>;
  /**
   * 본문(.zzk-map-calendar-body). 아직 내용은 명령형으로 채워진다.
   *
   * 감싸는 div 를 하나 더 두면 안 된다. 카드 CSS 가 본문을 카드의 직계 flex
   * 자식으로 보고 높이를 배분해서, 중간에 래퍼가 끼면 라벨 pane 이 마지막 행까지
   * 닿지 못한다.
   */
  bodyRef?: React.Ref<HTMLDivElement>;
}

/**
 * 카드 안에서 일어난 입력이 페이지로 새지 않게 막는다.
 *
 * lms+ 는 바깥 클릭을 닫기 신호로 쓰는 곳이 있어서, 카드 안을 누른 것이
 * 페이지까지 올라가면 우리 UI 를 쓰는 도중에 페이지가 반응한다.
 */
const STOPPED_EVENTS = [
  "onPointerDown",
  "onMouseDown",
  "onMouseUp",
  "onClick",
  "onDoubleClick",
  "onTouchStart",
  "onTouchEnd",
] as const;

function useStopPropagationProps() {
  return React.useMemo(() => {
    const stop = (event: React.SyntheticEvent) => {
      event.stopPropagation();
    };
    return Object.fromEntries(STOPPED_EVENTS.map((name) => [name, stop])) as Record<
      (typeof STOPPED_EVENTS)[number],
      (event: React.SyntheticEvent) => void
    >;
  }, []);
}

export function RadarShell({
  spaceTab,
  onSpaceTabChange,
  headerRef,
  resizeHandleRef,
  collapsed = false,
  cardRef,
  bodyRef,
}: RadarShellProps) {
  const stopProps = useStopPropagationProps();
  const localCardRef = React.useRef<HTMLDivElement | null>(null);

  // wheel 은 passive 로 걸어야 스크롤이 끊기지 않는다. React 의 onWheel 은
  // passive 여부를 정할 수 없어서 직접 붙인다.
  React.useEffect(() => {
    const card = localCardRef.current;
    if (!card) {
      return;
    }
    const stop = (event: WheelEvent) => {
      event.stopPropagation();
    };
    card.addEventListener("wheel", stop, { passive: true });
    return () => {
      card.removeEventListener("wheel", stop);
    };
  }, []);

  // 카드는 wheel 핸들러 때문에 내부에서도 참조해야 해서, 밖에서 받은 ref 와 함께
  // 채운다.
  const setCardRef = (node: HTMLDivElement | null) => {
    localCardRef.current = node;
    if (typeof cardRef === "function") {
      cardRef(node);
      return;
    }
    if (cardRef) {
      cardRef.current = node;
    }
  };

  return (
    <div className="zzk-map-calendar-shell">
      <div className="zzk-map-calendar-space-tabs" role="tablist" aria-label="공간 유형 선택">
        <button
          type="button"
          id={MAP_CALENDAR_OVERLAY_TAB_MEETING_ID}
          className="zzk-map-calendar-space-tab"
          role="tab"
          aria-selected={spaceTab === MAP_CALENDAR_SPACE_TAB_MEETING}
          onClick={() => onSpaceTabChange(MAP_CALENDAR_SPACE_TAB_MEETING)}
        >
          회의실
        </button>
        <button
          type="button"
          id={MAP_CALENDAR_OVERLAY_TAB_PAIR_ID}
          className="zzk-map-calendar-space-tab"
          role="tab"
          aria-selected={spaceTab === MAP_CALENDAR_SPACE_TAB_PAIR}
          onClick={() => onSpaceTabChange(MAP_CALENDAR_SPACE_TAB_PAIR)}
        >
          페어룸
        </button>
      </div>

      <div
        className={collapsed ? "zzk-map-calendar-card collapsed" : "zzk-map-calendar-card"}
        data-testid="radar-card"
        ref={setCardRef}
        {...stopProps}
      >
        <div
          className="zzk-map-calendar-resize-handle"
          data-testid="radar-resize-handle"
          role="separator"
          aria-orientation="vertical"
          aria-label="레이더 너비 조절"
          ref={resizeHandleRef}
        />
        <div className="zzk-map-calendar-header" data-testid="radar-header" ref={headerRef} />
        <div className="zzk-map-calendar-body" data-testid="radar-body" ref={bodyRef} />
      </div>
    </div>
  );
}
