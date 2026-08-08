import { debugWarn, pushDebugEvent } from "../../utils/shared.js";

import {
  createDefaultRadarSettings,
  loadRadarSettings,
  normalizeRadarSettings,
  saveRadarSettings,
  withRecentPurpose,
  type RadarSettings,
} from "./shared.js";

// 설정 한 벌을 메모리에 들고, 바뀌면 구독자에게 알린다.
//
// 저장소를 매번 읽지 않는 이유: 읽기가 렌더 경로에 있어서(레이더를 그릴 때마다
// 여러 번 본다) JSON 파싱이 반복된다. 그리고 무엇보다, 저장소만 두면 "바뀌었다"를
// 알 방법이 없어 호출부가 직접 다시 그려야 한다.
//
// 모듈 수준 가변 상태를 쓴다. 설정은 페이지당 하나뿐이고, 이걸 인자로 넘기면
// 모든 호출부에 배선이 생긴다.

// eslint-disable-next-line no-restricted-syntax
let cached: RadarSettings | null = null;

const listeners = new Set<(settings: RadarSettings) => void>();

/** 지금 설정. 처음 부르면 저장소에서 읽어 온다(마이그레이션 포함). */
export function getRadarSettings(): RadarSettings {
  cached ??= loadRadarSettings();
  return cached;
}

/**
 * 구독자에게 알린다.
 *
 * 목록을 복사해서 돈다 — 리스너 안에서 구독하거나 해제하면(useSyncExternalStore 가
 * 언마운트 때 그렇게 한다) 순회 중에 Set 이 바뀐다.
 *
 * 리스너 하나가 던져도 나머지는 받아야 한다. 여기서 막지 않으면 설정은 저장됐는데
 * 화면 일부만 안 바뀌고, 예외가 스위치를 누른 쪽까지 올라간다.
 */
function notify(settings: RadarSettings): void {
  [...listeners].forEach((listener) => {
    try {
      listener(settings);
    } catch (error) {
      pushDebugEvent("settings", "listener-failed", { error: String(error) });
      debugWarn("settings", "listener-failed", { error: String(error) });
    }
  });
}

/**
 * 설정 일부를 바꾼다.
 *
 * 바뀐 값이 없으면 저장도 알림도 하지 않는다 — 같은 값으로 다시 그리는 걸 막는다.
 *
 * 캐시에 넣기 전에 정규화한다. 저장할 때만 정리하면 메모리에 있는 값과 저장된 값이
 * 갈려서, 새로고침 전까지 화면이 저장된 설정과 다르게 동작한다.
 */
export function updateRadarSettings(patch: Partial<RadarSettings>): RadarSettings {
  const current = getRadarSettings();
  const next = normalizeRadarSettings({ ...current, ...patch });

  if (JSON.stringify(next) === JSON.stringify(current)) {
    return current;
  }

  cached = next;
  saveRadarSettings(next);
  notify(next);
  return next;
}

/** 설정 변경을 구독한다. 해제 함수를 돌려준다. */
export function subscribeRadarSettings(listener: (settings: RadarSettings) => void): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

/** 최근 예약 목적을 기록한다. */
export function rememberRecentPurpose(purpose: unknown): RadarSettings {
  const current = getRadarSettings();
  return updateRadarSettings({
    recentPurposes: withRecentPurpose(current.recentPurposes, purpose),
  });
}

/** 가장 최근에 쓴 예약 목적. 없으면 빈 문자열. */
export function getLastUsedPurpose(): string {
  return getRadarSettings().recentPurposes[0] ?? "";
}

/** 설정을 처음 상태로 되돌린다. */
export function resetRadarSettings(): RadarSettings {
  return updateRadarSettings(createDefaultRadarSettings());
}

/**
 * 캐시를 버린다. 테스트가 저장소를 직접 바꾼 뒤 다시 읽게 할 때 쓴다.
 *
 * 구독자는 유지한다 — 해제는 구독한 쪽이 한다.
 */
export function resetRadarSettingsCacheForTest(): void {
  cached = null;
}
