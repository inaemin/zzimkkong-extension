(() => {
  if (globalThis.__zzkRadarWorkflow) {
    return;
  }

  function createRadarWorkflow(deps) {
    const {
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
      buildSlackReservationContext,
      showSlackCopyModal,
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

    let label = launcher.querySelector(".zzk-map-calendar-radar-label");
    if (label instanceof HTMLSpanElement) {
      return label;
    }

    launcher.textContent = "";
    const icon = createMapCalendarLauncherIcon();
    label = document.createElement("span");
    label.className = "zzk-map-calendar-radar-label";
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
    return DEBUG_MODE && isGuestPage() && !isGuestReservationEditPage();
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
    if (!isGuestPage() || !(document.body instanceof HTMLBodyElement)) {
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

    mountMapCalendarLauncher(launcher);

    const styleSourceButton = findGuestReservationTabStyleSource();
    if (styleSourceButton instanceof HTMLButtonElement) {
      launcher.className = styleSourceButton.className;
      launcher.style.font = styleSourceButton.style.font;
      launcher.style.fontFamily = styleSourceButton.style.fontFamily;
      launcher.style.fontSize = styleSourceButton.style.fontSize;
      launcher.style.fontWeight = styleSourceButton.style.fontWeight;
      launcher.style.background = "";
      launcher.style.color = "";
      launcher.style.border = "";
      launcher.style.borderRadius = "";
      launcher.style.boxShadow = "";
      launcher.style.backdropFilter = "";
    }

    launcher.style.position = "relative";
    launcher.style.left = "";
    launcher.style.bottom = "";
    launcher.style.top = "";
    launcher.style.transform = "";
    launcher.style.zIndex = "";
    const mountedBesideRoomTitle =
      launcher.dataset.zzkMountType === "room-title";
    launcher.style.marginLeft = mountedBesideRoomTitle ? "8px" : "0";
    launcher.style.marginRight = "0";
    launcher.style.verticalAlign = mountedBesideRoomTitle ? "middle" : "";
    launcher.style.flexShrink = "0";
    const isEditPageLauncher = isGuestReservationEditPage();
    launcher.style.minHeight = isEditPageLauncher ? "36px" : "";
    launcher.style.minWidth = "";
    launcher.style.padding = isEditPageLauncher ? "8px 14px" : "";
    launcher.style.borderRadius = isEditPageLauncher ? "999px" : "";
    launcher.style.cursor = "pointer";
    launcher.style.pointerEvents = "auto";
    launcher.style.display = "inline-flex";
    launcher.style.alignItems = "center";
    launcher.style.gap = "6px";
    launcher.style.lineHeight = "1";
    launcher.style.transition =
      "background-color 140ms ease, color 140ms ease, border-color 140ms ease, box-shadow 140ms ease, transform 140ms ease, opacity 140ms ease";

    ensureMapCalendarLauncherContent(launcher);

    updateMapCalendarLauncherState(launcher);
    scheduleAutoOpenMapCalendarLauncher(launcher);
  }

  function mountMapCalendarLauncher(launcher) {
    if (!(launcher instanceof HTMLButtonElement)) {
      return;
    }

    const allowRoomTitleMount = isGuestReservationEditPage();

    if (
      allowRoomTitleMount &&
      launcher.dataset.zzkMountType === "room-title" &&
      launcher.parentElement instanceof HTMLElement &&
      launcher.parentElement.isConnected
    ) {
      return;
    }

    const now = Date.now();
    if (now - (state.lastLauncherRemountAt || 0) < 280) {
      return;
    }
    state.lastLauncherRemountAt = now;

    if (allowRoomTitleMount) {
      const roomTitleAnchor = findGuestRoomTitleAnchor();
      if (roomTitleAnchor instanceof HTMLElement) {
        if (launcher.parentElement !== roomTitleAnchor) {
          roomTitleAnchor.appendChild(launcher);
        }
        launcher.dataset.zzkMountType = "room-title";
        return;
      }
    }

    const mountTarget = getMapCalendarLauncherMountTarget();
    if (
      mountTarget instanceof HTMLElement &&
      launcher.parentElement !== mountTarget
    ) {
      mountTarget.appendChild(launcher);
    }
    launcher.dataset.zzkMountType = "default";
  }

  function findGuestRoomTitleAnchor() {
    const roomNames = new Set(TARGET_ROOM_NAMES);
    const currentRoomName = normalizeHostRoomCandidate(readHostRoomName());
    if (currentRoomName) {
      roomNames.add(extractKnownRoomName(currentRoomName));
    }

    const roomKeys = Array.from(roomNames)
      .map((roomName) => normalizeTextForMatch(roomName))
      .filter(Boolean);
    if (roomKeys.length === 0) {
      return null;
    }

    const candidateRoots = [];
    const hostRoot = getHostReservationRoot();
    if (hostRoot instanceof HTMLElement) {
      candidateRoots.push(
        hostRoot.closest("main") || hostRoot.parentElement || hostRoot,
      );
    }
    if (document.body instanceof HTMLBodyElement) {
      candidateRoots.push(document.body);
    }

    const seenRoots = new Set();
    let bestCandidate = null;
    let bestScore = Number.NEGATIVE_INFINITY;

    const visitCandidate = (candidate) => {
      if (!(candidate instanceof HTMLElement) || !isElementVisible(candidate)) {
        return;
      }
      if (isInsideExtensionSurface(candidate)) {
        return;
      }

      const text = normalizeSlackFieldText(candidate.textContent || "");
      if (!text || text.length > 120) {
        return;
      }

      const normalizedText = normalizeTextForMatch(text);
      if (!normalizedText) {
        return;
      }

      const matchedRoomKey = roomKeys.find(
        (roomKey) =>
          normalizedText === roomKey ||
          normalizedText.endsWith(roomKey) ||
          normalizedText.includes(roomKey),
      );
      if (!matchedRoomKey) {
        return;
      }

      const rect = candidate.getBoundingClientRect();
      let score = 0;
      if (normalizedText === matchedRoomKey) {
        score += 28;
      } else if (normalizedText.endsWith(matchedRoomKey)) {
        score += 24;
      } else {
        score += 16;
      }

      if (
        candidate.tagName === "H1" ||
        candidate.tagName === "H2" ||
        candidate.tagName === "H3"
      ) {
        score += 10;
      }

      if (
        typeof candidate.className === "string" &&
        /title|heading|header/i.test(candidate.className)
      ) {
        score += 6;
      }

      if (rect.top >= 0 && rect.top < 260) {
        score += 8;
      }

      if (rect.left >= 0 && rect.left < window.innerWidth * 0.66) {
        score += 2;
      }

      if (text.length <= 40) {
        score += 3;
      }

      if (score > bestScore) {
        bestScore = score;
        bestCandidate = candidate;
      }
    };

    candidateRoots.forEach((root) => {
      if (!(root instanceof HTMLElement) || seenRoots.has(root)) {
        return;
      }
      seenRoots.add(root);

      const headingCandidates = Array.from(
        root.querySelectorAll(
          "h1, h2, h3, h4, strong, [class*='title'], [class*='heading'], [class*='header']",
        ),
      );
      headingCandidates.forEach(visitCandidate);

      if (bestScore >= 24) {
        return;
      }

      const fallbackCandidates = Array.from(
        root.querySelectorAll("p, span, div"),
      );
      for (
        let index = 0;
        index < fallbackCandidates.length && index < 220;
        index += 1
      ) {
        visitCandidate(fallbackCandidates[index]);
      }
    });

    return bestScore >= 18 ? bestCandidate : null;
  }

  function scheduleAutoOpenMapCalendarLauncher(launcher) {
    if (!(launcher instanceof HTMLButtonElement) || !isGuestPage()) {
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

    const hasOpenOverlay = Boolean(
      document.getElementById(MAP_CALENDAR_OVERLAY_ID),
    );
    const isLauncherOpen = launcher.dataset.zzkToggleState === "open";
    if (hasOpenOverlay || isLauncherOpen) {
      state.lastAutoOpenPath = currentPath;
      return;
    }

    state.lastAutoOpenPath = currentPath;
    window.setTimeout(() => {
      if (!isGuestPage() || location.pathname !== currentPath) {
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
    if (isGuestReservationEditPage()) {
      launcher.style.setProperty("border-radius", "999px", "important");
      launcher.style.setProperty("padding", "8px 14px", "important");
      launcher.style.setProperty("min-height", "36px", "important");
    }

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

    launcher.style.setProperty(
      "background-color",
      "rgba(255, 255, 255, 0.96)",
      "important",
    );
    launcher.style.setProperty(
      "border-color",
      "rgba(255, 136, 51, 0.56)",
      "important",
    );
    launcher.style.setProperty("color", "#FF8833", "important");
    launcher.style.setProperty(
      "box-shadow",
      "0 0 0 1px rgba(255, 136, 51, 0.16)",
      "important",
    );
    launcher.style.setProperty("transform", "none", "important");
    launcher.style.setProperty("opacity", "1", "important");
  }

  function ensureMapCalendarLoadingOverlay(bodyElement, forceCreate = false) {
    if (!(bodyElement instanceof HTMLElement)) {
      return null;
    }

    const existing = bodyElement.querySelector(
      ".zzk-map-calendar-loading-overlay",
    );
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

    const loadingOverlay = ensureMapCalendarLoadingOverlay(
      body,
      shouldShowLoading,
    );
    if (!(loadingOverlay instanceof HTMLElement)) {
      return;
    }

    loadingOverlay.setAttribute(
      "aria-hidden",
      shouldShowLoading ? "false" : "true",
    );
    const loadingText = loadingOverlay.querySelector(
      ".zzk-map-calendar-loading-text",
    );
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
    if (!isGuestPage() || !state.scheduleOverlayEnabled) {
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
      mountMapCalendarLauncher,
      findGuestRoomTitleAnchor,
      scheduleAutoOpenMapCalendarLauncher,
      removeMapCalendarLauncher,
      updateMapCalendarLauncherState,
      openMapCalendarModal,
      removeMapCalendarOverlay,
    };
  }

  globalThis.__zzkRadarWorkflow = { createRadarWorkflow };
})();
