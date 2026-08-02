import { createRoot, type Root } from "react-dom/client";

import { MAP_CALENDAR_LAUNCHER_ID, RADAR_LAUNCHER_Z_INDEX } from "../constants/runtime.js";
import tailwindCss from "./styles.css?inline";
import { ShadowRootProvider } from "./shadow-root-context.js";
import { RadarLauncher, type RadarLauncherProps } from "./components/radar-launcher.js";

// 런처는 오버레이 바깥(화면 오른쪽 아래)에 뜨므로 자체 shadow root 를 가진다.
//
// 예전에는 페이지에 그대로 붙이고 모든 스타일을 !important 로 박았다. 호스트 CSS
// 를 이기려는 방어였는데, 실제 lms+ 스타일시트를 재보니 이 버튼에 매칭되는
// 규칙이 하나도 없었다(전역 button 규칙 자체가 없다). shadow root 로 격리하면
// 그 방어가 통째로 필요 없어진다.

let host: HTMLElement | null = null;
let root: Root | null = null;

function ensureMount(): { host: HTMLElement; root: Root; container: HTMLElement } {
  if (host?.isConnected && root) {
    const container = host.shadowRoot?.lastElementChild as HTMLElement;
    return { host, root, container };
  }

  host = document.createElement("div");
  host.id = MAP_CALENDAR_LAUNCHER_ID;
  // 위치는 호스트가 잡는다. 버튼 자체는 shadow root 안에서 모양만 갖는다.
  host.style.position = "fixed";
  host.style.right = "24px";
  host.style.bottom = "24px";
  host.style.zIndex = String(RADAR_LAUNCHER_Z_INDEX);
  document.body.appendChild(host);

  const shadowRoot = host.attachShadow({ mode: "open" });

  const style = document.createElement("style");
  style.textContent = tailwindCss;
  shadowRoot.appendChild(style);

  const container = document.createElement("div");
  shadowRoot.appendChild(container);

  root = createRoot(container);
  return { host, root, container };
}

export function renderRadarLauncher(props: RadarLauncherProps): HTMLElement {
  const mount = ensureMount();
  mount.root.render(
    <ShadowRootProvider container={mount.container}>
      <RadarLauncher {...props} />
    </ShadowRootProvider>,
  );
  return mount.host;
}

export function removeRadarLauncher(): void {
  root?.unmount();
  host?.remove();
  root = null;
  host = null;
}

export function getRadarLauncherHost(): HTMLElement | null {
  return host?.isConnected ? host : null;
}
