import type { RadarState } from "../state.js";
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

  /** 사용자가 직접 바꾼 호스트 날짜 입력이면 그 요소를, 아니면 null. */
  function readHostDateChangeTarget(event) {
    if (!event.isTrusted || isHandlingInternalHostDateSync()) {
      return null;
    }
    const target = event.target;
    if (!(target instanceof HTMLInputElement) || !target.value) {
      return null;
    }
    // lms+ 의 날짜 입력에는 name 이 없어 type="date" 만으로 호스트 날짜 입력으로 인정한다.
    return target.name === "date" || target.type === "date" ? target : null;
  }

  function handleHostDateChange(event) {
    if (!ensurePanelElements()) {
      return;
    }

    const target = readHostDateChangeTarget(event);
    if (!target) {
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

  /** 대기 중이던 선택 반영을 실행한다. 그 사이 새 선택이 왔으면 버린다. */
  function runQueuedSelectionApply(selection, requestId) {
    state.timelineSelectionApplyTimer = null;
    if (!isLatestTimelineSelectionRequest(requestId)) {
      return;
    }
    applyTimelineReservationSelection(selection, requestId).catch(() => {
      // 사용자에게 보이는 에러는 React 오버레이(renderRadarError)가 그린다.
    });
  }

  function queueTimelineSelectionApply(selection) {
    if (!selection) {
      return;
    }
    pushDebugEvent("radar-form-sync", "queue-selection", {
      ...describeSelection(selection),
      startMinute: selection.startMinute,
      endMinute: selection.endMinute,
    });
    if (!ensurePanelElements()) {
      return;
    }

    const requestId = createTimelineSelectionRequestId();
    const hadPendingApply = state.timelineSelectionApplyTimer != null;
    clearTimeout(state.timelineSelectionApplyTimer);
    // 브라우저에서 setTimeout 은 number 를 준다. @types/node 가 섞여 Timeout 으로
    // 추론되므로 명시한다.
    state.timelineSelectionApplyTimer = window.setTimeout(
      () => runQueuedSelectionApply(selection, requestId),
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
    debugLog("radar-form-sync", "apply:start", { requestId, ...describeSelection(selection) });
    if (!isLatestTimelineSelectionRequest(requestId) || !ensurePanelElements()) {
      return;
    }

    const window = writeSelectionToPanel(selection);
    if (!isLatestTimelineSelectionRequest(requestId)) {
      return;
    }

    renderCachedOverlayForDate(window.normalizedDate);
    await syncHostFormAndReport(selection, requestId, {
      date: window.normalizedDate,
      startTime: window.startTime,
      endTime: window.endTime,
    });
  }

  /** 호스트 예약 폼에 반영하고 결과를 기록한다. */
  async function syncHostFormAndReport(selection, requestId, window) {
    const hostSynced = await syncLmsReservationForm(
      { ...window, roomId: selection.room.id, roomName: selection.room.name },
      requestId,
    );

    // 그 사이 다른 선택이 들어왔으면 이 결과는 버린다.
    if (!isLatestTimelineSelectionRequest(requestId)) {
      return;
    }

    const outcome = { requestId, ...describeSelection(selection), ...window };
    if (!hostSynced) {
      pushDebugEvent("radar-form-sync", "sync-failed", outcome);
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
/**
 * 이미 타입이 있는 의존성은 원본에서 끌어온다. 손으로 다시 적으면 원본이
 * 바뀔 때 조용히 어긋난다. content.js 에서만 오는 것들은 아직 .js 라 타입을
 * 알 수 없어 형태만 적는다.
 */
type Deps = Record<string, any> & {
  state: RadarState;
  minuteToHourMinute: typeof import("../../utils/date-time.js").minuteToHourMinute;
  getTodayDateInKST: typeof import("../../utils/date-time.js").getTodayDateInKST;
  // content.js 에 있어 타입을 끌어올 수 없다. 쓰는 형태만 적는다.
  normalizeDateInput: (input: unknown) => string;
  normalizeTimeInput: (input: unknown) => string;
  clampDateToMin: (value: unknown, minimum: unknown) => string;
  // content.js 에 있어 타입을 끌어올 수 없다. 쓰는 형태만 적는다.
  ensurePanel: () => void;
  getMinimumSelectableDateForCurrentContext: (value?: unknown) => string;
  getFreshScheduleCache: (date: string) => unknown;
  setScheduleLoadingDate: (date: string, loading: boolean, tab?: string) => void;
  renderMapCalendarOverlay: (schedule: unknown) => void;
  refreshAvailability: () => void;
  syncLmsReservationForm: (payload: unknown, requestId: number) => Promise<boolean>;
};
