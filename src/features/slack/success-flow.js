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
      BLANK_GUEST_RECOVERY_STORAGE_KEY,
      isGuestReservationFlowPage,
      isGuestSuccessPage,
      isGuestReservationEditPage,
      isGuestPage,
      isGuestUiReadyForActivation,
      teardownGuestUi,
      buildSlackReservationContext,
      resolveReservationContextFromPayload,
      readSuccessPageReservationContext,
      buildMergedSlackReservationContext,
      normalizeReservationMutationMethod,
      createSlackMessageFingerprint,
      shouldSkipSlackCopyModal,
      clearPendingEditSubmitState,
      showSlackCopyModal,
      getHostReservationRoot,
      queryHostDateInput,
      findHostBookingSubmitButton,
      rememberReservationOwnerName,
      resolveReservationOwnerNameFromPayload,
      isMeaningfulSlackContextValue,
      getSharingMapId,
      readPendingEditSubmitState,
      resolveReservationAttemptForPayload,
      shouldIgnoreAmbiguousReservationSuccess,
      consumeReservationAttempt,
    } = deps;
    const BLANK_GUEST_RECOVERY_STABLE_DELAY_MS = 700;

    function handleReservationNetworkMessage(event) {
      if (!isGuestReservationFlowPage() || event.source !== window) {
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

      const payload = data.payload;
      if (!isTrustedReservationNetworkMessage(event, payload)) {
        pushDebugEvent("slack-success", "ignored-untrusted-message", {
          origin: event.origin,
          url: payload && typeof payload === "object" ? payload.url : "",
        });
        return;
      }

      const payloadContext = resolveReservationContextFromPayload(payload);
      const matchedAttempt =
        typeof resolveReservationAttemptForPayload === "function"
          ? resolveReservationAttemptForPayload(payload)
          : null;

      if (
        !isReservationMutationSuccessPayload(payload) &&
        !isRecoverableReservationMutationSuccessPayload(payload, matchedAttempt, payloadContext)
      ) {
        return;
      }

      const elapsedSinceAction = Date.now() - (state.lastReservationActionAt || 0);
      if (
        (!matchedAttempt && !Number.isFinite(elapsedSinceAction)) ||
        (!matchedAttempt && elapsedSinceAction < 0) ||
        (!matchedAttempt && elapsedSinceAction > 20000)
      ) {
        pushDebugEvent("slack-success", "ignored-stale-success", {
          elapsedSinceAction,
          method: payload?.method,
          url: payload?.url,
        });
        return;
      }

      const payloadOwnerName = resolveReservationOwnerNameFromPayload(payload);
      if (isMeaningfulSlackContextValue(payloadOwnerName)) {
        rememberReservationOwnerName(payloadOwnerName);
      }

      if (isGuestSuccessPage()) {
        teardownGuestUi({ preserveReservationContext: true });
      }

      const liveContext = buildSlackReservationContext();
      if (
        typeof shouldIgnoreAmbiguousReservationSuccess === "function" &&
        shouldIgnoreAmbiguousReservationSuccess(payload, payloadContext)
      ) {
        pushDebugEvent("slack-success", "ignored-ambiguous-success", {
          method: payload?.method,
          url: payload?.url,
        });
        return;
      }
      const successPageContext = readSuccessPageReservationContext();
      const mergedContext = buildMergedSlackReservationContext({
        liveContext,
        snapshotContext:
          matchedAttempt && matchedAttempt.context && typeof matchedAttempt.context === "object"
            ? matchedAttempt.context
            : state.lastReservationContext,
        payloadContext,
        successPageContext,
        payloadOwnerName,
      });
      mergedContext.mutationMethod = normalizeReservationMutationMethod(payload.method);
      const fingerprint = createSlackMessageFingerprint(mergedContext, payload);
      if (shouldSkipSlackCopyModal(fingerprint)) {
        pushDebugEvent("slack-success", "deduped-success", {
          fingerprint,
          method: payload?.method,
          url: payload?.url,
        });
        return;
      }

      debugLog("slack-success", "accepted reservation success", {
        fingerprint,
        method: payload?.method,
        url: payload?.url,
        pathname: location.pathname,
      });

      clearPendingEditSubmitState();
      if (typeof consumeReservationAttempt === "function") {
        consumeReservationAttempt(matchedAttempt?.id || payload?.reservationAttemptId || "");
      }

      if (shouldDeferSlackCopyModalForCurrentPage(payload)) {
        pushDebugEvent("slack-success", "queue-pending-after-edit", {
          fingerprint,
          pathname: location.pathname,
        });
        queuePendingSlackCopyModal(mergedContext, { requireNonEditPage: true });
        navigateToGuestBookingPageAfterEditSuccess();
        state.lastReservationContext = null;
        return;
      }

      if (
        (!isGuestPage() && !isGuestSuccessPage()) ||
        shouldForceReloadBlankGuestPageForPendingSlackModal()
      ) {
        pushDebugEvent("slack-success", "queue-pending-unready", {
          fingerprint,
          pathname: location.pathname,
          isGuestPage: isGuestPage(),
          isGuestSuccessPage: isGuestSuccessPage(),
        });
        queuePendingSlackCopyModal(mergedContext);
        state.lastReservationContext = null;
        return;
      }

      pushDebugEvent("slack-success", "open-modal-now", {
        fingerprint,
        pathname: location.pathname,
      });
      showSlackCopyModal(mergedContext);
      state.lastReservationContext = null;
    }

    function shouldDeferSlackCopyModalForCurrentPage(payload) {
      const mutationMethod = normalizeReservationMutationMethod(payload?.method);
      return isGuestReservationEditPage() && (mutationMethod === "PUT" || mutationMethod === "PATCH");
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
      if (state.pendingSlackModalRequiresNonEditPage === true && isGuestReservationEditPage()) {
        return false;
      }
      if (
        state.pendingSlackModalRequiresNonEditPage === true &&
        !state.pendingSlackModalReloadAttempted &&
        shouldForceReloadBlankGuestPageForPendingSlackModal()
      ) {
        state.pendingSlackModalReloadAttempted = true;
        persistPendingSlackModalState();
        window.location.reload();
        return false;
      }

      if (!isGuestPage() || !isGuestUiReadyForActivation()) {
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
          !isGuestPage() ||
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

    function isBlankGuestPageState() {
      if (!isGuestPage() || isGuestReservationEditPage()) {
        return false;
      }

      const root = document.getElementById("root");
      if (!(root instanceof HTMLElement)) {
        return false;
      }

      const hostRoot = getHostReservationRoot();
      const hasBookingForm = hostRoot instanceof HTMLElement;
      const hasDateInput = queryHostDateInput(document) instanceof HTMLInputElement;
      const hasBookingAction = findHostBookingSubmitButton(document) instanceof HTMLElement;

      return !hasBookingForm && !hasDateInput && !hasBookingAction && root.innerHTML.trim() === "";
    }

    function buildBlankGuestRecoveryKey() {
      return `${location.pathname}`;
    }

    function tryRecoverBlankGuestPage() {
      if (!isBlankGuestPageStableForRecovery()) {
        return false;
      }

      const recoveryKey = buildBlankGuestRecoveryKey();
      try {
        const existingKey = window.sessionStorage.getItem(BLANK_GUEST_RECOVERY_STORAGE_KEY) || "";
        if (existingKey === recoveryKey) {
          return false;
        }
        window.sessionStorage.setItem(BLANK_GUEST_RECOVERY_STORAGE_KEY, recoveryKey);
      } catch (error) {
        reportSessionStorageFailure("read-failed", BLANK_GUEST_RECOVERY_STORAGE_KEY, error);
        return false;
      }

      window.location.reload();
      return true;
    }

    function isBlankGuestPageStableForRecovery() {
      if (!isBlankGuestPageState()) {
        clearBlankGuestRecoveryPendingState();
        return false;
      }

      const now = Date.now();
      if (!Number.isFinite(state.blankGuestRecoveryFirstSeenAt)) {
        state.blankGuestRecoveryFirstSeenAt = now;
      }

      const elapsedBlankMs = now - state.blankGuestRecoveryFirstSeenAt;
      if (
        Number.isFinite(elapsedBlankMs) &&
        elapsedBlankMs >= 0 &&
        elapsedBlankMs < BLANK_GUEST_RECOVERY_STABLE_DELAY_MS
      ) {
        scheduleBlankGuestRecoveryRetry(
          BLANK_GUEST_RECOVERY_STABLE_DELAY_MS - elapsedBlankMs,
        );
        return false;
      }

      return true;
    }

    function scheduleBlankGuestRecoveryRetry(delayMs) {
      if (Number.isInteger(state.blankGuestRecoveryTimer)) {
        return;
      }
      const retryDelay = Math.max(0, Math.ceil(Number(delayMs) || 0));
      state.blankGuestRecoveryTimer = window.setTimeout(() => {
        state.blankGuestRecoveryTimer = null;
        if (
          state.pendingSlackModalContext &&
          state.pendingSlackModalRequiresNonEditPage === true
        ) {
          tryOpenPendingSlackCopyModal();
          return;
        }
        tryRecoverBlankGuestPage();
      }, retryDelay);
    }

    function clearBlankGuestRecoveryPendingState() {
      if (Number.isInteger(state.blankGuestRecoveryTimer)) {
        window.clearTimeout(state.blankGuestRecoveryTimer);
      }
      state.blankGuestRecoveryTimer = null;
      state.blankGuestRecoveryFirstSeenAt = null;
    }

    function clearBlankGuestRecoveryIfPageReady() {
      if (isBlankGuestPageState()) {
        return;
      }

      clearBlankGuestRecoveryPendingState();

      try {
        window.sessionStorage.removeItem(BLANK_GUEST_RECOVERY_STORAGE_KEY);
      } catch (error) {
        reportSessionStorageFailure("remove-failed", BLANK_GUEST_RECOVERY_STORAGE_KEY, error);
        return;
      }
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

    function shouldForceReloadBlankGuestPageForPendingSlackModal() {
      return isBlankGuestPageStableForRecovery();
    }

    function shouldQueueSlackModalFromPersistedEditSubmit() {
      if (!isGuestPage() || isGuestReservationEditPage()) {
        return false;
      }
      if (state.pendingSlackModalContext) {
        return false;
      }
      const pendingEditSubmitState = readPendingEditSubmitState();
      if (!pendingEditSubmitState || typeof pendingEditSubmitState.sharingMapId !== "string") {
        return false;
      }
      if (pendingEditSubmitState.sharingMapId !== getSharingMapId()) {
        return false;
      }
      const elapsedSinceAction = Date.now() - Number(pendingEditSubmitState.at || 0);
      return Number.isFinite(elapsedSinceAction) && elapsedSinceAction >= 0 && elapsedSinceAction <= 20000;
    }

    function queueSlackModalFromPersistedEditSubmitIfNeeded() {
      if (!shouldQueueSlackModalFromPersistedEditSubmit()) {
        return;
      }
      const pendingContext = buildPendingSlackContextFromEditReturn();
      if (!pendingContext) {
        return;
      }
      pushDebugEvent("slack-success", "restore-from-persisted-edit", {
        pathname: location.pathname,
      });
      queuePendingSlackCopyModal(pendingContext, { requireNonEditPage: false });
      state.lastReservationContext = null;
      clearPendingEditSubmitState();
    }

    function buildPendingSlackContextFromEditReturn() {
      const pendingEditSubmitState = readPendingEditSubmitState();
      const persistedContext =
        pendingEditSubmitState &&
        pendingEditSubmitState.context &&
        typeof pendingEditSubmitState.context === "object"
          ? { ...pendingEditSubmitState.context }
          : null;
      const snapshotContext =
        persistedContext ||
        (state.lastReservationContext && typeof state.lastReservationContext === "object"
          ? { ...state.lastReservationContext }
          : null);
      if (!snapshotContext) {
        return null;
      }

      snapshotContext.mutationMethod = "PUT";
      return snapshotContext;
    }

    function navigateToGuestBookingPageAfterEditSuccess() {
      const sharingMapId = getSharingMapId();
      if (!sharingMapId) {
        return;
      }

      const targetUrl = `${location.origin}/guest/${encodeURIComponent(sharingMapId)}`;
      if (location.href === targetUrl) {
        return;
      }

      window.location.assign(targetUrl);
    }

    function isReservationMutationSuccessPayload(payload) {
      if (!payload || typeof payload !== "object") {
        return false;
      }

      if (!isSuccessfulReservationNetworkPayload(payload)) {
        return false;
      }

      return isReservationMutationRequest(payload.url, payload.method);
    }

    function isRecoverableReservationMutationSuccessPayload(payload, matchedAttempt, payloadContext) {
      if (!isSuccessfulReservationNetworkPayload(payload)) {
        return false;
      }

      if (!isReservationMutationMethod(payload.method)) {
        return false;
      }

      const parsedUrl = parseUrlSafely(payload.url);
      if (
        !parsedUrl ||
        !isAllowedReservationRequestOrigin(parsedUrl.origin) ||
        !isRecoverableReservationMutationSignalPath(parsedUrl.pathname)
      ) {
        return false;
      }

      return Boolean(matchedAttempt || isCompleteReservationPayloadContext(payloadContext));
    }

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

      return origin === "https://k8s.zzimkkong.com";
    }

    function isReservationMutationRequest(urlValue, methodValue) {
      if (!isReservationMutationMethod(methodValue)) {
        return false;
      }

      const parsedUrl = parseUrlSafely(urlValue);
      if (!parsedUrl) {
        return false;
      }
      if (!isAllowedReservationRequestOrigin(parsedUrl.origin)) {
        return false;
      }

      if (!isReservationMutationPath(parsedUrl.pathname)) {
        return false;
      }

      return true;
    }

    function isReservationMutationMethod(methodValue) {
      const method = String(methodValue || "GET").toUpperCase();
      return method !== "GET" && method !== "HEAD" && method !== "OPTIONS";
    }

    function isReservationMutationPath(pathname) {
      return /\/api\/guests\/maps\/[^/]+(?:\/spaces\/[^/]+)?\/reservations(?:\/[^/]+)?\/?$/i.test(
        String(pathname || "")
      );
    }

    function isRecoverableReservationMutationSignalPath(pathname) {
      return String(pathname || "").toLowerCase().includes("/bookings/complete");
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
      tryRecoverBlankGuestPage,
      clearBlankGuestRecoveryIfPageReady,
      queueSlackModalFromPersistedEditSubmitIfNeeded,
    };
  }

  globalThis.__zzkSlackSuccessFlow = {
    createSlackSuccessFlow,
  };
})();
