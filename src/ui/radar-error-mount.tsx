import { getRadarOverlayRoot } from "./radar-overlay-mount.js";
import { RadarError, type RadarErrorProps } from "./components/radar-error.js";

// 에러 화면도 정상 오버레이와 같은 엘리먼트(#zzk-map-calendar-overlay)에 그린다.
// 같은 자리를 두 루트가 번갈아 쓰면 React 가 서로의 DOM 을 만나므로, 오버레이
// 루트를 공유한다.
export function renderRadarError(container: HTMLElement, props: RadarErrorProps): void {
  getRadarOverlayRoot(container).render(<RadarError {...props} />);
}
