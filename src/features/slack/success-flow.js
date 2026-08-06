(() => {
  if (globalThis.__zzkSlackSuccessFlow) {
    return;
  }

  const { pushDebugEvent, debugLog } = globalThis.__zzkSharedUtils;

  function createSlackSuccessFlow(deps) {
    const {
      state,
      PAGE_RESERVATION_EVENT_TYPE,
      PENDING_SLACK_MODAL_STORAGE_KEY,
      isGuestUiReadyForActivation,
      normalizeReservationMutationMethod,
      createSlackMessageFingerprint,
      shouldSkipSlackCopyModal,
      showSlackCopyModal,
      buildLmsSlackReservationContext,
      onReservationMutated,
    } = deps;

    // 개편 서비스(lms+) 예약 생성 성공 처리: 응답 body 로 Slack 모달을 띄운다.
    function handleLmsReservationSuccess(payload) {
      if (!payload || typeof payload !== "object") {
        return;
      }
      // 정상적으로 예약된 경우(2xx)만 처리한다.
      const status = Number(payload.status);
      if (!(payload.ok === true && Number.isInteger(status) && status >= 200 && status < 300)) {
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
      if (method !== "POST") {
        return;
      }
      const responseBody = payload.responseBody;
      if (!responseBody || typeof responseBody !== "object") {
        return;
      }

      const context = buildLmsSlackReservationContext(responseBody);
      if (!context) {
        return;
      }
      context.mutationMethod = method;

      // 같은 예약에 대해 모달이 중복으로 뜨지 않게 지문으로 디듀프한다.
      const fingerprint = createSlackMessageFingerprint(context, payload);
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

    function handleReservationNetworkMessage(event) {
      if (event.source !== window) {
        return;
      }

      const data = event.data;
      if (
        !data ||
        typeof data !== "object" ||
        data.source !== "zzk-page-reservation-hook" ||
        data.type !== PAGE_RESERVATION_EVENT_TYPE
      ) {
        return;
      }

      // 예약 생성 응답 body 로 바로 Slack 모달을 띄운다.
      if (isTrustedReservationNetworkMessage(event, data.payload)) {
        handleLmsReservationSuccess(data.payload);
      } else {
        pushDebugEvent("slack-success", "lms-ignored-untrusted", {
          origin: event.origin,
        });
      }
    }

    function queuePendingSlackCopyModal(context, options = {}) {
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
        window.clearTimeout(state.pendingSlackModalTimer);
      }
      state.pendingSlackModalTimer = null;
    }

    function persistPendingSlackModalState() {
      try {
        if (!state.pendingSlackModalContext) {
          window.sessionStorage.removeItem(PENDING_SLACK_MODAL_STORAGE_KEY);
          return;
        }
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
        return;
      }
    }

    function restorePendingSlackModalState() {
      try {
        const rawValue = window.sessionStorage.getItem(PENDING_SLACK_MODAL_STORAGE_KEY);
        if (!rawValue) {
          return;
        }
        const parsed = JSON.parse(rawValue);
        if (!parsed || typeof parsed !== "object" || !parsed.context || typeof parsed.context !== "object") {
          window.sessionStorage.removeItem(PENDING_SLACK_MODAL_STORAGE_KEY);
          return;
        }
        state.pendingSlackModalContext = { ...parsed.context };
        state.pendingSlackModalRequiresNonEditPage = parsed.requireNonEditPage === true;
        state.pendingSlackModalReloadAttempted = parsed.reloadAttempted === true;
      } catch (error) {
        reportSessionStorageFailure("read-failed", PENDING_SLACK_MODAL_STORAGE_KEY, error);
        return;
      }
    }

    function clearPendingSlackModalState() {
      cancelPendingSlackModalTimer();
      state.pendingSlackModalContext = null;
      state.pendingSlackModalRequiresNonEditPage = false;
      state.pendingSlackModalReloadAttempted = false;
      try {
        window.sessionStorage.removeItem(PENDING_SLACK_MODAL_STORAGE_KEY);
      } catch (error) {
        reportSessionStorageFailure("remove-failed", PENDING_SLACK_MODAL_STORAGE_KEY, error);
        return;
      }
    }

    function tryOpenPendingSlackCopyModal() {
      if (!state.pendingSlackModalContext || state.slackModalVisible) {
        return false;
      }
      if (!isGuestUiReadyForActivation()) {
        return false;
      }

      const elapsedSinceRouteChange = Date.now() - (state.lastGuestRouteChangeAt || 0);
      if (
        Number.isFinite(elapsedSinceRouteChange) &&
        elapsedSinceRouteChange >= 0 &&
        elapsedSinceRouteChange < 1200
      ) {
        if (!Number.isInteger(state.pendingSlackModalTimer)) {
          state.pendingSlackModalTimer = window.setTimeout(() => {
            state.pendingSlackModalTimer = null;
            tryOpenPendingSlackCopyModal();
          }, 1200 - elapsedSinceRouteChange);
        }
        return false;
      }

      if (Number.isInteger(state.pendingSlackModalTimer)) {
        return false;
      }

      state.pendingSlackModalTimer = window.setTimeout(() => {
        state.pendingSlackModalTimer = null;
        if (
          !state.pendingSlackModalContext ||
          state.slackModalVisible ||
          !isGuestUiReadyForActivation()
        ) {
          return;
        }

        const pendingContext = state.pendingSlackModalContext;
        clearPendingSlackModalState();
        window.requestAnimationFrame(() => {
          if (!state.slackModalVisible) {
            pushDebugEvent("slack-success", "open-pending-modal", {
              pathname: location.pathname,
            });
            showSlackCopyModal(pendingContext);
          }
        });
      }, 350);
      return true;
    }

    function reportSessionStorageFailure(event, storageKey, error) {
      pushDebugEvent("storage", event, {
        area: "sessionStorage",
        key: storageKey,
        error: getStorageErrorMessage(error),
      });
    }

    function getStorageErrorMessage(error) {
      if (error instanceof Error && error.message) {
        return error.message;
      }
      return String(error || "unknown storage error");
    }

    // lms+ 에는 예약 수정 페이지가 없어 "수정 제출 후 복귀" 흐름 자체가 존재하지 않는다.
    // content.js 가 여전히 호출하므로 진입점만 남겨 둔다.
    function queueSlackModalFromPersistedEditSubmitIfNeeded() {}

    function isSuccessfulReservationNetworkPayload(payload) {
      if (!payload || typeof payload !== "object") {
        return false;
      }

      const status = Number(payload.status);
      return Number.isInteger(status) && status >= 200 && status < 300 && payload.ok === true;
    }

    function isTrustedReservationNetworkMessage(event, payload) {
      if (!(event instanceof MessageEvent)) {
        return false;
      }

      if (event.origin !== location.origin) {
        return false;
      }

      if (!payload || typeof payload !== "object") {
        return false;
      }

      const parsedUrl = parseUrlSafely(payload.url);
      if (!parsedUrl) {
        return false;
      }

      return isAllowedReservationRequestOrigin(parsedUrl.origin);
    }

    function isAllowedReservationRequestOrigin(origin) {
      if (origin === location.origin) {
        return true;
      }

      return origin === "https://techcourse-lms-plus-api.woowahan.com";
    }

    function parseUrlSafely(urlValue) {
      if (typeof urlValue !== "string" || urlValue.trim() === "") {
        return null;
      }

      try {
        return new URL(urlValue, location.origin);
      } catch (error) {
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

  globalThis.__zzkSlackSuccessFlow = {
    createSlackSuccessFlow,
  };
})();
