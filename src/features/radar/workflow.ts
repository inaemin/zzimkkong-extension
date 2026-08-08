import type { SpaceTab } from "../../constants/runtime.js";
import type { DailyScheduleResult } from "../../services/lms-data/types.js";
import type { RadarState } from "../state.js";

// content.ts 가 주입하는 의존성 묶음.
//
// 의존성 상당수가 content.ts 의 IIFE 클로저 안에 정의돼 있어 바깥에서 타입을
// 끌어올 수 없다. 그래서 여기서는 "쓰는 형태"만 적는다. 해당 함수가 모듈로
// 빠져나오면 그 자리를 typeof import(...) 로 좁힌다.
/**
 * 이미 타입이 있는 의존성은 원본에서 끌어온다. 손으로 다시 적으면 원본이
 * 바뀔 때 조용히 어긋난다. content.ts 클로저 안에만 있는 것들(state, 렌더 함수
 * 등)은 unknown 계열로 남긴다.
 */
type Deps = {
  state: RadarState;
  MAP_CALENDAR_OVERLAY_ID: string;
  MAP_CALENDAR_LAUNCHER_ID: string;
  MAP_CALENDAR_ALWAYS_OPEN_STORAGE_KEY: string;
  RADAR_LAUNCHER_Z_INDEX: number;
  DEBUG_MODE: boolean;
  DEV_BUILD: boolean;
  queryRadarOverlay: typeof import("../../ui/radar-overlay-mount.js").queryRadarOverlay;
  unmountRadarOverlay: typeof import("../../ui/radar-overlay-mount.js").unmountRadarOverlay;
  renderRadarLauncher: typeof import("../../ui/radar-launcher-mount.js").renderRadarLauncher;
  removeRadarLauncher: typeof import("../../ui/radar-launcher-mount.js").removeRadarLauncher;
  getRadarLauncherHost: typeof import("../../ui/radar-launcher-mount.js").getRadarLauncherHost;
  readStoredBoolean: typeof import("../../utils/storage.js").readStoredBoolean;
  isDateString: typeof import("../../utils/date-time.js").isDateString;
  // content.ts 클로저 안에 있어 타입을 끌어올 수 없다. 쓰는 형태만 적는다.
  normalizeDateInput: (inputElement: Element | null) => string;
  formatDateSelectorText: typeof import("../../utils/date-time.js").formatDateSelectorText;
  isRadarSupportedPage: typeof import("../../utils/routes.js").isRadarSupportedPage;
  normalizeMapCalendarSpaceTab: typeof import("../../constants/runtime.js").normalizeMapCalendarSpaceTab;
  // 아래는 content.ts 클로저 안에 있어 타입을 끌어올 수 없다. 쓰는 형태만 적는다.
  isMapCalendarModalOpenRequested: () => boolean;
  refreshDailySchedule: (date: string) => Promise<unknown>;
  setScheduleLoadingDate: (date: string, isLoading: boolean, tab?: SpaceTab) => void;
  getFreshScheduleCacheForTab: (date: string, tab?: SpaceTab, sharingMapId?: string) => unknown;
  renderMapCalendarOverlay: (scheduleData: DailyScheduleResult) => void;
  // 캐시는 형태를 보장하지 않아 unknown 으로 받는다.
  refreshAvailability: () => void | Promise<void>;
  buildSlackReservationContext: (
    rootOverride?: Document | HTMLElement | null,
  ) => Record<string, unknown>;
  showSlackCopyModal: (context: unknown) => void;
  findGuestReservationTabContainer: () => HTMLElement | null;
  findGuestReservationTabStyleSource: () => HTMLButtonElement | null;
};

// DI 팩토리 래퍼: 길이가 곧 복잡도가 아니다(안쪽 함수는 개별 측정된다).
// eslint-disable-next-line max-lines-per-function
export function createRadarWorkflow(deps: Deps) {
  const {
    state,
    renderRadarLauncher,
    removeRadarLauncher,
    getRadarLauncherHost,
    queryRadarOverlay,
    unmountRadarOverlay,
    MAP_CALENDAR_OVERLAY_ID,
    MAP_CALENDAR_LAUNCHER_ID,
    DEBUG_MODE,
    DEV_BUILD,
    MAP_CALENDAR_ALWAYS_OPEN_STORAGE_KEY,
    findGuestReservationTabContainer,
    findGuestReservationTabStyleSource,
    buildSlackReservationContext,
    showSlackCopyModal,
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
  } = deps;

  /**
   * Slack 모달 테스트 버튼을 띄울지.
   *
   * 개발 빌드에서만 뜬다. 배포 빌드는 DEV_BUILD 가 false 리터럴로 박히므로
   * 이 함수가 항상 false 를 주고 버튼이 붙지 않는다.
   *
   * 배포 빌드에서 실제 사이트를 확인해야 할 때만 localStorage 로 연다
   * (DEBUG_MODE 는 페이지가 플래그를 심어야 켜지므로 사용자에게는 안 보인다).
   */
  function shouldShowSlackModalTrigger() {
    if (DEV_BUILD) {
      return true;
    }
    if (!DEBUG_MODE) {
      return false;
    }
    try {
      return window.localStorage.getItem("zzk-manual-slack-modal-trigger-v1") === "1";
    } catch {
      return false;
    }
  }

  /** 런처를 눌렀을 때. 열면 오버레이를 띄우고 닫으면 걷는다. */
  function toggleMapCalendar(nextOpen: boolean) {
    state.mapCalendarVisible = nextOpen;
    if (nextOpen) {
      openMapCalendarModal();
    }
    if (!nextOpen) {
      removeMapCalendarOverlay();
    }
    updateMapCalendarLauncherState();
  }

  function ensureMapCalendarLauncher() {
    if (!isRadarSupportedPage() || !(document.body instanceof HTMLBodyElement)) {
      return;
    }

    const isOpen = !state.mapCalendarSuppressedBySlack && isMapCalendarModalOpenRequested();

    const launcher = renderRadarLauncher({
      open: isOpen,
      onOpenChange: toggleMapCalendar,
      // 개발 빌드에서만 런처 옆에 Slack 모달 테스트 버튼이 붙는다.
      onOpenSlackModal: shouldShowSlackModalTrigger()
        ? () => showSlackCopyModal(buildSlackReservationContext())
        : null,
    });

    scheduleAutoOpenMapCalendarLauncher(launcher);
  }

  /** 자동 열기를 시도할 상황인지. 아니면 상태를 정리하고 false. */
  function shouldConsiderAutoOpen() {
    if (state.mapCalendarSuppressedBySlack) {
      state.lastAutoOpenPath = null;
      return false;
    }
    // "항상 열기" 설정이 꺼져 있으면 사용자가 직접 눌러야 한다.
    return readStoredBoolean(MAP_CALENDAR_ALWAYS_OPEN_STORAGE_KEY, true);
  }

  function scheduleAutoOpenMapCalendarLauncher(launcher: HTMLElement | null) {
    if (!(launcher instanceof HTMLButtonElement) || !isRadarSupportedPage()) {
      return;
    }

    if (!shouldConsiderAutoOpen()) {
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
  function clickLauncherIfStillClosed(expectedPath: string) {
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

  function ensureMapCalendarLoadingOverlay(bodyElement: Element | null, forceCreate = false) {
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

    const loadingOverlay = createLoadingOverlay();
    bodyElement.appendChild(loadingOverlay);
    return loadingOverlay;
  }

  /** 스피너 + 문구를 담은 로딩 오버레이. */
  function createLoadingOverlay() {
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
    return loadingOverlay;
  }

  /** 지금 로딩 중인 날짜·탭이 화면에 보이는 그것인지. */
  function isLoadingCurrentView() {
    return (
      state.scheduleLoadingDate === state.activeScheduleDate &&
      state.scheduleLoadingTab === state.activeScheduleTab &&
      isMapCalendarModalOpenRequested()
    );
  }

  function syncMapCalendarBodyLoadingState() {
    // 오버레이가 shadow root 안이라 document 로는 자식을 찾을 수 없다.
    const body = queryRadarOverlay('[data-testid="radar-body"]');
    if (!(body instanceof HTMLElement)) {
      return;
    }

    const loadingDate = state.scheduleLoadingDate || "";
    const hasLoadingDate = isDateString(loadingDate);
    const shouldShowLoading = hasLoadingDate && isLoadingCurrentView();

    body.classList.toggle("zzk-map-calendar-body-loading", shouldShowLoading);
    body.setAttribute("aria-busy", shouldShowLoading ? "true" : "false");

    const loadingOverlay = ensureMapCalendarLoadingOverlay(body, shouldShowLoading);
    if (!(loadingOverlay instanceof HTMLElement)) {
      return;
    }
    loadingOverlay.setAttribute("aria-hidden", shouldShowLoading ? "false" : "true");
    updateLoadingText(loadingOverlay, hasLoadingDate ? loadingDate : "");
  }

  /** 로딩 문구에 날짜를 붙인다(날짜를 알 때만). */
  function updateLoadingText(loadingOverlay: HTMLElement, loadingDate: string) {
    const loadingText = loadingOverlay.querySelector(".zzk-map-calendar-loading-text");
    if (!(loadingText instanceof HTMLElement)) {
      return;
    }
    const loadingDateLabel = loadingDate ? formatDateSelectorText(loadingDate) : "";
    loadingText.textContent = loadingDateLabel
      ? `${loadingDateLabel} 예약 현황 로딩 중...`
      : "예약 현황 로딩 중...";
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
    if (!isRadarSupportedPage()) {
      updateMapCalendarLauncherState();
      return false;
    }

    if (state.mapCalendarSuppressedBySlack) {
      removeMapCalendarOverlay();
      return false;
    }

    return true;
  }

  /** 캐시가 살아 있으면 서버를 기다리지 않고 바로 그린다. */
  function renderCachedSchedule(
    targetDate: string,
    activeTab: SpaceTab,
    cachedSchedule: DailyScheduleResult,
  ) {
    state.activeScheduleDate = targetDate;
    state.activeScheduleTab = activeTab;
    setScheduleLoadingDate(targetDate, false, activeTab);
    renderMapCalendarOverlay(cachedSchedule);
  }

  /** 캐시가 있으면 바로 그리고, 없으면 받아온다. */
  function showScheduleForDate(targetDate: string, activeTab: SpaceTab) {
    const cached = getFreshScheduleCacheForTab(targetDate, activeTab) as DailyScheduleResult | null;
    if (cached) {
      renderCachedSchedule(targetDate, activeTab, cached);
      return;
    }
    refreshDailySchedule(targetDate).catch(() => {
      // 사용자에게 보이는 에러는 React 오버레이(renderRadarError)가 그린다.
      updateMapCalendarLauncherState();
    });
  }

  function openMapCalendarModal() {
    if (!canOpenMapCalendarModal()) {
      return;
    }

    const activeTab = normalizeMapCalendarSpaceTab(state.mapCalendarSpaceTab);
    const targetDate = resolveTargetScheduleDate();
    if (targetDate) {
      showScheduleForDate(targetDate, activeTab);
      return;
    }

    void refreshAvailability();
    updateMapCalendarLauncherState();
  }

  function removeMapCalendarOverlay() {
    // React 루트까지 정리한다. host 만 지우면 루트가 살아남아 툴팁 지연 타이머
    // 같은 것이 계속 돈다.
    unmountRadarOverlay();
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
