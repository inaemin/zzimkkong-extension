import { debugLog, pushDebugEvent } from "../../utils/shared.js";

export function createRadarFormSync(deps: Deps) {
  const {
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
  } = deps;

  function handleHostDateChange(event) {
    if (!state.elements) {
      ensurePanel();
    }
    if (!state.elements) {
      return;
    }

    if (!event.isTrusted) {
      return;
    }

    const target = event.target;
    if (!(target instanceof HTMLInputElement)) {
      return;
    }

    // lms+ 의 날짜 입력에는 name 이 없어 type="date" 만으로 호스트 날짜 입력으로 인정한다.
    const isDateField = target.name === "date" || target.type === "date";
    if (!isDateField || !target.value) {
      return;
    }

    if (isHandlingInternalHostDateSync()) {
      return;
    }

    const minimumDate =
      typeof getMinimumSelectableDateForCurrentContext === "function"
        ? getMinimumSelectableDateForCurrentContext(target.value)
        : getTodayDateInKST();
    const normalizedDate = clampDateToMin(target.value, minimumDate);

    deps.applyPanelDateChange(normalizedDate);
  }

  function isHandlingInternalHostDateSync() {
    return Number.isInteger(state.hostDateSyncDepth) && state.hostDateSyncDepth > 0;
  }

  function createTimelineSelectionRequestId() {
    state.timelineSelectionRequestId = Number.isInteger(state.timelineSelectionRequestId)
      ? state.timelineSelectionRequestId + 1
      : 1;
    return state.timelineSelectionRequestId;
  }

  function isLatestTimelineSelectionRequest(requestId) {
    if (!Number.isInteger(requestId)) {
      return true;
    }
    return requestId === state.timelineSelectionRequestId;
  }

  function queueTimelineSelectionApply(selection) {
    if (!selection) {
      return;
    }
    pushDebugEvent("radar-form-sync", "queue-selection", {
      date: selection.date,
      roomId: selection.room?.id,
      roomName: selection.room?.name,
      startMinute: selection.startMinute,
      endMinute: selection.endMinute,
    });
    if (!state.elements) {
      ensurePanel();
    }
    if (!state.elements) {
      return;
    }

    const requestId = createTimelineSelectionRequestId();
    const hadPendingApply = state.timelineSelectionApplyTimer != null;
    clearTimeout(state.timelineSelectionApplyTimer);
    state.timelineSelectionApplyTimer = setTimeout(
      () => {
        state.timelineSelectionApplyTimer = null;

        if (!isLatestTimelineSelectionRequest(requestId)) {
          return;
        }

        applyTimelineReservationSelection(selection, requestId).catch((error) => {
          if (!isLatestTimelineSelectionRequest(requestId)) {
            return;
          }
          if (state.elements) {
            setStatus(getErrorMessage(error), "error");
          }
        });
      },
      hadPendingApply ? 80 : 0,
    );
  }

  function withInternalHostDateSync(task) {
    if (typeof task !== "function") {
      return undefined;
    }

    state.hostDateSyncDepth = Number.isInteger(state.hostDateSyncDepth)
      ? state.hostDateSyncDepth + 1
      : 1;

    try {
      return task();
    } finally {
      state.hostDateSyncDepth = Math.max(0, (state.hostDateSyncDepth || 1) - 1);
    }
  }

  function resetTimelineSelectionState() {
    state.slotSelection = null;
    state.slotHover = null;
    state.appliedSelection = null;
    clearTimeout(state.timelineSelectionApplyTimer);
    state.timelineSelectionApplyTimer = null;
    createTimelineSelectionRequestId();
  }

  async function applyTimelineReservationSelection(
    selection,
    requestId = state.timelineSelectionRequestId,
  ) {
    if (!isLatestTimelineSelectionRequest(requestId)) {
      return;
    }
    debugLog("radar-form-sync", "applyTimelineReservationSelection:start", {
      requestId,
      date: selection?.date,
      roomId: selection?.room?.id,
      roomName: selection?.room?.name,
    });
    if (!state.elements) {
      ensurePanel();
    }
    if (!state.elements) {
      return;
    }

    const normalizedDate = clampDateToMin(selection.date, getTodayDateInKST());
    const startTime = minuteToHourMinute(selection.startMinute);
    const endTime = minuteToHourMinute(selection.endMinute);

    state.elements.dateInput.value = normalizedDate;
    state.elements.startInput.value = startTime;
    state.elements.endInput.value = endTime;

    state.appliedSelection = {
      date: normalizedDate,
      roomId: selection.room.id,
      startMinute: selection.startMinute,
      endMinute: selection.endMinute,
    };

    normalizeDateInput(state.elements.dateInput);
    syncPanelDateNavigationState();
    normalizeTimeInput(state.elements.startInput);
    normalizeTimeInput(state.elements.endInput);

    if (!isLatestTimelineSelectionRequest(requestId)) {
      return;
    }

    const timelineSelectionCached = state.scheduleOverlayEnabled
      ? getFreshScheduleCache(normalizedDate)
      : null;
    if (timelineSelectionCached) {
      state.activeScheduleDate = normalizedDate;
      setScheduleLoadingDate(normalizedDate, false);
      renderMapCalendarOverlay(timelineSelectionCached);
    }

    const syncPayload = {
      date: normalizedDate,
      startTime,
      endTime,
      roomId: selection.room.id,
      roomName: selection.room.name,
    };

    const hostSynced = await syncLmsReservationForm(syncPayload, requestId);

    if (!isLatestTimelineSelectionRequest(requestId)) {
      return;
    }

    if (!hostSynced) {
      pushDebugEvent("radar-form-sync", "sync-failed", {
        requestId,
        date: normalizedDate,
        roomId: selection.room.id,
        roomName: selection.room.name,
        startTime,
        endTime,
      });
      setStatus(
        `예약 폼 시간 반영 실패: ${normalizedDate} ${startTime}~${endTime}. 다시 한번 선택해 주세요.`,
        "error",
      );
      return;
    }

    if (!isLatestTimelineSelectionRequest(requestId)) {
      return;
    }

    clearTimeout(state.inputRefreshTimer);
    pushDebugEvent("radar-form-sync", "sync-succeeded", {
      requestId,
      date: normalizedDate,
      roomId: selection.room.id,
      roomName: selection.room.name,
      startTime,
      endTime,
    });
    refreshAvailability();
  }

  function shouldUpdateStartBeforeEnd(
    observedStartTime,
    observedEndTime,
    targetStartTime,
    targetEndTime,
  ) {
    const observedStartMinute = parseHourMinute(String(observedStartTime || ""));
    const observedEndMinute = parseHourMinute(String(observedEndTime || ""));
    const targetStartMinute = parseHourMinute(String(targetStartTime || ""));
    const targetEndMinute = parseHourMinute(String(targetEndTime || ""));

    const hasAllMinutes =
      Number.isInteger(observedStartMinute) &&
      Number.isInteger(observedEndMinute) &&
      Number.isInteger(targetStartMinute) &&
      Number.isInteger(targetEndMinute);

    if (!hasAllMinutes) {
      return true;
    }

    const startFirstKeepsValid = targetStartMinute < observedEndMinute;
    const endFirstKeepsValid = observedStartMinute < targetEndMinute;

    if (startFirstKeepsValid && !endFirstKeepsValid) {
      return true;
    }
    if (!startFirstKeepsValid && endFirstKeepsValid) {
      return false;
    }
    if (targetStartMinute === observedStartMinute && targetEndMinute !== observedEndMinute) {
      return false;
    }
    if (targetEndMinute === observedEndMinute && targetStartMinute !== observedStartMinute) {
      return true;
    }

    return targetStartMinute <= observedStartMinute;
  }

  function applyHostTimeRangeByInputs(
    startInput,
    endInput,
    observedStartTime,
    observedEndTime,
    targetStartTime,
    targetEndTime,
  ) {
    if (!(startInput instanceof HTMLInputElement) || !(endInput instanceof HTMLInputElement)) {
      return;
    }

    const startNeedsUpdate = startInput.value !== String(targetStartTime);
    const endNeedsUpdate = endInput.value !== String(targetEndTime);
    if (!startNeedsUpdate && !endNeedsUpdate) {
      return;
    }

    const updateStartFirst = shouldUpdateStartBeforeEnd(
      observedStartTime,
      observedEndTime,
      targetStartTime,
      targetEndTime,
    );

    if (updateStartFirst) {
      if (startNeedsUpdate) {
        setFormElementValueSilently(startInput, targetStartTime);
      }
      if (endNeedsUpdate) {
        setFormElementValueSilently(endInput, targetEndTime);
      }
      if (startNeedsUpdate) {
        dispatchFormElementEvents(startInput);
      }
      if (endNeedsUpdate) {
        dispatchFormElementEvents(endInput);
      }
      return;
    }

    if (endNeedsUpdate) {
      setFormElementValueSilently(endInput, targetEndTime);
    }
    if (startNeedsUpdate) {
      setFormElementValueSilently(startInput, targetStartTime);
    }
    if (endNeedsUpdate) {
      dispatchFormElementEvents(endInput);
    }
    if (startNeedsUpdate) {
      dispatchFormElementEvents(startInput);
    }
  }

  function shouldCollapseHostTimePickersAfterSync(syncStartedAt) {
    if (!Number.isFinite(syncStartedAt)) {
      return true;
    }

    const lastManualInteractionAt = Number(state.lastHostTimePickerManualInteractionAt || 0);
    return !Number.isFinite(lastManualInteractionAt) || lastManualInteractionAt <= syncStartedAt;
  }

  return {
    handleHostDateChange,
    isHandlingInternalHostDateSync,
    createTimelineSelectionRequestId,
    isLatestTimelineSelectionRequest,
    queueTimelineSelectionApply,
    withInternalHostDateSync,
    resetTimelineSelectionState,
    applyTimelineReservationSelection,
  };
}

// content.js 가 주입하는 의존성 묶음.
//
// content.js 는 아직 .js 라(3단계에서 .tsx 로 다시 쓴다) 여기서 각 의존성의
// 정확한 타입을 알 수 없다. 지금은 형태만 열어두고, content.js 가 컴포넌트로
// 쪼개질 때 이 인터페이스를 구체 타입으로 좁힌다.
type Deps = Record<string, any>;
