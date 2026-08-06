import { createElement } from "react";
import { flushSync } from "react-dom";

import {
  cancelTimer,
  parseUrlSafely,
  toDisplayString,
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
  clampDateToMin,
  normalizeDateString,
  isDateString,
  parseHourMinute,
  minuteToHourMinute,
  normalizeHourMinute,
  normalizeToTenMinute,
  isTenMinuteAligned,
  getTodayDateInKST,
  getCurrentMinuteOfDayInKST,
  getNextHourRange,
  getEarliestSelectableMinuteForDate,
  addDaysToDateString,
  formatDateSelectorText,
} from "./utils/date-time.js";
import {
  getSharingMapId,
  isLmsSpaceReservationPage,
  isRadarSupportedPage,
} from "./utils/routes.js";
import {
  buildSlackRemindCommand,
  normalizeSlackFieldText,
  normalizeSlackChannelToken,
  normalizeSlackReminderLeadMinutes,
  formatSlackReminderLeadOptionLabel,
} from "./features/slack/shared.js";
import {
  normalizeHostReservationOwnerCandidate,
  normalizeHostRoomCandidate,
  extractKnownRoomName,
  buildHostFieldDescriptor,
  readHostFieldDisplayValue,
} from "./features/form-fields/shared.js";
import { buildSlotStates, groupRoomsByFloor } from "./features/radar/slot-model.js";
import type { PanelElements, RadarState } from "./features/state.js";
import type { DailyScheduleResult, RoomSchedule } from "./services/lms-data/types.js";
import { closeFloorMapZoom, openFloorMapZoom } from "./ui/floor-map-zoom-modal.js";
import { RadarShell } from "./ui/components/radar-shell.js";
import {
  ensureRadarOverlayMount,
  queryAllRadarOverlay,
  queryRadarOverlay,
  renderRadarOverlay,
} from "./ui/radar-overlay-mount.js";
import { renderRadarHeader } from "./ui/radar-header-mount.js";
import { renderRadarGrid } from "./ui/radar-grid-mount.js";
import { renderRadarError } from "./ui/radar-error-mount.js";
import {
  getRadarLauncherHost,
  removeRadarLauncher,
  renderRadarLauncher,
} from "./ui/radar-launcher-mount.js";
import {
  MAP_CALENDAR_OVERLAY_ID,
  MAP_CALENDAR_LAUNCHER_ID,
  SLACK_COPY_MODAL_MOUNT_ID,
  SLACK_MODAL_TRIGGER_ID,
  DEBUG_MODE,
  MAP_CALENDAR_OVERLAY_TAB_MEETING_ID,
  MAP_CALENDAR_OVERLAY_TAB_PAIR_ID,
  PAGE_RESERVATION_EVENT_TYPE,
  X_ICON_SVG,
  SLACK_CHANNEL_MENTION_STORAGE_KEY,
  SLACK_CHANNEL_HISTORY_STORAGE_KEY,
  SLACK_REMINDER_LEAD_TIME_STORAGE_KEY,
  PENDING_SLACK_MODAL_STORAGE_KEY,
  MAP_CALENDAR_ALWAYS_OPEN_STORAGE_KEY,
  MAP_CALENDAR_SPACE_TAB_STORAGE_KEY,
  MAP_CALENDAR_WIDTH_STORAGE_KEY,
  MAP_CALENDAR_FLOORMAP_OPEN_STORAGE_KEY,
  MAP_CALENDAR_MIN_WIDTH,
  MAP_CALENDAR_VIEWPORT_MARGIN,
  MAP_CALENDAR_SPACE_TAB_MEETING,
  MAP_CALENDAR_SPACE_TAB_PAIR,
  RUNTIME_MESSAGE_TIMEOUT_MS,
  DEFAULT_SLACK_REMINDER_LEAD_TIME_MINUTES,
  SLACK_REMINDER_LEAD_TIME_OPTIONS,
  LMS_DEFAULT_RESERVATION_MINUTES,
  CALENDAR_SIDE_MARGIN,
  NAV_SAFE_Z_INDEX,
  RADAR_LAUNCHER_Z_INDEX,
  normalizeMapCalendarSpaceTab,
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
import {
  clampOffsetWithinViewport,
  persistMapCalendarOffset,
  pointInRect,
  readStoredMapCalendarOffset,
} from "./features/radar/overlay-position.js";
import {
  isElementVisible,
  isHostScannableInput,
  isHostTimeControlElement,
  queryFallbackHostTimeInputs,
  queryHostDateInput,
  queryHostTimeInput,
} from "./features/form-fields/host-scan.js";
import {
  buildScheduleScopeKey,
  clearAvailabilityCache,
  readAvailabilityCache,
  readScheduleCache,
  writeAvailabilityCache,
  writeScheduleCache,
} from "./features/radar/schedule-cache.js";
import {
  compareRoomsForRadar,
  filterRoomsBySpaceTab,
  getRoomTags,
  resolveMapCalendarRoomFloor,
} from "./features/radar/room-metadata.js";
import {
  buildMapCalendarTimelineGridLayout,
  computeMapCalendarCurrentTimeScrollLeft,
} from "./features/radar/timeline-layout.js";
import { createRadarWorkflow } from "./features/radar/workflow.js";
import { createRadarFormSync } from "./features/radar/form-sync.js";
import { createSlackWorkflow } from "./features/slack/workflow.js";
import { createSlackSuccessFlow } from "./features/slack/success-flow.js";

// 같은 페이지에 두 번 주입되는 걸 막는 표식.
declare global {
  interface Window {
    __zzkAvailabilityLensLoaded?: boolean;
  }
}

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

  function isFloorMapSectionOpen() {
    // 기본은 접힘.
    return readStoredBoolean(MAP_CALENDAR_FLOORMAP_OPEN_STORAGE_KEY, false);
  }

  function persistFloorMapSectionOpen(open: boolean) {
    writeStoredBoolean(MAP_CALENDAR_FLOORMAP_OPEN_STORAGE_KEY, open);
  }

  // 타임라인 아래에 층별 평면도(SVG)를 접이식으로 붙인다. lms+ 에는 지도가 없어
  // 공간의 물리적 위치를 알 수 없으므로, 평면도로 페어룸 등의 위치를 확인하게 한다.

  // 리스너·훅을 한 번만 붙이기 위한 가드. state 에 둘 이유가 없다 —
  // 각자 자기 install 함수 안에서만 쓰고, 밖에서 읽지 않는다.
  let topNavBypassInstalled = false;
  let topNavForwarding = false;
  let reservationMessageListenerInstalled = false;
  let reservationOwnerWatcherInstalled = false;
  let hostTimePickerInteractionWatcherInstalled = false;
  let reservationIntentWatcherInstalled = false;
  let historyHookInstalled = false;
  // 예약 시도마다 붙이는 일련번호.
  let reservationAttemptSequence = 0;

  const state: RadarState = {
    loading: false,
    availabilityInflightToken: null,
    // 같은 조건(날짜·시간·탭)으로 다시 조회할 때 재사용할 마지막 응답.
    // 타임블록을 연속으로 누르면 매번 회의실 수만큼 요청이 나가므로 TTL 로 막는다.
    availabilityCache: new Map(),
    availabilityCacheFetchedAt: new Map(),
    // 아직 응답이 안 온 조회. TTL 캐시는 응답이 온 뒤에만 유효하므로,
    // 응답 전에 다시 눌린 경우는 같은 Promise 에 합류시켜 중복 요청을 막는다.
    availabilityInflightByToken: new Map(),
    latestRooms: [],
    latestRoomsBySpaceTab: new Map(),
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
    hostDateSyncDepth: 0,
    lastGuestRouteChangeAt: 0,
    lastObservedRouteKey: getCurrentRouteKey(),
    lastAutoOpenPath: null,
    latestMapName: "",
    lastReservationActionAt: 0,
    lastReservationContext: null,
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
    // 스크롤 위치 계산에 쓰는 마지막 타임라인.
    mapCalendarTimelineSnapshot: [],
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
      queueSlackModalFromPersistedEditSubmitIfNeeded("boot-ready");
      if (state.mapCalendarAlwaysOpen) {
        state.mapCalendarVisible = true;
      }
      ensureTopNavigationClickability();
      installTopNavigationClickBypass();
      ensurePanel();
      ensureSlackModalTrigger();
      ensureMapCalendarLauncher();
      const openedPendingSlackModal = tryOpenPendingSlackCopyModal();
      if (isMapCalendarModalOpenRequested() && !openedPendingSlackModal) {
        openMapCalendarModal();
      }
      void refreshAvailability();
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

  function scheduleGuestUiMutationSync(records: MutationRecord[]) {
    if (!hasRelevantGuestUiMutation(records)) {
      return;
    }

    if (Number.isInteger(state.mutationGuestUiSyncTimer)) {
      cancelTimer(state.mutationGuestUiSyncTimer);
    }

    state.mutationGuestUiSyncTimer = window.setTimeout(() => {
      state.mutationGuestUiSyncTimer = null;
      runGuestUiMutationSync("mutation-observer");
    }, 120);
  }

  function hasRelevantGuestUiMutation(records: MutationRecord[]) {
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

  function isExtensionOwnedMutationNode(node: Node | null) {
    if (!(node instanceof Element)) {
      return false;
    }

    return isInsideExtensionSurface(node) || node.id === "zzk-availability-lens-root";
  }

  function runGuestUiMutationSync(reason: unknown) {
    pushDebugEvent("guest-ui", "mutation-sync", { reason });
    if (!(document.body instanceof HTMLBodyElement)) {
      return;
    }
    if (!isRadarSupportedPage()) {
      teardownGuestUi();
      return;
    }
    queueSlackModalFromPersistedEditSubmitIfNeeded("mutation-observer");
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
        void refreshAvailability();
      }
    }
    if (
      isMapCalendarModalOpenRequested() &&
      state.activeScheduleDate &&
      !document.getElementById(MAP_CALENDAR_OVERLAY_ID)
    ) {
      scheduleCalendarOverlayRefresh();
    }
  }

  function ensurePanel() {
    ensureTopNavigationClickability();

    if (state.elements) {
      return;
    }

    state.elements = createRuntimePanelStateElements();
    initializeDefaults(state.elements);
    syncMapCalendarSpaceTabButtons();

    const sharingMapId = getSharingMapId();
    if (sharingMapId && state.currentSharingMapId !== sharingMapId) {
      syncMapCalendarAlwaysOpenPreference();
      if (state.mapCalendarAlwaysOpen) {
        if (state.elements?.scheduleToggle instanceof HTMLInputElement) {
          state.elements.scheduleToggle.checked = true;
        }
        state.mapCalendarVisible = true;
      }
    }
  }

  function createRuntimePanelStateElements() {
    const createTimeInput = () => {
      const input = document.createElement("input");
      input.type = "time";
      input.step = "600";
      input.min = "00:00";
      return input;
    };

    const dateInput = document.createElement("input");
    dateInput.type = "date";

    const scheduleToggle = document.createElement("input");
    scheduleToggle.type = "checkbox";

    return {
      dateInput,
      startInput: createTimeInput(),
      endInput: createTimeInput(),
      scheduleToggle,
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
    if (topNavBypassInstalled) {
      return;
    }
    topNavBypassInstalled = true;

    document.addEventListener(
      "click",
      (event) => {
        if (!isRadarSupportedPage() || topNavForwarding) {
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

        topNavForwarding = true;
        try {
          expectedTarget.click();
        } finally {
          topNavForwarding = false;
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

  async function refreshAvailability() {
    if (!isRadarSupportedPage()) {
      return;
    }

    if (!state.elements) {
      ensurePanel();
    }
    if (!state.elements) {
      // ensurePanel 로도 못 만들었으면 호스트 화면이 아직 준비되지 않은 것이다.
      return;
    }

    const sharingMapId = getSharingMapId();
    if (!sharingMapId) {
      return;
    }

    const previousSharingMapId = state.currentSharingMapId;
    if (previousSharingMapId !== sharingMapId) {
      const isSharingMapSwitch = Boolean(previousSharingMapId);
      state.currentSharingMapId = sharingMapId;
      state.availabilityInflightToken = null;
      state.latestRoomsBySpaceTab.clear();
      if (isSharingMapSwitch) {
        state.scheduleCache.clear();
        state.scheduleCacheFetchedAtByDate.clear();
        clearAvailabilityCache(state);
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
      return;
    }

    const isStartValid = validateTenMinuteField(state.elements.startInput);
    const isEndValid = validateTenMinuteField(state.elements.endInput);

    if (!isStartValid || !isEndValid) {
      return;
    }

    if (startTime >= endTime) {
      return;
    }

    const roomType = normalizeMapCalendarSpaceTab(state.mapCalendarSpaceTab);
    const availabilityToken = `${sharingMapId}|${date}|${startTime}|${endTime}|${roomType}`;

    // 타임블록을 연속으로 누르면 같은 조건으로 반복 조회된다. TTL 안이면 재사용한다.
    const cachedAvailability = readAvailabilityCache(state, availabilityToken);
    if (cachedAvailability) {
      pushDebugEvent("availability", "cache-hit", { token: availabilityToken });
      applyAvailabilityData(cachedAvailability, { roomType });
      try {
        await refreshDailySchedule(date);
      } catch {
        removeMapCalendarOverlay();
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

      writeAvailabilityCache(state, availabilityToken, data);
      applyAvailabilityData(data, { roomType });

      try {
        await refreshDailySchedule(date);
      } catch {
        removeMapCalendarOverlay();
      }
    } catch {
      // 사용자에게 보이는 에러는 React 오버레이가 그린다.
    } finally {
      if (state.availabilityInflightByToken.get(availabilityToken) === inflight) {
        state.availabilityInflightByToken.delete(availabilityToken);
      }
      if (state.availabilityInflightToken === availabilityToken) {
        state.availabilityInflightToken = null;
      }
      state.loading = false;
    }
  }

  function syncMapCalendarSpaceTabButtons() {
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

    const activeDate = normalizeDateInput(state.elements?.dateInput) || state.activeScheduleDate;
    const isModalOpen = isMapCalendarModalOpenRequested();
    const cachedSchedule = activeDate ? getFreshScheduleCacheForTab(activeDate, activeTab) : null;
    if (cachedSchedule && isModalOpen) {
      renderMapCalendarOverlay(cachedSchedule);
      return;
    }

    if (activeDate && isModalOpen) {
      refreshDailySchedule(activeDate).catch(() => {
        // 사용자에게 보이는 에러는 React 오버레이가 그린다.
      });
    }
  }

  function setMapCalendarSpaceTab(tab: unknown, { persist = true } = {}) {
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
    void refreshAvailability();
  }

  // 예약 현황(availability)은 회의실 수만큼 요청을 보낸다. 타임블록을 연속으로
  // 누르면 그때마다 전량 재조회되므로, 스케줄 캐시와 같은 TTL 로 재사용한다.

  // 예약이 새로 생기면 캐시된 예약 목록이 즉시 낡는다. TTL(3초)을 기다리면
  // 방금 잡은 예약이 레이더에 안 보이므로, 성공 즉시 전 계층 캐시를 비우고 다시 그린다.
  function invalidateReservationCaches() {
    if (typeof clearLmsReservationCache === "function") {
      clearLmsReservationCache();
    }
    clearAvailabilityCache(state);
    state.scheduleCache.clear();
    state.scheduleCacheFetchedAtByDate.clear();
    state.scheduleInflightByDate.clear();
    pushDebugEvent("availability", "cache-invalidated", {
      reason: "reservation-mutated",
    });
  }

  // 새로 받은 응답이든 캐시된 응답이든 화면 반영은 같은 경로를 쓴다.
  function applyAvailabilityData(data: unknown, { roomType }: { roomType: unknown }) {
    const payload = (data ?? {}) as Record<string, unknown>;
    const rooms = Array.isArray(payload.rooms) ? payload.rooms : [];

    state.latestRooms = rooms;
    state.latestRoomsBySpaceTab.set(toDisplayString(roomType), rooms);
    state.latestMapName =
      typeof payload.mapName === "string" ? payload.mapName : state.latestMapName;
  }

  function getFreshScheduleCache(date: string): DailyScheduleResult | null {
    return getFreshScheduleCacheForTab(date, state.mapCalendarSpaceTab);
  }

  /** 지금 화면 조건에 맞는 캐시. 규칙은 schedule-cache 모듈이 정한다. */
  function getFreshScheduleCacheForTab(
    date: string,
    tab: unknown = state.mapCalendarSpaceTab,
    sharingMapId: unknown = state.currentSharingMapId || getSharingMapId(),
  ): DailyScheduleResult | null {
    return readScheduleCache(state, { date, tab, sharingMapId });
  }

  function isScheduleOverlayRenderedForDate(date: string, tab = state.mapCalendarSpaceTab) {
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

  function setScheduleLoadingDate(
    date: string,
    isLoading: boolean,
    tab = state.mapCalendarSpaceTab,
  ) {
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

  async function refreshDailySchedule(date: string) {
    if (!isRadarSupportedPage() || !date) {
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

    const scopeKey = buildScheduleScopeKey({
      date: normalizedDate,
      tab: activeTab,
      sharingMapId: sharingMapId,
    });
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
        },
      });

      if (!response?.ok) {
        throw new Error(response?.error || "시간대별 예약 현황을 불러오지 못했습니다.");
      }

      if (getSharingMapId() !== sharingMapId) {
        return response.data;
      }
      writeScheduleCache(
        state,
        { date: normalizedDate, tab: activeTab, sharingMapId: sharingMapId },
        response.data as DailyScheduleResult,
      );
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
      renderMapCalendarOverlay(scheduleData as DailyScheduleResult);
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
  function renderMapCalendarErrorOverlay(errorMessage: string) {
    if (!isMapCalendarModalOpenRequested()) {
      return;
    }
    if (state.mapCalendarSuppressedBySlack) {
      return;
    }

    const modalRoot = document.body;
    if (!(modalRoot instanceof HTMLBodyElement)) {
      return;
    }

    const errorRefs: { header?: HTMLElement | null } = {};
    let overlay: HTMLElement | null = null;
    flushSync(() => {
      overlay = renderRadarError({
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

    applyMapCalendarOverlayOffset(overlay);
    updateMapCalendarLauncherState();

    if (errorRefs.header instanceof HTMLElement) {
      bindDraggableHeader({
        header: errorRefs.header,
        element: overlay,
        getOffset: () => state.mapCalendarOffset ?? { x: 0, y: 0 },
        setOffset: (nextOffset: { x: number; y: number }) => {
          state.mapCalendarOffset = nextOffset;
          persistMapCalendarOffset(nextOffset);
        },
        applyOffset: () => {
          applyMapCalendarOverlayOffset(overlay);
        },
      });
    }
  }

  function renderMapCalendarOverlay(scheduleData: DailyScheduleResult | null) {
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

    // 오버레이는 shadow root 마운트가 소유한다. CSS 도 그 안에 함께 들어간다.
    const overlay = ensureRadarOverlayMount().host;

    // 리렌더 시 가로 스크롤 위치를 유지하려면, 스크롤이 실제로 일어나는 요소
    // (2-pane 의 timeline-pane)의 scrollLeft 를 보존해야 한다. body 를 읽으면 항상 0 이라
    // 리렌더마다 맨 앞으로 튀는 버그가 생긴다.
    const previousScrollEl = getMapCalendarScrollElement(overlay);
    const previousBody = queryRadarOverlay('[data-testid="radar-body"]');
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
    const rooms = filterRoomsBySpaceTab(scheduleData.rooms, renderedTab)
      .slice()
      .sort(compareRoomsForRadar);
    const selectionDate = scheduleData.date || "";
    const previousRenderedScheduleDate = state.lastRenderedScheduleDate;
    state.lastRenderedScheduleDate = isDateString(selectionDate) ? selectionDate : null;
    state.mapCalendarTimelineSnapshot = Array.isArray(timeline) ? timeline : [];
    if (state.lastRenderedScheduleDate !== previousRenderedScheduleDate) {
      // 날짜가 바뀌면 현재 시각 스크롤을 다시 한 번 맞춰준다.
      state.mapCalendarCurrentTimeScrollDate = null;
    }
    state.lastRenderedScheduleTab = renderedTab;
    const earliestSelectableMinute = getEarliestSelectableMinuteForDate(selectionDate);

    if (state.appliedSelection && state.appliedSelection.date !== selectionDate) {
      state.appliedSelection = null;
    }
    if (
      state.appliedSelection &&
      !rooms.some((room: RoomSchedule) => room.id === state.appliedSelection?.roomId)
    ) {
      state.appliedSelection = null;
    }

    // 껍데기(탭/카드/헤더 자리/리사이즈 손잡이)는 React 가 그린다. 아직 명령형인
    // 헤더 컨트롤과 본문은 React 가 내준 자리(ref)에 그대로 붙인다.
    const shellRefs: {
      card?: HTMLElement | null;
      header?: HTMLElement | null;
      resizeHandle?: HTMLElement | null;
      body?: HTMLElement | null;
    } = {};
    // ref 가 채워진 상태로 아래 명령형 코드가 이어져야 하므로 이번 렌더를 동기로
    // 밀어낸다. flushSync(() => {}) 처럼 빈 콜백을 주면 대기 중인 렌더는 밀려나지
    // 않는다 — render 호출 자체가 안에 들어가야 한다.
    flushSync(() => {
      renderRadarOverlay(
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
      getOffset: () => state.mapCalendarOffset ?? { x: 0, y: 0 },
      setOffset: (nextOffset: { x: number; y: number }) => {
        state.mapCalendarOffset = nextOffset;
        persistMapCalendarOffset(nextOffset);
      },
      applyOffset: () => {
        applyMapCalendarOverlayOffset(overlay);
      },
    });

    // 헤더는 React 가 그린다. 날짜 선택은 손으로 만든 팝오버 대신 shadcn DatePicker
    // 를 쓰므로, 달력 그리기·위치 계산·바깥 클릭 감지 코드가 전부 빠졌다.
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
      });
    });

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
    const gridRoomsByFloor = groupRoomsByFloor<RoomSchedule>(
      rooms,
      resolveMapCalendarRoomFloor,
    ).map((floorGroup) => ({
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
    }));

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
          renderRoomLabel(container, room);
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

    const gridWrap = queryRadarOverlay(".zzk-map-calendar-grid-wrap");
    const axisRow = queryRadarOverlay(".zzk-map-calendar-axis-row");
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

  function syncMapCalendarBodyScrollState(bodyElement: Element | null) {
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

  function isMapCalendarModalOpenRequested() {
    return Boolean(state.mapCalendarVisible);
  }

  const {
    ensureSlackModalTrigger,
    syncMapCalendarBodyLoadingState,
    ensureMapCalendarLauncher,
    removeMapCalendarLauncher,
    updateMapCalendarLauncherState,
    openMapCalendarModal,
    removeMapCalendarOverlay,
  } = createRadarWorkflow({
    state,
    renderRadarLauncher,
    removeRadarLauncher,
    getRadarLauncherHost,

    queryRadarOverlay,

    MAP_CALENDAR_OVERLAY_ID,
    MAP_CALENDAR_LAUNCHER_ID,
    SLACK_MODAL_TRIGGER_ID,
    DEBUG_MODE,
    MAP_CALENDAR_ALWAYS_OPEN_STORAGE_KEY,
    RADAR_LAUNCHER_Z_INDEX,
    findGuestReservationTabContainer,
    findGuestReservationTabStyleSource,
    buildSlackReservationContext: (rootOverride?: Document | HTMLElement | null) =>
      buildSlackReservationContext(rootOverride),
    showSlackCopyModal: (context) => showSlackCopyModal(context),
    isRadarSupportedPage,
    isMapCalendarModalOpenRequested,
    readStoredBoolean,
    normalizeMapCalendarSpaceTab,
    isDateString,
    formatDateSelectorText,
    normalizeDateInput,
    getFreshScheduleCacheForTab,
    setScheduleLoadingDate,
    refreshDailySchedule,
    refreshAvailability,
    renderMapCalendarOverlay,
  });

  const radarFormSync = createRadarFormSync({
    state,
    ensurePanel,
    applyPanelDateChange,
    clampDateToMin,
    getMinimumSelectableDateForCurrentContext,
    getTodayDateInKST,
    minuteToHourMinute,
    normalizeDateInput,
    normalizeTimeInput,
    getFreshScheduleCache,
    setScheduleLoadingDate,
    renderMapCalendarOverlay,
    refreshAvailability,
    syncLmsReservationForm,
  });

  function setMapCalendarSuppressedBySlack(shouldSuppress: boolean) {
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

    if (!isRadarSupportedPage() || !isMapCalendarModalOpenRequested()) {
      updateMapCalendarLauncherState();
      return;
    }

    openMapCalendarModal();
  }

  function bindMapCalendarResizeHandle(handle: HTMLElement | null, card: HTMLElement | null) {
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
      } catch {
        // 포인터 캡처 실패는 드래그 자체를 막지 않는다.
      }

      const handleMove = (moveEvent: PointerEvent) => {
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
        } catch {
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

  function clampMapCalendarWidth(value: unknown) {
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

    const card = queryRadarOverlay('[data-testid="radar-card"]');
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

  function persistMapCalendarWidth(width: number) {
    const clamped = clampMapCalendarWidth(width);
    if (clamped === null) {
      return;
    }

    state.mapCalendarWidth = clamped;
    writeStoredNumber(MAP_CALENDAR_WIDTH_STORAGE_KEY, clamped);
  }

  // 가로 스크롤이 실제로 일어나는 요소. 2-pane 구조에서는 timeline-pane 이고,
  // 아직 렌더 전이면 body 로 대체한다.
  function getMapCalendarScrollElement(overlay = document.getElementById(MAP_CALENDAR_OVERLAY_ID)) {
    if (!(overlay instanceof HTMLElement)) {
      return null;
    }
    const pane = queryRadarOverlay('[data-testid="radar-timeline-pane"]');
    if (pane instanceof HTMLElement) {
      return pane;
    }
    const body = queryRadarOverlay('[data-testid="radar-body"]');
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
      slotStride: metrics.slotStride,
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

  function measureMapCalendarTrackMetrics(overlay: HTMLElement | null) {
    // 찜꽁 화면 구조 변경에 대비해 값을 하드코딩하지 않고 실제 DOM에서 측정한다.
    const slotCells = queryAllRadarOverlay(
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
    const toContentX = (viewportLeft: number) =>
      viewportLeft - scrollRectLeft + scrollEl.scrollLeft;

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

  function normalizeElementOffset(element: Element | null, offset: { x: number; y: number }) {
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
      viewport: { width: window.innerWidth, height: window.innerHeight },
      startRect: rect,
      baseOffset,
      deltaX: 0,
      deltaY: 0,
    });
  }

  function bindDraggableHeader({
    header,
    element,
    getOffset,
    setOffset,
    applyOffset,
  }: {
    header: HTMLElement | null;
    element: HTMLElement | null;
    getOffset: () => { x: number; y: number };
    setOffset: (offset: { x: number; y: number }) => void;
    applyOffset: () => void;
  }) {
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

  function isValidDragStartTarget(target: unknown) {
    if (!(target instanceof Element)) {
      return false;
    }

    return !target.closest(
      "button, input, select, textarea, a, label, [role='button'], [contenteditable='true']",
    );
  }

  function startElementDrag(
    event: Event,
    {
      element,
      getOffset,
      setOffset,
      applyOffset,
    }: {
      element: HTMLElement | null;
      getOffset: () => { x: number; y: number };
      setOffset: (offset: { x: number; y: number }) => void;
      applyOffset: () => void;
    },
  ) {
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

    const handlePointerMove = (moveEvent: PointerEvent) => {
      const deltaX = moveEvent.clientX - startX;
      const deltaY = moveEvent.clientY - startY;
      const nextOffset = clampOffsetWithinViewport({
        viewport: { width: window.innerWidth, height: window.innerHeight },
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

  function initializeDefaults(elements: PanelElements) {
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
    elements.scheduleToggle.checked = true;
  }

  function applyPanelDateChange(nextDate: unknown) {
    if (!state.elements) {
      return false;
    }

    const normalizedDate = clampDateToMin(
      normalizeDateString(nextDate),
      getMinimumSelectableDateForCurrentContext(nextDate),
    );
    if (!normalizedDate) {
      return false;
    }

    const currentPanelDate = normalizeDateString(state.elements.dateInput.value);
    const currentActiveDate = normalizeDateString(state.activeScheduleDate || "");
    if (currentPanelDate === normalizedDate && currentActiveDate === normalizedDate) {
      return false;
    }

    state.elements.dateInput.value = normalizedDate;
    resetTimelineSelectionState();
    syncScheduleOverlayToDate(normalizedDate);
    scheduleInputRefresh();
    return true;
  }

  function shiftPanelDateBy(dayOffset: number) {
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

  function handleHostDateChange(event: Event) {
    return radarFormSync.handleHostDateChange(event);
  }

  function isLatestTimelineSelectionRequest(requestId: number) {
    return radarFormSync.isLatestTimelineSelectionRequest(requestId);
  }

  function queueTimelineSelectionApply(
    selection: Parameters<typeof radarFormSync.queueTimelineSelectionApply>[0],
  ) {
    return radarFormSync.queueTimelineSelectionApply(selection);
  }

  function resetTimelineSelectionState() {
    return radarFormSync.resetTimelineSelectionState();
  }

  function syncScheduleOverlayToDate(date: string) {
    if (!date) {
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

    const scopeKey = buildScheduleScopeKey({
      date: requestedDate,
      tab: requestedTab,
      sharingMapId: requestedSharingMapId,
    });
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
        .catch(() => {
          // 사용자에게 보이는 에러는 React 오버레이가 그린다.
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

    refreshDailySchedule(requestedDate).catch(() => {
      setScheduleLoadingDate(requestedDate, false, requestedTab);
      updateMapCalendarLauncherState();
    });
  }

  function renderRoomLabel(container: HTMLElement | null, room: RoomSchedule) {
    if (!(container instanceof HTMLElement)) {
      return;
    }

    container.textContent = "";
    const roomNameText = document.createElement("span");
    roomNameText.className = "zzk-room-name-text";
    roomNameText.textContent = formatMapCalendarRoomLabel(room?.name);
    container.appendChild(roomNameText);

    const roomTags = getRoomTags(room);
    roomTags.forEach((tag) => {
      const badge = document.createElement("span");
      badge.className = "zzk-room-tag-badge";
      badge.setAttribute("data-label", tag.label);
      badge.title = tag.description;
      // 배지에는 아이콘만 보이므로 스크린리더에는 설명 전체를 준다.
      badge.setAttribute("aria-label", tag.description);
      container.appendChild(badge);
    });
  }

  function formatMapCalendarRoomLabel(roomName: unknown) {
    if (typeof roomName !== "string") {
      return "";
    }

    return roomName.trim();
  }

  function getHostReservationRoot() {
    const dateInputs = Array.from(
      document.querySelectorAll("input[name='date'], input[type='date']"),
    ).filter(
      (candidate) =>
        candidate instanceof HTMLInputElement &&
        isHostScannableInput(candidate, isInsideExtensionSurface),
    );

    if (dateInputs.length === 0) {
      return document;
    }

    let bestRoot: Document | HTMLElement = document;
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

  function isInsideExtensionSurface(target: unknown) {
    if (!(target instanceof Element)) {
      return false;
    }

    return Boolean(
      target.closest(`#${MAP_CALENDAR_OVERLAY_ID}`) ||
      target.closest(`#${MAP_CALENDAR_LAUNCHER_ID}`) ||
      target.closest(`#${SLACK_COPY_MODAL_MOUNT_ID}`),
    );
  }

  function findHostRoomDropdownButton(root: Document | HTMLElement = document) {
    const pickBestButton = (buttons: Element[]): Element | null => {
      let bestButton = null;
      let bestScore = Number.NEGATIVE_INFINITY;

      buttons.forEach((candidate: Element) => {
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

  //  - 회의실: 이름이 적힌 <button> (선택 시 bg-primary 클래스)
  //  - 시작 시간: <select>, option value 가 "HH:MM"
  //  - 이용 시간: <select>, option value 가 30분 단위 개수 ("1"=30분, "2"=60분)
  // 타임블록 클릭 결과(방/시작/종료)를 이 세 컨트롤에 반영한다.
  function findLmsRoomButton(roomName: unknown) {
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

  function isLmsRoomButtonSelected(button: Element | null) {
    if (!(button instanceof HTMLElement)) {
      return false;
    }
    // 선택된 방 버튼은 primary 배경 클래스를 가진다.
    return button.className.includes("bg-primary");
  }

  // 시작 시간 select 는 "HH:MM" 옵션들을, 이용 시간 select 는 "1"/"2" 옵션을 갖는다.
  function findLmsStartTimeSelect(startTime: unknown) {
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

  async function syncLmsReservationForm(
    payload: Record<string, unknown>,
    requestId: number | null = null,
  ) {
    // 타임블록 연속 클릭 시 이전 sync 가 나중 선택을 덮어쓰지 않도록
    // 각 await 뒤에서 최신 요청인지 확인한다.
    const isStaleRequest = () => requestId != null && !isLatestTimelineSelectionRequest(requestId);

    const startTime = normalizeHourMinute(payload.startTime);
    const endMinute = parseHourMinute(normalizeHourMinute(payload.endTime));
    const startMinute = parseHourMinute(startTime);
    const durationMinutes =
      startMinute !== null && endMinute !== null && endMinute > startMinute
        ? endMinute - startMinute
        : null;

    // 0) 날짜 input (type="date", name 없음). 회의실 버튼 클릭으로 React 가 리렌더되기
    //    전에 먼저 맞춰, 날짜가 바뀐 스케줄로 폼이 반영되게 한다.
    let dateSynced = true;
    const targetDate = normalizeDateString(payload.date);
    if (targetDate) {
      const dateInput = queryHostDateInput(document, isInsideExtensionSurface);
      if (dateInput instanceof HTMLInputElement) {
        setFormElementValue(dateInput, targetDate);
        dateSynced = normalizeDateString(dateInput.value) === targetDate;
        // React 가 날짜 변경으로 예약 목록/폼을 다시 그릴 수 있어 한 틱 기다린다.
        await new Promise((resolve) => window.setTimeout(resolve, 60));
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
        await new Promise((resolve) => window.setTimeout(resolve, 60));
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
    if (durationMinutes !== null && durationMinutes > 0) {
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

  function readHostReservationTimeValues(root: Document | HTMLElement = document) {
    const startInput = queryHostTimeInput(["start", "starttime", "start_date", "begin", "시작"], {
      root,
      isInsideExtensionSurface,
    });
    const endInput = queryHostTimeInput(["end", "endtime", "end_date", "finish", "종료"], {
      root,
      excludedInput: startInput,
      isInsideExtensionSurface,
    });

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

  function readTimeValueFromElement(element: Element | null) {
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

  function setFormElementValue(element: Element | null, value: unknown) {
    if (!(element instanceof HTMLInputElement || element instanceof HTMLSelectElement)) {
      return;
    }

    const normalizedValue = toDisplayString(value);
    if (element.value === normalizedValue) {
      return;
    }

    setFormElementValueSilently(element, normalizedValue);
    dispatchFormElementEvents(element);
  }

  function setFormElementValueSilently(element: Element | null, value: unknown) {
    if (!(element instanceof HTMLInputElement || element instanceof HTMLSelectElement)) {
      return;
    }

    const normalizedValue = toDisplayString(value);
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

  function dispatchFormElementEvents(element: Element | null) {
    if (!(element instanceof HTMLInputElement || element instanceof HTMLSelectElement)) {
      return;
    }

    element.dispatchEvent(new Event("input", { bubbles: true }));
    element.dispatchEvent(new Event("change", { bubbles: true }));
  }

  function findHostTimePickerButton(buttonLabel: string, root: Document | HTMLElement = document) {
    const normalizedLabel = normalizeTextForMatch(buttonLabel);
    const pickBestButton = (buttons: Element[]): Element | null => {
      let bestButton = null;
      let bestScore = Number.NEGATIVE_INFINITY;

      buttons.forEach((candidate: Element) => {
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

  function scheduleInputRefresh(delay = 220) {
    cancelTimer(state.inputRefreshTimer);
    state.inputRefreshTimer = window.setTimeout(() => {
      if (state.loading) {
        scheduleInputRefresh(180);
        return;
      }

      void refreshAvailability();
    }, delay);
  }

  function scheduleCalendarOverlayRefresh() {
    cancelTimer(state.autoScheduleRefreshTimer);
    state.autoScheduleRefreshTimer = window.setTimeout(() => {
      if (!isMapCalendarModalOpenRequested() || !state.activeScheduleDate) {
        return;
      }

      const activeTab =
        state.activeScheduleTab || normalizeMapCalendarSpaceTab(state.mapCalendarSpaceTab);
      const cached = getFreshScheduleCacheForTab(state.activeScheduleDate, activeTab);
      if (cached) {
        renderMapCalendarOverlay(cached);
        return;
      }

      refreshDailySchedule(state.activeScheduleDate).catch(() => {
        // 사용자에게 보이는 에러는 React 오버레이가 그린다.
      });
    }, 220);
  }

  function handleLocationChange() {
    state.lastObservedRouteKey = getCurrentRouteKey();
    if (!isRadarSupportedPage()) {
      teardownGuestUi();
      return;
    }

    state.lastGuestRouteChangeAt = Date.now();

    syncMapCalendarAlwaysOpenPreference();
    queueSlackModalFromPersistedEditSubmitIfNeeded("location-change");
    ensurePanel();
    ensureMapCalendarLauncher();
    const openedPendingSlackModal = tryOpenPendingSlackCopyModal();
    if (state.mapCalendarAlwaysOpen) {
      if (state.elements?.scheduleToggle instanceof HTMLInputElement) {
        state.elements.scheduleToggle.checked = true;
      }
      state.mapCalendarVisible = true;
      if (!openedPendingSlackModal) {
        openMapCalendarModal();
      }
    }
    void refreshAvailability();
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

  function teardownGuestUi(options: { preserveReservationContext?: boolean } = {}) {
    const preserveReservationContext = options?.preserveReservationContext === true;
    if (Number.isInteger(state.mutationGuestUiSyncTimer)) {
      cancelTimer(state.mutationGuestUiSyncTimer);
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
    state.currentSharingMapId = null;
    state.latestRooms = [];
    state.latestRoomsBySpaceTab.clear();
    state.scheduleCache.clear();
    state.scheduleCacheFetchedAtByDate.clear();
    clearAvailabilityCache(state);
    state.scheduleInflightByDate.clear();
    state.activeScheduleDate = null;
    state.activeScheduleTab = null;
    state.scheduleLoadingDate = null;
    state.scheduleLoadingTab = null;
    state.latestMapName = "";
    state.mapCalendarVisible = false;
    state.lastAutoOpenPath = null;
    if (Number.isInteger(state.pendingSlackModalTimer)) {
      cancelTimer(state.pendingSlackModalTimer);
    }
    state.pendingSlackModalTimer = null;
    if (!preserveReservationContext) {
      state.lastReservationContext = null;
      state.lastKnownReservationOwnerName = "";
      clearPendingSlackModalState();
    }
    resetTimelineSelectionState();
    if (!preserveReservationContext) {
      closeSlackCopyModal();
    }
    removeMapCalendarOverlay();
  }

  function hookHistoryChanges() {
    if (historyHookInstalled) {
      return;
    }
    historyHookInstalled = true;

    // 원본을 붙잡아 apply 로 호출한다. 몽키패칭의 본질이라 unbound-method 는
    // 여기서 의도된 것이다(page-network-hook 과 같은 이유).
    /* eslint-disable @typescript-eslint/unbound-method */
    const originalPushState = history.pushState;
    const originalReplaceState = history.replaceState;
    /* eslint-enable @typescript-eslint/unbound-method */

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
    if (reservationIntentWatcherInstalled) {
      return;
    }

    document.addEventListener("click", handleReservationIntentClick, true);
    document.addEventListener("submit", handleReservationIntentSubmit, true);
    reservationIntentWatcherInstalled = true;
  }

  function installReservationNetworkMessageListener() {
    if (reservationMessageListenerInstalled) {
      return;
    }

    window.addEventListener("message", handleReservationNetworkMessage);
    reservationMessageListenerInstalled = true;
  }

  function installReservationOwnerWatcher() {
    if (reservationOwnerWatcherInstalled) {
      return;
    }

    document.addEventListener("input", handleReservationOwnerInputEvent, true);
    document.addEventListener("change", handleReservationOwnerInputEvent, true);
    reservationOwnerWatcherInstalled = true;
  }

  function installHostTimePickerInteractionWatcher() {
    if (hostTimePickerInteractionWatcherInstalled) {
      return;
    }

    document.addEventListener("pointerdown", handleHostTimePickerManualInteraction, true);
    document.addEventListener("focusin", handleHostTimePickerManualInteraction, true);
    hostTimePickerInteractionWatcherInstalled = true;
  }

  function handleHostTimePickerManualInteraction(event: Event) {
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
  }

  function handleReservationOwnerInputEvent(event: Event) {
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

  function handleReservationIntentClick(event: Event) {
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

  function handleReservationIntentSubmit(event: Event) {
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

  function isReservationIntentActionLabel(normalizedLabel: string) {
    if (!normalizedLabel) {
      return false;
    }

    if (normalizedLabel.includes("예약하기") || normalizedLabel.includes("예약수정")) {
      return true;
    }

    return false;
  }

  function markReservationActionIntent(options: { root?: Document | HTMLElement } = {}) {
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
      isMeaningfulSlackContextValue((previousContext as Record<string, unknown>).ownerName)
    ) {
      contextSnapshot.ownerName = toDisplayString(
        (previousContext as Record<string, unknown>).ownerName,
      );
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
    reservationAttemptSequence += 1;
    return `zzk-${Date.now()}-${reservationAttemptSequence}`;
  }

  function prunePendingReservationAttempts() {
    const now = Date.now();
    const maxAgeMs = 120000;
    for (const [attemptId, attempt] of state.pendingReservationAttempts.entries()) {
      const attemptAt = Number((attempt as { at?: unknown })?.at || 0);
      if (!Number.isFinite(attemptAt) || now - attemptAt > maxAgeMs) {
        deletePendingReservationAttempt(attemptId);
      }
    }

    if (state.pendingReservationAttempts.size <= 10) {
      return;
    }

    const attemptsByAge = Array.from(state.pendingReservationAttempts.entries()).sort(
      ([, leftAttempt], [, rightAttempt]) =>
        Number((leftAttempt as { at?: unknown })?.at || 0) -
        Number((rightAttempt as { at?: unknown })?.at || 0),
    );
    for (const [attemptId] of attemptsByAge) {
      if (state.pendingReservationAttempts.size <= 10) {
        break;
      }
      deletePendingReservationAttempt(attemptId);
    }
  }

  function deletePendingReservationAttempt(attemptId: unknown) {
    if (typeof attemptId !== "string" || attemptId === "") {
      return false;
    }
    const deleted = state.pendingReservationAttempts.delete(attemptId);
    if (deleted) {
      clearReservationAttemptDataset(attemptId);
    }
    return deleted;
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

  function readActionTargetText(actionTarget: Element | null) {
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

  function handleReservationNetworkMessage(event: Event) {
    return slackSuccessFlow.handleReservationNetworkMessage(event as MessageEvent<any>);
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

  function normalizeReservationMutationMethod(methodValue: unknown) {
    const method = toDisplayString(methodValue).toUpperCase();
    return method === "POST" || method === "PUT" || method === "PATCH" || method === "DELETE"
      ? method
      : "";
  }

  function createSlackMessageFingerprint(
    context: Record<string, unknown>,
    payload: Record<string, unknown>,
  ) {
    const requestUrl = parseUrlSafely(typeof payload?.url === "string" ? payload.url : "");
    return [
      toDisplayString(context.date),
      toDisplayString(context.startTime),
      toDisplayString(context.endTime),
      toDisplayString(context.roomName),
      toDisplayString(context.ownerName),
      toDisplayString(context.description),
      requestUrl ? requestUrl.pathname : "",
      location.pathname,
    ]
      .join("|")
      .toLowerCase();
  }

  function isMeaningfulSlackContextValue(value: unknown) {
    const normalized = normalizeSlackFieldText(typeof value === "string" ? value : "");
    return normalized !== "" && normalized !== "-";
  }

  function shouldSkipSlackCopyModal(fingerprint: string) {
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

  function buildSlackReservationContext(rootOverride: Document | HTMLElement | null = null) {
    const root =
      rootOverride instanceof HTMLElement || rootOverride === document
        ? rootOverride
        : getHostReservationRoot();
    const hostDateInput = queryHostDateInput(root, isInsideExtensionSurface);
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

  function readHostRoomName(root: Document | HTMLElement = document) {
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

    const appliedRoomId = state.appliedSelection?.roomId;
    if (Number.isInteger(appliedRoomId)) {
      const matchedRoom = getLatestKnownRooms().find((room) => room.id === appliedRoomId);
      if (matchedRoom && typeof matchedRoom.name === "string" && matchedRoom.name.trim()) {
        return matchedRoom.name.trim();
      }
    }

    return "";
  }

  function readHostReservationOwnerName(root: Document | HTMLElement = document) {
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

  function isPotentialReservationOwnerElement(control: Element | null) {
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

  function rememberReservationOwnerName(value: unknown) {
    const normalizedOwnerName = normalizeHostReservationOwnerCandidate(value);
    if (!normalizedOwnerName) {
      return "";
    }

    state.lastKnownReservationOwnerName = normalizedOwnerName;
    return normalizedOwnerName;
  }

  function readHostReservationOwnerFromNameInputs(root: Document | HTMLElement = document) {
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
      const normalizedValue = normalizeHostReservationOwnerCandidate(
        (candidate as HTMLInputElement).value || "",
      );
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

  /** input/textarea 의 값만 읽는다(확장 컨트롤을 포함하지 않을 때). */
  function readPlainControlValue(control: Element | null) {
    const isTextField =
      control instanceof HTMLInputElement || control instanceof HTMLTextAreaElement;
    return isTextField ? normalizeSlackFieldText(control.value || "") : "";
  }

  function readHostReservationFieldValue(
    root: Document | HTMLElement,
    keywords: string[],
    options: {
      allowInputTypes?: string[];
      includeReadOnly?: boolean;
      includeDisabled?: boolean;
      includeExtendedControls?: boolean;
      requireVisible?: boolean;
    } = {},
  ) {
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
        : readPlainControlValue(control);
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

  function buildSlackReservationMessage(context: Record<string, unknown>) {
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

  const { showSlackCopyModal, closeSlackCopyModal } = createSlackWorkflow({
    state,
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
    normalizeReservationMutationMethod,
    createSlackMessageFingerprint,
    shouldSkipSlackCopyModal,
    showSlackCopyModal,
    buildLmsSlackReservationContext,
    onReservationMutated: invalidateReservationCaches,
  });

  // 개편 서비스(lms+) 예약 생성 응답 body → Slack 모달 context.
  // 응답 예: {date,startTime,endTime,spaceName,floor,purpose,reserverName,mine,id,spaceId}
  function buildLmsSlackReservationContext(responseBody: Record<string, unknown> | null) {
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

  function rememberSlackChannelMention(channelMention: unknown) {
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

  function forgetSlackChannelMention(channelMention: unknown) {
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

  function readStoredChannelTokens(storageKey: string) {
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

  function writeStoredChannelTokens(storageKey: string, channelTokens: unknown) {
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

  /** 백그라운드(또는 직접 폴백)가 돌려주는 응답. */
  interface TransportResponse {
    ok?: boolean;
    error?: string;
    data?: unknown;
  }

  function sendMessage(message: {
    type?: string;
    payload?: Record<string, unknown>;
  }): Promise<TransportResponse> {
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

  function sendMessageViaRuntime(message: { type?: string; payload?: Record<string, unknown> }) {
    return new Promise<TransportResponse>((resolve, reject) => {
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
        // catch 는 unknown 을 준다. Promise 거부는 Error 로 통일한다.
        reject(error instanceof Error ? error : new Error(getErrorMessage(error)));
      }
    });
  }

  function createRuntimeMessageTimeoutError() {
    const error = new Error("runtime 메시지 응답이 지연되고 있습니다.");
    error.name = "ZzkRuntimeMessageTimeoutError";
    return error;
  }

  function isRuntimeMessageTimeoutError(error: unknown) {
    return Boolean(error instanceof Error && error.name === "ZzkRuntimeMessageTimeoutError");
  }

  function shouldUseDirectApiFallback(message: {
    type?: string;
    payload?: Record<string, unknown>;
  }) {
    if (!message || typeof message !== "object") {
      return false;
    }

    return typeof getDirectApiFallbackHandler(message.type) === "function";
  }

  function getDirectApiFallbackHandler(messageType: unknown) {
    if (messageType === "ZZK_FETCH_AVAILABILITY") {
      return fetchLmsAvailability;
    }

    if (messageType === "ZZK_FETCH_DAILY_SCHEDULE") {
      return fetchLmsDailySchedule;
    }

    return null;
  }

  async function sendMessageDirectFallback(message: {
    type?: string;
    payload?: Record<string, unknown>;
  }) {
    pushDebugEvent("transport", "direct-fallback-start", {
      type: message?.type,
    });
    try {
      const handler = getDirectApiFallbackHandler(message && message.type);
      if (typeof handler === "function") {
        const data = await handler(message.payload ?? {});
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

  function normalizeDateInput(inputElement: Element | null | undefined) {
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

  function getMinimumSelectableDateForCurrentContext(_value?: unknown) {
    return getTodayDateInKST();
  }

  // lms+ 에는 과거 날짜를 허용하는 수정 페이지가 없다.

  function setDateInputMinimum(inputElement: Element | null, minimumDate: unknown) {
    if (!(inputElement instanceof HTMLInputElement)) {
      return;
    }
    if (isDateString(minimumDate)) {
      inputElement.min = minimumDate;
      return;
    }
    inputElement.removeAttribute("min");
  }

  function normalizeTimeInput(inputElement: Element | null) {
    if (!(inputElement instanceof HTMLInputElement)) {
      return "";
    }

    const normalized = normalizeToTenMinute(inputElement.value);
    if (normalized && inputElement.value !== normalized) {
      inputElement.value = normalized;
    }

    return inputElement.value;
  }

  function validateTenMinuteField(inputElement: Element | null) {
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

  // 테스트 훅: 테스트 호스트(example.com), 테스트가 미리 심어둔 플래그, 또는 DEBUG 모드에서만
  // 노출한다. lms+ 실제 호스트에서는 플래그가 없으므로 그대로 감춰진다.
  if (
    location.hostname === "example.com" ||
    (globalThis as { __ZZK_TEST_HOOKS__?: boolean }).__ZZK_TEST_HOOKS__ === true ||
    DEBUG_MODE
  ) {
    (globalThis as { __zzkTestApi?: unknown }).__zzkTestApi = {
      clampMapCalendarWidth,
      getMapCalendarWidthBounds,
      computeMapCalendarCurrentTimeScrollLeft,
      // 호스트 폼 스캔. 실제 lms+ 마크업 없이 점수 규칙만 검증할 때 쓴다.
      queryHostDateInput: (root: Document | HTMLElement = document) =>
        queryHostDateInput(root, isInsideExtensionSurface),
      queryHostTimeInput: (nameKeywords: string[], root: Document | HTMLElement = document) =>
        queryHostTimeInput(nameKeywords, { root, isInsideExtensionSurface }),
      // 호스트 예약 폼에서 값을 읽어오는 함수들. 실제 lms+ 마크업 없이
      // 우리가 만든 폼으로 규칙만 검증한다.
      readHostReservationTimeValues: (root: Document | HTMLElement = document) =>
        readHostReservationTimeValues(root),
      readHostRoomName: (root: Document | HTMLElement = document) => readHostRoomName(root),
      readHostReservationOwnerName: (root: Document | HTMLElement = document) =>
        readHostReservationOwnerName(root),
      getHostReservationRoot: () => getHostReservationRoot(),
      findHostRoomDropdownButton: (root: Document | HTMLElement = document) =>
        findHostRoomDropdownButton(root),
      findHostTimePickerButton: (buttonLabel: string, root: Document | HTMLElement = document) =>
        findHostTimePickerButton(buttonLabel, root),
      isMeaningfulSlackContextValue,
      isRuntimeMessageTimeoutError,
      createRuntimeMessageTimeoutError,
      shouldUseDirectApiFallback,
      createSlackMessageFingerprint,
      createReservationAttemptId,
      getLatestKnownRooms,
      // lms+ 예약 폼 반영 로직을 슬롯 클릭 없이 직접 검증할 때 쓴다.
      syncLmsReservationForm(payload: Record<string, unknown>) {
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
        const hostDateInput = queryHostDateInput(document, isInsideExtensionSurface);
        if (
          state.elements?.dateInput instanceof HTMLInputElement &&
          hostDateInput instanceof HTMLInputElement &&
          hostDateInput.value
        ) {
          state.elements.dateInput.value = hostDateInput.value;
        }
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
        const hostDateInput = queryHostDateInput(document, isInsideExtensionSurface);
        if (
          state.elements?.dateInput instanceof HTMLInputElement &&
          hostDateInput instanceof HTMLInputElement &&
          hostDateInput.value
        ) {
          state.elements.dateInput.value = hostDateInput.value;
        }
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
      async renderScheduleForDate(date: string) {
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
          pendingReservationAttemptCount: state.pendingReservationAttempts.size,
          pendingReservationAttemptIds: Array.from(state.pendingReservationAttempts.keys()),
          lastKnownReservationOwnerName: state.lastKnownReservationOwnerName,
          pendingSlackModalContext: state.pendingSlackModalContext,
          pendingSlackModalRequiresNonEditPage: state.pendingSlackModalRequiresNonEditPage,
          pendingSlackModalReloadAttempted: state.pendingSlackModalReloadAttempted,
          slackModalVisible: state.slackModalVisible,
          lastSlackModalFingerprint: state.lastSlackModalFingerprint,
          lastSlackModalShownAt: state.lastSlackModalShownAt,
          debugMode: DEBUG_MODE,
        };
      },
      // availability 캐시(TTL) 동작 검증용.
      // 테스트는 완료를 기다려야 하므로 await 한다.
      async refreshAvailability() {
        await refreshAvailability();
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

  function persistMapCalendarSpaceTab(tab: unknown) {
    const normalizedTab = normalizeMapCalendarSpaceTab(tab);
    writeStoredText(MAP_CALENDAR_SPACE_TAB_STORAGE_KEY, normalizedTab);
  }

  boot();
})();
