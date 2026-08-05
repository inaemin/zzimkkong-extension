import { debugLog, pushDebugEvent } from "../../utils/shared.js";

// DI 팩토리 래퍼: 길이가 곧 복잡도가 아니다(안쪽 함수는 개별 측정된다).
// eslint-disable-next-line max-lines-per-function
export function createRadarFormSync(deps: Deps) {
  const {
    state,
    ensurePanel,
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
          // 사용자에게 보이는 에러는 React 오버레이(renderRadarError)가 그린다.
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

  /** 로그에 남길 선택 요약. */
  function describeSelection(selection) {
    return {
      date: selection?.date,
      roomId: selection?.room?.id,
      roomName: selection?.room?.name,
    };
  }

  /** 패널 입력이 준비됐는지 보장한다. 못 만들면 false. */
  function ensurePanelElements() {
    if (!state.elements) {
      ensurePanel();
    }
    return Boolean(state.elements);
  }

  /** 고른 구간을 패널 입력에 적어 넣고, 정규화된 값을 돌려준다. */
  function writeSelectionToPanel(selection) {
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
    normalizeTimeInput(state.elements.startInput);
    normalizeTimeInput(state.elements.endInput);
    return { normalizedDate, startTime, endTime };
  }

  /** 캐시가 살아 있으면 서버 응답을 기다리지 않고 먼저 그린다. */
  function renderCachedOverlayForDate(normalizedDate) {
    const cached = state.scheduleOverlayEnabled ? getFreshScheduleCache(normalizedDate) : null;
    if (!cached) {
      return;
    }
    state.activeScheduleDate = normalizedDate;
    setScheduleLoadingDate(normalizedDate, false);
    renderMapCalendarOverlay(cached);
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
      ...describeSelection(selection),
    });
    if (!ensurePanelElements()) {
      return;
    }

    const { normalizedDate, startTime, endTime } = writeSelectionToPanel(selection);

    if (!isLatestTimelineSelectionRequest(requestId)) {
      return;
    }

    renderCachedOverlayForDate(normalizedDate);

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

    const outcome = {
      requestId,
      date: normalizedDate,
      roomId: selection.room.id,
      roomName: selection.room.name,
      startTime,
      endTime,
    };

    if (!hostSynced) {
      pushDebugEvent("radar-form-sync", "sync-failed", outcome);
      return;
    }

    if (!isLatestTimelineSelectionRequest(requestId)) {
      return;
    }

    clearTimeout(state.inputRefreshTimer);
    pushDebugEvent("radar-form-sync", "sync-succeeded", outcome);
    refreshAvailability();
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
