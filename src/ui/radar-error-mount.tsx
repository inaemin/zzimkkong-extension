import { renderRadarOverlay } from "./radar-overlay-mount.js";
import { RadarError, type RadarErrorProps } from "./components/radar-error.js";

// 에러 화면도 정상 오버레이와 같은 shadow root 에 그린다. 같은 자리를 두 루트가
// 번갈아 쓰면 서로의 DOM 을 만나므로 마운트를 공유한다.
export function renderRadarError(props: RadarErrorProps): HTMLElement {
  return renderRadarOverlay(<RadarError {...props} />);
}
