(() => {
  if (window.__zzkAvailabilityLensLoaded) {
    return;
  }

  const requiredBootstrapGlobals = [
    "__zzkSharedUtils",
    "__zzkStorageUtils",
    "__zzkDateTimeUtils",
    "__zzkRouteUtils",
    "__zzkSlackShared",
    "__zzkRadarShared",
    "__zzkHostSyncShared",
    "__zzkSharedConstants",
    "__zzkRadarWorkflow",
    "__zzkRadarFormSync",
    "__zzkSlackWorkflow",
    "__zzkSlackSuccessFlow",
    "__zzkGuestDataShared",
  ];
  const missingBootstrapGlobals = requiredBootstrapGlobals.filter((globalName) => {
    return !globalThis[globalName] || typeof globalThis[globalName] !== "object";
  });
  if (missingBootstrapGlobals.length > 0) {
    window.__zzkAvailabilityLensLoadError = {
      reason: "missing-bootstrap-dependencies",
      missing: missingBootstrapGlobals,
    };
    return;
  }

  window.__zzkAvailabilityLensLoaded = true;

  const {
    normalizeTextForMatch,
    getErrorMessage,
    pushDebugEvent,
    debugLog,
    getDebugEvents,
    clearDebugEvents,
  } = globalThis.__zzkSharedUtils;
  const {
    readStoredBoolean,
    writeStoredBoolean,
    readStoredText,
    writeStoredText,
    readStoredNumber,
    writeStoredNumber,
  } = globalThis.__zzkStorageUtils;
  const {
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
    formatUTCDateString,
    parseDateStringAsUTC,
    addMonthsToDateString,
    getMonthStartDateString,
    formatMonthTitle,
    formatKSTWeekday,
    formatDateSelectorText,
  } = globalThis.__zzkDateTimeUtils;
  const {
    isGuestReservationEditPage,
    isGuestSuccessPage,
    isGuestPage,
    getSharingMapId,
  } = globalThis.__zzkRouteUtils;
  const {
    normalizeSlackFieldText,
    normalizeSlackChannelToken,
    normalizeSlackReminderLeadMinutes,
    formatSlackReminderLeadOptionLabel,
    computeSlackReminderDateTime,
  } = globalThis.__zzkSlackShared;
  const findGuestReservationTabContainer = () =>
    globalThis.__zzkRadarShared.findGuestReservationTabContainer({
      isInsideExtensionSurface,
      isElementVisible,
    });
  const findGuestReservationTabStyleSource = () =>
    globalThis.__zzkRadarShared.findGuestReservationTabStyleSource({
      isInsideExtensionSurface,
      isElementVisible,
    });
  const {
    getInputAssociatedLabelText,
    buildHostInputDescriptor,
    normalizeHostReservationOwnerCandidate,
    normalizeHostRoomCandidate,
    extractKnownRoomName,
    getControlAssociatedLabelText,
    buildHostFieldDescriptor,
    readHostFieldDisplayValue,
  } = globalThis.__zzkHostSyncShared;

  const {
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
    MAP_CALENDAR_WIDTH_STORAGE_KEY,
    MAP_CALENDAR_MIN_WIDTH,
    MAP_CALENDAR_VIEWPORT_MARGIN,
    MAP_CALENDAR_CURRENT_TIME_SCROLL_LEAD_MINUTES,
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
    EXCLUDED_CREW_ROOM_SET,
    TARGET_ROOM_NAMES,
    TARGET_ROOM_SET,
    TARGET_ROOM_ORDER,
    normalizeRoomTagKey,
    normalizeTargetRoomName,
    normalizeMapCalendarSpaceTab,
    normalizeFetchRoomType,
  } = globalThis.__zzkSharedConstants;

  const state = {
    mounted: false,
    loading: false,
    availabilityInflightToken: null,
    pendingAvailabilityRefresh: false,
    highlightedRects: new Set(),
    latestRooms: [],
    latestRoomsBySpaceTab: new Map(),
    highlightEnabled: true,
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
    mapCalendarVisible: readStoredBoolean(
      MAP_CALENDAR_ALWAYS_OPEN_STORAGE_KEY,
      true,
    ),
    mapCalendarAlwaysOpen: readStoredBoolean(
      MAP_CALENDAR_ALWAYS_OPEN_STORAGE_KEY,
      true,
    ),
    mapCalendarSpaceTab: normalizeMapCalendarSpaceTab(
      readStoredText(
        MAP_CALENDAR_SPACE_TAB_STORAGE_KEY,
        MAP_CALENDAR_SPACE_TAB_MEETING,
      ),
    ),
    mapCalendarCollapsed: false,
    mapCalendarWidth: readStoredNumber(MAP_CALENDAR_WIDTH_STORAGE_KEY, null),
    mapCalendarCurrentTimeScrollDate: null,
    mapCalendarOffset: { x: 0, y: 0 },
    slotSelection: null,
    slotHover: null,
    appliedSelection: null,
    timelineSelectionRequestId: 0,
    timelineSelectionApplyTimer: null,
    currentSharingMapId: null,
    inputRefreshTimer: null,
    autoRefreshTimer: null,
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
    reservationHookInstalled: false,
    reservationHookInstalling: false,
    reservationHookInstallGeneration: 0,
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
    slackChannelMention: readStoredText(
      SLACK_CHANNEL_MENTION_STORAGE_KEY,
      "",
    ),
    slackChannelHistory: readStoredChannelTokens(
      SLACK_CHANNEL_HISTORY_STORAGE_KEY,
    ),
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
    if (isGuestPage() && tryRecoverBlankGuestPage()) {
      return;
    }

    hookHistoryChanges();
    window.addEventListener("popstate", handleLocationChange);
    window.addEventListener("pageshow", handleLocationChange);
    document.addEventListener("change", handleHostDateChange, true);
    installReservationIntentWatcher();
    installReservationNetworkMessageListener();
    installReservationOwnerWatcher();
    installHostTimePickerInteractionWatcher();

    if (isGuestPage()) {
      if (shouldInstallPageReservationNetworkHook()) {
        installPageReservationNetworkHook();
      }
      if (!isGuestUiReadyForActivation()) {
        removeMapCalendarLauncher();
        removeMapCalendarOverlay();
        state.mapCalendarVisible = false;
        state.lastAutoOpenPath = null;
      } else {
        queueSlackModalFromPersistedEditSubmitIfNeeded('boot-ready');
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
      document.documentElement instanceof HTMLElement
        ? document.documentElement
        : document.body;
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
    if (!isGuestPage()) {
      restorePageReservationNetworkHook();
      teardownGuestUi({
        preserveReservationContext: isGuestReservationFlowPage(),
      });
      return;
    }
    if (tryRecoverBlankGuestPage()) {
      return;
    }
    if (shouldInstallPageReservationNetworkHook()) {
      installPageReservationNetworkHook();
    }
    queueSlackModalFromPersistedEditSubmitIfNeeded('mutation-observer');
    clearBlankGuestRecoveryIfPageReady();
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
    if (state.latestRooms.length > 0 && state.highlightEnabled) {
      scheduleHighlightRefresh();
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
        if (!isGuestPage() || state.topNavForwarding) {
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

        if (
          event.target instanceof Node &&
          expectedTarget.contains(event.target)
        ) {
          return;
        }

        const actualTopElement = document.elementFromPoint(x, y);
        if (
          !(actualTopElement instanceof Element) ||
          expectedTarget.contains(actualTopElement)
        ) {
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
        button instanceof HTMLButtonElement &&
        (button.textContent || "").includes("로그아웃"),
    );

    return [myPageLink, logoutButton].filter(
      (node) => node instanceof HTMLElement,
    );
  }

  function pointInRect(x, y, rect) {
    return (
      x >= rect.left && x <= rect.right && y >= rect.top && y <= rect.bottom
    );
  }

  async function refreshAvailability() {
    if (!isGuestPage()) {
      return;
    }

    if (state.loading) {
      state.pendingAvailabilityRefresh = true;
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
        state.scheduleInflightByDate.clear();
        state.activeScheduleDate = null;
        state.activeScheduleTab = null;
        state.scheduleLoadingDate = null;
        state.scheduleLoadingTab = null;
        removeMapCalendarOverlay();
      }
      resetTimelineSelectionState();
      clearMapHighlights();
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

    state.loading = true;
    state.pendingAvailabilityRefresh = false;
    setStatus(
      `${getMapCalendarSpaceTabLabel()} 현황을 불러오는 중입니다...`,
      "loading",
    );
    state.elements.refreshButton.disabled = true;

    try {
      state.availabilityInflightToken = availabilityToken;
      const response = await sendMessage({
        type: "ZZK_FETCH_AVAILABILITY",
        payload: {
          sharingMapId,
          date,
          startTime,
          endTime,
          roomType,
        },
      });

      if (!response?.ok) {
        throw new Error(response?.error || "데이터를 불러오지 못했습니다.");
      }

      const data = response.data;
      const rooms = Array.isArray(data?.rooms) ? data.rooms : [];
      if (state.availabilityInflightToken !== availabilityToken) {
        return;
      }
      if (state.currentSharingMapId !== sharingMapId) {
        return;
      }
      if (normalizeMapCalendarSpaceTab(state.mapCalendarSpaceTab) !== roomType) {
        return;
      }
      state.latestRooms = rooms;
      state.latestRoomsBySpaceTab.set(roomType, rooms);
      state.latestMapName =
        typeof data?.mapName === "string" ? data.mapName : state.latestMapName;

      const visibleRooms = rooms;
      renderCounts(visibleRooms);
      renderRoomLists(visibleRooms);
      renderUpdatedAt();

      if (state.highlightEnabled) {
        applyMapHighlights(rooms);
      }

      if (state.scheduleOverlayEnabled) {
        try {
          await refreshDailySchedule(date);
        } catch {
          removeMapCalendarOverlay();
        }
      }

      setStatus(
        `${data?.mapName || "공간 지도"} · ${date} ${startTime}~${endTime} 기준`,
        "success",
      );
    } catch (error) {
      clearMapHighlights();
      setStatus(getErrorMessage(error), "error");
    } finally {
      if (state.availabilityInflightToken === availabilityToken) {
        state.availabilityInflightToken = null;
      }
      state.loading = false;
      if (state.elements) {
        state.elements.refreshButton.disabled = false;
      }
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
    state.elements.occupiedCount.textContent = String(
      Math.max(0, rooms.length - availableCount),
    );
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
      [
        document.getElementById(MAP_CALENDAR_OVERLAY_TAB_PAIR_ID),
        MAP_CALENDAR_SPACE_TAB_PAIR,
      ],
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

    const activeDate =
      normalizeDateInput(state.elements?.dateInput) || state.activeScheduleDate;
    const isModalOpen = isMapCalendarModalOpenRequested();
    const cachedSchedule = activeDate
      ? getFreshScheduleCache(activeDate, activeTab)
      : null;
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
      empty.textContent =
        type === "available" ? "비어 있는 공간 없음" : "사용 중인 공간 없음";
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
    const normalizedDate = normalizeDateString(
      typeof date === "string" ? date : "",
    );
    if (!isDateString(normalizedDate)) {
      return "";
    }

    const normalizedSharingMapId =
      typeof sharingMapId === "string" ? sharingMapId.trim() : "";
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
    const normalizedDate = normalizeDateString(
      typeof date === "string" ? date : "",
    );
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
    const normalizedDate = normalizeDateString(
      typeof date === "string" ? date : "",
    );
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
    const normalizedDate = normalizeDateString(
      typeof date === "string" ? date : "",
    );
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
      (state.scheduleLoadingDate !== normalizedDate ||
        state.scheduleLoadingTab !== normalizedTab)
    ) {
      return;
    }

    state.scheduleLoadingDate = null;
    state.scheduleLoadingTab = null;
    syncMapCalendarBodyLoadingState();
  }

  async function refreshDailySchedule(date) {
    if (!isGuestPage() || !state.scheduleOverlayEnabled || !date) {
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

    const scopeKey = buildScheduleScopeKey(
      normalizedDate,
      activeTab,
      sharingMapId,
    );
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
        throw new Error(
          response?.error || "시간대별 예약 현황을 불러오지 못했습니다.",
        );
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
    } finally {
      if (state.scheduleInflightByDate.get(scopeKey) === inflight) {
        state.scheduleInflightByDate.delete(scopeKey);
      }
      setScheduleLoadingDate(normalizedDate, false, activeTab);
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

    const previousBody = overlay.querySelector(".zzk-map-calendar-body");
    const preservedBodyScroll = {
      left:
        previousBody instanceof HTMLElement
          ? previousBody.scrollLeft
          : 0,
      top:
        previousBody instanceof HTMLElement
          ? previousBody.scrollTop
          : 0,
    };

    applyMapCalendarOverlayOffset(overlay);
    updateMapCalendarLauncherState();

    document
      .querySelectorAll(".zzk-map-calendar-date-popover-floating")
      .forEach((element) => element.remove());
    overlay.textContent = "";

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
          TARGET_ROOM_ORDER.get(normalizeTargetRoomName(roomA?.name)) ??
          Number.MAX_SAFE_INTEGER;
        const orderB =
          TARGET_ROOM_ORDER.get(normalizeTargetRoomName(roomB?.name)) ??
          Number.MAX_SAFE_INTEGER;
        return orderA - orderB;
      });
    const selectionDate = scheduleData.date || "";
    const previousRenderedScheduleDate = state.lastRenderedScheduleDate;
    state.lastRenderedScheduleDate = isDateString(selectionDate)
      ? selectionDate
      : null;
    state.mapCalendarTimelineSnapshot = Array.isArray(timeline) ? timeline : [];
    if (state.lastRenderedScheduleDate !== previousRenderedScheduleDate) {
      // 날짜가 바뀌면 현재 시각 스크롤을 다시 한 번 맞춰준다.
      state.mapCalendarCurrentTimeScrollDate = null;
    }
    state.lastRenderedScheduleTab = renderedTab;
    const earliestSelectableMinute = shouldAllowPastReservationDate(selectionDate)
      ? 0
      : getEarliestSelectableMinuteForDate(selectionDate);

    if (state.slotSelection && state.slotSelection.date !== selectionDate) {
      state.slotSelection = null;
    }
    if (state.slotHover && state.slotHover.date !== selectionDate) {
      state.slotHover = null;
    }
    if (
      state.appliedSelection &&
      state.appliedSelection.date !== selectionDate
    ) {
      state.appliedSelection = null;
    }
    if (
      state.appliedSelection &&
      !rooms.some((room) => room.id === state.appliedSelection?.roomId)
    ) {
      state.appliedSelection = null;
    }

    const editLockedRoomConstraint = buildEditLockedRoomConstraint(rooms);
    enforceEditLockedRoomSelectionState(
      editLockedRoomConstraint,
      selectionDate,
    );
    const editReservationWindowConstraint =
      buildEditReservationWindowConstraint(
        selectionDate,
        editLockedRoomConstraint,
      );

    const shell = document.createElement("div");
    shell.className = "zzk-map-calendar-shell";
    overlay.appendChild(shell);

    const spaceTabs = document.createElement("div");
    spaceTabs.className = "zzk-map-calendar-space-tabs";
    spaceTabs.setAttribute("role", "tablist");
    spaceTabs.setAttribute("aria-label", "공간 유형 선택");

    const meetingTabButton = document.createElement("button");
    meetingTabButton.type = "button";
    meetingTabButton.id = MAP_CALENDAR_OVERLAY_TAB_MEETING_ID;
    meetingTabButton.className = "zzk-map-calendar-space-tab";
    meetingTabButton.textContent = "회의실";
    meetingTabButton.setAttribute("role", "tab");

    const pairTabButton = document.createElement("button");
    pairTabButton.type = "button";
    pairTabButton.id = MAP_CALENDAR_OVERLAY_TAB_PAIR_ID;
    pairTabButton.className = "zzk-map-calendar-space-tab";
    pairTabButton.textContent = "페어룸";
    pairTabButton.setAttribute("role", "tab");

    meetingTabButton.addEventListener("click", () => {
      setMapCalendarSpaceTab(MAP_CALENDAR_SPACE_TAB_MEETING);
    });
    pairTabButton.addEventListener("click", () => {
      setMapCalendarSpaceTab(MAP_CALENDAR_SPACE_TAB_PAIR);
    });
    spaceTabs.append(meetingTabButton, pairTabButton);
    shell.appendChild(spaceTabs);
    syncOpenMapCalendarSpaceTabButtons();

    const card = document.createElement("div");
    card.className = "zzk-map-calendar-card";
    const stopOverlayEventPropagation = (event) => {
      event.stopPropagation();
    };
    [
      "pointerdown",
      "mousedown",
      "mouseup",
      "click",
      "dblclick",
      "touchstart",
      "touchend",
    ].forEach((eventName) => {
      card.addEventListener(eventName, stopOverlayEventPropagation);
    });
    card.addEventListener("wheel", stopOverlayEventPropagation, {
      passive: true,
    });
    shell.appendChild(card);

    const resizeHandle = document.createElement("div");
    resizeHandle.className = "zzk-map-calendar-resize-handle";
    resizeHandle.setAttribute("role", "separator");
    resizeHandle.setAttribute("aria-orientation", "vertical");
    resizeHandle.setAttribute("aria-label", "레이더 너비 조절");
    card.appendChild(resizeHandle);
    bindMapCalendarResizeHandle(resizeHandle, card);

    const header = document.createElement("div");
    header.className = "zzk-map-calendar-header";
    card.appendChild(header);

    bindDraggableHeader({
      header,
      element: overlay,
      getOffset: () => state.mapCalendarOffset,
      setOffset: (nextOffset) => {
        state.mapCalendarOffset = nextOffset;
      },
      applyOffset: () => {
        applyMapCalendarOverlayOffset(overlay);
      },
    });

    const titleControls = document.createElement("div");
    titleControls.className = "zzk-map-calendar-title-controls";
    header.appendChild(titleControls);

    if (state.elements) {
      const controlRow = document.createElement("div");
      controlRow.className = "zzk-map-calendar-controls";

      const dateControlRow = document.createElement("div");
      dateControlRow.className = "zzk-map-calendar-date-row";

      const dateWeekdayLabel = document.createElement("span");
      dateWeekdayLabel.className = "zzk-map-calendar-date-display";
      dateWeekdayLabel.setAttribute("aria-live", "polite");

      const dateDisplayWrap = document.createElement("span");
      dateDisplayWrap.className = "zzk-map-calendar-date-display-wrap";
      dateDisplayWrap.tabIndex = 0;
      dateDisplayWrap.setAttribute("role", "button");
      dateDisplayWrap.setAttribute("aria-label", "지도 날짜 선택 열기");

      const datePopover = document.createElement("div");
      datePopover.className =
        "zzk-map-calendar-date-popover zzk-map-calendar-date-popover-floating";
      datePopover.hidden = true;

      const datePopoverHeader = document.createElement("div");
      datePopoverHeader.className = "zzk-map-calendar-date-popover-header";

      const datePopoverPrevButton = document.createElement("button");
      datePopoverPrevButton.type = "button";
      datePopoverPrevButton.className =
        "zzk-map-calendar-date-popover-nav prev";
      datePopoverPrevButton.innerHTML = CHEVRON_LEFT_ICON_SVG;
      datePopoverPrevButton.setAttribute("aria-label", "이전달");

      const datePopoverTitle = document.createElement("strong");
      datePopoverTitle.className = "zzk-map-calendar-date-popover-title";

      const datePopoverNextButton = document.createElement("button");
      datePopoverNextButton.type = "button";
      datePopoverNextButton.className =
        "zzk-map-calendar-date-popover-nav next";
      datePopoverNextButton.innerHTML = CHEVRON_RIGHT_ICON_SVG;
      datePopoverNextButton.setAttribute("aria-label", "다음달");

      datePopoverHeader.append(
        datePopoverPrevButton,
        datePopoverTitle,
        datePopoverNextButton,
      );

      const datePopoverWeekdays = document.createElement("div");
      datePopoverWeekdays.className = "zzk-map-calendar-date-popover-weekdays";
      ["일", "월", "화", "수", "목", "금", "토"].forEach((weekday) => {
        const weekdayLabel = document.createElement("span");
        weekdayLabel.textContent = weekday;
        datePopoverWeekdays.appendChild(weekdayLabel);
      });

      const datePopoverGrid = document.createElement("div");
      datePopoverGrid.className = "zzk-map-calendar-date-popover-grid";
      datePopover.append(
        datePopoverHeader,
        datePopoverWeekdays,
        datePopoverGrid,
      );
      [
        "pointerdown",
        "click",
        "mousedown",
        "mouseup",
        "touchstart",
        "touchend",
      ].forEach((eventName) => {
        datePopover.addEventListener(eventName, (event) => {
          event.stopPropagation();
        });
      });

      const prevDateButton = document.createElement("button");
      prevDateButton.type = "button";
      prevDateButton.className = "zzk-map-calendar-date-nav prev";
      prevDateButton.innerHTML = CHEVRON_LEFT_ICON_SVG;
      prevDateButton.setAttribute("aria-label", "이전날");

      const dateInput = document.createElement("input");
      dateInput.type = "date";
      dateInput.className =
        "zzk-map-calendar-control zzk-date zzk-map-calendar-date-native";

      const nextDateButton = document.createElement("button");
      nextDateButton.type = "button";
      nextDateButton.className = "zzk-map-calendar-date-nav next";
      nextDateButton.innerHTML = CHEVRON_RIGHT_ICON_SVG;
      nextDateButton.setAttribute("aria-label", "다음날");

      const todayDateButton = document.createElement("button");
      todayDateButton.type = "button";
      todayDateButton.className = "zzk-map-calendar-date-nav today";
      todayDateButton.textContent = "오늘";
      todayDateButton.setAttribute("aria-label", "오늘");

      const syncMapCalendarDateNavState = () => {
        const todayDate = getTodayDateInKST();
        const minimumDate = getMinimumSelectableDateForCurrentContext(dateInput.value);
        setDateInputMinimum(dateInput, minimumDate);
        const normalizedDate = clampDateToMin(dateInput.value, minimumDate);
        dateInput.value = normalizedDate;
        state.elements.dateInput.value = normalizedDate;
        syncPanelDateNavigationState();
        prevDateButton.disabled = Boolean(minimumDate) && normalizedDate <= minimumDate;
        todayDateButton.disabled = normalizedDate === todayDate;

        const prevDate = addDaysToDateString(normalizedDate, -1);
        const nextDate = addDaysToDateString(normalizedDate, 1);
        const prevLabel = isDateString(prevDate)
          ? `이전일 (${prevDate})`
          : "이전일";
        const nextLabel = isDateString(nextDate)
          ? `다음일 (${nextDate})`
          : "다음일";
        const todayLabel = `오늘 (${todayDate})`;
        const dateDisplayText = formatDateSelectorText(normalizedDate);
        renderDateDisplayLabel(dateWeekdayLabel, normalizedDate);
        setAttrOrRemove(dateWeekdayLabel, "title", dateDisplayText || "");

        prevDateButton.title = prevLabel;
        prevDateButton.setAttribute("aria-label", prevLabel);
        nextDateButton.title = nextLabel;
        nextDateButton.setAttribute("aria-label", nextLabel);
        todayDateButton.title = todayLabel;
        todayDateButton.setAttribute("aria-label", todayLabel);
      };

      const todayDate = getTodayDateInKST();
      const minimumDate = getMinimumSelectableDateForCurrentContext(
        state.elements.dateInput.value || scheduleData.date || "",
      );
      setDateInputMinimum(dateInput, minimumDate);
      const initialDate = clampDateToMin(
        state.elements.dateInput.value || scheduleData.date || "",
        minimumDate,
      );
      dateInput.value = initialDate;
      state.elements.dateInput.value = initialDate;
      syncPanelDateNavigationState();
      dateInput.setAttribute("aria-label", "지도 날짜 선택");
      const shouldUseCustomDatePopover = true;
      let datePopoverMonth =
        state.mapCalendarDatePopoverMonth ||
        getMonthStartDateString(initialDate || todayDate);
      let lastDatePopoverPosition = { left: null, top: null };

      const syncMapCalendarDatePopoverPosition = () => {
        if (datePopover.hidden) {
          datePopover.style.removeProperty("left");
          datePopover.style.removeProperty("top");
          return;
        }

        const displayRect = dateDisplayWrap.getBoundingClientRect();
        const popoverRect = datePopover.getBoundingClientRect();
        const viewportWidth =
          window.innerWidth || document.documentElement.clientWidth || 0;
        const viewportHeight =
          window.innerHeight || document.documentElement.clientHeight || 0;
        const popoverWidth = Math.ceil(
          popoverRect.width || datePopover.offsetWidth || 236,
        );
        const popoverHeight = Math.ceil(
          popoverRect.height || datePopover.offsetHeight || 0,
        );
        const horizontalPadding = 12;
        const verticalGap = 8;

        if (
          !Number.isFinite(displayRect.left) ||
          !Number.isFinite(displayRect.bottom) ||
          !Number.isFinite(popoverWidth) ||
          !Number.isFinite(popoverHeight) ||
          popoverWidth <= 0 ||
          popoverHeight <= 0
        ) {
          if (
            Number.isFinite(lastDatePopoverPosition.left) &&
            Number.isFinite(lastDatePopoverPosition.top)
          ) {
            datePopover.style.left = `${Math.round(lastDatePopoverPosition.left)}px`;
            datePopover.style.top = `${Math.round(lastDatePopoverPosition.top)}px`;
          }
          return;
        }

        let left = displayRect.left;
        left = Math.min(left, viewportWidth - popoverWidth - horizontalPadding);
        left = Math.max(horizontalPadding, left);

        const top = Math.max(
          horizontalPadding,
          displayRect.bottom + verticalGap,
        );

        const nextLeft = Math.round(left);
        const nextTop = Math.round(top);
        datePopover.style.left = `${nextLeft}px`;
        datePopover.style.top = `${nextTop}px`;
        lastDatePopoverPosition = { left: nextLeft, top: nextTop };
      };
      state.syncMapCalendarDatePopoverPosition =
        syncMapCalendarDatePopoverPosition;

      const handleViewportPopoverReposition = () => {
        if (datePopover.hidden) {
          return;
        }
        window.requestAnimationFrame(() => {
          syncMapCalendarDatePopoverPosition();
        });
      };

      const closeMapCalendarDatePopover = () => {
        datePopover.hidden = true;
        dateDisplayWrap.classList.remove("is-open");
        state.mapCalendarDatePopoverOpen = false;
        state.mapCalendarDatePopoverMonth = datePopoverMonth;
        syncMapCalendarDatePopoverPosition();
        window.removeEventListener("resize", handleViewportPopoverReposition);
        window.removeEventListener(
          "scroll",
          handleViewportPopoverReposition,
          true,
        );
      };

      const openMapCalendarDatePopover = () => {
        renderMapCalendarDatePopover();
        datePopover.hidden = false;
        dateDisplayWrap.classList.add("is-open");
        state.mapCalendarDatePopoverOpen = true;
        state.mapCalendarDatePopoverMonth = datePopoverMonth;
        window.addEventListener("resize", handleViewportPopoverReposition);
        window.addEventListener(
          "scroll",
          handleViewportPopoverReposition,
          true,
        );
        window.requestAnimationFrame(() => {
          syncMapCalendarDatePopoverPosition();
        });
      };

      const toggleMapCalendarDatePopover = () => {
        if (datePopover.hidden) {
          openMapCalendarDatePopover();
          return;
        }
        closeMapCalendarDatePopover();
      };

      const selectMapCalendarPopoverDate = (nextDate) => {
        const normalizedDate = clampDateToMin(
          normalizeDateString(nextDate),
          getTodayDateInKST(),
        );
        if (!normalizedDate) {
          return;
        }
        dateInput.value = normalizedDate;
        applyPanelDateChange(normalizedDate);
        dateInput.value = state.elements.dateInput.value;
        datePopoverMonth = getMonthStartDateString(normalizedDate);
        state.mapCalendarDatePopoverMonth = datePopoverMonth;
        syncMapCalendarDateNavState();
        closeMapCalendarDatePopover();
      };

      function renderMapCalendarDatePopover() {
        const todayDateValue = getTodayDateInKST();
        const selectedDate =
          normalizeDateString(
            state.elements?.dateInput.value ||
              dateInput.value ||
              todayDateValue,
          ) || todayDateValue;
        const monthStart = parseDateStringAsUTC(
          datePopoverMonth || selectedDate,
        );
        if (!(monthStart instanceof Date)) {
          datePopoverGrid.replaceChildren();
          datePopoverTitle.textContent = "";
          return;
        }

        datePopoverTitle.textContent = formatMonthTitle(monthStart);
        datePopoverGrid.replaceChildren();

        const startWeekday = monthStart.getUTCDay();
        const gridStart = new Date(monthStart.getTime());
        gridStart.setUTCDate(gridStart.getUTCDate() - startWeekday);
        const monthEnd = new Date(monthStart.getTime());
        monthEnd.setUTCMonth(monthEnd.getUTCMonth() + 1, 0);
        const endWeekday = monthEnd.getUTCDay();
        const gridEnd = new Date(monthEnd.getTime());
        gridEnd.setUTCDate(gridEnd.getUTCDate() + (6 - endWeekday));
        const totalDayCount =
          Math.round((gridEnd.getTime() - gridStart.getTime()) / 86400000) + 1;

        for (let index = 0; index < totalDayCount; index += 1) {
          const cellDate = new Date(gridStart.getTime());
          cellDate.setUTCDate(gridStart.getUTCDate() + index);
          const cellDateString = formatUTCDateString(cellDate);
          const dayButton = document.createElement("button");
          dayButton.type = "button";
          dayButton.className = "zzk-map-calendar-date-popover-day";
          dayButton.textContent = String(cellDate.getUTCDate());

          if (cellDate.getUTCMonth() !== monthStart.getUTCMonth()) {
            dayButton.classList.add("is-outside-month");
          }
          if (cellDateString === todayDateValue) {
            dayButton.classList.add("is-today");
          }
          if (cellDateString === selectedDate) {
            dayButton.classList.add("is-selected");
          }
          if (cellDateString < todayDateValue) {
            dayButton.disabled = true;
          }

          dayButton.addEventListener("click", () => {
            selectMapCalendarPopoverDate(cellDateString);
          });
          datePopoverGrid.appendChild(dayButton);
        }

        if (!datePopover.hidden) {
          window.requestAnimationFrame(() => {
            syncMapCalendarDatePopoverPosition();
          });
        }
      }

      datePopoverPrevButton.addEventListener("click", () => {
        datePopoverMonth = addMonthsToDateString(datePopoverMonth, -1);
        state.mapCalendarDatePopoverMonth = datePopoverMonth;
        renderMapCalendarDatePopover();
        window.requestAnimationFrame(() => {
          window.requestAnimationFrame(() => {
            syncMapCalendarDatePopoverPosition();
          });
        });
      });
      datePopoverNextButton.addEventListener("click", () => {
        datePopoverMonth = addMonthsToDateString(datePopoverMonth, 1);
        state.mapCalendarDatePopoverMonth = datePopoverMonth;
        renderMapCalendarDatePopover();
        window.requestAnimationFrame(() => {
          window.requestAnimationFrame(() => {
            syncMapCalendarDatePopoverPosition();
          });
        });
      });

      dateDisplayWrap.addEventListener("pointerdown", (event) => {
        if (shouldUseCustomDatePopover) {
          event.preventDefault();
          event.stopPropagation();
          toggleMapCalendarDatePopover();
          return;
        }
        event.stopPropagation();
      });
      dateDisplayWrap.addEventListener("click", (event) => {
        if (shouldUseCustomDatePopover) {
          event.preventDefault();
          event.stopPropagation();
          return;
        }
      });
      dateDisplayWrap.addEventListener("keydown", (event) => {
        if (!shouldUseCustomDatePopover) {
          return;
        }
        if (event.key !== "Enter" && event.key !== " ") {
          return;
        }
        event.preventDefault();
        event.stopPropagation();
        toggleMapCalendarDatePopover();
      });
      dateInput.addEventListener("pointerdown", (event) => {
        event.stopPropagation();
        if (shouldUseCustomDatePopover) {
          event.preventDefault();
          return;
        }
      });
      dateInput.addEventListener("click", (event) => {
        event.stopPropagation();
        if (shouldUseCustomDatePopover) {
          event.preventDefault();
          return;
        }
      });

      dateInput.addEventListener("change", () => {
        const normalizedDate = clampDateToMin(
          dateInput.value,
          dateInput.min || getTodayDateInKST(),
        );
        dateInput.value = normalizedDate;
        applyPanelDateChange(normalizedDate);
        dateInput.value = state.elements.dateInput.value;
        syncMapCalendarDateNavState();
      });

      if (shouldUseCustomDatePopover) {
        dateInput.type = "text";
        dateInput.tabIndex = -1;
        dateInput.setAttribute("aria-hidden", "true");
        dateInput.style.pointerEvents = "none";
        dateInput.style.position = "absolute";
        dateInput.style.inset = "0";
        dateInput.style.width = "100%";
        dateInput.style.height = "100%";
        dateInput.style.opacity = "0";
        dateInput.style.margin = "0";
        dateInput.style.padding = "0";
        dateInput.style.border = "none";
        document.body.appendChild(datePopover);
        renderMapCalendarDatePopover();
        overlay.addEventListener("pointerdown", (event) => {
          const target = event.target;
          if (!(target instanceof Node)) {
            closeMapCalendarDatePopover();
            return;
          }
          if (
            dateDisplayWrap.contains(target) ||
            datePopover.contains(target)
          ) {
            return;
          }
          closeMapCalendarDatePopover();
        });
      }

      prevDateButton.addEventListener("click", () => {
        shiftPanelDateBy(-1);
        dateInput.value = state.elements.dateInput.value;
        syncMapCalendarDateNavState();
      });

      nextDateButton.addEventListener("click", () => {
        shiftPanelDateBy(1);
        dateInput.value = state.elements.dateInput.value;
        syncMapCalendarDateNavState();
      });

      todayDateButton.addEventListener("click", () => {
        applyPanelDateChange(getTodayDateInKST());
        dateInput.value = state.elements.dateInput.value;
        syncMapCalendarDateNavState();
      });

      dateDisplayWrap.append(dateInput, dateWeekdayLabel);
      if (state.mapCalendarDatePopoverOpen) {
        openMapCalendarDatePopover();
      }
      dateControlRow.append(
        prevDateButton,
        dateDisplayWrap,
        nextDateButton,
        todayDateButton,
      );
      controlRow.appendChild(dateControlRow);
      const dateTagLegend = document.createElement("div");
      dateTagLegend.className = "zzk-room-tag-legend";
      renderRoomTagLegend(dateTagLegend);
      controlRow.appendChild(dateTagLegend);
      syncMapCalendarDateNavState();

      titleControls.appendChild(controlRow);
    }

    const headerRight = document.createElement("div");
    headerRight.className = "zzk-map-calendar-header-right";
    header.appendChild(headerRight);

    const alwaysOpenToggle = document.createElement("label");
    alwaysOpenToggle.className = "zzk-map-calendar-always-open";
    const alwaysOpenInput = document.createElement("input");
    alwaysOpenInput.type = "checkbox";
    alwaysOpenInput.checked = state.mapCalendarAlwaysOpen;
    alwaysOpenInput.setAttribute("aria-label", "지도 타임블록 항상 열기");
    alwaysOpenInput.addEventListener("change", () => {
      state.mapCalendarAlwaysOpen = alwaysOpenInput.checked;
      writeStoredBoolean(
        MAP_CALENDAR_ALWAYS_OPEN_STORAGE_KEY,
        state.mapCalendarAlwaysOpen,
      );
      if (state.mapCalendarAlwaysOpen) {
        state.mapCalendarVisible = true;
        openMapCalendarModal();
        return;
      }

      if (!state.mapCalendarVisible) {
        removeMapCalendarOverlay();
      }
      updateMapCalendarLauncherState();
    });
    const alwaysOpenLabel = document.createElement("span");
    alwaysOpenLabel.textContent = "항상 열기";
    alwaysOpenToggle.append(alwaysOpenInput, alwaysOpenLabel);
    headerRight.appendChild(alwaysOpenToggle);

    const legend = document.createElement("div");
    legend.className = "zzk-map-calendar-legend";
    legend.innerHTML =
      '<span class="free">비어 있음</span><span class="busy">예약 있음</span><span class="selected">선택 시간대</span>';
    headerRight.appendChild(legend);

    const collapseButton = document.createElement("button");
    collapseButton.type = "button";
    collapseButton.className = "zzk-map-calendar-toggle";
    collapseButton.textContent = state.mapCalendarCollapsed ? "열기" : "접기";
    collapseButton.setAttribute("aria-label", "지도 타임블록 접기/펼치기");
    collapseButton.addEventListener("click", () => {
      state.mapCalendarCollapsed = !state.mapCalendarCollapsed;
      renderMapCalendarOverlay(scheduleData);
    });
    headerRight.appendChild(collapseButton);

    const body = document.createElement("div");
    body.className = "zzk-map-calendar-body";
    card.appendChild(body);
    syncMapCalendarBodyLoadingState();

    if (state.mapCalendarCollapsed) {
      card.classList.add("collapsed");
      applyMapCalendarWidth(overlay);
      return;
    }

    if (timeline.length === 0 || rooms.length === 0) {
      const empty = document.createElement("p");
      empty.className = "zzk-map-calendar-empty";
      empty.textContent = `표시할 ${tabLabel} 일정이 없습니다.`;
      body.appendChild(empty);
      syncMapCalendarBodyScrollState(body);
      applyMapCalendarWidth(overlay);
      if (preservedBodyScroll.left !== 0) {
        body.scrollLeft = preservedBodyScroll.left;
      }
      if (preservedBodyScroll.top !== 0) {
        body.scrollTop = preservedBodyScroll.top;
      }
      return;
    }

    const hasTerminalHourBoundary =
      Number.isInteger(scheduleData?.range?.endMinute) &&
      scheduleData.range.endMinute % 60 === 0;
    const timelineLayout = buildMapCalendarTimelineGridLayout(
      timeline,
      hasTerminalHourBoundary,
    );

    const gridWrap = document.createElement("div");
    gridWrap.className = "zzk-map-calendar-grid-wrap";
    gridWrap.style.minWidth = `${Math.max(
      720,
      CALENDAR_FLOOR_COL_WIDTH +
        CALENDAR_ROW_GAP +
        CALENDAR_ROOM_COL_WIDTH +
        CALENDAR_ROW_GAP +
        timelineLayout.trackWidth +
        CALENDAR_SIDE_MARGIN * 2,
    )}px`;
    body.appendChild(gridWrap);

    const grid = document.createElement("div");
    grid.className = "zzk-map-calendar-grid";
    gridWrap.appendChild(grid);

    const boundaryLayer = document.createElement("div");
    boundaryLayer.className = "zzk-map-calendar-hour-boundary-layer";
    const boundaryTrack = document.createElement("div");
    boundaryTrack.className = "zzk-map-calendar-hour-boundary-track";
    boundaryTrack.style.gridTemplateColumns = timelineLayout.templateColumns;
    boundaryLayer.appendChild(boundaryTrack);
    gridWrap.appendChild(boundaryLayer);
    renderMapCalendarHourBoundaryCells(
      boundaryTrack,
      timelineLayout.boundaryColumnStarts,
    );

    const dividerLayer = document.createElement("div");
    dividerLayer.className = "zzk-map-calendar-divider-layer";
    const dividerTrack = document.createElement("div");
    dividerTrack.className = "zzk-map-calendar-divider-track";
    dividerLayer.appendChild(dividerTrack);
    gridWrap.appendChild(dividerLayer);

    const axisRow = document.createElement("div");
    axisRow.className = "zzk-map-calendar-axis-row";
    grid.appendChild(axisRow);

    const axisFloor = document.createElement("div");
    axisFloor.className = "zzk-map-calendar-floor-name axis";
    axisFloor.textContent = "층";
    axisRow.appendChild(axisFloor);

    const axisRoomLabel = document.createElement("div");
    axisRoomLabel.className = "zzk-map-calendar-room-name axis";
    axisRoomLabel.textContent = tabLabel;
    axisRow.appendChild(axisRoomLabel);

    const axisSlots = document.createElement("div");
    axisSlots.className = "zzk-map-calendar-slots";
    axisSlots.style.gridTemplateColumns = timelineLayout.templateColumns;
    axisRow.appendChild(axisSlots);

    timeline.forEach((slot, index) => {
      const slotLabel = document.createElement("div");
      slotLabel.className = "zzk-map-calendar-hour-label";
      if (slot.isHourMark) {
        slotLabel.classList.add("hour-boundary");
      }
      slotLabel.style.gridColumn = String(
        timelineLayout.slotColumnStarts[index],
      );
      slotLabel.textContent = slot.isHourMark ? slot.label : "";
      axisSlots.appendChild(slotLabel);
    });

    let currentFloorKey = null;
    let currentFloorRooms = null;
    let previousMappedFloorLabel = "";

    rooms.forEach((room) => {
      const floorInfo = resolveMapCalendarRoomFloor(room);

      if (
        !(currentFloorRooms instanceof HTMLElement) ||
        currentFloorKey !== floorInfo.floorKey
      ) {
        currentFloorKey = floorInfo.floorKey;

        const floorGroup = document.createElement("div");
        floorGroup.className = "zzk-map-calendar-floor-group";
        if (
          floorInfo.floorLabel &&
          previousMappedFloorLabel &&
          previousMappedFloorLabel !== floorInfo.floorLabel
        ) {
          floorGroup.classList.add("floor-boundary");
        }

        const floorName = document.createElement("div");
        floorName.className = "zzk-map-calendar-floor-name";
        floorName.textContent = floorInfo.floorLabel;
        floorGroup.appendChild(floorName);

        const floorRooms = document.createElement("div");
        floorRooms.className = "zzk-map-calendar-floor-rooms";
        floorGroup.appendChild(floorRooms);

        grid.appendChild(floorGroup);
        currentFloorRooms = floorRooms;

        if (floorInfo.floorLabel) {
          previousMappedFloorLabel = floorInfo.floorLabel;
        }
      }

      const row = document.createElement("div");
      row.className = "zzk-map-calendar-row";
      currentFloorRooms.appendChild(row);

      const roomSelectionLocked =
        editLockedRoomConstraint != null &&
        !doesRoomMatchEditLockedConstraint(room, editLockedRoomConstraint);
      if (roomSelectionLocked) {
        row.classList.add("room-locked-disabled");
        row.setAttribute("aria-disabled", "true");
      }

      const roomName = document.createElement("div");
      roomName.className = "zzk-map-calendar-room-name";
      renderRoomLabel(roomName, room, {
        formatter: formatMapCalendarRoomLabel,
        titleMode: "overlay",
      });
      roomName.title = `공간 ID: ${room.id}`;
      row.appendChild(roomName);

      const slots = document.createElement("div");
      slots.className = "zzk-map-calendar-slots";
      slots.style.gridTemplateColumns = timelineLayout.templateColumns;
      row.appendChild(slots);

      const reservations = Array.isArray(room.reservations)
        ? room.reservations
        : [];
      const isEditableWindowRoom = doesRoomMatchEditWindowConstraint(
        room,
        editReservationWindowConstraint,
      );

      const slotMetas = timeline.map((slot) => {
        const overlappedReservations = reservations.filter(
          (reservation) =>
            Number.isInteger(reservation.startMinute) &&
            Number.isInteger(reservation.endMinute) &&
            reservation.startMinute < slot.endMinute &&
            reservation.endMinute > slot.startMinute,
        );
        const effectiveOverlappedReservations =
          isEditableWindowRoom && !roomSelectionLocked
            ? overlappedReservations.filter(
                (reservation) =>
                  !isReservationEditableByCurrentEditWindow(
                    reservation,
                    editReservationWindowConstraint,
                  ),
              )
            : overlappedReservations;

        const isPastBlocked =
          Number.isFinite(earliestSelectableMinute) &&
          slot.startMinute < earliestSelectableMinute;

        return {
          slot,
          overlappedReservations: effectiveOverlappedReservations,
          isBusy: effectiveOverlappedReservations.length > 0,
          isPastBlocked,
          isRoomLocked: roomSelectionLocked,
          isSelectable:
            effectiveOverlappedReservations.length === 0 &&
            !isPastBlocked &&
            !roomSelectionLocked,
        };
      });

      const appliedSelectionForRoom =
        state.appliedSelection &&
        state.appliedSelection.date === selectionDate &&
        state.appliedSelection.roomId === room.id &&
        Number.isInteger(state.appliedSelection.startMinute) &&
        Number.isInteger(state.appliedSelection.endMinute) &&
        state.appliedSelection.startMinute < state.appliedSelection.endMinute
          ? state.appliedSelection
          : null;

      const selectionMatchesRoom =
        state.slotSelection != null &&
        state.slotSelection.date === selectionDate &&
        state.slotSelection.roomId === room.id;

      let selectionStartIndex = -1;
      let selectionMaxIndex = -1;
      let selectionHoverIndex = -1;

      if (selectionMatchesRoom) {
        selectionStartIndex = slotMetas.findIndex(
          (meta) => meta.slot.startMinute === state.slotSelection?.startMinute,
        );

        if (
          selectionStartIndex >= 0 &&
          slotMetas[selectionStartIndex].isSelectable
        ) {
          const hardMaxIndex = Math.min(
            slotMetas.length - 1,
            selectionStartIndex + MAX_RESERVATION_BLOCKS - 1,
          );

          for (
            let index = selectionStartIndex;
            index <= hardMaxIndex;
            index += 1
          ) {
            if (!slotMetas[index].isSelectable) {
              break;
            }
            selectionMaxIndex = index;
          }

          const requestedHoverMinute = state.slotSelection?.hoverMinute;
          const hoverIndex = slotMetas.findIndex(
            (meta) => meta.slot.startMinute === requestedHoverMinute,
          );

          selectionHoverIndex =
            hoverIndex >= selectionStartIndex && hoverIndex <= selectionMaxIndex
              ? hoverIndex
              : selectionStartIndex;
        } else {
          state.slotSelection = null;
        }
      }

      if (
        selectionStartIndex >= 0 &&
        selectionHoverIndex < selectionStartIndex
      ) {
        selectionHoverIndex = selectionStartIndex;
      }

      const hoverMatchesRoom =
        state.slotHover != null &&
        state.slotHover.date === selectionDate &&
        state.slotHover.roomId === room.id;

      if (hoverMatchesRoom) {
        row.classList.add("hovered");
      }

      let hoverStartIndex = -1;
      let hoverMaxIndex = -1;

      if (hoverMatchesRoom) {
        hoverStartIndex = slotMetas.findIndex(
          (meta) => meta.slot.startMinute === state.slotHover?.startMinute,
        );

        if (hoverStartIndex >= 0 && slotMetas[hoverStartIndex].isSelectable) {
          const hardMaxIndex = Math.min(
            slotMetas.length - 1,
            hoverStartIndex + MAX_RESERVATION_BLOCKS - 1,
          );

          for (let index = hoverStartIndex; index <= hardMaxIndex; index += 1) {
            if (!slotMetas[index].isSelectable) {
              break;
            }
            hoverMaxIndex = index;
          }
        } else {
          state.slotHover = null;
        }
      }

      slots.addEventListener("mouseleave", () => {
        if (
          !state.slotHover ||
          state.slotHover.date !== selectionDate ||
          state.slotHover.roomId !== room.id
        ) {
          return;
        }

        state.slotHover = null;
        renderMapCalendarOverlay(scheduleData);
      });

      slotMetas.forEach((slotMeta, index) => {
        const {
          slot,
          isBusy,
          isPastBlocked,
          isSelectable,
          isRoomLocked,
          overlappedReservations,
        } = slotMeta;
        const slotElement = document.createElement("div");
        slotElement.className = "zzk-map-calendar-slot";
        slotElement.style.gridColumn = String(
          timelineLayout.slotColumnStarts[index],
        );
        if (isBusy) {
          slotElement.classList.add("busy");
        } else {
          slotElement.classList.add("free");
        }
        if (isPastBlocked) {
          slotElement.classList.add("past-blocked");
        }
        if (isRoomLocked) {
          slotElement.classList.add("room-locked-disabled");
        }

        const isSelectedRange =
          appliedSelectionForRoom &&
          appliedSelectionForRoom.startMinute < slot.endMinute &&
          appliedSelectionForRoom.endMinute > slot.startMinute;

        if (isSelectedRange) {
          slotElement.classList.add("selected");
        }

        const isSelectableRangeSlot =
          selectionStartIndex >= 0 &&
          selectionMaxIndex >= selectionStartIndex &&
          index >= selectionStartIndex &&
          index <= selectionMaxIndex &&
          slotMetas[index].isSelectable;

        if (isSelectableRangeSlot) {
          slotElement.classList.add("selectable");
        }

        if (selectionStartIndex >= 0 && index === selectionStartIndex) {
          slotElement.classList.add("anchor");
        }

        const isPreviewRangeSlot =
          selectionStartIndex >= 0 &&
          selectionHoverIndex >= selectionStartIndex &&
          index >= selectionStartIndex &&
          index <= selectionHoverIndex &&
          slotMetas[index].isSelectable;

        if (isPreviewRangeSlot) {
          slotElement.classList.add("preview");
        }

        const isHoverPreviewRangeSlot =
          hoverStartIndex >= 0 &&
          hoverMaxIndex >= hoverStartIndex &&
          index >= hoverStartIndex &&
          index <= hoverMaxIndex &&
          slotMetas[index].isSelectable;

        if (isHoverPreviewRangeSlot) {
          slotElement.classList.add("hover-preview");
        }

        const slotEndLabel = minuteToHourMinute(slot.endMinute);
        const reservationPreview = overlappedReservations
          .slice(0, 2)
          .map((reservation) =>
            reservation.owner
              ? `${reservation.startTime}~${reservation.endTime} ${reservation.owner}`
              : `${reservation.startTime}~${reservation.endTime}`,
          )
          .join(" | ");

        if (isBusy) {
          slotElement.title = `${room.name} ${slot.label}~${slotEndLabel} 예약 있음${
            reservationPreview ? ` (${reservationPreview})` : ""
          }`;
        } else if (isPastBlocked) {
          slotElement.title = `${room.name} ${slot.label}~${slotEndLabel} 선택 불가 (현재 시간 이전)`;
        } else if (isRoomLocked) {
          slotElement.title = `${room.name} ${slot.label}~${slotEndLabel} 조회 전용 (수정 중 공간만 선택 가능)`;
        } else {
          slotElement.title = `${room.name} ${slot.label}~${slotEndLabel} 비어 있음`;
        }

        slotElement.addEventListener("mouseenter", () => {
          if (!isSelectable) {
            return;
          }

          let shouldRerender = false;

          if (
            !state.slotHover ||
            state.slotHover.date !== selectionDate ||
            state.slotHover.roomId !== room.id ||
            state.slotHover.startMinute !== slot.startMinute
          ) {
            state.slotHover = {
              date: selectionDate,
              roomId: room.id,
              startMinute: slot.startMinute,
            };
            shouldRerender = true;
          }

          if (
            state.slotSelection &&
            state.slotSelection.date === selectionDate &&
            state.slotSelection.roomId === room.id &&
            isSelectableRangeSlot &&
            state.slotSelection.hoverMinute !== slot.startMinute
          ) {
            state.slotSelection = {
              ...state.slotSelection,
              hoverMinute: slot.startMinute,
            };
            shouldRerender = true;
          }

          if (shouldRerender) {
            renderMapCalendarOverlay(scheduleData);
          }
        });

        slotElement.addEventListener("click", (event) => {
          event.preventDefault();
          event.stopPropagation();

          if (!isSelectable) {
            return;
          }

          const hardMaxIndex = Math.min(
            slotMetas.length - 1,
            index + MAX_RESERVATION_BLOCKS - 1,
          );
          let autoEndIndex = index;

          for (
            let selectionIndex = index;
            selectionIndex <= hardMaxIndex;
            selectionIndex += 1
          ) {
            if (!slotMetas[selectionIndex].isSelectable) {
              break;
            }
            autoEndIndex = selectionIndex;
          }

          const selectionStartMinute = timeline[index].startMinute;
          const selectionEndMinute = timeline[autoEndIndex].endMinute;
          state.slotSelection = null;
          state.slotHover = null;

          queueTimelineSelectionApply({
            date: selectionDate,
            startMinute: selectionStartMinute,
            endMinute: selectionEndMinute,
            room,
          });
        });

        slots.appendChild(slotElement);
      });
    });

    syncMapCalendarBodyScrollState(body);
    applyMapCalendarWidth(overlay);
    if (preservedBodyScroll.left !== 0) {
      body.scrollLeft = preservedBodyScroll.left;
    }
    if (preservedBodyScroll.top !== 0) {
      body.scrollTop = preservedBodyScroll.top;
    }

    // 너비가 적용된 뒤에야 스크롤 가능 여부를 알 수 있으므로 레이아웃 확정 후 실행한다.
    window.requestAnimationFrame(() => {
      applyMapCalendarCurrentTimeScroll(overlay);
    });
  }

  function buildEditLockedRoomConstraint(rooms) {
    if (!isGuestReservationEditPage()) {
      return null;
    }

    const hostRoot = getHostReservationRoot();
    const selectedRoomId =
      readHostSelectedRoomId(hostRoot) || readHostSelectedRoomId(document);
    const roomNameCandidate = resolveEditLockedRoomNameCandidate(hostRoot);
    const normalizedRoomName = normalizeTextForMatch(
      extractKnownRoomName(roomNameCandidate || ""),
    );

    if (!Number.isInteger(selectedRoomId) && !normalizedRoomName) {
      return null;
    }

    const allowedRoomIds = new Set();
    const roomList = Array.isArray(rooms) ? rooms : [];
    roomList.forEach((room) => {
      const roomId = Number(room?.id);
      if (!Number.isInteger(roomId)) {
        return;
      }

      const normalizedCandidateName = normalizeTextForMatch(
        extractKnownRoomName(typeof room?.name === "string" ? room.name : ""),
      );
      const idMatched =
        Number.isInteger(selectedRoomId) && roomId === selectedRoomId;
      const nameMatched =
        normalizedRoomName &&
        normalizedCandidateName &&
        (normalizedCandidateName === normalizedRoomName ||
          normalizedCandidateName.includes(normalizedRoomName) ||
          normalizedRoomName.includes(normalizedCandidateName));

      if (idMatched || nameMatched) {
        allowedRoomIds.add(roomId);
      }
    });

    if (allowedRoomIds.size === 0 && Number.isInteger(selectedRoomId)) {
      allowedRoomIds.add(selectedRoomId);
    }

    return {
      roomId: Number.isInteger(selectedRoomId) ? selectedRoomId : null,
      normalizedRoomName,
      allowedRoomIds,
    };
  }

  function resolveEditLockedRoomNameCandidate(root = document) {
    const directRoomName = normalizeHostRoomCandidate(
      readHostRoomName(root) || readHostRoomName(document) || "",
    );
    if (directRoomName) {
      return directRoomName;
    }

    const roomFieldValue = normalizeHostRoomCandidate(
      readHostReservationFieldValue(
        root,
        ["공간 선택", "공간", "회의실", "room", "space"],
        {
          includeReadOnly: true,
          includeDisabled: true,
          includeExtendedControls: true,
        },
      ) || "",
    );
    if (roomFieldValue) {
      return roomFieldValue;
    }

    const roomTitleAnchor = findGuestRoomTitleAnchor();
    if (roomTitleAnchor instanceof HTMLElement) {
      const fromTitle = normalizeHostRoomCandidate(
        roomTitleAnchor.textContent || "",
      );
      if (fromTitle) {
        return fromTitle;
      }
    }

    return "";
  }

  function readHostSelectedRoomId(root = document) {
    const scopedRoomSelect = root.querySelector(
      "select[name='spaceId'], select[name='roomId']",
    );
    const roomSelect =
      scopedRoomSelect instanceof HTMLSelectElement
        ? scopedRoomSelect
        : document.querySelector(
            "select[name='spaceId'], select[name='roomId']",
          );
    if (roomSelect instanceof HTMLSelectElement) {
      const parsed = parseReservationRoomIdCandidate(roomSelect.value || "");
      if (Number.isInteger(parsed)) {
        return parsed;
      }

      const selectedOption =
        roomSelect.selectedIndex >= 0
          ? roomSelect.options[roomSelect.selectedIndex]
          : null;
      if (selectedOption instanceof HTMLOptionElement) {
        const optionDataId =
          selectedOption.getAttribute("data-value") ||
          selectedOption.getAttribute("data-id") ||
          selectedOption.value ||
          "";
        const optionParsed = parseReservationRoomIdCandidate(optionDataId);
        if (Number.isInteger(optionParsed)) {
          return optionParsed;
        }
      }
    }

    const hiddenRoomInput = root.querySelector(
      "input[type='hidden'][name='spaceId'], input[type='hidden'][name='roomId']",
    );
    if (hiddenRoomInput instanceof HTMLInputElement) {
      const hiddenParsed = parseReservationRoomIdCandidate(
        hiddenRoomInput.value || "",
      );
      if (Number.isInteger(hiddenParsed)) {
        return hiddenParsed;
      }
    }

    const roomDropdownButton = findHostRoomDropdownButton(root);
    if (!(roomDropdownButton instanceof HTMLButtonElement)) {
      return null;
    }

    const dataValue =
      roomDropdownButton.getAttribute("data-value") ||
      roomDropdownButton.getAttribute("value") ||
      roomDropdownButton.dataset.value ||
      "";
    const parsed = parseReservationRoomIdCandidate(dataValue);
    return Number.isInteger(parsed) ? parsed : null;
  }

  function doesRoomMatchEditLockedConstraint(room, constraint) {
    if (!constraint || typeof constraint !== "object") {
      return true;
    }

    const roomId = Number(room?.id);
    if (
      Number.isInteger(roomId) &&
      constraint.allowedRoomIds instanceof Set &&
      constraint.allowedRoomIds.has(roomId)
    ) {
      return true;
    }

    if (
      Number.isInteger(roomId) &&
      Number.isInteger(constraint.roomId) &&
      roomId === constraint.roomId
    ) {
      return true;
    }

    const lockedRoomName = normalizeTextForMatch(
      constraint.normalizedRoomName || "",
    );
    if (!lockedRoomName) {
      return false;
    }

    const roomName = normalizeTextForMatch(
      extractKnownRoomName(typeof room?.name === "string" ? room.name : ""),
    );
    if (!roomName) {
      return false;
    }

    return (
      roomName === lockedRoomName ||
      roomName.includes(lockedRoomName) ||
      lockedRoomName.includes(roomName)
    );
  }

  function enforceEditLockedRoomSelectionState(constraint, selectionDate) {
    if (!constraint || !isGuestReservationEditPage()) {
      return;
    }

    const isAllowedRoomId = (roomId) => {
      if (!Number.isInteger(roomId)) {
        return true;
      }

      if (
        constraint.allowedRoomIds instanceof Set &&
        constraint.allowedRoomIds.size > 0
      ) {
        return constraint.allowedRoomIds.has(roomId);
      }

      if (Number.isInteger(constraint.roomId)) {
        return roomId === constraint.roomId;
      }

      return true;
    };

    if (
      state.slotSelection &&
      state.slotSelection.date === selectionDate &&
      !isAllowedRoomId(state.slotSelection.roomId)
    ) {
      state.slotSelection = null;
    }

    if (
      state.slotHover &&
      state.slotHover.date === selectionDate &&
      !isAllowedRoomId(state.slotHover.roomId)
    ) {
      state.slotHover = null;
    }

    if (
      state.appliedSelection &&
      state.appliedSelection.date === selectionDate &&
      !isAllowedRoomId(state.appliedSelection.roomId)
    ) {
      state.appliedSelection = null;
    }
  }

  function resetEditReservationBaselineConstraint() {
    state.editReservationBaselineConstraint = null;
    state.editReservationBaselinePathKey = "";
  }

  function buildEditReservationBaselineContextKey(lockConstraint) {
    const sharingMapId = getSharingMapId() || "";
    const roomKey = Number.isInteger(lockConstraint?.roomId)
      ? String(lockConstraint.roomId)
      : normalizeTextForMatch(lockConstraint?.normalizedRoomName || "");
    return `${location.pathname}|${sharingMapId}|${roomKey}`;
  }

  function captureEditReservationWindowBaseline(selectionDate, lockConstraint) {
    const hostRoot = getHostReservationRoot();
    const dateInput =
      queryHostDateInput(hostRoot) || queryHostDateInput(document);
    const observedDate =
      dateInput instanceof HTMLInputElement
        ? normalizeDateString(dateInput.value || "")
        : null;

    const observedTimes = readHostReservationTimeValues(hostRoot);
    const startMinute = parseHourMinute(String(observedTimes?.startTime || ""));
    const endMinute = parseHourMinute(String(observedTimes?.endTime || ""));
    if (
      !Number.isInteger(startMinute) ||
      !Number.isInteger(endMinute) ||
      startMinute >= endMinute
    ) {
      return null;
    }

    const roomIdFromForm =
      readHostSelectedRoomId(hostRoot) || readHostSelectedRoomId(document);
    const roomNameCandidate = resolveEditLockedRoomNameCandidate(hostRoot);
    const normalizedRoomName = normalizeTextForMatch(
      extractKnownRoomName(roomNameCandidate || ""),
    );
    const normalizedSelectionDate = normalizeDateString(selectionDate || "");
    const baselineDate = observedDate || normalizedSelectionDate || "";
    if (!baselineDate) {
      return null;
    }

    return {
      date: baselineDate,
      startMinute,
      endMinute,
      roomId:
        Number.isInteger(roomIdFromForm) ||
        Number.isInteger(lockConstraint?.roomId)
          ? Number.isInteger(roomIdFromForm)
            ? roomIdFromForm
            : lockConstraint.roomId
          : null,
      normalizedRoomName:
        normalizedRoomName ||
        normalizeTextForMatch(lockConstraint?.normalizedRoomName || ""),
    };
  }

  function buildEditReservationWindowConstraint(selectionDate, lockConstraint) {
    if (!isGuestReservationEditPage()) {
      return null;
    }

    const contextKey = buildEditReservationBaselineContextKey(lockConstraint);
    if (state.editReservationBaselinePathKey !== contextKey) {
      resetEditReservationBaselineConstraint();
      state.editReservationBaselinePathKey = contextKey;
    }

    if (!state.editReservationBaselineConstraint) {
      const baseline = captureEditReservationWindowBaseline(
        selectionDate,
        lockConstraint,
      );
      if (baseline) {
        state.editReservationBaselineConstraint = baseline;
      }
    }

    const baseline =
      state.editReservationBaselineConstraint &&
      typeof state.editReservationBaselineConstraint === "object"
        ? state.editReservationBaselineConstraint
        : null;
    if (!baseline) {
      return null;
    }

    const normalizedSelectionDate = normalizeDateString(selectionDate || "");
    if (
      normalizedSelectionDate &&
      baseline.date &&
      baseline.date !== normalizedSelectionDate
    ) {
      return null;
    }

    return {
      date: baseline.date,
      startMinute: baseline.startMinute,
      endMinute: baseline.endMinute,
      roomId: Number.isInteger(baseline.roomId) ? baseline.roomId : null,
      normalizedRoomName: normalizeTextForMatch(
        baseline.normalizedRoomName || "",
      ),
    };
  }

  function doesRoomMatchEditWindowConstraint(room, constraint) {
    if (!constraint || typeof constraint !== "object") {
      return false;
    }

    const roomId = Number(room?.id);
    if (
      Number.isInteger(roomId) &&
      Number.isInteger(constraint.roomId) &&
      roomId === constraint.roomId
    ) {
      return true;
    }

    const constraintRoomName = normalizeTextForMatch(
      constraint.normalizedRoomName || "",
    );
    if (!constraintRoomName) {
      return false;
    }

    const roomName = normalizeTextForMatch(
      extractKnownRoomName(typeof room?.name === "string" ? room.name : ""),
    );
    if (!roomName) {
      return false;
    }

    return (
      roomName === constraintRoomName ||
      roomName.includes(constraintRoomName) ||
      constraintRoomName.includes(roomName)
    );
  }

  function isReservationEditableByCurrentEditWindow(reservation, constraint) {
    if (!constraint || typeof constraint !== "object") {
      return false;
    }

    const reservationStartMinute = Number(reservation?.startMinute);
    const reservationEndMinute = Number(reservation?.endMinute);
    if (
      !Number.isInteger(reservationStartMinute) ||
      !Number.isInteger(reservationEndMinute) ||
      reservationStartMinute >= reservationEndMinute
    ) {
      return false;
    }

    if (
      !Number.isInteger(constraint.startMinute) ||
      !Number.isInteger(constraint.endMinute)
    ) {
      return false;
    }

    return (
      reservationStartMinute < constraint.endMinute &&
      reservationEndMinute > constraint.startMinute
    );
  }

  function syncMapCalendarBodyScrollState(bodyElement) {
    if (!(bodyElement instanceof HTMLElement)) {
      return;
    }

    const update = () => {
      const overflowDelta = bodyElement.scrollHeight - bodyElement.clientHeight;
      bodyElement.classList.toggle(
        "zzk-map-calendar-body-scrollable",
        overflowDelta > 2,
      );
    };

    update();
    window.requestAnimationFrame(update);
  }

  function buildMapCalendarTimelineGridLayout(
    timeline,
    hasTerminalHourBoundary,
  ) {
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

    if (timeline[0]?.isHourMark) {
      addBoundarySegment();
    }

    slotColumnStarts.push(columns.length + 1);
    addColumn(CALENDAR_SLOT_MIN_WIDTH);

    for (let index = 1; index < timeline.length; index += 1) {
      if (timeline[index]?.isHourMark) {
        addBoundarySegment();
      } else {
        addColumn(CALENDAR_SLOT_GAP);
      }

      slotColumnStarts.push(columns.length + 1);
      addColumn(CALENDAR_SLOT_MIN_WIDTH);
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

  function renderMapCalendarHourBoundaryCells(
    slotsContainer,
    boundaryColumnStarts,
  ) {
    if (!(slotsContainer instanceof HTMLElement)) {
      return;
    }

    const columnStarts = Array.isArray(boundaryColumnStarts)
      ? boundaryColumnStarts
      : [];
    columnStarts.forEach((columnStart) => {
      if (!Number.isInteger(columnStart) || columnStart < 1) {
        return;
      }
      const line = document.createElement("div");
      line.className = "zzk-map-calendar-hour-boundary-cell";
      line.style.gridColumn = String(columnStart);
      slotsContainer.appendChild(line);
    });
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

      .zzk-map-calendar-date-popover-floating {
        position: fixed;
        top: 0;
        left: 0;
        z-index: 2147483647;
        width: 236px;
        padding: 8px;
        border: 1px solid rgba(15, 23, 42, 0.14);
        border-radius: 12px;
        background: rgba(255, 255, 255, 0.98);
        box-shadow: 0 12px 28px rgba(15, 23, 42, 0.16);
        backdrop-filter: blur(10px);
      }

      .zzk-map-calendar-date-popover-floating[hidden] {
        display: none;
      }

      .zzk-map-calendar-date-popover-floating .zzk-map-calendar-date-popover-header {
        display: grid;
        grid-template-columns: 28px 1fr 28px;
        align-items: center;
        gap: 4px;
        margin-bottom: 6px;
      }

      .zzk-map-calendar-date-popover-floating .zzk-map-calendar-date-popover-title {
        font-size: 13px;
        font-weight: 800;
        color: #0f172a;
        text-align: center;
      }

      .zzk-map-calendar-date-popover-floating .zzk-map-calendar-date-popover-nav {
        display: inline-flex;
        align-items: center;
        justify-content: center;
        width: 28px;
        height: 28px;
        padding: 0;
        border: 1px solid rgba(15, 23, 42, 0.12);
        border-radius: 8px;
        background: #ffffff;
        color: #475569;
        cursor: pointer;
      }

      .zzk-map-calendar-date-popover-floating .zzk-map-calendar-date-popover-nav svg {
        width: 12px;
        height: 12px;
      }

      .zzk-map-calendar-date-popover-floating .zzk-map-calendar-date-popover-weekdays,
      .zzk-map-calendar-date-popover-floating .zzk-map-calendar-date-popover-grid {
        display: grid;
        grid-template-columns: repeat(7, 1fr);
        gap: 2px;
      }

      .zzk-map-calendar-date-popover-floating .zzk-map-calendar-date-popover-weekdays {
        margin-bottom: 4px;
      }

      .zzk-map-calendar-date-popover-floating .zzk-map-calendar-date-popover-weekdays span {
        font-size: 11px;
        font-weight: 700;
        color: #64748b;
        text-align: center;
      }

      .zzk-map-calendar-date-popover-floating .zzk-map-calendar-date-popover-day {
        display: inline-flex;
        align-items: center;
        justify-content: center;
        min-width: 26px;
        min-height: 26px;
        padding: 0;
        border: 1px solid transparent;
        border-radius: 8px;
        background: transparent;
        color: #0f172a;
        font-size: 12px;
        font-weight: 700;
        cursor: pointer;
      }

      .zzk-map-calendar-date-popover-floating .zzk-map-calendar-date-popover-day.is-outside-month {
        color: #cbd5e1;
      }

      .zzk-map-calendar-date-popover-floating .zzk-map-calendar-date-popover-day.is-today {
        border-color: rgba(255, 136, 51, 0.28);
        color: #ff8833;
      }

      .zzk-map-calendar-date-popover-floating .zzk-map-calendar-date-popover-day.is-selected {
        background: #ff8833;
        color: #ffffff;
      }

      .zzk-map-calendar-date-popover-floating .zzk-map-calendar-date-popover-day:disabled {
        color: #cbd5e1;
        cursor: default;
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
      #${MAP_CALENDAR_OVERLAY_ID} .zzk-map-calendar-toggle {
        user-select: auto;
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

      #${MAP_CALENDAR_OVERLAY_ID} .zzk-map-calendar-legend {
        display: flex;
        gap: 6px;
        font-size: 12px;
        color: #334155;
      }

      #${MAP_CALENDAR_OVERLAY_ID} .zzk-map-calendar-legend span {
        display: inline-flex;
        align-items: center;
        gap: 4px;
      }

      #${MAP_CALENDAR_OVERLAY_ID} .zzk-map-calendar-legend span::before {
        content: "";
        width: 8px;
        height: 8px;
        border-radius: 2px;
        border: 1px solid rgba(15, 23, 42, 0.25);
      }

      #${MAP_CALENDAR_OVERLAY_ID} .zzk-map-calendar-legend .free::before {
        background: rgba(34, 197, 94, 0.4);
      }

      #${MAP_CALENDAR_OVERLAY_ID} .zzk-map-calendar-legend .busy::before {
        background: rgba(239, 68, 68, 0.45);
      }

      #${MAP_CALENDAR_OVERLAY_ID} .zzk-map-calendar-legend .selected::before {
        background: rgba(14, 165, 233, 0.35);
      }

      #${MAP_CALENDAR_OVERLAY_ID} .zzk-map-calendar-toggle {
        border: 1px solid rgba(15, 23, 42, 0.2);
        border-radius: 999px;
        background: rgba(248, 250, 252, 0.95);
        color: #0f172a;
        font-size: 13px;
        font-weight: 700;
        padding: 4px 9px;
        cursor: pointer;
      }

      #${MAP_CALENDAR_OVERLAY_ID} .zzk-map-calendar-toggle:hover {
        background: rgba(226, 232, 240, 0.95);
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
        overflow-x: auto;
        overflow-y: hidden;
      }

      #${MAP_CALENDAR_OVERLAY_ID} .zzk-map-calendar-body.zzk-map-calendar-body-scrollable {
        overflow-y: auto;
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

      #${MAP_CALENDAR_OVERLAY_ID} .zzk-map-calendar-grid-wrap {
        position: relative;
        display: grid;
      }

      #${MAP_CALENDAR_OVERLAY_ID} .zzk-map-calendar-grid-wrap > .zzk-map-calendar-grid,
      #${MAP_CALENDAR_OVERLAY_ID} .zzk-map-calendar-grid-wrap > .zzk-map-calendar-hour-boundary-layer,
      #${MAP_CALENDAR_OVERLAY_ID} .zzk-map-calendar-grid-wrap > .zzk-map-calendar-divider-layer {
        grid-area: 1 / 1;
      }

      #${MAP_CALENDAR_OVERLAY_ID} .zzk-map-calendar-hour-boundary-layer {
        position: relative;
        z-index: 1;
        pointer-events: none;
        display: flex;
      }

      #${MAP_CALENDAR_OVERLAY_ID} .zzk-map-calendar-divider-layer {
        position: relative;
        z-index: 1;
        pointer-events: none;
      }

      #${MAP_CALENDAR_OVERLAY_ID} .zzk-map-calendar-divider-track {
        position: absolute;
        top: 0;
        bottom: 0;
        left: calc(var(--zzk-floor-col-width) + (var(--zzk-row-gap) * 0.5));
        width: 1px;
        /*
         * 층 / 회의실 열이 sticky 로 고정되면서 이 세로선이 행 사이 gap 에만
         * 토막으로 드러난다. 고정 열 뒤에 완전히 가려지도록 숨긴다.
         */
        background: transparent;
      }

      #${MAP_CALENDAR_OVERLAY_ID} .zzk-map-calendar-hour-boundary-track {
        display: grid;
        grid-template-rows: minmax(0, 1fr);
        height: 100%;
        width: calc(100% - (var(--zzk-floor-col-width) + var(--zzk-row-gap) + var(--zzk-room-col-width) + var(--zzk-row-gap)));
        margin-left: calc(
          var(--zzk-floor-col-width) +
            var(--zzk-row-gap) +
            var(--zzk-room-col-width) +
            var(--zzk-row-gap) +
            var(--zzk-timeline-side-margin)
        );
        margin-right: var(--zzk-timeline-side-margin);
      }

      #${MAP_CALENDAR_OVERLAY_ID} .zzk-map-calendar-hour-boundary-cell {
        grid-row: 1;
        height: 100%;
        align-self: stretch;
        justify-self: stretch;
        width: 100%;
        border-radius: 1px;
        /*
         * 정시 세로 구분선은 헤더 위로 삐죽 튀어나와 보여 가로줄만 남긴다.
         */
        background: transparent;
        pointer-events: none;
        z-index: 0;
      }

      #${MAP_CALENDAR_OVERLAY_ID} .zzk-map-calendar-grid {
        position: relative;
        z-index: 2;
        display: grid;
        gap: 4px;
      }

      #${MAP_CALENDAR_OVERLAY_ID} .zzk-map-calendar-axis-row {
        display: grid;
        grid-template-columns: var(--zzk-floor-col-width) var(--zzk-room-col-width) 1fr;
        align-items: center;
        gap: var(--zzk-row-gap);
        padding-bottom: 4px;
        margin-bottom: 2px;
        position: relative;
      }

      /* 고정 열 배경 위에 그려야 헤더 구분선이 토막나지 않는다. */
      #${MAP_CALENDAR_OVERLAY_ID} .zzk-map-calendar-axis-row::after {
        content: "";
        position: absolute;
        bottom: 0;
        left: 0;
        right: 0;
        height: 1px;
        background: var(--zzk-section-divider-color);
        pointer-events: none;
        z-index: 6;
      }

      #${MAP_CALENDAR_OVERLAY_ID} .zzk-map-calendar-floor-group {
        display: grid;
        grid-template-columns: var(--zzk-floor-col-width) 1fr;
        align-items: stretch;
        gap: var(--zzk-row-gap);
        position: relative;
      }

      #${MAP_CALENDAR_OVERLAY_ID} .zzk-map-calendar-floor-group.floor-boundary {
        /*
         * border-top 은 sticky 로 고정된 층/회의실 열 배경에 덮여 토막으로 보인다.
         * 고정 열보다 위(z-index)에 선을 그려서 끊김 없이 이어지게 한다.
         */
        padding-top: 4px;
      }

      #${MAP_CALENDAR_OVERLAY_ID} .zzk-map-calendar-floor-group.floor-boundary::before {
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
        gap: 4px;
      }

      #${MAP_CALENDAR_OVERLAY_ID} .zzk-map-calendar-row {
        display: grid;
        grid-template-columns: var(--zzk-room-col-width) 1fr;
        align-items: center;
        gap: var(--zzk-row-gap);
        border-radius: 6px;
        transition: background-color 120ms ease;
      }

      #${MAP_CALENDAR_OVERLAY_ID} .zzk-map-calendar-row.hovered {
        background: rgba(14, 165, 233, 0.12);
      }

      #${MAP_CALENDAR_OVERLAY_ID} .zzk-map-calendar-row.hovered .zzk-map-calendar-room-name {
        color: #0f172a;
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
        min-height: 100%;
        padding-right: 4px;
        /* 가로 스크롤 시 층 열은 왼쪽에 고정된다. */
        position: sticky;
        left: 0;
        z-index: 4;
        background: #ffffff;
        box-sizing: border-box;
        /*
         * 층 열과 회의실 열 사이 이음새, 그리고 행 사이 gap 을 함께 가린다.
         * 왼쪽으로도 번지게 해서 카드 안쪽 여백 사이로 타임블록이 비치지 않게 한다.
         */
        box-shadow:
          var(--zzk-row-gap) 0 0 0 #ffffff,
          -16px 0 0 0 #ffffff,
          0 -3px 0 0 #ffffff,
          0 3px 0 0 #ffffff,
          var(--zzk-row-gap) -3px 0 0 #ffffff,
          var(--zzk-row-gap) 3px 0 0 #ffffff,
          -16px -3px 0 0 #ffffff,
          -16px 3px 0 0 #ffffff;
      }


      #${MAP_CALENDAR_OVERLAY_ID} .zzk-map-calendar-room-name {
        /* flex(=inline-flex 아님)로 셀 전체를 채워야 스크롤된 타임블록을 가릴 수 있다. */
        display: flex;
        align-items: center;
        gap: 4px;
        min-width: 0;
        padding-left: 4px;
        /* 회의실 열은 층 열 바로 오른쪽에 고정된다. */
        position: sticky;
        left: calc(var(--zzk-floor-col-width) + var(--zzk-row-gap));
        z-index: 4;
        background: #ffffff;
        min-height: 100%;
        box-sizing: border-box;
        /*
         * 행 사이 gap(4px)까지 흰색으로 덮어야 스크롤된 타임블록과
         * 세로 구분선이 틈으로 비치지 않는다.
         * 위아래로 gap 의 절반씩 번지게 해서 인접한 행과 이어 붙인다.
         */
        box-shadow:
          calc(var(--zzk-row-gap) + var(--zzk-timeline-side-margin)) 0 0 0 #ffffff,
          0 -3px 0 0 #ffffff,
          0 3px 0 0 #ffffff,
          calc(var(--zzk-row-gap) + var(--zzk-timeline-side-margin)) -3px 0 0 #ffffff,
          calc(var(--zzk-row-gap) + var(--zzk-timeline-side-margin)) 3px 0 0 #ffffff;
      }

      #${MAP_CALENDAR_OVERLAY_ID} .zzk-map-calendar-axis-row .zzk-map-calendar-floor-name.axis,
      #${MAP_CALENDAR_OVERLAY_ID} .zzk-map-calendar-axis-row .zzk-map-calendar-room-name.axis {
        z-index: 5;
      }

      #${MAP_CALENDAR_OVERLAY_ID} .zzk-map-calendar-floor-name.axis,
      #${MAP_CALENDAR_OVERLAY_ID} .zzk-map-calendar-room-name.axis {
        color: #475569;
      }

      #${MAP_CALENDAR_OVERLAY_ID} .zzk-map-calendar-slots {
        display: grid;
        gap: 0;
        padding-left: var(--zzk-timeline-side-margin);
        padding-right: var(--zzk-timeline-side-margin);
        position: relative;
      }

      #${MAP_CALENDAR_OVERLAY_ID} .zzk-map-calendar-hour-label {
        font-size: 11px;
        color: #64748b;
        text-align: left;
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
        background: rgba(34, 197, 94, 0.32);
      }

      #${MAP_CALENDAR_OVERLAY_ID} .zzk-map-calendar-slot.busy {
        background: rgba(239, 68, 68, 0.45);
      }

      #${MAP_CALENDAR_OVERLAY_ID} .zzk-map-calendar-slot.past-blocked {
        background: rgba(148, 163, 184, 0.32);
        border-color: rgba(100, 116, 139, 0.2);
      }

      #${MAP_CALENDAR_OVERLAY_ID} .zzk-map-calendar-slot.selected {
        outline: 1.5px solid rgba(14, 116, 144, 0.95);
        outline-offset: -1px;
        background: rgba(14, 165, 233, 0.38);
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

        #${MAP_CALENDAR_OVERLAY_ID} .zzk-map-calendar-grid {
          min-width: 620px;
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
    mountMapCalendarLauncher,
    findGuestRoomTitleAnchor,
    scheduleAutoOpenMapCalendarLauncher,
    removeMapCalendarLauncher,
    updateMapCalendarLauncherState,
    openMapCalendarModal,
    removeMapCalendarOverlay,
  } = globalThis.__zzkRadarWorkflow.createRadarWorkflow({
    state,
    MAP_CALENDAR_OVERLAY_ID,
    MAP_CALENDAR_LAUNCHER_ID,
    SLACK_MODAL_TRIGGER_ID,
    DEBUG_MODE,
    MAP_CALENDAR_ALWAYS_OPEN_STORAGE_KEY,
    TARGET_ROOM_NAMES,
    findGuestReservationTabContainer,
    findGuestReservationTabStyleSource,
    normalizeTextForMatch,
    normalizeSlackFieldText,
    normalizeHostRoomCandidate,
    extractKnownRoomName,
    readHostRoomName,
    buildSlackReservationContext: (rootOverride) =>
      buildSlackReservationContext(rootOverride),
    showSlackCopyModal: (context) => showSlackCopyModal(context),
    isGuestPage,
    isGuestReservationEditPage,
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

  const radarFormSync = globalThis.__zzkRadarFormSync.createRadarFormSync({
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
    getHostReservationRoot,
    isHostReservationRootReady,
    waitForHostReservationReady,
    isHostRoomSelectionSynced,
    findHostRoomDropdownButton,
    syncHostRoomSelection,
    queryHostDateInput,
    readHostReservationTimeValues,
    queryHostTimeInput,
    queryFallbackHostTimeInputs,
    setHostTimeByPicker,
    waitForElement,
    setFormElementValue,
    setFormElementValueSilently,
    dispatchFormElementEvents,
    normalizeDateString,
    collapseHostTimePickers,
    isHostReservationFormSynced,
    applyPanelDateChange,
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
      !isGuestPage() ||
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
        const nextWidth = clampMapCalendarWidth(
          startWidth - (moveEvent.clientX - startX),
        );
        if (nextWidth === null) {
          return;
        }

        latestWidth = nextWidth;
        card.style.width = `${nextWidth}px`;
      };

      const handleUp = () => {
        handle.removeEventListener("pointermove", handleMove);
        handle.removeEventListener("pointerup", handleUp);
        handle.removeEventListener("pointercancel", handleUp);
        handle.classList.remove("is-resizing");

        try {
          handle.releasePointerCapture(event.pointerId);
        } catch (error) {
          // 이미 해제되었을 수 있다.
        }

        persistMapCalendarWidth(latestWidth);
        // 너비가 바뀌면 가로 스크롤 가능 여부도 달라지므로 다시 맞춰준다.
        state.mapCalendarCurrentTimeScrollDate = null;
        applyMapCalendarCurrentTimeScroll();
      };

      handle.classList.add("is-resizing");
      handle.addEventListener("pointermove", handleMove);
      handle.addEventListener("pointerup", handleUp);
      handle.addEventListener("pointercancel", handleUp);
    });
  }

  function getMapCalendarWidthBounds() {
    const viewportWidth = Number.isFinite(window.innerWidth)
      ? window.innerWidth
      : 0;
    const max = Math.max(
      MAP_CALENDAR_MIN_WIDTH,
      viewportWidth - MAP_CALENDAR_VIEWPORT_MARGIN,
    );

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

  function applyMapCalendarWidth(
    overlay = document.getElementById(MAP_CALENDAR_OVERLAY_ID),
  ) {
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

    const leadMinute =
      currentMinute - MAP_CALENDAR_CURRENT_TIME_SCROLL_LEAD_MINUTES;

    let targetIndex = timeline.findIndex(
      (slot) => Number(slot?.endMinute) > leadMinute,
    );
    if (targetIndex < 0) {
      targetIndex = timeline.length - 1;
    }

    const baseOffset = Number.isFinite(trackStartOffset) ? trackStartOffset : 0;
    const targetLeft = baseOffset + targetIndex * slotStride;

    return Math.min(maxScrollLeft, Math.max(0, Math.round(targetLeft)));
  }

  function applyMapCalendarCurrentTimeScroll(
    overlay = document.getElementById(MAP_CALENDAR_OVERLAY_ID),
  ) {
    if (!(overlay instanceof HTMLElement)) {
      return;
    }

    const body = overlay.querySelector(".zzk-map-calendar-body");
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

    const scrollLeft = computeMapCalendarCurrentTimeScrollLeft({
      timeline,
      trackStartOffset: metrics.trackStartOffset,
      slotStride: metrics.slotStride,
      viewportWidth: body.clientWidth,
      maxScrollLeft,
      isToday: renderedDate === getTodayDateInKST(),
      currentMinute: getCurrentMinuteOfDayInKST(),
    });

    state.mapCalendarCurrentTimeScrollDate = renderedDate;

    if (scrollLeft === null) {
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

    const gridWrap = overlay.querySelector(".zzk-map-calendar-grid-wrap");
    if (!(gridWrap instanceof HTMLElement)) {
      return null;
    }

    const wrapLeft = gridWrap.getBoundingClientRect().left;
    const firstLeft = slotCells[0].getBoundingClientRect().left;
    const secondLeft = slotCells[1].getBoundingClientRect().left;
    const slotStride = secondLeft - firstLeft;

    if (!Number.isFinite(slotStride) || slotStride <= 0) {
      return null;
    }

    return {
      trackStartOffset: firstLeft - wrapLeft,
      slotStride,
    };
  }

  function applyMapCalendarOverlayOffset(
    overlay = document.getElementById(MAP_CALENDAR_OVERLAY_ID),
  ) {
    if (!(overlay instanceof HTMLElement)) {
      return;
    }

    const offset = normalizeElementOffset(
      overlay,
      state.mapCalendarOffset || { x: 0, y: 0 },
    );
    state.mapCalendarOffset = offset;
    overlay.style.transform = `translate(${offset.x}px, ${offset.y}px)`;
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

  function bindDraggableHeader({
    header,
    element,
    getOffset,
    setOffset,
    applyOffset,
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

  function isValidDragStartTarget(target) {
    if (!(target instanceof Element)) {
      return false;
    }

    return !target.closest(
      "button, input, select, textarea, a, label, [role='button'], [contenteditable='true']",
    );
  }

  function startElementDrag(
    event,
    { element, getOffset, setOffset, applyOffset },
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

  function clampOffsetWithinViewport({
    startRect,
    baseOffset,
    deltaX,
    deltaY,
  }) {
    const margin = 8;
    const maxLeft = Math.max(
      margin,
      window.innerWidth - startRect.width - margin,
    );
    const minTop = Math.max(margin, DRAG_SAFE_TOP);
    const maxTop = Math.max(
      minTop,
      window.innerHeight - startRect.height - margin,
    );

    const desiredLeft = startRect.left + deltaX;
    const desiredTop = startRect.top + deltaY;

    const clampedLeft = Math.min(maxLeft, Math.max(margin, desiredLeft));
    const clampedTop = Math.min(maxTop, Math.max(minTop, desiredTop));

    return {
      x: baseOffset.x + (clampedLeft - startRect.left),
      y: baseOffset.y + (clampedTop - startRect.top),
    };
  }

  function applyMapHighlights(rooms) {
    clearMapHighlights();

    const roomById = new Map(
      rooms
        .filter((room) => Number.isInteger(room.id))
        .map((room) => [room.id, room]),
    );

    if (!state.highlightEnabled || roomById.size === 0) {
      return;
    }

    const groups = document.querySelectorAll("svg g[data-testid]");
    groups.forEach((group) => {
      const id = Number(group.getAttribute("data-testid"));
      const room = roomById.get(id);
      if (!room) {
        return;
      }

      const rect = group.querySelector("rect");
      if (!(rect instanceof SVGElement)) {
        return;
      }

      rememberOriginalRect(rect);

      const fillColor = room.isAvailable ? "#22c55e" : "#ef4444";
      const strokeColor = room.isAvailable ? "#166534" : "#991b1b";
      const textColor = room.isAvailable ? "#064e3b" : "#7f1d1d";

      rect.setAttribute("fill", fillColor);
      rect.setAttribute("opacity", "0.82");
      rect.setAttribute("stroke", strokeColor);
      rect.setAttribute("stroke-width", "2.5");

      const text = group.querySelector("text");
      if (text instanceof SVGElement) {
        rememberOriginalText(text);
        text.setAttribute("fill", textColor);
        text.setAttribute("font-weight", "700");
      }

      group.setAttribute(
        "data-zzk-status",
        room.isAvailable ? "available" : "occupied",
      );
      state.highlightedRects.add(rect);
    });
  }

  function clearMapHighlights() {
    state.highlightedRects.forEach((rect) => {
      restoreRect(rect);
      const group = rect.parentElement;
      if (group) {
        group.removeAttribute("data-zzk-status");
      }

      const text = group?.querySelector("text");
      if (text instanceof SVGElement) {
        restoreText(text);
      }
    });

    state.highlightedRects.clear();
  }

  function rememberOriginalRect(rect) {
    if (rect.dataset.zzkOrigFill === undefined) {
      rect.dataset.zzkOrigFill = rect.getAttribute("fill") || "";
    }
    if (rect.dataset.zzkOrigOpacity === undefined) {
      rect.dataset.zzkOrigOpacity = rect.getAttribute("opacity") || "";
    }
    if (rect.dataset.zzkOrigStroke === undefined) {
      rect.dataset.zzkOrigStroke = rect.getAttribute("stroke") || "";
    }
    if (rect.dataset.zzkOrigStrokeWidth === undefined) {
      rect.dataset.zzkOrigStrokeWidth = rect.getAttribute("stroke-width") || "";
    }
  }

  function restoreRect(rect) {
    setAttrOrRemove(rect, "fill", rect.dataset.zzkOrigFill || "");
    setAttrOrRemove(rect, "opacity", rect.dataset.zzkOrigOpacity || "");
    setAttrOrRemove(rect, "stroke", rect.dataset.zzkOrigStroke || "");
    setAttrOrRemove(
      rect,
      "stroke-width",
      rect.dataset.zzkOrigStrokeWidth || "",
    );
  }

  function rememberOriginalText(text) {
    if (text.dataset.zzkOrigFill === undefined) {
      text.dataset.zzkOrigFill = text.getAttribute("fill") || "";
    }
    if (text.dataset.zzkOrigWeight === undefined) {
      text.dataset.zzkOrigWeight = text.getAttribute("font-weight") || "";
    }
  }

  function restoreText(text) {
    setAttrOrRemove(text, "fill", text.dataset.zzkOrigFill || "");
    setAttrOrRemove(text, "font-weight", text.dataset.zzkOrigWeight || "");
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

    const {
      dateInput,
      datePrevButton,
      dateNextButton,
      dateTodayButton,
      dateWeekdayLabel,
    } = state.elements;
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
    const normalizedDate = clampDateToMin(
      normalizeDateString(dateInput.value),
      minimumDate,
    );
    if (dateInput.value !== normalizedDate) {
      dateInput.value = normalizedDate;
    }

    datePrevButton.disabled = Boolean(minimumDate) && normalizedDate <= minimumDate;
    dateTodayButton.disabled = normalizedDate === todayDate;

    const prevDate = addDaysToDateString(normalizedDate, -1);
    const nextDate = addDaysToDateString(normalizedDate, 1);
    const prevLabel = isDateString(prevDate)
      ? `이전일 (${prevDate})`
      : "이전일";
    const nextLabel = isDateString(nextDate)
      ? `다음일 (${nextDate})`
      : "다음일";
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

    const currentPanelDate = normalizeDateString(
      state.elements.dateInput.value,
    );
    const currentActiveDate = normalizeDateString(
      state.activeScheduleDate || "",
    );
    if (
      currentPanelDate === normalizedDate &&
      currentActiveDate === normalizedDate
    ) {
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

    const baseDate =
      normalizeDateInput(state.elements.dateInput) || getTodayDateInKST();
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
    const cached = getFreshScheduleCacheForTab(
      requestedDate,
      requestedTab,
      requestedSharingMapId,
    );
    if (cached) {
      setScheduleLoadingDate(requestedDate, false, requestedTab);
      renderMapCalendarOverlay(cached);
      return;
    }

    const scopeKey = buildScheduleScopeKey(
      requestedDate,
      requestedTab,
      requestedSharingMapId,
    );
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
    const mappedFloor =
      MAP_CALENDAR_ROOM_FLOOR_BY_NAME.get(normalizeTargetRoomName(roomName)) ||
      "";
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

  async function syncHostReservationForm(
    payload,
    requestId = state.timelineSelectionRequestId,
  ) {
    return radarFormSync.syncHostReservationForm(payload, requestId);
  }

  function getHostReservationRoot() {
    const dateInputs = Array.from(
      document.querySelectorAll("input[name='date'], input[type='date']"),
    ).filter(
      (candidate) =>
        candidate instanceof HTMLInputElement &&
        isHostScannableInput(candidate),
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
      if (
        rootCandidate.querySelector(
          "select[name='spaceId'], select[name='roomId']",
        )
      ) {
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
        if (
          descriptor.includes("시작시간") ||
          descriptor.includes("종료시간")
        ) {
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
      const globalButtons = Array.from(
        document.querySelectorAll("button"),
      ).filter((candidate) => candidate instanceof HTMLButtonElement);
      return pickBestButton(globalButtons);
    }

    return null;
  }

  function isHostRoomSelectionSynced(roomId, roomName, root = document) {
    const scopedRoomSelect = root.querySelector(
      "select[name='spaceId'], select[name='roomId']",
    );
    const roomSelect =
      scopedRoomSelect instanceof HTMLSelectElement
        ? scopedRoomSelect
        : document.querySelector(
            "select[name='spaceId'], select[name='roomId']",
          );

    if (roomSelect instanceof HTMLSelectElement) {
      const selectedOption =
        roomSelect.selectedIndex >= 0
          ? roomSelect.options[roomSelect.selectedIndex]
          : null;
      if (!(selectedOption instanceof HTMLOptionElement)) {
        return false;
      }

      const selectedValue = (selectedOption.value || "").trim();
      const selectedName = normalizeTextForMatch(
        selectedOption.textContent || "",
      );
      const expectedName = normalizeTextForMatch(roomName || "");
      return (
        selectedValue === String(roomId) ||
        (selectedName !== "" &&
          expectedName !== "" &&
          selectedName.includes(expectedName))
      );
    }

    const roomDropdownButton = findHostRoomDropdownButton(root);
    if (roomDropdownButton instanceof HTMLButtonElement) {
      const selectedName = normalizeTextForMatch(
        roomDropdownButton.textContent || "",
      );
      const expectedName = normalizeTextForMatch(roomName || "");
      if (selectedName && expectedName) {
        return selectedName.includes(expectedName);
      }
      return false;
    }

    return false;
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
      startInput instanceof HTMLInputElement
        ? normalizeHourMinute(startInput.value)
        : null;
    let endValue =
      endInput instanceof HTMLInputElement
        ? normalizeHourMinute(endInput.value)
        : null;
    let hasAnyControl =
      startInput instanceof HTMLInputElement ||
      endInput instanceof HTMLInputElement;

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
        findHostTimePickerButton("시작시간", root) ||
        findHostTimePickerButton("시작", root);
      if (startButton instanceof HTMLButtonElement) {
        hasAnyControl = true;
      }
      startValue = readTimeValueFromElement(startButton);
    }

    if (endValue == null) {
      const endButton =
        findHostTimePickerButton("종료시간", root) ||
        findHostTimePickerButton("종료", root);
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

  function findHostEditSubmitButton(root = document) {
    return findHostReservationActionButton(root, {
      expectedLabels: ["예약수정하기", "수정하기", "예약하기"],
      expectedIds: ["formupdatesubmit", "formreservesubmit"],
    });
  }

  function findHostBookingSubmitButton(root = document) {
    return findHostReservationActionButton(root, {
      expectedLabels: ["예약하기"],
      expectedIds: ["formreservesubmit"],
    });
  }

  function findHostReservationActionButton(root = document, options = {}) {
    const expectedLabels = Array.isArray(options.expectedLabels)
      ? options.expectedLabels
      : [];
    const expectedIds = Array.isArray(options.expectedIds) ? options.expectedIds : [];
    const buttonCandidates = [
      ...Array.from(root.querySelectorAll('button')),
      ...Array.from(root.querySelectorAll('input[type="submit"], input[type="button"]')),
    ].filter((element) => element instanceof HTMLElement && isElementVisible(element));

    return buttonCandidates.find((element) => {
      const textLike =
        element instanceof HTMLInputElement
          ? [element.value || '', element.getAttribute('aria-label') || '', element.id || ''].join(' ')
          : [element.textContent || '', element.getAttribute('aria-label') || '', element.id || ''].join(' ');
      const normalized = normalizeTextForMatch(textLike);
      return (
        expectedLabels.some((label) => normalized.includes(label)) ||
        expectedIds.some((idValue) => normalized.includes(idValue))
      );
    }) || null;
  }

  async function waitForHostReservationReady(
    timeoutMs = 1200,
    requireTimeControls = false,
  ) {
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

    return resolved instanceof HTMLElement || resolved === document
      ? resolved
      : null;
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
    const isStartQuery = keywords.some((keyword) => keyword === "start" || keyword === "starttime" || keyword === "begin" || keyword === "시작");
    const isEndQuery = keywords.some((keyword) => keyword === "end" || keyword === "endtime" || keyword === "finish" || keyword === "종료");
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

  function queryHostTimeInput(
    nameKeywords,
    root = document,
    excludedInput = null,
  ) {
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

    if (
      startInput instanceof HTMLInputElement &&
      endInput instanceof HTMLInputElement
    ) {
      return {
        startInput,
        endInput,
      };
    }

    const timeTypeCandidates = candidates.filter(
      (input) => input.type === "time",
    );
    if (timeTypeCandidates.length >= 2) {
      return {
        startInput: timeTypeCandidates[0],
        endInput: timeTypeCandidates[1],
      };
    }

    return null;
  }

  function setFormElementValue(element, value) {
    if (
      !(
        element instanceof HTMLInputElement ||
        element instanceof HTMLSelectElement
      )
    ) {
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
    if (
      !(
        element instanceof HTMLInputElement ||
        element instanceof HTMLSelectElement
      )
    ) {
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
    if (
      !(
        element instanceof HTMLInputElement ||
        element instanceof HTMLSelectElement
      )
    ) {
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
      const globalButtons = Array.from(
        document.querySelectorAll("button"),
      ).filter((candidate) => candidate instanceof HTMLButtonElement);
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
        button instanceof HTMLButtonElement &&
        button.getAttribute("aria-expanded") === "true",
    );

    if (expandedPickerButton) {
      return true;
    }

    const radioCandidates = Array.from(
      document.querySelectorAll("input[type='radio']"),
    );
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

      const labelText = normalizePickerCellText(
        candidate.getAttribute("aria-label") || "",
      );
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

    const cells = Array.from(
      document.querySelectorAll("label, span, button, div, li"),
    );

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
      findHostTimePickerButton("시작시간", root) ||
      findHostTimePickerButton("시작", root);
    const endButton =
      findHostTimePickerButton("종료시간", root) ||
      findHostTimePickerButton("종료", root);

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
      document.dispatchEvent(
        new KeyboardEvent("keydown", { key: "Escape", bubbles: true }),
      );
      document.dispatchEvent(
        new KeyboardEvent("keyup", { key: "Escape", bubbles: true }),
      );
      window.dispatchEvent(
        new KeyboardEvent("keydown", { key: "Escape", bubbles: true }),
      );
      window.dispatchEvent(
        new KeyboardEvent("keyup", { key: "Escape", bubbles: true }),
      );
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

    await waitForElement(
      () => (!hasVisibleHostTimePickerCells() ? true : null),
      260,
      40,
    );
  }

  function inspectHostTimePickerState(root = document) {
    const startButton =
      findHostTimePickerButton("시작시간", root) ||
      findHostTimePickerButton("시작", root);
    const endButton =
      findHostTimePickerButton("종료시간", root) ||
      findHostTimePickerButton("종료", root);

    let isOpen = false;
    let activeButton = null;

    if (
      startButton instanceof HTMLButtonElement &&
      endButton instanceof HTMLButtonElement
    ) {
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

  async function setHostTimeByPicker(
    buttonLabelOrLabels,
    timeValue,
    root = document,
  ) {
    const labels = Array.isArray(buttonLabelOrLabels)
      ? buttonLabelOrLabels
      : [buttonLabelOrLabels];
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
      const segmentedApplied = await setHostTimeBySegmentedPicker(
        button,
        normalizedTargetTime,
      );
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

    const segmentedApplied = await setHostTimeBySegmentedPicker(
      button,
      normalizedTargetTime,
    );
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
      const cell = await waitForElement(
        () => findVisiblePickerCell(label, triggerButton),
        600,
        40,
      );
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
    const currentMinuteOfDay = currentTime
      ? parseHourMinute(currentTime)
      : null;
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

    const candidates = Array.from(
      document.querySelectorAll("label, span, button, div, li"),
    );
    const triggerRect =
      triggerButton instanceof HTMLElement
        ? triggerButton.getBoundingClientRect()
        : null;

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
      triggerButton instanceof HTMLElement
        ? triggerButton.getBoundingClientRect()
        : null;

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

      const normalizedText = normalizePickerCellText(
        candidate.textContent || "",
      );
      if (
        normalizedText.length > 30 &&
        !candidate.matches("[role='option'], [role='menuitem'], button")
      ) {
        return;
      }

      const dataValueTime = normalizeHourMinute(
        candidate.getAttribute("data-value") || "",
      );
      const textTime = normalizeHourMinute(candidate.textContent || "");
      const ariaLabelTime = normalizeHourMinute(
        candidate.getAttribute("aria-label") || "",
      );
      const matchedTime = dataValueTime || textTime;
      if (matchedTime !== normalizedTime && ariaLabelTime !== normalizedTime) {
        return;
      }

      let score = 10;
      const role = candidate.getAttribute("role") || "";
      if (role === "option" || role === "menuitem") {
        score += 6;
      }

      if (
        candidate.closest("[role='listbox'], [role='menu'], [role='dialog']")
      ) {
        score += 4;
      }

      if (triggerRect) {
        const candidateRect = candidate.getBoundingClientRect();
        const verticalDistance = Math.abs(
          candidateRect.top - triggerRect.bottom,
        );
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
      triggerButton instanceof HTMLElement
        ? triggerButton.getBoundingClientRect()
        : null;

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

      const popupContainer = candidate.closest(
        "[role='listbox'], [role='menu'], [role='dialog']",
      );
      const hasPopupContext = popupContainer instanceof HTMLElement;

      const valueToken = (
        candidate.getAttribute("value") ||
        candidate.getAttribute("data-value") ||
        ""
      ).trim();
      const idMatched = valueToken !== "" && valueToken === String(roomId);
      const nameMatched =
        normalizedRoomName !== "" && text.includes(normalizedRoomName);

      if (!idMatched && !nameMatched) {
        return;
      }

      if (
        !idMatched &&
        !hasPopupContext &&
        candidate.getAttribute("role") !== "option"
      ) {
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

    const scopedRoomSelect = root.querySelector(
      "select[name='spaceId'], select[name='roomId']",
    );
    const roomSelect =
      scopedRoomSelect instanceof HTMLSelectElement
        ? scopedRoomSelect
        : document.querySelector(
            "select[name='spaceId'], select[name='roomId']",
          );
    if (roomSelect instanceof HTMLSelectElement) {
      const option = Array.from(roomSelect.options).find(
        (candidate) =>
          candidate.value === String(roomId) ||
          candidate.textContent?.trim() === roomName,
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

      const currentName = normalizeTextForMatch(
        roomDropdownButton.textContent || "",
      );
      const targetName = normalizeTextForMatch(roomName || "");
      if (currentName && targetName && currentName === targetName) {
        return true;
      }

      if (roomDropdownButton.getAttribute("aria-expanded") !== "true") {
        triggerHostButtonInteraction(roomDropdownButton);
        await waitForTimeout(80);
      }

      let roomOption = findVisibleHostRoomOption(
        roomId,
        roomName,
        roomDropdownButton,
      );
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
          () =>
            isHostRoomSelectionSynced(roomId, roomName, root) ? true : null,
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

  function scheduleHighlightRefresh() {
    clearTimeout(state.autoRefreshTimer);
    state.autoRefreshTimer = setTimeout(() => {
      applyMapHighlights(state.latestRooms);
    }, 180);
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
    if (!isGuestPage()) {
      resetEditReservationBaselineConstraint();
      restorePageReservationNetworkHook();
      teardownGuestUi({
        preserveReservationContext: isGuestReservationFlowPage(),
      });
      return;
    }

    if (!isGuestReservationEditPage()) {
      resetEditReservationBaselineConstraint();
    }

    state.lastGuestRouteChangeAt = Date.now();
    const previousPathname = state.lastObservedPathname;
    state.lastObservedPathname = location.pathname;

    if (tryRecoverBlankGuestPage()) {
      return;
    }

    if (shouldInstallPageReservationNetworkHook()) {
      installPageReservationNetworkHook();
    }

    clearBlankGuestRecoveryIfPageReady();

    syncMapCalendarAlwaysOpenPreference();
    if (!isGuestUiReadyForActivation()) {
      removeMapCalendarLauncher();
      removeMapCalendarOverlay();
      state.mapCalendarVisible = false;
      state.lastAutoOpenPath = null;
      return;
    }
    const elapsedSinceEditAction = Date.now() - (state.lastReservationActionAt || 0);
    if (
      typeof previousPathname === 'string' &&
      /^\/guest\/[^/?#]+\/reservation\/edit\/?$/.test(previousPathname) &&
      !isGuestReservationEditPage() &&
      Number.isFinite(elapsedSinceEditAction) &&
      elapsedSinceEditAction >= 0 &&
      elapsedSinceEditAction <= 20000
    ) {
      const pendingEditSubmitState = readPendingEditSubmitState();
      const persistedContext =
        pendingEditSubmitState &&
        pendingEditSubmitState.context &&
        typeof pendingEditSubmitState.context === 'object'
          ? { ...pendingEditSubmitState.context }
          : null;
      const pendingContext =
        persistedContext ||
        (state.lastReservationContext && typeof state.lastReservationContext === 'object'
          ? { ...state.lastReservationContext }
          : null);
      if (pendingContext) {
        pendingContext.mutationMethod = 'PUT';
        queuePendingSlackCopyModal(pendingContext, { requireNonEditPage: false });
        state.lastReservationContext = null;
        clearPendingEditSubmitState();
      }
    }
    queueSlackModalFromPersistedEditSubmitIfNeeded('location-change');
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
    const preserveReservationContext =
      options?.preserveReservationContext === true;
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
    clearMapHighlights();
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

  function installPageReservationNetworkHook() {
    if (state.reservationHookInstalled || state.reservationHookInstalling) {
      return;
    }

    if (!(document.documentElement instanceof HTMLElement)) {
      return;
    }

    const existing = document.getElementById(PAGE_RESERVATION_HOOK_SCRIPT_ID);
    if (existing instanceof HTMLScriptElement) {
      return;
    }

    if (
      typeof chrome === "undefined" ||
      !chrome.runtime ||
      typeof chrome.runtime.getURL !== "function"
    ) {
      return;
    }

    state.reservationHookInstalling = true;
    const installGeneration = state.reservationHookInstallGeneration;

    const mountTarget =
      document.head instanceof HTMLElement
        ? document.head
        : document.documentElement;

    const injectScript = (scriptPath, scriptId = "") =>
      new Promise((resolve, reject) => {
        const script = document.createElement("script");
        if (scriptId) {
          script.id = scriptId;
        }
        script.src = chrome.runtime.getURL(scriptPath);
        script.async = false;
        script.dataset.zzkInjected = "true";
        script.addEventListener(
          "load",
          () => {
            script.remove();
            resolve();
          },
          { once: true },
        );
        script.addEventListener(
          "error",
          () => {
            script.remove();
            reject(new Error(`Failed to load ${scriptPath}`));
          },
          { once: true },
        );
        mountTarget.appendChild(script);
      });

    injectScript("src/page-hook/shared.js")
      .then(() => {
        if (
          installGeneration !== state.reservationHookInstallGeneration ||
          !shouldInstallPageReservationNetworkHook()
        ) {
          return false;
        }

        return injectScript("src/page-network-hook.js", PAGE_RESERVATION_HOOK_SCRIPT_ID)
          .then(() => true);
      })
      .then((hookLoaded) => {
        if (hookLoaded !== true) {
          if (installGeneration === state.reservationHookInstallGeneration) {
            state.reservationHookInstalling = false;
          }
          return;
        }

        state.reservationHookInstalling = false;
        state.reservationHookInstalled = true;
        if (
          installGeneration !== state.reservationHookInstallGeneration ||
          !shouldInstallPageReservationNetworkHook()
        ) {
          restorePageReservationNetworkHook();
        }
      })
      .catch(() => {
        if (installGeneration === state.reservationHookInstallGeneration) {
          state.reservationHookInstalling = false;
          state.reservationHookInstalled = false;
        }
      });
  }

  function restorePageReservationNetworkHook() {
    state.reservationHookInstallGeneration += 1;
    const shouldAttemptRestore =
      state.reservationHookInstalled ||
      state.reservationHookInstalling ||
      window.__zzkReservationHookLoaded === true;
    state.reservationHookInstalling = false;
    state.reservationHookInstalled = false;

    if (!shouldAttemptRestore) {
      return;
    }

    if (typeof window.__zzkReservationHookRestore === "function") {
      try {
        window.__zzkReservationHookRestore();
        return;
      } catch (error) {
        debugLog("Failed to restore page reservation hook directly", getErrorMessage(error));
      }
    }

    if (!(document.documentElement instanceof HTMLElement)) {
      return;
    }

    if (
      typeof chrome === "undefined" ||
      !chrome.runtime ||
      typeof chrome.runtime.getURL !== "function"
    ) {
      return;
    }

    const restoreScriptId = `${PAGE_RESERVATION_HOOK_SCRIPT_ID}-restore`;
    if (document.getElementById(restoreScriptId)) {
      return;
    }

    const mountTarget =
      document.head instanceof HTMLElement
        ? document.head
        : document.documentElement;
    const script = document.createElement("script");
    script.id = restoreScriptId;
    script.src = chrome.runtime.getURL("src/page-network-restore.js");
    script.async = false;
    script.dataset.zzkInjected = "true";
    script.addEventListener("load", () => script.remove(), { once: true });
    script.addEventListener("error", () => script.remove(), { once: true });
    mountTarget.appendChild(script);
  }

  function shouldInstallPageReservationNetworkHook() {
    return isGuestPage();
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

    document.addEventListener(
      "pointerdown",
      handleHostTimePickerManualInteraction,
      true,
    );
    document.addEventListener(
      "focusin",
      handleHostTimePickerManualInteraction,
      true,
    );
    state.hostTimePickerInteractionWatcherInstalled = true;
  }

  function handleHostTimePickerManualInteraction(event) {
    if (!isGuestReservationEditPage()) {
      return;
    }

    if (event.isTrusted !== true) {
      return;
    }

    const target = event.target;
    if (!(target instanceof Element) || isInsideExtensionSurface(target)) {
      return;
    }

    const control = target.closest("input, button, [role='button']");
    if (
      !(control instanceof HTMLElement) ||
      isInsideExtensionSurface(control)
    ) {
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
    if (!isGuestPage()) {
      return;
    }

    const target = event.target;
    if (!(target instanceof HTMLElement) || isInsideExtensionSurface(target)) {
      return;
    }

    if (
      !(
        target instanceof HTMLInputElement ||
        target instanceof HTMLTextAreaElement ||
        target instanceof HTMLSelectElement ||
        target instanceof HTMLButtonElement
      )
    ) {
      return;
    }

    if (!isPotentialReservationOwnerElement(target)) {
      return;
    }

    rememberReservationOwnerName(readHostFieldDisplayValue(target));
  }

  function handleReservationIntentClick(event) {
    if (!isGuestPage()) {
      return;
    }

    const target = event.target;
    if (!(target instanceof Element) || isInsideExtensionSurface(target)) {
      return;
    }

    const actionTarget = target.closest(
      "button, [role='button'], input[type='submit']",
    );
    if (!(actionTarget instanceof HTMLElement)) {
      return;
    }

    const normalizedLabel = normalizeTextForMatch(
      readActionTargetText(actionTarget),
    );
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
    if (!isGuestPage()) {
      return;
    }

    const form = event.target;
    if (!(form instanceof HTMLFormElement) || isInsideExtensionSurface(form)) {
      return;
    }

    const normalizedFormText = normalizeTextForMatch(form.textContent || "");
    const hasReservationFieldSet =
      form.querySelector("input[name='date'], input[type='date']") instanceof
        HTMLInputElement &&
      (form.querySelector("input[type='time']") instanceof HTMLInputElement ||
        form.querySelector(
          "button[aria-label*='시작'], button[aria-label*='종료']",
        ) instanceof HTMLButtonElement ||
        form.querySelector(
          "select[name='spaceId'], select[name='roomId']",
        ) instanceof HTMLSelectElement);
    if (!normalizedFormText.includes("예약") && !hasReservationFieldSet) {
      return;
    }

    markReservationActionIntent({ root: form });
  }

  function isReservationIntentActionLabel(normalizedLabel) {
    if (!normalizedLabel) {
      return false;
    }

    if (
      normalizedLabel.includes("예약하기") ||
      normalizedLabel.includes("예약수정")
    ) {
      return true;
    }

    if (isGuestReservationEditPage()) {
      return (
        normalizedLabel.includes("수정") ||
        normalizedLabel.includes("변경") ||
        normalizedLabel.includes("저장")
      );
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
      state.lastReservationContext &&
      typeof state.lastReservationContext === "object"
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
      contextSnapshot && typeof contextSnapshot === "object"
        ? contextSnapshot
        : null;
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
      document.documentElement.dataset.zzkReservationAttemptAt = String(state.lastReservationActionAt);
    }

    if (isGuestReservationEditPage()) {
      persistPendingEditSubmitState(state.lastReservationContext);
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
      ([, leftAttempt], [, rightAttempt]) => Number(leftAttempt?.at || 0) - Number(rightAttempt?.at || 0),
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
      payload && typeof payload === "object" && payload.requestContext && typeof payload.requestContext === "object"
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
    const attemptContext = attempt && attempt.context && typeof attempt.context === "object"
      ? attempt.context
      : null;
    if (!attemptContext || !payloadContext) {
      return false;
    }

    return (
      normalizeReservationContextComparableValue(attemptContext.date) === normalizeReservationContextComparableValue(payloadContext.date) &&
      normalizeReservationContextComparableValue(attemptContext.startTime) === normalizeReservationContextComparableValue(payloadContext.startTime) &&
      normalizeReservationContextComparableValue(attemptContext.endTime) === normalizeReservationContextComparableValue(payloadContext.endTime) &&
      normalizeReservationRoomComparableValue(attemptContext.roomName) === normalizeReservationRoomComparableValue(payloadContext.roomName)
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

  function persistPendingEditSubmitState(contextSnapshot = null) {
    const sharingMapId = getSharingMapId();
    if (!sharingMapId) {
      return;
    }

    try {
      window.sessionStorage.setItem(
        PENDING_EDIT_SUBMIT_STORAGE_KEY,
        JSON.stringify({
          sharingMapId,
          at: Date.now(),
          context:
            contextSnapshot && typeof contextSnapshot === 'object'
              ? contextSnapshot
              : null,
        }),
      );
    } catch (error) {
      reportSessionStorageFailure("write-failed", PENDING_EDIT_SUBMIT_STORAGE_KEY, error);
      return;
    }
  }

  function readPendingEditSubmitState() {
    try {
      const rawValue = window.sessionStorage.getItem(PENDING_EDIT_SUBMIT_STORAGE_KEY);
      if (!rawValue) {
        return null;
      }
      const parsed = JSON.parse(rawValue);
      if (!parsed || typeof parsed !== 'object') {
        return null;
      }
      return parsed;
    } catch (error) {
      reportSessionStorageFailure("read-failed", PENDING_EDIT_SUBMIT_STORAGE_KEY, error);
      return null;
    }
  }

  function clearPendingEditSubmitState() {
    try {
      window.sessionStorage.removeItem(PENDING_EDIT_SUBMIT_STORAGE_KEY);
    } catch (error) {
      reportSessionStorageFailure("remove-failed", PENDING_EDIT_SUBMIT_STORAGE_KEY, error);
      return;
    }
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

  function tryRecoverBlankGuestPage() {
    return slackSuccessFlow.tryRecoverBlankGuestPage();
  }

  function clearBlankGuestRecoveryIfPageReady() {
    return slackSuccessFlow.clearBlankGuestRecoveryIfPageReady();
  }

  function queueSlackModalFromPersistedEditSubmitIfNeeded(caller = '') {
    void caller;
    return slackSuccessFlow.queueSlackModalFromPersistedEditSubmitIfNeeded();
  }

  function normalizeReservationMutationMethod(methodValue) {
    const method = String(methodValue || "").toUpperCase();
    return method === "POST" ||
      method === "PUT" ||
      method === "PATCH" ||
      method === "DELETE"
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
    const requestUrl = parseUrlSafely(
      typeof payload?.url === "string" ? payload.url : "",
    );
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
      options?.successPageContext &&
      typeof options.successPageContext === "object"
        ? options.successPageContext
        : null;
    const payloadOwnerName = normalizeHostReservationOwnerCandidate(
      options?.payloadOwnerName || "",
    );

    const safeLiveContext = { ...liveContext };
    const sources = [
      payloadContext,
      successPageContext,
      snapshotContext,
      safeLiveContext,
    ].filter((source) => source && typeof source === "object");

    const pickField = (fieldName, extraCandidates = []) => {
      const candidates = [
        ...sources.map((source) => source[fieldName]),
        ...extraCandidates,
      ];
      for (const candidate of candidates) {
        const normalizedCandidate = normalizeReservationContextField(
          fieldName,
          candidate,
        );
        if (
          isMeaningfulReservationContextField(fieldName, normalizedCandidate)
        ) {
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
        pickField("ownerName", [
          payloadOwnerName,
          state.lastKnownReservationOwnerName,
        ]) ||
        normalizeHostReservationOwnerCandidate(
          state.lastKnownReservationOwnerName || "",
        ) ||
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
      reservationLink: resolveReservationLinkFromContext(
        pickField("reservationLink"),
      ),
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

    const startParts = extractDateTimeParts(
      source.startDateTime || source.startTime || "",
    );
    const endParts = extractDateTimeParts(
      source.endDateTime || source.endTime || "",
    );
    const explicitDate = normalizeDateString(
      source.date || source.reservationDate || source.startDate || "",
    );
    const context = {
      date: explicitDate || startParts.date || endParts.date || "",
      startTime:
        startParts.time || normalizeHourMinute(source.startTime || "") || "",
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
      source.roomId ||
        source.spaceId ||
        source.targetRoomId ||
        source.room_id ||
        source.space_id,
    );
    const knownRooms = getLatestKnownRooms();
    if (!Number.isInteger(roomId) || knownRooms.length === 0) {
      return "";
    }

    const matchedRoom = knownRooms.find(
      (room) => Number(room?.id) === roomId,
    );
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

  function readSuccessPageReservationContext() {
    if (!isGuestSuccessPage() || !(document.body instanceof HTMLBodyElement)) {
      return null;
    }

    const pageText = document.body.innerText || "";
    if (!pageText) {
      return null;
    }

    const roomNameRaw = readLabeledValueFromText(pageText, [
      "공간이름",
      "회의실명",
    ]);
    const ownerNameRaw = readLabeledValueFromText(pageText, [
      "예약자명",
      "신청자명",
      "예약자",
    ]);
    const descriptionRaw = readLabeledValueFromText(pageText, [
      "사용목적",
      "이용목적",
      "예약내용",
      "내용",
    ]);
    const reservationDateTimeRaw = readLabeledValueFromText(pageText, [
      "예약일시",
    ]);
    const dateParts = extractDateTimeParts(reservationDateTimeRaw || "");
    const timeRangeMatch = normalizeSlackFieldText(
      reservationDateTimeRaw || "",
    ).match(/(\d{1,2}:\d{2})\s*[-~]\s*(\d{1,2}:\d{2})/);

    const context = {
      roomName: normalizeReservationContextField("roomName", roomNameRaw),
      ownerName: normalizeReservationContextField("ownerName", ownerNameRaw),
      description: normalizeReservationContextField(
        "description",
        descriptionRaw,
      ),
      date: dateParts.date || "",
      startTime: timeRangeMatch
        ? normalizeHourMinute(timeRangeMatch[1]) || ""
        : dateParts.time || "",
      endTime: timeRangeMatch
        ? normalizeHourMinute(timeRangeMatch[2]) || ""
        : "",
      reservationLink: resolveReservationLinkFromContext(location.href),
    };

    const hasAnyField = Object.entries(context).some(([fieldName, value]) => {
      const normalizedValue = normalizeReservationContextField(
        fieldName,
        value,
      );
      return isMeaningfulReservationContextField(fieldName, normalizedValue);
    });

    return hasAnyField ? context : null;
  }

  function readLabeledValueFromText(text, labels) {
    if (typeof text !== "string" || !Array.isArray(labels)) {
      return "";
    }

    for (const label of labels) {
      const escapedLabel = escapeRegex(label);
      const pattern = new RegExp(`${escapedLabel}\\s*[:：]?\\s*([^\\n]+)`);
      const match = text.match(pattern);
      if (!match) {
        continue;
      }

      const value = normalizeSlackFieldText(match[1] || "");
      if (value) {
        return value;
      }
    }

    return "";
  }

  function escapeRegex(value) {
    return String(value || "").replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
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

    if (
      ["-", "--", "내용", "예약내용", "사용목적", "이용목적"].includes(
        normalized,
      )
    ) {
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
    const normalized = normalizeSlackFieldText(
      typeof value === "string" ? value : "",
    );
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
    return (
      typeof pathname === "string" &&
      /^\/guest\/[^/?#]+\/success\/?$/.test(pathname)
    );
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
      const normalizedCandidate =
        normalizeHostReservationOwnerCandidate(candidate);
      if (normalizedCandidate) {
        return normalizedCandidate;
      }
    }

    return "";
  }

  function isMeaningfulSlackContextValue(value) {
    const normalized = normalizeSlackFieldText(
      typeof value === "string" ? value : "",
    );
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
      normalizeDateString(
        hostDateInput instanceof HTMLInputElement ? hostDateInput.value : "",
      ) ||
      normalizeDateString(
        panelDateInput instanceof HTMLInputElement ? panelDateInput.value : "",
      ) ||
      "-";

    const startTime =
      normalizeHourMinute(
        observedTimes.startTime ||
          (panelStartInput instanceof HTMLInputElement
            ? panelStartInput.value
            : ""),
      ) || "--:--";
    const endTime =
      normalizeHourMinute(
        observedTimes.endTime ||
          (panelEndInput instanceof HTMLInputElement
            ? panelEndInput.value
            : ""),
      ) || "--:--";

    const roomName = readHostRoomName(root) || "-";
    const resolvedOwnerName =
      readHostReservationOwnerName(root) ||
      normalizeHostReservationOwnerCandidate(
        state.lastKnownReservationOwnerName || "",
      );
    const ownerName = resolvedOwnerName || "-";
    const usagePurpose = readHostReservationFieldValue(root, [
      "사용목적",
      "이용목적",
      "purpose",
      "목적",
    ]);
    const description =
      usagePurpose ||
      readHostReservationFieldValue(root, [
        "예약내용",
        "description",
        "메모",
        "내용",
      ]) ||
      "-";
    const defaultMutationMethod = isGuestReservationEditPage() ? "PUT" : "POST";

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
    const scopedSelect = root.querySelector(
      "select[name='spaceId'], select[name='roomId']",
    );
    const roomSelect =
      scopedSelect instanceof HTMLSelectElement
        ? scopedSelect
        : document.querySelector(
            "select[name='spaceId'], select[name='roomId']",
          );

    if (
      roomSelect instanceof HTMLSelectElement &&
      roomSelect.selectedIndex >= 0
    ) {
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
      const buttonName = normalizeHostRoomCandidate(
        dropdownButton.textContent || "",
      );
      if (buttonName) {
        return extractKnownRoomName(buttonName);
      }
    }

    if (
      state.appliedSelection &&
      Number.isInteger(state.appliedSelection.roomId)
    ) {
      const matchedRoom = getLatestKnownRooms().find(
        (room) => room.id === state.appliedSelection.roomId,
      );
      if (
        matchedRoom &&
        typeof matchedRoom.name === "string" &&
        matchedRoom.name.trim()
      ) {
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
      (root !== document
        ? readHostReservationOwnerFromNameInputs(document)
        : "");
    if (ownerFromNameInput) {
      return (
        rememberReservationOwnerName(ownerFromNameInput) || ownerFromNameInput
      );
    }

    const ownerFromRoot =
      normalizeHostReservationOwnerCandidate(
        readHostReservationFieldValue(
          root,
          ownerSpecificKeywords,
          ownerFieldOptions,
        ),
      ) ||
      normalizeHostReservationOwnerCandidate(
        readHostReservationFieldValue(
          root,
          ownerFallbackKeywords,
          ownerFieldOptions,
        ),
      );
    if (ownerFromRoot) {
      return rememberReservationOwnerName(ownerFromRoot) || ownerFromRoot;
    }

    if (root !== document) {
      const ownerFromDocument =
        normalizeHostReservationOwnerCandidate(
          readHostReservationFieldValue(
            document,
            ownerSpecificKeywords,
            ownerFieldOptions,
          ),
        ) ||
        normalizeHostReservationOwnerCandidate(
          readHostReservationFieldValue(
            document,
            ownerFallbackKeywords,
            ownerFieldOptions,
          ),
        );
      if (ownerFromDocument) {
        return (
          rememberReservationOwnerName(ownerFromDocument) || ownerFromDocument
        );
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

    return [
      "예약자",
      "신청자",
      "booker",
      "requester",
      "owner",
      "guest",
      "name",
      "이름",
    ].some((keyword) => descriptor.includes(keyword));
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

    const candidates = Array.from(
      root.querySelectorAll("input[name='name']"),
    ).filter((input) => {
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
        candidate.value || "",
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
    const controls = Array.from(root.querySelectorAll(selector)).filter(
      (control) => {
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
        if (
          control instanceof HTMLInputElement ||
          control instanceof HTMLTextAreaElement
        ) {
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
      },
    );

    let bestValue = "";
    let bestScore = Number.NEGATIVE_INFINITY;

    controls.forEach((control) => {
      const value = includeExtendedControls
        ? readHostFieldDisplayValue(control)
        : control instanceof HTMLInputElement ||
            control instanceof HTMLTextAreaElement
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
    const normalizedChannelMention = normalizeSlackChannelToken(
      channelMention || "",
      { allowBare: true },
    );
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
      return formatRemindCommand(
        normalizedChannelMention,
        `${remindBodyPrefix} @channel`,
      );
    }

    return formatRemindCommand("me", remindBodyPrefix);
  }

  function resolveSlackRemindTimeRangeLabel(context) {
    const rawStartTime =
      typeof context?.startTime === "string" ? context.startTime : "";
    const rawEndTime =
      typeof context?.endTime === "string" ? context.endTime : "";
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
      sanitizedRoomName.replace(/^\d+\s*층\s*/u, "").trim() ||
      sanitizedRoomName;
    const floorFromMap = normalizedRoomName
      ? MAP_CALENDAR_ROOM_FLOOR_BY_NAME.get(normalizedRoomName) || ""
      : "";
    const floorFromText =
      sanitizedRoomName.match(/(\d+\s*층)/u)?.[1]?.replace(/\s+/g, "") || "";
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
    const normalizedStart =
      typeof startTime === "string" && startTime ? startTime : "--:--";
    const normalizedEnd =
      typeof endTime === "string" && endTime ? endTime : "--:--";

    if (normalizedDate) {
      return `${normalizedDate} ${normalizedStart} ~ ${normalizedDate} ${normalizedEnd}`;
    }

    return `${normalizedStart} ~ ${normalizedEnd}`;
  }

  const {
    ensureSlackCopyModalStyle,
    showSlackCopyModal,
    closeSlackCopyModal,
    copyTextToClipboard,
  } = globalThis.__zzkSlackWorkflow.createSlackWorkflow({
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

  const slackSuccessFlow = globalThis.__zzkSlackSuccessFlow.createSlackSuccessFlow({
    state,
    PAGE_RESERVATION_EVENT_TYPE,
    PENDING_SLACK_MODAL_STORAGE_KEY,
    BLANK_GUEST_RECOVERY_STORAGE_KEY,
    isGuestReservationFlowPage,
    isGuestSuccessPage,
    isGuestReservationEditPage,
    isGuestPage,
    isGuestUiReadyForActivation,
    teardownGuestUi,
    buildSlackReservationContext,
    resolveReservationContextFromPayload,
    readSuccessPageReservationContext,
    buildMergedSlackReservationContext,
    normalizeReservationMutationMethod,
    createSlackMessageFingerprint,
    shouldSkipSlackCopyModal,
    clearPendingEditSubmitState,
    showSlackCopyModal,
    getHostReservationRoot,
    queryHostDateInput,
    findHostBookingSubmitButton,
    rememberReservationOwnerName,
    resolveReservationOwnerNameFromPayload,
    isMeaningfulSlackContextValue,
    getSharingMapId,
    readPendingEditSubmitState,
    resolveReservationAttemptForPayload,
    shouldIgnoreAmbiguousReservationSuccess,
    consumeReservationAttempt,
  });

  function isGuestReservationFlowPage() {
    return /^\/guest\/[^/?#]+(?:\/reservation\/edit|\/success)?\/?$/.test(
      location.pathname,
    );
  }

  function isGuestReservationEditHostReady() {
    if (!isGuestReservationEditPage()) {
      return true;
    }

    const hostRoot = getHostReservationRoot();
    if (!(hostRoot instanceof HTMLElement)) {
      return false;
    }

    const dateInput = queryHostDateInput(hostRoot);
    if (!(dateInput instanceof HTMLInputElement)) {
      return false;
    }

    const editSubmitButton = findHostEditSubmitButton(hostRoot);
    if (!(editSubmitButton instanceof HTMLElement)) {
      return false;
    }

    return isHostReservationRootReady(hostRoot, { requireTimeControls: true });
  }

  function shouldDelayEditPageMapCalendarUi() {
    return isGuestReservationEditPage() && !isGuestReservationEditHostReady();
  }

  function isGuestReservationDetailHostReady() {
    if (!isGuestPage() || isGuestReservationEditPage()) {
      return true;
    }

    const actionContainer = findGuestReservationTabContainer();
    if (!(actionContainer instanceof HTMLElement)) {
      return false;
    }

    const hostRoot = getHostReservationRoot();
    if (!(hostRoot instanceof HTMLElement)) {
      return false;
    }

    const dateInput = queryHostDateInput(hostRoot);
    if (!(dateInput instanceof HTMLInputElement)) {
      return false;
    }

    const bookingSubmitButton = findHostBookingSubmitButton(hostRoot);
    return bookingSubmitButton instanceof HTMLElement;
  }

  function shouldDelayGuestMapCalendarUi() {
    if (!isGuestPage()) {
      return false;
    }

    if (isGuestReservationEditPage()) {
      return !isGuestReservationEditHostReady();
    }

    return !isGuestReservationDetailHostReady();
  }

  function isGuestUiReadyForActivation() {
    return !shouldDelayGuestMapCalendarUi();
  }

  function syncMapCalendarAlwaysOpenPreference() {
    state.mapCalendarAlwaysOpen = readStoredBoolean(
      MAP_CALENDAR_ALWAYS_OPEN_STORAGE_KEY,
      true,
    );
  }

  function syncSlackChannelMentionPreference() {
    state.slackChannelMention = normalizeSlackChannelToken(
      readStoredText(SLACK_CHANNEL_MENTION_STORAGE_KEY, ""),
      { allowBare: true },
    );
    state.slackChannelHistory = readStoredChannelTokens(
      SLACK_CHANNEL_HISTORY_STORAGE_KEY,
    );
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

    const nextHistory = state.slackChannelHistory.filter(
      (token) => token !== normalizedChannel,
    );
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
          .map((token) =>
            normalizeSlackChannelToken(token, { allowBare: false }),
          )
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
      error &&
        typeof error === "object" &&
        error.name === "ZzkRuntimeMessageTimeoutError",
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
      return fetchAvailabilityDirect;
    }

    if (messageType === "ZZK_FETCH_DAILY_SCHEDULE") {
      return fetchDailyScheduleDirect;
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

  const {
    fetchAvailabilityDirect,
    fetchDailyScheduleDirect,
    loadMapContextDirect,
    buildTargetRoomsFromSpaces,
    normalizeDirectReservations,
    parseApiWindowStartMinute,
    parseApiWindowEndMinute,
    parseApiTimeToMinute,
    computeDirectTimelineRange,
    buildDirectTimelineSlots,
    toKstMinuteOfDay,
    fetchApiJson,
    sanitizeSharingMapIdForApi,
  } = globalThis.__zzkGuestDataShared;

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

  function shouldAllowPastReservationDate(value) {
    return (
      isGuestReservationEditPage() &&
      isDateString(value) &&
      value < getTodayDateInKST()
    );
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

    inputElement.setCustomValidity(
      valid ? "" : "시간은 10분 단위로 입력해 주세요.",
    );

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
    return normalizeMapCalendarSpaceTab(tab) === MAP_CALENDAR_SPACE_TAB_PAIR
      ? "페어룸"
      : "회의실";
  }

  function getRoomsForMapCalendarSpaceTab(
    rooms,
    tab = state.mapCalendarSpaceTab,
  ) {
    const normalizedTab = normalizeMapCalendarSpaceTab(tab);
    return Array.isArray(rooms)
      ? rooms.filter((room) => {
          const normalizedName = normalizeTargetRoomName(room?.name);
          const metadata =
            TARGET_ROOM_METADATA_BY_NORMALIZED_NAME.get(normalizedName);
          if (EXCLUDED_CREW_ROOM_SET instanceof Set && EXCLUDED_CREW_ROOM_SET.has(normalizedName)) {
            return false;
          }
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

  if (location.hostname === "example.com") {
    globalThis.__zzkTestApi = {
      clampMapCalendarWidth,
      getMapCalendarWidthBounds,
      computeMapCalendarCurrentTimeScrollLeft,
      getCurrentMinuteOfDayInKST,
      syncGuestUi() {
        if (!isGuestPage()) {
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
        if (!isGuestPage()) {
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
        if (!isGuestPage()) {
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
        const targetDate = normalizeDateInput(state.elements?.dateInput) || state.activeScheduleDate;
        if (targetDate) {
          await refreshDailySchedule(targetDate);
          return true;
        }
        openMapCalendarModal();
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
          pendingSlackModalRequiresNonEditPage:
            state.pendingSlackModalRequiresNonEditPage,
          pendingSlackModalReloadAttempted:
            state.pendingSlackModalReloadAttempted,
          slackModalVisible: state.slackModalVisible,
          lastSlackModalFingerprint: state.lastSlackModalFingerprint,
          lastSlackModalShownAt: state.lastSlackModalShownAt,
          isGuestUiReadyForActivation: isGuestUiReadyForActivation(),
          debugMode: DEBUG_MODE,
        };
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
