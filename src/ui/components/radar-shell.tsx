import * as React from "react";

// 레이더 오버레이의 껍데기. 카드를 그리고, 헤더와 본문은
// 자식 노드로 받아 같은 렌더 트리에 담는다.
//
// 예전에는 헤더·그리드가 각자 createRoot 를 잡고 ref 로 받은 자리에 따로
// 그렸다. 본문에 명령형 DOM 이 남아 있던 시절의 구조인데, 그게 전부 컴포넌트가
// 된 뒤로도 남아 있었다. 지금은 루트 하나로 그린다.

export interface RadarShellProps {
  /** 드래그 대상이 되는 헤더. content.js 의 bindDraggableHeader 가 잡는다. */
  headerRef?: React.Ref<HTMLDivElement>;
  /** 너비 조절 손잡이. bindMapCalendarResizeHandle 이 잡는다. */
  resizeHandleRef?: React.Ref<HTMLDivElement>;
  /** 접힌 상태. 접히면 본문을 감추고 헤더만 남긴다(CSS 가 처리). */
  collapsed?: boolean;
  cardRef?: React.Ref<HTMLDivElement>;
  /** 헤더 안에 그릴 내용(날짜 컨트롤 등). */
  header?: React.ReactNode;
  /**
   * 본문 안에 그릴 내용(슬롯 그리드·평면도).
   *
   * 감싸는 div 를 하나 더 두면 안 된다. 카드 CSS 가 본문을 카드의 직계 flex
   * 자식으로 보고 높이를 배분해서, 중간에 래퍼가 끼면 라벨 pane 이 마지막 행까지
   * 닿지 못한다.
   */
  body?: React.ReactNode;
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
  headerRef,
  resizeHandleRef,
  collapsed = false,
  cardRef,
  header,
  body,
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
        <div className="zzk-map-calendar-header" data-testid="radar-header" ref={headerRef}>
          {header}
        </div>
        <div className="zzk-map-calendar-body" data-testid="radar-body">
          {body}
        </div>
      </div>
    </div>
  );
}
