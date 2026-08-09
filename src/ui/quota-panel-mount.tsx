import { createRoot, type Root } from "react-dom/client";

import tailwindCss from "./styles.css?inline";
import { bridgeHostTheme } from "./host-theme.js";
import { ShadowRootProvider } from "./shadow-root-context.js";

// 호스트의 "남은 시간" 요약 블록 자리에 우리 패널을 끼운다.
//
// 다른 마운트(오버레이·런처·모달)와 달리 페이지 흐름 안에 들어간다. 그래서
// position 을 잡지 않고, 호스트 블록 바로 뒤에 형제로 붙는다.
//
// 호스트 블록은 지우지 않고 감춘다. 페이지가 그 노드를 참조하고 있을 수 있고,
// 우리가 물러날 때(설정 끄기·값 없음) 그대로 되돌려 놓아야 한다.

const HOST_ID = "zzk-quota-panel";
/** 감춘 호스트 블록에 남기는 표식. 되돌릴 때 찾는다. */
const HIDDEN_ATTR = "data-zzk-quota-hidden";

interface PanelMount {
  host: HTMLElement;
  container: HTMLElement;
  root: Root;
  stopThemeBridge: () => void;
  /** 우리가 감춘 호스트 블록. */
  hiddenPanel: HTMLElement;
}

let mount: PanelMount | null = null;

function hideHostPanel(panel: HTMLElement): void {
  if (panel.hasAttribute(HIDDEN_ATTR)) {
    return;
  }
  // 원래 display 를 적어 두고 감춘다. 되돌릴 때 그대로 쓴다.
  panel.setAttribute(HIDDEN_ATTR, panel.style.display || "");
  panel.style.display = "none";
}

function restoreHostPanel(panel: HTMLElement): void {
  if (!panel.hasAttribute(HIDDEN_ATTR)) {
    return;
  }
  panel.style.display = panel.getAttribute(HIDDEN_ATTR) || "";
  panel.removeAttribute(HIDDEN_ATTR);
}

function createMount(hostPanel: HTMLElement): PanelMount {
  const host = document.createElement("div");
  host.id = HOST_ID;

  // 자리만 물려받는 게 아니라 "폭"도 물려받아야 한다.
  //
  // 호스트 블록이 flex 자식이면 우리 div 는 내용만큼만 줄어든다. 그러면 막대가
  // 짧아지고, 값이 들어갈 자리가 모자라 라벨과 값이 두 줄로 갈라진다.
  //
  // 다만 100% 를 다 쓰면 넓은 화면에서 한도 표시가 페이지를 가로지른다. 줄바꿈을
  // 막을 만큼은 넓히되 상한을 둔다.
  // 폭을 숫자로 못 박지 않는다.
  //
  // 처음에는 "몇 % / 몇 rem" 을 손으로 정했는데, 값이 길어질 때마다(예약 후
  // 잔여가 붙는 등) 줄바꿈이 나서 하한을 계속 키웠고, 결국 그 하한이 상한을
  // 넘어서 패널이 화면을 가로질렀다.
  //
  // 대신 내용이 스스로 필요한 폭을 말하게 한다. fit-content 는 "한 줄로 담는 데
  // 필요한 만큼만" 잡으므로, 값이 길어지면 그만큼만 늘고 짧아지면 도로 줄어든다.
  host.style.flex = "0 1 auto";
  host.style.width = "fit-content";
  // 부모보다 커지지는 않는다(가로 스크롤 방지).
  host.style.maxWidth = "100%";

  // 호스트 블록이 있던 자리를 그대로 차지한다.
  hostPanel.insertAdjacentElement("afterend", host);

  const shadowRoot = host.attachShadow({ mode: "open" });

  const style = document.createElement("style");
  style.textContent = tailwindCss;
  shadowRoot.appendChild(style);

  const container = document.createElement("div");
  shadowRoot.appendChild(container);

  hideHostPanel(hostPanel);

  return {
    host,
    container,
    root: createRoot(container),
    stopThemeBridge: bridgeHostTheme(host),
    hiddenPanel: hostPanel,
  };
}

/**
 * 호스트 블록 자리에 패널을 그린다.
 *
 * 호스트가 다시 그려 우리 마운트가 떨어져 나가면 새로 만든다. 대상 블록이
 * 바뀐 경우에도 마찬가지다.
 */
export function renderQuotaPanel(hostPanel: HTMLElement, node: React.ReactNode): void {
  if (mount && (!mount.host.isConnected || mount.hiddenPanel !== hostPanel)) {
    removeQuotaPanel();
  }

  mount ??= createMount(hostPanel);
  // 호스트가 다시 그리면서 display 를 되살렸을 수 있다.
  hideHostPanel(mount.hiddenPanel);
  mount.root.render(<ShadowRootProvider container={mount.container}>{node}</ShadowRootProvider>);
}

/** 패널을 걷고 호스트 블록을 되살린다. */
export function removeQuotaPanel(): void {
  if (!mount) {
    return;
  }
  mount.stopThemeBridge();
  mount.root.unmount();
  restoreHostPanel(mount.hiddenPanel);
  mount.host.remove();
  mount = null;
}

export function getQuotaPanelHost(): HTMLElement | null {
  return mount?.host.isConnected ? mount.host : null;
}
