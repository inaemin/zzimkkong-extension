import { createRoot, type Root } from "react-dom/client";

import { TooltipProvider } from "./components/ui/tooltip.js";
import { RadarGrid, type RadarGridProps } from "./components/radar-grid.js";

// 그리드용 React 루트.
//
// 헤더와 마찬가지로 별도 루트를 쓴다. 본문에는 아직 명령형인 평면도 섹션이
// 함께 붙으므로, 한 루트로 합치는 건 그것까지 컴포넌트가 된 뒤에 한다.

let root: Root | null = null;
let mountedInto: HTMLElement | null = null;

export function renderRadarGrid(container: HTMLElement, props: RadarGridProps): void {
  if (!root || mountedInto !== container || !container.isConnected) {
    if (root) {
      root.unmount();
    }
    root = createRoot(container);
    mountedInto = container;
  }
  root.render(
    // delay 기본값이 0 이라 hover 즉시 뜬다. 슬롯은 훑어보는 대상이라
    // 기다렸다 뜨면 정보를 못 읽는다.
    <TooltipProvider>
      <RadarGrid {...props} />
    </TooltipProvider>,
  );
}

export function unmountRadarGrid(): void {
  root?.unmount();
  root = null;
  mountedInto = null;
}
