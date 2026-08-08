import { expect, test } from "@playwright/test";

// 설정 스토어와 마이그레이션.
//
// 이 스펙이 지키는 것은 하나다: **업데이트할 때 기존 사용자의 설정이 사라지지
// 않는다.** 흩어져 있던 키를 한 덩어리로 합치면서, 옮기는 코드가 조용히
// 틀리면 "항상 열기"가 꺼지고 너비·위치가 초기화된다. 화면이 갑자기 달라
// 보이는 게 사용자에게 가장 나쁘다.
//
// 저장소는 window.localStorage 를 직접 읽으므로 가짜를 심고 브라우저 없이 돈다.

function installLocalStorageStub(initial = {}) {
  const data = new Map(Object.entries(initial));
  const storage = {
    getItem: (key) => (data.has(key) ? data.get(key) : null),
    setItem: (key, value) => data.set(key, String(value)),
    removeItem: (key) => data.delete(key),
    get size() {
      return data.size;
    },
    raw: data,
  };
  globalThis.window = { localStorage: storage };
  return storage;
}

// 모듈이 모듈 수준 캐시를 들고 있어, 스펙마다 새로 읽게 해야 한다.
async function loadSettingsModules() {
  const shared = await import(`../src/features/settings/shared.ts?v=${Math.random()}`);
  const store = await import(`../src/features/settings/store.ts?v=${Math.random()}`);
  return { shared, store };
}

const LEGACY = {
  alwaysOpen: "zzk-map-calendar-always-open-v3",
  spaceTab: "zzk-map-calendar-space-tab-v1",
  width: "zzk-map-calendar-width-v1",
  offset: "zzk-map-calendar-offset-v1",
  floorMapOpen: "zzk-map-calendar-floormap-open-v1",
};

const SETTINGS_KEY = "zzk-radar-settings-v1";

test.describe("기본값", () => {
  test("저장된 게 없으면 기본값을 준다", async () => {
    installLocalStorageStub();
    const { shared } = await loadSettingsModules();

    const settings = shared.loadRadarSettings();

    expect(settings.alwaysOpen).toBe(true);
    expect(settings.displayMode).toBe("float");
    expect(settings.spaceTab).toBe("meeting");
    expect(settings.overlayWidth).toBe(null);
    expect(settings.recentPurposes).toEqual([]);
  });

  test("inline 모드는 아직 기본값이 아니다", async () => {
    // 구현 전이라 기본이 float 이어야 한다. 여기가 뒤집히면 사용자가
    // 아직 없는 동작을 만나게 된다.
    installLocalStorageStub();
    const { shared } = await loadSettingsModules();

    expect(shared.DEFAULT_RADAR_SETTINGS.displayMode).toBe("float");
  });
});

test.describe("마이그레이션", () => {
  test("예전 키의 '항상 열기: 꺼짐' 이 유지된다", async () => {
    // 이 스펙이 이 파일에서 가장 중요하다. 기본값이 true 라서, 마이그레이션이
    // 빠지면 꺼둔 사용자의 설정이 조용히 켜진다.
    installLocalStorageStub({ [LEGACY.alwaysOpen]: "0" });
    const { shared } = await loadSettingsModules();

    expect(shared.loadRadarSettings().alwaysOpen).toBe(false);
  });

  test("너비·위치·탭·평면도 상태를 함께 옮긴다", async () => {
    installLocalStorageStub({
      [LEGACY.alwaysOpen]: "1",
      [LEGACY.spaceTab]: "pair",
      [LEGACY.width]: "720",
      [LEGACY.offset]: JSON.stringify({ x: -120, y: 40 }),
      [LEGACY.floorMapOpen]: "1",
    });
    const { shared } = await loadSettingsModules();

    const settings = shared.loadRadarSettings();

    expect(settings.spaceTab).toBe("pair");
    expect(settings.overlayWidth).toBe(720);
    expect(settings.overlayOffset).toEqual({ x: -120, y: 40 });
    expect(settings.floorMapOpen).toBe(true);
  });

  test("옮긴 결과를 새 키에 적어 둔다", async () => {
    const storage = installLocalStorageStub({ [LEGACY.alwaysOpen]: "0" });
    const { shared } = await loadSettingsModules();

    shared.loadRadarSettings();

    expect(JSON.parse(storage.getItem(SETTINGS_KEY)).alwaysOpen).toBe(false);
  });

  test("예전 키를 지우지 않는다", async () => {
    // 한 버전 동안은 되돌릴 수 있어야 한다.
    const storage = installLocalStorageStub({ [LEGACY.alwaysOpen]: "0" });
    const { shared } = await loadSettingsModules();

    shared.loadRadarSettings();

    expect(storage.getItem(LEGACY.alwaysOpen)).toBe("0");
  });

  test("새 키가 이미 있으면 예전 키를 보지 않는다", async () => {
    // 마이그레이션이 끝난 뒤 사용자가 값을 바꿨는데, 예전 키가 남아 있다고
    // 다시 덮어써 버리면 방금 바꾼 설정이 되돌아간다.
    installLocalStorageStub({
      [SETTINGS_KEY]: JSON.stringify({ alwaysOpen: true }),
      [LEGACY.alwaysOpen]: "0",
    });
    const { shared } = await loadSettingsModules();

    expect(shared.loadRadarSettings().alwaysOpen).toBe(true);
  });
});

test.describe("깨진 값 복구", () => {
  test("JSON 이 깨져 있으면 기본값으로 돈다", async () => {
    installLocalStorageStub({ [SETTINGS_KEY]: "{말도 안 되는 값" });
    const { shared } = await loadSettingsModules();

    expect(shared.loadRadarSettings().alwaysOpen).toBe(true);
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
    const { shared } = await loadSettingsModules();

    const settings = shared.loadRadarSettings();

    expect(settings.alwaysOpen).toBe(false); // 살아남는다
    expect(settings.spaceTab).toBe("meeting"); // 기본값
    expect(settings.overlayWidth).toBe(null); // 기본값
  });
});

test.describe("스토어", () => {
  test("바꾼 값이 저장되고 다시 읽힌다", async () => {
    const storage = installLocalStorageStub();
    const { store } = await loadSettingsModules();

    store.updateRadarSettings({ alwaysOpen: false });

    expect(store.getRadarSettings().alwaysOpen).toBe(false);
    expect(JSON.parse(storage.getItem(SETTINGS_KEY)).alwaysOpen).toBe(false);
  });

  test("구독자에게 바뀐 설정을 알린다", async () => {
    installLocalStorageStub();
    const { store } = await loadSettingsModules();
    const seen = [];
    store.subscribeRadarSettings((next) => seen.push(next.showQuota));

    store.updateRadarSettings({ showQuota: false });

    expect(seen).toEqual([false]);
  });

  test("같은 값으로 바꾸면 알리지 않는다", async () => {
    // 같은 값에도 알리면 레이더가 이유 없이 다시 그려진다.
    installLocalStorageStub();
    const { store } = await loadSettingsModules();
    store.updateRadarSettings({ showQuota: false });
    const seen = [];
    store.subscribeRadarSettings(() => seen.push(1));

    store.updateRadarSettings({ showQuota: false });

    expect(seen).toEqual([]);
  });

  test("구독을 해제하면 더 이상 받지 않는다", async () => {
    installLocalStorageStub();
    const { store } = await loadSettingsModules();
    const seen = [];
    const unsubscribe = store.subscribeRadarSettings(() => seen.push(1));

    unsubscribe();
    store.updateRadarSettings({ showQuota: false });

    expect(seen).toEqual([]);
  });
});

test.describe("최근 예약 목적", () => {
  test("가장 최근에 쓴 것이 앞으로 온다", async () => {
    installLocalStorageStub();
    const { store } = await loadSettingsModules();

    store.rememberRecentPurpose("팀 회의");
    store.rememberRecentPurpose("코드 리뷰");

    expect(store.getLastUsedPurpose()).toBe("코드 리뷰");
  });

  test("같은 목적을 다시 쓰면 중복되지 않고 앞으로 올라온다", async () => {
    installLocalStorageStub();
    const { store } = await loadSettingsModules();

    store.rememberRecentPurpose("팀 회의");
    store.rememberRecentPurpose("코드 리뷰");
    store.rememberRecentPurpose("팀 회의");

    expect(store.getRadarSettings().recentPurposes).toEqual(["팀 회의", "코드 리뷰"]);
  });

  test("빈 값은 기록하지 않는다", async () => {
    installLocalStorageStub();
    const { store } = await loadSettingsModules();

    store.rememberRecentPurpose("   ");

    expect(store.getRadarSettings().recentPurposes).toEqual([]);
  });

  test("최근 목록은 상한을 넘지 않는다", async () => {
    installLocalStorageStub();
    const { shared, store } = await loadSettingsModules();

    for (let index = 0; index < shared.RECENT_PURPOSE_LIMIT + 3; index += 1) {
      store.rememberRecentPurpose(`목적 ${index}`);
    }

    expect(store.getRadarSettings().recentPurposes).toHaveLength(shared.RECENT_PURPOSE_LIMIT);
  });
});
