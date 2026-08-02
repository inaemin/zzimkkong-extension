import {
  normalizeTextForMatch,
  getErrorMessage,
  pushDebugEvent,
  debugLog,
  getDebugEvents,
  clearDebugEvents,
} from "./utils/shared.js";
import {
  readStoredBoolean,
  writeStoredBoolean,
  readStoredText,
  writeStoredText,
  readStoredNumber,
  writeStoredNumber,
} from "./utils/storage.js";
import {
  normalizeDateString,
  isDateString,
  parseHourMinute,
  minuteToHourMinute,
  parseLocalizedHourMinute,
  extractHourMinute,
  normalizeHourMinute,
  normalizeToTenMinute,
  isTenMinuteAligned,
  formatDate,
  getTodayDateInKST,
  getCurrentMinuteOfDayInKST,
  sanitizeDateForApi,
  sanitizeTimeForApi,
  getNextHourRange,
  getEarliestSelectableMinuteForDate,
  addDaysToDateString,
  formatKSTWeekday,
  formatDateSelectorText,
} from "./utils/date-time.js";
import {
  getSharingMapId,
  isLmsSpaceReservationPage,
  isRadarSupportedPage,
} from "./utils/routes.js";
import {
  normalizeSlackFieldText,
  normalizeSlackChannelToken,
  normalizeSlackReminderLeadMinutes,
  formatSlackReminderLeadOptionLabel,
  computeSlackReminderDateTime,
} from "./features/slack/shared.js";
import {
  getInputAssociatedLabelText,
  buildHostInputDescriptor,
  normalizeHostReservationOwnerCandidate,
  normalizeHostRoomCandidate,
  extractKnownRoomName,
  getControlAssociatedLabelText,
  buildHostFieldDescriptor,
  readHostFieldDisplayValue,
} from "./features/form-fields/shared.js";
import {
  buildSlotStates,
  buildSlotTitle,
  groupRoomsByFloor,
  resolveSelectionEndIndex,
} from "./features/radar/slot-model.js";
import { createElement } from "react";
import { flushSync } from "react-dom";
import { closeFloorMapZoom, openFloorMapZoom } from "./ui/floor-map-zoom-modal.js";
import { RadarShell } from "./ui/components/radar-shell.js";
import { getRadarOverlayRoot } from "./ui/radar-overlay-mount.js";
import { renderRadarHeader } from "./ui/radar-header-mount.js";
import { renderRadarGrid } from "./ui/radar-grid-mount.js";
import { renderRadarError } from "./ui/radar-error-mount.js";
import { ensurePageTailwindStyle } from "./ui/page-styles.js";
import {
  MAP_CALENDAR_OVERLAY_ID,
  MAP_CALENDAR_LAUNCHER_ID,
  SLACK_MODAL_TRIGGER_ID,
  DEBUG_MODE,
  MAP_CALENDAR_STYLE_ID,
  MAP_CALENDAR_OVERLAY_TAB_MEETING_ID,
  MAP_CALENDAR_OVERLAY_TAB_PAIR_ID,
  PAGE_RESERVATION_EVENT_TYPE,
  SLACK_COPY_MODAL_ID,
  SLACK_COPY_MODAL_STYLE_ID,
  SLACK_COPY_MODAL_BASECOAT_STYLE_ID,
  SLACK_COPY_MODAL_BASECOAT_STYLE_PATH,
  X_ICON_SVG,
  SLACK_CHANNEL_MENTION_STORAGE_KEY,
  SLACK_CHANNEL_HISTORY_STORAGE_KEY,
  SLACK_REMINDER_LEAD_TIME_STORAGE_KEY,
  PENDING_SLACK_MODAL_STORAGE_KEY,
  MAP_CALENDAR_ALWAYS_OPEN_STORAGE_KEY,
  MAP_CALENDAR_SPACE_TAB_STORAGE_KEY,
  MAP_CALENDAR_WIDTH_STORAGE_KEY,
  MAP_CALENDAR_OFFSET_STORAGE_KEY,
  MAP_CALENDAR_FLOORMAP_OPEN_STORAGE_KEY,
  MAP_CALENDAR_MIN_WIDTH,
  MAP_CALENDAR_VIEWPORT_MARGIN,
  MAP_CALENDAR_CURRENT_TIME_SCROLL_LEAD_MINUTES,
  MAP_CALENDAR_SPACE_TAB_MEETING,
  MAP_CALENDAR_SPACE_TAB_PAIR,
  RUNTIME_MESSAGE_TIMEOUT_MS,
  RESERVATION_SCHEDULE_STALE_MS,
  SEOUL_TIMEZONE,
  KST_DATE_PARTS_FORMATTER,
  KST_TIME_PARTS_FORMATTER,
  KST_WEEKDAY_FORMATTER,
  DEFAULT_SLACK_REMINDER_LEAD_TIME_MINUTES,
  SLACK_REMINDER_LEAD_TIME_OPTIONS,
  TIME_STEP_MINUTES,
  LMS_DEFAULT_RESERVATION_MINUTES,
  CALENDAR_SLOT_MIN_WIDTH,
  LMS_CALENDAR_SLOT_MIN_WIDTH,
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
  TARGET_ROOM_NAMES,
  TARGET_ROOM_SET,
  TARGET_ROOM_ORDER,
  normalizeRoomTagKey,
  normalizeTargetRoomName,
  normalizeMapCalendarSpaceTab,
  normalizeFetchRoomType,
} from "./constants/runtime.js";
import {
  clearReservationCache as clearLmsReservationCache,
  fetchAvailability as fetchLmsAvailability,
  fetchDailySchedule as fetchLmsDailySchedule,
  fetchQuota as fetchLmsQuota,
  loadSpaceContext as loadLmsSpaceContext,
} from "./services/lms-data/shared.js";
import { getAvailableFloorMapFloors, getFloorMapDataUri } from "./features/radar/floor-maps.js";
import {
  findGuestReservationTabContainer as radarFindGuestReservationTabContainer,
  findGuestReservationTabStyleSource as radarFindGuestReservationTabStyleSource,
} from "./features/radar/shared.js";
import { createRadarWorkflow } from "./features/radar/workflow.js";
import { createRadarFormSync } from "./features/radar/form-sync.js";
import { createSlackWorkflow } from "./features/slack/workflow.js";
import { createSlackSuccessFlow } from "./features/slack/success-flow.js";

// 이 파일은 3단계에서 React 컴포넌트로 다시 쓴다. 지금은 전역 소비만 import 로 옮긴다.
(() => {
  if (window.__zzkAvailabilityLensLoaded) {
    return;
  }

  window.__zzkAvailabilityLensLoaded = true;

  const findGuestReservationTabContainer = () =>
    radarFindGuestReservationTabContainer({
      isInsideExtensionSurface,
      isElementVisible,
    });
  const findGuestReservationTabStyleSource = () =>
    radarFindGuestReservationTabStyleSource({
      isInsideExtensionSurface,
      isElementVisible,
    });

  // 드래그로 옮긴 모달 위치({x,y})를 저장소에 JSON 으로 보관한다.
  function readStoredMapCalendarOffset() {
    const fallback = { x: 0, y: 0 };
    const raw = readStoredText(MAP_CALENDAR_OFFSET_STORAGE_KEY, "");
    if (!raw) {
      return fallback;
    }
    try {
      const parsed = JSON.parse(raw);
      const x = Number(parsed?.x);
      const y = Number(parsed?.y);
      if (Number.isFinite(x) && Number.isFinite(y)) {
        return { x, y };
      }
    } catch (error) {
      // 파싱 실패 시 기본 위치를 쓴다.
    }
    return fallback;
  }

  function persistMapCalendarOffset(offset) {
    const x = Number(offset?.x);
    const y = Number(offset?.y);
    if (!Number.isFinite(x) || !Number.isFinite(y)) {
      return;
    }
    writeStoredText(MAP_CALENDAR_OFFSET_STORAGE_KEY, JSON.stringify({ x, y }));
  }

  function isFloorMapSectionOpen() {
    // 기본은 접힘.
    return readStoredBoolean(MAP_CALENDAR_FLOORMAP_OPEN_STORAGE_KEY, false);
  }

  function persistFloorMapSectionOpen(open) {
    writeStoredBoolean(MAP_CALENDAR_FLOORMAP_OPEN_STORAGE_KEY, open);
  }

  // 타임라인 아래에 층별 평면도(SVG)를 접이식으로 붙인다. lms+ 에는 지도가 없어
  // 공간의 물리적 위치를 알 수 없으므로, 평면도로 페어룸 등의 위치를 확인하게 한다.

  const state = {
    mounted: false,
    loading: false,
    availabilityInflightToken: null,
    // 같은 조건(날짜·시간·탭)으로 다시 조회할 때 재사용할 마지막 응답.
    // 타임블록을 연속으로 누르면 매번 회의실 수만큼 요청이 나가므로 TTL 로 막는다.
    availabilityCache: new Map(),
    availabilityCacheFetchedAt: new Map(),
    // 아직 응답이 안 온 조회. TTL 캐시는 응답이 온 뒤에만 유효하므로,
    // 응답 전에 다시 눌린 경우는 같은 Promise 에 합류시켜 중복 요청을 막는다.
    availabilityInflightByToken: new Map(),
    pendingAvailabilityRefresh: false,
    latestRooms: [],
    latestRoomsBySpaceTab: new Map(),
    scheduleOverlayEnabled: true,
    scheduleCache: new Map(),
    scheduleCacheFetchedAtByDate: new Map(),
    scheduleInflightByDate: new Map(),
    lastRenderedScheduleDate: null,
    lastRenderedScheduleTab: null,
    scheduleLoadingDate: null,
    scheduleLoadingTab: null,
    activeScheduleDate: null,
    activeScheduleTab: null,
    mapCalendarVisible: readStoredBoolean(MAP_CALENDAR_ALWAYS_OPEN_STORAGE_KEY, true),
    mapCalendarAlwaysOpen: readStoredBoolean(MAP_CALENDAR_ALWAYS_OPEN_STORAGE_KEY, true),
    mapCalendarSpaceTab: normalizeMapCalendarSpaceTab(
      readStoredText(MAP_CALENDAR_SPACE_TAB_STORAGE_KEY, MAP_CALENDAR_SPACE_TAB_MEETING),
    ),
    mapCalendarCollapsed: false,
    mapCalendarWidth: readStoredNumber(MAP_CALENDAR_WIDTH_STORAGE_KEY, null),
    mapCalendarCurrentTimeScrollDate: null,
    // 드래그로 옮긴 모달 위치를 저장소에서 복원한다.
    mapCalendarOffset: readStoredMapCalendarOffset(),
    appliedSelection: null,
    timelineSelectionRequestId: 0,
    timelineSelectionApplyTimer: null,
    currentSharingMapId: null,
    inputRefreshTimer: null,
    autoScheduleRefreshTimer: null,
    mutationGuestUiSyncTimer: null,
    topNavBypassInstalled: false,
    topNavForwarding: false,
    hostTimePickerIdleClass: null,
    lastHostTimePickerManualInteractionAt: 0,
    hostDateSyncDepth: 0,
    lastGuestRouteChangeAt: 0,
    lastObservedPathname: location.pathname,
    lastObservedRouteKey: getCurrentRouteKey(),
    lastAutoOpenPath: null,
    editReservationBaselineConstraint: null,
    editReservationBaselinePathKey: "",
    latestMapName: "",
    reservationIntentWatcherInstalled: false,
    reservationMessageListenerInstalled: false,
    reservationOwnerWatcherInstalled: false,
    hostTimePickerInteractionWatcherInstalled: false,
    historyHookInstalled: false,
    lastReservationActionAt: 0,
    lastReservationContext: null,
    lastReservationAttemptId: "",
    reservationAttemptSequence: 0,
    pendingReservationAttempts: new Map(),
    lastKnownReservationOwnerName: "",
    lastSlackModalFingerprint: "",
    lastSlackModalShownAt: 0,
    pendingSlackModalContext: null,
    pendingSlackModalRequiresNonEditPage: false,
    pendingSlackModalReloadAttempted: false,
    pendingSlackModalTimer: null,
    slackModalKeydownHandler: null,
    slackModalVisible: false,
    mapCalendarSuppressedBySlack: false,
    slackChannelMention: readStoredText(SLACK_CHANNEL_MENTION_STORAGE_KEY, ""),
    slackChannelHistory: readStoredChannelTokens(SLACK_CHANNEL_HISTORY_STORAGE_KEY),
    slackReminderLeadMinutes: normalizeSlackReminderLeadMinutes(
      readStoredText(
        SLACK_REMINDER_LEAD_TIME_STORAGE_KEY,
        String(DEFAULT_SLACK_REMINDER_LEAD_TIME_MINUTES),
      ),
    ),
    lastLauncherRemountAt: 0,
    elements: null,
  };

  function boot() {
    if (!document.body) {
      window.addEventListener("DOMContentLoaded", boot, { once: true });
      return;
    }

    syncMapCalendarAlwaysOpenPreference();
    syncSlackChannelMentionPreference();
    syncSlackReminderLeadTimePreference();
    restorePendingSlackModalState();

    hookHistoryChanges();
    window.addEventListener("popstate", handleLocationChange);
    window.addEventListener("pageshow", handleLocationChange);
    document.addEventListener("change", handleHostDateChange, true);
    installReservationIntentWatcher();
    installReservationNetworkMessageListener();
    installReservationOwnerWatcher();
    installHostTimePickerInteractionWatcher();

    if (isRadarSupportedPage()) {
      if (!isGuestUiReadyForActivation()) {
        removeMapCalendarLauncher();
        removeMapCalendarOverlay();
        state.mapCalendarVisible = false;
        state.lastAutoOpenPath = null;
      } else {
        queueSlackModalFromPersistedEditSubmitIfNeeded("boot-ready");
        if (state.mapCalendarAlwaysOpen) {
          state.scheduleOverlayEnabled = true;
          state.mapCalendarVisible = true;
        }
        ensureTopNavigationClickability();
        installTopNavigationClickBypass();
        ensurePanel();
        ensureSlackModalTrigger();
        ensureMapCalendarLauncher();
        const openedPendingSlackModal = tryOpenPendingSlackCopyModal();
        if (isMapCalendarModalOpenRequested()) {
          if (!openedPendingSlackModal) {
            openMapCalendarModal();
          }
        }
        refreshAvailability();
      }
    }

    const observer = new MutationObserver((records) => {
      scheduleGuestUiMutationSync(records);
    });

    const observerRoot =
      document.documentElement instanceof HTMLElement ? document.documentElement : document.body;
    observer.observe(observerRoot, {
      childList: true,
      subtree: true,
    });
  }

  function scheduleGuestUiMutationSync(records) {
    if (!hasRelevantGuestUiMutation(records)) {
      return;
    }

    if (Number.isInteger(state.mutationGuestUiSyncTimer)) {
      window.clearTimeout(state.mutationGuestUiSyncTimer);
    }

    state.mutationGuestUiSyncTimer = window.setTimeout(() => {
      state.mutationGuestUiSyncTimer = null;
      runGuestUiMutationSync("mutation-observer");
    }, 120);
  }

  function hasRelevantGuestUiMutation(records) {
    if (!Array.isArray(records) || records.length === 0) {
      return true;
    }

    return records.some((record) => {
      if (!record || record.type !== "childList") {
        return true;
      }

      const isExtensionOwnedRecord = isExtensionOwnedMutationNode(record.target);

      const changedNodes = [
        ...Array.from(record.addedNodes || []),
        ...Array.from(record.removedNodes || []),
      ];
      if (changedNodes.length === 0) {
        return false;
      }

      if (isExtensionOwnedRecord) {
        return changedNodes.some((node) => {
          return node instanceof Element && !isExtensionOwnedMutationNode(node);
        });
      }

      return changedNodes.some((node) => !isExtensionOwnedMutationNode(node));
    });
  }

  function isExtensionOwnedMutationNode(node) {
    if (!(node instanceof Element)) {
      return false;
    }

    return isInsideExtensionSurface(node) || node.id === "zzk-availability-lens-root";
  }

  function runGuestUiMutationSync(reason) {
    pushDebugEvent("guest-ui", "mutation-sync", { reason });
    if (!(document.body instanceof HTMLBodyElement)) {
      return;
    }
    if (!isRadarSupportedPage()) {
      teardownGuestUi();
      return;
    }
    queueSlackModalFromPersistedEditSubmitIfNeeded("mutation-observer");
    if (!isGuestUiReadyForActivation()) {
      removeMapCalendarLauncher();
      removeMapCalendarOverlay();
      state.mapCalendarVisible = false;
      state.lastAutoOpenPath = null;
      return;
    }
    ensureTopNavigationClickability();
    installTopNavigationClickBypass();
    ensurePanel();
    ensureSlackModalTrigger();
    ensureMapCalendarLauncher();
    const openedPendingSlackModal = tryOpenPendingSlackCopyModal();
    const sharingMapId = getSharingMapId();
    if (sharingMapId && state.currentSharingMapId !== sharingMapId) {
      syncMapCalendarAlwaysOpenPreference();
      if (state.mapCalendarAlwaysOpen) {
        state.scheduleOverlayEnabled = true;
        if (state.elements?.scheduleToggle instanceof HTMLInputElement) {
          state.elements.scheduleToggle.checked = true;
        }
        state.mapCalendarVisible = true;
        if (!openedPendingSlackModal) {
          openMapCalendarModal();
        }
      }

      if (state.loading) {
        scheduleInputRefresh(120);
      } else {
        refreshAvailability();
      }
    }
    if (
      state.scheduleOverlayEnabled &&
      isMapCalendarModalOpenRequested() &&
      state.activeScheduleDate &&
      !document.getElementById(MAP_CALENDAR_OVERLAY_ID)
    ) {
      scheduleCalendarOverlayRefresh();
    }
  }

  function ensurePanel() {
    ensureTopNavigationClickability();

    if (state.mounted && state.elements) {
      return;
    }

    state.elements = createRuntimePanelStateElements();
    state.mounted = true;
    initializeDefaults(state.elements);
    syncMapCalendarSpaceTabButtons();

    const sharingMapId = getSharingMapId();
    if (sharingMapId && state.currentSharingMapId !== sharingMapId) {
      syncMapCalendarAlwaysOpenPreference();
      if (state.mapCalendarAlwaysOpen) {
        state.scheduleOverlayEnabled = true;
        if (state.elements?.scheduleToggle instanceof HTMLInputElement) {
          state.elements.scheduleToggle.checked = true;
        }
        state.mapCalendarVisible = true;
      }
    }
  }

  function createRuntimePanelStateElements() {
    const createButton = () => {
      const button = document.createElement("button");
      button.type = "button";
      return button;
    };
    const createTimeInput = () => {
      const input = document.createElement("input");
      input.type = "time";
      input.step = "600";
      input.min = "00:00";
      return input;
    };

    const dateInput = document.createElement("input");
    dateInput.type = "date";

    const startInput = createTimeInput();
    const endInput = createTimeInput();

    const highlightToggle = document.createElement("input");
    highlightToggle.type = "checkbox";
    const scheduleToggle = document.createElement("input");
    scheduleToggle.type = "checkbox";

    const statusMessage = document.createElement("p");
    const totalCount = document.createElement("strong");
    const availableCount = document.createElement("strong");
    const occupiedCount = document.createElement("strong");
    const availableList = document.createElement("ul");
    const occupiedList = document.createElement("ul");
    const updatedAt = document.createElement("p");

    return {
      form: document.createElement("form"),
      spaceTabMeetingButton: createButton(),
      spaceTabPairButton: createButton(),
      refreshButton: createButton(),
      datePrevButton: createButton(),
      dateInput,
      dateNextButton: createButton(),
      dateTodayButton: createButton(),
      dateWeekdayLabel: document.createElement("span"),
      roomTagLegend: document.createElement("div"),
      startInput,
      endInput,
      highlightToggle,
      scheduleToggle,
      statusMessage,
      totalCount,
      availableCount,
      occupiedCount,
      availableList,
      occupiedList,
      updatedAt,
    };
  }

  function ensureTopNavigationClickability() {
    const targets = findTopNavigationTargets();
    if (targets.length === 0) {
      return;
    }

    targets.forEach((target) => {
      const computed = getComputedStyle(target);
      if (computed.position === "static") {
        target.style.position = "relative";
      }

      const currentZIndex = Number.parseInt(computed.zIndex, 10);
      if (!Number.isFinite(currentZIndex) || currentZIndex < NAV_SAFE_Z_INDEX) {
        target.style.zIndex = String(NAV_SAFE_Z_INDEX);
      }

      target.style.pointerEvents = "auto";
    });
  }

  function installTopNavigationClickBypass() {
    if (state.topNavBypassInstalled) {
      return;
    }
    state.topNavBypassInstalled = true;

    document.addEventListener(
      "click",
      (event) => {
        if (!isRadarSupportedPage() || state.topNavForwarding) {
          return;
        }
        if (!(event instanceof MouseEvent)) {
          return;
        }

        const targets = findTopNavigationTargets();
        if (targets.length === 0) {
          return;
        }

        const x = event.clientX;
        const y = event.clientY;

        const expectedTarget = targets.find((target) => {
          const rect = target.getBoundingClientRect();
          return pointInRect(x, y, rect);
        });

        if (!(expectedTarget instanceof HTMLElement)) {
          return;
        }

        if (event.target instanceof Node && expectedTarget.contains(event.target)) {
          return;
        }

        const actualTopElement = document.elementFromPoint(x, y);
        if (!(actualTopElement instanceof Element) || expectedTarget.contains(actualTopElement)) {
          return;
        }

        event.preventDefault();
        event.stopImmediatePropagation();

        state.topNavForwarding = true;
        try {
          expectedTarget.click();
        } finally {
          state.topNavForwarding = false;
        }
      },
      true,
    );
  }

  function findTopNavigationTargets() {
    const myPageLink = Array.from(document.querySelectorAll("a")).find(
      (anchor) =>
        anchor instanceof HTMLAnchorElement &&
        (anchor.textContent || "").includes("마이 페이지") &&
        anchor.getAttribute("href") === "/guest",
    );

    const logoutButton = Array.from(document.querySelectorAll("button")).find(
      (button) =>
        button instanceof HTMLButtonElement && (button.textContent || "").includes("로그아웃"),
    );

    return [myPageLink, logoutButton].filter((node) => node instanceof HTMLElement);
  }

  function pointInRect(x, y, rect) {
    return x >= rect.left && x <= rect.right && y >= rect.top && y <= rect.bottom;
  }

  async function refreshAvailability() {
    if (!isRadarSupportedPage()) {
      return;
    }

    if (!state.elements) {
      ensurePanel();
    }
    if (!state.elements) {
      return;
    }

    const sharingMapId = getSharingMapId();
    if (!sharingMapId) {
      setStatus("공유 맵 정보를 찾지 못했습니다.", "error");
      return;
    }

    const previousSharingMapId = state.currentSharingMapId;
    if (previousSharingMapId !== sharingMapId) {
      const isSharingMapSwitch = Boolean(previousSharingMapId);
      state.currentSharingMapId = sharingMapId;
      state.availabilityInflightToken = null;
      state.pendingAvailabilityRefresh = false;
      state.latestRoomsBySpaceTab.clear();
      if (isSharingMapSwitch) {
        state.scheduleCache.clear();
        state.scheduleCacheFetchedAtByDate.clear();
        clearAvailabilityCache();
        state.scheduleInflightByDate.clear();
        state.activeScheduleDate = null;
        state.activeScheduleTab = null;
        state.scheduleLoadingDate = null;
        state.scheduleLoadingTab = null;
        removeMapCalendarOverlay();
      }
      resetTimelineSelectionState();
    }

    const date = normalizeDateInput(state.elements.dateInput);
    const startTime = normalizeTimeInput(state.elements.startInput);
    const endTime = normalizeTimeInput(state.elements.endInput);

    if (!date || !startTime || !endTime) {
      setStatus("날짜와 시작/종료 시간을 모두 선택해 주세요.", "error");
      return;
    }

    const isStartValid = validateTenMinuteField(state.elements.startInput);
    const isEndValid = validateTenMinuteField(state.elements.endInput);

    if (!isStartValid || !isEndValid) {
      setStatus("시간은 10분 단위로 선택해 주세요.", "error");
      return;
    }

    if (startTime >= endTime) {
      setStatus("종료 시간은 시작 시간보다 늦어야 합니다.", "error");
      return;
    }

    const roomType = normalizeMapCalendarSpaceTab(state.mapCalendarSpaceTab);
    const availabilityToken = `${sharingMapId}|${date}|${startTime}|${endTime}|${roomType}`;

    // 타임블록을 연속으로 누르면 같은 조건으로 반복 조회된다. TTL 안이면 재사용한다.
    const cachedAvailability = getFreshAvailabilityCache(availabilityToken);
    if (cachedAvailability) {
      pushDebugEvent("availability", "cache-hit", { token: availabilityToken });
      applyAvailabilityData(cachedAvailability, { roomType, date, startTime, endTime });
      if (state.scheduleOverlayEnabled) {
        try {
          await refreshDailySchedule(date);
        } catch {
          removeMapCalendarOverlay();
        }
      }
      return;
    }

    // TTL 캐시는 응답이 도착한 뒤에만 유효하다. 응답 전에 또 눌린 경우는
    // 진행 중인 요청에 합류시켜 회의실 수만큼의 요청이 배로 나가는 걸 막는다.
    const existingInflight = state.availabilityInflightByToken.get(availabilityToken);
    if (existingInflight instanceof Promise) {
      pushDebugEvent("availability", "inflight-join", { token: availabilityToken });
      await existingInflight;
      return;
    }

    state.loading = true;
    state.pendingAvailabilityRefresh = false;
    setStatus(`${getMapCalendarSpaceTabLabel()} 현황을 불러오는 중입니다...`, "loading");
    state.elements.refreshButton.disabled = true;

    const inflight = sendMessage({
      type: "ZZK_FETCH_AVAILABILITY",
      payload: {
        sharingMapId,
        date,
        startTime,
        endTime,
        roomType,
      },
    });
    state.availabilityInflightByToken.set(availabilityToken, inflight);

    try {
      state.availabilityInflightToken = availabilityToken;
      const response = await inflight;

      if (!response?.ok) {
        throw new Error(response?.error || "데이터를 불러오지 못했습니다.");
      }

      const data = response.data;
      if (state.availabilityInflightToken !== availabilityToken) {
        return;
      }
      if (state.currentSharingMapId !== sharingMapId) {
        return;
      }
      if (normalizeMapCalendarSpaceTab(state.mapCalendarSpaceTab) !== roomType) {
        return;
      }

      cacheAvailability(availabilityToken, data);
      applyAvailabilityData(data, { roomType, date, startTime, endTime });

      if (state.scheduleOverlayEnabled) {
        try {
          await refreshDailySchedule(date);
        } catch {
          removeMapCalendarOverlay();
        }
      }
    } catch (error) {
      setStatus(getErrorMessage(error), "error");
    } finally {
      if (state.availabilityInflightByToken.get(availabilityToken) === inflight) {
        state.availabilityInflightByToken.delete(availabilityToken);
      }
      if (state.availabilityInflightToken === availabilityToken) {
        state.availabilityInflightToken = null;
      }
      state.loading = false;
      if (state.elements) {
        state.elements.refreshButton.disabled = false;
      }
      // 조건이 바뀌어 대기 중인 갱신이 있으면 그때만 다시 돈다.
      // (같은 조건 반복은 위의 inflight/TTL 에서 이미 걸러진다)
      if (state.pendingAvailabilityRefresh) {
        state.pendingAvailabilityRefresh = false;
        refreshAvailability();
      }
    }
  }

  function renderCounts(counts) {
    const rooms = Array.isArray(counts) ? counts : [];
    const availableCount = rooms.filter((room) => room.isAvailable).length;
    state.elements.totalCount.textContent = String(rooms.length);
    state.elements.availableCount.textContent = String(availableCount);
    state.elements.occupiedCount.textContent = String(Math.max(0, rooms.length - availableCount));
  }

  function renderRoomLists(rooms) {
    const available = rooms.filter((room) => room.isAvailable);
    const occupied = rooms.filter((room) => !room.isAvailable);

    renderPanelRoomTagLegend(rooms);
    fillList(state.elements.availableList, available, "available");
    fillList(state.elements.occupiedList, occupied, "occupied");
  }

  function syncMapCalendarSpaceTabButtons() {
    if (!state.elements) {
      syncOpenMapCalendarSpaceTabButtons();
      return;
    }

    const tabs = [
      [state.elements.spaceTabMeetingButton, MAP_CALENDAR_SPACE_TAB_MEETING],
      [state.elements.spaceTabPairButton, MAP_CALENDAR_SPACE_TAB_PAIR],
    ];

    tabs.forEach(([button, tab]) => {
      if (!(button instanceof HTMLButtonElement)) {
        return;
      }
      const isActive = state.mapCalendarSpaceTab === tab;
      button.setAttribute("aria-selected", isActive ? "true" : "false");
      button.tabIndex = isActive ? 0 : -1;
    });

    syncOpenMapCalendarSpaceTabButtons();
  }

  function syncOpenMapCalendarSpaceTabButtons() {
    const tabs = [
      [
        document.getElementById(MAP_CALENDAR_OVERLAY_TAB_MEETING_ID),
        MAP_CALENDAR_SPACE_TAB_MEETING,
      ],
      [document.getElementById(MAP_CALENDAR_OVERLAY_TAB_PAIR_ID), MAP_CALENDAR_SPACE_TAB_PAIR],
    ];

    tabs.forEach(([button, tab]) => {
      if (!(button instanceof HTMLButtonElement)) {
        return;
      }
      const isActive = state.mapCalendarSpaceTab === tab;
      button.setAttribute("aria-selected", isActive ? "true" : "false");
      button.tabIndex = isActive ? 0 : -1;
    });
  }

  function rerenderMapCalendarViews() {
    const activeTab = normalizeMapCalendarSpaceTab(state.mapCalendarSpaceTab);
    const visibleRooms = getLatestRoomsForSpaceTab(activeTab);
    renderCounts(visibleRooms);
    renderRoomLists(visibleRooms);

    const activeDate = normalizeDateInput(state.elements?.dateInput) || state.activeScheduleDate;
    const isModalOpen = isMapCalendarModalOpenRequested();
    const cachedSchedule = activeDate ? getFreshScheduleCache(activeDate, activeTab) : null;
    if (cachedSchedule && isModalOpen) {
      renderMapCalendarOverlay(cachedSchedule);
      return;
    }

    if (activeDate && isModalOpen) {
      refreshDailySchedule(activeDate).catch((error) => {
        if (
          state.activeScheduleDate === activeDate &&
          state.activeScheduleTab === activeTab &&
          state.elements
        ) {
          setStatus(getErrorMessage(error), "error");
        }
      });
    }
  }

  function setMapCalendarSpaceTab(tab, { persist = true } = {}) {
    const normalizedTab = normalizeMapCalendarSpaceTab(tab);
    if (state.mapCalendarSpaceTab === normalizedTab) {
      syncMapCalendarSpaceTabButtons();
      rerenderMapCalendarViews();
      return;
    }

    state.mapCalendarSpaceTab = normalizedTab;
    syncMapCalendarSpaceTabButtons();
    if (persist) {
      persistMapCalendarSpaceTab(normalizedTab);
    }
    rerenderMapCalendarViews();
    refreshAvailability();
  }

  function fillList(container, rooms, type) {
    container.textContent = "";

    if (rooms.length === 0) {
      const empty = document.createElement("li");
      empty.className = "zzk-empty";
      empty.textContent = type === "available" ? "비어 있는 공간 없음" : "사용 중인 공간 없음";
      container.appendChild(empty);
      return;
    }

    const fragment = document.createDocumentFragment();
    rooms.forEach((room) => {
      const item = document.createElement("li");
      item.className = `zzk-room zzk-room-${type}`;
      renderRoomLabel(item, room, {
        formatter: formatPlainRoomLabel,
        titleMode: "list",
      });
      item.title = `공간 ID: ${room.id}`;
      fragment.appendChild(item);
    });
    container.appendChild(fragment);
  }

  function renderPanelRoomTagLegend(rooms) {
    const legend = state.elements?.roomTagLegend;
    if (!(legend instanceof HTMLElement)) {
      return;
    }

    renderRoomTagLegend(legend);
  }

  // 예약 현황(availability)은 회의실 수만큼 요청을 보낸다. 타임블록을 연속으로
  // 누르면 그때마다 전량 재조회되므로, 스케줄 캐시와 같은 TTL 로 재사용한다.
  function getFreshAvailabilityCache(token) {
    const fetchedAt = state.availabilityCacheFetchedAt.get(token);
    if (!Number.isFinite(fetchedAt)) {
      return null;
    }

    if (Date.now() - fetchedAt >= RESERVATION_SCHEDULE_STALE_MS) {
      state.availabilityCache.delete(token);
      state.availabilityCacheFetchedAt.delete(token);
      return null;
    }

    return state.availabilityCache.get(token) || null;
  }

  function cacheAvailability(token, data) {
    state.availabilityCache.set(token, data);
    state.availabilityCacheFetchedAt.set(token, Date.now());
  }

  function clearAvailabilityCache() {
    state.availabilityCache.clear();
    state.availabilityCacheFetchedAt.clear();
    state.availabilityInflightByToken.clear();
  }

  // 예약이 새로 생기면 캐시된 예약 목록이 즉시 낡는다. TTL(3초)을 기다리면
  // 방금 잡은 예약이 레이더에 안 보이므로, 성공 즉시 전 계층 캐시를 비우고 다시 그린다.
  function invalidateReservationCaches() {
    if (typeof clearLmsReservationCache === "function") {
      clearLmsReservationCache();
    }
    clearAvailabilityCache();
    state.scheduleCache.clear();
    state.scheduleCacheFetchedAtByDate.clear();
    state.scheduleInflightByDate.clear();
    pushDebugEvent("availability", "cache-invalidated", {
      reason: "reservation-mutated",
    });
  }

  // 새로 받은 응답이든 캐시된 응답이든 화면 반영은 같은 경로를 쓴다.
  function applyAvailabilityData(data, { roomType, date, startTime, endTime }) {
    const rooms = Array.isArray(data?.rooms) ? data.rooms : [];

    state.latestRooms = rooms;
    state.latestRoomsBySpaceTab.set(roomType, rooms);
    state.latestMapName = typeof data?.mapName === "string" ? data.mapName : state.latestMapName;

    renderCounts(rooms);
    renderRoomLists(rooms);
    renderUpdatedAt();

    setStatus(`${data?.mapName || "공간 지도"} · ${date} ${startTime}~${endTime} 기준`, "success");
  }

  function isScheduleCacheStale(date) {
    const fetchedAt = state.scheduleCacheFetchedAtByDate.get(date);
    if (!Number.isFinite(fetchedAt)) {
      return false;
    }

    return Date.now() - fetchedAt >= RESERVATION_SCHEDULE_STALE_MS;
  }

  function getFreshScheduleCache(date) {
    return getFreshScheduleCacheForTab(date, state.mapCalendarSpaceTab);
  }

  function buildScheduleScopeKey(
    date,
    tab = state.mapCalendarSpaceTab,
    sharingMapId = state.currentSharingMapId || getSharingMapId(),
  ) {
    const normalizedDate = normalizeDateString(typeof date === "string" ? date : "");
    if (!isDateString(normalizedDate)) {
      return "";
    }

    const normalizedSharingMapId = typeof sharingMapId === "string" ? sharingMapId.trim() : "";
    if (!normalizedSharingMapId) {
      return "";
    }

    return `${normalizedSharingMapId}|${normalizedDate}|${normalizeMapCalendarSpaceTab(tab)}`;
  }

  function getFreshScheduleCacheForTab(
    date,
    tab = state.mapCalendarSpaceTab,
    sharingMapId = state.currentSharingMapId || getSharingMapId(),
  ) {
    const normalizedDate = normalizeDateString(typeof date === "string" ? date : "");
    if (!isDateString(normalizedDate)) {
      return null;
    }

    const scopeKey = buildScheduleScopeKey(normalizedDate, tab, sharingMapId);
    if (!scopeKey) {
      return null;
    }

    const cached = state.scheduleCache.get(scopeKey);
    if (!cached) {
      return null;
    }

    if (isScheduleCacheStale(scopeKey)) {
      state.scheduleCache.delete(scopeKey);
      state.scheduleCacheFetchedAtByDate.delete(scopeKey);
      return null;
    }

    return cached;
  }

  function cacheScheduleForDate(
    date,
    scheduleData,
    tab = state.mapCalendarSpaceTab,
    sharingMapId = state.currentSharingMapId || getSharingMapId(),
  ) {
    const normalizedDate = normalizeDateString(typeof date === "string" ? date : "");
    if (!isDateString(normalizedDate)) {
      return;
    }

    const scopeKey = buildScheduleScopeKey(normalizedDate, tab, sharingMapId);
    if (!scopeKey) {
      return;
    }

    state.scheduleCache.set(scopeKey, scheduleData);
    state.scheduleCacheFetchedAtByDate.set(scopeKey, Date.now());
  }

  function isScheduleOverlayRenderedForDate(date, tab = state.mapCalendarSpaceTab) {
    if (!isDateString(date) || !isMapCalendarModalOpenRequested()) {
      return false;
    }

    const overlay = document.getElementById(MAP_CALENDAR_OVERLAY_ID);
    return (
      overlay instanceof HTMLElement &&
      state.lastRenderedScheduleDate === date &&
      state.lastRenderedScheduleTab === normalizeMapCalendarSpaceTab(tab)
    );
  }

  function setScheduleLoadingDate(date, isLoading, tab = state.mapCalendarSpaceTab) {
    const normalizedDate = normalizeDateString(typeof date === "string" ? date : "");
    const normalizedTab = normalizeMapCalendarSpaceTab(tab);

    if (isLoading) {
      if (!isDateString(normalizedDate)) {
        return;
      }
      state.scheduleLoadingDate = normalizedDate;
      state.scheduleLoadingTab = normalizedTab;
      syncMapCalendarBodyLoadingState();
      return;
    }

    if (
      isDateString(normalizedDate) &&
      (state.scheduleLoadingDate !== normalizedDate || state.scheduleLoadingTab !== normalizedTab)
    ) {
      return;
    }

    state.scheduleLoadingDate = null;
    state.scheduleLoadingTab = null;
    syncMapCalendarBodyLoadingState();
  }

  async function refreshDailySchedule(date) {
    if (!isRadarSupportedPage() || !state.scheduleOverlayEnabled || !date) {
      return;
    }

    const normalizedDate = normalizeDateString(date);
    const activeTab = normalizeMapCalendarSpaceTab(state.mapCalendarSpaceTab);
    if (!isDateString(normalizedDate)) {
      return;
    }

    const sharingMapId = getSharingMapId();
    if (!sharingMapId) {
      throw new Error("공유 맵 정보를 찾지 못했습니다.");
    }

    state.activeScheduleDate = normalizedDate;
    state.activeScheduleTab = activeTab;

    const freshCachedSchedule = getFreshScheduleCacheForTab(
      normalizedDate,
      activeTab,
      sharingMapId,
    );
    if (freshCachedSchedule) {
      setScheduleLoadingDate(normalizedDate, false, activeTab);
      if (!isScheduleOverlayRenderedForDate(normalizedDate, activeTab)) {
        renderMapCalendarOverlay(freshCachedSchedule);
      }
      return;
    }

    const scopeKey = buildScheduleScopeKey(normalizedDate, activeTab, sharingMapId);
    const existingInflight = state.scheduleInflightByDate.get(scopeKey);
    if (existingInflight instanceof Promise) {
      setScheduleLoadingDate(normalizedDate, true, activeTab);
      try {
        await existingInflight;
      } finally {
        setScheduleLoadingDate(normalizedDate, false, activeTab);
      }
      const inflightCachedSchedule =
        state.activeScheduleDate === normalizedDate &&
        state.activeScheduleTab === activeTab &&
        getSharingMapId() === sharingMapId
          ? getFreshScheduleCacheForTab(normalizedDate, activeTab, sharingMapId)
          : null;
      if (inflightCachedSchedule) {
        if (!isScheduleOverlayRenderedForDate(normalizedDate, activeTab)) {
          renderMapCalendarOverlay(inflightCachedSchedule);
        }
      }
      return;
    }

    setScheduleLoadingDate(normalizedDate, true, activeTab);

    const inflight = (async () => {
      const response = await sendMessage({
        type: "ZZK_FETCH_DAILY_SCHEDULE",
        payload: {
          sharingMapId,
          date: normalizedDate,
          roomType: activeTab,
          allowPastDate: shouldAllowPastReservationDate(normalizedDate),
        },
      });

      if (!response?.ok) {
        throw new Error(response?.error || "시간대별 예약 현황을 불러오지 못했습니다.");
      }

      if (getSharingMapId() !== sharingMapId) {
        return response.data;
      }
      cacheScheduleForDate(normalizedDate, response.data, activeTab, sharingMapId);
      return response.data;
    })();

    state.scheduleInflightByDate.set(scopeKey, inflight);

    try {
      const scheduleData = await inflight;
      if (
        state.activeScheduleDate !== normalizedDate ||
        state.activeScheduleTab !== activeTab ||
        getSharingMapId() !== sharingMapId
      ) {
        return;
      }
      renderMapCalendarOverlay(scheduleData);
    } catch (error) {
      // 현황을 못 불러와도 모달은 떠 있어야 하므로, 조용히 삼키지 말고 에러 껍데기를 그린다.
      if (
        state.activeScheduleDate !== normalizedDate ||
        state.activeScheduleTab !== activeTab ||
        getSharingMapId() !== sharingMapId
      ) {
        return;
      }
      const message = getErrorMessage(error);
      if (state.elements) {
        setStatus(message, "error");
      }
      renderMapCalendarErrorOverlay(message);
    } finally {
      if (state.scheduleInflightByDate.get(scopeKey) === inflight) {
        state.scheduleInflightByDate.delete(scopeKey);
      }
      setScheduleLoadingDate(normalizedDate, false, activeTab);
    }
  }

  // 예약 현황을 못 불러와도(예: 인증 실패로 API가 403) 모달 껍데기는 떠야 한다.
  // 데이터 대신 에러 메시지와 다시 시도 버튼을 담은 최소 모달을 그린다.
  function renderMapCalendarErrorOverlay(errorMessage) {
    if (!state.scheduleOverlayEnabled || !isMapCalendarModalOpenRequested()) {
      return;
    }
    if (state.mapCalendarSuppressedBySlack) {
      return;
    }

    const modalRoot = document.body;
    if (!(modalRoot instanceof HTMLBodyElement)) {
      return;
    }

    ensureMapCalendarStyle();
    ensurePageTailwindStyle();

    let overlay = document.getElementById(MAP_CALENDAR_OVERLAY_ID);
    if (!(overlay instanceof HTMLElement) || overlay.parentElement !== modalRoot) {
      if (overlay instanceof HTMLElement) {
        overlay.remove();
      }
      overlay = document.createElement("section");
      overlay.id = MAP_CALENDAR_OVERLAY_ID;
      modalRoot.appendChild(overlay);
    }

    applyMapCalendarOverlayOffset(overlay);
    updateMapCalendarLauncherState();

    const errorRefs = {};
    flushSync(() => {
      renderRadarError(overlay, {
        message: errorMessage || "예약 현황을 불러오지 못했습니다.",
        onRetry: () => {
          openMapCalendarModal();
        },
        onClose: () => {
          state.mapCalendarVisible = false;
          state.lastAutoOpenPath = null;
          removeMapCalendarOverlay();
        },
        headerRef: (node) => {
          errorRefs.header = node;
        },
      });
    });

    if (errorRefs.header instanceof HTMLElement) {
      bindDraggableHeader({
        header: errorRefs.header,
        element: overlay,
        getOffset: () => state.mapCalendarOffset,
        setOffset: (nextOffset) => {
          state.mapCalendarOffset = nextOffset;
          persistMapCalendarOffset(nextOffset);
        },
        applyOffset: () => {
          applyMapCalendarOverlayOffset(overlay);
        },
      });
    }
  }

  function renderMapCalendarOverlay(scheduleData) {
    if (!state.scheduleOverlayEnabled) {
      removeMapCalendarOverlay();
      updateMapCalendarLauncherState();
      return;
    }

    if (state.mapCalendarSuppressedBySlack) {
      state.mapCalendarVisible = false;
      state.lastAutoOpenPath = null;
      removeMapCalendarOverlay();
      return;
    }

    if (!isMapCalendarModalOpenRequested()) {
      removeMapCalendarOverlay();
      updateMapCalendarLauncherState();
      return;
    }

    if (!scheduleData || !Array.isArray(scheduleData.timeline)) {
      removeMapCalendarOverlay();
      updateMapCalendarLauncherState();
      return;
    }

    if (state.currentSharingMapId !== getSharingMapId()) {
      state.mapCalendarCollapsed = false;
    }

    const modalRoot = document.body;
    if (!(modalRoot instanceof HTMLBodyElement)) {
      return;
    }

    ensureMapCalendarStyle();
    ensurePageTailwindStyle();

    let overlay = document.getElementById(MAP_CALENDAR_OVERLAY_ID);
    if (overlay instanceof HTMLElement && overlay.parentElement !== modalRoot) {
      overlay.remove();
      overlay = null;
    }

    if (!(overlay instanceof HTMLElement)) {
      overlay = document.createElement("section");
      overlay.id = MAP_CALENDAR_OVERLAY_ID;
      modalRoot.appendChild(overlay);
    }

    // 리렌더 시 가로 스크롤 위치를 유지하려면, 스크롤이 실제로 일어나는 요소
    // (2-pane 의 timeline-pane)의 scrollLeft 를 보존해야 한다. body 를 읽으면 항상 0 이라
    // 리렌더마다 맨 앞으로 튀는 버그가 생긴다.
    const previousScrollEl = getMapCalendarScrollElement(overlay);
    const previousBody = overlay.querySelector(".zzk-map-calendar-body");
    const preservedBodyScroll = {
      left: previousScrollEl instanceof HTMLElement ? previousScrollEl.scrollLeft : 0,
      top: previousBody instanceof HTMLElement ? previousBody.scrollTop : 0,
    };

    applyMapCalendarOverlayOffset(overlay);
    updateMapCalendarLauncherState();

    // overlay 는 이제 React 루트다. textContent 로 비우면 React 가 자기 DOM 이
    // 사라진 줄 모른 채 다음 렌더에서 없는 노드를 건드린다. 트리 갱신은 React 에
    // 맡기고, 아직 명령형인 본문만 아래에서 새로 만들어 붙인다.

    const timeline = scheduleData.timeline;
    const renderedTab = normalizeMapCalendarSpaceTab(
      scheduleData?.roomType || state.mapCalendarSpaceTab,
    );
    const tabLabel = getMapCalendarSpaceTabLabel(renderedTab);
    const rooms = getRoomsForMapCalendarSpaceTab(scheduleData.rooms, renderedTab)
      .slice()
      .sort((roomA, roomB) => {
        const floorA = resolveMapCalendarRoomFloor(roomA).floorLabel;
        const floorB = resolveMapCalendarRoomFloor(roomB).floorLabel;
        const floorOrderA = parseInt(floorA, 10);
        const floorOrderB = parseInt(floorB, 10);

        if (
          Number.isFinite(floorOrderA) &&
          Number.isFinite(floorOrderB) &&
          floorOrderA !== floorOrderB
        ) {
          return floorOrderA - floorOrderB;
        }

        const orderA =
          TARGET_ROOM_ORDER.get(normalizeTargetRoomName(roomA?.name)) ?? Number.MAX_SAFE_INTEGER;
        const orderB =
          TARGET_ROOM_ORDER.get(normalizeTargetRoomName(roomB?.name)) ?? Number.MAX_SAFE_INTEGER;
        return orderA - orderB;
      });
    const selectionDate = scheduleData.date || "";
    const previousRenderedScheduleDate = state.lastRenderedScheduleDate;
    state.lastRenderedScheduleDate = isDateString(selectionDate) ? selectionDate : null;
    state.mapCalendarTimelineSnapshot = Array.isArray(timeline) ? timeline : [];
    if (state.lastRenderedScheduleDate !== previousRenderedScheduleDate) {
      // 날짜가 바뀌면 현재 시각 스크롤을 다시 한 번 맞춰준다.
      state.mapCalendarCurrentTimeScrollDate = null;
    }
    state.lastRenderedScheduleTab = renderedTab;
    const earliestSelectableMinute = shouldAllowPastReservationDate(selectionDate)
      ? 0
      : getEarliestSelectableMinuteForDate(selectionDate);

    if (state.appliedSelection && state.appliedSelection.date !== selectionDate) {
      state.appliedSelection = null;
    }
    if (
      state.appliedSelection &&
      !rooms.some((room) => room.id === state.appliedSelection?.roomId)
    ) {
      state.appliedSelection = null;
    }

    // 껍데기(탭/카드/헤더 자리/리사이즈 손잡이)는 React 가 그린다. 아직 명령형인
    // 헤더 컨트롤과 본문은 React 가 내준 자리(ref)에 그대로 붙인다.
    const shellRefs = {};
    // ref 가 채워진 상태로 아래 명령형 코드가 이어져야 하므로 이번 렌더를 동기로
    // 밀어낸다. flushSync(() => {}) 처럼 빈 콜백을 주면 대기 중인 렌더는 밀려나지
    // 않는다 — render 호출 자체가 안에 들어가야 한다.
    flushSync(() => {
      getRadarOverlayRoot(overlay).render(
        createElement(RadarShell, {
          spaceTab: normalizeMapCalendarSpaceTab(state.mapCalendarSpaceTab),
          onSpaceTabChange: (tab) => {
            setMapCalendarSpaceTab(tab);
          },
          cardRef: (node) => {
            shellRefs.card = node;
          },
          headerRef: (node) => {
            shellRefs.header = node;
          },
          resizeHandleRef: (node) => {
            shellRefs.resizeHandle = node;
          },
          bodyRef: (node) => {
            shellRefs.body = node;
          },
        }),
      );
    });

    const card = shellRefs.card;
    const header = shellRefs.header;
    if (!(card instanceof HTMLElement) || !(header instanceof HTMLElement)) {
      return;
    }
    if (shellRefs.resizeHandle instanceof HTMLElement) {
      bindMapCalendarResizeHandle(shellRefs.resizeHandle, card);
    }
    syncOpenMapCalendarSpaceTabButtons();

    bindDraggableHeader({
      header,
      element: overlay,
      getOffset: () => state.mapCalendarOffset,
      setOffset: (nextOffset) => {
        state.mapCalendarOffset = nextOffset;
        persistMapCalendarOffset(nextOffset);
      },
      applyOffset: () => {
        applyMapCalendarOverlayOffset(overlay);
      },
    });

    // 헤더는 React 가 그린다. 날짜 선택은 손으로 만든 팝오버 대신 shadcn DatePicker
    // 를 쓰므로, 달력 그리기·위치 계산·바깥 클릭 감지 코드가 전부 빠졌다.
    const headerRefs = {};
    const headerDateInput = state.elements?.dateInput;
    const headerDate =
      (headerDateInput instanceof HTMLInputElement ? headerDateInput.value : "") ||
      scheduleData.date ||
      "";
    const headerMinDate = getMinimumSelectableDateForCurrentContext(headerDate) || "";
    // 최소일보다 앞이면 끌어올린다. 지난 날짜는 예약할 수 없다.
    const clampedHeaderDate = clampDateToMin(headerDate, headerMinDate);
    if (headerDateInput instanceof HTMLInputElement && clampedHeaderDate) {
      headerDateInput.value = clampedHeaderDate;
    }
    syncPanelDateNavigationState();

    flushSync(() => {
      renderRadarHeader(header, {
        date: clampedHeaderDate,
        minDate: headerMinDate,
        todayDate: getTodayDateInKST(),
        onDateChange: (nextDate) => {
          applyPanelDateChange(nextDate);
        },
        onShiftDate: (dayOffset) => {
          shiftPanelDateBy(dayOffset);
        },
        collapsed: state.mapCalendarCollapsed,
        onToggleCollapsed: () => {
          state.mapCalendarCollapsed = !state.mapCalendarCollapsed;
          renderMapCalendarOverlay(scheduleData);
        },
        alwaysOpen: state.mapCalendarAlwaysOpen,
        onAlwaysOpenChange: (nextAlwaysOpen) => {
          state.mapCalendarAlwaysOpen = nextAlwaysOpen;
          writeStoredBoolean(MAP_CALENDAR_ALWAYS_OPEN_STORAGE_KEY, nextAlwaysOpen);
          if (nextAlwaysOpen) {
            state.mapCalendarVisible = true;
            openMapCalendarModal();
            return;
          }
          if (!state.mapCalendarVisible) {
            removeMapCalendarOverlay();
            return;
          }
          updateMapCalendarLauncherState();
          // 끈 뒤에도 오버레이가 열려 있으면(직접 열어둔 경우) 헤더를 다시 그려야
          // 스위치가 꺼진 상태로 보인다. 안 그리면 값만 바뀌고 화면은 그대로다.
          renderMapCalendarOverlay(scheduleData);
        },
        tagLegendRef: (node) => {
          headerRefs.tagLegend = node;
        },
        // 달력을 body 로 내보내면 오버레이가 inert 처리돼 날짜 클릭이 막힌다.
        popoverContainer: overlay,
      });
    });

    // 방 태그 범례는 아직 명령형이다. React 가 내준 자리에 그린다.
    if (headerRefs.tagLegend instanceof HTMLElement) {
      renderRoomTagLegend(headerRefs.tagLegend);
    }

    // 본문 엘리먼트는 React 가 그린다(카드의 직계 자식이어야 CSS 높이 배분이 맞다).
    // 그리드와 평면도가 모두 컴포넌트라 본문 전체를 React 루트가 소유한다.
    const body = shellRefs.body;
    if (!(body instanceof HTMLElement)) {
      return;
    }
    syncMapCalendarBodyLoadingState();

    if (state.mapCalendarCollapsed) {
      card.classList.add("collapsed");
      applyMapCalendarWidth(overlay);
      return;
    }

    // 그릴 게 없으면 그리드 대신 문구만 보여준다(컴포넌트가 판단한다).
    const emptyMessage =
      timeline.length === 0 || rooms.length === 0 ? `표시할 ${tabLabel} 일정이 없습니다.` : null;

    const hasTerminalHourBoundary =
      Number.isInteger(scheduleData?.range?.endMinute) && scheduleData.range.endMinute % 60 === 0;
    const timelineLayout = buildMapCalendarTimelineGridLayout(timeline, hasTerminalHourBoundary);

    // 2-pane 구조:
    //  - gridWrap(flex): [labelPane(고정)] [timelinePane(가로 스크롤)]
    //  - 라벨 열(층/회의실)은 스크롤 밖 labelPane 에 두어 가로 스크롤바가 라벨 아래로
    //    번지지 않게 한다. 타임블록/정시 헤더는 timelinePane 안에서만 스크롤된다.
    //  - 두 pane 의 각 행은 동일한 고정 높이(--zzk-cal-row-h)로 렌더해 세로 정렬을 맞춘다.
    // 그리드는 React 가 그린다. 슬롯 상태·층 그룹은 순수 함수로 미리 계산해
    // 넘기고, 컴포넌트는 그리기만 한다.
    const gridRoomsByFloor = groupRoomsByFloor(rooms, resolveMapCalendarRoomFloor).map(
      (floorGroup) => ({
        ...floorGroup,
        rooms: floorGroup.rooms.map((room) => {
          const applied =
            state.appliedSelection &&
            state.appliedSelection.date === selectionDate &&
            state.appliedSelection.roomId === room.id &&
            Number.isInteger(state.appliedSelection.startMinute) &&
            Number.isInteger(state.appliedSelection.endMinute) &&
            state.appliedSelection.startMinute < state.appliedSelection.endMinute
              ? state.appliedSelection
              : null;

          return {
            room,
            slotStates: buildSlotStates(room, timeline, earliestSelectableMinute),
            appliedRange: applied
              ? { startMinute: applied.startMinute, endMinute: applied.endMinute }
              : null,
          };
        }),
      }),
    );

    flushSync(() => {
      renderRadarGrid(body, {
        timeline,
        floorGroups: gridRoomsByFloor,
        layout: timelineLayout,
        roomColumnLabel: tabLabel,
        emptyMessage,
        minTrackWidth: Math.max(320, timelineLayout.trackWidth + CALENDAR_SIDE_MARGIN),
        defaultReservationMinutes: LMS_DEFAULT_RESERVATION_MINUTES,
        renderRoomLabel: (container, room) => {
          if (!(container instanceof HTMLElement)) {
            return;
          }
          renderRoomLabel(container, room, {
            formatter: formatMapCalendarRoomLabel,
            titleMode: "overlay",
          });
        },
        floorMaps: {
          floors: getAvailableFloorMapFloors(),
          getFloorMapDataUri,
          open: isFloorMapSectionOpen(),
          onOpenChange: (nextOpen) => {
            persistFloorMapSectionOpen(nextOpen);
            // 평면도를 펼치면 모달이 세로로 길어진다. 뷰포트를 벗어났으면
            // 화면 안으로 다시 끌어들인다(새 높이가 반영된 뒤 측정).
            window.requestAnimationFrame(() => {
              reclampMapCalendarOffsetToViewport();
            });
            renderMapCalendarOverlay(scheduleData);
          },
          onZoomStart: openFloorMapZoom,
          onZoomEnd: closeFloorMapZoom,
        },
        onSlotClick: (room, startIndex, endIndex) => {
          queueTimelineSelectionApply({
            date: selectionDate,
            startMinute: timeline[startIndex].startMinute,
            endMinute: timeline[endIndex].endMinute,
            room,
          });
        },
      });
    });

    const scrollEl = getMapCalendarScrollElement(overlay);
    syncMapCalendarBodyScrollState(body);
    applyMapCalendarWidth(overlay);
    // 너비까지 적용돼 최종 크기가 확정된 뒤, 저장된 위치(offset)가 현재 뷰포트를
    // 벗어났다면(예: 더 큰 화면에서 옮겨둔 위치를 작은 화면에서 열 때) 화면 안으로
    // 다시 끌어들인다.
    reclampMapCalendarOffsetToViewport(overlay);
    // 가로 스크롤 위치는 실제 스크롤 요소(timeline-pane)에 복원한다.
    if (preservedBodyScroll.left !== 0 && scrollEl instanceof HTMLElement) {
      scrollEl.scrollLeft = preservedBodyScroll.left;
    }
    if (preservedBodyScroll.top !== 0) {
      body.scrollTop = preservedBodyScroll.top;
    }

    // 너비가 적용된 뒤에야 스크롤 가능 여부를 알 수 있으므로 레이아웃 확정 후 실행한다.
    window.requestAnimationFrame(() => {
      syncMapCalendarAxisRowHeight(overlay);
      applyMapCalendarCurrentTimeScroll(overlay);
    });
  }

  function syncMapCalendarAxisRowHeight(
    overlay = document.getElementById(MAP_CALENDAR_OVERLAY_ID),
  ) {
    if (!(overlay instanceof HTMLElement)) {
      return;
    }

    const gridWrap = overlay.querySelector(".zzk-map-calendar-grid-wrap");
    const axisRow = overlay.querySelector(".zzk-map-calendar-axis-row");
    if (!(gridWrap instanceof HTMLElement) || !(axisRow instanceof HTMLElement)) {
      return;
    }

    // 헤더 높이는 폰트/줄바꿈에 따라 달라지므로 실제 DOM 에서 측정한다.
    const gridWrapTop = gridWrap.getBoundingClientRect().top;
    const axisHeight = axisRow.getBoundingClientRect().bottom - gridWrapTop;
    if (!Number.isFinite(axisHeight) || axisHeight <= 0) {
      return;
    }

    gridWrap.style.setProperty("--zzk-axis-row-height", `${Math.round(axisHeight)}px`);

    // 정시 세로선을 층/회의실 사이 세로 구분선(divider-track)과 동일하게
    // 헤더 맨 위까지 올려 보이게 한다. divider-track 이 top:0 으로 헤더를 관통하므로
    // 정시선도 위쪽을 자르지 않고(0) 같은 높이로 맞춘다.
    gridWrap.style.setProperty("--zzk-hour-boundary-clip-top", "0px");
  }

  function resetEditReservationBaselineConstraint() {
    state.editReservationBaselineConstraint = null;
    state.editReservationBaselinePathKey = "";
  }

  function syncMapCalendarBodyScrollState(bodyElement) {
    if (!(bodyElement instanceof HTMLElement)) {
      return;
    }

    const pane = bodyElement.querySelector(".zzk-map-calendar-timeline-pane");

    const update = () => {
      // 가로 스크롤은 timeline-pane 에서만 일어난다. 스크롤바가 마지막 타임블록 행
      // 위에 겹쳐 클릭을 방해하지 않도록, 가로 스크롤이 실제로 생길 때만 pane 하단에
      // 스크롤바 전용 공백(gutter)을 확보한다. gutter 는 트랙 padding 으로 들어가
      // scrollHeight 를 늘리므로, 세로 스크롤 판정에서는 그만큼 빼준다.
      let hasHScroll = false;
      let gutter = 0;
      if (pane instanceof HTMLElement) {
        hasHScroll = pane.scrollWidth - pane.clientWidth > 2;
        pane.classList.toggle("zzk-map-calendar-timeline-pane-hscroll", hasHScroll);
        if (hasHScroll) {
          const raw = getComputedStyle(bodyElement).getPropertyValue("--zzk-hscroll-gutter");
          gutter = parseFloat(raw) || 12;
        }
      }

      // gutter 만큼의 넘침은 스크롤바 자리이지 실제 콘텐츠 넘침이 아니므로 제외한다.
      const overflowDelta = bodyElement.scrollHeight - bodyElement.clientHeight - gutter;
      bodyElement.classList.toggle("zzk-map-calendar-body-scrollable", overflowDelta > 2);
    };

    update();
    window.requestAnimationFrame(update);
  }

  function buildMapCalendarTimelineGridLayout(timeline, hasTerminalHourBoundary) {
    if (!Array.isArray(timeline) || timeline.length === 0) {
      return {
        templateColumns: "",
        slotColumnStarts: [],
        boundaryColumnStarts: [],
        trackWidth: 0,
      };
    }

    const columns = [];
    const slotColumnStarts = [];
    const boundaryColumnStarts = [];
    let trackWidth = 0;

    // lms+ 는 30분 슬롯이라 시간당 2칸뿐이므로 클릭하기 좋게 더 넓게 그린다.
    const slotWidth = LMS_CALENDAR_SLOT_MIN_WIDTH;

    const addColumn = (width) => {
      columns.push(width);
      trackWidth += width;
    };

    const addBoundarySegment = () => {
      addColumn(CALENDAR_HOUR_BOUNDARY_SIDE_GAP);
      boundaryColumnStarts.push(columns.length + 1);
      addColumn(CALENDAR_HOUR_BOUNDARY_LINE_WIDTH);
      addColumn(CALENDAR_HOUR_BOUNDARY_SIDE_GAP);
    };

    // 첫 슬롯(보통 07:00) 앞에는 정시 세로 구분선을 그리지 않는다(회의실↔타임블록
    // 세로 구분선과 겹쳐 이중선처럼 보이므로). 다만 다른 정시들은 앞뒤로 경계 여백을
    // 갖는데 07:00 만 여백 없이 붙으면 어색하므로, 선 없이 '여백'만 넣어 리듬을 맞춘다.
    // 여백 폭은 정시 경계 세그먼트(gap + line + gap)와 동일하게 잡는다.
    if (timeline[0]?.isHourMark) {
      addColumn(CALENDAR_HOUR_BOUNDARY_SIDE_GAP * 2 + CALENDAR_HOUR_BOUNDARY_LINE_WIDTH);
    }

    slotColumnStarts.push(columns.length + 1);
    addColumn(slotWidth);

    for (let index = 1; index < timeline.length; index += 1) {
      if (timeline[index]?.isHourMark) {
        addBoundarySegment();
      } else {
        addColumn(CALENDAR_SLOT_GAP);
      }

      slotColumnStarts.push(columns.length + 1);
      addColumn(slotWidth);
    }

    if (hasTerminalHourBoundary) {
      addBoundarySegment();
    }

    return {
      templateColumns: columns.map((width) => `${width}px`).join(" "),
      slotColumnStarts,
      boundaryColumnStarts,
      trackWidth,
    };
  }

  function ensureMapCalendarStyle() {
    if (document.getElementById(MAP_CALENDAR_STYLE_ID)) {
      return;
    }

    const style = document.createElement("style");
    style.id = MAP_CALENDAR_STYLE_ID;
    style.textContent = `
      #${MAP_CALENDAR_OVERLAY_ID} {
        position: fixed;
        left: auto;
        right: 16px;
        top: auto;
        bottom: 16px;
        width: max-content;
        max-width: calc(100vw - 24px);
        max-height: calc(100vh - 24px);
        z-index: 2147483647;
        pointer-events: auto;
        overflow: visible;
        display: flex;
        flex-direction: column;
        align-items: flex-end;
      }

      #${MAP_CALENDAR_OVERLAY_ID} .zzk-map-calendar-shell {
        display: flex;
        flex-direction: column;
        align-items: flex-start;
        width: max-content;
        max-width: calc(100vw - 24px);
        pointer-events: auto;
        position: relative;
      }

      #${MAP_CALENDAR_OVERLAY_ID} .zzk-map-calendar-shell > .zzk-map-calendar-space-tabs {
        display: inline-grid;
        grid-template-columns: 1fr 1fr;
        gap: 2px;
        width: fit-content;
        margin-left: 12px;
        margin-bottom: -4px;
        padding: 0;
        border: none;
        border-radius: 0;
        background: transparent;
        box-shadow: none;
        pointer-events: auto;
        position: relative;
        z-index: 3;
      }

      #${MAP_CALENDAR_OVERLAY_ID} .zzk-map-calendar-shell > .zzk-map-calendar-space-tabs::after {
        content: "";
        position: absolute;
        left: 0;
        right: 0;
        bottom: -1px;
        height: 2px;
        background: rgba(255, 255, 255, 0.94);
        pointer-events: none;
      }

      #${MAP_CALENDAR_OVERLAY_ID} {
        /* 슬롯 색. 범례가 이 변수를 그대로 참조하므로 한쪽만 바뀌지 않는다. */
        --zzk-slot-free: rgba(34, 197, 94, 0.32);
        --zzk-slot-busy: rgba(239, 68, 68, 0.45);
        --zzk-slot-past: rgba(148, 163, 184, 0.32);
        --zzk-slot-past-reserved: rgba(100, 116, 139, 0.55);
        --zzk-slot-selected: rgba(14, 165, 233, 0.38);
      }

      #${MAP_CALENDAR_OVERLAY_ID} .zzk-map-calendar-card {
        --zzk-floor-col-width: ${CALENDAR_FLOOR_COL_WIDTH}px;
        --zzk-room-col-width: ${CALENDAR_ROOM_COL_WIDTH}px;
        --zzk-row-gap: ${CALENDAR_ROW_GAP}px;
        --zzk-slot-gap: ${CALENDAR_SLOT_GAP}px;
        --zzk-timeline-side-margin: ${CALENDAR_SIDE_MARGIN}px;
        --zzk-boundary-color: rgba(15, 23, 42, 0.3);
        --zzk-section-divider-color: rgba(15, 23, 42, 0.18);
        --zzk-section-divider: 1px solid var(--zzk-section-divider-color);
        border: 1px solid rgba(15, 23, 42, 0.15);
        border-radius: 18px;
        background: rgba(255, 255, 255, 0.94);
        box-shadow: 0 10px 24px rgba(15, 23, 42, 0.2);
        backdrop-filter: blur(7px);
        color: #0f172a;
        font-family: "SUIT Variable", "Pretendard", "Noto Sans KR", "Apple SD Gothic Neo", sans-serif;
        padding: 10px 10px 10px 14px;
        display: flex;
        flex-direction: column;
        min-height: 0;
        position: relative;
        box-sizing: border-box;
        width: max-content;
        min-width: ${MAP_CALENDAR_MIN_WIDTH}px;
        max-width: calc(100vw - ${MAP_CALENDAR_VIEWPORT_MARGIN}px);
        max-height: calc(100vh - 24px);
        pointer-events: auto;
        overflow: hidden;
      }

      #${MAP_CALENDAR_OVERLAY_ID} .zzk-map-calendar-card.collapsed .zzk-map-calendar-body {
        display: none;
      }

      #${MAP_CALENDAR_OVERLAY_ID} .zzk-map-calendar-card.collapsed .zzk-map-calendar-header {
        margin-bottom: 0;
      }

      #${MAP_CALENDAR_OVERLAY_ID} .zzk-map-calendar-header {
        display: flex;
        align-items: flex-start;
        justify-content: space-between;
        gap: 12px;
        margin-bottom: 8px;
        cursor: move;
        user-select: none;
      }

      #${MAP_CALENDAR_OVERLAY_ID} .zzk-map-calendar-title-controls {
        display: grid;
        gap: 6px;
        min-width: 0;
      }

      #${MAP_CALENDAR_OVERLAY_ID} .zzk-map-calendar-space-tab {
        min-width: 84px;
        min-height: 40px;
        padding: 0 12px;
        border: 1px solid rgba(15, 23, 42, 0.12);
        border-bottom: none;
        border-radius: 18px 18px 0 0;
        background: rgba(217, 216, 220, 0.72);
        color: #7b7b84;
        font-size: 13px;
        font-weight: 800;
        line-height: 1;
        cursor: pointer;
        display: inline-flex;
        align-items: center;
        justify-content: center;
        position: relative;
        transition: background-color 120ms ease, color 120ms ease, box-shadow 120ms ease,
          transform 120ms ease;
      }

      #${MAP_CALENDAR_OVERLAY_ID} .zzk-map-calendar-space-tab::after {
        content: "";
        position: absolute;
        left: 0;
        right: 0;
        bottom: 0;
        height: 0;
        background: inherit;
        pointer-events: none;
      }

      #${MAP_CALENDAR_OVERLAY_ID} .zzk-map-calendar-space-tab[aria-selected="true"] {
        background: rgba(255, 255, 255, 1);
        color: #ff8833;
        box-shadow: none;
        transform: translateY(0);
        z-index: 2;
      }

      #${MAP_CALENDAR_OVERLAY_ID} .zzk-map-calendar-space-tab[aria-selected="true"]::after {
        bottom: -1px;
        height: 2px;
      }

      #${MAP_CALENDAR_OVERLAY_ID} .zzk-map-calendar-space-tab[aria-selected="false"] {
        background: rgba(217, 216, 220, 0.72);
        z-index: 1;
      }

      #${MAP_CALENDAR_OVERLAY_ID} .zzk-map-calendar-space-tab:focus-visible {
        outline: 2px solid rgba(255, 136, 51, 0.18);
        outline-offset: 2px;
      }

      #${MAP_CALENDAR_OVERLAY_ID} .zzk-map-calendar-controls {
        display: flex;
        align-items: center;
        gap: 6px;
        flex-wrap: nowrap;
      }

      #${MAP_CALENDAR_OVERLAY_ID} .zzk-map-calendar-date-row {
        display: grid;
        grid-template-columns: auto minmax(0, 1fr) auto auto;
        align-items: stretch;
        gap: 4px;
        min-width: 0;
        padding-bottom: 2px;
      }

      #${MAP_CALENDAR_OVERLAY_ID} .zzk-map-calendar-date-display-wrap {
        position: relative;
        display: block;
        min-width: 136px;
      }

      #${MAP_CALENDAR_OVERLAY_ID} .zzk-map-calendar-date-display-wrap.is-open .zzk-map-calendar-date-display {
        outline: 2px solid rgba(14, 116, 144, 0.3);
        outline-offset: 0;
        border-color: rgba(14, 116, 144, 0.45);
      }


      #${MAP_CALENDAR_OVERLAY_ID} .zzk-map-calendar-date-nav {
        display: inline-flex;
        align-items: center;
        justify-content: center;
        min-width: 32px;
        min-height: 32px;
        padding: 0;
        border-radius: 8px;
        border: 1px solid rgba(15, 23, 42, 0.18);
        background: #ffffff;
        color: #475569;
        cursor: pointer;
        transition: background-color 120ms ease, border-color 120ms ease, color 120ms ease,
          box-shadow 120ms ease;
      }

      #${MAP_CALENDAR_OVERLAY_ID} .zzk-map-calendar-date-nav svg {
        width: 14px;
        height: 14px;
        display: block;
      }

      #${MAP_CALENDAR_OVERLAY_ID} .zzk-map-calendar-date-nav.prev:hover:not(:disabled),
      #${MAP_CALENDAR_OVERLAY_ID} .zzk-map-calendar-date-nav.next:hover:not(:disabled) {
        border-color: rgba(14, 116, 144, 0.35);
        background: #f0f9ff;
        color: #0f172a;
        box-shadow: 0 0 0 1px rgba(14, 116, 144, 0.14);
      }

      #${MAP_CALENDAR_OVERLAY_ID} .zzk-map-calendar-date-nav:focus,
      #${MAP_CALENDAR_OVERLAY_ID} .zzk-map-calendar-date-nav:focus-visible {
        outline: 2px solid rgba(14, 116, 144, 0.3);
        outline-offset: 0;
        border-color: rgba(14, 116, 144, 0.45);
      }

      #${MAP_CALENDAR_OVERLAY_ID} .zzk-map-calendar-date-nav.prev:focus:not(:disabled),
      #${MAP_CALENDAR_OVERLAY_ID} .zzk-map-calendar-date-nav.prev:focus-visible:not(:disabled),
      #${MAP_CALENDAR_OVERLAY_ID} .zzk-map-calendar-date-nav.next:focus:not(:disabled),
      #${MAP_CALENDAR_OVERLAY_ID} .zzk-map-calendar-date-nav.next:focus-visible:not(:disabled) {
        background: #ecfeff;
        color: #0f172a;
        box-shadow: 0 0 0 1px rgba(14, 116, 144, 0.2);
      }

      #${MAP_CALENDAR_OVERLAY_ID} .zzk-map-calendar-date-nav:disabled {
        cursor: default;
        border-color: rgba(148, 163, 184, 0.3);
        background: #f8fafc;
        color: #94a3b8;
      }

      #${MAP_CALENDAR_OVERLAY_ID} .zzk-map-calendar-date-nav.today {
        min-width: 46px;
        padding: 0 8px;
        font-size: 12px;
        font-weight: 700;
        line-height: 1;
        white-space: nowrap;
      }

      #${MAP_CALENDAR_OVERLAY_ID} .zzk-map-calendar-date-display {
        display: inline-flex;
        align-items: center;
        min-height: 32px;
        width: 100%;
        padding: 0 10px;
        border-radius: 8px;
        border: 1px solid rgba(15, 23, 42, 0.18);
        background: #ffffff;
        color: #0f172a;
        font-size: 12px;
        font-weight: 700;
        line-height: 1;
        white-space: nowrap;
        text-align: center;
      }

      #${MAP_CALENDAR_OVERLAY_ID} .zzk-map-calendar-date-display .zzk-date-display-weekday.is-saturday {
        color: #2563eb;
      }

      #${MAP_CALENDAR_OVERLAY_ID} .zzk-map-calendar-date-display .zzk-date-display-weekday.is-sunday {
        color: #dc2626;
      }

      #${MAP_CALENDAR_OVERLAY_ID}
        .zzk-map-calendar-date-display-wrap
        .zzk-map-calendar-control.zzk-date.zzk-map-calendar-date-native {
        position: absolute;
        inset: 0;
        width: 100%;
        height: 100%;
        opacity: 0;
        margin: 0;
        padding: 0;
        border: none;
        cursor: pointer;
        z-index: 2;
      }

      #${MAP_CALENDAR_OVERLAY_ID} .zzk-map-calendar-date-display-wrap:focus-within .zzk-map-calendar-date-display {
        outline: 2px solid rgba(14, 116, 144, 0.3);
        outline-offset: 0;
        border-color: rgba(14, 116, 144, 0.45);
      }

      #${MAP_CALENDAR_OVERLAY_ID} .zzk-map-calendar-control {
        border: 1px solid rgba(15, 23, 42, 0.18);
        border-radius: 8px;
        background: #ffffff;
        color: #0f172a;
        font-size: 14px;
        font-weight: 600;
        line-height: 1.2;
        padding: 4px 7px;
      }

      #${MAP_CALENDAR_OVERLAY_ID} .zzk-map-calendar-control,
      #${MAP_CALENDAR_OVERLAY_ID} .zzk-map-calendar-control.zzk-date {
        min-width: 122px;
      }

      #${MAP_CALENDAR_OVERLAY_ID} .zzk-map-calendar-control.zzk-time {
        min-width: 88px;
      }

      #${MAP_CALENDAR_OVERLAY_ID} .zzk-map-calendar-control.zzk-time.zzk-time-readonly {
        display: inline-flex;
        align-items: center;
        justify-content: center;
        background: #f8fafc;
        color: #0f172a;
        border-color: rgba(15, 23, 42, 0.2);
        font-variant-numeric: tabular-nums;
        cursor: default;
        user-select: none;
      }

      #${MAP_CALENDAR_OVERLAY_ID} .zzk-map-calendar-control:focus {
        outline: 2px solid rgba(14, 116, 144, 0.28);
        outline-offset: 0;
        border-color: rgba(14, 116, 144, 0.4);
      }

      #${MAP_CALENDAR_OVERLAY_ID} .zzk-map-calendar-header-right {
        display: flex;
        align-items: center;
        gap: 8px;
        margin-left: auto;
      }

      #${MAP_CALENDAR_OVERLAY_ID} .zzk-map-calendar-always-open {
        display: inline-flex;
        align-items: center;
        gap: 4px;
        font-size: 13px;
        font-weight: 700;
        color: #334155;
        white-space: nowrap;
        user-select: none;
      }

      #${MAP_CALENDAR_OVERLAY_ID} .zzk-map-calendar-always-open input {
        margin: 0;
        cursor: pointer;
        accent-color: #0284c7;
      }

      #${MAP_CALENDAR_OVERLAY_ID} .zzk-map-calendar-header strong {
        font-size: 14px;
      }

      #${MAP_CALENDAR_OVERLAY_ID} .zzk-room-tag-legend[hidden] {
        display: none !important;
      }

      #${MAP_CALENDAR_OVERLAY_ID} .zzk-room-tag-legend {
        display: flex;
        flex-wrap: wrap;
        gap: 6px;
        margin-top: 6px;
      }

      #${MAP_CALENDAR_OVERLAY_ID} .zzk-room-tag-legend-item {
        display: inline-flex;
        align-items: center;
        gap: 6px;
        font-size: 11px;
        color: #475569;
      }

      #${MAP_CALENDAR_OVERLAY_ID} .zzk-room-tag-badge {
        display: inline-flex;
        align-items: center;
        justify-content: center;
        flex: none;
        min-width: 18px;
        min-height: 18px;
        padding: 0 2px;
        border-radius: 4px;
        background: rgba(14, 165, 233, 0.14);
        border: 1px solid rgba(14, 165, 233, 0.22);
        color: #0369a1;
        font-size: 10px;
        font-weight: 800;
        line-height: 1;
        letter-spacing: 0.01em;
      }

      #${MAP_CALENDAR_OVERLAY_ID} .zzk-room-tag-badge::before {
        content: attr(data-label);
      }

      #${MAP_CALENDAR_OVERLAY_ID} .zzk-room-name-text {
        min-width: 0;
        overflow: hidden;
        text-overflow: ellipsis;
      }

      #${MAP_CALENDAR_OVERLAY_ID} .zzk-map-calendar-control.zzk-date {
        min-width: 122px;
      }

      #${MAP_CALENDAR_OVERLAY_ID} .zzk-map-calendar-control.zzk-time {
        min-width: 88px;
      }

      #${MAP_CALENDAR_OVERLAY_ID} .zzk-map-calendar-control.zzk-time.zzk-time-readonly {
        display: inline-flex;
        align-items: center;
        justify-content: center;
        background: #f8fafc;
        color: #0f172a;
        border-color: rgba(15, 23, 42, 0.2);
        font-variant-numeric: tabular-nums;
        cursor: default;
        user-select: none;
      }

      #${MAP_CALENDAR_OVERLAY_ID} .zzk-map-calendar-control:focus {
        outline: 2px solid rgba(14, 116, 144, 0.28);
        outline-offset: 0;
        border-color: rgba(14, 116, 144, 0.4);
      }

      #${MAP_CALENDAR_OVERLAY_ID} .zzk-map-calendar-header-right {
        display: flex;
        align-items: center;
        gap: 8px;
        margin-left: auto;
      }

      #${MAP_CALENDAR_OVERLAY_ID} .zzk-map-calendar-always-open {
        display: inline-flex;
        align-items: center;
        gap: 4px;
        font-size: 13px;
        font-weight: 700;
        color: #334155;
        white-space: nowrap;
        user-select: none;
      }

      #${MAP_CALENDAR_OVERLAY_ID} .zzk-map-calendar-always-open input {
        margin: 0;
        cursor: pointer;
        accent-color: #0284c7;
      }

      #${MAP_CALENDAR_OVERLAY_ID} .zzk-map-calendar-header strong {
        font-size: 14px;
      }

      #${MAP_CALENDAR_OVERLAY_ID} .zzk-room-tag-legend[hidden] {
        display: none !important;
      }

      #${MAP_CALENDAR_OVERLAY_ID} .zzk-room-tag-legend {
        display: flex;
        flex-wrap: wrap;
        gap: 6px;
        margin-top: 6px;
      }

      #${MAP_CALENDAR_OVERLAY_ID} .zzk-room-tag-legend-item {
        display: inline-flex;
        align-items: center;
        gap: 6px;
        font-size: 11px;
        color: #475569;
      }

      #${MAP_CALENDAR_OVERLAY_ID} .zzk-room-tag-badge {
        display: inline-flex;
        align-items: center;
        justify-content: center;
        flex: none;
        min-width: 18px;
        min-height: 18px;
        padding: 0 2px;
        border-radius: 4px;
        background: rgba(14, 165, 233, 0.14);
        border: 1px solid rgba(14, 165, 233, 0.22);
        color: #0369a1;
        font-size: 10px;
        font-weight: 800;
        line-height: 1;
        letter-spacing: 0.01em;
      }

      #${MAP_CALENDAR_OVERLAY_ID} .zzk-room-tag-badge::before {
        content: attr(data-label);
      }

      #${MAP_CALENDAR_OVERLAY_ID} .zzk-room-name-text {
        min-width: 0;
        overflow: hidden;
        text-overflow: ellipsis;
      }

      #${MAP_CALENDAR_OVERLAY_ID} .zzk-map-calendar-resize-handle {
        position: absolute;
        left: 0;
        top: 0;
        bottom: 0;
        width: 10px;
        cursor: ew-resize;
        z-index: 6;
        touch-action: none;
        border-top-left-radius: 18px;
        border-bottom-left-radius: 18px;
      }

      #${MAP_CALENDAR_OVERLAY_ID} .zzk-map-calendar-resize-handle::after {
        content: "";
        position: absolute;
        left: 3px;
        top: 50%;
        transform: translateY(-50%);
        width: 4px;
        height: 44px;
        border-radius: 999px;
        background: rgba(15, 23, 42, 0.18);
        transition: background 120ms ease;
      }

      #${MAP_CALENDAR_OVERLAY_ID} .zzk-map-calendar-resize-handle:hover::after,
      #${MAP_CALENDAR_OVERLAY_ID} .zzk-map-calendar-resize-handle.is-resizing::after {
        background: rgba(2, 132, 199, 0.75);
      }

      @media (prefers-reduced-motion: reduce) {
        #${MAP_CALENDAR_OVERLAY_ID} .zzk-map-calendar-resize-handle::after {
          transition: none;
        }
      }

      #${MAP_CALENDAR_OVERLAY_ID} .zzk-map-calendar-body {
        flex: 1 1 auto;
        min-height: 0;
        max-height: none;
        position: relative;
        /* 가로 스크롤은 안쪽 timeline-pane 에서 처리한다. body 는 세로만. */
        overflow-x: hidden;
        overflow-y: hidden;
        box-sizing: border-box;
      }

      #${MAP_CALENDAR_OVERLAY_ID} .zzk-map-calendar-body.zzk-map-calendar-body-scrollable {
        overflow-y: auto;
      }

      #${MAP_CALENDAR_OVERLAY_ID} .zzk-map-calendar-body.zzk-map-calendar-error-body {
        overflow: hidden;
        display: flex;
        align-items: center;
        justify-content: center;
        padding: 28px 20px;
      }

      #${MAP_CALENDAR_OVERLAY_ID} .zzk-map-calendar-error {
        display: flex;
        flex-direction: column;
        align-items: center;
        gap: 14px;
        max-width: 320px;
        text-align: center;
      }

      #${MAP_CALENDAR_OVERLAY_ID} .zzk-map-calendar-error-message {
        margin: 0;
        font-size: 13px;
        line-height: 1.6;
        color: #b91c1c;
        white-space: pre-line;
        word-break: keep-all;
      }

      #${MAP_CALENDAR_OVERLAY_ID} .zzk-map-calendar-error-retry {
        appearance: none;
        border: 1px solid rgba(2, 132, 199, 0.5);
        background: #ffffff;
        color: #0284c7;
        font-size: 12px;
        font-weight: 700;
        padding: 7px 16px;
        border-radius: 8px;
        cursor: pointer;
        transition: background 120ms ease, color 120ms ease;
      }

      #${MAP_CALENDAR_OVERLAY_ID} .zzk-map-calendar-error-retry:hover {
        background: #0284c7;
        color: #ffffff;
      }

      #${MAP_CALENDAR_OVERLAY_ID} .zzk-map-calendar-loading-overlay {
        position: absolute;
        inset: 0;
        display: inline-flex;
        align-items: center;
        justify-content: center;
        gap: 8px;
        opacity: 0;
        pointer-events: none;
        color: #0f172a;
        font-size: 13px;
        font-weight: 700;
        background: linear-gradient(180deg, rgba(248, 250, 252, 0.72), rgba(248, 250, 252, 0.84));
        backdrop-filter: blur(1px);
        transition: opacity 120ms ease;
        z-index: 5;
      }

      #${MAP_CALENDAR_OVERLAY_ID} .zzk-map-calendar-loading-spinner {
        width: 14px;
        height: 14px;
        border-radius: 999px;
        border: 2px solid rgba(14, 116, 144, 0.22);
        border-top-color: #0284c7;
        animation: zzk-map-calendar-loading-spin 720ms linear infinite;
      }

      #${MAP_CALENDAR_OVERLAY_ID} .zzk-map-calendar-body.zzk-map-calendar-body-loading .zzk-map-calendar-loading-overlay {
        opacity: 1;
        pointer-events: auto;
        cursor: progress;
      }

      #${MAP_CALENDAR_OVERLAY_ID} .zzk-map-calendar-body.zzk-map-calendar-body-loading .zzk-map-calendar-grid-wrap {
        opacity: 0.58;
      }

      /* 층별 평면도 영역 — 타임라인 아래에 접이식으로 붙는다. */
      #${MAP_CALENDAR_OVERLAY_ID} .zzk-map-calendar-floormap-section {
        border-top: 1px solid var(--zzk-section-divider-color);
        margin-top: 8px;
        padding-top: 8px;
      }

      #${MAP_CALENDAR_OVERLAY_ID} .zzk-map-calendar-floormap-header {
        display: flex;
        align-items: center;
        gap: 6px;
        width: 100%;
        padding: 6px 4px;
        background: none;
        border: none;
        cursor: pointer;
        font-size: 13px;
        font-weight: 700;
        color: #1e293b;
        text-align: left;
      }

      #${MAP_CALENDAR_OVERLAY_ID} .zzk-map-calendar-floormap-caret {
        font-size: 11px;
        color: #64748b;
        line-height: 1;
      }

      /* 접힌 상태에서는 평면도 스크롤 영역을 숨긴다(기본). */
      #${MAP_CALENDAR_OVERLAY_ID} .zzk-map-calendar-floormap-scroller {
        display: none;
        gap: 12px;
        overflow-x: auto;
        overflow-y: hidden;
        padding: 6px 4px 10px;
      }

      #${MAP_CALENDAR_OVERLAY_ID} .zzk-map-calendar-floormap-section.open .zzk-map-calendar-floormap-scroller {
        display: flex;
      }

      #${MAP_CALENDAR_OVERLAY_ID} .zzk-map-calendar-floormap-card {
        flex: 0 0 auto;
        margin: 0;
        display: flex;
        flex-direction: column;
        align-items: center;
        gap: 4px;
      }

      #${MAP_CALENDAR_OVERLAY_ID} .zzk-map-calendar-floormap-image {
        display: block;
        height: 220px;
        width: auto;
        max-width: none;
        border: 1px solid var(--zzk-section-divider-color);
        border-radius: 8px;
        background: #ffffff;
        cursor: zoom-in;
      }

      #${MAP_CALENDAR_OVERLAY_ID} .zzk-map-calendar-floormap-caption {
        font-size: 12px;
        font-weight: 600;
        color: #475569;
      }

      @keyframes zzk-map-calendar-loading-spin {
        from {
          transform: rotate(0deg);
        }
        to {
          transform: rotate(360deg);
        }
      }

      @media (prefers-reduced-motion: reduce) {
        #${MAP_CALENDAR_OVERLAY_ID} .zzk-map-calendar-loading-overlay {
          transition: none;
        }

        #${MAP_CALENDAR_OVERLAY_ID} .zzk-map-calendar-loading-spinner {
          animation: none;
        }
      }

      /*
       * === 2-pane 레이아웃 ===
       * grid-wrap 을 좌우 flex 로 나눈다.
       *  - label-pane: 층/회의실 라벨(스크롤 밖, 고정)
       *  - timeline-pane: 정시 헤더 + 타임블록(가로 스크롤). 스크롤바가 이 pane 아래에만 생긴다.
       * 두 pane 의 각 행은 같은 고정 높이(--zzk-cal-row-h)로 그려 세로 정렬을 맞춘다.
       */
      #${MAP_CALENDAR_OVERLAY_ID} .zzk-map-calendar-grid-wrap {
        position: relative;
        display: flex;
        align-items: stretch;
        --zzk-cal-row-h: 26px;
        --zzk-cal-header-h: 24px;
        --zzk-hscroll-gutter: 12px;
      }

      #${MAP_CALENDAR_OVERLAY_ID} .zzk-map-calendar-label-pane {
        /* 층 + gap + 회의실 열 고정 너비. */
        flex: 0 0 calc(
          var(--zzk-floor-col-width) + var(--zzk-row-gap) + var(--zzk-room-col-width)
        );
        width: calc(
          var(--zzk-floor-col-width) + var(--zzk-row-gap) + var(--zzk-room-col-width)
        );
        position: relative;
        z-index: 2;
        background: #ffffff;
        /* 라벨 열 고정 폭 밖으로는 어떤 것도(타임블록 등) 넘치지 못하게 잘라낸다. */
        overflow: hidden;
        /* 회의실↔타임블록 경계 세로선(오른쪽 테두리). */
        border-right: 1px solid var(--zzk-section-divider-color);
      }

      #${MAP_CALENDAR_OVERLAY_ID} .zzk-map-calendar-timeline-pane {
        flex: 1 1 auto;
        min-width: 0;
        overflow-x: auto;
        overflow-y: hidden;
      }

      /* 가로 스크롤이 생길 때만 트랙 하단에 스크롤바 전용 공백(gutter)을 둔다.
         가로 스크롤바가 이 빈 공간에 놓여 마지막 타임블록 행의 클릭을 방해하지 않는다.
         이 gutter 는 세로 스크롤 판정에서 제외된다(syncMapCalendarBodyScrollState). */
      #${MAP_CALENDAR_OVERLAY_ID} .zzk-map-calendar-timeline-pane-hscroll
        .zzk-map-calendar-timeline-track {
        padding-bottom: var(--zzk-hscroll-gutter, 12px);
      }

      /* 정시 세로선이 빈 gutter 까지 내려가지 않고 마지막 행에서 멈추게 한다. */
      #${MAP_CALENDAR_OVERLAY_ID} .zzk-map-calendar-timeline-pane-hscroll
        .zzk-map-calendar-hour-boundary-layer {
        bottom: var(--zzk-hscroll-gutter, 12px);
      }

      #${MAP_CALENDAR_OVERLAY_ID} .zzk-map-calendar-timeline-track {
        position: relative;
      }

      /* 정시 세로 경계선 레이어 — 타임블록 트랙 전체에 절대배치. */
      #${MAP_CALENDAR_OVERLAY_ID} .zzk-map-calendar-hour-boundary-layer {
        position: absolute;
        top: 0;
        left: 0;
        right: 0;
        bottom: 0;
        z-index: 1;
        pointer-events: none;
        /* 정시선이 시각 텍스트 아래까지만 올라오도록 위쪽을 잘라낸다. */
        clip-path: inset(
          var(--zzk-hour-boundary-clip-top, var(--zzk-cal-header-h, 24px)) 0 0 0
        );
      }

      #${MAP_CALENDAR_OVERLAY_ID} .zzk-map-calendar-hour-boundary-track {
        display: grid;
        grid-template-rows: minmax(0, 1fr);
        height: 100%;
        width: 100%;
        padding-left: var(--zzk-timeline-side-margin);
        padding-right: var(--zzk-timeline-side-margin);
        box-sizing: border-box;
      }

      #${MAP_CALENDAR_OVERLAY_ID} .zzk-map-calendar-hour-boundary-cell {
        grid-row: 1;
        height: 100%;
        align-self: stretch;
        justify-self: stretch;
        width: 100%;
        border-radius: 1px;
        background: var(--zzk-section-divider-color);
        pointer-events: none;
        z-index: 0;
      }

      #${MAP_CALENDAR_OVERLAY_ID} .zzk-map-calendar-grid {
        position: relative;
        z-index: 2;
        display: grid;
        gap: 0;
      }

      /* 층↔회의실 세로 구분선(라벨 pane 안, 왼쪽으로 2px 이동). */
      #${MAP_CALENDAR_OVERLAY_ID} .zzk-map-calendar-divider-layer {
        position: absolute;
        top: 0;
        bottom: 0;
        left: calc(var(--zzk-floor-col-width) + (var(--zzk-row-gap) * 0.5) - 2px);
        width: 1px;
        pointer-events: none;
        z-index: 5;
      }

      #${MAP_CALENDAR_OVERLAY_ID} .zzk-map-calendar-divider-track {
        width: 1px;
        height: 100%;
        background: var(--zzk-section-divider-color);
      }

      /* 헤더(축) 행: 라벨 pane 은 [층][회의실], 타임블록 pane 은 정시 라벨. */
      #${MAP_CALENDAR_OVERLAY_ID} .zzk-map-calendar-axis-row {
        position: relative;
        height: var(--zzk-cal-header-h, 24px);
        box-sizing: border-box;
        border-bottom: 1px solid var(--zzk-section-divider-color);
      }

      #${MAP_CALENDAR_OVERLAY_ID} .zzk-map-calendar-axis-row.zzk-map-calendar-label-row {
        display: grid;
        grid-template-columns: var(--zzk-floor-col-width) var(--zzk-room-col-width);
        align-items: center;
        gap: var(--zzk-row-gap);
      }

      #${MAP_CALENDAR_OVERLAY_ID} .zzk-map-calendar-axis-row.zzk-map-calendar-timeline-row {
        display: block;
      }

      /* 층 그룹: 라벨 pane 은 [층][회의실 행들], 타임블록 pane 은 [슬롯 행들]. */
      #${MAP_CALENDAR_OVERLAY_ID} .zzk-map-calendar-floor-group {
        display: grid;
        /* 라벨 열은 고정 너비(층 + 회의실). 1fr 을 쓰면 pane 이 무한정 늘어난다. */
        grid-template-columns: var(--zzk-floor-col-width) var(--zzk-room-col-width);
        align-items: stretch;
        column-gap: var(--zzk-row-gap);
        row-gap: 0;
        position: relative;
      }

      #${MAP_CALENDAR_OVERLAY_ID} .zzk-map-calendar-floor-group.zzk-map-calendar-floor-group-timeline {
        display: block;
      }

      /* 실제 층이 바뀌는 경계에만 가로 구분선. */
      #${MAP_CALENDAR_OVERLAY_ID} .zzk-map-calendar-floor-group.floor-divider::before {
        content: "";
        position: absolute;
        top: 0;
        left: 0;
        right: 0;
        height: 1px;
        background: var(--zzk-section-divider-color);
        pointer-events: none;
        z-index: 6;
      }

      #${MAP_CALENDAR_OVERLAY_ID} .zzk-map-calendar-floor-rooms {
        display: grid;
        gap: 0;
      }

      /* 행(라벨/타임블록 공통): 같은 고정 높이로 정렬. */
      #${MAP_CALENDAR_OVERLAY_ID} .zzk-map-calendar-row {
        height: var(--zzk-cal-row-h, 26px);
        box-sizing: border-box;
        transition: background-color 120ms ease;
      }

      #${MAP_CALENDAR_OVERLAY_ID} .zzk-map-calendar-row.zzk-map-calendar-label-row {
        display: flex;
        align-items: center;
      }

      #${MAP_CALENDAR_OVERLAY_ID} .zzk-map-calendar-row.zzk-map-calendar-timeline-row {
        display: block;
      }

      #${MAP_CALENDAR_OVERLAY_ID} .zzk-map-calendar-row.hovered {
        background: rgba(14, 165, 233, 0.12);
      }

      #${MAP_CALENDAR_OVERLAY_ID} .zzk-map-calendar-row.hovered .zzk-map-calendar-room-name {
        color: #0f172a;
        background: #e3f4fd;
      }

      #${MAP_CALENDAR_OVERLAY_ID} .zzk-map-calendar-row.room-locked-disabled {
        filter: grayscale(0.94) saturate(0.28);
        opacity: 0.62;
        background: rgba(148, 163, 184, 0.14);
      }

      #${MAP_CALENDAR_OVERLAY_ID} .zzk-map-calendar-row.room-locked-disabled .zzk-map-calendar-room-name {
        color: #64748b;
      }

      #${MAP_CALENDAR_OVERLAY_ID} .zzk-map-calendar-floor-name,
      #${MAP_CALENDAR_OVERLAY_ID} .zzk-map-calendar-room-name {
        font-size: 13px;
        font-weight: 700;
        color: #1e293b;
        white-space: nowrap;
      }

      #${MAP_CALENDAR_OVERLAY_ID} .zzk-map-calendar-floor-name {
        display: flex;
        align-items: center;
        align-self: stretch;
        min-height: 100%;
        padding-right: 4px;
        box-sizing: border-box;
      }

      #${MAP_CALENDAR_OVERLAY_ID} .zzk-map-calendar-room-name {
        display: flex;
        align-items: center;
        gap: 4px;
        min-width: 0;
        padding-left: 4px;
        box-sizing: border-box;
      }

      #${MAP_CALENDAR_OVERLAY_ID} .zzk-map-calendar-floor-name.axis,
      #${MAP_CALENDAR_OVERLAY_ID} .zzk-map-calendar-room-name.axis {
        color: #475569;
      }

      #${MAP_CALENDAR_OVERLAY_ID} .zzk-map-calendar-slots {
        display: grid;
        gap: 0;
        height: 100%;
        /* 슬롯(16px)을 행 높이 안에서 세로 가운데 정렬한다. */
        align-items: center;
        align-content: center;
        padding-left: var(--zzk-timeline-side-margin);
        padding-right: var(--zzk-timeline-side-margin);
        box-sizing: border-box;
        position: relative;
      }

      /* 헤더의 정시 라벨 슬롯은 여백 없이 꽉 채운다. */
      #${MAP_CALENDAR_OVERLAY_ID} .zzk-map-calendar-axis-row .zzk-map-calendar-slots {
        height: 100%;
        padding-top: 0;
        padding-bottom: 0;
        align-items: end;
      }

      #${MAP_CALENDAR_OVERLAY_ID} .zzk-map-calendar-hour-label {
        font-size: 11px;
        color: #64748b;
        text-align: left;
        /* 정시 텍스트가 세로 구분선/경계선에 바싹 붙어 잘리지 않도록 살짝 들여쓴다. */
        padding-left: 2px;
        min-height: 10px;
        position: relative;
        z-index: 1;
      }

      #${MAP_CALENDAR_OVERLAY_ID} .zzk-map-calendar-hour-label.hour-boundary {
        color: #1e293b;
        font-weight: 700;
      }

      #${MAP_CALENDAR_OVERLAY_ID} .zzk-map-calendar-slot {
        height: 16px;
        box-sizing: border-box;
        border-radius: 3px;
        border: 1px solid rgba(15, 23, 42, 0.12);
        position: relative;
        z-index: 1;
      }

      #${MAP_CALENDAR_OVERLAY_ID} .zzk-map-calendar-slot.free {
        background: var(--zzk-slot-free);
      }
      #${MAP_CALENDAR_OVERLAY_ID} .zzk-map-calendar-slot.busy {
        background: var(--zzk-slot-busy);
      }
      #${MAP_CALENDAR_OVERLAY_ID} .zzk-map-calendar-slot.past-blocked {
        background: var(--zzk-slot-past);
        border-color: rgba(100, 116, 139, 0.2);
      }

      /* 지난 시간 + 예약 있었음. 빈 과거보다 진하게 해서 "그때 누가 썼다"를 보여준다. */
      #${MAP_CALENDAR_OVERLAY_ID} .zzk-map-calendar-slot.past-blocked.past-reserved {
        background: var(--zzk-slot-past-reserved);
        border-color: rgba(71, 85, 105, 0.4);
      }

      #${MAP_CALENDAR_OVERLAY_ID} .zzk-map-calendar-slot.selected {
        outline: 1.5px solid rgba(14, 116, 144, 0.95);
        outline-offset: -1px;
        background: var(--zzk-slot-selected);
      }

      #${MAP_CALENDAR_OVERLAY_ID} .zzk-map-calendar-slot.selectable {
        cursor: pointer;
        box-shadow: inset 0 0 0 1px rgba(14, 116, 144, 0.22);
      }

      #${MAP_CALENDAR_OVERLAY_ID} .zzk-map-calendar-slot.anchor {
        outline: 2px solid rgba(2, 132, 199, 0.9);
        outline-offset: -1px;
      }

      #${MAP_CALENDAR_OVERLAY_ID} .zzk-map-calendar-slot.preview {
        background: rgba(14, 165, 233, 0.28);
      }

      #${MAP_CALENDAR_OVERLAY_ID} .zzk-map-calendar-slot.hover-preview {
        background: rgba(14, 165, 233, 0.24);
        box-shadow: inset 0 0 0 1px rgba(2, 132, 199, 0.28);
      }

      #${MAP_CALENDAR_OVERLAY_ID} .zzk-map-calendar-slot.room-locked-disabled {
        cursor: not-allowed;
      }

      #${MAP_CALENDAR_OVERLAY_ID} .zzk-map-calendar-slot.busy {
        cursor: not-allowed;
      }

      #${MAP_CALENDAR_OVERLAY_ID} .zzk-map-calendar-slot.past-blocked {
        cursor: not-allowed;
      }

      #${MAP_CALENDAR_OVERLAY_ID} .zzk-map-calendar-empty {
        margin: 0;
        font-size: 14px;
        color: #64748b;
      }

      @media (max-width: 920px) {
        #${MAP_CALENDAR_OVERLAY_ID} {
          left: auto;
          right: 8px;
          top: auto;
          bottom: 8px;
          max-width: calc(100vw - 16px);
          max-height: calc(100vh - 16px);
        }

        #${MAP_CALENDAR_OVERLAY_ID} .zzk-map-calendar-card {
          max-width: calc(100vw - 16px);
          max-height: calc(100vh - 16px);
        }

        #${MAP_CALENDAR_OVERLAY_ID} .zzk-map-calendar-header {
          flex-wrap: wrap;
        }

        #${MAP_CALENDAR_OVERLAY_ID} .zzk-map-calendar-controls {
          flex-wrap: wrap;
        }
      }
    `;

    document.head.appendChild(style);
  }

  function getMapRootElement() {
    const mapSvg = Array.from(document.querySelectorAll("svg")).find(
      (svg) => svg.querySelectorAll("g[data-testid]").length > 0,
    );
    if (!(mapSvg instanceof SVGElement)) {
      return null;
    }

    const parent = mapSvg.parentElement;
    if (!(parent instanceof HTMLElement)) {
      return null;
    }

    return parent;
  }

  function isMapCalendarModalOpenRequested() {
    return Boolean(state.mapCalendarVisible);
  }

  const {
    createMapCalendarLauncherIcon,
    ensureMapCalendarLauncherContent,
    ensureSlackModalTrigger,
    getMapCalendarLauncherMountTarget,
    ensureMapCalendarLoadingOverlay,
    syncMapCalendarBodyLoadingState,
    ensureMapCalendarLauncher,
    scheduleAutoOpenMapCalendarLauncher,
    removeMapCalendarLauncher,
    updateMapCalendarLauncherState,
    openMapCalendarModal,
    removeMapCalendarOverlay,
  } = createRadarWorkflow({
    state,
    MAP_CALENDAR_OVERLAY_ID,
    MAP_CALENDAR_LAUNCHER_ID,
    SLACK_MODAL_TRIGGER_ID,
    DEBUG_MODE,
    MAP_CALENDAR_ALWAYS_OPEN_STORAGE_KEY,
    NAV_SAFE_Z_INDEX,
    TARGET_ROOM_NAMES,
    findGuestReservationTabContainer,
    findGuestReservationTabStyleSource,
    normalizeTextForMatch,
    normalizeSlackFieldText,
    normalizeHostRoomCandidate,
    extractKnownRoomName,
    readHostRoomName,
    buildSlackReservationContext: (rootOverride) => buildSlackReservationContext(rootOverride),
    showSlackCopyModal: (context) => showSlackCopyModal(context),
    isRadarSupportedPage,
    shouldDelayGuestMapCalendarUi,
    isMapCalendarModalOpenRequested,
    getHostReservationRoot,
    isInsideExtensionSurface,
    isElementVisible,
    readStoredBoolean,
    normalizeMapCalendarSpaceTab,
    isDateString,
    formatDateSelectorText,
    normalizeDateInput,
    getFreshScheduleCacheForTab,
    setScheduleLoadingDate,
    refreshDailySchedule,
    refreshAvailability,
    setStatus,
    getErrorMessage,
    queryHostDateInput,
    renderMapCalendarOverlay,
  });

  const radarFormSync = createRadarFormSync({
    state,
    ensurePanel,
    setStatus,
    getErrorMessage,
    clampDateToMin,
    getMinimumSelectableDateForCurrentContext,
    getTodayDateInKST,
    minuteToHourMinute,
    normalizeDateInput,
    normalizeTimeInput,
    syncPanelDateNavigationState,
    getFreshScheduleCache,
    setScheduleLoadingDate,
    renderMapCalendarOverlay,
    refreshAvailability,
    parseHourMinute,
    queryHostDateInput,
    setFormElementValueSilently,
    dispatchFormElementEvents,
    normalizeDateString,
    syncLmsReservationForm,
  });

  function setMapCalendarSuppressedBySlack(shouldSuppress) {
    const nextSuppressed = shouldSuppress === true;
    if (state.mapCalendarSuppressedBySlack === nextSuppressed) {
      return;
    }

    state.mapCalendarSuppressedBySlack = nextSuppressed;

    if (nextSuppressed) {
      state.mapCalendarVisible = false;
      state.lastAutoOpenPath = null;
      removeMapCalendarOverlay();
      return;
    }

    if (
      !isRadarSupportedPage() ||
      !state.scheduleOverlayEnabled ||
      !isMapCalendarModalOpenRequested()
    ) {
      updateMapCalendarLauncherState();
      return;
    }

    openMapCalendarModal();
  }

  function bindMapCalendarResizeHandle(handle, card) {
    if (!(handle instanceof HTMLElement) || !(card instanceof HTMLElement)) {
      return;
    }
    if (handle.dataset.zzkResizeBound === "true") {
      return;
    }

    handle.dataset.zzkResizeBound = "true";

    handle.addEventListener("pointerdown", (event) => {
      if (event.button !== 0) {
        return;
      }

      event.preventDefault();
      event.stopPropagation();

      const startX = event.clientX;
      const startWidth = card.getBoundingClientRect().width;
      let latestWidth = clampMapCalendarWidth(startWidth) ?? startWidth;

      try {
        handle.setPointerCapture(event.pointerId);
      } catch (error) {
        // 포인터 캡처 실패는 드래그 자체를 막지 않는다.
      }

      const handleMove = (moveEvent) => {
        // 모달이 오른쪽에 고정되어 있어 핸들을 오른쪽으로 끌면 너비가 줄어든다.
        const nextWidth = clampMapCalendarWidth(startWidth - (moveEvent.clientX - startX));
        if (nextWidth === null) {
          return;
        }

        latestWidth = nextWidth;
        card.style.width = `${nextWidth}px`;
      };

      const handleUp = () => {
        window.removeEventListener("pointermove", handleMove);
        window.removeEventListener("pointerup", handleUp);
        window.removeEventListener("pointercancel", handleUp);
        handle.classList.remove("is-resizing");

        try {
          handle.releasePointerCapture(event.pointerId);
        } catch (error) {
          // 이미 해제되었을 수 있다.
        }

        persistMapCalendarWidth(latestWidth);
        // 리사이즈로 모달이 넓어져 뷰포트 밖으로 삐져나갔다면 다시 화면 안으로 끌어들인다.
        reclampMapCalendarOffsetToViewport();
        // 너비가 바뀌면 가로 스크롤 가능 여부도 달라지므로 다시 맞춰준다.
        state.mapCalendarCurrentTimeScrollDate = null;
        applyMapCalendarCurrentTimeScroll();
      };

      handle.classList.add("is-resizing");
      // 핸들이 10px 로 좁아 드래그 중 포인터가 쉽게 벗어난다.
      // setPointerCapture 가 실패하는 환경에서도 드래그가 끊기지 않도록
      // 이동/종료 이벤트는 window 에서 받는다.
      window.addEventListener("pointermove", handleMove);
      window.addEventListener("pointerup", handleUp);
      window.addEventListener("pointercancel", handleUp);
    });
  }

  function getMapCalendarWidthBounds() {
    const viewportWidth = Number.isFinite(window.innerWidth) ? window.innerWidth : 0;
    const max = Math.max(MAP_CALENDAR_MIN_WIDTH, viewportWidth - MAP_CALENDAR_VIEWPORT_MARGIN);

    return { min: MAP_CALENDAR_MIN_WIDTH, max };
  }

  function clampMapCalendarWidth(value) {
    const numericValue = typeof value === "string" ? Number(value) : value;
    if (typeof numericValue !== "number" || !Number.isFinite(numericValue)) {
      return null;
    }

    const { min, max } = getMapCalendarWidthBounds();
    return Math.min(max, Math.max(min, Math.round(numericValue)));
  }

  function applyMapCalendarWidth(overlay = document.getElementById(MAP_CALENDAR_OVERLAY_ID)) {
    if (!(overlay instanceof HTMLElement)) {
      return;
    }

    const card = overlay.querySelector(".zzk-map-calendar-card");
    if (!(card instanceof HTMLElement)) {
      return;
    }

    const width = clampMapCalendarWidth(state.mapCalendarWidth);
    if (width === null) {
      // 저장된 값이 없거나 깨졌으면 기존 max-content 레이아웃을 그대로 둔다.
      card.style.removeProperty("width");
      return;
    }

    card.style.width = `${width}px`;
  }

  function persistMapCalendarWidth(width) {
    const clamped = clampMapCalendarWidth(width);
    if (clamped === null) {
      return;
    }

    state.mapCalendarWidth = clamped;
    writeStoredNumber(MAP_CALENDAR_WIDTH_STORAGE_KEY, clamped);
  }

  function computeMapCalendarCurrentTimeScrollLeft({
    timeline,
    trackStartOffset,
    slotStride,
    viewportWidth,
    maxScrollLeft,
    isToday,
    currentMinute,
  }) {
    if (isToday !== true) {
      return null;
    }
    if (!Array.isArray(timeline) || timeline.length === 0) {
      return null;
    }
    if (!Number.isFinite(maxScrollLeft) || maxScrollLeft <= 0) {
      return null;
    }
    if (!Number.isFinite(slotStride) || slotStride <= 0) {
      return null;
    }
    if (!Number.isFinite(currentMinute)) {
      return null;
    }

    // 타임라인 시작 이전(예: 새벽)이면 시작 시각으로 끌어올린다.
    // 그러면 자연스럽게 첫 슬롯(=맨 처음)을 가리키게 된다.
    const timelineStartMinute = Number(timeline[0]?.startMinute);
    const effectiveMinute = Number.isFinite(timelineStartMinute)
      ? Math.max(timelineStartMinute, currentMinute)
      : currentMinute;

    const leadMinute = effectiveMinute - MAP_CALENDAR_CURRENT_TIME_SCROLL_LEAD_MINUTES;

    let targetIndex = timeline.findIndex((slot) => Number(slot?.endMinute) > leadMinute);
    if (targetIndex < 0) {
      targetIndex = timeline.length - 1;
    }

    // 첫 슬롯이면 맨 처음을 그대로 보여준다.
    if (targetIndex <= 0) {
      return 0;
    }

    // 층/회의실 열은 sticky 로 고정되어 스크롤을 소비하지 않는다. 따라서 목표 슬롯을
    // (고정 열 바로 오른쪽) 왼쪽 끝에 두려면 sticky 열 폭(trackStartOffset)을 더하지 않고
    // 슬롯 인덱스 × 슬롯 폭 만큼만 스크롤해야 한다. 이전에는 trackStartOffset 을 더해
    // 고정 열 폭만큼 오른쪽으로 밀려(예: lms+ 좁은 모달에서 끝까지) 스크롤되는 버그가 있었다.
    void trackStartOffset;
    const targetLeft = targetIndex * slotStride;

    return Math.min(maxScrollLeft, Math.max(0, Math.round(targetLeft)));
  }

  // 가로 스크롤이 실제로 일어나는 요소. 2-pane 구조에서는 timeline-pane 이고,
  // 아직 렌더 전이면 body 로 대체한다.
  function getMapCalendarScrollElement(overlay = document.getElementById(MAP_CALENDAR_OVERLAY_ID)) {
    if (!(overlay instanceof HTMLElement)) {
      return null;
    }
    const pane = overlay.querySelector(".zzk-map-calendar-timeline-pane");
    if (pane instanceof HTMLElement) {
      return pane;
    }
    const body = overlay.querySelector(".zzk-map-calendar-body");
    return body instanceof HTMLElement ? body : null;
  }

  function applyMapCalendarCurrentTimeScroll(
    overlay = document.getElementById(MAP_CALENDAR_OVERLAY_ID),
  ) {
    if (!(overlay instanceof HTMLElement)) {
      return;
    }

    const body = getMapCalendarScrollElement(overlay);
    if (!(body instanceof HTMLElement)) {
      return;
    }

    const timeline = state.mapCalendarTimelineSnapshot;
    if (!Array.isArray(timeline) || timeline.length === 0) {
      return;
    }

    const renderedDate = state.lastRenderedScheduleDate;
    if (!isDateString(renderedDate)) {
      return;
    }

    // 이미 이 날짜에 대해 한 번 맞춰줬다면 사용자의 스크롤 위치를 존중한다.
    if (state.mapCalendarCurrentTimeScrollDate === renderedDate) {
      return;
    }

    const maxScrollLeft = body.scrollWidth - body.clientWidth;
    if (maxScrollLeft <= 0) {
      // 가로 스크롤이 없으면 아무 것도 하지 않는다.
      return;
    }

    const metrics = measureMapCalendarTrackMetrics(overlay);
    if (!metrics) {
      return;
    }

    const isToday = renderedDate === getTodayDateInKST();
    const scrollLeft = computeMapCalendarCurrentTimeScrollLeft({
      timeline,
      trackStartOffset: metrics.trackStartOffset,
      slotStride: metrics.slotStride,
      viewportWidth: body.clientWidth,
      maxScrollLeft,
      isToday,
      currentMinute: getCurrentMinuteOfDayInKST(),
    });

    state.mapCalendarCurrentTimeScrollDate = renderedDate;

    if (scrollLeft === null) {
      // 오늘이 아니면(과거·미래) 맨 처음으로 되돌린다. 이전 날짜의 스크롤 위치가
      // 재사용된 오버레이에 남아 있을 수 있으므로 명시적으로 0 으로 초기화한다.
      if (!isToday) {
        body.scrollLeft = 0;
      }
      return;
    }

    body.scrollLeft = scrollLeft;
  }

  function measureMapCalendarTrackMetrics(overlay) {
    // 찜꽁 화면 구조 변경에 대비해 값을 하드코딩하지 않고 실제 DOM에서 측정한다.
    const slotCells = overlay.querySelectorAll(
      ".zzk-map-calendar-axis-row .zzk-map-calendar-slots .zzk-map-calendar-hour-label",
    );
    if (slotCells.length < 2) {
      return null;
    }

    // 2-pane 구조에서는 스크롤이 timeline-pane 에서 일어나므로, 슬롯 위치를
    // 스크롤 요소(timeline-pane)의 콘텐츠 좌표 기준으로 잰다.
    const scrollEl = getMapCalendarScrollElement(overlay);
    if (!(scrollEl instanceof HTMLElement)) {
      return null;
    }

    // scrollEl 콘텐츠 좌표 = 뷰포트 좌표 - scrollEl 왼쪽 + 현재 scrollLeft.
    const scrollRectLeft = scrollEl.getBoundingClientRect().left;
    const toContentX = (viewportLeft) => viewportLeft - scrollRectLeft + scrollEl.scrollLeft;

    const firstLeft = toContentX(slotCells[0].getBoundingClientRect().left);
    const secondLeft = toContentX(slotCells[1].getBoundingClientRect().left);
    const slotStride = secondLeft - firstLeft;

    if (!Number.isFinite(slotStride) || slotStride <= 0) {
      return null;
    }

    return {
      trackStartOffset: firstLeft,
      slotStride,
    };
  }

  function applyMapCalendarOverlayOffset(
    overlay = document.getElementById(MAP_CALENDAR_OVERLAY_ID),
  ) {
    if (!(overlay instanceof HTMLElement)) {
      return;
    }

    const offset = normalizeElementOffset(overlay, state.mapCalendarOffset || { x: 0, y: 0 });
    state.mapCalendarOffset = offset;
    overlay.style.transform = `translate(${offset.x}px, ${offset.y}px)`;
  }

  // 모달 크기가 바뀐 뒤(리사이즈/평면도 펼침/마운트), 저장된 위치가 뷰포트를 벗어났으면
  // 화면 안으로 다시 끌어들이고, 실제로 조정된 경우에만 저장한다.
  function reclampMapCalendarOffsetToViewport(
    overlay = document.getElementById(MAP_CALENDAR_OVERLAY_ID),
  ) {
    if (!(overlay instanceof HTMLElement)) {
      return;
    }
    const before = state.mapCalendarOffset || { x: 0, y: 0 };
    applyMapCalendarOverlayOffset(overlay);
    const after = state.mapCalendarOffset || { x: 0, y: 0 };
    if (after.x !== before.x || after.y !== before.y) {
      persistMapCalendarOffset(after);
    }
  }

  function normalizeElementOffset(element, offset) {
    if (!(element instanceof HTMLElement)) {
      return {
        x: Number.isFinite(offset?.x) ? offset.x : 0,
        y: Number.isFinite(offset?.y) ? offset.y : 0,
      };
    }

    const rect = element.getBoundingClientRect();
    const baseOffset = {
      x: Number.isFinite(offset?.x) ? offset.x : 0,
      y: Number.isFinite(offset?.y) ? offset.y : 0,
    };

    if (rect.width < 2 || rect.height < 2) {
      return baseOffset;
    }

    return clampOffsetWithinViewport({
      startRect: rect,
      baseOffset,
      deltaX: 0,
      deltaY: 0,
    });
  }

  function bindDraggableHeader({ header, element, getOffset, setOffset, applyOffset }) {
    if (!(header instanceof HTMLElement) || !(element instanceof HTMLElement)) {
      return;
    }
    if (header.dataset.zzkDraggableBound === "true") {
      return;
    }

    header.dataset.zzkDraggableBound = "true";

    header.addEventListener("pointerdown", (event) => {
      if (!isValidDragStartTarget(event.target)) {
        return;
      }

      startElementDrag(event, {
        element,
        getOffset,
        setOffset,
        applyOffset,
      });
    });
  }

  function isValidDragStartTarget(target) {
    if (!(target instanceof Element)) {
      return false;
    }

    return !target.closest(
      "button, input, select, textarea, a, label, [role='button'], [contenteditable='true']",
    );
  }

  function startElementDrag(event, { element, getOffset, setOffset, applyOffset }) {
    if (!(event instanceof PointerEvent)) {
      return;
    }
    if (!(element instanceof HTMLElement)) {
      return;
    }
    if (event.button !== 0) {
      return;
    }

    const startOffset = getOffset();
    const baseOffset = {
      x: Number.isFinite(startOffset?.x) ? startOffset.x : 0,
      y: Number.isFinite(startOffset?.y) ? startOffset.y : 0,
    };
    const startRect = element.getBoundingClientRect();
    const startX = event.clientX;
    const startY = event.clientY;
    const previousUserSelect = document.body.style.userSelect;

    document.body.style.userSelect = "none";

    const handlePointerMove = (moveEvent) => {
      const deltaX = moveEvent.clientX - startX;
      const deltaY = moveEvent.clientY - startY;
      const nextOffset = clampOffsetWithinViewport({
        startRect,
        baseOffset,
        deltaX,
        deltaY,
      });

      setOffset(nextOffset);
      applyOffset();
      moveEvent.preventDefault();
    };

    const handlePointerUp = () => {
      window.removeEventListener("pointermove", handlePointerMove);
      window.removeEventListener("pointerup", handlePointerUp);
      window.removeEventListener("pointercancel", handlePointerUp);
      document.body.style.userSelect = previousUserSelect;
    };

    window.addEventListener("pointermove", handlePointerMove);
    window.addEventListener("pointerup", handlePointerUp);
    window.addEventListener("pointercancel", handlePointerUp);
    event.preventDefault();
  }

  function clampOffsetWithinViewport({ startRect, baseOffset, deltaX, deltaY }) {
    const margin = 8;
    const maxLeft = Math.max(margin, window.innerWidth - startRect.width - margin);
    const minTop = Math.max(margin, DRAG_SAFE_TOP);
    const maxTop = Math.max(minTop, window.innerHeight - startRect.height - margin);

    const desiredLeft = startRect.left + deltaX;
    const desiredTop = startRect.top + deltaY;

    const clampedLeft = Math.min(maxLeft, Math.max(margin, desiredLeft));
    const clampedTop = Math.min(maxTop, Math.max(minTop, desiredTop));

    return {
      x: baseOffset.x + (clampedLeft - startRect.left),
      y: baseOffset.y + (clampedTop - startRect.top),
    };
  }

  function setAttrOrRemove(element, attrName, value) {
    if (!value) {
      element.removeAttribute(attrName);
      return;
    }
    element.setAttribute(attrName, value);
  }

  function renderUpdatedAt() {
    const now = new Date();
    const text = now.toLocaleString("ko-KR", {
      hour12: false,
      timeZone: SEOUL_TIMEZONE,
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
    });

    state.elements.updatedAt.textContent = `업데이트: ${text} (KST)`;
  }

  function setStatus(message, type) {
    if (!state.elements) {
      return;
    }

    state.elements.statusMessage.textContent = message;
    state.elements.statusMessage.className = `zzk-status ${type}`;
  }

  function initializeDefaults(elements) {
    const todayDate = getTodayDateInKST();

    const hostDateInput = document.querySelector("input[name='date']");
    const hostDateValue =
      hostDateInput instanceof HTMLInputElement && hostDateInput.value
        ? hostDateInput.value
        : todayDate;
    const minimumDate = getMinimumSelectableDateForCurrentContext(hostDateValue);
    setDateInputMinimum(elements.dateInput, minimumDate);
    let baseDate = clampDateToMin(hostDateValue, minimumDate);

    const range = getNextHourRange();
    if (range.useNextDay && baseDate === todayDate) {
      baseDate = addDaysToDateString(baseDate, 1);
    }

    elements.dateInput.value = baseDate;
    elements.startInput.value = range.startTime;
    elements.endInput.value = range.endTime;
    normalizeTimeInput(elements.startInput);
    normalizeTimeInput(elements.endInput);
    elements.highlightToggle.checked = true;
    elements.scheduleToggle.checked = true;
    state.scheduleOverlayEnabled = true;
    syncPanelDateNavigationState();
    renderCounts({ total: 0, available: 0, occupied: 0 });
  }

  function syncPanelDateNavigationState() {
    if (!state.elements) {
      return;
    }

    const { dateInput, datePrevButton, dateNextButton, dateTodayButton, dateWeekdayLabel } =
      state.elements;
    if (
      !(dateInput instanceof HTMLInputElement) ||
      !(datePrevButton instanceof HTMLButtonElement) ||
      !(dateNextButton instanceof HTMLButtonElement) ||
      !(dateTodayButton instanceof HTMLButtonElement) ||
      !(dateWeekdayLabel instanceof HTMLElement)
    ) {
      return;
    }

    const todayDate = getTodayDateInKST();
    const minimumDate = getMinimumSelectableDateForCurrentContext(dateInput.value);
    setDateInputMinimum(dateInput, minimumDate);
    const normalizedDate = clampDateToMin(normalizeDateString(dateInput.value), minimumDate);
    if (dateInput.value !== normalizedDate) {
      dateInput.value = normalizedDate;
    }

    datePrevButton.disabled = Boolean(minimumDate) && normalizedDate <= minimumDate;
    dateTodayButton.disabled = normalizedDate === todayDate;

    const prevDate = addDaysToDateString(normalizedDate, -1);
    const nextDate = addDaysToDateString(normalizedDate, 1);
    const prevLabel = isDateString(prevDate) ? `이전일 (${prevDate})` : "이전일";
    const nextLabel = isDateString(nextDate) ? `다음일 (${nextDate})` : "다음일";
    const todayLabel = `오늘 (${todayDate})`;
    const dateDisplayText = formatDateSelectorText(normalizedDate);
    renderDateDisplayLabel(dateWeekdayLabel, normalizedDate);
    setAttrOrRemove(dateWeekdayLabel, "title", dateDisplayText || "");

    datePrevButton.title = prevLabel;
    datePrevButton.setAttribute("aria-label", prevLabel);
    dateNextButton.title = nextLabel;
    dateNextButton.setAttribute("aria-label", nextLabel);
    dateTodayButton.title = todayLabel;
    dateTodayButton.setAttribute("aria-label", todayLabel);
  }

  function applyPanelDateChange(nextDate) {
    if (!state.elements) {
      return false;
    }

    const normalizedDate = clampDateToMin(
      normalizeDateString(nextDate),
      getMinimumSelectableDateForCurrentContext(nextDate),
    );
    if (!normalizedDate) {
      syncPanelDateNavigationState();
      return false;
    }

    const currentPanelDate = normalizeDateString(state.elements.dateInput.value);
    const currentActiveDate = normalizeDateString(state.activeScheduleDate || "");
    if (currentPanelDate === normalizedDate && currentActiveDate === normalizedDate) {
      syncPanelDateNavigationState();
      return false;
    }

    state.elements.dateInput.value = normalizedDate;
    syncPanelDateNavigationState();
    resetTimelineSelectionState();
    syncScheduleOverlayToDate(normalizedDate);
    scheduleInputRefresh();
    return true;
  }

  function shiftPanelDateBy(dayOffset) {
    if (!state.elements || !Number.isInteger(dayOffset) || dayOffset === 0) {
      return;
    }

    const baseDate = normalizeDateInput(state.elements.dateInput) || getTodayDateInKST();
    const shiftedDate = addDaysToDateString(baseDate, dayOffset);
    const changed = applyPanelDateChange(shiftedDate);
    if (changed) {
      state.elements.dateInput.focus();
    }
  }

  function handleHostDateChange(event) {
    return radarFormSync.handleHostDateChange(event);
  }

  function isHandlingInternalHostDateSync() {
    return radarFormSync.isHandlingInternalHostDateSync();
  }

  function createTimelineSelectionRequestId() {
    return radarFormSync.createTimelineSelectionRequestId();
  }

  function isLatestTimelineSelectionRequest(requestId) {
    return radarFormSync.isLatestTimelineSelectionRequest(requestId);
  }

  function queueTimelineSelectionApply(selection) {
    return radarFormSync.queueTimelineSelectionApply(selection);
  }

  function withInternalHostDateSync(task) {
    return radarFormSync.withInternalHostDateSync(task);
  }

  function resetTimelineSelectionState() {
    return radarFormSync.resetTimelineSelectionState();
  }

  function syncScheduleOverlayToDate(date) {
    if (!state.scheduleOverlayEnabled || !date) {
      return;
    }

    const requestedDate = date;
    const requestedTab = normalizeMapCalendarSpaceTab(state.mapCalendarSpaceTab);
    const requestedSharingMapId = getSharingMapId();

    state.activeScheduleDate = requestedDate;
    state.activeScheduleTab = requestedTab;
    const cached = getFreshScheduleCacheForTab(requestedDate, requestedTab, requestedSharingMapId);
    if (cached) {
      setScheduleLoadingDate(requestedDate, false, requestedTab);
      renderMapCalendarOverlay(cached);
      return;
    }

    const scopeKey = buildScheduleScopeKey(requestedDate, requestedTab, requestedSharingMapId);
    const existingInflight = state.scheduleInflightByDate.get(scopeKey);
    if (existingInflight instanceof Promise) {
      setScheduleLoadingDate(requestedDate, true, requestedTab);
      existingInflight
        .then(() => {
          if (
            state.activeScheduleDate !== requestedDate ||
            state.activeScheduleTab !== requestedTab ||
            getSharingMapId() !== requestedSharingMapId
          ) {
            return;
          }
          const resolvedCache = getFreshScheduleCacheForTab(
            requestedDate,
            requestedTab,
            requestedSharingMapId,
          );
          if (resolvedCache) {
            renderMapCalendarOverlay(resolvedCache);
          }
        })
        .catch((error) => {
          if (state.elements) {
            setStatus(getErrorMessage(error), "error");
          }
        })
        .finally(() => {
          if (
            state.activeScheduleDate === requestedDate &&
            state.activeScheduleTab === requestedTab &&
            getSharingMapId() === requestedSharingMapId
          ) {
            setScheduleLoadingDate(requestedDate, false, requestedTab);
          }
        });
      return;
    }

    refreshDailySchedule(requestedDate).catch((error) => {
      if (
        state.activeScheduleDate === requestedDate &&
        state.activeScheduleTab === requestedTab &&
        getSharingMapId() === requestedSharingMapId &&
        state.elements
      ) {
        setStatus(getErrorMessage(error), "error");
      }
      setScheduleLoadingDate(requestedDate, false, requestedTab);
      updateMapCalendarLauncherState();
    });
  }

  function resolveMapCalendarRoomFloor(room) {
    const roomName = typeof room?.name === "string" ? room.name.trim() : "";
    // 개편 서비스는 서버가 floor를 내려주므로 그걸 우선 쓰고,
    // 하드코딩된 회의실 메타데이터 표에서 층을 찾는다.
    const serverFloor =
      typeof room?.floorLabel === "string" && room.floorLabel.trim() !== ""
        ? room.floorLabel.trim()
        : "";
    const mappedFloor =
      serverFloor || MAP_CALENDAR_ROOM_FLOOR_BY_NAME.get(normalizeTargetRoomName(roomName)) || "";
    const floorLabel = mappedFloor || "";
    const fallbackRoomKey =
      Number.isInteger(room?.id) || Number.isFinite(Number(room?.id))
        ? String(room.id)
        : roomName || "unknown-room";

    return {
      floorLabel,
      floorKey: mappedFloor || `unknown-${fallbackRoomKey}`,
    };
  }

  function getTargetRoomMetadata(roomOrName) {
    const roomName =
      typeof roomOrName === "string"
        ? roomOrName
        : typeof roomOrName?.name === "string"
          ? roomOrName.name
          : "";
    const normalizedName = normalizeTargetRoomName(roomName);
    return TARGET_ROOM_METADATA_BY_NORMALIZED_NAME.get(normalizedName) || null;
  }

  function getRoomTags(roomOrName) {
    const metadata = getTargetRoomMetadata(roomOrName);
    if (!metadata || !Array.isArray(metadata.tags)) {
      return [];
    }

    const seenKeys = new Set();
    return metadata.tags.reduce((acc, tagKey) => {
      const normalizedKey = normalizeRoomTagKey(tagKey);
      const tagMetadata = ROOM_TAG_METADATA_BY_KEY.get(normalizedKey);
      if (!tagMetadata || seenKeys.has(tagMetadata.key)) {
        return acc;
      }
      seenKeys.add(tagMetadata.key);
      acc.push(tagMetadata);
      return acc;
    }, []);
  }

  function formatPlainRoomLabel(roomName) {
    return typeof roomName === "string" ? roomName.trim() : "";
  }

  function renderRoomLabel(
    container,
    room,
    { formatter = formatPlainRoomLabel, titleMode = "default" } = {},
  ) {
    if (!(container instanceof HTMLElement)) {
      return;
    }

    container.textContent = "";
    const roomNameText = document.createElement("span");
    roomNameText.className = "zzk-room-name-text";
    roomNameText.textContent = formatter(room?.name);
    container.appendChild(roomNameText);

    const roomTags = getRoomTags(room);
    roomTags.forEach((tag) => {
      const badge = document.createElement("span");
      badge.className = "zzk-room-tag-badge";
      badge.setAttribute("data-label", tag.label);
      badge.title = tag.description;
      badge.setAttribute("aria-label", tag.label);
      if (titleMode === "overlay") {
        badge.setAttribute("aria-label", tag.description);
      }
      container.appendChild(badge);
    });
  }

  function renderRoomTagLegend(container) {
    if (!(container instanceof HTMLElement)) {
      return;
    }

    // 회의실 이름 옆 배지만으로 충분해 범례에서는 태그 항목을 노출하지 않는다.
    container.textContent = "";
    container.hidden = true;
  }

  function formatMapCalendarRoomLabel(roomName) {
    if (typeof roomName !== "string") {
      return "";
    }

    return roomName.trim();
  }

  async function applyTimelineReservationSelection(
    selection,
    requestId = state.timelineSelectionRequestId,
  ) {
    return radarFormSync.applyTimelineReservationSelection(selection, requestId);
  }

  function getHostReservationRoot() {
    const dateInputs = Array.from(
      document.querySelectorAll("input[name='date'], input[type='date']"),
    ).filter(
      (candidate) => candidate instanceof HTMLInputElement && isHostScannableInput(candidate),
    );

    if (dateInputs.length === 0) {
      return document;
    }

    let bestRoot = document;
    let bestScore = Number.NEGATIVE_INFINITY;

    dateInputs.forEach((input) => {
      if (!(input instanceof HTMLInputElement)) {
        return;
      }

      const rootCandidate =
        input.closest("form") ||
        input.closest("[role='dialog']") ||
        input.closest("[class*='modal']") ||
        input.closest("[class*='sheet']") ||
        input.parentElement;

      if (!(rootCandidate instanceof HTMLElement)) {
        return;
      }

      let score = 0;
      if (input.name === "date") {
        score += 10;
      }
      if (rootCandidate.querySelector("input[type='time']")) {
        score += 10;
      }
      if (
        rootCandidate.querySelector(
          "button[aria-label*='시작시간'], button[aria-label*='종료시간'], button[aria-label*='시작'], button[aria-label*='종료']",
        )
      ) {
        score += 10;
      }
      if (rootCandidate.querySelector("select[name='spaceId'], select[name='roomId']")) {
        score += 4;
      }

      const rootText = normalizeTextForMatch(rootCandidate.textContent || "");
      if (rootText.includes("예약")) {
        score += 5;
      }
      if (rootText.includes("시작시간")) {
        score += 4;
      }
      if (rootText.includes("종료시간")) {
        score += 4;
      }

      if (score > bestScore) {
        bestScore = score;
        bestRoot = rootCandidate;
      }
    });

    return bestRoot;
  }

  function queryHostDateInput(root = document) {
    const candidates = getScopedHostInputs(root).filter(isHostScannableInput);

    let bestInput = null;
    let bestScore = Number.NEGATIVE_INFINITY;

    candidates.forEach((input) => {
      const descriptor = buildHostInputDescriptor(input);
      let score = 0;

      if (input.name === "date") {
        score += 16;
      }
      if (input.type === "date") {
        score += 12;
      }
      if (descriptor.includes("date") || descriptor.includes("날짜")) {
        score += 6;
      }
      if (score > bestScore) {
        bestScore = score;
        bestInput = input;
      }
    });

    return bestScore >= 8 ? bestInput : null;
  }

  function isInsideExtensionSurface(target) {
    if (!(target instanceof Element)) {
      return false;
    }

    return Boolean(
      target.closest(`#${MAP_CALENDAR_OVERLAY_ID}`) ||
      target.closest(`#${MAP_CALENDAR_LAUNCHER_ID}`) ||
      target.closest(`#${SLACK_COPY_MODAL_ID}`),
    );
  }

  function findHostRoomDropdownButton(root = document) {
    const pickBestButton = (buttons) => {
      let bestButton = null;
      let bestScore = Number.NEGATIVE_INFINITY;

      buttons.forEach((candidate) => {
        if (!(candidate instanceof HTMLButtonElement)) {
          return;
        }
        if (isInsideExtensionSurface(candidate)) {
          return;
        }
        if (!isElementVisible(candidate)) {
          return;
        }

        const descriptor = normalizeTextForMatch(
          `${candidate.textContent || ""} ${candidate.getAttribute("aria-label") || ""} ${
            candidate.getAttribute("title") || ""
          }`,
        );

        let score = 0;
        if (candidate.hasAttribute("aria-expanded")) {
          score += 16;
        }
        if (
          descriptor.includes("공간") ||
          descriptor.includes("space") ||
          descriptor.includes("room") ||
          descriptor.includes("회의실")
        ) {
          score += 8;
        }
        if (descriptor.includes("시작시간") || descriptor.includes("종료시간")) {
          score -= 12;
        }
        if (candidate.closest("form")) {
          score += 4;
        }

        if (score > bestScore) {
          bestScore = score;
          bestButton = candidate;
        }
      });

      return bestScore > 8 ? bestButton : null;
    };

    const scopedButtons = Array.from(root.querySelectorAll("button")).filter(
      (candidate) => candidate instanceof HTMLButtonElement,
    );
    const scopedBest = pickBestButton(scopedButtons);
    if (scopedBest instanceof HTMLButtonElement) {
      return scopedBest;
    }

    if (root !== document) {
      const globalButtons = Array.from(document.querySelectorAll("button")).filter(
        (candidate) => candidate instanceof HTMLButtonElement,
      );
      return pickBestButton(globalButtons);
    }

    return null;
  }

  function isHostRoomSelectionSynced(roomId, roomName, root = document) {
    const scopedRoomSelect = root.querySelector("select[name='spaceId'], select[name='roomId']");
    const roomSelect =
      scopedRoomSelect instanceof HTMLSelectElement
        ? scopedRoomSelect
        : document.querySelector("select[name='spaceId'], select[name='roomId']");

    if (roomSelect instanceof HTMLSelectElement) {
      const selectedOption =
        roomSelect.selectedIndex >= 0 ? roomSelect.options[roomSelect.selectedIndex] : null;
      if (!(selectedOption instanceof HTMLOptionElement)) {
        return false;
      }

      const selectedValue = (selectedOption.value || "").trim();
      const selectedName = normalizeTextForMatch(selectedOption.textContent || "");
      const expectedName = normalizeTextForMatch(roomName || "");
      return (
        selectedValue === String(roomId) ||
        (selectedName !== "" && expectedName !== "" && selectedName.includes(expectedName))
      );
    }

    const roomDropdownButton = findHostRoomDropdownButton(root);
    if (roomDropdownButton instanceof HTMLButtonElement) {
      const selectedName = normalizeTextForMatch(roomDropdownButton.textContent || "");
      const expectedName = normalizeTextForMatch(roomName || "");
      if (selectedName && expectedName) {
        return selectedName.includes(expectedName);
      }
      return false;
    }

    return false;
  }

  //  - 회의실: 이름이 적힌 <button> (선택 시 bg-primary 클래스)
  //  - 시작 시간: <select>, option value 가 "HH:MM"
  //  - 이용 시간: <select>, option value 가 30분 단위 개수 ("1"=30분, "2"=60분)
  // 타임블록 클릭 결과(방/시작/종료)를 이 세 컨트롤에 반영한다.
  function findLmsRoomButton(roomName) {
    const target = normalizeTextForMatch(extractKnownRoomName(roomName || "") || roomName || "");
    if (!target) {
      return null;
    }
    const buttons = Array.from(document.querySelectorAll("button"));
    const fallbackCandidates = [];
    for (const button of buttons) {
      const label = normalizeTextForMatch(button.textContent || "");
      if (!label) {
        continue;
      }
      if (label === target) {
        return button;
      }
      // fallback 은 "라벨이 방 이름을 포함" 한 방향만 허용한다. 반대 방향
      // (target.includes(label))은 "저장"·"선택" 같은 짧은 버튼이 방 이름에 우연히
      // 포함되면 엉뚱한 버튼을 눌러 다른 공간을 선택할 위험이 있어 제외한다.
      if (target.length >= 2 && label.includes(target)) {
        fallbackCandidates.push(button);
      }
    }
    // 후보가 둘 이상이면 어느 버튼인지 확신할 수 없으므로 실패로 둔다
    // (예약이라는 도메인에서 조용히 잘못된 선택보다 미반영이 안전하다).
    return fallbackCandidates.length === 1 ? fallbackCandidates[0] : null;
  }

  function isLmsRoomButtonSelected(button) {
    if (!(button instanceof HTMLElement)) {
      return false;
    }
    // 선택된 방 버튼은 primary 배경 클래스를 가진다.
    return button.className.includes("bg-primary");
  }

  function findLmsSelectByOptionValue(candidateValues) {
    const selects = Array.from(document.querySelectorAll("select"));
    for (const select of selects) {
      const optionValues = Array.from(select.options).map((option) => option.value);
      if (candidateValues.every((value) => optionValues.includes(value))) {
        return select;
      }
    }
    return null;
  }

  // 시작 시간 select 는 "HH:MM" 옵션들을, 이용 시간 select 는 "1"/"2" 옵션을 갖는다.
  function findLmsStartTimeSelect(startTime) {
    const selects = Array.from(document.querySelectorAll("select"));
    for (const select of selects) {
      const hasHourMinuteOptions = Array.from(select.options).some((option) =>
        /^\d{2}:\d{2}$/.test(option.value),
      );
      if (!hasHourMinuteOptions) {
        continue;
      }
      if (!startTime || Array.from(select.options).some((option) => option.value === startTime)) {
        return select;
      }
    }
    return null;
  }

  function findLmsDurationSelect() {
    // 이용 시간 select 는 30분 단위 개수를 value 로 갖는다("1","2",...).
    const selects = Array.from(document.querySelectorAll("select"));
    for (const select of selects) {
      const optionValues = Array.from(select.options).map((option) => option.value);
      const hasHourMinuteOptions = optionValues.some((value) => /^\d{2}:\d{2}$/.test(value));
      if (hasHourMinuteOptions) {
        continue;
      }
      // "1"/"2" 같은 순수 숫자 옵션이 있으면 이용 시간 select 로 본다.
      if (optionValues.some((value) => /^\d+$/.test(value))) {
        return select;
      }
    }
    return null;
  }

  async function syncLmsReservationForm(payload, requestId = null) {
    // 타임블록 연속 클릭 시 이전 sync 가 나중 선택을 덮어쓰지 않도록
    // 각 await 뒤에서 최신 요청인지 확인한다.
    const isStaleRequest = () => requestId != null && !isLatestTimelineSelectionRequest(requestId);

    const startTime = normalizeHourMinute(payload.startTime);
    const endMinute = parseHourMinute(normalizeHourMinute(payload.endTime));
    const startMinute = parseHourMinute(startTime);
    const durationMinutes =
      Number.isInteger(startMinute) && Number.isInteger(endMinute) && endMinute > startMinute
        ? endMinute - startMinute
        : null;

    // 0) 날짜 input (type="date", name 없음). 회의실 버튼 클릭으로 React 가 리렌더되기
    //    전에 먼저 맞춰, 날짜가 바뀐 스케줄로 폼이 반영되게 한다.
    let dateSynced = true;
    const targetDate = normalizeDateString(payload.date);
    if (targetDate) {
      const dateInput = queryHostDateInput(document);
      if (dateInput instanceof HTMLInputElement) {
        setFormElementValue(dateInput, targetDate);
        dateSynced = normalizeDateString(dateInput.value) === targetDate;
        // React 가 날짜 변경으로 예약 목록/폼을 다시 그릴 수 있어 한 틱 기다린다.
        await new Promise((resolve) => setTimeout(resolve, 60));
        if (isStaleRequest()) {
          return false;
        }
      } else {
        dateSynced = false;
      }
    }

    // 1) 회의실 버튼 선택
    let roomSynced = true;
    const roomButton = findLmsRoomButton(payload.roomName);
    if (roomButton instanceof HTMLElement) {
      if (!isLmsRoomButtonSelected(roomButton)) {
        roomButton.click();
        // React 리렌더로 select 들이 새로 붙을 수 있어 한 틱 기다린다.
        await new Promise((resolve) => setTimeout(resolve, 60));
        if (isStaleRequest()) {
          return false;
        }
      }
      roomSynced = true;
    } else {
      roomSynced = false;
    }

    // 2) 시작 시간 select
    let startSynced = true;
    if (startTime) {
      const startSelect = findLmsStartTimeSelect(startTime);
      if (startSelect instanceof HTMLSelectElement) {
        const hasOption = Array.from(startSelect.options).some(
          (option) => option.value === startTime,
        );
        if (hasOption) {
          setFormElementValue(startSelect, startTime);
          startSynced = startSelect.value === startTime;
        } else {
          startSynced = false;
        }
      } else {
        startSynced = false;
      }
    }

    // 3) 이용 시간 select (30분 단위 개수)
    let durationSynced = true;
    if (Number.isInteger(durationMinutes) && durationMinutes > 0) {
      const durationSelect = findLmsDurationSelect();
      if (durationSelect instanceof HTMLSelectElement) {
        const units = String(Math.max(1, Math.round(durationMinutes / 30)));
        const hasOption = Array.from(durationSelect.options).some(
          (option) => option.value === units,
        );
        if (hasOption) {
          setFormElementValue(durationSelect, units);
          durationSynced = durationSelect.value === units;
        } else {
          durationSynced = false;
        }
      } else {
        durationSynced = false;
      }
    }

    return dateSynced && roomSynced && startSynced && durationSynced;
  }

  function isHostReservationFormSynced(payload, root = document) {
    const observedTimes = readHostReservationTimeValues(root);
    if (!observedTimes.hasAnyControl) {
      return false;
    }

    const dateInput = queryHostDateInput(root);
    const dateSynced =
      !(dateInput instanceof HTMLInputElement) ||
      normalizeDateString(dateInput.value) === payload.date;

    const startSynced = observedTimes.startTime === payload.startTime;
    const endSynced = observedTimes.endTime === payload.endTime;

    return dateSynced && startSynced && endSynced;
  }

  function readHostReservationTimeValues(root = document) {
    const startInput = queryHostTimeInput(
      ["start", "starttime", "start_date", "begin", "시작"],
      root,
    );
    const endInput = queryHostTimeInput(
      ["end", "endtime", "end_date", "finish", "종료"],
      root,
      startInput,
    );

    let startValue =
      startInput instanceof HTMLInputElement ? normalizeHourMinute(startInput.value) : null;
    let endValue =
      endInput instanceof HTMLInputElement ? normalizeHourMinute(endInput.value) : null;
    let hasAnyControl =
      startInput instanceof HTMLInputElement || endInput instanceof HTMLInputElement;

    if (startValue == null || endValue == null) {
      const fallbackPair = queryFallbackHostTimeInputs(root);
      if (fallbackPair) {
        hasAnyControl = true;
        if (startValue == null) {
          startValue = normalizeHourMinute(fallbackPair.startInput.value);
        }
        if (endValue == null) {
          endValue = normalizeHourMinute(fallbackPair.endInput.value);
        }
      }
    }

    if (startValue == null) {
      const startButton =
        findHostTimePickerButton("시작시간", root) || findHostTimePickerButton("시작", root);
      if (startButton instanceof HTMLButtonElement) {
        hasAnyControl = true;
      }
      startValue = readTimeValueFromElement(startButton);
    }

    if (endValue == null) {
      const endButton =
        findHostTimePickerButton("종료시간", root) || findHostTimePickerButton("종료", root);
      if (endButton instanceof HTMLButtonElement) {
        hasAnyControl = true;
      }
      endValue = readTimeValueFromElement(endButton);
    }

    return {
      hasAnyControl,
      startTime: startValue,
      endTime: endValue,
    };
  }

  function isHostReservationRootReady(root = document, options = {}) {
    const requireTimeControls = options?.requireTimeControls === true;
    const observed = readHostReservationTimeValues(root);
    if (observed.hasAnyControl) {
      return true;
    }

    if (requireTimeControls) {
      return false;
    }

    const dateInput = queryHostDateInput(root);
    return dateInput instanceof HTMLInputElement;
  }

  async function waitForHostReservationReady(timeoutMs = 1200, requireTimeControls = false) {
    const resolved = await waitForElement(
      () => {
        const root = getHostReservationRoot();
        if (isHostReservationRootReady(root, { requireTimeControls })) {
          return root;
        }

        return null;
      },
      timeoutMs,
      80,
    );

    return resolved instanceof HTMLElement || resolved === document ? resolved : null;
  }

  function readTimeValueFromElement(element) {
    if (!(element instanceof HTMLElement)) {
      return null;
    }

    const snapshot = [
      element.getAttribute("data-value") || "",
      element.getAttribute("aria-label") || "",
      element.getAttribute("title") || "",
      element.textContent || "",
    ].join(" ");

    return normalizeHourMinute(snapshot);
  }

  function waitForTimeout(ms) {
    return new Promise((resolve) => {
      setTimeout(resolve, ms);
    });
  }

  function getScopedHostInputs(root) {
    const scoped = Array.from(root.querySelectorAll("input")).filter(
      (candidate) => candidate instanceof HTMLInputElement,
    );
    if (scoped.length > 0) {
      return scoped;
    }

    return Array.from(document.querySelectorAll("input")).filter(
      (candidate) => candidate instanceof HTMLInputElement,
    );
  }

  function isHostInputCandidate(input) {
    if (!(input instanceof HTMLInputElement)) {
      return false;
    }
    if (input.disabled || input.readOnly) {
      return false;
    }
    if (input.type === "hidden") {
      return false;
    }
    if (isInsideExtensionSurface(input)) {
      return false;
    }

    return true;
  }

  function isHostScannableInput(input) {
    if (!(input instanceof HTMLInputElement)) {
      return false;
    }
    if (input.type === "hidden") {
      return false;
    }
    if (isInsideExtensionSurface(input)) {
      return false;
    }

    return true;
  }

  function scoreHostTimeInput(input, keywords) {
    const descriptor = buildHostInputDescriptor(input);
    const hasKeyword = keywords.some((keyword) => descriptor.includes(keyword));
    if (!hasKeyword) {
      return Number.NEGATIVE_INFINITY;
    }

    const isTimeLikeInput =
      input.type === "time" ||
      descriptor.includes("time") ||
      descriptor.includes("시간") ||
      /^\d{1,2}:\d{2}$/.test((input.value || "").trim()) ||
      /^\d{1,2}:\d{2}$/.test((input.getAttribute("placeholder") || "").trim());

    if (!isTimeLikeInput) {
      return Number.NEGATIVE_INFINITY;
    }

    let score = 0;
    score += 14;

    const normalizedName = normalizeTextForMatch(input.name || "");
    const normalizedId = normalizeTextForMatch(input.id || "");
    const exactKeys = [normalizedName, normalizedId];
    const isStartQuery = keywords.some(
      (keyword) =>
        keyword === "start" || keyword === "starttime" || keyword === "begin" || keyword === "시작",
    );
    const isEndQuery = keywords.some(
      (keyword) =>
        keyword === "end" || keyword === "endtime" || keyword === "finish" || keyword === "종료",
    );
    if (
      isStartQuery &&
      exactKeys.some((key) => key === "starttime" || key === "start" || key === "startdate")
    ) {
      score += 30;
    }
    if (
      isEndQuery &&
      exactKeys.some((key) => key === "endtime" || key === "end" || key === "enddate")
    ) {
      score += 30;
    }

    if (input.type === "time") {
      score += 12;
    }

    if (descriptor.includes("time") || descriptor.includes("시간")) {
      score += 4;
    }

    if (/^\d{1,2}:\d{2}$/.test((input.value || "").trim())) {
      score += 2;
    }

    if (!isElementVisible(input)) {
      score -= 8;
    }

    return score;
  }

  function queryHostTimeInput(nameKeywords, root = document, excludedInput = null) {
    const keywords = nameKeywords.map((keyword) => keyword.toLowerCase());
    const candidates = getScopedHostInputs(root).filter(
      (input) => isHostInputCandidate(input) && input !== excludedInput,
    );

    let bestInput = null;
    let bestScore = Number.NEGATIVE_INFINITY;

    candidates.forEach((input) => {
      const score = scoreHostTimeInput(input, keywords);
      if (score > bestScore) {
        bestScore = score;
        bestInput = input;
      }
    });

    return Number.isFinite(bestScore) && bestScore > 0 ? bestInput : null;
  }

  function queryFallbackHostTimeInputs(root = document) {
    const candidates = getScopedHostInputs(root).filter((input) => {
      if (!isHostInputCandidate(input)) {
        return false;
      }

      const descriptor = buildHostInputDescriptor(input);
      const value = (input.value || "").trim();
      const placeholder = (input.getAttribute("placeholder") || "").trim();

      return (
        input.type === "time" ||
        descriptor.includes("time") ||
        descriptor.includes("시간") ||
        /^\d{1,2}:\d{2}$/.test(value) ||
        /^\d{1,2}:\d{2}$/.test(placeholder)
      );
    });

    if (candidates.length < 2) {
      return null;
    }

    const startInput = queryHostTimeInput(
      ["start", "starttime", "start_date", "begin", "시작"],
      root,
    );
    const endInput = queryHostTimeInput(
      ["end", "endtime", "end_date", "finish", "종료"],
      root,
      startInput,
    );

    if (startInput instanceof HTMLInputElement && endInput instanceof HTMLInputElement) {
      return {
        startInput,
        endInput,
      };
    }

    const timeTypeCandidates = candidates.filter((input) => input.type === "time");
    if (timeTypeCandidates.length >= 2) {
      return {
        startInput: timeTypeCandidates[0],
        endInput: timeTypeCandidates[1],
      };
    }

    return null;
  }

  function setFormElementValue(element, value) {
    if (!(element instanceof HTMLInputElement || element instanceof HTMLSelectElement)) {
      return;
    }

    const normalizedValue = value == null ? "" : String(value);
    if (element.value === normalizedValue) {
      return;
    }

    setFormElementValueSilently(element, normalizedValue);
    dispatchFormElementEvents(element);
  }

  function setFormElementValueSilently(element, value) {
    if (!(element instanceof HTMLInputElement || element instanceof HTMLSelectElement)) {
      return;
    }

    const normalizedValue = value == null ? "" : String(value);
    if (element.value === normalizedValue) {
      return;
    }

    const prototype = Object.getPrototypeOf(element);
    const descriptor = Object.getOwnPropertyDescriptor(prototype, "value");
    if (descriptor?.set) {
      descriptor.set.call(element, normalizedValue);
    } else {
      element.value = normalizedValue;
    }
  }

  function dispatchFormElementEvents(element) {
    if (!(element instanceof HTMLInputElement || element instanceof HTMLSelectElement)) {
      return;
    }

    element.dispatchEvent(new Event("input", { bubbles: true }));
    element.dispatchEvent(new Event("change", { bubbles: true }));
  }

  function formatSegmentedPickerLabels(timeValue) {
    const normalizedTime = normalizeHourMinute(timeValue);
    if (!normalizedTime) {
      return null;
    }

    const minuteOfDay = parseHourMinute(normalizedTime);
    if (!Number.isInteger(minuteOfDay)) {
      return null;
    }

    const hour24 = Math.floor(minuteOfDay / 60);
    const minute = minuteOfDay % 60;
    const meridiemLabel = hour24 >= 12 ? "오후" : "오전";
    let hour12 = hour24 % 12;
    if (hour12 === 0) {
      hour12 = 12;
    }

    return {
      normalizedTime,
      meridiemLabel,
      hourLabel: `${String(hour12).padStart(2, "0")} 시`,
      minuteLabel: `${String(minute).padStart(2, "0")} 분`,
    };
  }

  function normalizePickerCellText(value) {
    if (typeof value !== "string") {
      return "";
    }

    return value.replace(/\s+/g, " ").trim();
  }

  function findHostTimePickerButton(buttonLabel, root = document) {
    const normalizedLabel = normalizeTextForMatch(buttonLabel);
    const pickBestButton = (buttons) => {
      let bestButton = null;
      let bestScore = Number.NEGATIVE_INFINITY;

      buttons.forEach((candidate) => {
        if (!(candidate instanceof HTMLButtonElement)) {
          return;
        }
        if (isInsideExtensionSurface(candidate)) {
          return;
        }

        const descriptor = normalizeTextForMatch(
          `${candidate.getAttribute("aria-label") || ""} ${candidate.getAttribute("title") || ""} ${
            candidate.textContent || ""
          }`,
        );
        if (!descriptor.includes(normalizedLabel)) {
          return;
        }

        let score = 10;
        if (candidate.getAttribute("aria-label")?.includes(buttonLabel)) {
          score += 10;
        }
        if (isElementVisible(candidate)) {
          score += 2;
        }

        if (score > bestScore) {
          bestScore = score;
          bestButton = candidate;
        }
      });

      return bestScore > 0 ? bestButton : null;
    };

    const scopedButtons = Array.from(root.querySelectorAll("button")).filter(
      (candidate) => candidate instanceof HTMLButtonElement,
    );
    const scopedBest = pickBestButton(scopedButtons);
    if (scopedBest instanceof HTMLButtonElement) {
      return scopedBest;
    }

    if (root !== document) {
      const globalButtons = Array.from(document.querySelectorAll("button")).filter(
        (candidate) => candidate instanceof HTMLButtonElement,
      );
      return pickBestButton(globalButtons);
    }

    return null;
  }

  function hasVisibleHostTimePickerCells() {
    const pickerState = inspectHostTimePickerState();
    if (pickerState.isOpen) {
      return true;
    }

    const startButton = pickerState.startButton;
    const endButton = pickerState.endButton;

    const expandedPickerButton = [
      startButton,
      findHostTimePickerButton("시작"),
      endButton,
      findHostTimePickerButton("종료"),
    ].find(
      (button) =>
        button instanceof HTMLButtonElement && button.getAttribute("aria-expanded") === "true",
    );

    if (expandedPickerButton) {
      return true;
    }

    const radioCandidates = Array.from(document.querySelectorAll("input[type='radio']"));
    const hasVisiblePickerRadio = radioCandidates.some((candidate) => {
      if (!(candidate instanceof HTMLInputElement)) {
        return false;
      }
      if (isInsideExtensionSurface(candidate)) {
        return false;
      }
      if (!isElementVisible(candidate)) {
        return false;
      }

      const labelText = normalizePickerCellText(candidate.getAttribute("aria-label") || "");
      return (
        labelText === "오전" ||
        labelText === "오후" ||
        /^\d{2}\s*시$/.test(labelText) ||
        /^\d{2}\s*분$/.test(labelText)
      );
    });

    if (hasVisiblePickerRadio) {
      return true;
    }

    const cells = Array.from(document.querySelectorAll("label, span, button, div, li"));

    return cells.some((candidate) => {
      if (!(candidate instanceof HTMLElement)) {
        return false;
      }
      if (isInsideExtensionSurface(candidate)) {
        return false;
      }
      if (!isElementVisible(candidate)) {
        return false;
      }
      const text = normalizePickerCellText(candidate.textContent || "");
      const isTimePickerCell =
        text === "오전" ||
        text === "오후" ||
        /^\d{2}\s*시$/.test(text) ||
        /^\d{2}\s*분$/.test(text);
      if (!isTimePickerCell) {
        return false;
      }

      return true;
    });
  }

  async function toggleHostTimePickerButton(button) {
    if (!(button instanceof HTMLButtonElement)) {
      return;
    }
    button.click();
    await waitForTimeout(70);
  }

  function triggerHostButtonInteraction(button) {
    if (!(button instanceof HTMLButtonElement)) {
      return;
    }

    const eventInit = {
      bubbles: true,
      cancelable: true,
      view: window,
    };

    button.dispatchEvent(new MouseEvent("mousedown", eventInit));
    button.dispatchEvent(new MouseEvent("mouseup", eventInit));
    button.dispatchEvent(new MouseEvent("click", eventInit));
  }

  async function collapseHostTimePickers(root = document) {
    const startButton =
      findHostTimePickerButton("시작시간", root) || findHostTimePickerButton("시작", root);
    const endButton =
      findHostTimePickerButton("종료시간", root) || findHostTimePickerButton("종료", root);

    const closeByEscape = async () => {
      if (document.activeElement instanceof HTMLElement) {
        document.activeElement.dispatchEvent(
          new KeyboardEvent("keydown", {
            key: "Escape",
            bubbles: true,
            cancelable: true,
          }),
        );
        document.activeElement.dispatchEvent(
          new KeyboardEvent("keyup", {
            key: "Escape",
            bubbles: true,
            cancelable: true,
          }),
        );
      }
      document.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true }));
      document.dispatchEvent(new KeyboardEvent("keyup", { key: "Escape", bubbles: true }));
      window.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true }));
      window.dispatchEvent(new KeyboardEvent("keyup", { key: "Escape", bubbles: true }));
      await waitForTimeout(70);
    };

    const closeByOutsideClick = async () => {
      if (!(document.body instanceof HTMLBodyElement)) {
        return;
      }
      const eventInit = {
        bubbles: true,
        cancelable: true,
        view: window,
      };
      document.body.dispatchEvent(new MouseEvent("mousedown", eventInit));
      document.body.dispatchEvent(new MouseEvent("mouseup", eventInit));
      document.body.dispatchEvent(new MouseEvent("click", eventInit));
      await waitForTimeout(70);
    };

    const closeByToggleButton = async (button) => {
      if (!(button instanceof HTMLButtonElement)) {
        return;
      }
      await toggleHostTimePickerButton(button);
    };

    if (!hasVisibleHostTimePickerCells()) {
      return;
    }

    for (let attempt = 0; attempt < 5; attempt += 1) {
      const pickerState = inspectHostTimePickerState(root);
      if (!pickerState.isOpen && !hasVisibleHostTimePickerCells()) {
        break;
      }

      if (pickerState.activeButton instanceof HTMLButtonElement) {
        await closeByToggleButton(pickerState.activeButton);
      } else if (pickerState.startButton instanceof HTMLButtonElement) {
        await closeByToggleButton(pickerState.startButton);
      } else if (pickerState.endButton instanceof HTMLButtonElement) {
        await closeByToggleButton(pickerState.endButton);
      }

      const afterToggleState = inspectHostTimePickerState(root);
      if (!afterToggleState.isOpen && !hasVisibleHostTimePickerCells()) {
        break;
      }

      await closeByEscape();
      if (!hasVisibleHostTimePickerCells()) {
        break;
      }

      await closeByOutsideClick();
      if (!hasVisibleHostTimePickerCells()) {
        break;
      }

      if (document.activeElement instanceof HTMLElement) {
        document.activeElement.blur();
      }
    }

    if (document.activeElement instanceof HTMLElement) {
      document.activeElement.blur();
    }

    await waitForElement(() => (!hasVisibleHostTimePickerCells() ? true : null), 260, 40);
  }

  function inspectHostTimePickerState(root = document) {
    const startButton =
      findHostTimePickerButton("시작시간", root) || findHostTimePickerButton("시작", root);
    const endButton =
      findHostTimePickerButton("종료시간", root) || findHostTimePickerButton("종료", root);

    let isOpen = false;
    let activeButton = null;

    if (startButton instanceof HTMLButtonElement && endButton instanceof HTMLButtonElement) {
      const startClass = (startButton.className || "").trim();
      const endClass = (endButton.className || "").trim();

      if (startClass !== "" && endClass !== "") {
        if (startClass === endClass) {
          state.hostTimePickerIdleClass = startClass;
        } else {
          isOpen = true;
          const idleClass = (state.hostTimePickerIdleClass || "").trim();
          if (idleClass) {
            if (startClass !== idleClass && endClass === idleClass) {
              activeButton = startButton;
            } else if (endClass !== idleClass && startClass === idleClass) {
              activeButton = endButton;
            }
          }
        }
      }
    }

    return {
      startButton,
      endButton,
      isOpen,
      activeButton,
    };
  }

  async function closeHostTimePickerAfterSelection(root = document) {
    if (!hasVisibleHostTimePickerCells()) {
      return;
    }
    for (let attempt = 0; attempt < 3; attempt += 1) {
      await collapseHostTimePickers(root);
      if (!hasVisibleHostTimePickerCells()) {
        break;
      }
      await waitForTimeout(70);
    }
  }

  async function setHostTimeByPicker(buttonLabelOrLabels, timeValue, root = document) {
    const labels = Array.isArray(buttonLabelOrLabels) ? buttonLabelOrLabels : [buttonLabelOrLabels];
    let button = null;
    labels.some((label) => {
      const matched = findHostTimePickerButton(label, root);
      if (matched) {
        button = matched;
        return true;
      }
      return false;
    });

    if (!(button instanceof HTMLButtonElement)) {
      return false;
    }

    const normalizedTargetTime = normalizeHourMinute(timeValue);
    if (!normalizedTargetTime) {
      return false;
    }

    if (readTimeValueFromElement(button) === normalizedTargetTime) {
      await closeHostTimePickerAfterSelection(root);
      return true;
    }

    triggerHostButtonInteraction(button);

    const immediateOption = findVisibleHostTimeOption(timeValue, button);
    if (immediateOption instanceof HTMLElement) {
      immediateOption.click();
      await waitForTimeout(80);

      if (readTimeValueFromElement(button) === normalizedTargetTime) {
        await closeHostTimePickerAfterSelection(root);
        return true;
      }
    }

    const segmentedLabels = formatSegmentedPickerLabels(normalizedTargetTime);
    const quickSegmentedCell =
      segmentedLabels &&
      (await waitForElement(
        () => findVisiblePickerCell(segmentedLabels.hourLabel, button),
        420,
        40,
      ));

    if (quickSegmentedCell instanceof HTMLElement) {
      const segmentedApplied = await setHostTimeBySegmentedPicker(button, normalizedTargetTime);
      if (segmentedApplied) {
        await closeHostTimePickerAfterSelection(root);
        return true;
      }
    }

    const option = await waitForElement(
      () => findVisibleHostTimeOption(timeValue, button),
      300,
      40,
    );

    if (option instanceof HTMLElement) {
      option.click();
      await waitForTimeout(80);

      if (readTimeValueFromElement(button) === normalizedTargetTime) {
        await closeHostTimePickerAfterSelection(root);
        return true;
      }
    }

    const segmentedApplied = await setHostTimeBySegmentedPicker(button, normalizedTargetTime);
    if (segmentedApplied) {
      await closeHostTimePickerAfterSelection(root);
      return true;
    }

    const matched = readTimeValueFromElement(button) === normalizedTargetTime;
    if (matched) {
      await closeHostTimePickerAfterSelection(root);
    }

    return matched;
  }

  async function setHostTimeBySegmentedPicker(triggerButton, timeValue) {
    if (!(triggerButton instanceof HTMLButtonElement)) {
      return false;
    }

    const labels = formatSegmentedPickerLabels(timeValue);
    if (!labels) {
      return false;
    }

    const clickPickerCell = async (label) => {
      const cell = await waitForElement(() => findVisiblePickerCell(label, triggerButton), 600, 40);
      if (!(cell instanceof HTMLElement)) {
        return false;
      }

      cell.click();
      await waitForTimeout(60);
      return true;
    };

    const ensurePickerOpen = async () => {
      const existing = findVisiblePickerCell(labels.hourLabel, triggerButton);
      if (existing instanceof HTMLElement) {
        return true;
      }

      triggerHostButtonInteraction(triggerButton);
      const opened = await waitForElement(
        () => findVisiblePickerCell(labels.hourLabel, triggerButton),
        320,
        40,
      );
      if (opened instanceof HTMLElement) {
        return true;
      }

      triggerHostButtonInteraction(triggerButton);
      const openedOnRetry = await waitForElement(
        () => findVisiblePickerCell(labels.hourLabel, triggerButton),
        320,
        40,
      );
      return openedOnRetry instanceof HTMLElement;
    };

    const pickerOpened = await ensurePickerOpen();
    if (!pickerOpened) {
      return false;
    }

    const currentTime = readTimeValueFromElement(triggerButton);
    const currentMinuteOfDay = currentTime ? parseHourMinute(currentTime) : null;
    const targetMinuteOfDay = parseHourMinute(labels.normalizedTime);

    let meridiemApplied = true;
    if (
      Number.isInteger(currentMinuteOfDay) &&
      Number.isInteger(targetMinuteOfDay) &&
      currentMinuteOfDay >= 720 === targetMinuteOfDay >= 720
    ) {
      meridiemApplied = true;
    } else {
      meridiemApplied = await clickPickerCell(labels.meridiemLabel);
    }

    const hourApplied = await clickPickerCell(labels.hourLabel);
    const minuteApplied = await clickPickerCell(labels.minuteLabel);

    if (!meridiemApplied || !hourApplied || !minuteApplied) {
      return false;
    }

    await waitForTimeout(120);
    return readTimeValueFromElement(triggerButton) === labels.normalizedTime;
  }

  function findVisiblePickerCell(label, triggerButton) {
    const normalizedLabel = normalizePickerCellText(label);
    if (!normalizedLabel) {
      return null;
    }

    const candidates = Array.from(document.querySelectorAll("label, span, button, div, li"));
    const triggerRect =
      triggerButton instanceof HTMLElement ? triggerButton.getBoundingClientRect() : null;

    let bestCandidate = null;
    let bestScore = Number.NEGATIVE_INFINITY;

    candidates.forEach((candidate) => {
      if (!(candidate instanceof HTMLElement)) {
        return;
      }
      if (isInsideExtensionSurface(candidate)) {
        return;
      }
      if (!isElementVisible(candidate)) {
        return;
      }
      if (candidate.getAttribute("aria-hidden") === "true") {
        return;
      }
      if (candidate.getAttribute("aria-disabled") === "true") {
        return;
      }

      const text = normalizePickerCellText(candidate.textContent || "");
      if (text !== normalizedLabel) {
        return;
      }

      let score = 10;
      if (candidate.tagName === "LABEL") {
        score += 8;
      }
      if (candidate.tagName === "SPAN") {
        score += 4;
      }
      if (candidate.childElementCount === 0) {
        score += 4;
      }

      if (triggerRect) {
        const rect = candidate.getBoundingClientRect();
        const verticalDistance = Math.abs(rect.top - triggerRect.bottom);
        score -= Math.min(8, verticalDistance / 90);
      }

      if (score > bestScore) {
        bestScore = score;
        bestCandidate = candidate;
      }
    });

    return bestScore > 0 ? bestCandidate : null;
  }

  function findVisibleHostTimeOption(timeValue, triggerButton) {
    const normalizedTime = normalizeHourMinute(timeValue);
    if (!normalizedTime) {
      return null;
    }

    const candidates = Array.from(
      document.querySelectorAll(
        "[role='option'], [role='menuitem'], [data-value], button, li, div, span",
      ),
    );

    let bestCandidate = null;
    let bestScore = Number.NEGATIVE_INFINITY;
    const triggerRect =
      triggerButton instanceof HTMLElement ? triggerButton.getBoundingClientRect() : null;

    candidates.forEach((candidate) => {
      if (!(candidate instanceof HTMLElement)) {
        return;
      }
      if (isInsideExtensionSurface(candidate)) {
        return;
      }
      if (!isElementVisible(candidate)) {
        return;
      }
      if (candidate.getAttribute("aria-hidden") === "true") {
        return;
      }
      if (candidate.getAttribute("aria-disabled") === "true") {
        return;
      }

      if (
        candidate.childElementCount > 0 &&
        !candidate.matches("[role='option'], [role='menuitem'], button, li")
      ) {
        return;
      }

      const normalizedText = normalizePickerCellText(candidate.textContent || "");
      if (
        normalizedText.length > 30 &&
        !candidate.matches("[role='option'], [role='menuitem'], button")
      ) {
        return;
      }

      const dataValueTime = normalizeHourMinute(candidate.getAttribute("data-value") || "");
      const textTime = normalizeHourMinute(candidate.textContent || "");
      const ariaLabelTime = normalizeHourMinute(candidate.getAttribute("aria-label") || "");
      const matchedTime = dataValueTime || textTime;
      if (matchedTime !== normalizedTime && ariaLabelTime !== normalizedTime) {
        return;
      }

      let score = 10;
      const role = candidate.getAttribute("role") || "";
      if (role === "option" || role === "menuitem") {
        score += 6;
      }

      if (candidate.closest("[role='listbox'], [role='menu'], [role='dialog']")) {
        score += 4;
      }

      if (triggerRect) {
        const candidateRect = candidate.getBoundingClientRect();
        const verticalDistance = Math.abs(candidateRect.top - triggerRect.bottom);
        score -= Math.min(6, verticalDistance / 120);
      }

      if (score > bestScore) {
        bestScore = score;
        bestCandidate = candidate;
      }
    });

    return bestScore > 0 ? bestCandidate : null;
  }

  function isElementVisible(element) {
    const rect = element.getBoundingClientRect();
    return rect.width > 0 && rect.height > 0;
  }

  function waitForElement(resolver, timeoutMs, intervalMs) {
    return new Promise((resolve) => {
      const startedAt = Date.now();

      const tick = () => {
        const resolved = resolver();
        if (resolved) {
          resolve(resolved);
          return;
        }
        if (Date.now() - startedAt >= timeoutMs) {
          resolve(null);
          return;
        }
        setTimeout(tick, intervalMs);
      };

      tick();
    });
  }

  function findVisibleHostRoomOption(roomId, roomName, triggerButton = null) {
    const normalizedRoomName = normalizeTextForMatch(roomName || "");
    const candidates = Array.from(
      document.querySelectorAll(
        "[role='option'], [role='menuitem'], [role='menuitemradio'], li, button, [data-value], div, span",
      ),
    );
    const triggerRect =
      triggerButton instanceof HTMLElement ? triggerButton.getBoundingClientRect() : null;

    let bestOption = null;
    let bestScore = Number.NEGATIVE_INFINITY;

    candidates.forEach((candidate) => {
      if (!(candidate instanceof HTMLElement)) {
        return;
      }
      if (isInsideExtensionSurface(candidate)) {
        return;
      }
      if (!isElementVisible(candidate)) {
        return;
      }
      if (candidate.getAttribute("aria-hidden") === "true") {
        return;
      }
      if (candidate.getAttribute("aria-disabled") === "true") {
        return;
      }

      const text = normalizeTextForMatch(candidate.textContent || "");
      if (!text) {
        return;
      }

      const popupContainer = candidate.closest("[role='listbox'], [role='menu'], [role='dialog']");
      const hasPopupContext = popupContainer instanceof HTMLElement;

      const valueToken = (
        candidate.getAttribute("value") ||
        candidate.getAttribute("data-value") ||
        ""
      ).trim();
      const idMatched = valueToken !== "" && valueToken === String(roomId);
      const nameMatched = normalizedRoomName !== "" && text.includes(normalizedRoomName);

      if (!idMatched && !nameMatched) {
        return;
      }

      if (!idMatched && !hasPopupContext && candidate.getAttribute("role") !== "option") {
        return;
      }

      let score = 0;
      if (idMatched) {
        score += 20;
      }
      if (nameMatched) {
        score += 20;
      }
      if (candidate.getAttribute("role") === "option") {
        score += 8;
      }
      if (hasPopupContext) {
        score += 8;
      }
      if (candidate.tagName === "LI") {
        score += 4;
      }

      if (triggerRect) {
        const rect = candidate.getBoundingClientRect();
        const verticalDistance = Math.abs(rect.top - triggerRect.bottom);
        score -= Math.min(8, verticalDistance / 80);
      }

      if (score > bestScore) {
        bestScore = score;
        bestOption = candidate;
      }
    });

    return bestScore > 0 ? bestOption : null;
  }

  async function syncHostRoomSelection(roomId, roomName, root = document) {
    if (isHostRoomSelectionSynced(roomId, roomName, root)) {
      return true;
    }

    const scopedRoomSelect = root.querySelector("select[name='spaceId'], select[name='roomId']");
    const roomSelect =
      scopedRoomSelect instanceof HTMLSelectElement
        ? scopedRoomSelect
        : document.querySelector("select[name='spaceId'], select[name='roomId']");
    if (roomSelect instanceof HTMLSelectElement) {
      const option = Array.from(roomSelect.options).find(
        (candidate) =>
          candidate.value === String(roomId) || candidate.textContent?.trim() === roomName,
      );
      if (option) {
        setFormElementValue(roomSelect, option.value);
        if (isHostRoomSelectionSynced(roomId, roomName, root)) {
          return true;
        }
      }
    }

    for (let attempt = 0; attempt < 4; attempt += 1) {
      const roomDropdownButton = findHostRoomDropdownButton(root);
      if (!(roomDropdownButton instanceof HTMLButtonElement)) {
        continue;
      }

      if (
        roomDropdownButton.disabled ||
        roomDropdownButton.getAttribute("aria-disabled") === "true"
      ) {
        return false;
      }

      const currentName = normalizeTextForMatch(roomDropdownButton.textContent || "");
      const targetName = normalizeTextForMatch(roomName || "");
      if (currentName && targetName && currentName === targetName) {
        return true;
      }

      if (roomDropdownButton.getAttribute("aria-expanded") !== "true") {
        triggerHostButtonInteraction(roomDropdownButton);
        await waitForTimeout(80);
      }

      let roomOption = findVisibleHostRoomOption(roomId, roomName, roomDropdownButton);
      if (!(roomOption instanceof HTMLElement)) {
        roomOption = await waitForElement(
          () => findVisibleHostRoomOption(roomId, roomName, roomDropdownButton),
          420,
          40,
        );
      }

      if (roomOption instanceof HTMLElement) {
        roomOption.click();
        await waitForTimeout(100);

        const settled = await waitForElement(
          () => (isHostRoomSelectionSynced(roomId, roomName, root) ? true : null),
          520,
          40,
        );
        if (settled === true) {
          return true;
        }
      }

      if (roomDropdownButton.getAttribute("aria-expanded") === "true") {
        triggerHostButtonInteraction(roomDropdownButton);
        await waitForTimeout(60);
      }
    }

    const roomNode = document.querySelector(`svg g[data-testid='${roomId}']`);
    if (roomNode instanceof SVGGElement) {
      roomNode.dispatchEvent(new MouseEvent("click", { bubbles: true }));
      await waitForTimeout(120);
      const mapSettled = await waitForElement(
        () => (isHostRoomSelectionSynced(roomId, roomName, root) ? true : null),
        520,
        40,
      );
      if (mapSettled === true) {
        return true;
      }
    }

    const lastResolved = findHostRoomDropdownButton(root);
    if (lastResolved instanceof HTMLButtonElement) {
      return isHostRoomSelectionSynced(roomId, roomName, root);
    }

    return isHostRoomSelectionSynced(roomId, roomName, root);
  }

  function scheduleInputRefresh(delay = 220) {
    clearTimeout(state.inputRefreshTimer);
    state.inputRefreshTimer = setTimeout(() => {
      if (state.loading) {
        scheduleInputRefresh(180);
        return;
      }

      refreshAvailability();
    }, delay);
  }

  function scheduleCalendarOverlayRefresh() {
    clearTimeout(state.autoScheduleRefreshTimer);
    state.autoScheduleRefreshTimer = setTimeout(() => {
      if (
        !state.scheduleOverlayEnabled ||
        !isMapCalendarModalOpenRequested() ||
        !state.activeScheduleDate
      ) {
        return;
      }

      const activeTab =
        state.activeScheduleTab || normalizeMapCalendarSpaceTab(state.mapCalendarSpaceTab);
      const cached = getFreshScheduleCacheForTab(state.activeScheduleDate, activeTab);
      if (cached) {
        renderMapCalendarOverlay(cached);
        return;
      }

      refreshDailySchedule(state.activeScheduleDate).catch((error) => {
        if (state.elements) {
          setStatus(getErrorMessage(error), "error");
        }
      });
    }, 220);
  }

  function handleLocationChange() {
    state.lastObservedRouteKey = getCurrentRouteKey();
    if (!isRadarSupportedPage()) {
      resetEditReservationBaselineConstraint();
      teardownGuestUi();
      return;
    }

    resetEditReservationBaselineConstraint();

    state.lastGuestRouteChangeAt = Date.now();
    state.lastObservedPathname = location.pathname;

    syncMapCalendarAlwaysOpenPreference();
    if (!isGuestUiReadyForActivation()) {
      removeMapCalendarLauncher();
      removeMapCalendarOverlay();
      state.mapCalendarVisible = false;
      state.lastAutoOpenPath = null;
      return;
    }
    queueSlackModalFromPersistedEditSubmitIfNeeded("location-change");
    ensurePanel();
    ensureMapCalendarLauncher();
    const openedPendingSlackModal = tryOpenPendingSlackCopyModal();
    if (state.mapCalendarAlwaysOpen) {
      state.scheduleOverlayEnabled = true;
      if (state.elements?.scheduleToggle instanceof HTMLInputElement) {
        state.elements.scheduleToggle.checked = true;
      }
      state.mapCalendarVisible = true;
      if (!openedPendingSlackModal) {
        openMapCalendarModal();
      }
    }
    refreshAvailability();
  }

  function getCurrentRouteKey() {
    return `${location.pathname}${location.search}${location.hash}`;
  }

  function handleHistoryMethodLocationChange() {
    const nextRouteKey = getCurrentRouteKey();
    if (state.lastObservedRouteKey === nextRouteKey) {
      return;
    }
    handleLocationChange();
  }

  function teardownGuestUi(options = {}) {
    const preserveReservationContext = options?.preserveReservationContext === true;
    if (Number.isInteger(state.mutationGuestUiSyncTimer)) {
      window.clearTimeout(state.mutationGuestUiSyncTimer);
    }
    state.mutationGuestUiSyncTimer = null;
    const hasActiveGuestState =
      Boolean(document.getElementById(MAP_CALENDAR_LAUNCHER_ID)) ||
      Boolean(document.getElementById(MAP_CALENDAR_OVERLAY_ID)) ||
      Boolean(state.currentSharingMapId) ||
      state.scheduleCache.size > 0 ||
      state.mapCalendarVisible ||
      state.loading;

    if (!hasActiveGuestState) {
      return;
    }

    removeMapCalendarLauncher();
    state.elements = null;
    state.mounted = false;
    state.currentSharingMapId = null;
    state.latestRooms = [];
    state.latestRoomsBySpaceTab.clear();
    state.scheduleCache.clear();
    state.scheduleCacheFetchedAtByDate.clear();
    clearAvailabilityCache();
    state.scheduleInflightByDate.clear();
    state.activeScheduleDate = null;
    state.activeScheduleTab = null;
    state.scheduleLoadingDate = null;
    state.scheduleLoadingTab = null;
    state.latestMapName = "";
    state.mapCalendarVisible = false;
    state.lastAutoOpenPath = null;
    if (Number.isInteger(state.pendingSlackModalTimer)) {
      window.clearTimeout(state.pendingSlackModalTimer);
    }
    state.pendingSlackModalTimer = null;
    if (!preserveReservationContext) {
      state.lastReservationContext = null;
      state.lastKnownReservationOwnerName = "";
      resetEditReservationBaselineConstraint();
      clearPendingSlackModalState();
    }
    resetTimelineSelectionState();
    if (!preserveReservationContext) {
      closeSlackCopyModal();
    }
    removeMapCalendarOverlay();
  }

  function hookHistoryChanges() {
    if (state.historyHookInstalled) {
      return;
    }
    state.historyHookInstalled = true;

    const originalPushState = history.pushState;
    const originalReplaceState = history.replaceState;

    history.pushState = function patchedPushState(...args) {
      const result = originalPushState.apply(this, args);
      handleHistoryMethodLocationChange();
      return result;
    };

    history.replaceState = function patchedReplaceState(...args) {
      const result = originalReplaceState.apply(this, args);
      handleHistoryMethodLocationChange();
      return result;
    };
  }

  function installReservationIntentWatcher() {
    if (state.reservationIntentWatcherInstalled) {
      return;
    }

    document.addEventListener("click", handleReservationIntentClick, true);
    document.addEventListener("submit", handleReservationIntentSubmit, true);
    state.reservationIntentWatcherInstalled = true;
  }

  function installReservationNetworkMessageListener() {
    if (state.reservationMessageListenerInstalled) {
      return;
    }

    window.addEventListener("message", handleReservationNetworkMessage);
    state.reservationMessageListenerInstalled = true;
  }

  function installReservationOwnerWatcher() {
    if (state.reservationOwnerWatcherInstalled) {
      return;
    }

    document.addEventListener("input", handleReservationOwnerInputEvent, true);
    document.addEventListener("change", handleReservationOwnerInputEvent, true);
    state.reservationOwnerWatcherInstalled = true;
  }

  function installHostTimePickerInteractionWatcher() {
    if (state.hostTimePickerInteractionWatcherInstalled) {
      return;
    }

    document.addEventListener("pointerdown", handleHostTimePickerManualInteraction, true);
    document.addEventListener("focusin", handleHostTimePickerManualInteraction, true);
    state.hostTimePickerInteractionWatcherInstalled = true;
  }

  function handleHostTimePickerManualInteraction(event) {
    if (event.isTrusted !== true) {
      return;
    }

    const target = event.target;
    if (!(target instanceof Element) || isInsideExtensionSurface(target)) {
      return;
    }

    const control = target.closest("input, button, [role='button']");
    if (!(control instanceof HTMLElement) || isInsideExtensionSurface(control)) {
      return;
    }

    if (!isHostTimeControlElement(control)) {
      return;
    }

    state.lastHostTimePickerManualInteractionAt = Date.now();
  }

  function isHostTimeControlElement(control) {
    if (!(control instanceof HTMLElement)) {
      return false;
    }

    if (control instanceof HTMLInputElement) {
      if (control.type === "time") {
        return true;
      }

      const descriptor = buildHostInputDescriptor(control);
      return (
        descriptor.includes("start") ||
        descriptor.includes("end") ||
        descriptor.includes("time") ||
        descriptor.includes("시작") ||
        descriptor.includes("종료") ||
        descriptor.includes("시간")
      );
    }

    const descriptor = normalizeTextForMatch(
      `${control.textContent || ""} ${control.getAttribute("aria-label") || ""} ${
        control.getAttribute("title") || ""
      }`,
    );
    if (!descriptor) {
      return false;
    }

    return (
      descriptor.includes("시작") ||
      descriptor.includes("종료") ||
      descriptor.includes("시간") ||
      descriptor.includes("start") ||
      descriptor.includes("end") ||
      descriptor.includes("time")
    );
  }

  function handleReservationOwnerInputEvent(event) {
    if (!isRadarSupportedPage()) {
      return;
    }

    const target = event.target;
    if (!(target instanceof HTMLElement) || isInsideExtensionSurface(target)) {
      return;
    }

    if (!(
      target instanceof HTMLInputElement ||
      target instanceof HTMLTextAreaElement ||
      target instanceof HTMLSelectElement ||
      target instanceof HTMLButtonElement
    )) {
      return;
    }

    if (!isPotentialReservationOwnerElement(target)) {
      return;
    }

    rememberReservationOwnerName(readHostFieldDisplayValue(target));
  }

  function handleReservationIntentClick(event) {
    if (!isRadarSupportedPage()) {
      return;
    }

    const target = event.target;
    if (!(target instanceof Element) || isInsideExtensionSurface(target)) {
      return;
    }

    const actionTarget = target.closest("button, [role='button'], input[type='submit']");
    if (!(actionTarget instanceof HTMLElement)) {
      return;
    }

    const normalizedLabel = normalizeTextForMatch(readActionTargetText(actionTarget));
    if (!isReservationIntentActionLabel(normalizedLabel)) {
      return;
    }

    const rootCandidate =
      actionTarget.closest("form") ||
      actionTarget.closest("[role='dialog']") ||
      actionTarget.closest("[class*='modal']") ||
      actionTarget.closest("[class*='sheet']") ||
      getHostReservationRoot();
    markReservationActionIntent({ root: rootCandidate });
  }

  function handleReservationIntentSubmit(event) {
    if (!isRadarSupportedPage()) {
      return;
    }

    const form = event.target;
    if (!(form instanceof HTMLFormElement) || isInsideExtensionSurface(form)) {
      return;
    }

    const normalizedFormText = normalizeTextForMatch(form.textContent || "");
    const hasReservationFieldSet =
      form.querySelector("input[name='date'], input[type='date']") instanceof HTMLInputElement &&
      (form.querySelector("input[type='time']") instanceof HTMLInputElement ||
        form.querySelector("button[aria-label*='시작'], button[aria-label*='종료']") instanceof
          HTMLButtonElement ||
        form.querySelector("select[name='spaceId'], select[name='roomId']") instanceof
          HTMLSelectElement);
    if (!normalizedFormText.includes("예약") && !hasReservationFieldSet) {
      return;
    }

    markReservationActionIntent({ root: form });
  }

  function isReservationIntentActionLabel(normalizedLabel) {
    if (!normalizedLabel) {
      return false;
    }

    if (normalizedLabel.includes("예약하기") || normalizedLabel.includes("예약수정")) {
      return true;
    }

    return false;
  }

  function markReservationActionIntent(options = {}) {
    state.lastReservationActionAt = Date.now();

    const rootCandidate = options?.root;
    const contextRoot =
      rootCandidate instanceof HTMLElement || rootCandidate === document
        ? rootCandidate
        : getHostReservationRoot();
    const contextSnapshot = buildSlackReservationContext(contextRoot);
    const previousContext =
      state.lastReservationContext && typeof state.lastReservationContext === "object"
        ? state.lastReservationContext
        : null;
    if (
      contextSnapshot &&
      typeof contextSnapshot === "object" &&
      previousContext &&
      !isMeaningfulSlackContextValue(contextSnapshot.ownerName) &&
      isMeaningfulSlackContextValue(previousContext.ownerName)
    ) {
      contextSnapshot.ownerName = previousContext.ownerName;
    }
    if (
      contextSnapshot &&
      typeof contextSnapshot === "object" &&
      !isMeaningfulSlackContextValue(contextSnapshot.ownerName) &&
      isMeaningfulSlackContextValue(state.lastKnownReservationOwnerName)
    ) {
      contextSnapshot.ownerName = state.lastKnownReservationOwnerName;
    }
    if (
      contextSnapshot &&
      typeof contextSnapshot === "object" &&
      isMeaningfulSlackContextValue(contextSnapshot.ownerName)
    ) {
      rememberReservationOwnerName(contextSnapshot.ownerName);
    }
    state.lastReservationContext =
      contextSnapshot && typeof contextSnapshot === "object" ? contextSnapshot : null;
    const reservationAttemptId = createReservationAttemptId();
    state.lastReservationAttemptId = reservationAttemptId;
    state.pendingReservationAttempts.set(reservationAttemptId, {
      id: reservationAttemptId,
      at: state.lastReservationActionAt,
      sharingMapId: getSharingMapId(),
      pathname: location.pathname,
      context:
        state.lastReservationContext && typeof state.lastReservationContext === "object"
          ? { ...state.lastReservationContext }
          : null,
    });
    prunePendingReservationAttempts();
    if (document.documentElement instanceof HTMLElement) {
      document.documentElement.dataset.zzkReservationAttemptId = reservationAttemptId;
      document.documentElement.dataset.zzkReservationAttemptAt = String(
        state.lastReservationActionAt,
      );
    }
  }

  function createReservationAttemptId() {
    state.reservationAttemptSequence += 1;
    return `zzk-${Date.now()}-${state.reservationAttemptSequence}`;
  }

  function prunePendingReservationAttempts() {
    const now = Date.now();
    const maxAgeMs = 120000;
    for (const [attemptId, attempt] of state.pendingReservationAttempts.entries()) {
      const attemptAt = Number(attempt?.at || 0);
      if (!Number.isFinite(attemptAt) || now - attemptAt > maxAgeMs) {
        deletePendingReservationAttempt(attemptId);
      }
    }

    if (state.pendingReservationAttempts.size <= 10) {
      return;
    }

    const attemptsByAge = Array.from(state.pendingReservationAttempts.entries()).sort(
      ([, leftAttempt], [, rightAttempt]) =>
        Number(leftAttempt?.at || 0) - Number(rightAttempt?.at || 0),
    );
    for (const [attemptId] of attemptsByAge) {
      if (state.pendingReservationAttempts.size <= 10) {
        break;
      }
      deletePendingReservationAttempt(attemptId);
    }
  }

  function deletePendingReservationAttempt(attemptId) {
    if (typeof attemptId !== "string" || attemptId === "") {
      return false;
    }
    const deleted = state.pendingReservationAttempts.delete(attemptId);
    if (deleted) {
      clearReservationAttemptDataset(attemptId);
    }
    return deleted;
  }

  function resolveReservationAttemptForPayload(payload) {
    prunePendingReservationAttempts();
    const payloadAttemptId =
      payload && typeof payload === "object" && typeof payload.reservationAttemptId === "string"
        ? payload.reservationAttemptId
        : "";
    if (payloadAttemptId) {
      return state.pendingReservationAttempts.get(payloadAttemptId) || null;
    }

    const payloadContext =
      payload &&
      typeof payload === "object" &&
      payload.requestContext &&
      typeof payload.requestContext === "object"
        ? payload.requestContext
        : null;
    if (isCompleteReservationPayloadContext(payloadContext)) {
      for (const attempt of state.pendingReservationAttempts.values()) {
        if (doesReservationAttemptContextMatchPayload(attempt, payloadContext)) {
          return attempt;
        }
      }
    }

    if (state.pendingReservationAttempts.size === 1) {
      return Array.from(state.pendingReservationAttempts.values())[0] || null;
    }

    return null;
  }

  function doesReservationAttemptContextMatchPayload(attempt, payloadContext) {
    const attemptContext =
      attempt && attempt.context && typeof attempt.context === "object" ? attempt.context : null;
    if (!attemptContext || !payloadContext) {
      return false;
    }

    return (
      normalizeReservationContextComparableValue(attemptContext.date) ===
        normalizeReservationContextComparableValue(payloadContext.date) &&
      normalizeReservationContextComparableValue(attemptContext.startTime) ===
        normalizeReservationContextComparableValue(payloadContext.startTime) &&
      normalizeReservationContextComparableValue(attemptContext.endTime) ===
        normalizeReservationContextComparableValue(payloadContext.endTime) &&
      normalizeReservationRoomComparableValue(attemptContext.roomName) ===
        normalizeReservationRoomComparableValue(payloadContext.roomName)
    );
  }

  function normalizeReservationContextComparableValue(value) {
    return typeof value === "string" ? value.trim() : "";
  }

  function normalizeReservationRoomComparableValue(value) {
    return typeof value === "string" ? value.replace(/\s+/g, "").trim() : "";
  }

  function shouldIgnoreAmbiguousReservationSuccess(payload, payloadContext) {
    prunePendingReservationAttempts();
    if (state.pendingReservationAttempts.size <= 1) {
      return false;
    }
    if (resolveReservationAttemptForPayload(payload)) {
      return false;
    }
    return !isCompleteReservationPayloadContext(payloadContext);
  }

  function consumeReservationAttempt(attemptId) {
    if (typeof attemptId !== "string" || attemptId === "") {
      return;
    }
    deletePendingReservationAttempt(attemptId);
    clearReservationAttemptDataset(attemptId);
    if (state.lastReservationAttemptId === attemptId) {
      state.lastReservationAttemptId = "";
    }
  }

  function clearReservationAttemptDataset(attemptId = "") {
    if (!(document.documentElement instanceof HTMLElement)) {
      return;
    }

    const currentAttemptId =
      typeof document.documentElement.dataset.zzkReservationAttemptId === "string"
        ? document.documentElement.dataset.zzkReservationAttemptId
        : "";
    if (attemptId && currentAttemptId && currentAttemptId !== attemptId) {
      return;
    }

    delete document.documentElement.dataset.zzkReservationAttemptId;
    delete document.documentElement.dataset.zzkReservationAttemptAt;
  }

  function isCompleteReservationPayloadContext(payloadContext) {
    if (!payloadContext || typeof payloadContext !== "object") {
      return false;
    }
    return Boolean(
      isMeaningfulReservationContextField("date", payloadContext.date) &&
      isMeaningfulReservationContextField("startTime", payloadContext.startTime) &&
      isMeaningfulReservationContextField("endTime", payloadContext.endTime) &&
      isMeaningfulReservationContextField("roomName", payloadContext.roomName),
    );
  }

  function reportSessionStorageFailure(event, storageKey, error) {
    pushDebugEvent("storage", event, {
      area: "sessionStorage",
      key: storageKey,
      error: getErrorMessage(error),
    });
  }

  function readActionTargetText(actionTarget) {
    if (!(actionTarget instanceof HTMLElement)) {
      return "";
    }

    if (actionTarget instanceof HTMLInputElement) {
      return [
        actionTarget.value || "",
        actionTarget.getAttribute("aria-label") || "",
        actionTarget.getAttribute("title") || "",
      ]
        .join(" ")
        .trim();
    }

    return [
      actionTarget.textContent || "",
      actionTarget.getAttribute("aria-label") || "",
      actionTarget.getAttribute("title") || "",
    ]
      .join(" ")
      .trim();
  }

  function handleReservationNetworkMessage(event) {
    return slackSuccessFlow.handleReservationNetworkMessage(event);
  }

  function queuePendingSlackCopyModal(context, options = {}) {
    return slackSuccessFlow.queuePendingSlackCopyModal(context, options);
  }

  function restorePendingSlackModalState() {
    return slackSuccessFlow.restorePendingSlackModalState();
  }

  function clearPendingSlackModalState() {
    return slackSuccessFlow.clearPendingSlackModalState();
  }

  function tryOpenPendingSlackCopyModal() {
    return slackSuccessFlow.tryOpenPendingSlackCopyModal();
  }

  function queueSlackModalFromPersistedEditSubmitIfNeeded(caller = "") {
    void caller;
    return slackSuccessFlow.queueSlackModalFromPersistedEditSubmitIfNeeded();
  }

  function normalizeReservationMutationMethod(methodValue) {
    const method = String(methodValue || "").toUpperCase();
    return method === "POST" || method === "PUT" || method === "PATCH" || method === "DELETE"
      ? method
      : "";
  }

  function parseUrlSafely(urlValue) {
    if (typeof urlValue !== "string" || urlValue.trim() === "") {
      return null;
    }

    try {
      return new URL(urlValue, location.origin);
    } catch (error) {
      return null;
    }
  }

  function createSlackMessageFingerprint(context, payload) {
    const requestUrl = parseUrlSafely(typeof payload?.url === "string" ? payload.url : "");
    return [
      context.date,
      context.startTime,
      context.endTime,
      context.roomName,
      context.ownerName,
      context.description,
      requestUrl ? requestUrl.pathname : "",
      location.pathname,
    ]
      .join("|")
      .toLowerCase();
  }

  function buildMergedSlackReservationContext(options = {}) {
    const liveContext =
      options?.liveContext && typeof options.liveContext === "object"
        ? options.liveContext
        : buildSlackReservationContext();
    const snapshotContext =
      options?.snapshotContext && typeof options.snapshotContext === "object"
        ? options.snapshotContext
        : null;
    const payloadContext =
      options?.payloadContext && typeof options.payloadContext === "object"
        ? options.payloadContext
        : null;
    const successPageContext =
      options?.successPageContext && typeof options.successPageContext === "object"
        ? options.successPageContext
        : null;
    const payloadOwnerName = normalizeHostReservationOwnerCandidate(
      options?.payloadOwnerName || "",
    );

    const safeLiveContext = { ...liveContext };
    const sources = [payloadContext, successPageContext, snapshotContext, safeLiveContext].filter(
      (source) => source && typeof source === "object",
    );

    const pickField = (fieldName, extraCandidates = []) => {
      const candidates = [...sources.map((source) => source[fieldName]), ...extraCandidates];
      for (const candidate of candidates) {
        const normalizedCandidate = normalizeReservationContextField(fieldName, candidate);
        if (isMeaningfulReservationContextField(fieldName, normalizedCandidate)) {
          return normalizedCandidate;
        }
      }

      return "";
    };

    const mergedContext = {
      mapName:
        pickField("mapName") ||
        normalizeReservationContextField("mapName", safeLiveContext.mapName) ||
        state.latestMapName ||
        "회의실 지도",
      roomName: pickField("roomName") || "-",
      ownerName:
        pickField("ownerName", [payloadOwnerName, state.lastKnownReservationOwnerName]) ||
        normalizeHostReservationOwnerCandidate(state.lastKnownReservationOwnerName || "") ||
        "-",
      channelMention:
        pickField("channelMention") ||
        normalizeSlackChannelToken(state.slackChannelMention || "", {
          allowBare: true,
        }),
      description: pickField("description") || "-",
      date: pickField("date") || "-",
      startTime: pickField("startTime") || "--:--",
      endTime: pickField("endTime") || "--:--",
      reservationLink: resolveReservationLinkFromContext(pickField("reservationLink")),
    };

    if (isMeaningfulSlackContextValue(mergedContext.ownerName)) {
      rememberReservationOwnerName(mergedContext.ownerName);
    }

    return mergedContext;
  }

  function resolveReservationContextFromPayload(payload) {
    if (!payload || typeof payload !== "object") {
      return null;
    }

    const requestContext =
      payload.requestContext && typeof payload.requestContext === "object"
        ? payload.requestContext
        : null;
    const source = requestContext || payload;
    const roomNameFromContext = resolveReservationRoomNameFromSource(source);

    const startParts = extractDateTimeParts(source.startDateTime || source.startTime || "");
    const endParts = extractDateTimeParts(source.endDateTime || source.endTime || "");
    const explicitDate = normalizeDateString(
      source.date || source.reservationDate || source.startDate || "",
    );
    const context = {
      date: explicitDate || startParts.date || endParts.date || "",
      startTime: startParts.time || normalizeHourMinute(source.startTime || "") || "",
      endTime: endParts.time || normalizeHourMinute(source.endTime || "") || "",
      description: normalizeReservationDescriptionCandidate(
        source.description ||
          source.purpose ||
          source.usagePurpose ||
          source.memo ||
          source.content ||
          "",
      ),
      roomName: roomNameFromContext,
      ownerName: normalizeHostReservationOwnerCandidate(
        source.ownerName || source.name || source.ownerNameCandidate || "",
      ),
      reservationLink: normalizeReservationContextField(
        "reservationLink",
        source.reservationLink || payload.url || "",
      ),
    };

    const hasAnyField = Object.values(context).some((value) =>
      isMeaningfulSlackContextValue(String(value || "")),
    );
    return hasAnyField ? context : null;
  }

  function resolveReservationRoomNameFromSource(source) {
    const directRoomName = normalizeReservationContextField(
      "roomName",
      source.roomName || source.spaceName || source.room || "",
    );
    if (directRoomName) {
      return directRoomName;
    }

    const roomId = parseReservationRoomIdCandidate(
      source.roomId || source.spaceId || source.targetRoomId || source.room_id || source.space_id,
    );
    const knownRooms = getLatestKnownRooms();
    if (!Number.isInteger(roomId) || knownRooms.length === 0) {
      return "";
    }

    const matchedRoom = knownRooms.find((room) => Number(room?.id) === roomId);
    if (!matchedRoom || typeof matchedRoom.name !== "string") {
      return "";
    }

    return normalizeReservationContextField("roomName", matchedRoom.name);
  }

  function parseReservationRoomIdCandidate(value) {
    if (Number.isInteger(value)) {
      return value;
    }

    if (typeof value === "string") {
      const parsed = Number.parseInt(value.trim(), 10);
      return Number.isInteger(parsed) ? parsed : null;
    }

    return null;
  }

  function normalizeReservationContextField(fieldName, value) {
    if (fieldName === "date") {
      return normalizeDateString(value) || "";
    }

    if (fieldName === "startTime" || fieldName === "endTime") {
      return normalizeHourMinute(value) || "";
    }

    if (fieldName === "ownerName") {
      return normalizeHostReservationOwnerCandidate(value) || "";
    }

    if (fieldName === "roomName") {
      const normalizedRoomCandidate = normalizeHostRoomCandidate(value || "");
      if (!normalizedRoomCandidate) {
        return "";
      }

      return extractKnownRoomName(normalizedRoomCandidate);
    }

    if (fieldName === "description") {
      return normalizeReservationDescriptionCandidate(value);
    }

    if (fieldName === "reservationLink") {
      const normalizedValue = normalizeSlackFieldText(value || "");
      if (!normalizedValue) {
        return "";
      }

      const parsedUrl = parseUrlSafely(normalizedValue);
      return parsedUrl ? parsedUrl.href : "";
    }

    if (fieldName === "attendeeMentions") {
      return normalizeSlackMentionText(value || "");
    }

    return normalizeSlackFieldText(value || "");
  }

  function normalizeReservationDescriptionCandidate(value) {
    const normalized = normalizeSlackFieldText(value || "");
    if (!normalized) {
      return "";
    }

    if (["-", "--", "내용", "예약내용", "사용목적", "이용목적"].includes(normalized)) {
      return "";
    }

    return normalized;
  }

  function isMeaningfulReservationContextField(fieldName, value) {
    const normalized = normalizeSlackFieldText(value || "");
    if (!normalized || normalized === "-") {
      return false;
    }

    if (fieldName === "date") {
      return normalizeDateString(normalized) != null;
    }
    if (fieldName === "startTime" || fieldName === "endTime") {
      return normalizeHourMinute(normalized) != null;
    }
    if (fieldName === "reservationLink") {
      return parseUrlSafely(normalized) != null;
    }

    return true;
  }

  function extractDateTimeParts(value) {
    const normalized = normalizeSlackFieldText(typeof value === "string" ? value : "");
    if (!normalized) {
      return { date: "", time: "" };
    }

    const dateMatch = normalized.match(/(\d{4}-\d{2}-\d{2})/);
    const timeMatch = normalized.match(/(\d{1,2}:\d{2})/);

    return {
      date: dateMatch ? normalizeDateString(dateMatch[1]) || "" : "",
      time: timeMatch ? normalizeHourMinute(timeMatch[1]) || "" : "",
    };
  }

  function resolveReservationLinkFromContext(candidateLink) {
    const parsedCandidate = parseUrlSafely(candidateLink || "");
    const baseLink = getGuestBaseReservationLink();
    if (!parsedCandidate) {
      return baseLink;
    }

    if (isGuestSuccessPath(parsedCandidate.pathname)) {
      return baseLink;
    }

    return parsedCandidate.href;
  }

  function getGuestBaseReservationLink() {
    const match = location.pathname.match(/^\/guest\/([^/?#]+)/);
    if (!match) {
      return location.href;
    }

    return `${location.origin}/guest/${match[1]}`;
  }

  function isGuestSuccessPath(pathname) {
    return typeof pathname === "string" && /^\/guest\/[^/?#]+\/success\/?$/.test(pathname);
  }

  function resolveReservationOwnerNameFromPayload(payload) {
    if (!payload || typeof payload !== "object") {
      return "";
    }

    const directCandidates = [
      payload.ownerNameCandidate,
      payload.ownerName,
      payload.name,
      payload.requesterName,
      payload.bookerName,
      payload.guestName,
    ];

    for (const candidate of directCandidates) {
      const normalizedCandidate = normalizeHostReservationOwnerCandidate(candidate);
      if (normalizedCandidate) {
        return normalizedCandidate;
      }
    }

    return "";
  }

  function isMeaningfulSlackContextValue(value) {
    const normalized = normalizeSlackFieldText(typeof value === "string" ? value : "");
    return normalized !== "" && normalized !== "-";
  }

  function shouldSkipSlackCopyModal(fingerprint) {
    if (typeof fingerprint !== "string" || fingerprint === "") {
      return false;
    }

    const now = Date.now();
    const isDuplicate =
      state.lastSlackModalFingerprint === fingerprint &&
      now - (state.lastSlackModalShownAt || 0) < 15000;

    state.lastSlackModalFingerprint = fingerprint;
    state.lastSlackModalShownAt = now;
    return isDuplicate;
  }

  function buildSlackReservationContext(rootOverride = null) {
    const root =
      rootOverride instanceof HTMLElement || rootOverride === document
        ? rootOverride
        : getHostReservationRoot();
    const hostDateInput = queryHostDateInput(root);
    const panelDateInput = state.elements?.dateInput;
    const observedTimes = readHostReservationTimeValues(root);
    const panelStartInput = state.elements?.startInput;
    const panelEndInput = state.elements?.endInput;

    const date =
      normalizeDateString(hostDateInput instanceof HTMLInputElement ? hostDateInput.value : "") ||
      normalizeDateString(panelDateInput instanceof HTMLInputElement ? panelDateInput.value : "") ||
      "-";

    const startTime =
      normalizeHourMinute(
        observedTimes.startTime ||
          (panelStartInput instanceof HTMLInputElement ? panelStartInput.value : ""),
      ) || "--:--";
    const endTime =
      normalizeHourMinute(
        observedTimes.endTime ||
          (panelEndInput instanceof HTMLInputElement ? panelEndInput.value : ""),
      ) || "--:--";

    const roomName = readHostRoomName(root) || "-";
    const resolvedOwnerName =
      readHostReservationOwnerName(root) ||
      normalizeHostReservationOwnerCandidate(state.lastKnownReservationOwnerName || "");
    const ownerName = resolvedOwnerName || "-";
    const usagePurpose = readHostReservationFieldValue(root, [
      "사용목적",
      "이용목적",
      "purpose",
      "목적",
    ]);
    const description =
      usagePurpose ||
      readHostReservationFieldValue(root, ["예약내용", "description", "메모", "내용"]) ||
      "-";
    const defaultMutationMethod = "POST";

    return {
      mapName: state.latestMapName || "회의실 지도",
      roomName,
      ownerName,
      channelMention: normalizeSlackChannelToken(state.slackChannelMention || "", {
        allowBare: true,
      }),
      description,
      date,
      startTime,
      endTime,
      reservationLink: location.href,
      mutationMethod: normalizeReservationMutationMethod(defaultMutationMethod),
    };
  }

  function readHostRoomName(root = document) {
    const scopedSelect = root.querySelector("select[name='spaceId'], select[name='roomId']");
    const roomSelect =
      scopedSelect instanceof HTMLSelectElement
        ? scopedSelect
        : document.querySelector("select[name='spaceId'], select[name='roomId']");

    if (roomSelect instanceof HTMLSelectElement && roomSelect.selectedIndex >= 0) {
      const option = roomSelect.options[roomSelect.selectedIndex];
      if (option instanceof HTMLOptionElement) {
        const optionName = normalizeHostRoomCandidate(option.textContent || "");
        if (optionName) {
          return extractKnownRoomName(optionName);
        }
      }
    }

    const dropdownButton = findHostRoomDropdownButton(root);
    if (dropdownButton instanceof HTMLButtonElement) {
      const buttonName = normalizeHostRoomCandidate(dropdownButton.textContent || "");
      if (buttonName) {
        return extractKnownRoomName(buttonName);
      }
    }

    if (state.appliedSelection && Number.isInteger(state.appliedSelection.roomId)) {
      const matchedRoom = getLatestKnownRooms().find(
        (room) => room.id === state.appliedSelection.roomId,
      );
      if (matchedRoom && typeof matchedRoom.name === "string" && matchedRoom.name.trim()) {
        return matchedRoom.name.trim();
      }
    }

    return "";
  }

  function readHostReservationOwnerName(root = document) {
    const ownerSpecificKeywords = [
      "예약자명",
      "예약자",
      "신청자명",
      "신청자",
      "requester",
      "booker",
      "owner",
      "owner name",
      "guest",
      "guest name",
    ];
    const ownerFallbackKeywords = ["이름", "name"];
    const ownerFieldOptions = {
      includeReadOnly: true,
      includeDisabled: true,
      allowInputTypes: ["text", "search", "email", ""],
      includeExtendedControls: true,
      requireVisible: true,
    };

    const ownerFromNameInput =
      readHostReservationOwnerFromNameInputs(root) ||
      (root !== document ? readHostReservationOwnerFromNameInputs(document) : "");
    if (ownerFromNameInput) {
      return rememberReservationOwnerName(ownerFromNameInput) || ownerFromNameInput;
    }

    const ownerFromRoot =
      normalizeHostReservationOwnerCandidate(
        readHostReservationFieldValue(root, ownerSpecificKeywords, ownerFieldOptions),
      ) ||
      normalizeHostReservationOwnerCandidate(
        readHostReservationFieldValue(root, ownerFallbackKeywords, ownerFieldOptions),
      );
    if (ownerFromRoot) {
      return rememberReservationOwnerName(ownerFromRoot) || ownerFromRoot;
    }

    if (root !== document) {
      const ownerFromDocument =
        normalizeHostReservationOwnerCandidate(
          readHostReservationFieldValue(document, ownerSpecificKeywords, ownerFieldOptions),
        ) ||
        normalizeHostReservationOwnerCandidate(
          readHostReservationFieldValue(document, ownerFallbackKeywords, ownerFieldOptions),
        );
      if (ownerFromDocument) {
        return rememberReservationOwnerName(ownerFromDocument) || ownerFromDocument;
      }
    }

    return "";
  }

  function isPotentialReservationOwnerElement(control) {
    if (!(control instanceof HTMLElement)) {
      return false;
    }

    const descriptor = buildHostFieldDescriptor(control);
    if (!descriptor) {
      return false;
    }

    return ["예약자", "신청자", "booker", "requester", "owner", "guest", "name", "이름"].some(
      (keyword) => descriptor.includes(keyword),
    );
  }

  function rememberReservationOwnerName(value) {
    const normalizedOwnerName = normalizeHostReservationOwnerCandidate(value);
    if (!normalizedOwnerName) {
      return "";
    }

    state.lastKnownReservationOwnerName = normalizedOwnerName;
    return normalizedOwnerName;
  }

  function readHostReservationOwnerFromNameInputs(root = document) {
    if (!(root instanceof HTMLElement || root === document)) {
      return "";
    }

    const candidates = Array.from(root.querySelectorAll("input[name='name']")).filter((input) => {
      if (!(input instanceof HTMLInputElement)) {
        return false;
      }
      if (isInsideExtensionSurface(input)) {
        return false;
      }

      const type = (input.type || "text").toLowerCase();
      return ["text", "search", "email", ""].includes(type);
    });

    let bestValue = "";
    let bestScore = Number.NEGATIVE_INFINITY;

    candidates.forEach((candidate) => {
      const normalizedValue = normalizeHostReservationOwnerCandidate(candidate.value || "");
      if (!normalizedValue) {
        return;
      }

      let score = 0;
      if (isElementVisible(candidate)) {
        score += 16;
      }
      if (candidate.closest("form")) {
        score += 8;
      }

      const descriptor = buildHostFieldDescriptor(candidate);
      if (descriptor.includes("예약자") || descriptor.includes("신청자")) {
        score += 8;
      }
      if (descriptor.includes("이름") || descriptor.includes("name")) {
        score += 4;
      }

      if (score > bestScore) {
        bestScore = score;
        bestValue = normalizedValue;
      }
    });

    return bestValue;
  }

  function readHostReservationFieldValue(root, keywords, options = {}) {
    if (
      !(root instanceof HTMLElement || root === document) ||
      !Array.isArray(keywords) ||
      keywords.length === 0
    ) {
      return "";
    }

    const includeReadOnly = options?.includeReadOnly === true;
    const includeDisabled = options?.includeDisabled === true;
    const includeExtendedControls = options?.includeExtendedControls === true;
    const requireVisible = options?.requireVisible === true;
    const allowInputTypes = Array.isArray(options?.allowInputTypes)
      ? options.allowInputTypes.map((type) => String(type || "").toLowerCase())
      : ["text", "search", ""];
    const allowInputTypeSet = new Set(allowInputTypes);
    const keywordSet = keywords
      .map((keyword) => String(keyword || "").toLowerCase())
      .filter(Boolean);
    const selector = includeExtendedControls
      ? "input, textarea, select, button, [role='combobox'], [role='textbox'], [contenteditable='true']"
      : "input, textarea";
    const controls = Array.from(root.querySelectorAll(selector)).filter((control) => {
      if (!(control instanceof HTMLElement)) {
        return false;
      }
      if (isInsideExtensionSurface(control)) {
        return false;
      }
      if (
        control instanceof HTMLInputElement ||
        control instanceof HTMLTextAreaElement ||
        control instanceof HTMLSelectElement
      ) {
        if (!includeDisabled && control.disabled) {
          return false;
        }
      }
      if (control instanceof HTMLInputElement || control instanceof HTMLTextAreaElement) {
        if (!includeReadOnly && control.readOnly) {
          return false;
        }
      }
      if (control instanceof HTMLButtonElement && control.disabled) {
        return false;
      }
      if (control instanceof HTMLInputElement) {
        const type = (control.type || "text").toLowerCase();
        if (!allowInputTypeSet.has(type)) {
          return false;
        }
      }

      if (requireVisible && !isElementVisible(control)) {
        return false;
      }

      return true;
    });

    let bestValue = "";
    let bestScore = Number.NEGATIVE_INFINITY;

    controls.forEach((control) => {
      const value = includeExtendedControls
        ? readHostFieldDisplayValue(control)
        : control instanceof HTMLInputElement || control instanceof HTMLTextAreaElement
          ? normalizeSlackFieldText(control.value || "")
          : "";
      if (!value) {
        return;
      }

      const descriptor = buildHostFieldDescriptor(control);
      const score = keywordSet.reduce((accumulator, keyword) => {
        return descriptor.includes(keyword) ? accumulator + 1 : accumulator;
      }, 0);

      if (score <= 0) {
        return;
      }

      if (score > bestScore) {
        bestScore = score;
        bestValue = value;
      }
    });

    return bestValue;
  }

  function normalizeSlackMentionText(value) {
    return normalizeSlackFieldText(value);
  }

  function buildSlackReservationMessage(context) {
    const safeContext = context && typeof context === "object" ? context : {};
    const channelMention = normalizeSlackChannelToken(
      typeof safeContext.channelMention === "string"
        ? safeContext.channelMention
        : state.slackChannelMention || "",
      { allowBare: true },
    );
    const remindCommand = buildSlackRemindCommand(safeContext, channelMention);
    return remindCommand;
  }

  function resolveSlackRemindManagementGuide() {
    return "리마인더 확인이 안 될 때는 이렇게 보세요: 내가 받은 리마인더는 Later 탭에서 확인할 수 있고, /remind list에는 채널 리마인더만 표시됩니다. 그래서 채널 리마인더가 없으면 빈 목록으로 보일 수 있어요.";
  }

  function buildSlackRemindCommand(context, channelMention) {
    const normalizedChannelMention = normalizeSlackChannelToken(channelMention || "", {
      allowBare: true,
    });
    const remindTimeRangeLabel = resolveSlackRemindTimeRangeLabel(context);
    const remindSubjectLabel = resolveSlackRemindSubjectLabel(context);
    const remindLocationLabel = resolveSlackRemindLocationLabel(context);
    const remindBodyPrefix = `${remindTimeRangeLabel} ${remindSubjectLabel} at ${remindLocationLabel}`;
    const reminderDateTime = computeSlackReminderDateTime(
      context?.date,
      context?.startTime,
      context?.reminderLeadMinutes,
    );

    const formatRemindCommand = (recipient, body) => {
      const escapedRemindBody = body.replace(/"/g, '\\"');
      if (reminderDateTime) {
        return `/remind ${recipient} "${escapedRemindBody}" on ${reminderDateTime.date} at ${reminderDateTime.time}`;
      }

      return `/remind ${recipient} "${escapedRemindBody}" at HH:MM`;
    };

    if (normalizedChannelMention) {
      return formatRemindCommand(normalizedChannelMention, `${remindBodyPrefix} @channel`);
    }

    return formatRemindCommand("me", remindBodyPrefix);
  }

  function resolveSlackRemindTimeRangeLabel(context) {
    const rawStartTime = typeof context?.startTime === "string" ? context.startTime : "";
    const rawEndTime = typeof context?.endTime === "string" ? context.endTime : "";
    const normalizedStartTime = normalizeHourMinute(rawStartTime) || "--:--";
    const normalizedEndTime = normalizeHourMinute(rawEndTime) || "--:--";
    return `${normalizedStartTime}-${normalizedEndTime}`;
  }

  function resolveSlackRemindSubjectLabel(context) {
    const normalizedSubject = normalizeSlackFieldText(
      typeof context?.description === "string" ? context.description : "",
    );

    if (!normalizedSubject || normalizedSubject === "-") {
      return "회의";
    }

    return normalizedSubject;
  }

  function resolveSlackRemindLocationLabel(context) {
    const rawRoomName = normalizeSlackFieldText(
      typeof context?.roomName === "string" ? context.roomName : "",
    );
    const sanitizedRoomName = rawRoomName === "-" ? "" : rawRoomName;
    const normalizedRoomName =
      sanitizedRoomName.replace(/^\d+\s*층\s*/u, "").trim() || sanitizedRoomName;
    const floorFromMap = normalizedRoomName
      ? MAP_CALENDAR_ROOM_FLOOR_BY_NAME.get(normalizedRoomName) || ""
      : "";
    const floorFromText = sanitizedRoomName.match(/(\d+\s*층)/u)?.[1]?.replace(/\s+/g, "") || "";
    const floorLabel = formatSlackFloorLabel(floorFromMap || floorFromText);
    const roomLabel = normalizedRoomName || "회의실";
    return [floorLabel, roomLabel].filter(Boolean).join(" ");
  }

  function formatSlackFloorLabel(value) {
    const normalizedValue = normalizeSlackFieldText(value);
    const matchedFloor = normalizedValue.match(/^(\d+)\s*층$/u);
    if (matchedFloor) {
      return `${matchedFloor[1]}F`;
    }

    return normalizedValue;
  }

  function formatSlackReservationTimeRange(dateValue, startTime, endTime) {
    const normalizedDate = isDateString(dateValue) ? dateValue : "";
    const normalizedStart = typeof startTime === "string" && startTime ? startTime : "--:--";
    const normalizedEnd = typeof endTime === "string" && endTime ? endTime : "--:--";

    if (normalizedDate) {
      return `${normalizedDate} ${normalizedStart} ~ ${normalizedDate} ${normalizedEnd}`;
    }

    return `${normalizedStart} ~ ${normalizedEnd}`;
  }

  const { showSlackCopyModal, closeSlackCopyModal, copyTextToClipboard } = createSlackWorkflow({
    state,
    SLACK_COPY_MODAL_ID,
    SLACK_COPY_MODAL_STYLE_ID,
    SLACK_COPY_MODAL_BASECOAT_STYLE_ID,
    SLACK_COPY_MODAL_BASECOAT_STYLE_PATH,
    SLACK_CHANNEL_MENTION_STORAGE_KEY,
    SLACK_CHANNEL_HISTORY_STORAGE_KEY,
    SLACK_REMINDER_LEAD_TIME_STORAGE_KEY,
    SLACK_REMINDER_LEAD_TIME_OPTIONS,
    X_ICON_SVG,
    buildSlackReservationContext,
    setMapCalendarSuppressedBySlack,
    buildSlackReservationMessage,
    normalizeSlackFieldText,
    normalizeSlackChannelToken,
    normalizeSlackReminderLeadMinutes,
    formatSlackReminderLeadOptionLabel,
    rememberSlackChannelMention,
    forgetSlackChannelMention,
    writeStoredText,
  });

  const slackSuccessFlow = createSlackSuccessFlow({
    state,
    PAGE_RESERVATION_EVENT_TYPE,
    PENDING_SLACK_MODAL_STORAGE_KEY,
    isGuestUiReadyForActivation,
    normalizeReservationMutationMethod,
    createSlackMessageFingerprint,
    shouldSkipSlackCopyModal,
    showSlackCopyModal,
    buildLmsSlackReservationContext,
    onReservationMutated: invalidateReservationCaches,
  });

  // 개편 서비스(lms+) 예약 생성 응답 body → Slack 모달 context.
  // 응답 예: {date,startTime,endTime,spaceName,floor,purpose,reserverName,mine,id,spaceId}
  function buildLmsSlackReservationContext(responseBody) {
    if (!responseBody || typeof responseBody !== "object") {
      return null;
    }
    const date = typeof responseBody.date === "string" ? responseBody.date : "";
    const startTime = normalizeHourMinute(
      typeof responseBody.startTime === "string" ? responseBody.startTime : "",
    );
    const endTime = normalizeHourMinute(
      typeof responseBody.endTime === "string" ? responseBody.endTime : "",
    );
    if (!isDateString(date) || !startTime || !endTime) {
      return null;
    }

    const spaceName =
      typeof responseBody.spaceName === "string" ? responseBody.spaceName.trim() : "";
    const floorLabel = Number.isInteger(Number(responseBody.floor))
      ? `${Number(responseBody.floor)}층`
      : "";
    // roomName 은 "12층 보이저" 형태로 만들어 Slack 위치 라벨이 층까지 표시하게 한다.
    const roomName = [floorLabel, spaceName].filter(Boolean).join(" ") || spaceName;

    const owner =
      typeof responseBody.reserverName === "string" ? responseBody.reserverName.trim() : "";
    const purpose = typeof responseBody.purpose === "string" ? responseBody.purpose.trim() : "";

    return {
      date,
      startTime,
      endTime,
      roomName,
      // 지문/병합 컨텍스트가 고정 키 ownerName 으로 예약자를 읽으므로 그 키로 맞춘다.
      ownerName: owner,
      // Slack 메시지 subject 는 context.description 을 쓴다.
      description: purpose,
      channelMention: state.slackChannelMention || "",
      reminderLeadMinutes: normalizeSlackReminderLeadMinutes(state.slackReminderLeadMinutes),
    };
  }

  // lms+ 예약 페이지에는 지연 마운트 조건이 없어 레이더 UI 를 바로 띄울 수 있다.
  function shouldDelayGuestMapCalendarUi() {
    return false;
  }

  function isGuestUiReadyForActivation() {
    return true;
  }

  function syncMapCalendarAlwaysOpenPreference() {
    state.mapCalendarAlwaysOpen = readStoredBoolean(MAP_CALENDAR_ALWAYS_OPEN_STORAGE_KEY, true);
  }

  function syncSlackChannelMentionPreference() {
    state.slackChannelMention = normalizeSlackChannelToken(
      readStoredText(SLACK_CHANNEL_MENTION_STORAGE_KEY, ""),
      { allowBare: true },
    );
    state.slackChannelHistory = readStoredChannelTokens(SLACK_CHANNEL_HISTORY_STORAGE_KEY);
  }

  function rememberSlackChannelMention(channelMention) {
    const normalizedChannel = normalizeSlackChannelToken(channelMention, {
      allowBare: false,
    });
    if (!normalizedChannel) {
      return [];
    }

    const nextHistory = [
      normalizedChannel,
      ...state.slackChannelHistory.filter((token) => token !== normalizedChannel),
    ].slice(0, 10);
    state.slackChannelHistory = nextHistory;
    writeStoredChannelTokens(SLACK_CHANNEL_HISTORY_STORAGE_KEY, nextHistory);
    return nextHistory;
  }

  function forgetSlackChannelMention(channelMention) {
    const normalizedChannel = normalizeSlackChannelToken(channelMention, {
      allowBare: false,
    });
    if (!normalizedChannel) {
      return [];
    }

    const nextHistory = state.slackChannelHistory.filter((token) => token !== normalizedChannel);
    state.slackChannelHistory = nextHistory;
    writeStoredChannelTokens(SLACK_CHANNEL_HISTORY_STORAGE_KEY, nextHistory);
    return nextHistory;
  }

  function syncSlackReminderLeadTimePreference() {
    state.slackReminderLeadMinutes = normalizeSlackReminderLeadMinutes(
      readStoredText(
        SLACK_REMINDER_LEAD_TIME_STORAGE_KEY,
        String(DEFAULT_SLACK_REMINDER_LEAD_TIME_MINUTES),
      ),
    );
  }

  function readStoredChannelTokens(storageKey) {
    const rawValue = readStoredText(storageKey, "");
    if (!rawValue) {
      return [];
    }

    const normalizedTokens = rawValue
      .split(/\n+/)
      .map((token) => normalizeSlackChannelToken(token, { allowBare: false }))
      .filter(Boolean);

    return Array.from(new Set(normalizedTokens));
  }

  function writeStoredChannelTokens(storageKey, channelTokens) {
    if (!Array.isArray(channelTokens) || channelTokens.length === 0) {
      writeStoredText(storageKey, "");
      return;
    }

    const normalizedTokens = Array.from(
      new Set(
        channelTokens
          .map((token) => normalizeSlackChannelToken(token, { allowBare: false }))
          .filter(Boolean),
      ),
    );
    writeStoredText(storageKey, normalizedTokens.join("\n"));
  }

  function sendMessage(message) {
    pushDebugEvent("transport", "send-message", {
      type: message?.type,
      fallbackCandidate: shouldUseDirectApiFallback(message),
    });
    // lms+ 는 페이지 localStorage 의 JWT 를 Authorization 헤더로 붙여야 하는데,
    // 백그라운드 서비스워커는 페이지 저장소를 못 읽는다. 그래서 API 요청은 백그라운드를
    // 거치지 않고 콘텐츠 스크립트(direct)에서 바로 처리한다.
    if (shouldUseDirectApiFallback(message)) {
      return sendMessageDirectFallback(message);
    }
    return sendMessageViaRuntime(message).catch((runtimeError) => {
      pushDebugEvent("transport", "runtime-failed", {
        type: message?.type,
        error: getErrorMessage(runtimeError),
      });
      if (isRuntimeMessageTimeoutError(runtimeError)) {
        throw runtimeError;
      }
      if (!shouldUseDirectApiFallback(message)) {
        throw runtimeError;
      }
      debugLog("transport", "falling back to direct API", {
        type: message?.type,
      });
      return sendMessageDirectFallback(message);
    });
  }

  function sendMessageViaRuntime(message) {
    return new Promise((resolve, reject) => {
      if (
        typeof chrome === "undefined" ||
        !chrome.runtime ||
        typeof chrome.runtime.sendMessage !== "function"
      ) {
        reject(new Error("chrome.runtime.sendMessage를 사용할 수 없습니다."));
        return;
      }

      let settled = false;
      const hardTimeoutMs = RUNTIME_MESSAGE_TIMEOUT_MS * 5;
      const timer = window.setTimeout(() => {
        if (settled) {
          return;
        }
        if (shouldUseDirectApiFallback(message)) {
          pushDebugEvent("transport", "runtime-timeout-waiting", {
            type: message?.type,
            timeoutMs: RUNTIME_MESSAGE_TIMEOUT_MS,
          });
          return;
        }
        settled = true;
        window.clearTimeout(hardTimer);
        reject(createRuntimeMessageTimeoutError());
      }, RUNTIME_MESSAGE_TIMEOUT_MS);
      const hardTimer = window.setTimeout(() => {
        if (settled) {
          return;
        }
        settled = true;
        window.clearTimeout(timer);
        reject(createRuntimeMessageTimeoutError());
      }, hardTimeoutMs);

      try {
        chrome.runtime.sendMessage(message, (response) => {
          if (settled) {
            return;
          }

          settled = true;
          window.clearTimeout(timer);
          window.clearTimeout(hardTimer);
          const runtimeError = chrome.runtime.lastError;
          if (runtimeError) {
            reject(new Error(runtimeError.message || "runtime 통신 오류"));
            return;
          }

          pushDebugEvent("transport", "runtime-response", {
            type: message?.type,
            ok: response?.ok === true,
          });
          resolve(response);
        });
      } catch (error) {
        if (settled) {
          return;
        }
        settled = true;
        window.clearTimeout(timer);
        window.clearTimeout(hardTimer);
        reject(error);
      }
    });
  }

  function createRuntimeMessageTimeoutError() {
    const error = new Error("runtime 메시지 응답이 지연되고 있습니다.");
    error.name = "ZzkRuntimeMessageTimeoutError";
    return error;
  }

  function isRuntimeMessageTimeoutError(error) {
    return Boolean(
      error && typeof error === "object" && error.name === "ZzkRuntimeMessageTimeoutError",
    );
  }

  function shouldUseDirectApiFallback(message) {
    if (!message || typeof message !== "object") {
      return false;
    }

    return typeof getDirectApiFallbackHandler(message.type) === "function";
  }

  function getDirectApiFallbackHandler(messageType) {
    if (messageType === "ZZK_FETCH_AVAILABILITY") {
      return fetchLmsAvailability;
    }

    if (messageType === "ZZK_FETCH_DAILY_SCHEDULE") {
      return fetchLmsDailySchedule;
    }

    return null;
  }

  async function sendMessageDirectFallback(message) {
    pushDebugEvent("transport", "direct-fallback-start", {
      type: message?.type,
    });
    try {
      const handler = getDirectApiFallbackHandler(message && message.type);
      if (typeof handler === "function") {
        const data = await handler(message.payload);
        pushDebugEvent("transport", "direct-fallback-success", {
          type: message?.type,
        });
        return { ok: true, data };
      }

      return { ok: false, error: "지원하지 않는 요청입니다." };
    } catch (error) {
      return { ok: false, error: getErrorMessage(error) };
    }
  }

  function normalizeDateInput(inputElement) {
    if (!(inputElement instanceof HTMLInputElement)) {
      return "";
    }

    const minimumDate = getMinimumSelectableDateForCurrentContext(inputElement.value);
    setDateInputMinimum(inputElement, minimumDate);
    const normalizedDate = clampDateToMin(inputElement.value, minimumDate);
    if (inputElement.value !== normalizedDate) {
      inputElement.value = normalizedDate;
    }

    return inputElement.value;
  }

  function getMinimumSelectableDateForCurrentContext(value) {
    return shouldAllowPastReservationDate(value) ? "" : getTodayDateInKST();
  }

  // lms+ 에는 과거 날짜를 허용하는 수정 페이지가 없다.
  function shouldAllowPastReservationDate() {
    return false;
  }

  function setDateInputMinimum(inputElement, minimumDate) {
    if (!(inputElement instanceof HTMLInputElement)) {
      return;
    }
    if (isDateString(minimumDate)) {
      inputElement.min = minimumDate;
      return;
    }
    inputElement.removeAttribute("min");
  }

  function clampDateToMin(value, minDate) {
    if (!isDateString(minDate)) {
      return isDateString(value) ? value : "";
    }

    if (!isDateString(value)) {
      return minDate;
    }

    return value < minDate ? minDate : value;
  }

  function renderDateDisplayLabel(labelElement, dateString) {
    if (!(labelElement instanceof HTMLElement)) {
      return;
    }

    if (!isDateString(dateString)) {
      labelElement.textContent = "";
      return;
    }

    const [year, month, day] = dateString.split("-");
    const weekdayText = formatKSTWeekday(dateString);
    if (!weekdayText) {
      labelElement.textContent = `${year}.${month}.${day}`;
      return;
    }

    const weekdaySpan = document.createElement("span");
    weekdaySpan.className = "zzk-date-display-weekday";
    if (weekdayText === "토") {
      weekdaySpan.classList.add("is-saturday");
    }
    if (weekdayText === "일") {
      weekdaySpan.classList.add("is-sunday");
    }
    weekdaySpan.textContent = weekdayText;

    labelElement.replaceChildren(
      document.createTextNode(`${year}.${month}.${day} (`),
      weekdaySpan,
      document.createTextNode(")"),
    );
  }

  function normalizeTimeInput(inputElement) {
    if (!(inputElement instanceof HTMLInputElement)) {
      return "";
    }

    const normalized = normalizeToTenMinute(inputElement.value);
    if (normalized && inputElement.value !== normalized) {
      inputElement.value = normalized;
    }

    return inputElement.value;
  }

  function validateTenMinuteField(inputElement) {
    if (!(inputElement instanceof HTMLInputElement)) {
      return false;
    }

    const valid =
      inputElement.value !== "" &&
      !inputElement.validity.stepMismatch &&
      isTenMinuteAligned(inputElement.value);

    inputElement.setCustomValidity(valid ? "" : "시간은 10분 단위로 입력해 주세요.");

    if (!valid) {
      inputElement.reportValidity();
    }

    return valid;
  }

  function getLatestRoomsForSpaceTab(tab = state.mapCalendarSpaceTab) {
    const normalizedTab = normalizeMapCalendarSpaceTab(tab);
    const cachedRooms = state.latestRoomsBySpaceTab.get(normalizedTab);
    if (Array.isArray(cachedRooms)) {
      return cachedRooms;
    }

    return Array.isArray(state.latestRooms)
      ? getRoomsForMapCalendarSpaceTab(state.latestRooms, normalizedTab)
      : [];
  }

  function getLatestKnownRooms() {
    const mergedById = new Map();
    if (Array.isArray(state.latestRooms)) {
      state.latestRooms.forEach((room) => {
        if (Number.isInteger(room?.id)) {
          mergedById.set(room.id, room);
        }
      });
    }
    state.latestRoomsBySpaceTab.forEach((rooms) => {
      if (!Array.isArray(rooms)) {
        return;
      }
      rooms.forEach((room) => {
        if (Number.isInteger(room?.id)) {
          mergedById.set(room.id, room);
        }
      });
    });
    return Array.from(mergedById.values());
  }

  function getMapCalendarSpaceTabLabel(tab = state.mapCalendarSpaceTab) {
    return normalizeMapCalendarSpaceTab(tab) === MAP_CALENDAR_SPACE_TAB_PAIR ? "페어룸" : "회의실";
  }

  function getRoomsForMapCalendarSpaceTab(rooms, tab = state.mapCalendarSpaceTab) {
    const normalizedTab = normalizeMapCalendarSpaceTab(tab);
    return Array.isArray(rooms)
      ? rooms.filter((room) => {
          const normalizedName = normalizeTargetRoomName(room?.name);
          const metadata = TARGET_ROOM_METADATA_BY_NORMALIZED_NAME.get(normalizedName);
          const roomKind = metadata?.kind || inferRoomKindFromName(room?.name);
          return roomKind === normalizedTab;
        })
      : [];
  }

  function getRoomTypeForRoomName(roomName) {
    const normalizedName = normalizeTargetRoomName(roomName);
    const metadata = TARGET_ROOM_METADATA_BY_NORMALIZED_NAME.get(normalizedName);
    return metadata?.kind || inferRoomKindFromName(roomName);
  }

  function inferRoomKindFromName(roomName) {
    const normalizedName = normalizeTargetRoomName(roomName);
    return normalizedName.startsWith("페")
      ? MAP_CALENDAR_SPACE_TAB_PAIR
      : MAP_CALENDAR_SPACE_TAB_MEETING;
  }

  // 테스트 훅: 테스트 호스트(example.com), 테스트가 미리 심어둔 플래그, 또는 DEBUG 모드에서만
  // 노출한다. lms+ 실제 호스트에서는 플래그가 없으므로 그대로 감춰진다.
  if (location.hostname === "example.com" || globalThis.__ZZK_TEST_HOOKS__ === true || DEBUG_MODE) {
    globalThis.__zzkTestApi = {
      clampMapCalendarWidth,
      getMapCalendarWidthBounds,
      computeMapCalendarCurrentTimeScrollLeft,
      getCurrentMinuteOfDayInKST,
      // lms+ 예약 폼 반영 로직을 슬롯 클릭 없이 직접 검증할 때 쓴다.
      syncLmsReservationForm(payload) {
        return syncLmsReservationForm(payload);
      },
      syncGuestUi() {
        if (!isRadarSupportedPage()) {
          return false;
        }
        ensurePanel();
        ensureSlackModalTrigger();
        ensureMapCalendarLauncher();
        const openedPendingSlackModal = tryOpenPendingSlackCopyModal();
        if (isMapCalendarModalOpenRequested() && !openedPendingSlackModal) {
          openMapCalendarModal();
        }
        return true;
      },
      openRadar() {
        if (!isRadarSupportedPage()) {
          return false;
        }
        const hostDateInput = queryHostDateInput(document);
        if (
          state.elements?.dateInput instanceof HTMLInputElement &&
          hostDateInput instanceof HTMLInputElement &&
          hostDateInput.value
        ) {
          state.elements.dateInput.value = hostDateInput.value;
        }
        state.scheduleOverlayEnabled = true;
        if (state.elements?.scheduleToggle instanceof HTMLInputElement) {
          state.elements.scheduleToggle.checked = true;
        }
        state.mapCalendarVisible = true;
        openMapCalendarModal();
        return true;
      },
      async loadAndOpenRadar() {
        if (!isRadarSupportedPage()) {
          return false;
        }
        const hostDateInput = queryHostDateInput(document);
        if (
          state.elements?.dateInput instanceof HTMLInputElement &&
          hostDateInput instanceof HTMLInputElement &&
          hostDateInput.value
        ) {
          state.elements.dateInput.value = hostDateInput.value;
        }
        state.scheduleOverlayEnabled = true;
        if (state.elements?.scheduleToggle instanceof HTMLInputElement) {
          state.elements.scheduleToggle.checked = true;
        }
        state.mapCalendarVisible = true;
        const targetDate =
          normalizeDateInput(state.elements?.dateInput) || state.activeScheduleDate;
        if (targetDate) {
          await refreshDailySchedule(targetDate);
          return true;
        }
        openMapCalendarModal();
        return true;
      },
      // 테스트에서 특정 날짜의 스케줄을 직접 렌더할 때 쓴다.
      async renderScheduleForDate(date) {
        if (!isRadarSupportedPage()) {
          return false;
        }
        const normalizedDate = normalizeDateString(date);
        if (!normalizedDate) {
          return false;
        }
        if (state.elements?.dateInput instanceof HTMLInputElement) {
          state.elements.dateInput.value = normalizedDate;
        }
        state.scheduleOverlayEnabled = true;
        state.mapCalendarVisible = true;
        state.activeScheduleDate = normalizedDate;
        await refreshDailySchedule(normalizedDate);
        return true;
      },
      getStateSnapshot() {
        return {
          slackChannelHistory: Array.isArray(state.slackChannelHistory)
            ? [...state.slackChannelHistory]
            : [],
          slackChannelMention: state.slackChannelMention,
          lastReservationActionAt: state.lastReservationActionAt,
          lastReservationContext: state.lastReservationContext,
          lastReservationAttemptId: state.lastReservationAttemptId,
          pendingReservationAttemptCount: state.pendingReservationAttempts.size,
          pendingReservationAttemptIds: Array.from(state.pendingReservationAttempts.keys()),
          lastKnownReservationOwnerName: state.lastKnownReservationOwnerName,
          pendingSlackModalContext: state.pendingSlackModalContext,
          pendingSlackModalRequiresNonEditPage: state.pendingSlackModalRequiresNonEditPage,
          pendingSlackModalReloadAttempted: state.pendingSlackModalReloadAttempted,
          slackModalVisible: state.slackModalVisible,
          lastSlackModalFingerprint: state.lastSlackModalFingerprint,
          lastSlackModalShownAt: state.lastSlackModalShownAt,
          isGuestUiReadyForActivation: isGuestUiReadyForActivation(),
          debugMode: DEBUG_MODE,
        };
      },
      // availability 캐시(TTL) 동작 검증용.
      async refreshAvailability() {
        return refreshAvailability();
      },
      // 라우트 판별. 전역 배럴을 걷어낸 뒤 테스트가 쓰던 진입점을 대체한다.
      routes: {
        isLmsSpaceReservationPage,
        isRadarSupportedPage,
        getSharingMapId,
      },
      // 데이터 계층 직접 호출(백그라운드 경유 결과와 비교할 때 쓴다).
      lmsData: {
        loadSpaceContext: loadLmsSpaceContext,
        fetchAvailability: fetchLmsAvailability,
        fetchDailySchedule: fetchLmsDailySchedule,
        fetchQuota: fetchLmsQuota,
      },
      // 저장소 차단 시 디버그 이벤트를 남기는지 검증할 때 쓴다.
      storage: {
        readStoredBoolean,
        writeStoredBoolean,
        writeStoredText,
      },
      getDebugEvents() {
        return getDebugEvents();
      },
      clearDebugEvents() {
        clearDebugEvents();
      },
    };
  }

  function persistMapCalendarSpaceTab(tab) {
    const normalizedTab = normalizeMapCalendarSpaceTab(tab);
    writeStoredText(MAP_CALENDAR_SPACE_TAB_STORAGE_KEY, normalizedTab);
  }

  boot();
})();
