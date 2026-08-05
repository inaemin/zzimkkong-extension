import {
  MESSAGE_SOURCE,
  MESSAGE_TYPE,
  buildReservationMutationEventPayload,
  emitReservationEvent,
  extractDateTimeParts,
  extractOwnerCandidateFromBody,
  extractOwnerCandidateFromEntries,
  extractOwnerCandidateFromFetchRequest,
  extractOwnerCandidateFromObject,
  extractReservationContextFromUrl,
  extractReservationRequestContextFromBody,
  extractReservationRequestContextFromEntries,
  extractReservationRequestContextFromFetchRequest,
  extractReservationRequestContextFromObject,
  finalizeReservationRequestContext,
  isDateFieldKey,
  isDescriptionFieldKey,
  isEndDateTimeFieldKey,
  isOwnerFieldKey,
  isReservationMutationRequest,
  isRoomNameFieldKey,
  isStartDateTimeFieldKey,
  mergeReservationRequestContext,
  normalizeDateCandidate,
  normalizeDescriptionCandidate,
  normalizeFieldKey,
  normalizeMethod,
  normalizeOwnerCandidate,
  normalizeText,
  normalizeTimeCandidate,
  parseUrl,
  readReservationAttemptId,
  resolveReservationRequestContextForEmit,
  shouldEmitReservationMutationEvent,
} from "./page-hook/shared.js";
import type { ReservationRequestContext } from "./page-hook/shared.js";

// 이 파일은 MAIN world 에서 페이지의 fetch/XHR 을 패치한다.
// 패치 상태와 XHR 인스턴스에 붙이는 정보를 타입으로 선언한다.
declare global {
  interface Window {
    __zzkReservationHookLoaded?: boolean;
    __zzkReservationHookRestore?: () => boolean;
  }
  interface XMLHttpRequest {
    __zzkReservationMethod?: string;
    __zzkReservationUrl?: string;
    __zzkReservationAttemptId?: string;
    __zzkReservationOwnerNameCandidate?: string;
    __zzkReservationRequestContext?: ReservationRequestContext | null;
    __zzkReservationListenerBound?: boolean;
  }
}

(() => {
  if (window.__zzkReservationHookLoaded) {
    return;
  }

  // 원본을 붙잡아 뒀다가 패치 함수 안에서 .apply(this, ...) 로 호출한다.
  // 몽키패칭의 본질이라 unbound-method 경고는 여기서 의도된 것이다.
  /* eslint-disable @typescript-eslint/unbound-method */
  const originalFetch = window.fetch;
  const originalXhrOpen = XMLHttpRequest.prototype.open;
  const originalXhrSend = XMLHttpRequest.prototype.send;
  /* eslint-enable @typescript-eslint/unbound-method */

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

  /** 응답을 복제한다. 이미 소비됐거나 복제할 수 없으면 null. */
  function cloneResponse(response) {
    if (!response || typeof response.clone !== "function") {
      return null;
    }
    try {
      return response.clone();
    } catch {
      return null;
    }
  }

  function readReservationResponseBody(response, urlValue, methodValue) {
    if (!isLmsReservationCreatePath(urlValue, methodValue)) {
      return Promise.resolve(null);
    }
    const cloned = cloneResponse(response);
    if (!cloned) {
      return Promise.resolve(null);
    }
    return cloned
      .text()
      .then(parseJsonObject)
      .catch(() => null);
  }

  /** JSON 객체면 그대로, 아니면 null. */
  function parseJsonObject(text) {
    if (!text) {
      return null;
    }
    try {
      const parsed = JSON.parse(text);
      return parsed && typeof parsed === "object" ? parsed : null;
    } catch {
      return null;
    }
  }

  /**
   * 예약 이벤트를 보낸다. 보낼 대상인지 판단도 여기서 한다.
   *
   * force 는 본문 파싱이 실패한 경로다. 이때는 URL/attemptId 만으로 판단한다
   * — 예약 요청이었다는 사실은 이미 알고 있으므로 놓치면 안 된다.
   */
  /**
   * 이 요청을 알릴지 판단한다.
   *
   * force 는 본문 파싱이 실패한 경로다. 이때는 URL/attemptId 만으로 본다 —
   * 예약 요청이었다는 사실은 이미 알고 있으므로 놓치면 안 된다.
   */
  function shouldEmitFetchEvent({ url, eventUrl, method, reservationAttemptId, force }) {
    if (force) {
      return (
        isReservationMutationRequest(url, method) ||
        isReservationMutationRequest(eventUrl, method) ||
        Boolean(reservationAttemptId)
      );
    }
    return (
      shouldEmitReservationMutationEvent(url, method) ||
      shouldEmitReservationMutationEvent(eventUrl, method)
    );
  }

  function emitFetchReservationEvent(detail) {
    const { eventUrl, method, reservationAttemptId } = detail;
    if (!shouldEmitFetchEvent(detail)) {
      return;
    }

    emitReservationEvent(
      buildReservationMutationEventPayload({
        via: "fetch",
        url: eventUrl,
        method,
        status: detail.status,
        ownerNameCandidate: detail.ownerNameCandidate,
        requestContext: detail.requestContext,
        reservationAttemptId,
        responseBody: detail.responseBody,
      }),
    );
  }

  /**
   * fetch 인자에서 URL 과 메서드를 뽑는다.
   *
   * input 은 문자열·URL·Request 셋 다 올 수 있다. init.method 가 있으면
   * input.method 를 덮어쓴다(fetch 사양 순서).
   */
  function readFetchTarget(input, init) {
    const isUrlLike = typeof input === "string" || input instanceof URL;
    const isRequestLike = !isUrlLike && Boolean(input) && typeof input === "object";

    const url = isUrlLike
      ? String(input)
      : isRequestLike && typeof input.url === "string"
        ? input.url
        : "";

    const method =
      init && typeof init === "object" && typeof init.method === "string"
        ? normalizeMethod(init.method)
        : isRequestLike
          ? normalizeMethod(input.method)
          : "GET";

    return { url, method };
  }

  /**
   * 성공 응답을 보고 예약 이벤트를 띄운다. 응답 자체는 그대로 돌려준다.
   *
   * 원본 response 는 소비하지 않는다(readReservationResponseBody 가 복제해서
   * 읽는다). 페이지 앱이 같은 응답을 다시 읽을 수 있어야 한다.
   */
  /** 세 조각이 모두 모이면 이벤트를 띄운다. 하나라도 실패하면 비운 채로 띄운다. */
  function emitWhenDetailsResolved(base, promises) {
    Promise.all(promises)
      .then(([ownerNameCandidate, requestContext, responseBody]) => {
        emitFetchReservationEvent({ ...base, ownerNameCandidate, requestContext, responseBody });
      })
      // 본문을 못 읽어도 예약 요청이었다면 알려야 한다(정보만 비운다).
      .catch(() => {
        emitFetchReservationEvent({
          ...base,
          ownerNameCandidate: "",
          requestContext: null,
          responseBody: null,
          force: true,
        });
      });
  }

  function reportFetchResponse(response, context) {
    if (!response || response.ok !== true) {
      return response;
    }

    const { url, method, reservationAttemptId } = context;
    const eventUrl = String(response.url || url || "");
    const base = { url, eventUrl, method, status: response.status, reservationAttemptId };

    emitWhenDetailsResolved(base, [
      context.ownerNamePromise,
      context.requestContextPromise,
      readReservationResponseBody(response, eventUrl, method),
    ]);

    return response;
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
      const reservationAttemptId = readReservationAttemptId();
      const ownerNamePromise = extractOwnerCandidateFromFetchRequest(input, init).catch(() => "");
      const requestContextPromise = extractReservationRequestContextFromFetchRequest(
        input,
        init,
      ).catch(() => null);

      const { url, method } = readFetchTarget(input, init);

      // 원본 fetch 에 인자를 그대로 넘겨야 해서 arguments 를 쓴다.
      // rest 로 바꾸면 호출부가 넘긴 형태(Request 객체 등)를 잃을 수 있다.
      // eslint-disable-next-line prefer-rest-params
      return Promise.resolve(originalFetch.apply(this, arguments)).then((response) =>
        reportFetchResponse(response, {
          url,
          method,
          reservationAttemptId,
          ownerNamePromise,
          requestContextPromise,
        }),
      );
    };
  }

  XMLHttpRequest.prototype.open = function patchedOpen(method, url) {
    this.__zzkReservationMethod = normalizeMethod(method);
    this.__zzkReservationUrl = typeof url === "string" ? url : String(url || "");
    // eslint-disable-next-line prefer-rest-params
    return originalXhrOpen.apply(this, arguments);
  };

  /** XHR 이 끝났을 때 예약 성공이면 이벤트를 띄운다. */
  function reportXhrReservation(xhr) {
    const method = normalizeMethod(xhr.__zzkReservationMethod);
    const url = String(xhr.__zzkReservationUrl || "");
    const status = Number(xhr.status);
    const succeeded = Number.isInteger(status) && status >= 200 && status < 300;
    if (!succeeded || !shouldEmitReservationMutationEvent(url, method)) {
      return;
    }

    emitReservationEvent(
      buildReservationMutationEventPayload({
        via: "xhr",
        url,
        method,
        status,
        ownerNameCandidate: xhr.__zzkReservationOwnerNameCandidate,
        requestContext: xhr.__zzkReservationRequestContext,
        reservationAttemptId: xhr.__zzkReservationAttemptId,
      }),
    );
  }

  XMLHttpRequest.prototype.send = function patchedSend() {
    this.__zzkReservationAttemptId = readReservationAttemptId();
    // eslint-disable-next-line prefer-rest-params
    const sendBody = arguments[0] as unknown;
    this.__zzkReservationOwnerNameCandidate = extractOwnerCandidateFromBody(sendBody);
    this.__zzkReservationRequestContext = extractReservationRequestContextFromBody(sendBody);
    if (this.__zzkReservationListenerBound !== true) {
      this.__zzkReservationListenerBound = true;
      // 한 XHR 인스턴스가 여러 번 send 될 수 있어 리스너는 한 번만 건다.
      this.addEventListener("loadend", () => reportXhrReservation(this));
    }

    // eslint-disable-next-line prefer-rest-params
    return originalXhrSend.apply(this, arguments);
  };

  window.__zzkReservationHookLoaded = true;
})();
