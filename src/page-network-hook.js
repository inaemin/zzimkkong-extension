(() => {
  if (window.__zzkReservationHookLoaded) {
    return;
  }

  function reportMissingBootstrapDependencies(missing) {
    if (!Array.isArray(globalThis.__zzkBootstrapLoadErrors)) {
      globalThis.__zzkBootstrapLoadErrors = [];
    }
    globalThis.__zzkBootstrapLoadErrors.push({
      script: "src/page-network-hook.js",
      reason: "missing-bootstrap-dependencies",
      missing,
    });
  }

  const missingBootstrapDependencies = [
    ["__zzkPageHookShared", globalThis.__zzkPageHookShared],
  ]
    .filter(([, value]) => !value)
    .map(([name]) => name);

  if (missingBootstrapDependencies.length > 0) {
    reportMissingBootstrapDependencies(missingBootstrapDependencies);
    return;
  }

  const {
    MESSAGE_SOURCE,
    MESSAGE_TYPE,
    normalizeMethod,
    parseUrl,
    normalizeText,
    normalizeOwnerCandidate,
    isOwnerFieldKey,
    extractOwnerCandidateFromEntries,
    extractOwnerCandidateFromObject,
    extractOwnerCandidateFromBody,
    extractOwnerCandidateFromFetchRequest,
    normalizeFieldKey,
    normalizeDateCandidate,
    normalizeTimeCandidate,
    extractDateTimeParts,
    normalizeDescriptionCandidate,
    isStartDateTimeFieldKey,
    isEndDateTimeFieldKey,
    isDateFieldKey,
    isDescriptionFieldKey,
    isRoomNameFieldKey,
    mergeReservationRequestContext,
    finalizeReservationRequestContext,
    extractReservationRequestContextFromEntries,
    extractReservationRequestContextFromObject,
    extractReservationRequestContextFromBody,
    extractReservationContextFromUrl,
    resolveReservationRequestContextForEmit,
    extractReservationRequestContextFromFetchRequest,
    isReservationMutationRequest,
    shouldEmitReservationMutationEvent,
    emitReservationEvent,
    buildReservationMutationEventPayload,
    readReservationAttemptId,
  } = globalThis.__zzkPageHookShared;

  const originalFetch = window.fetch;
  const originalXhrOpen = XMLHttpRequest.prototype.open;
  const originalXhrSend = XMLHttpRequest.prototype.send;

  window.__zzkReservationHookRestore = function restoreReservationNetworkHook() {
    if (typeof originalFetch === "function" && window.fetch !== originalFetch) {
      window.fetch = originalFetch;
    }
    if (XMLHttpRequest.prototype.open !== originalXhrOpen) {
      XMLHttpRequest.prototype.open = originalXhrOpen;
    }
    if (XMLHttpRequest.prototype.send !== originalXhrSend) {
      XMLHttpRequest.prototype.send = originalXhrSend;
    }
    window.__zzkReservationHookLoaded = false;
    delete window.__zzkReservationHookRestore;
    return true;
  };

  if (typeof originalFetch === "function") {
    window.fetch = function patchedFetch(input, init) {
      let url = "";
      let method = "GET";
      const reservationAttemptId = readReservationAttemptId();
      const ownerNamePromise = extractOwnerCandidateFromFetchRequest(input, init).catch(() => "");
      const requestContextPromise = extractReservationRequestContextFromFetchRequest(input, init).catch(
        () => null
      );

      if (typeof input === "string" || input instanceof URL) {
        url = String(input);
      } else if (input && typeof input === "object") {
        url = typeof input.url === "string" ? input.url : "";
        method = normalizeMethod(input.method);
      }

      if (init && typeof init === "object" && typeof init.method === "string") {
        method = normalizeMethod(init.method);
      }

      return Promise.resolve(originalFetch.apply(this, arguments)).then((response) => {
        if (!response || response.ok !== true) {
          return response;
        }

        const eventUrl = String(response.url || url || "");

        Promise.all([ownerNamePromise, requestContextPromise])
          .then(([ownerNameCandidate, requestContext]) => {
            const shouldEmit =
              shouldEmitReservationMutationEvent(url, method, { reservationAttemptId, requestContext }) ||
              shouldEmitReservationMutationEvent(eventUrl, method, { reservationAttemptId, requestContext });
            if (!shouldEmit) {
              return;
            }
            emitReservationEvent(
              buildReservationMutationEventPayload({
                via: "fetch",
                url: eventUrl,
                method,
                status: response.status,
                ownerNameCandidate,
                requestContext,
                reservationAttemptId,
              })
            );
          })
          .catch(() => {
            if (
              !isReservationMutationRequest(url, method) &&
              !isReservationMutationRequest(eventUrl, method) &&
              !reservationAttemptId
            ) {
              return;
            }
            emitReservationEvent(
              buildReservationMutationEventPayload({
                via: "fetch",
                url: eventUrl,
                method,
                status: response.status,
                ownerNameCandidate: "",
                requestContext: null,
                reservationAttemptId,
              })
            );
          });

        return response;
      });
    };
  }

  XMLHttpRequest.prototype.open = function patchedOpen(method, url) {
    this.__zzkReservationMethod = normalizeMethod(method);
    this.__zzkReservationUrl = typeof url === "string" ? url : String(url || "");
    return originalXhrOpen.apply(this, arguments);
  };

  XMLHttpRequest.prototype.send = function patchedSend() {
    this.__zzkReservationAttemptId = readReservationAttemptId();
    this.__zzkReservationOwnerNameCandidate = extractOwnerCandidateFromBody(arguments[0]);
    this.__zzkReservationRequestContext = extractReservationRequestContextFromBody(arguments[0]);
    if (this.__zzkReservationListenerBound !== true) {
      this.__zzkReservationListenerBound = true;
      this.addEventListener("loadend", () => {
        const method = normalizeMethod(this.__zzkReservationMethod);
        const url = String(this.__zzkReservationUrl || "");
        const status = Number(this.status);
        if (
          Number.isInteger(status) &&
          status >= 200 &&
          status < 300 &&
          shouldEmitReservationMutationEvent(url, method, {
            reservationAttemptId: this.__zzkReservationAttemptId,
            requestContext: this.__zzkReservationRequestContext,
          })
        ) {
          emitReservationEvent(
            buildReservationMutationEventPayload({
              via: "xhr",
              url,
              method,
              status,
              ownerNameCandidate: this.__zzkReservationOwnerNameCandidate,
              requestContext: this.__zzkReservationRequestContext,
              reservationAttemptId: this.__zzkReservationAttemptId,
            })
          );
        }
      });
    }

    return originalXhrSend.apply(this, arguments);
  };

  window.__zzkReservationHookLoaded = true;
})();
