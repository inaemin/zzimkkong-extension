// content.js 가 주입하는 의존성 묶음.
//
// content.js 는 아직 .js 라(3단계에서 .tsx 로 다시 쓴다) 여기서 각 의존성의
// 정확한 타입을 알 수 없다. 지금은 형태만 열어두고, content.js 가 컴포넌트로
// 쪼개질 때 이 인터페이스를 구체 타입으로 좁힌다.
type Deps = Record<string, any>;

// DI 팩토리 래퍼: 길이가 곧 복잡도가 아니다(안쪽 함수는 개별 측정된다).
// eslint-disable-next-line max-lines-per-function
export function createRadarWorkflow(deps: Deps) {
  const {
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
    NAV_SAFE_Z_INDEX,
    TARGET_ROOM_NAMES,
    findGuestReservationTabContainer,
    findGuestReservationTabStyleSource,
    normalizeTextForMatch,
    normalizeSlackFieldText,
    normalizeHostRoomCandidate,
    extractKnownRoomName,
    readHostRoomName,
    buildSlackReservationContext,
    showSlackCopyModal,
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
    getErrorMessage,
    queryHostDateInput,
    renderMapCalendarOverlay,
  } = deps;

  function shouldShowSlackModalTrigger() {
    const manualVerificationEnabled = (() => {
      try {
        return window.localStorage.getItem("zzk-manual-slack-modal-trigger-v1") === "1";
      } catch (error) {
        return false;
      }
    })();

    return DEBUG_MODE || manualVerificationEnabled;
  }

  /** 처음 열 때 한 번만 스케줄 오버레이를 켠다. */
  function enableScheduleOverlayOnce() {
    if (state.scheduleOverlayEnabled) {
      return;
    }
    state.scheduleOverlayEnabled = true;
    if (state.elements?.scheduleToggle instanceof HTMLInputElement) {
      state.elements.scheduleToggle.checked = true;
    }
  }

  function createSlackTrigger(): HTMLButtonElement {
    const trigger = document.createElement("button");
    trigger.id = SLACK_MODAL_TRIGGER_ID;
    trigger.type = "button";
    trigger.textContent = "모달 테스트";
    trigger.addEventListener("click", () => {
      showSlackCopyModal(buildSlackReservationContext());
    });
    return trigger;
  }

  function ensureSlackModalTrigger() {
    const existing = document.getElementById(SLACK_MODAL_TRIGGER_ID);
    const actionContainer = shouldShowSlackModalTrigger()
      ? findGuestReservationTabContainer()
      : null;

    // 띄울 조건이 아니거나 붙일 자리가 없으면 있던 것을 걷는다.
    if (!(actionContainer instanceof HTMLElement)) {
      existing?.remove();
      return;
    }

    const trigger = existing instanceof HTMLButtonElement ? existing : createSlackTrigger();

    if (trigger.parentElement !== actionContainer) {
      actionContainer.appendChild(trigger);
    }

    const styleSourceButton = findGuestReservationTabStyleSource();
    if (styleSourceButton instanceof HTMLButtonElement) {
      trigger.className = styleSourceButton.className;
      trigger.style.font = styleSourceButton.style.font;
      trigger.style.fontFamily = styleSourceButton.style.fontFamily;
      trigger.style.fontSize = styleSourceButton.style.fontSize;
      trigger.style.fontWeight = styleSourceButton.style.fontWeight;
    }

    trigger.style.cursor = "pointer";
    trigger.style.pointerEvents = "auto";
  }

  function ensureMapCalendarLauncher() {
    if (!isRadarSupportedPage() || !(document.body instanceof HTMLBodyElement)) {
      return;
    }

    if (shouldDelayGuestMapCalendarUi()) {
      removeMapCalendarLauncher();
      state.mapCalendarVisible = false;
      removeMapCalendarOverlay();
      state.lastAutoOpenPath = null;
      return;
    }

    const isOpen =
      !state.mapCalendarSuppressedBySlack &&
      isMapCalendarModalOpenRequested() &&
      state.scheduleOverlayEnabled;

    const launcher = renderRadarLauncher({
      open: isOpen,
      onOpenChange: (nextOpen) => {
        enableScheduleOverlayOnce();

        state.mapCalendarVisible = nextOpen;
        if (nextOpen) {
          openMapCalendarModal();
        }
        if (!nextOpen) {
          removeMapCalendarOverlay();
        }
        updateMapCalendarLauncherState();
      },
    });

    scheduleAutoOpenMapCalendarLauncher(launcher);
  }

  function scheduleAutoOpenMapCalendarLauncher(launcher) {
    if (!(launcher instanceof HTMLButtonElement) || !isRadarSupportedPage()) {
      return;
    }

    if (state.mapCalendarSuppressedBySlack) {
      state.lastAutoOpenPath = null;
      return;
    }

    if (shouldDelayGuestMapCalendarUi()) {
      state.mapCalendarVisible = false;
      state.lastAutoOpenPath = null;
      return;
    }

    if (!readStoredBoolean(MAP_CALENDAR_ALWAYS_OPEN_STORAGE_KEY, true)) {
      return;
    }

    const currentPath = location.pathname;
    if (!currentPath || state.lastAutoOpenPath === currentPath) {
      return;
    }

    const hasOpenOverlay = Boolean(document.getElementById(MAP_CALENDAR_OVERLAY_ID));
    const isLauncherOpen = launcher.dataset.zzkToggleState === "open";
    if (hasOpenOverlay || isLauncherOpen) {
      state.lastAutoOpenPath = currentPath;
      return;
    }

    state.lastAutoOpenPath = currentPath;
    // 라우팅 직후엔 런처가 아직 다시 그려지는 중일 수 있어 잠깐 뒤 누른다.
    window.setTimeout(() => clickLauncherIfStillClosed(currentPath), 80);
  }

  /** 지금도 같은 화면이고 아직 닫혀 있으면 런처를 누른다. */
  function clickLauncherIfStillClosed(expectedPath) {
    if (!isRadarSupportedPage() || location.pathname !== expectedPath) {
      return;
    }

    const activeLauncher = document.getElementById(MAP_CALENDAR_LAUNCHER_ID);
    if (!(activeLauncher instanceof HTMLButtonElement)) {
      return;
    }

    const alreadyOpen =
      activeLauncher.dataset.zzkToggleState === "open" ||
      Boolean(document.getElementById(MAP_CALENDAR_OVERLAY_ID));
    if (alreadyOpen) {
      return;
    }

    activeLauncher.click();
  }

  function removeMapCalendarLauncher() {
    removeRadarLauncher();
  }

  /**
   * 런처의 눌림 상태를 다시 그린다.
   *
   * 예전에는 DOM 을 직접 만져 색·aria-pressed 를 갱신했다. 이제 컴포넌트가
   * open prop 으로 판단하므로 다시 렌더하기만 하면 된다.
   */
  function updateMapCalendarLauncherState() {
    if (!getRadarLauncherHost()) {
      return;
    }
    ensureMapCalendarLauncher();
  }

  function ensureMapCalendarLoadingOverlay(bodyElement, forceCreate = false) {
    if (!(bodyElement instanceof HTMLElement)) {
      return null;
    }

    const existing = bodyElement.querySelector(".zzk-map-calendar-loading-overlay");
    if (existing instanceof HTMLElement) {
      return existing;
    }

    if (!forceCreate) {
      return null;
    }

    const loadingOverlay = document.createElement("div");
    loadingOverlay.className = "zzk-map-calendar-loading-overlay";
    loadingOverlay.setAttribute("role", "status");
    loadingOverlay.setAttribute("aria-live", "polite");

    const spinner = document.createElement("span");
    spinner.className = "zzk-map-calendar-loading-spinner";
    spinner.setAttribute("aria-hidden", "true");

    const loadingText = document.createElement("span");
    loadingText.className = "zzk-map-calendar-loading-text";

    loadingOverlay.append(spinner, loadingText);
    bodyElement.appendChild(loadingOverlay);
    return loadingOverlay;
  }

  function syncMapCalendarBodyLoadingState() {
    // 오버레이가 shadow root 안이라 document 로는 자식을 찾을 수 없다.
    const body = queryRadarOverlay('[data-testid="radar-body"]');
    if (!(body instanceof HTMLElement)) {
      return;
    }

    const hasLoadingDate = isDateString(state.scheduleLoadingDate || "");
    const shouldShowLoading =
      hasLoadingDate &&
      state.scheduleLoadingDate === state.activeScheduleDate &&
      state.scheduleLoadingTab === state.activeScheduleTab &&
      state.scheduleOverlayEnabled &&
      isMapCalendarModalOpenRequested();

    body.classList.toggle("zzk-map-calendar-body-loading", shouldShowLoading);
    body.setAttribute("aria-busy", shouldShowLoading ? "true" : "false");

    const loadingOverlay = ensureMapCalendarLoadingOverlay(body, shouldShowLoading);
    if (!(loadingOverlay instanceof HTMLElement)) {
      return;
    }

    loadingOverlay.setAttribute("aria-hidden", shouldShowLoading ? "false" : "true");
    const loadingText = loadingOverlay.querySelector(".zzk-map-calendar-loading-text");
    if (loadingText instanceof HTMLElement) {
      const loadingDateLabel = hasLoadingDate
        ? formatDateSelectorText(state.scheduleLoadingDate)
        : "";
      loadingText.textContent = loadingDateLabel
        ? `${loadingDateLabel} 예약 현황 로딩 중...`
        : "예약 현황 로딩 중...";
    }
  }

  /** 지금 그려야 할 날짜. 패널 입력이 있으면 그쪽이 우선이다. */
  function resolveTargetScheduleDate() {
    const dateInput = state.elements?.dateInput;
    const currentDate =
      dateInput instanceof HTMLInputElement
        ? normalizeDateInput(dateInput)
        : state.activeScheduleDate;
    return currentDate || state.activeScheduleDate;
  }

  /** 지금 오버레이를 띄워도 되는지. 안 되면 정리까지 하고 false. */
  function canOpenMapCalendarModal() {
    if (!isRadarSupportedPage() || !state.scheduleOverlayEnabled) {
      updateMapCalendarLauncherState();
      return false;
    }

    if (shouldDelayGuestMapCalendarUi()) {
      state.mapCalendarVisible = false;
      state.lastAutoOpenPath = null;
      removeMapCalendarOverlay();
      return false;
    }

    if (state.mapCalendarSuppressedBySlack) {
      removeMapCalendarOverlay();
      return false;
    }

    return true;
  }

  function openMapCalendarModal() {
    if (!canOpenMapCalendarModal()) {
      return;
    }

    const activeTab = normalizeMapCalendarSpaceTab(state.mapCalendarSpaceTab);
    const targetDate = resolveTargetScheduleDate();
    const targetDateCachedSchedule = targetDate
      ? getFreshScheduleCacheForTab(targetDate, activeTab)
      : null;

    if (targetDate && targetDateCachedSchedule) {
      state.activeScheduleDate = targetDate;
      state.activeScheduleTab = activeTab;
      setScheduleLoadingDate(targetDate, false, activeTab);
      renderMapCalendarOverlay(targetDateCachedSchedule);
      return;
    }

    if (targetDate) {
      refreshDailySchedule(targetDate).catch(() => {
        // 사용자에게 보이는 에러는 React 오버레이(renderRadarError)가 그린다.
        updateMapCalendarLauncherState();
      });
      return;
    }

    refreshAvailability();
    updateMapCalendarLauncherState();
  }

  function removeMapCalendarOverlay() {
    const overlay = document.getElementById(MAP_CALENDAR_OVERLAY_ID);
    if (overlay) {
      overlay.remove();
    }
    state.scheduleLoadingDate = null;
    state.scheduleLoadingTab = null;
    state.lastRenderedScheduleDate = null;
    state.lastRenderedScheduleTab = null;
    updateMapCalendarLauncherState();
  }

  return {
    ensureSlackModalTrigger,
    findGuestReservationTabContainer,
    findGuestReservationTabStyleSource,
    ensureMapCalendarLoadingOverlay,
    syncMapCalendarBodyLoadingState,
    ensureMapCalendarLauncher,
    scheduleAutoOpenMapCalendarLauncher,
    removeMapCalendarLauncher,
    updateMapCalendarLauncherState,
    openMapCalendarModal,
    removeMapCalendarOverlay,
  };
}
