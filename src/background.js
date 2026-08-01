// CRXJS 는 서비스워커를 "type": "module" 로 등록한다. ES 모듈에서는
// importScripts() 를 쓸 수 없으므로 정적 import 로 의존성을 올린다.
// (각 모듈은 여전히 globalThis.__zzk* 에 자기 API 를 등록한다)
import "./constants/debug.js";
import "./constants/runtime.js";
import "./services/lms-data/normalizers.js";

(() => {
  try {
    const DEBUG_MODE = globalThis.__zzkDebugConfig?.DEBUG_MODE === true;
    const {
      LMS_API_BASE_URL,
      LMS_TIME_STEP_MINUTES,
      KST_DATE_PARTS_FORMATTER,
      normalizeTargetRoomName,
      normalizeFetchRoomType: normalizeRoomType,
    } = globalThis.__zzkSharedConstants;
    const MESSAGE_TYPE_FETCH_AVAILABILITY = "ZZK_FETCH_AVAILABILITY";
    const MESSAGE_TYPE_FETCH_DAILY_SCHEDULE = "ZZK_FETCH_DAILY_SCHEDULE";
    const lmsDataNormalizers = globalThis.__zzkLmsDataNormalizers.createLmsDataNormalizers({
      getProperty,
      normalizeTargetRoomName,
      normalizeRoomType,
      getRoomTypeForRoomName: getRoomTypeByName,
      timelineSlotMinutes: LMS_TIME_STEP_MINUTES,
      minuteToHourMinute,
    });

    function debugLog(scope, message, detail) {
      if (!DEBUG_MODE || typeof console === "undefined" || typeof console.log !== "function") {
        return;
      }
      if (typeof detail === "undefined") {
        console.log("[찜꽁 레이더][debug]", scope, message);
        return;
      }
      console.log("[찜꽁 레이더][debug]", scope, message, detail);
    }

    registerRuntimeMessageListener();

    function registerRuntimeMessageListener() {
      if (
        typeof chrome === "undefined" ||
        !chrome.runtime ||
        !chrome.runtime.onMessage ||
        typeof chrome.runtime.onMessage.addListener !== "function"
      ) {
        return;
      }

      chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
        const messageType = getProperty(message, "type");
        const payload = getProperty(message, "payload");
        debugLog("background", "received runtime message", { type: messageType });

        if (messageType === MESSAGE_TYPE_FETCH_AVAILABILITY) {
          return respondWith(sendResponse, loadAvailability(payload));
        }

        if (messageType === MESSAGE_TYPE_FETCH_DAILY_SCHEDULE) {
          return respondWith(sendResponse, loadDailySchedule(payload));
        }

        return false;
      });
    }

    function respondWith(sendResponse, requestPromise) {
      Promise.resolve(requestPromise)
        .then((data) => {
          debugLog("background", "runtime request succeeded");
          sendResponse({ ok: true, data });
        })
        .catch((error) => {
          debugLog("background", "runtime request failed", { error: getErrorMessage(error) });
          sendResponse({ ok: false, error: getErrorMessage(error) });
        });

      return true;
    }

    function getProperty(source, key) {
      if (source == null || (typeof source !== "object" && typeof source !== "function")) {
        return undefined;
      }

      return source[key];
    }

    function loadAvailability(payload) {
      return loadLmsAvailability(payload);
    }

    function loadDailySchedule(payload) {
      return loadLmsDailySchedule(payload);
    }

    // 개편 서비스(techcourse-lms-plus)에는 공유 맵 개념이 없어 /api/spaces 하나로 공간을 받는다.
    async function loadLmsSpaceContext(roomType = null) {
      const spacesResponse = await fetchJson(`${LMS_API_BASE_URL}/api/spaces`);
      const spaces = lmsDataNormalizers.normalizeSpaces(spacesResponse);

      return {
        mapId: null,
        mapName: "회의실",
        targetRooms: lmsDataNormalizers.buildTargetRooms(spaces, roomType),
      };
    }

    async function fetchLmsReservationsForRoom(roomId, date) {
      const response = await fetchJson(
        `${LMS_API_BASE_URL}/api/space-reservations?${new URLSearchParams({
          date,
          spaceId: String(roomId),
        }).toString()}`,
      );

      const reservationsValue = Array.isArray(response)
        ? response
        : getProperty(response, "reservations");
      return lmsDataNormalizers.normalizeReservations(reservationsValue);
    }

    // 개편 서비스에는 availability 엔드포인트가 없어 예약 목록과의 겹침으로 직접 계산한다.
    async function loadLmsAvailability(payload) {
      const date = sanitizeDate(getProperty(payload, "date"), {
        allowPastDate: getProperty(payload, "allowPastDate") === true,
      });
      const startTime = sanitizeTime(getProperty(payload, "startTime"));
      const endTime = sanitizeTime(getProperty(payload, "endTime"));

      if (startTime >= endTime) {
        throw new Error("종료 시간은 시작 시간보다 늦어야 합니다.");
      }

      const roomType = normalizeRoomType(getProperty(payload, "roomType"));
      const startMinute = lmsDataNormalizers.parseTimeToMinute(startTime);
      const endMinute = lmsDataNormalizers.parseTimeToMinute(endTime);
      const spaceContext = await loadLmsSpaceContext(roomType);

      const rooms = await Promise.all(
        spaceContext.targetRooms.map(async (room) => {
          const reservations = await fetchLmsReservationsForRoom(room.id, date);

          return {
            id: room.id,
            name: room.name,
            color: room.color,
            floor: room.floor,
            floorLabel: room.floorLabel,
            isAvailable: lmsDataNormalizers.isRoomAvailableInWindow(
              reservations,
              startMinute,
              endMinute,
            ),
          };
        }),
      );

      const availableCount = rooms.filter((room) => room.isAvailable).length;

      return {
        mapId: spaceContext.mapId,
        mapName: spaceContext.mapName,
        selectedWindow: {
          date,
          startTime,
          endTime,
        },
        roomType,
        counts: {
          total: rooms.length,
          available: availableCount,
          occupied: rooms.length - availableCount,
        },
        rooms,
      };
    }

    async function loadLmsDailySchedule(payload) {
      const date = sanitizeDate(getProperty(payload, "date"), {
        allowPastDate: getProperty(payload, "allowPastDate") === true,
      });
      const roomType = normalizeRoomType(getProperty(payload, "roomType"));
      const spaceContext = await loadLmsSpaceContext(roomType);

      const rooms = await Promise.all(
        spaceContext.targetRooms.map(async (room) => ({
          id: room.id,
          name: room.name,
          color: room.color,
          floor: room.floor,
          floorLabel: room.floorLabel,
          windowStartMinute: room.windowStartMinute,
          windowEndMinute: room.windowEndMinute,
          reservations: await fetchLmsReservationsForRoom(room.id, date),
        })),
      );

      const range = lmsDataNormalizers.computeTimelineRange(rooms);
      const timeline = lmsDataNormalizers.buildTimelineSlots(
        range.startMinute,
        range.endMinute,
        LMS_TIME_STEP_MINUTES,
      );

      return {
        mapId: spaceContext.mapId,
        mapName: spaceContext.mapName,
        date,
        roomType,
        range,
        timeline,
        rooms,
      };
    }

    function getRoomTypeByName(name) {
      const normalizedName = normalizeTargetRoomName(name);
      return normalizedName.startsWith("페") ? "pair" : "meeting";
    }

    function minuteToHourMinute(totalMinute) {
      if (!Number.isFinite(totalMinute)) {
        return "00:00";
      }

      const minute = ((Math.trunc(totalMinute) % (24 * 60)) + 24 * 60) % (24 * 60);
      const hour = Math.floor(minute / 60);
      const remainMinute = minute % 60;
      return `${String(hour).padStart(2, "0")}:${String(remainMinute).padStart(2, "0")}`;
    }

    async function fetchJson(url) {
      const response = await fetch(url, {
        headers: {
          accept: "application/json",
        },
        // 개편 서비스는 세션 쿠키 기반 인증이라 자격 증명을 함께 보낸다.
        credentials: "include",
      });

      const text = await response.text();
      const data = safeParseJson(text);

      if (!response.ok) {
        const message =
          typeof getProperty(data, "message") === "string"
            ? getProperty(data, "message")
            : `요청 실패 (${response.status})`;
        throw new Error(message);
      }

      if (data == null || typeof data !== "object") {
        throw new Error("서버 응답 형식이 올바르지 않습니다.");
      }

      return data;
    }

    function safeParseJson(text) {
      if (!text) {
        return {};
      }
      try {
        return JSON.parse(text);
      } catch (error) {
        return {};
      }
    }

    function sanitizeDate(value, options = {}) {
      if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(value)) {
        throw new Error("날짜 형식이 올바르지 않습니다.");
      }

      const todayDate = getTodayDateInKST();
      if (options.allowPastDate !== true && value < todayDate) {
        throw new Error("오늘 이전 날짜는 선택할 수 없습니다.");
      }

      return value;
    }

    function getTodayDateInKST() {
      const parts = KST_DATE_PARTS_FORMATTER.formatToParts(new Date());
      const yearNode = parts.find((part) => part.type === "year");
      const monthNode = parts.find((part) => part.type === "month");
      const dayNode = parts.find((part) => part.type === "day");
      const year = yearNode && typeof yearNode.value === "string" ? yearNode.value : "1970";
      const month = monthNode && typeof monthNode.value === "string" ? monthNode.value : "01";
      const day = dayNode && typeof dayNode.value === "string" ? dayNode.value : "01";
      return `${year}-${month}-${day}`;
    }

    function sanitizeTime(value) {
      if (typeof value !== "string" || !/^\d{2}:\d{2}$/.test(value)) {
        throw new Error("시간 형식이 올바르지 않습니다.");
      }

      const hour = Number(value.slice(0, 2));
      const minute = Number(value.slice(3, 5));

      if (!Number.isInteger(hour) || !Number.isInteger(minute)) {
        throw new Error("시간 형식이 올바르지 않습니다.");
      }
      if (hour < 0 || hour > 23 || minute < 0 || minute > 59) {
        throw new Error("시간 형식이 올바르지 않습니다.");
      }
      if (minute % LMS_TIME_STEP_MINUTES !== 0) {
        throw new Error("시간은 30분 단위로 선택해 주세요.");
      }

      return `${String(hour).padStart(2, "0")}:${String(minute).padStart(2, "0")}`;
    }

    function getErrorMessage(error) {
      if (error instanceof Error && error.message) {
        return error.message;
      }
      return "알 수 없는 오류가 발생했습니다.";
    }
  } catch (error) {
    if (typeof console !== "undefined" && typeof console.error === "function") {
      const detail = error instanceof Error && error.stack ? error.stack : String(error);
      console.error("[찜꽁 레이더] background bootstrap failed:", detail);
    }
  }
})();
