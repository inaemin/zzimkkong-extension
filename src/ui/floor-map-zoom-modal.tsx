import { createShadowMount, type ShadowMount } from "./mount.js";
import { FloorMapZoom } from "./components/floor-map-zoom.js";

// 기존 content.js 는 openFloorMapZoom(floor, dataUri) / closeFloorMapZoom() 를
// 부른다. 그 인터페이스를 유지한 채 내부만 React 로 바꾼다.
//
// 누르고 뗄 때마다 마운트를 만들고 부수면 첫 프레임이 늦어 깜빡인다.
// 마운트는 한 번 만들어 재사용하고, 열고 닫기는 렌더로만 처리한다.

const MOUNT_ID = "zzk-floormap-zoom-root";

let mount: ShadowMount | null = null;

function ensureMount(): ShadowMount {
  // SPA 가 body 하위를 갈아끼우면 마운트가 떨어져 나갈 수 있다. 그때는 새로 만든다.
  if (mount && mount.host.isConnected) {
    return mount;
  }
  mount = createShadowMount(MOUNT_ID);
  return mount;
}

export function openFloorMapZoom(floor: number, dataUri: string): void {
  if (!dataUri) {
    return;
  }
  ensureMount().render(<FloorMapZoom floor={floor} dataUri={dataUri} />);
}

export function closeFloorMapZoom(): void {
  // 마운트가 없으면 열린 적이 없다는 뜻이라 할 일이 없다.
  if (!mount || !mount.host.isConnected) {
    return;
  }
  mount.render(<FloorMapZoom floor={null} dataUri={null} />);
}

/** 테스트·정리용. 마운트 자체를 걷어낸다. */
export function destroyFloorMapZoom(): void {
  mount?.unmount();
  mount = null;
}
