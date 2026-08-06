import { createRoot, type Root } from "react-dom/client";

import { MAP_CALENDAR_OVERLAY_ID } from "../constants/runtime.js";
// shadow root 안에서는 preflight 를 포함한 Tailwind 전체를 넣어도 안전하다.
// 페이지로 새지 않으므로 lms+ 를 건드리지 않는다(페이지 주입 시절에는 preflight 를
// 빼야 했고, 그래서 버튼 배경·그림자 기본값을 손으로 채워야 했다).
import tailwindCss from "./styles.css?inline";
import { RADAR_OVERLAY_CSS } from "./radar-overlay-css.js";
import { bridgeHostTheme } from "./host-theme.js";
import { ShadowRootProvider } from "./shadow-root-context.js";

// 레이더 오버레이용 shadow root 마운트.
//
// createShadowMount 를 쓰지 않는다. 그쪽은 호스트를 전체 화면 컨테이너
// (position:fixed; inset:0)로 두고 안쪽에서 위치를 잡는데, 오버레이 CSS 는
// :host 자체가 위치를 갖는 카드라고 전제한다(right/bottom/max-height). 두 규칙이
// 서로 위치를 다투므로 오버레이에 맞는 마운트를 따로 둔다.
//
// 오버레이 엘리먼트는 id 를 유지한다. 드래그·리사이즈·자동 열기 등 명령형 코드가
// 아직 document.getElementById 로 이 요소를 찾는다.

interface OverlayMount {
  host: HTMLElement;
  container: HTMLElement;
  root: Root;
  stopThemeBridge: () => void;
}

let mount: OverlayMount | null = null;

function createMount(): OverlayMount {
  const host = document.createElement("section");
  host.id = MAP_CALENDAR_OVERLAY_ID;
  document.body.appendChild(host);

  const shadowRoot = host.attachShadow({ mode: "open" });

  const tailwindStyle = document.createElement("style");
  tailwindStyle.textContent = tailwindCss;
  shadowRoot.appendChild(tailwindStyle);

  // 오버레이 CSS 가 뒤에 와야 Tailwind 기본값을 이긴다.
  const style = document.createElement("style");
  style.textContent = RADAR_OVERLAY_CSS;
  shadowRoot.appendChild(style);

  // 컴포넌트 트리를 감쌀 컨테이너. :host 가 flex 라 자식이 늘어나지 않도록
  // 자신도 같은 방향으로 편다.
  const container = document.createElement("div");
  container.style.display = "contents";
  shadowRoot.appendChild(container);

  return {
    host,
    container,
    root: createRoot(container),
    stopThemeBridge: bridgeHostTheme(host),
  };
}

/**
 * 오버레이 shadow root 를 만들어(또는 재사용해) 돌려준다.
 *
 * SPA 가 body 를 갈아끼워 호스트가 떨어져 나가면 새로 만든다.
 */
export function ensureRadarOverlayMount(): OverlayMount {
  if (mount && mount.host.isConnected) {
    return mount;
  }
  if (mount) {
    mount.stopThemeBridge();
    mount.root.unmount();
  }
  mount = createMount();
  return mount;
}

/** 오버레이 안에 컴포넌트를 그린다. 포털도 이 shadow root 안에 갇힌다. */
export function renderRadarOverlay(node: React.ReactNode): HTMLElement {
  const current = ensureRadarOverlayMount();
  current.root.render(
    <ShadowRootProvider container={current.container}>{node}</ShadowRootProvider>,
  );
  return current.host;
}

export function unmountRadarOverlay(): void {
  if (!mount) {
    return;
  }
  mount.stopThemeBridge();
  mount.root.unmount();
  mount.host.remove();
  mount = null;
}

/** 명령형 코드가 아직 오버레이 엘리먼트를 직접 찾는다. */
export function getRadarOverlayHost(): HTMLElement | null {
  return mount && mount.host.isConnected ? mount.host : null;
}

/**
 * 오버레이 안에서 요소를 찾는다.
 *
 * 오버레이가 shadow root 로 들어가면서 overlay.querySelector 로는 자식을 찾을 수
 * 없게 됐다(호스트 엘리먼트에는 자식이 없다). 명령형 코드가 아직 폭 적용·스크롤
 * 동기화 등에 이 조회를 쓰므로 통로를 열어둔다.
 */
export function queryRadarOverlay<T extends Element = HTMLElement>(selector: string): T | null {
  return mount?.host.shadowRoot?.querySelector<T>(selector) ?? null;
}

export function queryAllRadarOverlay<T extends Element = HTMLElement>(selector: string): T[] {
  return [...(mount?.host.shadowRoot?.querySelectorAll<T>(selector) ?? [])];
}
