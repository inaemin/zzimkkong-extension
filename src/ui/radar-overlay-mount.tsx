import { createRoot, type Root } from "react-dom/client";

// 레이더 오버레이용 React 마운트.
//
// Slack 모달·평면도 확대와 달리 shadow root 를 쓰지 않는다. 오버레이 CSS 는
// 페이지에 주입돼 #zzk-map-calendar-overlay 로 스코프된 약 800줄이라, shadow root
// 안으로 옮기면 그 CSS 가 통째로 안 닿는다. 스타일까지 Tailwind 로 옮기는 건
// 이번 단계의 범위가 아니므로, 기존 오버레이 엘리먼트에 그대로 렌더한다.
//
// (오버레이 내용을 전부 컴포넌트로 옮기고 나면 그때 shadow root + Tailwind 로
// 함께 넘어간다.)

let root: Root | null = null;
let mountedInto: HTMLElement | null = null;

/**
 * 주어진 엘리먼트에 React 루트를 붙인다(이미 있으면 재사용).
 *
 * SPA 가 body 를 갈아끼워 오버레이가 새로 만들어지면 대상 엘리먼트가 바뀐다.
 * 그때는 이전 루트를 버리고 새로 만든다.
 */
export function getRadarOverlayRoot(container: HTMLElement): Root {
  if (root && mountedInto === container && container.isConnected) {
    return root;
  }
  if (root) {
    // 같은 엘리먼트에 두 번 createRoot 하면 React 가 경고하고 상태가 꼬인다.
    root.unmount();
  }
  root = createRoot(container);
  mountedInto = container;
  return root;
}

export function unmountRadarOverlayRoot(): void {
  root?.unmount();
  root = null;
  mountedInto = null;
}
