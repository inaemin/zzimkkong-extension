import path from "node:path";
import fs from "node:fs";
import { expect, test } from "@playwright/test";

const WEB_ORIGIN = "https://techcourse-lms-plus-web.woowahan.com";
const API_ORIGIN = "https://techcourse-lms-plus-api.woowahan.com";
const RESERVATIONS_URL = `${API_ORIGIN}/api/space-reservations`;

async function injectPageNetworkHookBundle(page) {
  await page.addScriptTag({ path: path.resolve(process.cwd(), "src/page-hook/shared.js") });
  await page.addScriptTag({ path: path.resolve(process.cwd(), "src/page-network-hook.js") });
}

// 실제 사이트는 미인증 요청을 로그인 페이지로 돌려보내므로 문서 응답을 고정한다.
async function gotoReservationPage(page) {
  await page.route(`${WEB_ORIGIN}/**`, async (route) => {
    if (route.request().resourceType() !== "document") {
      await route.continue();
      return;
    }
    await route.fulfill({
      status: 200,
      contentType: "text/html",
      body: "<html><body></body></html>",
    });
  });
  await page.goto(`${WEB_ORIGIN}/space-reservations`, { waitUntil: "domcontentloaded" });
}

async function routeReservationApi(page, body = "{}", status = 200) {
  await page.route(`${API_ORIGIN}/api/space-reservations**`, async (route) => {
    await route.fulfill({
      status,
      headers: {
        "access-control-allow-origin": WEB_ORIGIN,
        "access-control-allow-credentials": "true",
        "content-type": "application/json",
      },
      body,
    });
  });
}

async function collectReservationHookMessages(page, action, actionArgument = null) {
  return await page.evaluate(async ({ actionSource, argument }) => {
    const actionFn = new Function("argument", `return (${actionSource})(argument);`);
    const messages = [];
    const handleMessage = (event) => {
      const data = event.data;
      if (
        !data ||
        typeof data !== "object" ||
        data.source !== "zzk-page-reservation-hook" ||
        data.type !== "ZZK_RESERVATION_NETWORK_EVENT"
      ) {
        return;
      }
      messages.push(data.payload || {});
    };

    window.addEventListener("message", handleMessage);
    try {
      await actionFn(argument);
      await new Promise((resolve) => window.setTimeout(resolve, 120));
      return messages;
    } finally {
      window.removeEventListener("message", handleMessage);
    }
  }, { actionSource: action.toString(), argument: actionArgument });
}

test("page network hook emits ownerNameCandidate from reservation request body", async ({ page }) => {
  await gotoReservationPage(page);
  await routeReservationApi(page);
  await injectPageNetworkHookBundle(page);

  const messages = await collectReservationHookMessages(page, async (url) => {
    await fetch(url, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        reserverName: "애니",
        startDateTime: "2026-03-02T10:00:00+09:00",
        endDateTime: "2026-03-02T10:30:00+09:00",
        purpose: "연극연습",
        spaceName: "11층 금성",
        spaceId: 263,
      }),
    });
  }, RESERVATIONS_URL);

  expect(messages).toHaveLength(1);
  expect(messages[0]).toMatchObject({
    via: "fetch",
    ok: true,
    ownerNameCandidate: "애니",
    requestContext: {
      date: "2026-03-02",
      startTime: "10:00",
      endTime: "10:30",
      description: "연극연습",
      roomName: "11층 금성",
      // lms+ 는 경로가 아니라 본문의 spaceId 로 방을 식별한다.
      roomId: 263,
    },
  });
});

test("page network hook includes reservationAttemptId from document dataset", async ({ page }) => {
  await gotoReservationPage(page);
  await routeReservationApi(page);
  await injectPageNetworkHookBundle(page);

  const messages = await collectReservationHookMessages(page, async (url) => {
    document.documentElement.dataset.zzkReservationAttemptId = "attempt-fetch-1";
    await fetch(url, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        startDateTime: "2026-03-02T10:00:00+09:00",
        endDateTime: "2026-03-02T10:30:00+09:00",
        purpose: "attempt fetch",
      }),
    });

    document.documentElement.dataset.zzkReservationAttemptId = "attempt-xhr-2";
    const xhr = new XMLHttpRequest();
    xhr.open("POST", url);
    xhr.setRequestHeader("content-type", "application/json");
    await new Promise((resolve) => {
      xhr.addEventListener("loadend", resolve, { once: true });
      xhr.send(
        JSON.stringify({
          startDateTime: "2026-03-02T11:00:00+09:00",
          endDateTime: "2026-03-02T11:30:00+09:00",
          purpose: "attempt xhr",
        }),
      );
    });
  }, RESERVATIONS_URL);

  expect(messages).toHaveLength(2);
  expect(messages[0]).toMatchObject({
    via: "fetch",
    reservationAttemptId: "attempt-fetch-1",
  });
  expect(messages[1]).toMatchObject({
    via: "xhr",
    reservationAttemptId: "attempt-xhr-2",
  });
});

const roomIdBodyCases = [
  {
    name: "JSON spaceId",
    bodyType: "json-space-id",
    headers: { "content-type": "application/json" },
  },
  {
    name: "FormData roomId",
    bodyType: "form-room-id",
    headers: {},
  },
  {
    name: "URLSearchParams space_id",
    bodyType: "params-space-id",
    headers: {},
  },
];

for (const { name, bodyType, headers } of roomIdBodyCases) {
  test(`page network hook preserves room id from ${name} reservation body`, async ({ page }) => {
    await gotoReservationPage(page);
    await routeReservationApi(page);
    await injectPageNetworkHookBundle(page);

    const messages = await collectReservationHookMessages(
      page,
      async ({ requestBodyType, requestHeaders, url }) => {
        let body;
        if (requestBodyType === "json-space-id") {
          body = JSON.stringify({
            date: "2026-03-02",
            startTime: "10:00",
            endTime: "10:30",
            purpose: "space id json",
            spaceId: "263",
          });
        } else if (requestBodyType === "form-room-id") {
          body = new FormData();
          body.set("date", "2026-03-02");
          body.set("startTime", "10:00");
          body.set("endTime", "10:30");
          body.set("purpose", "room id formdata");
          body.set("roomId", "263");
        } else {
          body = new URLSearchParams({
            date: "2026-03-02",
            startTime: "10:00",
            endTime: "10:30",
            purpose: "space id params",
            space_id: "263",
          });
        }

        await fetch(url, {
          method: "POST",
          headers: requestHeaders,
          body,
        });
      },
      { requestBodyType: bodyType, requestHeaders: headers, url: RESERVATIONS_URL },
    );

    expect(messages).toHaveLength(1);
    expect(messages[0].requestContext).toMatchObject({
      date: "2026-03-02",
      startTime: "10:00",
      endTime: "10:30",
      roomId: 263,
    });
    expect(messages[0].requestContext.roomName).not.toBe("263");
  });
}

test("page network hook ignores non-reservation API mutations even with an attempt id", async ({ page }) => {
  await gotoReservationPage(page);

  await page.route(`${API_ORIGIN}/api/notifications`, async (route) => {
    await route.fulfill({
      status: 200,
      headers: {
        "access-control-allow-origin": WEB_ORIGIN,
        "access-control-allow-credentials": "true",
        "content-type": "application/json",
      },
      body: "{}",
    });
  });

  await injectPageNetworkHookBundle(page);

  const messages = await collectReservationHookMessages(page, async (origin) => {
    document.documentElement.dataset.zzkReservationAttemptId = "attempt-unrelated-path";
    await fetch(`${origin}/api/notifications`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ message: "not a reservation" }),
    });

    delete document.documentElement.dataset.zzkReservationAttemptId;
    await fetch(`${origin}/api/notifications`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        date: "2026-03-02",
        startTime: "09:30",
        endTime: "10:30",
        purpose: "필드는 완전하지만 예약 API 가 아님",
        spaceName: "11층 수성",
      }),
    });
  }, API_ORIGIN);

  expect(messages).toHaveLength(0);
});

test("page network hook extracts ownerNameCandidate from Request(FormData)", async ({ page }) => {
  await gotoReservationPage(page);
  await routeReservationApi(page);
  await injectPageNetworkHookBundle(page);

  const messages = await collectReservationHookMessages(page, async (url) => {
    const formData = new FormData();
    formData.set("reserverName", "애니");
    formData.set("startDateTime", "2026-03-02T15:20:00+09:00");
    formData.set("endDateTime", "2026-03-02T15:50:00+09:00");
    formData.set("purpose", "팀 미팅");
    formData.set("spaceName", "12층 보이저");
    formData.set("spaceId", "987");

    await fetch(new Request(url, { method: "POST", body: formData }));
  }, RESERVATIONS_URL);

  expect(messages).toHaveLength(1);
  expect(messages[0]).toMatchObject({
    via: "fetch",
    ok: true,
    ownerNameCandidate: "애니",
    requestContext: {
      date: "2026-03-02",
      startTime: "15:20",
      endTime: "15:50",
      description: "팀 미팅",
      roomName: "12층 보이저",
      roomId: 987,
    },
  });
});

test("page network hook can restore original fetch and XHR patches", async ({ page }) => {
  await gotoReservationPage(page);
  await routeReservationApi(page);
  await injectPageNetworkHookBundle(page);

  const beforeRestore = await collectReservationHookMessages(page, async (url) => {
    await fetch(url, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        reserverName: "애니",
        startDateTime: "2026-03-02T10:00:00+09:00",
        endDateTime: "2026-03-02T10:30:00+09:00",
        purpose: "복구 전",
      }),
    });
  }, RESERVATIONS_URL);

  expect(beforeRestore).toHaveLength(1);
  expect(beforeRestore[0]).toMatchObject({ via: "fetch", method: "POST" });

  const restoreSnapshot = await page.evaluate(() => {
    const patchedFetch = window.fetch;
    const patchedOpen = XMLHttpRequest.prototype.open;
    const patchedSend = XMLHttpRequest.prototype.send;
    const restoreResult = window.__zzkReservationHookRestore?.();
    return {
      restoreResult,
      loaded: window.__zzkReservationHookLoaded === true,
      fetchRestored: window.fetch !== patchedFetch,
      openRestored: XMLHttpRequest.prototype.open !== patchedOpen,
      sendRestored: XMLHttpRequest.prototype.send !== patchedSend,
    };
  });

  expect(restoreSnapshot).toMatchObject({
    restoreResult: true,
    loaded: false,
    fetchRestored: true,
    openRestored: true,
    sendRestored: true,
  });

  const afterRestore = await collectReservationHookMessages(page, async (url) => {
    await fetch(url, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        reserverName: "애니",
        startDateTime: "2026-03-02T11:00:00+09:00",
        endDateTime: "2026-03-02T11:30:00+09:00",
        purpose: "복구 후",
      }),
    });

    const xhr = new XMLHttpRequest();
    xhr.open("POST", url);
    xhr.setRequestHeader("content-type", "application/json");
    await new Promise((resolve) => {
      xhr.addEventListener("loadend", resolve, { once: true });
      xhr.send(
        JSON.stringify({
          reserverName: "애니",
          startDateTime: "2026-03-02T12:00:00+09:00",
          endDateTime: "2026-03-02T12:30:00+09:00",
          purpose: "XHR 복구 후",
        }),
      );
    });
  }, RESERVATIONS_URL);

  expect(afterRestore).toHaveLength(0);
});

test("page network hook registers restore before XHR patch failure can strand fetch", async ({ page }) => {
  await gotoReservationPage(page);
  await page.addScriptTag({ path: path.resolve(process.cwd(), "src/page-hook/shared.js") });
  const hookSource = fs.readFileSync(path.resolve(process.cwd(), "src/page-network-hook.js"), "utf8");

  const snapshot = await page.evaluate((source) => {
    const originalFetch = window.fetch;
    const originalOpen = XMLHttpRequest.prototype.open;
    const originalDescriptor = Object.getOwnPropertyDescriptor(XMLHttpRequest.prototype, "open");
    let storedOpen = originalOpen;
    window.__zzkThrowOnOpenPatch = true;
    Object.defineProperty(XMLHttpRequest.prototype, "open", {
      configurable: true,
      get() {
        return storedOpen;
      },
      set(value) {
        if (window.__zzkThrowOnOpenPatch === true) {
          throw new Error("simulated XHR patch failure");
        }
        storedOpen = value;
      },
    });

    let installError = "";
    try {
      const runHook = new Function(source);
      runHook();
    } catch (error) {
      installError = error instanceof Error ? error.message : String(error);
    }

    const fetchWasPatched = window.fetch !== originalFetch;
    const restoreType = typeof window.__zzkReservationHookRestore;
    window.__zzkThrowOnOpenPatch = false;
    const restoreResult = window.__zzkReservationHookRestore?.();
    if (originalDescriptor) {
      Object.defineProperty(XMLHttpRequest.prototype, "open", originalDescriptor);
    } else {
      delete XMLHttpRequest.prototype.open;
    }
    delete window.__zzkThrowOnOpenPatch;

    return {
      installError,
      fetchWasPatched,
      restoreType,
      restoreResult,
      fetchRestored: window.fetch === originalFetch,
      loaded: window.__zzkReservationHookLoaded === true,
    };
  }, hookSource);

  expect(snapshot.installError).toContain("simulated XHR patch failure");
  expect(snapshot.fetchWasPatched).toBeTruthy();
  expect(snapshot.restoreType).toBe("function");
  expect(snapshot.restoreResult).toBe(true);
  expect(snapshot.fetchRestored).toBeTruthy();
  expect(snapshot.loaded).toBeFalsy();
});

test("page network restore bridge restores page-context hook", async ({ page }) => {
  await gotoReservationPage(page);
  await injectPageNetworkHookBundle(page);

  const loadedBefore = await page.evaluate(() => {
    window.__zzkRestoreBridgeTestSnapshot = {
      fetch: window.fetch,
      open: XMLHttpRequest.prototype.open,
      send: XMLHttpRequest.prototype.send,
    };
    return window.__zzkReservationHookLoaded === true;
  });

  expect(loadedBefore).toBeTruthy();

  await page.addScriptTag({ path: path.resolve(process.cwd(), "src/page-network-restore.js") });

  const afterRestore = await page.evaluate(() => {
    const snapshot = window.__zzkRestoreBridgeTestSnapshot || {};
    return {
      loaded: window.__zzkReservationHookLoaded === true,
      hasRestore: typeof window.__zzkReservationHookRestore === "function",
      fetchRestored: window.fetch !== snapshot.fetch,
      openRestored: XMLHttpRequest.prototype.open !== snapshot.open,
      sendRestored: XMLHttpRequest.prototype.send !== snapshot.send,
    };
  });

  expect(afterRestore).toMatchObject({
    loaded: false,
    hasRestore: false,
    fetchRestored: true,
    openRestored: true,
    sendRestored: true,
  });
});

test("lms+ 예약 생성 POST 성공 시 응답 body 를 이벤트에 담아 emit 한다", async ({ page }) => {
  await gotoReservationPage(page);

  const reservationResponse = {
    date: "2099-01-02",
    endTime: "21:00:00",
    floor: 12,
    id: 175,
    mine: true,
    purpose: "학습",
    reserverName: "애니(민인애)",
    spaceId: 5,
    spaceName: "보이저",
    startTime: "20:00:00",
  };
  await routeReservationApi(page, JSON.stringify(reservationResponse), 201);

  await injectPageNetworkHookBundle(page);

  const messages = await collectReservationHookMessages(page, async (url) => {
    // 페이지 앱이 원본 응답을 소비할 수 있는지도 함께 확인한다.
    const res = await fetch(url, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        spaceId: 5,
        date: "2099-01-02",
        startTime: "20:00:00",
        endTime: "21:00:00",
        purpose: "학습",
      }),
    });
    window.__zzkConsumedBody = await res.json();
  }, RESERVATIONS_URL);

  const withBody = messages.find((m) => m && m.responseBody);
  expect(withBody).toBeTruthy();
  expect(withBody.method).toBe("POST");
  expect(withBody.responseBody).toMatchObject({
    spaceName: "보이저",
    floor: 12,
    reserverName: "애니(민인애)",
    startTime: "20:00:00",
    endTime: "21:00:00",
    purpose: "학습",
  });

  // 원본 응답도 페이지 앱이 정상적으로 읽을 수 있어야 한다(clone 사용).
  const consumed = await page.evaluate(() => window.__zzkConsumedBody);
  expect(consumed).toMatchObject({ id: 175, spaceName: "보이저" });
});
