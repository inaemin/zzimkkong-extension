import { createRoot, type Root } from "react-dom/client";

import { RadarHeader, type RadarHeaderProps } from "./components/radar-header.js";
import { ShadowRootProvider } from "./shadow-root-context.js";

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
  // 오버레이 shadow root 안에 별도 루트로 그리므로 컨텍스트가 이어지지 않는다.
  // 포털(달력·범례)이 shadow root 밖으로 새지 않도록 여기서도 감싼다.
  root.render(
    <ShadowRootProvider container={container}>
      <RadarHeader {...props} />
    </ShadowRootProvider>,
  );
}

export function unmountRadarHeader(): void {
  root?.unmount();
  root = null;
  mountedInto = null;
}
