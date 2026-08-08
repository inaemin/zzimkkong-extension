import {
  MAP_CALENDAR_SPACE_TAB_MEETING,
  normalizeMapCalendarSpaceTab,
  type SpaceTab,
} from "../../constants/runtime.js";
import {
  readStoredBoolean,
  readStoredNumber,
  readStoredText,
  writeStoredText,
} from "../../utils/storage.js";
import { debugWarn, pushDebugEvent } from "../../utils/shared.js";

// 확장 설정을 한 곳에서 읽고 쓴다.
//
// 예전에는 설정 하나를 추가할 때마다 (1) 키 상수를 만들고 (2) 쓰는 자리에서
// readStoredBoolean 을 직접 부르고 (3) 바뀐 걸 알릴 방법이 없어 호출부가
// 알아서 다시 그렸다. 설정이 늘어날수록 키가 흩어지고, 무엇이 저장되는지
// 한눈에 보이지 않는다.
//
// 여기서는 저장 형태를 한 덩어리(JSON)로 두고 스키마를 타입으로 고정한다.
// 읽기는 동기로 유지한다 — 기존 호출부가 전부 동기라, 여기서 비동기로
// 바꾸면 설정과 무관한 코드까지 연쇄로 손봐야 한다.

/** 레이더 표시 방식. inline 은 아직 구현 전이라 기본값은 float 이다. */
export type RadarDisplayMode = "float" | "inline";

export interface QuickReserveSettings {
  enabled: boolean;
  /** "Alt+Enter" 같은 표시용 조합. 아직 소비처가 없다. */
  hotkey: string;
  /** 직전에 쓴 예약 목적을 재사용할지. */
  reusePurpose: boolean;
}

export interface RadarSettings {
  displayMode: RadarDisplayMode;
  /** 예약 페이지에 들어가면 레이더를 자동으로 열지. */
  alwaysOpen: boolean;
  /** 마지막으로 보던 공간 유형(회의실/페어룸). */
  spaceTab: SpaceTab;
  /** 드래그로 옮긴 위치. 원점이면 저장하지 않은 것과 같다. */
  overlayOffset: { x: number; y: number };
  /** 사용자가 조절한 너비(px). 조절한 적 없으면 null. */
  overlayWidth: number | null;
  /** 층별 평면도 영역을 펼쳐 둘지. */
  floorMapOpen: boolean;
  showQuota: boolean;
  showMyReservations: boolean;
  quickReserve: QuickReserveSettings;
  /** 최근에 쓴 예약 목적. 앞쪽이 최신이다. */
  recentPurposes: string[];
}

export const RADAR_SETTINGS_STORAGE_KEY = "zzk-radar-settings-v1";

/** 최근 목적은 이 개수까지만 남긴다. */
export const RECENT_PURPOSE_LIMIT = 5;

// 통합 전에 쓰던 키들. 마이그레이션에서만 읽는다.
//
// 지우지 않고 남겨 두는 이유: 한 버전 동안은 예전 확장이 남아 있을 수 있고,
// 사용자가 다운그레이드하는 경우도 있다. 다음 버전에서 이 블록과
// migrateLegacySettings 를 함께 걷어낸다.
const LEGACY_KEYS = {
  alwaysOpen: "zzk-map-calendar-always-open-v3",
  spaceTab: "zzk-map-calendar-space-tab-v1",
  width: "zzk-map-calendar-width-v1",
  offset: "zzk-map-calendar-offset-v1",
  floorMapOpen: "zzk-map-calendar-floormap-open-v1",
} as const;

/**
 * 기본 설정 한 벌을 새로 만든다.
 *
 * 상수 하나를 공유하지 않고 매번 만드는 이유: 이 타입에는 중첩 값
 * (overlayOffset·quickReserve·recentPurposes)이 있어서, 얕은 복사(`{ ...DEFAULT }`)
 * 로는 그 인스턴스가 그대로 딸려간다. 받은 쪽이 한 번만 손대면 "기본값"이
 * 조용히 바뀌고, 그 뒤로는 아무도 원래 값을 볼 수 없다.
 */
export function createDefaultRadarSettings(): RadarSettings {
  return {
    displayMode: "float",
    alwaysOpen: true,
    spaceTab: MAP_CALENDAR_SPACE_TAB_MEETING,
    overlayOffset: { x: 0, y: 0 },
    overlayWidth: null,
    floorMapOpen: false,
    showQuota: true,
    showMyReservations: true,
    quickReserve: {
      enabled: false,
      hotkey: "Alt+Enter",
      reusePurpose: true,
    },
    recentPurposes: [],
  };
}

/** 읽기 전용 참조. 값을 만들 때는 createDefaultRadarSettings() 를 쓴다. */
export const DEFAULT_RADAR_SETTINGS: Readonly<RadarSettings> = createDefaultRadarSettings();

function asRecord(value: unknown): Record<string, unknown> {
  return value !== null && typeof value === "object" ? (value as Record<string, unknown>) : {};
}

function pickBoolean(source: Record<string, unknown>, key: string, fallback: boolean): boolean {
  return typeof source[key] === "boolean" ? source[key] : fallback;
}

/** 저장된 값이 유한한 수일 때만 받는다. null 은 "설정한 적 없음"이라 유지한다. */
function pickWidth(source: Record<string, unknown>, fallback: number | null): number | null {
  const raw = source.overlayWidth;
  return typeof raw === "number" && Number.isFinite(raw) ? raw : fallback;
}

function pickOffset(
  source: Record<string, unknown>,
  fallback: { x: number; y: number },
): { x: number; y: number } {
  const offset = asRecord(source.overlayOffset);
  const x = Number(offset.x);
  const y = Number(offset.y);
  return Number.isFinite(x) && Number.isFinite(y) ? { x, y } : fallback;
}

/** 문자열 배열만 남기고 빈 값·중복을 걷어낸다. */
export function normalizeRecentPurposes(value: unknown): string[] {
  if (!Array.isArray(value)) {
    return [];
  }
  const seen = new Set<string>();
  return value
    .filter((entry): entry is string => typeof entry === "string")
    .map((entry) => entry.trim())
    .filter((entry) => {
      if (entry === "" || seen.has(entry)) {
        return false;
      }
      seen.add(entry);
      return true;
    })
    .slice(0, RECENT_PURPOSE_LIMIT);
}

function normalizeQuickReserve(value: unknown): QuickReserveSettings {
  const source = asRecord(value);
  const fallback = DEFAULT_RADAR_SETTINGS.quickReserve;
  return {
    enabled: pickBoolean(source, "enabled", fallback.enabled),
    hotkey: typeof source.hotkey === "string" && source.hotkey ? source.hotkey : fallback.hotkey,
    reusePurpose: pickBoolean(source, "reusePurpose", fallback.reusePurpose),
  };
}

/**
 * 저장된 값을 스키마에 맞춰 정리한다.
 *
 * 저장소 값은 언제든 깨질 수 있다(수동 편집, 옛 버전, 부분 기록). 필드마다
 * 검사해서 이상한 값은 기본값으로 되돌린다 — 설정 하나가 깨졌다고 전체를
 * 버리면 사용자가 맞춰둔 나머지까지 날아간다.
 */
export function normalizeRadarSettings(value: unknown): RadarSettings {
  const source = asRecord(value);
  const fallback = DEFAULT_RADAR_SETTINGS;

  return {
    displayMode: source.displayMode === "inline" ? "inline" : "float",
    alwaysOpen: pickBoolean(source, "alwaysOpen", fallback.alwaysOpen),
    spaceTab: normalizeMapCalendarSpaceTab(source.spaceTab),
    overlayOffset: pickOffset(source, fallback.overlayOffset),
    overlayWidth: pickWidth(source, fallback.overlayWidth),
    floorMapOpen: pickBoolean(source, "floorMapOpen", fallback.floorMapOpen),
    showQuota: pickBoolean(source, "showQuota", fallback.showQuota),
    showMyReservations: pickBoolean(source, "showMyReservations", fallback.showMyReservations),
    quickReserve: normalizeQuickReserve(source.quickReserve),
    recentPurposes: normalizeRecentPurposes(source.recentPurposes),
  };
}

/**
 * 저장된 JSON 읽기 결과.
 *
 * "키가 없다"와 "있는데 깨졌다"를 구분한다. 둘 다 null 로 뭉뚱그리면, 통합 키가
 * 깨졌을 때 마이그레이션이 다시 돌아 **사용자가 그 뒤에 바꾼 설정이 예전 값으로
 * 되돌아간다**(예전 키는 일부러 남겨 두므로 계속 읽힌다).
 */
type StoredSettingsRead =
  { status: "missing" } | { status: "corrupt" } | { status: "ok"; value: unknown };

function readStoredSettingsJson(): StoredSettingsRead {
  const raw = readStoredText(RADAR_SETTINGS_STORAGE_KEY, "");
  if (!raw) {
    return { status: "missing" };
  }
  try {
    return { status: "ok", value: JSON.parse(raw) };
  } catch (error) {
    pushDebugEvent("settings", "parse-failed", { error: String(error) });
    debugWarn("settings", "parse-failed", { error: String(error) });
    return { status: "corrupt" };
  }
}

/** 예전 키에 저장된 위치({x,y} JSON)를 읽는다. */
function readLegacyOffset(): { x: number; y: number } | null {
  const raw = readStoredText(LEGACY_KEYS.offset, "");
  if (!raw) {
    return null;
  }
  try {
    const parsed = asRecord(JSON.parse(raw));
    const x = Number(parsed.x);
    const y = Number(parsed.y);
    return Number.isFinite(x) && Number.isFinite(y) ? { x, y } : null;
  } catch {
    return null;
  }
}

/** 예전 키가 하나라도 남아 있는지. 마이그레이션 여부를 가른다. */
function hasLegacySettings(): boolean {
  return Object.values(LEGACY_KEYS).some((key) => readStoredText(key, "") !== "");
}

/**
 * 흩어져 있던 예전 키를 새 스키마로 옮긴다.
 *
 * 이 함수가 없으면 업데이트 순간 기존 사용자의 "항상 열기"·너비·위치가
 * 조용히 기본값으로 돌아간다. 화면이 갑자기 달라 보이는 게 가장 나쁘다.
 *
 * 예전 키는 지우지 않는다. 한 버전 동안은 되돌릴 수 있게 남겨 둔다.
 */
export function migrateLegacySettings(): RadarSettings {
  const legacyOffset = readLegacyOffset();
  const legacyWidth = readStoredNumber(LEGACY_KEYS.width, null);

  const migrated: RadarSettings = {
    ...createDefaultRadarSettings(),
    alwaysOpen: readStoredBoolean(LEGACY_KEYS.alwaysOpen, DEFAULT_RADAR_SETTINGS.alwaysOpen),
    spaceTab: normalizeMapCalendarSpaceTab(readStoredText(LEGACY_KEYS.spaceTab, "")),
    overlayOffset: legacyOffset ?? { ...DEFAULT_RADAR_SETTINGS.overlayOffset },
    overlayWidth: legacyWidth,
    floorMapOpen: readStoredBoolean(LEGACY_KEYS.floorMapOpen, DEFAULT_RADAR_SETTINGS.floorMapOpen),
  };

  pushDebugEvent("settings", "migrated", {
    alwaysOpen: migrated.alwaysOpen,
    spaceTab: migrated.spaceTab,
    hasWidth: migrated.overlayWidth !== null,
  });

  return migrated;
}

/**
 * 지금 설정을 읽는다.
 *
 * 통합 키가 있으면 그걸 쓰고, 없는데 예전 키가 남아 있으면 옮겨 온다.
 * 둘 다 없으면 기본값이다(첫 설치).
 *
 * 통합 키가 깨진 경우에는 마이그레이션을 다시 하지 않는다. 예전 키는 일부러
 * 남겨 두므로 다시 돌리면 사용자가 그 뒤에 바꾼 값이 예전 값으로 되돌아간다.
 */
export function loadRadarSettings(): RadarSettings {
  const stored = readStoredSettingsJson();
  if (stored.status === "ok") {
    return normalizeRadarSettings(stored.value);
  }

  if (stored.status === "corrupt") {
    return createDefaultRadarSettings();
  }

  if (hasLegacySettings()) {
    const migrated = migrateLegacySettings();
    saveRadarSettings(migrated);
    return migrated;
  }

  return createDefaultRadarSettings();
}

export function saveRadarSettings(settings: RadarSettings): void {
  writeStoredText(RADAR_SETTINGS_STORAGE_KEY, JSON.stringify(normalizeRadarSettings(settings)));
}

/** 목적을 최근 목록 맨 앞에 넣는다. 이미 있으면 앞으로 끌어올린다. */
export function withRecentPurpose(current: string[], purpose: unknown): string[] {
  const normalized = typeof purpose === "string" ? purpose.trim() : "";
  if (normalized === "") {
    return normalizeRecentPurposes(current);
  }
  return normalizeRecentPurposes([normalized, ...current]);
}
