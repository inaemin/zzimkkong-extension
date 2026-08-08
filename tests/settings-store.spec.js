import { expect, test } from "@playwright/test";

import {
  DEFAULT_RADAR_SETTINGS,
  RADAR_SETTINGS_STORAGE_KEY,
  RECENT_PURPOSE_LIMIT,
  loadRadarSettings,
} from "../src/features/settings/shared.ts";
import {
  getLastUsedPurpose,
  getRadarSettings,
  rememberRecentPurpose,
  resetRadarSettings,
  resetRadarSettingsCacheForTest,
  subscribeRadarSettings,
  updateRadarSettings,
} from "../src/features/settings/store.ts";
import { readStoredMapCalendarOffset } from "../src/features/radar/overlay-position.ts";

// 설정 스토어와 마이그레이션.
//
// 이 스펙이 지키는 것은 하나다: **업데이트할 때 기존 사용자의 설정이 사라지지
// 않는다.** 흩어져 있던 키를 한 덩어리로 합치면서, 옮기는 코드가 조용히
// 틀리면 "항상 열기"가 꺼지고 너비·위치가 초기화된다. 화면이 갑자기 달라
// 보이는 게 사용자에게 가장 나쁘다.
//
// 저장소는 window.localStorage 를 직접 읽으므로 가짜를 심고 브라우저 없이 돈다.
// 스토어가 모듈 수준 캐시를 들고 있어 스펙마다 비운다(afterEach 에서 원복까지).

const originalWindow = globalThis.window;

function installLocalStorageStub(initial = {}) {
  const data = new Map(Object.entries(initial));
  const storage = {
    getItem: (key) => (data.has(key) ? data.get(key) : null),
    setItem: (key, value) => data.set(key, String(value)),
    removeItem: (key) => data.delete(key),
    raw: data,
  };
  globalThis.window = { localStorage: storage };
  resetRadarSettingsCacheForTest();
  return storage;
}

test.afterEach(() => {
  // 워커가 스펙 파일 사이에 재사용되므로 가짜 window 를 남기지 않는다.
  resetRadarSettingsCacheForTest();
  globalThis.window = originalWindow;
});

// 예전 키는 문자열을 고정하는 게 목적이라 하드코딩한다(상수를 참조하면
// 상수와 저장된 값이 함께 바뀌어도 테스트가 알아채지 못한다).
const LEGACY = {
  alwaysOpen: "zzk-map-calendar-always-open-v3",
  spaceTab: "zzk-map-calendar-space-tab-v1",
  width: "zzk-map-calendar-width-v1",
  offset: "zzk-map-calendar-offset-v1",
  floorMapOpen: "zzk-map-calendar-floormap-open-v1",
};

const SETTINGS_KEY = RADAR_SETTINGS_STORAGE_KEY;

test.describe("기본값", () => {
  test("저장된 게 없으면 기본값을 준다", async () => {
    installLocalStorageStub();

    const settings = loadRadarSettings();

    expect(settings.alwaysOpen).toBe(true);
    expect(settings.displayMode).toBe("float");
    expect(settings.spaceTab).toBe("meeting");
    expect(settings.overlayWidth).toBe(null);
    expect(settings.recentPurposes).toEqual([]);
  });

  test("모르는 표시 방식이 저장돼 있으면 float 으로 읽는다", async () => {
    // inline 은 아직 구현 전이다. 저장된 값이 무엇이든 아는 값이 아니면
    // float 이어야, 사용자가 아직 없는 동작을 만나지 않는다.
    installLocalStorageStub({
      [SETTINGS_KEY]: JSON.stringify({ displayMode: "아직 없는 모드" }),
    });

    expect(loadRadarSettings().displayMode).toBe("float");
  });
});

test.describe("마이그레이션", () => {
  test("예전 키의 '항상 열기: 꺼짐' 이 유지된다", async () => {
    // 이 스펙이 이 파일에서 가장 중요하다. 기본값이 true 라서, 마이그레이션이
    // 빠지면 꺼둔 사용자의 설정이 조용히 켜진다.
    installLocalStorageStub({ [LEGACY.alwaysOpen]: "0" });

    expect(loadRadarSettings().alwaysOpen).toBe(false);
  });

  test("너비·위치·탭·평면도 상태를 함께 옮긴다", async () => {
    installLocalStorageStub({
      [LEGACY.alwaysOpen]: "1",
      [LEGACY.spaceTab]: "pair",
      [LEGACY.width]: "720",
      [LEGACY.offset]: JSON.stringify({ x: -120, y: 40 }),
      [LEGACY.floorMapOpen]: "1",
    });

    const settings = loadRadarSettings();

    expect(settings.spaceTab).toBe("pair");
    expect(settings.overlayWidth).toBe(720);
    expect(settings.overlayOffset).toEqual({ x: -120, y: 40 });
    expect(settings.floorMapOpen).toBe(true);
  });

  test("옮긴 결과를 새 키에 적어 둔다", async () => {
    const storage = installLocalStorageStub({ [LEGACY.alwaysOpen]: "0" });

    loadRadarSettings();

    expect(JSON.parse(storage.getItem(SETTINGS_KEY)).alwaysOpen).toBe(false);
  });

  test("예전 키를 지우지 않는다", async () => {
    // 한 버전 동안은 되돌릴 수 있어야 한다.
    const storage = installLocalStorageStub({ [LEGACY.alwaysOpen]: "0" });

    loadRadarSettings();

    expect(storage.getItem(LEGACY.alwaysOpen)).toBe("0");
  });

  test("새 키가 이미 있으면 예전 키를 보지 않는다", async () => {
    // 마이그레이션이 끝난 뒤 사용자가 값을 바꿨는데, 예전 키가 남아 있다고
    // 다시 덮어써 버리면 방금 바꾼 설정이 되돌아간다.
    installLocalStorageStub({
      [SETTINGS_KEY]: JSON.stringify({ alwaysOpen: true }),
      [LEGACY.alwaysOpen]: "0",
    });

    expect(loadRadarSettings().alwaysOpen).toBe(true);
  });
});

test.describe("깨진 값 복구", () => {
  test("JSON 이 깨져 있으면 기본값으로 돈다", async () => {
    installLocalStorageStub({ [SETTINGS_KEY]: "{말도 안 되는 값" });

    expect(loadRadarSettings().alwaysOpen).toBe(true);
  });

  test("JSON 이 깨졌고 예전 키도 남아 있으면 마이그레이션을 다시 하지 않는다", async () => {
    // 예전 키는 일부러 남겨 두므로 계속 읽힌다. 통합 키가 깨졌다고 다시 옮겨오면
    // 사용자가 마이그레이션 이후에 바꾼 설정이 예전 값으로 되돌아간다.
    installLocalStorageStub({
      [SETTINGS_KEY]: "{깨진 값",
      [LEGACY.alwaysOpen]: "0",
      [LEGACY.width]: "720",
    });

    const settings = loadRadarSettings();

    expect(settings.alwaysOpen).toBe(true); // 예전 값(false)이 아니라 기본값
    expect(settings.overlayWidth).toBe(null);
  });

  test("일부 필드만 이상하면 그 필드만 기본값으로 돌린다", async () => {
    // 설정 하나가 깨졌다고 전체를 버리면 맞춰둔 나머지까지 날아간다.
    installLocalStorageStub({
      [SETTINGS_KEY]: JSON.stringify({
        alwaysOpen: false,
        spaceTab: "존재하지 않는 탭",
        overlayWidth: "칠백이십",
      }),
    });

    const settings = loadRadarSettings();

    expect(settings.alwaysOpen).toBe(false); // 살아남는다
    expect(settings.spaceTab).toBe("meeting"); // 기본값
    expect(settings.overlayWidth).toBe(null); // 기본값
  });
});

test.describe("스토어", () => {
  test("바꾼 값이 저장되고 다시 읽힌다", async () => {
    const storage = installLocalStorageStub();

    updateRadarSettings({ alwaysOpen: false });

    expect(getRadarSettings().alwaysOpen).toBe(false);
    expect(JSON.parse(storage.getItem(SETTINGS_KEY)).alwaysOpen).toBe(false);
  });

  test("구독자에게 바뀐 설정을 알린다", async () => {
    installLocalStorageStub();
    const seen = [];
    subscribeRadarSettings((next) => seen.push(next.showQuota));

    updateRadarSettings({ showQuota: false });

    expect(seen).toEqual([false]);
  });

  test("같은 값으로 바꾸면 알리지 않는다", async () => {
    // 같은 값에도 알리면 레이더가 이유 없이 다시 그려진다.
    installLocalStorageStub();
    updateRadarSettings({ showQuota: false });
    const seen = [];
    subscribeRadarSettings(() => seen.push(1));

    updateRadarSettings({ showQuota: false });

    expect(seen).toEqual([]);
  });

  test("구독을 해제하면 더 이상 받지 않는다", async () => {
    installLocalStorageStub();
    const seen = [];
    const unsubscribe = subscribeRadarSettings(() => seen.push(1));

    unsubscribe();
    updateRadarSettings({ showQuota: false });

    expect(seen).toEqual([]);
  });

  test("구독자 하나가 던져도 나머지는 알림을 받는다", async () => {
    // 여기서 막지 않으면 설정은 저장됐는데 화면 일부만 안 바뀐다.
    // 사용자에게는 "스위치를 눌렀는데 화면이 그대로"로 보인다.
    installLocalStorageStub();
    const seen = [];
    subscribeRadarSettings(() => {
      throw new Error("구독자 실패");
    });
    subscribeRadarSettings(() => seen.push("두 번째"));

    updateRadarSettings({ showQuota: false });

    expect(seen).toEqual(["두 번째"]);
  });

  test("알림 도중 구독을 해제해도 순회가 깨지지 않는다", async () => {
    // useSyncExternalStore 가 언마운트 때 이렇게 한다.
    installLocalStorageStub();
    const seen = [];
    const unsubscribe = subscribeRadarSettings(() => {
      unsubscribe();
      seen.push("첫 번째");
    });
    subscribeRadarSettings(() => seen.push("두 번째"));

    updateRadarSettings({ showQuota: false });

    expect(seen).toEqual(["첫 번째", "두 번째"]);
  });

  test("이상한 값으로 바꾸면 캐시에도 정리된 값이 남는다", async () => {
    // 저장할 때만 정리하면 메모리 값과 저장된 값이 갈려서, 새로고침 전까지
    // 화면이 저장된 설정과 다르게 동작한다.
    //
    // 기본값이 meeting 이라 pair 에서 출발해야 "정리됐다"를 볼 수 있다.
    const storage = installLocalStorageStub();
    updateRadarSettings({ spaceTab: "pair" });

    updateRadarSettings({ spaceTab: "없는 탭" });

    expect(getRadarSettings().spaceTab).toBe("meeting");
    expect(JSON.parse(storage.getItem(SETTINGS_KEY)).spaceTab).toBe("meeting");
  });

  test("리셋하면 기본값으로 돌아간다", async () => {
    installLocalStorageStub();
    updateRadarSettings({ alwaysOpen: false, overlayWidth: 900 });

    resetRadarSettings();

    expect(getRadarSettings().alwaysOpen).toBe(true);
    expect(getRadarSettings().overlayWidth).toBe(null);
  });

  test("읽어간 위치를 고쳐도 저장된 설정은 그대로다", async () => {
    // 드래그 계산이 받은 오프셋을 그 자리에서 고치면, 캐시 안의 값이 함께
    // 바뀌어 저장된 위치가 조용히 달라진다.
    installLocalStorageStub();
    updateRadarSettings({ overlayOffset: { x: -100, y: 50 } });

    const offset = readStoredMapCalendarOffset();
    offset.x = 9999;

    expect(getRadarSettings().overlayOffset).toEqual({ x: -100, y: 50 });
  });

  test("리셋 결과를 고쳐도 기본값 상수는 그대로다", async () => {
    // 중첩 값(overlayOffset 등)을 얕게 복사하면 상수가 함께 바뀐다.
    // 그 뒤로는 아무도 원래 기본값을 볼 수 없다.
    installLocalStorageStub();

    const settings = resetRadarSettings();
    settings.overlayOffset.x = 9999;
    settings.recentPurposes.push("오염");

    expect(DEFAULT_RADAR_SETTINGS.overlayOffset).toEqual({ x: 0, y: 0 });
    expect(DEFAULT_RADAR_SETTINGS.recentPurposes).toEqual([]);
  });
});

test.describe("최근 예약 목적", () => {
  test("가장 최근에 쓴 것이 앞으로 온다", async () => {
    installLocalStorageStub();

    rememberRecentPurpose("팀 회의");
    rememberRecentPurpose("코드 리뷰");

    expect(getLastUsedPurpose()).toBe("코드 리뷰");
  });

  test("같은 목적을 다시 쓰면 중복되지 않고 앞으로 올라온다", async () => {
    installLocalStorageStub();

    rememberRecentPurpose("팀 회의");
    rememberRecentPurpose("코드 리뷰");
    rememberRecentPurpose("팀 회의");

    expect(getRadarSettings().recentPurposes).toEqual(["팀 회의", "코드 리뷰"]);
  });

  test("빈 값은 기록하지 않는다", async () => {
    installLocalStorageStub();

    rememberRecentPurpose("   ");

    expect(getRadarSettings().recentPurposes).toEqual([]);
  });

  test("최근 목록은 상한을 넘지 않는다", async () => {
    installLocalStorageStub();

    for (let index = 0; index < RECENT_PURPOSE_LIMIT + 3; index += 1) {
      rememberRecentPurpose(`목적 ${index}`);
    }

    expect(getRadarSettings().recentPurposes).toHaveLength(RECENT_PURPOSE_LIMIT);
  });
});
