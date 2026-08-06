import type { RadarState } from "../state.js";
import { cancelTimer, pushDebugEvent } from "../../utils/shared.js";
import { getStorageErrorMessage } from "../../utils/storage.js";

/** sessionStorage 에 넣어두는 대기 모달 상태. */
interface PersistedSlackModalState {
  context?: Record<string, unknown>;
  requireNonEditPage?: boolean;
  reloadAttempted?: boolean;
}

/** MAIN world 훅이 보내는 예약 이벤트 페이로드. */
interface ReservationEventPayload {
  ok?: boolean;
  status?: number;
  method?: unknown;
  responseBody?: Record<string, unknown> | null;
}

// DI 팩토리 래퍼: 길이가 곧 복잡도가 아니다(안쪽 함수는 개별 측정된다).
// eslint-disable-next-line max-lines-per-function
export function createSlackSuccessFlow(deps: Deps) {
  const {
    state,
    PAGE_RESERVATION_EVENT_TYPE,
    PENDING_SLACK_MODAL_STORAGE_KEY,
    normalizeReservationMutationMethod,
    createSlackMessageFingerprint,
    shouldSkipSlackCopyModal,
    showSlackCopyModal,
    buildLmsSlackReservationContext,
    onReservationMutated,
  } = deps;

  // 개편 서비스(lms+) 예약 생성 성공 처리: 응답 body 로 Slack 모달을 띄운다.
  /** 2xx 로 끝난 예약 응답인지. */
  function isSuccessfulReservationPayload(payload: unknown): payload is ReservationEventPayload {
    if (!payload || typeof payload !== "object") {
      return false;
    }
    const candidate = payload as ReservationEventPayload;
    const status = Number(candidate.status);
    return candidate.ok === true && Number.isInteger(status) && status >= 200 && status < 300;
  }

  function handleLmsReservationSuccess(payload: ReservationEventPayload) {
    if (!isSuccessfulReservationPayload(payload)) {
      return;
    }

    // 예약이 바뀌었으니 캐시를 먼저 비운다. Slack 모달 대상(POST)인지와 무관하게,
    // 그리고 아래 지문 디듀프에 걸리기 전에 해야 레이더가 항상 최신을 그린다.
    if (typeof onReservationMutated === "function") {
      onReservationMutated();
    }

    // 현재 lms+ 지원 범위는 예약 "생성"(POST)만이다. 수정(PUT/PATCH) 성공은
    // 아직 Slack 모달 대상이 아니므로 여기서 걸러낸다(추후 확장 시 이 가드를 넓힌다).
    const method = normalizeReservationMutationMethod(payload.method);
    const responseBody = payload.responseBody;
    if (method !== "POST" || !responseBody || typeof responseBody !== "object") {
      return;
    }

    const context = buildLmsSlackReservationContext(responseBody);
    if (!context) {
      return;
    }
    context.mutationMethod = method;
    openSlackModalUnlessDuplicate(context, payload, responseBody);
  }

  /** 같은 예약에 대해 모달이 중복으로 뜨지 않게 지문으로 디듀프한다. */
  function openSlackModalUnlessDuplicate(
    context: Record<string, unknown>,
    payload: unknown,
    responseBody: Record<string, unknown>,
  ) {
    const fingerprint = createSlackMessageFingerprint(context, payload as Record<string, unknown>);
    if (shouldSkipSlackCopyModal(fingerprint)) {
      pushDebugEvent("slack-success", "lms-deduped-success", { fingerprint });
      return;
    }

    pushDebugEvent("slack-success", "lms-open-modal", {
      fingerprint,
      spaceName: responseBody.spaceName,
    });
    showSlackCopyModal(context);
  }

  /** 우리 MAIN world 훅이 보낸 예약 이벤트인지. */
  function isReservationHookMessage(event: MessageEvent) {
    const data = event.data as { source?: unknown; type?: unknown } | null;
    if (!data || typeof data !== "object") {
      return false;
    }
    return (
      event.source === window &&
      data.source === "zzk-page-reservation-hook" &&
      data.type === PAGE_RESERVATION_EVENT_TYPE
    );
  }

  function handleReservationNetworkMessage(event: MessageEvent) {
    if (!isReservationHookMessage(event)) {
      return;
    }

    const data = event.data as { payload?: ReservationEventPayload };

    // 예약 생성 응답 body 로 바로 Slack 모달을 띄운다.
    if (!data.payload) {
      return;
    }
    if (!isTrustedReservationNetworkMessage(event, data.payload)) {
      pushDebugEvent("slack-success", "lms-ignored-untrusted", {
        origin: event.origin,
      });
      return;
    }

    handleLmsReservationSuccess(data.payload);
  }

  function queuePendingSlackCopyModal(
    context: unknown,
    options: { requireNonEditPage?: boolean } = {},
  ) {
    cancelPendingSlackModalTimer();
    state.pendingSlackModalContext = context && typeof context === "object" ? { ...context } : null;
    state.pendingSlackModalRequiresNonEditPage = options?.requireNonEditPage === true;
    state.pendingSlackModalReloadAttempted = false;
    persistPendingSlackModalState();
    pushDebugEvent("slack-success", "pending-modal-saved", {
      requireNonEditPage: state.pendingSlackModalRequiresNonEditPage,
      hasContext: state.pendingSlackModalContext != null,
    });
  }

  function cancelPendingSlackModalTimer() {
    if (Number.isInteger(state.pendingSlackModalTimer)) {
      cancelTimer(state.pendingSlackModalTimer);
    }
    state.pendingSlackModalTimer = null;
  }

  /** sessionStorage 접근은 오리진·설정에 따라 던진다. 실패는 보고만 한다. */
  function removePendingSlackModalStorage(event: string): void {
    try {
      window.sessionStorage.removeItem(PENDING_SLACK_MODAL_STORAGE_KEY);
    } catch (error) {
      reportSessionStorageFailure(event, PENDING_SLACK_MODAL_STORAGE_KEY, error);
    }
  }

  /** 라우트 전환 직후엔 화면이 덜 그려져 있어 잠깐 뒤 다시 시도한다. */
  function scheduleRetryAfterRouteChange(delayMs: number): void {
    if (Number.isInteger(state.pendingSlackModalTimer)) {
      return;
    }
    state.pendingSlackModalTimer = window.setTimeout(() => {
      state.pendingSlackModalTimer = null;
      tryOpenPendingSlackCopyModal();
    }, delayMs);
  }

  function persistPendingSlackModalState() {
    if (!state.pendingSlackModalContext) {
      removePendingSlackModalStorage("write-failed");
      return;
    }

    try {
      window.sessionStorage.setItem(
        PENDING_SLACK_MODAL_STORAGE_KEY,
        JSON.stringify({
          context: state.pendingSlackModalContext,
          requireNonEditPage: state.pendingSlackModalRequiresNonEditPage === true,
          reloadAttempted: state.pendingSlackModalReloadAttempted === true,
        }),
      );
    } catch (error) {
      reportSessionStorageFailure("write-failed", PENDING_SLACK_MODAL_STORAGE_KEY, error);
    }
  }

  /** 저장된 값을 읽어 파싱한다. 접근 실패·파싱 실패 모두 null. */
  function readPendingSlackModalStorage(): PersistedSlackModalState | null {
    try {
      const rawValue = window.sessionStorage.getItem(PENDING_SLACK_MODAL_STORAGE_KEY);
      return rawValue ? (JSON.parse(rawValue) as PersistedSlackModalState) : null;
    } catch (error) {
      reportSessionStorageFailure("read-failed", PENDING_SLACK_MODAL_STORAGE_KEY, error);
      return null;
    }
  }

  function restorePendingSlackModalState() {
    const parsed = readPendingSlackModalStorage();
    if (!parsed) {
      return;
    }

    if (!parsed.context || typeof parsed.context !== "object") {
      removePendingSlackModalStorage("read-failed");
      return;
    }

    state.pendingSlackModalContext = { ...parsed.context };
    state.pendingSlackModalRequiresNonEditPage = parsed.requireNonEditPage === true;
    state.pendingSlackModalReloadAttempted = parsed.reloadAttempted === true;
  }

  function clearPendingSlackModalState() {
    cancelPendingSlackModalTimer();
    state.pendingSlackModalContext = null;
    state.pendingSlackModalRequiresNonEditPage = false;
    state.pendingSlackModalReloadAttempted = false;
    removePendingSlackModalStorage("remove-failed");
  }

  /**
   * 대기 중이던 Slack 모달을 연다.
   *
   * 타이머가 도는 사이에 사용자가 화면을 옮기거나 모달을 이미 열었을 수 있어
   * 조건을 다시 확인한다. requestAnimationFrame 은 라우팅 직후 화면이 덜
   * 그려진 상태에서 모달이 뜨는 걸 막는다.
   */
  function openPendingModalIfStillReady() {
    state.pendingSlackModalTimer = null;
    if (!state.pendingSlackModalContext || state.slackModalVisible) {
      return;
    }

    const pendingContext = state.pendingSlackModalContext;
    clearPendingSlackModalState();
    window.requestAnimationFrame(() => {
      if (state.slackModalVisible) {
        return;
      }
      pushDebugEvent("slack-success", "open-pending-modal", { pathname: location.pathname });
      showSlackCopyModal(pendingContext);
    });
  }

  function tryOpenPendingSlackCopyModal() {
    if (!state.pendingSlackModalContext || state.slackModalVisible) {
      return false;
    }

    // 라우팅 직후엔 화면이 덜 그려져 있어 잠깐 뒤 다시 시도한다.
    const elapsed = Date.now() - (state.lastGuestRouteChangeAt || 0);
    if (Number.isFinite(elapsed) && elapsed >= 0 && elapsed < 1200) {
      scheduleRetryAfterRouteChange(1200 - elapsed);
      return false;
    }

    if (Number.isInteger(state.pendingSlackModalTimer)) {
      return false;
    }

    state.pendingSlackModalTimer = window.setTimeout(openPendingModalIfStillReady, 350);
    return true;
  }

  function reportSessionStorageFailure(event: string, storageKey: string, error: unknown) {
    pushDebugEvent("storage", event, {
      area: "sessionStorage",
      key: storageKey,
      error: getStorageErrorMessage(error),
    });
  }

  // lms+ 에는 예약 수정 페이지가 없어 "수정 제출 후 복귀" 흐름 자체가 존재하지 않는다.
  // content.js 가 여전히 호출하므로 진입점만 남겨 둔다.
  function queueSlackModalFromPersistedEditSubmitIfNeeded() {}

  function isTrustedReservationNetworkMessage(event: MessageEvent, payload: unknown) {
    if (!(event instanceof MessageEvent)) {
      return false;
    }

    if (event.origin !== location.origin) {
      return false;
    }

    if (!payload || typeof payload !== "object") {
      return false;
    }

    const parsedUrl = parseUrlSafely((payload as { url?: unknown }).url);
    if (!parsedUrl) {
      return false;
    }

    return isAllowedReservationRequestOrigin(parsedUrl.origin);
  }

  function isAllowedReservationRequestOrigin(origin: unknown) {
    if (origin === location.origin) {
      return true;
    }

    return origin === "https://techcourse-lms-plus-api.woowahan.com";
  }

  function parseUrlSafely(urlValue: unknown) {
    if (typeof urlValue !== "string" || urlValue.trim() === "") {
      return null;
    }

    try {
      return new URL(urlValue, location.origin);
    } catch {
      return null;
    }
  }

  return {
    handleReservationNetworkMessage,
    queuePendingSlackCopyModal,
    restorePendingSlackModalState,
    clearPendingSlackModalState,
    tryOpenPendingSlackCopyModal,
    queueSlackModalFromPersistedEditSubmitIfNeeded,
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
type Deps = {
  state: RadarState;
  PAGE_RESERVATION_EVENT_TYPE: string;
  PENDING_SLACK_MODAL_STORAGE_KEY: string;
  showSlackCopyModal: (context: unknown) => void;
  onReservationMutated?: () => void;
  // content.js 에 있어 타입을 끌어올 수 없다. 쓰는 형태만 적는다.
  normalizeReservationMutationMethod: (value: unknown) => string;
  createSlackMessageFingerprint: (
    context: Record<string, unknown>,
    payload: Record<string, unknown>,
  ) => string;
  shouldSkipSlackCopyModal: (fingerprint: string) => boolean;
  buildLmsSlackReservationContext: (
    body: Record<string, unknown> | null,
  ) => Record<string, unknown> | null;
};
