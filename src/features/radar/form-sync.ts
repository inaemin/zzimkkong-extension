import type { SpaceTab } from "../../constants/runtime.js";
import type { DailyScheduleResult } from "../../services/lms-data/types.js";
import type { PanelElements, RadarState } from "../state.js";
import { cancelTimer, debugLog, pushDebugEvent } from "../../utils/shared.js";

/** 타임블록에서 고른 예약 구간. 그리드가 만들어 넘긴다. */
/** 패널 입력에 적어 넣은 구간. */
interface PanelWindow {
  normalizedDate: string;
  startTime: string;
  endTime: string;
}

interface TimelineSelection {
  date: string;
  startMinute: number;
  endMinute: number;
  room: { id: number; name: string };
}

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

  // 이 팩토리 안에서만 오가는 상태. content 의 공유 state 에 둘 이유가 없다.
  // (let 은 규칙상 금지라 한 덩어리로 묶어 둔다.)
  const local = {
    /** 우리가 호스트 날짜를 프로그램적으로 바꾸는 중인지(재진입 방지 카운터). */
    hostDateSyncDepth: 0,
    /** 타임블록 선택 요청 일련번호. 늦은 응답이 최신 선택을 덮지 않게 한다. */
    timelineSelectionRequestId: 0,
    /** 연속 클릭을 묶는 반영 타이머. */
    timelineSelectionApplyTimer: null as number | null,
  };

  /** 사용자가 직접 바꾼 호스트 날짜 입력이면 그 요소를, 아니면 null. */
  function readHostDateChangeTarget(event: Event) {
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

  function handleHostDateChange(event: Event) {
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
    return Number.isInteger(local.hostDateSyncDepth) && local.hostDateSyncDepth > 0;
  }

  function createTimelineSelectionRequestId() {
    local.timelineSelectionRequestId = Number.isInteger(local.timelineSelectionRequestId)
      ? local.timelineSelectionRequestId + 1
      : 1;
    return local.timelineSelectionRequestId;
  }

  function isLatestTimelineSelectionRequest(requestId: number) {
    if (!Number.isInteger(requestId)) {
      return true;
    }
    return requestId === local.timelineSelectionRequestId;
  }

  /** 대기 중이던 선택 반영을 실행한다. 그 사이 새 선택이 왔으면 버린다. */
  function runQueuedSelectionApply(selection: TimelineSelection, requestId: number) {
    local.timelineSelectionApplyTimer = null;
    if (!isLatestTimelineSelectionRequest(requestId)) {
      return;
    }
    applyTimelineReservationSelection(selection, requestId).catch(() => {
      // 사용자에게 보이는 에러는 React 오버레이(renderRadarError)가 그린다.
    });
  }

  function queueTimelineSelectionApply(selection: TimelineSelection | null) {
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
    const hadPendingApply = local.timelineSelectionApplyTimer != null;
    cancelTimer(local.timelineSelectionApplyTimer);
    // 브라우저에서 setTimeout 은 number 를 준다. @types/node 가 섞여 Timeout 으로
    // 추론되므로 명시한다.
    local.timelineSelectionApplyTimer = window.setTimeout(
      () => runQueuedSelectionApply(selection, requestId),
      hadPendingApply ? 80 : 0,
    );
  }

  function withInternalHostDateSync<T>(task: () => T): T {
    local.hostDateSyncDepth = Number.isInteger(local.hostDateSyncDepth)
      ? local.hostDateSyncDepth + 1
      : 1;

    try {
      return task();
    } finally {
      local.hostDateSyncDepth = Math.max(0, (local.hostDateSyncDepth || 1) - 1);
    }
  }

  function resetTimelineSelectionState() {
    state.appliedSelection = null;
    cancelTimer(local.timelineSelectionApplyTimer);
    local.timelineSelectionApplyTimer = null;
    createTimelineSelectionRequestId();
  }

  /** 로그에 남길 선택 요약. */
  function describeSelection(selection: TimelineSelection | null) {
    return {
      date: selection?.date,
      roomId: selection?.room?.id,
      roomName: selection?.room?.name,
    };
  }

  /** 패널 입력이 준비됐는지 보장한다. 못 만들면 false. */
  /** 패널이 없으면 만들고, 준비된 요소를 돌려준다. 못 만들면 null. */
  function ensurePanelElements(): PanelElements | null {
    if (!state.elements) {
      ensurePanel();
    }
    return state.elements;
  }

  /** 고른 구간을 패널 입력에 적어 넣고, 정규화된 값을 돌려준다. */
  function writeSelectionToPanel(
    selection: TimelineSelection,
    elements: PanelElements,
  ): PanelWindow {
    const normalizedDate = clampDateToMin(selection.date, getTodayDateInKST());
    const startTime = minuteToHourMinute(selection.startMinute);
    const endTime = minuteToHourMinute(selection.endMinute);

    writePanelInputs(elements, { normalizedDate, startTime, endTime });
    state.appliedSelection = {
      date: normalizedDate,
      roomId: selection.room.id,
      startMinute: selection.startMinute,
      endMinute: selection.endMinute,
    };

    return { normalizedDate, startTime, endTime };
  }

  /** 패널 입력 3개에 값을 적고 곧바로 정규화한다. */
  function writePanelInputs(elements: PanelElements, window: PanelWindow) {
    elements.dateInput.value = window.normalizedDate;
    elements.startInput.value = window.startTime;
    elements.endInput.value = window.endTime;
    normalizeDateInput(elements.dateInput);
    normalizeTimeInput(elements.startInput);
    normalizeTimeInput(elements.endInput);
  }

  /** 캐시가 살아 있으면 서버 응답을 기다리지 않고 먼저 그린다. */
  function renderCachedOverlayForDate(normalizedDate: string) {
    const cached = getFreshScheduleCache(normalizedDate);
    if (!cached) {
      return;
    }
    state.activeScheduleDate = normalizedDate;
    setScheduleLoadingDate(normalizedDate, false);
    renderMapCalendarOverlay(cached as DailyScheduleResult);
  }

  async function applyTimelineReservationSelection(
    selection: TimelineSelection,
    requestId: number = local.timelineSelectionRequestId,
  ) {
    debugLog("radar-form-sync", "apply:start", { requestId, ...describeSelection(selection) });
    const elements = isLatestTimelineSelectionRequest(requestId) ? ensurePanelElements() : null;
    if (!elements) {
      return;
    }

    const window = writeSelectionToPanel(selection, elements);
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
  async function syncHostFormAndReport(
    selection: TimelineSelection,
    requestId: number,
    window: { date: string; startTime: string; endTime: string },
  ) {
    const hostSynced = await syncLmsReservationForm(
      { ...window, roomId: selection.room.id, roomName: selection.room.name },
      requestId,
    );

    // 그 사이 다른 선택이 들어왔으면 이 결과는 버린다.
    if (!isLatestTimelineSelectionRequest(requestId)) {
      return;
    }

    reportSyncOutcome(hostSynced, { requestId, ...describeSelection(selection), ...window });
  }

  /** 동기화 결과를 남기고, 성공했으면 예약 현황을 다시 받는다. */
  function reportSyncOutcome(hostSynced: boolean, outcome: Record<string, unknown>) {
    if (!hostSynced) {
      pushDebugEvent("radar-form-sync", "sync-failed", outcome);
      return;
    }
    cancelTimer(state.inputRefreshTimer);
    pushDebugEvent("radar-form-sync", "sync-succeeded", outcome);
    void refreshAvailability();
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

// content.ts 가 주입하는 의존성 묶음.
//
// 의존성 상당수가 content.ts 의 IIFE 클로저 안에 정의돼 있어 바깥에서 타입을
// 끌어올 수 없다. 그래서 여기서는 "쓰는 형태"만 적는다. 해당 함수가 모듈로
// 빠져나오면 그 자리를 typeof import(...) 로 좁힌다.
/**
 * 이미 타입이 있는 의존성은 원본에서 끌어온다. 손으로 다시 적으면 원본이
 * 바뀔 때 조용히 어긋난다. content.ts 클로저 안에만 있는 것들은 형태만 적는다.
 */
type Deps = {
  state: RadarState;
  minuteToHourMinute: typeof import("../../utils/date-time.js").minuteToHourMinute;
  getTodayDateInKST: typeof import("../../utils/date-time.js").getTodayDateInKST;
  // content.ts 클로저 안에 있어 타입을 끌어올 수 없다. 쓰는 형태만 적는다.
  normalizeDateInput: (inputElement: Element | null) => string;
  normalizeTimeInput: (inputElement: Element | null) => string;
  clampDateToMin: (value: unknown, minimum: unknown) => string;
  // content.ts 클로저 안에 있어 타입을 끌어올 수 없다. 쓰는 형태만 적는다.
  ensurePanel: () => void;
  applyPanelDateChange: (nextDate: unknown) => boolean;
  getMinimumSelectableDateForCurrentContext: (value?: unknown) => string;
  getFreshScheduleCache: (date: string) => unknown;
  setScheduleLoadingDate: (date: string, isLoading: boolean, tab?: SpaceTab) => void;
  renderMapCalendarOverlay: (scheduleData: DailyScheduleResult) => void;
  refreshAvailability: () => void | Promise<void>;
  syncLmsReservationForm: (
    payload: Record<string, unknown>,
    requestId?: number,
  ) => Promise<boolean>;
};
