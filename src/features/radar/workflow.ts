// content.js 가 주입하는 의존성 묶음.
//
// content.js 는 아직 .js 라(3단계에서 .tsx 로 다시 쓴다) 여기서 각 의존성의
// 정확한 타입을 알 수 없다. 지금은 형태만 열어두고, content.js 가 컴포넌트로
// 쪼개질 때 이 인터페이스를 구체 타입으로 좁힌다.
type Deps = Record<string, any>;

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
    setStatus,
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

  function ensureSlackModalTrigger() {
    const existing = document.getElementById(SLACK_MODAL_TRIGGER_ID);
    if (!shouldShowSlackModalTrigger()) {
      if (existing instanceof HTMLElement) {
        existing.remove();
      }
      return;
    }

    const actionContainer = findGuestReservationTabContainer();
    if (!(actionContainer instanceof HTMLElement)) {
      if (existing instanceof HTMLElement) {
        existing.remove();
      }
      return;
    }

    let trigger: HTMLButtonElement;
    if (existing instanceof HTMLButtonElement) {
      trigger = existing;
    } else {
      trigger = document.createElement("button");
      trigger.id = SLACK_MODAL_TRIGGER_ID;
      trigger.type = "button";
      trigger.textContent = "모달 테스트";
      trigger.addEventListener("click", () => {
        showSlackCopyModal(buildSlackReservationContext());
      });
    }

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
        if (!state.scheduleOverlayEnabled) {
          state.scheduleOverlayEnabled = true;
          if (state.elements?.scheduleToggle instanceof HTMLInputElement) {
            state.elements.scheduleToggle.checked = true;
          }
        }

        state.mapCalendarVisible = nextOpen;
        if (nextOpen) {
          openMapCalendarModal();
        } else {
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
    window.setTimeout(() => {
      if (!isRadarSupportedPage() || location.pathname !== currentPath) {
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
    }, 80);
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

  function openMapCalendarModal() {
    if (!isRadarSupportedPage() || !state.scheduleOverlayEnabled) {
      updateMapCalendarLauncherState();
      return;
    }

    if (shouldDelayGuestMapCalendarUi()) {
      state.mapCalendarVisible = false;
      state.lastAutoOpenPath = null;
      removeMapCalendarOverlay();
      return;
    }

    if (state.mapCalendarSuppressedBySlack) {
      removeMapCalendarOverlay();
      return;
    }

    const dateInput = state.elements?.dateInput;
    const activeTab = normalizeMapCalendarSpaceTab(state.mapCalendarSpaceTab);
    const currentDate =
      dateInput instanceof HTMLInputElement
        ? normalizeDateInput(dateInput)
        : state.activeScheduleDate;
    const targetDate = currentDate || state.activeScheduleDate;
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
      refreshDailySchedule(targetDate).catch((error) => {
        if (state.elements) {
          setStatus(getErrorMessage(error), "error");
        }
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
