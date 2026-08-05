import { DEBUG_MODE } from "./debug.js";

export function normalizeRoomTagKey(value: unknown): string {
  return typeof value === "string" ? value.trim().toLowerCase() : "";
}

export function normalizeTargetRoomName(value: unknown): string {
  return typeof value === "string" ? value.replace(/\s+/g, "").trim() : "";
}

export const MAP_CALENDAR_OVERLAY_ID = "zzk-map-calendar-overlay";
/** Slack 복사 모달의 shadow root 호스트. */
export const SLACK_COPY_MODAL_MOUNT_ID = "zzk-slack-copy-root";
export const MAP_CALENDAR_LAUNCHER_ID = "zzk-map-calendar-radar-launcher";
export const SLACK_MODAL_TRIGGER_ID = "zzk-slack-modal-trigger";
export { DEBUG_MODE };
export const MAP_CALENDAR_OVERLAY_TAB_MEETING_ID = "zzk-map-calendar-overlay-tab-meeting";
export const MAP_CALENDAR_OVERLAY_TAB_PAIR_ID = "zzk-map-calendar-overlay-tab-pair";
export const PAGE_RESERVATION_EVENT_TYPE = "ZZK_RESERVATION_NETWORK_EVENT";
export const X_ICON_SVG =
  '<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="lucide lucide-x-icon lucide-x"><path d="M18 6 6 18"/><path d="m6 6 12 12"/></svg>';
export const SLACK_CHANNEL_MENTION_STORAGE_KEY = "zzk-slack-channel-mention-v1";
export const SLACK_CHANNEL_HISTORY_STORAGE_KEY = "zzk-slack-channel-history-v1";
export const SLACK_REMINDER_LEAD_TIME_STORAGE_KEY = "zzk-slack-reminder-lead-time-v1";
export const PENDING_SLACK_MODAL_STORAGE_KEY = "zzk-pending-slack-modal-v1";
export const MAP_CALENDAR_ALWAYS_OPEN_STORAGE_KEY = "zzk-map-calendar-always-open-v3";
export const MAP_CALENDAR_SPACE_TAB_STORAGE_KEY = "zzk-map-calendar-space-tab-v1";
export const MAP_CALENDAR_WIDTH_STORAGE_KEY = "zzk-map-calendar-width-v1";
export const MAP_CALENDAR_OFFSET_STORAGE_KEY = "zzk-map-calendar-offset-v1";
// 층별 평면도 영역 펼침 상태(기본: 접힘).
export const MAP_CALENDAR_FLOORMAP_OPEN_STORAGE_KEY = "zzk-map-calendar-floormap-open-v1";
export const MAP_CALENDAR_MIN_WIDTH = 480;
export const MAP_CALENDAR_VIEWPORT_MARGIN = 24;
export const MAP_CALENDAR_CURRENT_TIME_SCROLL_LEAD_MINUTES = 30;
export const MAP_CALENDAR_SPACE_TAB_MEETING = "meeting";
export const MAP_CALENDAR_SPACE_TAB_PAIR = "pair";
export const LMS_API_BASE_URL = "https://techcourse-lms-plus-api.woowahan.com";
export const RUNTIME_MESSAGE_TIMEOUT_MS = 3000;
export const RESERVATION_SCHEDULE_STALE_MS = 3000;
const SEOUL_TIMEZONE = "Asia/Seoul";
export const KST_DATE_PARTS_FORMATTER = new Intl.DateTimeFormat("en-GB", {
  timeZone: SEOUL_TIMEZONE,
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
});
export const KST_TIME_PARTS_FORMATTER = new Intl.DateTimeFormat("en-GB", {
  timeZone: SEOUL_TIMEZONE,
  hour: "2-digit",
  minute: "2-digit",
  second: "2-digit",
  hour12: false,
});
export const KST_WEEKDAY_FORMATTER = new Intl.DateTimeFormat("ko-KR", {
  timeZone: SEOUL_TIMEZONE,
  weekday: "short",
});
export const DEFAULT_SLACK_REMINDER_LEAD_TIME_MINUTES = 10;
export const SLACK_REMINDER_LEAD_TIME_OPTIONS = [1, 5, 10, 15, 30, 60];
export const TIME_STEP_MINUTES = 10;
// 개편 서비스(lms+)는 예약 단위가 30분이라 타임블록도 30분 눈금으로 그린다.
export const LMS_TIME_STEP_MINUTES = 30;
// lms+ 블록 클릭 시 기본 60분(30분 슬롯 2칸)을 선택한다.
export const LMS_DEFAULT_RESERVATION_MINUTES = 60;
// lms+ 는 슬롯이 30분 단위(시간당 2칸)라 클릭 대상이 되도록 더 넓게 그린다.
export const LMS_CALENDAR_SLOT_MIN_WIDTH = 20;
export const CALENDAR_SLOT_GAP = 2;
export const CALENDAR_HOUR_BOUNDARY_LINE_WIDTH = 1;
export const CALENDAR_HOUR_BOUNDARY_SIDE_GAP = CALENDAR_SLOT_GAP;
export const CALENDAR_FLOOR_COL_WIDTH = 52;
export const CALENDAR_ROOM_COL_WIDTH = 86;
export const CALENDAR_ROW_GAP = 4;
// 타임블록 영역 좌우 바깥 여백. 0 이면 타임블록이 세로 구분선/카드 안쪽에 바짝 붙는다.
// (07:00 시각 텍스트 잘림은 hour-label 의 padding-left 로 방지한다.)
export const CALENDAR_SIDE_MARGIN = 0;
export const DRAG_SAFE_TOP = 56;

// z-index 층.
//
// 예전에는 전부 2147483647(32비트 최대값)이었다. "확실히 위로"라는 의도였지만
// 최대값이라 그 위에 아무것도 못 올려서, 날짜 팝오버가 오버레이에 가려지는 문제가
// 있었다(팝오버에도 같은 값을 줘 동점 + DOM 순서로 이기게 해둔 상태였다).
//
// 실제 호스트(lms+) 스타일시트를 재보니 일반 UI 는 최대 200 이고, 그 위는
// 마크다운 에디터 전체화면(99999) 하나뿐이다. 그건 "화면 전체를 덮는" 의도이므로
// 우리가 이겨서는 안 된다. 그래서 200 위, 99999 아래에 층을 잡는다.
const HOST_UI_MAX_Z_INDEX = 200;

/** 레이더 오버레이. 호스트 일반 UI 보다 위. */
export const RADAR_OVERLAY_Z_INDEX = HOST_UI_MAX_Z_INDEX + 100;
/** 플로팅 런처. 열린 오버레이 위에서도 눌려야 한다. */
export const RADAR_LAUNCHER_Z_INDEX = RADAR_OVERLAY_Z_INDEX + 10;
/** Slack 모달·평면도 확대처럼 화면을 덮는 것. */
export const RADAR_MODAL_Z_INDEX = RADAR_LAUNCHER_Z_INDEX + 10;

/**
 * 호스트 상단 네비를 우리 UI 위로 올릴 때 쓴다.
 *
 * 오버레이가 화면 오른쪽 아래에 뜨는데 네비는 위에 있어 실제로 겹치지 않지만,
 * 겹치는 경우에도 로그아웃·마이페이지는 눌려야 한다.
 */
export const NAV_SAFE_Z_INDEX = RADAR_MODAL_Z_INDEX + 10;
// 공간 종류. lms+ API 는 안 주므로 이름 기반 메타데이터로 분류한다.
export type SpaceTab = typeof MAP_CALENDAR_SPACE_TAB_MEETING | typeof MAP_CALENDAR_SPACE_TAB_PAIR;

export interface RoomTagMetadata {
  key: string;
  label: string;
  description: string;
}

export interface TargetRoomMetadata {
  name: string;
  floor: string;
  kind: SpaceTab;
  tags: string[];
}

const ROOM_TAG_METADATA: RoomTagMetadata[] = [
  { key: "window", label: "창", description: "창문 있음" },
];
export const ROOM_TAG_METADATA_BY_KEY = new Map(
  ROOM_TAG_METADATA.map((entry) => [normalizeRoomTagKey(entry.key), entry]),
);
export const TARGET_ROOM_METADATA: TargetRoomMetadata[] = [
  { name: "금성", floor: "11층", kind: MAP_CALENDAR_SPACE_TAB_MEETING, tags: ["window"] },
  { name: "지구", floor: "11층", kind: MAP_CALENDAR_SPACE_TAB_MEETING, tags: ["window"] },
  { name: "수성", floor: "11층", kind: MAP_CALENDAR_SPACE_TAB_MEETING, tags: [] },
  { name: "화성", floor: "11층", kind: MAP_CALENDAR_SPACE_TAB_MEETING, tags: [] },
  { name: "보이저", floor: "12층", kind: MAP_CALENDAR_SPACE_TAB_MEETING, tags: ["window"] },
  { name: "디스커버리", floor: "12층", kind: MAP_CALENDAR_SPACE_TAB_MEETING, tags: ["window"] },
  { name: "아폴로", floor: "12층", kind: MAP_CALENDAR_SPACE_TAB_MEETING, tags: [] },
  { name: "허블", floor: "12층", kind: MAP_CALENDAR_SPACE_TAB_MEETING, tags: [] },
  { name: "은하수", floor: "13층", kind: MAP_CALENDAR_SPACE_TAB_MEETING, tags: ["window"] },
  // 이름은 lms+ /api/spaces 응답 그대로("페어룸 01"). 공백 제거 정규화를 거쳐
  // "페어룸01" 로 매칭되므로 API 이름이 바뀌지 않는 한 여기서 kind 가 확정된다.
  { name: "페어룸 01", floor: "13층", kind: MAP_CALENDAR_SPACE_TAB_PAIR, tags: [] },
  { name: "페어룸 02", floor: "13층", kind: MAP_CALENDAR_SPACE_TAB_PAIR, tags: [] },
  { name: "페어룸 03", floor: "13층", kind: MAP_CALENDAR_SPACE_TAB_PAIR, tags: [] },
  { name: "페어룸 04", floor: "13층", kind: MAP_CALENDAR_SPACE_TAB_PAIR, tags: [] },
  { name: "페어룸 05", floor: "13층", kind: MAP_CALENDAR_SPACE_TAB_PAIR, tags: [] },
  { name: "페어룸 06", floor: "13층", kind: MAP_CALENDAR_SPACE_TAB_PAIR, tags: [] },
  { name: "페어룸 07", floor: "12층", kind: MAP_CALENDAR_SPACE_TAB_PAIR, tags: [] },
  { name: "페어룸 08", floor: "12층", kind: MAP_CALENDAR_SPACE_TAB_PAIR, tags: [] },
  { name: "페어룸 09", floor: "12층", kind: MAP_CALENDAR_SPACE_TAB_PAIR, tags: [] },
  { name: "페어룸 10", floor: "12층", kind: MAP_CALENDAR_SPACE_TAB_PAIR, tags: [] },
  { name: "페어룸 11", floor: "12층", kind: MAP_CALENDAR_SPACE_TAB_PAIR, tags: [] },
  { name: "페어룸 12", floor: "12층", kind: MAP_CALENDAR_SPACE_TAB_PAIR, tags: [] },
  { name: "페어룸 13", floor: "12층", kind: MAP_CALENDAR_SPACE_TAB_PAIR, tags: [] },
  { name: "페어룸 14", floor: "12층", kind: MAP_CALENDAR_SPACE_TAB_PAIR, tags: [] },
];
// index 는 크루 기준 표시 순서. content.js 가 정렬에 쓴다.
export type IndexedRoomMetadata = TargetRoomMetadata & { index: number };

export const TARGET_ROOM_METADATA_BY_NORMALIZED_NAME = new Map<string, IndexedRoomMetadata>(
  TARGET_ROOM_METADATA.map((entry, index) => [
    normalizeTargetRoomName(entry.name),
    { ...entry, index },
  ]),
);
export const MAP_CALENDAR_ROOM_FLOOR_BY_NAME = new Map(
  TARGET_ROOM_METADATA.map((entry) => [normalizeTargetRoomName(entry.name), entry.floor]),
);
export const TARGET_ROOM_NAMES = TARGET_ROOM_METADATA.map((entry) => entry.name);
export const TARGET_ROOM_ORDER = new Map(
  TARGET_ROOM_METADATA.map((entry, index) => [normalizeTargetRoomName(entry.name), index]),
);

export function normalizeMapCalendarSpaceTab(value: unknown): SpaceTab {
  return value === MAP_CALENDAR_SPACE_TAB_PAIR
    ? MAP_CALENDAR_SPACE_TAB_PAIR
    : MAP_CALENDAR_SPACE_TAB_MEETING;
}

export function normalizeFetchRoomType(value: unknown): SpaceTab | null {
  // 아는 탭 두 개만 통과시키고 나머지는 null(= 전체 조회).
  if (value === MAP_CALENDAR_SPACE_TAB_PAIR) {
    return MAP_CALENDAR_SPACE_TAB_PAIR;
  }
  if (value === MAP_CALENDAR_SPACE_TAB_MEETING) {
    return MAP_CALENDAR_SPACE_TAB_MEETING;
  }
  return null;
}
