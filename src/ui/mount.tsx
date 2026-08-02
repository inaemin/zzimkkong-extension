import * as React from "react";
import { createRoot, type Root } from "react-dom/client";

// ?inline 은 CSS 를 <link> 로 만들지 않고 문자열로 준다.
// shadow root 안에 넣어야 해서 파일이 아니라 문자열이 필요하다.
import { RADAR_MODAL_Z_INDEX } from "../constants/runtime.js";

import styleText from "./styles.css?inline";
import { bridgeHostTheme } from "./host-theme.js";
import { ShadowRootProvider } from "./shadow-root-context.js";

export interface ShadowMount {
  /** 페이지 body 에 붙는 컨테이너. 제거하면 마운트가 사라진다. */
  host: HTMLElement;
  shadowRoot: ShadowRoot;
  render: (node: React.ReactNode) => void;
  unmount: () => void;
}

/**
 * shadow root 를 만들고 그 안에 React 를 띄운다.
 *
 * 페이지 CSS 와 우리 CSS 가 서로 새지 않도록 격리하되, 호스트의 디자인 토큰만
 * 읽어와 :host 에 얹어 시각적으로 겉돌지 않게 한다.
 */
export function createShadowMount(hostId: string): ShadowMount {
  const existing = document.getElementById(hostId);
  existing?.remove();

  const host = document.createElement("div");
  host.id = hostId;
  // 컨테이너 자체는 레이아웃에 영향을 주지 않는다. 실제 위치는 안쪽에서 잡는다.
  host.style.position = "fixed";
  host.style.inset = "0";
  host.style.zIndex = String(RADAR_MODAL_Z_INDEX);
  // 컨테이너는 클릭을 통과시키고, 안쪽 실제 UI 만 이벤트를 받는다.
  host.style.pointerEvents = "none";
  document.body.appendChild(host);

  const shadowRoot = host.attachShadow({ mode: "open" });

  const style = document.createElement("style");
  style.textContent = styleText;
  shadowRoot.appendChild(style);

  const container = document.createElement("div");
  container.style.pointerEvents = "auto";
  shadowRoot.appendChild(container);

  const stopThemeBridge = bridgeHostTheme(host);
  let root: Root | null = createRoot(container);

  return {
    host,
    shadowRoot,
    render(node) {
      // Base UI 포털형 컴포넌트(Dialog/Popover)가 shadow root 밖으로 새지 않도록
      // container 를 컨텍스트로 내려보낸다.
      root?.render(<ShadowRootProvider container={container}>{node}</ShadowRootProvider>);
    },
    unmount() {
      stopThemeBridge();
      root?.unmount();
      root = null;
      host.remove();
    },
  };
}
