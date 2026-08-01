import * as React from "react";

import { getRadarState, subscribeRadarState, type RadarState } from "./radar-store.js";

/**
 * 레이더 저장소를 React 에 잇는다.
 *
 * useSyncExternalStore 를 쓰는 이유: 저장소가 React 밖(content.js)에서도 갱신되기
 * 때문이다. useEffect + useState 로 구독하면 구독이 걸리기 전에 들어온 갱신을
 * 놓치고, 동시성 렌더링에서 값이 찢어질 수 있다.
 *
 * selector 로 필요한 조각만 고르면, 그 조각이 안 바뀐 리렌더는 건너뛴다.
 * (예: hover 만 바뀌었을 때 평면도 섹션까지 다시 그리지 않는다.)
 */
export function useRadarState<T>(selector: (state: RadarState) => T): T {
  // getSnapshot 이 매번 새 참조를 돌려주면 React 가 무한 루프로 본다.
  // selector 결과가 원시값이거나 저장소가 보관 중인 참조 그대로여야 한다.
  const getSnapshot = React.useCallback(() => selector(getRadarState()), [selector]);
  return React.useSyncExternalStore(subscribeRadarState, getSnapshot, getSnapshot);
}
