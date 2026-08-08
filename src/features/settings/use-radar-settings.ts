import * as React from "react";

import { getRadarSettings, subscribeRadarSettings } from "./store.js";
import type { RadarSettings } from "./shared.js";

/**
 * 설정을 구독하는 훅.
 *
 * useSyncExternalStore 를 쓴다. 스토어가 React 밖(명령형 코드도 같은 스토어를
 * 고친다)에 있어서, useState + useEffect 로 흉내 내면 첫 렌더와 구독 사이에
 * 값이 바뀌었을 때 놓친다.
 *
 * getRadarSettings 는 값이 바뀔 때만 새 객체를 만들므로 그대로 스냅샷이 된다.
 */
export function useRadarSettings(): RadarSettings {
  return React.useSyncExternalStore(subscribeRadarSettings, getRadarSettings, getRadarSettings);
}
