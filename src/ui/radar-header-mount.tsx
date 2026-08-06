import { createRoot, type Root } from "react-dom/client";

import { RadarHeader, type RadarHeaderProps } from "./components/radar-header.js";

// 헤더용 React 루트.
//
// 껍데기(RadarShell)와 별도 루트를 쓴다. 껍데기가 헤더를 children 으로 받으면
// 한 루트로 끝나지만, 그러려면 본문(아직 명령형)까지 같은 렌더 트리에 들어와야
// 한다. 본문이 컴포넌트가 되는 시점에 두 루트를 하나로 합친다.

let root: Root | null = null;
let mountedInto: HTMLElement | null = null;

export function renderRadarHeader(container: HTMLElement, props: RadarHeaderProps): void {
  if (!root || mountedInto !== container || !container.isConnected) {
    if (root) {
      root.unmount();
    }
    root = createRoot(container);
    mountedInto = container;
  }
  root.render(<RadarHeader {...props} />);
}

export function unmountRadarHeader(): void {
  root?.unmount();
  root = null;
  mountedInto = null;
}
