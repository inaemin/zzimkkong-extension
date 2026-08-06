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

  const missingBootstrapDependencies = [["__zzkPageHookShared", globalThis.__zzkPageHookShared]]
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

  // 개편 서비스(lms+) 예약 생성 POST 의 성공 응답 body 를 파싱한다.
  // 응답을 clone 해서 읽으므로 원본은 페이지 앱이 그대로 소비할 수 있다.
  function isLmsReservationCreatePath(urlValue, methodValue) {
    if (String(methodValue || "").toUpperCase() !== "POST") {
      return false;
    }
    const parsed = parseUrl(urlValue);
    if (!parsed) {
      return false;
    }
    // /api/space-reservations (하위 경로 없이)
    return /\/api\/space-reservations\/?$/i.test(parsed.pathname);
  }

  function readReservationResponseBody(response, urlValue, methodValue) {
    if (!isLmsReservationCreatePath(urlValue, methodValue)) {
      return Promise.resolve(null);
    }
    if (!response || typeof response.clone !== "function") {
      return Promise.resolve(null);
    }
    let cloned;
    try {
      cloned = response.clone();
    } catch (error) {
      return Promise.resolve(null);
    }
    return cloned
      .text()
      .then((text) => {
        if (!text) {
          return null;
        }
        try {
          const parsedBody = JSON.parse(text);
          return parsedBody && typeof parsedBody === "object" ? parsedBody : null;
        } catch (error) {
          return null;
        }
      })
      .catch(() => null);
  }

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
      const requestContextPromise = extractReservationRequestContextFromFetchRequest(
        input,
        init,
      ).catch(() => null);

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

        // 개편 서비스(lms+) 예약 POST 는 응답 body 에 spaceName/floor/reserverName 등
        // Slack 메시지에 필요한 정보가 모두 들어있으므로, 응답을 복제해 파싱해 둔다.
        // (원본 response 는 소비하지 않고 그대로 페이지 앱에 돌려준다.)
        const responseBodyPromise = readReservationResponseBody(response, eventUrl, method);

        Promise.all([ownerNamePromise, requestContextPromise, responseBodyPromise])
          .then(([ownerNameCandidate, requestContext, responseBody]) => {
            const shouldEmit =
              shouldEmitReservationMutationEvent(url, method, {
                reservationAttemptId,
                requestContext,
              }) ||
              shouldEmitReservationMutationEvent(eventUrl, method, {
                reservationAttemptId,
                requestContext,
              });
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
                responseBody,
              }),
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
              }),
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
            }),
          );
        }
      });
    }

    return originalXhrSend.apply(this, arguments);
  };

  window.__zzkReservationHookLoaded = true;
})();
