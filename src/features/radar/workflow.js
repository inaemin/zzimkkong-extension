export function createRadarWorkflow(deps) {
  const {
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

  function createMapCalendarLauncherIcon() {
    const namespace = "http://www.w3.org/2000/svg";
    const svg = document.createElementNS(namespace, "svg");
    svg.classList.add("zzk-map-calendar-radar-icon");
    svg.setAttribute("viewBox", "0 0 24 24");
    svg.setAttribute("width", "16");
    svg.setAttribute("height", "16");
    svg.setAttribute("fill", "none");
    svg.setAttribute("aria-hidden", "true");
    svg.setAttribute("focusable", "false");
    svg.style.display = "block";
    svg.style.flexShrink = "0";

    const pathData = [
      "M19.0701 4.9298C17.513 3.37102 15.4847 2.37012 13.3002 2.0826C11.1158 1.79508 8.89754 2.23703 6.99011 3.3398M4.00011 5.9998H4.01011M2.29011 9.6198C1.9152 11.1469 1.90569 12.7408 2.26233 14.2722C2.61898 15.8037 3.33174 17.2294 4.34274 18.4337C5.35374 19.638 6.63449 20.5869 8.08101 21.2034C9.52752 21.8199 11.099 22.0866 12.6679 21.9819C14.2369 21.8771 15.759 21.4038 17.1107 20.6005C18.4624 19.7972 19.6056 18.6864 20.4475 17.3584C21.2894 16.0303 21.8063 14.5225 21.9562 12.9572C22.1061 11.392 21.8847 9.81347 21.3101 8.3498",
      "M16.24 7.75992C15.6646 7.18108 14.977 6.72575 14.2195 6.42179C13.462 6.11783 12.6504 5.97163 11.8344 5.99213C11.0184 6.01263 10.2152 6.1994 9.47391 6.54103C8.7326 6.88265 8.0688 7.37193 7.5231 7.97894C6.97741 8.58594 6.56131 9.29791 6.30025 10.0713C6.0392 10.8446 5.93868 11.6631 6.00486 12.4767C6.07103 13.2902 6.30251 14.0817 6.68512 14.8027C7.06772 15.5237 7.59342 16.1591 8.23004 16.6699M12 17.9999H12.01M17.99 11.6599C18.0444 12.6113 17.8715 13.5619 17.4854 14.4332C17.0993 15.3044 16.5113 16.0711 15.77 16.6699",
      "M12 14C13.1046 14 14 13.1046 14 12C14 10.8954 13.1046 10 12 10C10.8954 10 10 10.8954 10 12C10 13.1046 10.8954 14 12 14Z",
      "M13.4102 10.5897L19.0702 4.92969",
    ];

    pathData.forEach((d) => {
      const path = document.createElementNS(namespace, "path");
      path.setAttribute("d", d);
      path.setAttribute("stroke", "currentColor");
      path.setAttribute("stroke-width", "2");
      path.setAttribute("stroke-linecap", "round");
      path.setAttribute("stroke-linejoin", "round");
      svg.appendChild(path);
    });

    return svg;
  }

  function ensureMapCalendarLauncherContent(launcher) {
    if (!(launcher instanceof HTMLButtonElement)) {
      return null;
    }

    // lms+ 플로팅 런처는 아이콘만 노출한다(텍스트 라벨 숨김).
    const isFloating = launcher.dataset.zzkMountType === "lms-floating";

    let label = launcher.querySelector(".zzk-map-calendar-radar-label");
    if (label instanceof HTMLSpanElement) {
      label.style.display = isFloating ? "none" : "";
      return label;
    }

    launcher.textContent = "";
    const icon = createMapCalendarLauncherIcon();
    label = document.createElement("span");
    label.className = "zzk-map-calendar-radar-label";
    label.style.display = isFloating ? "none" : "";
    launcher.append(icon, label);
    return label;
  }

  function getMapCalendarLauncherMountTarget() {
    const actionContainer = findGuestReservationTabContainer();
    if (actionContainer instanceof HTMLElement) {
      return actionContainer;
    }

    if (document.body instanceof HTMLBodyElement) {
      return document.body;
    }

    return null;
  }

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

    let trigger = existing;
    if (!(trigger instanceof HTMLButtonElement)) {
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

    let launcher = document.getElementById(MAP_CALENDAR_LAUNCHER_ID);
    if (!(launcher instanceof HTMLButtonElement)) {
      launcher = document.createElement("button");
      launcher.id = MAP_CALENDAR_LAUNCHER_ID;
      launcher.type = "button";
      launcher.addEventListener("click", () => {
        if (!state.scheduleOverlayEnabled) {
          state.scheduleOverlayEnabled = true;
          if (state.elements?.scheduleToggle instanceof HTMLInputElement) {
            state.elements.scheduleToggle.checked = true;
          }
        }

        state.mapCalendarVisible = !state.mapCalendarVisible;
        updateMapCalendarLauncherState(launcher);
        if (state.mapCalendarVisible) {
          openMapCalendarModal();
        } else {
          removeMapCalendarOverlay();
        }
      });
    }

    // lms+ 는 호스트 폼에 인라인으로 붙일 자리가 없어, 화면 오른쪽 하단에
    // 40x40 원형 아이콘 버튼(플로팅)으로 띄우고 토글로 열고 닫는다.
    styleLmsFloatingLauncher(launcher);
    ensureMapCalendarLauncherContent(launcher);
    updateMapCalendarLauncherState(launcher);
    scheduleAutoOpenMapCalendarLauncher(launcher);
  }

  // lms+ 전용 플로팅 런처: 오른쪽 하단 고정, 40x40 원형, 아이콘만.
  function styleLmsFloatingLauncher(launcher) {
    if (launcher.parentElement !== document.body) {
      document.body.appendChild(launcher);
    }
    launcher.dataset.zzkMountType = "lms-floating";
    launcher.className = "zzk-map-calendar-radar-launcher-floating";
    launcher.style.setProperty("position", "fixed", "important");
    launcher.style.setProperty("right", "24px", "important");
    launcher.style.setProperty("bottom", "24px", "important");
    launcher.style.setProperty("left", "auto", "important");
    launcher.style.setProperty("top", "auto", "important");
    launcher.style.setProperty("width", "40px", "important");
    launcher.style.setProperty("height", "40px", "important");
    launcher.style.setProperty("min-width", "40px", "important");
    launcher.style.setProperty("min-height", "40px", "important");
    launcher.style.setProperty("padding", "0", "important");
    launcher.style.setProperty("margin", "0", "important");
    launcher.style.setProperty("border-radius", "999px", "important");
    launcher.style.setProperty("display", "inline-flex", "important");
    launcher.style.setProperty("align-items", "center", "important");
    launcher.style.setProperty("justify-content", "center", "important");
    launcher.style.setProperty("gap", "0", "important");
    launcher.style.setProperty("cursor", "pointer", "important");
    launcher.style.setProperty("pointer-events", "auto", "important");
    launcher.style.setProperty("z-index", String(NAV_SAFE_Z_INDEX), "important");
    launcher.style.setProperty("transform", "none", "important");
    launcher.style.setProperty(
      "transition",
      "background-color 140ms ease, color 140ms ease, border-color 140ms ease, box-shadow 140ms ease, transform 140ms ease",
      "important",
    );
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
    const launcher = document.getElementById(MAP_CALENDAR_LAUNCHER_ID);
    if (launcher) {
      launcher.remove();
    }
  }

  function updateMapCalendarLauncherState(
    launcher = document.getElementById(MAP_CALENDAR_LAUNCHER_ID),
  ) {
    if (!(launcher instanceof HTMLButtonElement)) {
      return;
    }

    // lms+ 플로팅 런처는 오버레이(모달)와 z-index 가 같으므로, 항상 body 의 마지막
    // 자식으로 두어 열린 모달 위에 겹쳐 클릭 가능하게 유지한다.
    if (
      launcher.dataset.zzkMountType === "lms-floating" &&
      document.body instanceof HTMLBodyElement &&
      document.body.lastElementChild !== launcher
    ) {
      document.body.appendChild(launcher);
    }

    const label = ensureMapCalendarLauncherContent(launcher);
    if (!(label instanceof HTMLSpanElement)) {
      return;
    }

    const isOpen =
      !state.mapCalendarSuppressedBySlack &&
      isMapCalendarModalOpenRequested() &&
      state.scheduleOverlayEnabled;
    const nextText = isOpen ? "레이더 닫기" : "레이더 열기";
    if (label.textContent !== nextText) {
      label.textContent = nextText;
    }

    const nextAriaLabel = isOpen ? "레이더 닫기" : "레이더 열기";
    if (launcher.getAttribute("aria-label") !== nextAriaLabel) {
      launcher.setAttribute("aria-label", nextAriaLabel);
    }

    const nextPressed = isOpen ? "true" : "false";
    if (launcher.getAttribute("aria-pressed") !== nextPressed) {
      launcher.setAttribute("aria-pressed", nextPressed);
    }

    launcher.dataset.zzkToggleState = isOpen ? "open" : "closed";
    launcher.style.setProperty("border-style", "solid", "important");
    launcher.style.setProperty("border-width", "1px", "important");
    if (isOpen) {
      launcher.style.setProperty("background-color", "#FF8833", "important");
      launcher.style.setProperty("border-color", "#FF8833", "important");
      launcher.style.setProperty("color", "#ffffff", "important");
      launcher.style.setProperty(
        "box-shadow",
        "0 0 0 1px rgba(255, 136, 51, 0.18), 0 4px 12px rgba(255, 136, 51, 0.3)",
        "important",
      );
      launcher.style.setProperty("transform", "translateY(-1px)", "important");
      launcher.style.setProperty("opacity", "1", "important");
      return;
    }

    launcher.style.setProperty("background-color", "rgba(255, 255, 255, 0.96)", "important");
    launcher.style.setProperty("border-color", "rgba(255, 136, 51, 0.56)", "important");
    launcher.style.setProperty("color", "#FF8833", "important");
    launcher.style.setProperty("box-shadow", "0 0 0 1px rgba(255, 136, 51, 0.16)", "important");
    launcher.style.setProperty("transform", "none", "important");
    launcher.style.setProperty("opacity", "1", "important");
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
    const overlay = document.getElementById(MAP_CALENDAR_OVERLAY_ID);
    if (!(overlay instanceof HTMLElement)) {
      return;
    }

    const body = overlay.querySelector(".zzk-map-calendar-body");
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
    document
      .querySelectorAll(".zzk-map-calendar-date-popover-floating")
      .forEach((element) => element.remove());
    state.scheduleLoadingDate = null;
    state.scheduleLoadingTab = null;
    state.lastRenderedScheduleDate = null;
    state.lastRenderedScheduleTab = null;
    updateMapCalendarLauncherState();
  }

  return {
    createMapCalendarLauncherIcon,
    ensureMapCalendarLauncherContent,
    ensureSlackModalTrigger,
    findGuestReservationTabContainer,
    getMapCalendarLauncherMountTarget,
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
