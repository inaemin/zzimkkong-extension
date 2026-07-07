(() => {
  if (globalThis.__zzkSharedConstants) {
    return;
  }

  function normalizeRoomTagKey(value) {
    return typeof value === "string" ? value.trim().toLowerCase() : "";
  }

  function normalizeTargetRoomName(value) {
    return typeof value === "string" ? value.replace(/\s+/g, "").trim() : "";
  }

  const MAP_CALENDAR_OVERLAY_ID = "zzk-map-calendar-overlay";
  const MAP_CALENDAR_LAUNCHER_ID = "zzk-map-calendar-radar-launcher";
  const SLACK_MODAL_TRIGGER_ID = "zzk-slack-modal-trigger";
  const DEBUG_MODE = globalThis.__zzkDebugConfig?.DEBUG_MODE === true;
  const MAP_CALENDAR_STYLE_ID = "zzk-map-calendar-style";
  const MAP_CALENDAR_OVERLAY_TAB_MEETING_ID = "zzk-map-calendar-overlay-tab-meeting";
  const MAP_CALENDAR_OVERLAY_TAB_PAIR_ID = "zzk-map-calendar-overlay-tab-pair";
  const PAGE_RESERVATION_HOOK_SCRIPT_ID = "zzk-page-reservation-hook";
  const PAGE_RESERVATION_EVENT_TYPE = "ZZK_RESERVATION_NETWORK_EVENT";
  const SLACK_COPY_MODAL_ID = "zzk-slack-copy-modal";
  const SLACK_COPY_MODAL_STYLE_ID = "zzk-slack-copy-modal-style";
  const SLACK_COPY_MODAL_BASECOAT_STYLE_ID = "zzk-slack-copy-modal-basecoat-style";
  const SLACK_COPY_MODAL_BASECOAT_STYLE_PATH = "assets/basecoat-dialog.css";
  const X_ICON_SVG = '<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="lucide lucide-x-icon lucide-x"><path d="M18 6 6 18"/><path d="m6 6 12 12"/></svg>';
  const CHEVRON_LEFT_ICON_SVG = '<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="lucide lucide-chevron-left-icon lucide-chevron-left"><path d="m15 18-6-6 6-6"/></svg>';
  const CHEVRON_RIGHT_ICON_SVG = '<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="lucide lucide-chevron-right-icon lucide-chevron-right"><path d="m9 18 6-6-6-6"/></svg>';
  const SLACK_CHANNEL_MENTION_STORAGE_KEY = "zzk-slack-channel-mention-v1";
  const SLACK_CHANNEL_HISTORY_STORAGE_KEY = "zzk-slack-channel-history-v1";
  const SLACK_REMINDER_LEAD_TIME_STORAGE_KEY = "zzk-slack-reminder-lead-time-v1";
  const PENDING_SLACK_MODAL_STORAGE_KEY = "zzk-pending-slack-modal-v1";
  const BLANK_GUEST_RECOVERY_STORAGE_KEY = "zzk-blank-guest-recovery-v1";
  const PENDING_EDIT_SUBMIT_STORAGE_KEY = "zzk-pending-edit-submit-v1";
  const MAP_CALENDAR_ALWAYS_OPEN_STORAGE_KEY = "zzk-map-calendar-always-open-v3";
  const MAP_CALENDAR_SPACE_TAB_STORAGE_KEY = "zzk-map-calendar-space-tab-v1";
  const MAP_CALENDAR_SPACE_TAB_MEETING = "meeting";
  const MAP_CALENDAR_SPACE_TAB_PAIR = "pair";
  const API_BASE_URL = "https://k8s.zzimkkong.com";
  const RUNTIME_MESSAGE_TIMEOUT_MS = 3000;
  const RESERVATION_SCHEDULE_STALE_MS = 3000;
  const SEOUL_TIMEZONE = "Asia/Seoul";
  const KST_DATE_PARTS_FORMATTER = new Intl.DateTimeFormat("en-GB", { timeZone: SEOUL_TIMEZONE, year: "numeric", month: "2-digit", day: "2-digit" });
  const KST_TIME_PARTS_FORMATTER = new Intl.DateTimeFormat("en-GB", { timeZone: SEOUL_TIMEZONE, hour: "2-digit", minute: "2-digit", second: "2-digit", hour12: false });
  const KST_WEEKDAY_FORMATTER = new Intl.DateTimeFormat("ko-KR", { timeZone: SEOUL_TIMEZONE, weekday: "short" });
  const DEFAULT_SLACK_REMINDER_LEAD_TIME_MINUTES = 10;
  const SLACK_REMINDER_LEAD_TIME_OPTIONS = [1, 5, 10, 15, 30, 60];
  const TIME_STEP_MINUTES = 10;
  const CALENDAR_SLOT_MIN_WIDTH = 9;
  const CALENDAR_SLOT_GAP = 2;
  const CALENDAR_HOUR_BOUNDARY_LINE_WIDTH = 1;
  const CALENDAR_HOUR_BOUNDARY_SIDE_GAP = CALENDAR_SLOT_GAP;
  const MAX_RESERVATION_BLOCKS = 6;
  const CALENDAR_FLOOR_COL_WIDTH = 52;
  const CALENDAR_ROOM_COL_WIDTH = 86;
  const CALENDAR_ROW_GAP = 4;
  const CALENDAR_SIDE_MARGIN = CALENDAR_SLOT_GAP;
  const DRAG_SAFE_TOP = 56;
  const NAV_SAFE_Z_INDEX = 2147483647;
  const ROOM_TAG_METADATA = [{ key: "window", label: "창", description: "창문 있는 회의실" }];
  const ROOM_TAG_METADATA_BY_KEY = new Map(ROOM_TAG_METADATA.map((entry) => [normalizeRoomTagKey(entry.key), entry]));
  const TARGET_ROOM_METADATA = [
    { name: "금성", floor: "11층", kind: MAP_CALENDAR_SPACE_TAB_MEETING, tags: ["window"] },
    { name: "지구", floor: "11층", kind: MAP_CALENDAR_SPACE_TAB_MEETING, tags: ["window"] },
    { name: "수성", floor: "11층", kind: MAP_CALENDAR_SPACE_TAB_MEETING, tags: [] },
    { name: "화성", floor: "11층", kind: MAP_CALENDAR_SPACE_TAB_MEETING, tags: [] },
    { name: "보이저", floor: "12층", kind: MAP_CALENDAR_SPACE_TAB_MEETING, tags: ["window"] },
    { name: "디스커버리", floor: "12층", kind: MAP_CALENDAR_SPACE_TAB_MEETING, tags: ["window"] },
    { name: "아폴로", floor: "12층", kind: MAP_CALENDAR_SPACE_TAB_MEETING, tags: [] },
    { name: "허블", floor: "12층", kind: MAP_CALENDAR_SPACE_TAB_MEETING, tags: [] },
    { name: "은하수", floor: "13층", kind: MAP_CALENDAR_SPACE_TAB_MEETING, tags: ["window"] },
    { name: "페1", floor: "13층", kind: MAP_CALENDAR_SPACE_TAB_PAIR, tags: [] },
    { name: "페2", floor: "13층", kind: MAP_CALENDAR_SPACE_TAB_PAIR, tags: [] },
    { name: "페3", floor: "13층", kind: MAP_CALENDAR_SPACE_TAB_PAIR, tags: [] },
    { name: "페4", floor: "13층", kind: MAP_CALENDAR_SPACE_TAB_PAIR, tags: [] },
    { name: "페5", floor: "13층", kind: MAP_CALENDAR_SPACE_TAB_PAIR, tags: [] },
    { name: "페6", floor: "13층", kind: MAP_CALENDAR_SPACE_TAB_PAIR, tags: [] },
    { name: "페7", floor: "12층", kind: MAP_CALENDAR_SPACE_TAB_PAIR, tags: [] },
    { name: "페8", floor: "12층", kind: MAP_CALENDAR_SPACE_TAB_PAIR, tags: [] },
    { name: "페9", floor: "12층", kind: MAP_CALENDAR_SPACE_TAB_PAIR, tags: [] },
    { name: "페10", floor: "12층", kind: MAP_CALENDAR_SPACE_TAB_PAIR, tags: [] },
    { name: "페11", floor: "12층", kind: MAP_CALENDAR_SPACE_TAB_PAIR, tags: [] },
    { name: "페12", floor: "12층", kind: MAP_CALENDAR_SPACE_TAB_PAIR, tags: [] },
    { name: "페13", floor: "12층", kind: MAP_CALENDAR_SPACE_TAB_PAIR, tags: [] },
    { name: "페14", floor: "12층", kind: MAP_CALENDAR_SPACE_TAB_PAIR, tags: [] },
  ];
  const TARGET_ROOM_METADATA_BY_NORMALIZED_NAME = new Map(TARGET_ROOM_METADATA.map((entry, index) => [normalizeTargetRoomName(entry.name), { ...entry, index }]));
  const MAP_CALENDAR_ROOM_FLOOR_BY_NAME = new Map(TARGET_ROOM_METADATA.map((entry) => [normalizeTargetRoomName(entry.name), entry.floor]));
  // 13층에는 목성/스튜디오/안드로메다같은방(공간 ID 276)/천왕성/코치1/코치2/토성도 API에 내려오지만,
  // 크루 예약 가능 회의실은 은하수뿐이라 레이더 대상에서 제외한다.
  const EXCLUDED_CREW_ROOM_NAMES = ["목성", "스튜디오", "안드로메다같은방", "천왕성", "코치1", "코치2", "토성"];
  const EXCLUDED_CREW_ROOM_SET = new Set(EXCLUDED_CREW_ROOM_NAMES.map((name) => normalizeTargetRoomName(name)));
  const TARGET_ROOM_NAMES = TARGET_ROOM_METADATA.map((entry) => entry.name);
  const TARGET_ROOM_SET = new Set(TARGET_ROOM_NAMES.map((name) => normalizeTargetRoomName(name)));
  const TARGET_ROOM_ORDER = new Map(TARGET_ROOM_METADATA.map((entry, index) => [normalizeTargetRoomName(entry.name), index]));

  function normalizeMapCalendarSpaceTab(value) {
    return value === MAP_CALENDAR_SPACE_TAB_PAIR ? MAP_CALENDAR_SPACE_TAB_PAIR : MAP_CALENDAR_SPACE_TAB_MEETING;
  }

  function normalizeFetchRoomType(value) {
    return value === MAP_CALENDAR_SPACE_TAB_PAIR
      ? MAP_CALENDAR_SPACE_TAB_PAIR
      : value === MAP_CALENDAR_SPACE_TAB_MEETING
        ? MAP_CALENDAR_SPACE_TAB_MEETING
        : null;
  }

  globalThis.__zzkSharedConstants = {
    MAP_CALENDAR_OVERLAY_ID,
    MAP_CALENDAR_LAUNCHER_ID,
    SLACK_MODAL_TRIGGER_ID,
    DEBUG_MODE,
    MAP_CALENDAR_STYLE_ID,
    MAP_CALENDAR_OVERLAY_TAB_MEETING_ID,
    MAP_CALENDAR_OVERLAY_TAB_PAIR_ID,
    PAGE_RESERVATION_HOOK_SCRIPT_ID,
    PAGE_RESERVATION_EVENT_TYPE,
    SLACK_COPY_MODAL_ID,
    SLACK_COPY_MODAL_STYLE_ID,
    SLACK_COPY_MODAL_BASECOAT_STYLE_ID,
    SLACK_COPY_MODAL_BASECOAT_STYLE_PATH,
    X_ICON_SVG,
    CHEVRON_LEFT_ICON_SVG,
    CHEVRON_RIGHT_ICON_SVG,
    SLACK_CHANNEL_MENTION_STORAGE_KEY,
    SLACK_CHANNEL_HISTORY_STORAGE_KEY,
    SLACK_REMINDER_LEAD_TIME_STORAGE_KEY,
    PENDING_SLACK_MODAL_STORAGE_KEY,
    BLANK_GUEST_RECOVERY_STORAGE_KEY,
    PENDING_EDIT_SUBMIT_STORAGE_KEY,
    MAP_CALENDAR_ALWAYS_OPEN_STORAGE_KEY,
    MAP_CALENDAR_SPACE_TAB_STORAGE_KEY,
    MAP_CALENDAR_SPACE_TAB_MEETING,
    MAP_CALENDAR_SPACE_TAB_PAIR,
    API_BASE_URL,
    RUNTIME_MESSAGE_TIMEOUT_MS,
    RESERVATION_SCHEDULE_STALE_MS,
    SEOUL_TIMEZONE,
    KST_DATE_PARTS_FORMATTER,
    KST_TIME_PARTS_FORMATTER,
    KST_WEEKDAY_FORMATTER,
    DEFAULT_SLACK_REMINDER_LEAD_TIME_MINUTES,
    SLACK_REMINDER_LEAD_TIME_OPTIONS,
    TIME_STEP_MINUTES,
    CALENDAR_SLOT_MIN_WIDTH,
    CALENDAR_SLOT_GAP,
    CALENDAR_HOUR_BOUNDARY_LINE_WIDTH,
    CALENDAR_HOUR_BOUNDARY_SIDE_GAP,
    MAX_RESERVATION_BLOCKS,
    CALENDAR_FLOOR_COL_WIDTH,
    CALENDAR_ROOM_COL_WIDTH,
    CALENDAR_ROW_GAP,
    CALENDAR_SIDE_MARGIN,
    DRAG_SAFE_TOP,
    NAV_SAFE_Z_INDEX,
    ROOM_TAG_METADATA,
    ROOM_TAG_METADATA_BY_KEY,
    TARGET_ROOM_METADATA,
    TARGET_ROOM_METADATA_BY_NORMALIZED_NAME,
    MAP_CALENDAR_ROOM_FLOOR_BY_NAME,
    EXCLUDED_CREW_ROOM_NAMES,
    EXCLUDED_CREW_ROOM_SET,
    TARGET_ROOM_NAMES,
    TARGET_ROOM_SET,
    TARGET_ROOM_ORDER,
    normalizeRoomTagKey,
    normalizeTargetRoomName,
    normalizeMapCalendarSpaceTab,
    normalizeFetchRoomType,
  };
})();
