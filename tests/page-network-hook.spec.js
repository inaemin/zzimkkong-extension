import path from "node:path";
import fs from "node:fs";
import { expect, test } from "@playwright/test";

async function injectPageNetworkHookBundle(page) {
  await page.addScriptTag({ path: path.resolve(process.cwd(), "src/page-hook/shared.js") });
  await page.addScriptTag({ path: path.resolve(process.cwd(), "src/page-network-hook.js") });
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
  await page.goto("https://example.com/guest/test-map", { waitUntil: "domcontentloaded" });

  await page.route("**/api/guests/**/reservations", async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: "{}",
    });
  });

  await injectPageNetworkHookBundle(page);

  const payload = await page.evaluate(async () => {
    return await new Promise((resolve, reject) => {
      const timeout = window.setTimeout(() => {
        window.removeEventListener("message", handleMessage);
        reject(new Error("Timed out waiting for reservation hook message"));
      }, 5000);

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

        window.clearTimeout(timeout);
        window.removeEventListener("message", handleMessage);
        resolve(data.payload || {});
      };

      window.addEventListener("message", handleMessage);
      void fetch("/api/guests/maps/234/spaces/263/reservations", {
        method: "POST",
        headers: {
          "content-type": "application/json",
        },
        body: JSON.stringify({
          name: "애니",
          startDateTime: "2026-03-02T10:00:00+09:00",
          endDateTime: "2026-03-02T10:30:00+09:00",
          description: "연극연습",
          roomName: "11층 금성",
        }),
      });
    });
  });

  expect(payload).toMatchObject({
    via: "fetch",
    ok: true,
    ownerNameCandidate: "애니",
    requestContext: {
      date: "2026-03-02",
      startTime: "10:00",
      endTime: "10:30",
      description: "연극연습",
      roomName: "11층 금성",
      roomId: 263,
    },
  });
});

test("page network hook includes reservationAttemptId from document dataset", async ({ page }) => {
  await page.goto("https://example.com/guest/test-map", { waitUntil: "domcontentloaded" });

  await page.route("**/api/guests/**/reservations", async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: "{}",
    });
  });

  await injectPageNetworkHookBundle(page);

  const messages = await collectReservationHookMessages(page, async () => {
    document.documentElement.dataset.zzkReservationAttemptId = "attempt-fetch-1";
    await fetch("/api/guests/maps/234/spaces/263/reservations", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        startDateTime: "2026-03-02T10:00:00+09:00",
        endDateTime: "2026-03-02T10:30:00+09:00",
        description: "attempt fetch",
      }),
    });

    document.documentElement.dataset.zzkReservationAttemptId = "attempt-xhr-2";
    const xhr = new XMLHttpRequest();
    xhr.open("POST", "/api/guests/maps/234/spaces/263/reservations");
    xhr.setRequestHeader("content-type", "application/json");
    await new Promise((resolve) => {
      xhr.addEventListener("loadend", resolve, { once: true });
      xhr.send(
        JSON.stringify({
          startDateTime: "2026-03-02T11:00:00+09:00",
          endDateTime: "2026-03-02T11:30:00+09:00",
          description: "attempt xhr",
        }),
      );
    });
  });

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
    await page.goto("https://example.com/guest/test-map", { waitUntil: "domcontentloaded" });

    await page.route("**/api/guests/maps/abc/reservations", async (route) => {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: "{}",
      });
    });

    await injectPageNetworkHookBundle(page);

    const messages = await collectReservationHookMessages(
      page,
      async ({ requestBodyType, requestHeaders }) => {
        let body;
        if (requestBodyType === "json-space-id") {
          body = JSON.stringify({
            date: "2026-03-02",
            startTime: "10:00",
            endTime: "10:30",
            description: "space id json",
            spaceId: "263",
          });
        } else if (requestBodyType === "form-room-id") {
          body = new FormData();
          body.set("date", "2026-03-02");
          body.set("startTime", "10:00");
          body.set("endTime", "10:30");
          body.set("description", "room id formdata");
          body.set("roomId", "263");
        } else {
          body = new URLSearchParams({
            date: "2026-03-02",
            startTime: "10:00",
            endTime: "10:30",
            description: "space id params",
            space_id: "263",
          });
        }

        await fetch("/api/guests/maps/abc/reservations", {
          method: "POST",
          headers: requestHeaders,
          body,
        });
      },
      { requestBodyType: bodyType, requestHeaders: headers },
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

test("page network hook emits changed guest API path when reservation attempt is present", async ({ page }) => {
  await page.goto("https://example.com/guest/test-map", { waitUntil: "domcontentloaded" });

  await page.route("**/api/guests/maps/abc/bookings/complete", async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: "{}",
    });
  });

  await injectPageNetworkHookBundle(page);

  const messages = await collectReservationHookMessages(page, async () => {
    document.documentElement.dataset.zzkReservationAttemptId = "attempt-changed-path";
    await fetch("/api/guests/maps/abc/bookings/complete", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        date: "2026-03-02",
        startTime: "09:30",
        endTime: "10:30",
        description: "느린 응답 매칭",
        roomName: "11층 수성",
      }),
    });
  });

  expect(messages).toHaveLength(1);
  expect(messages[0]).toMatchObject({
    via: "fetch",
    method: "POST",
    reservationAttemptId: "attempt-changed-path",
    requestContext: {
      date: "2026-03-02",
      startTime: "09:30",
      endTime: "10:30",
      description: "느린 응답 매칭",
      roomName: "11층 수성",
    },
  });
});

test("page network hook ignores unrelated guest API mutations even with attempt or context", async ({ page }) => {
  await page.goto("https://example.com/guest/test-map", { waitUntil: "domcontentloaded" });

  await page.route("**/api/guests/maps/abc/notifications", async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: "{}",
    });
  });

  await injectPageNetworkHookBundle(page);

  const messages = await collectReservationHookMessages(page, async () => {
    document.documentElement.dataset.zzkReservationAttemptId = "attempt-unrelated-path";
    await fetch("/api/guests/maps/abc/notifications", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ message: "not a reservation completion" }),
    });

    delete document.documentElement.dataset.zzkReservationAttemptId;
    await fetch("/api/guests/maps/abc/notifications", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        date: "2026-03-02",
        startTime: "09:30",
        endTime: "10:30",
        description: "완전하지만 예약 완료 API가 아님",
        roomName: "11층 수성",
      }),
    });
  });

  expect(messages).toHaveLength(0);
});

test("page network hook extracts ownerNameCandidate from Request(FormData)", async ({ page }) => {
  await page.goto("https://example.com/guest/test-map", { waitUntil: "domcontentloaded" });

  await page.route("**/api/guests/**/reservations", async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: "{}",
    });
  });

  await injectPageNetworkHookBundle(page);

  const payload = await page.evaluate(async () => {
    return await new Promise((resolve, reject) => {
      const timeout = window.setTimeout(() => {
        window.removeEventListener("message", handleMessage);
        reject(new Error("Timed out waiting for reservation hook message"));
      }, 5000);

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

        window.clearTimeout(timeout);
        window.removeEventListener("message", handleMessage);
        resolve(data.payload || {});
      };

      window.addEventListener("message", handleMessage);

      const formData = new FormData();
      formData.set("name", "애니");
      formData.set("password", "1234");
      formData.set("startDateTime", "2026-03-02T15:20:00+09:00");
      formData.set("endDateTime", "2026-03-02T15:50:00+09:00");
      formData.set("purpose", "팀 미팅");
      formData.set("roomName", "12층 보이저");

      const request = new Request("/api/guests/maps/234/spaces/987/reservations", {
        method: "POST",
        body: formData,
      });

      void fetch(request);
    });
  });

  expect(payload).toMatchObject({
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

test("page network hook emits success payload for PATCH reservation update", async ({ page }) => {
  await page.goto("https://example.com/guest/test-map/reservation/edit", {
    waitUntil: "domcontentloaded",
  });

  await page.route("**/api/guests/**/reservations/**", async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: "{}",
    });
  });

  await injectPageNetworkHookBundle(page);

  const payload = await page.evaluate(async () => {
    return await new Promise((resolve, reject) => {
      const timeout = window.setTimeout(() => {
        window.removeEventListener("message", handleMessage);
        reject(new Error("Timed out waiting for reservation hook message"));
      }, 5000);

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

        window.clearTimeout(timeout);
        window.removeEventListener("message", handleMessage);
        resolve(data.payload || {});
      };

      window.addEventListener("message", handleMessage);
      void fetch("/api/guests/maps/234/spaces/263/reservations/901", {
        method: "PATCH",
        headers: {
          "content-type": "application/json",
        },
        body: JSON.stringify({
          name: "애니",
          startDateTime: "2026-03-02T14:00:00+09:00",
          endDateTime: "2026-03-02T14:30:00+09:00",
          description: "수정 회의",
        }),
      });
    });
  });

  expect(payload).toMatchObject({
    via: "fetch",
    method: "PATCH",
    ok: true,
    ownerNameCandidate: "애니",
    requestContext: {
      date: "2026-03-02",
      startTime: "14:00",
      endTime: "14:30",
      description: "수정 회의",
      roomId: 263,
    },
  });
});

test("page network hook emits success payload for PUT reservation update", async ({ page }) => {
  await page.goto("https://example.com/guest/test-map/reservation/edit", {
    waitUntil: "domcontentloaded",
  });

  await page.route("**/api/guests/**/reservations/**", async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: "{}",
    });
  });

  await injectPageNetworkHookBundle(page);

  const payload = await page.evaluate(async () => {
    return await new Promise((resolve, reject) => {
      const timeout = window.setTimeout(() => {
        window.removeEventListener("message", handleMessage);
        reject(new Error("Timed out waiting for reservation hook message"));
      }, 5000);

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

        window.clearTimeout(timeout);
        window.removeEventListener("message", handleMessage);
        resolve(data.payload || {});
      };

      window.addEventListener("message", handleMessage);
      void fetch("/api/guests/maps/234/spaces/263/reservations/901", {
        method: "PUT",
        headers: {
          "content-type": "application/json",
        },
        body: JSON.stringify({
          name: "애니",
          startDateTime: "2026-03-02T16:00:00+09:00",
          endDateTime: "2026-03-02T16:30:00+09:00",
          purpose: "수정 PUT",
        }),
      });
    });
  });

  expect(payload).toMatchObject({
    via: "fetch",
    method: "PUT",
    ok: true,
    ownerNameCandidate: "애니",
    requestContext: {
      date: "2026-03-02",
      startTime: "16:00",
      endTime: "16:30",
      description: "수정 PUT",
      roomId: 263,
    },
  });
});

test("page network hook can restore original fetch and XHR patches", async ({ page }) => {
  await page.goto("https://example.com/guest/test-map", { waitUntil: "domcontentloaded" });

  await page.route("**/api/guests/**/reservations", async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: "{}",
    });
  });

  await injectPageNetworkHookBundle(page);

  const beforeRestore = await collectReservationHookMessages(page, async () => {
    await fetch("/api/guests/maps/234/spaces/263/reservations", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        name: "애니",
        startDateTime: "2026-03-02T10:00:00+09:00",
        endDateTime: "2026-03-02T10:30:00+09:00",
        description: "복구 전",
      }),
    });
  });

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

  const afterRestore = await collectReservationHookMessages(page, async () => {
    await fetch("/api/guests/maps/234/spaces/263/reservations", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        name: "애니",
        startDateTime: "2026-03-02T11:00:00+09:00",
        endDateTime: "2026-03-02T11:30:00+09:00",
        description: "복구 후",
      }),
    });

    const xhr = new XMLHttpRequest();
    xhr.open("POST", "/api/guests/maps/234/spaces/263/reservations");
    xhr.setRequestHeader("content-type", "application/json");
    await new Promise((resolve) => {
      xhr.addEventListener("loadend", resolve, { once: true });
      xhr.send(
        JSON.stringify({
          name: "애니",
          startDateTime: "2026-03-02T12:00:00+09:00",
          endDateTime: "2026-03-02T12:30:00+09:00",
          description: "XHR 복구 후",
        }),
      );
    });
  });

  expect(afterRestore).toHaveLength(0);
});

test("page network hook registers restore before XHR patch failure can strand fetch", async ({ page }) => {
  await page.goto("https://example.com/guest/test-map", { waitUntil: "domcontentloaded" });
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
  await page.goto("https://example.com/guest/test-map", { waitUntil: "domcontentloaded" });

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
