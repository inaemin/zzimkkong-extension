(() => {
  if (globalThis.__zzkLmsDataShared) {
    return;
  }

  function reportMissingBootstrapDependencies(missing) {
    if (!Array.isArray(globalThis.__zzkBootstrapLoadErrors)) {
      globalThis.__zzkBootstrapLoadErrors = [];
    }
    globalThis.__zzkBootstrapLoadErrors.push({
      script: "src/services/lms-data/shared.js",
      reason: "missing-bootstrap-dependencies",
      missing,
    });
  }

  const missingBootstrapDependencies = [
    ["__zzkSharedConstants", globalThis.__zzkSharedConstants],
    ["__zzkDateTimeUtils", globalThis.__zzkDateTimeUtils],
    ["__zzkLmsDataNormalizers", globalThis.__zzkLmsDataNormalizers],
  ]
    .filter(([, value]) => !value)
    .map(([name]) => name);

  if (missingBootstrapDependencies.length > 0) {
    reportMissingBootstrapDependencies(missingBootstrapDependencies);
    return;
  }

  const {
    LMS_API_BASE_URL,
    LMS_TIME_STEP_MINUTES,
    EXCLUDED_CREW_ROOM_SET,
    TARGET_ROOM_METADATA_BY_NORMALIZED_NAME,
    MAP_CALENDAR_SPACE_TAB_MEETING,
    normalizeTargetRoomName,
    normalizeFetchRoomType,
  } = globalThis.__zzkSharedConstants;
  const { sanitizeDateForApi, sanitizeTimeForApi, minuteToHourMinute } =
    globalThis.__zzkDateTimeUtils;

  function getRoomTypeForRoomName(roomName) {
    const normalizedName = normalizeTargetRoomName(roomName);
    const metadata = TARGET_ROOM_METADATA_BY_NORMALIZED_NAME.get(normalizedName);
    return metadata?.kind || (normalizedName.startsWith("페") ? "pair" : MAP_CALENDAR_SPACE_TAB_MEETING);
  }

  const lmsDataNormalizers = globalThis.__zzkLmsDataNormalizers.createLmsDataNormalizers({
    getProperty(source, key) {
      if (source == null || (typeof source !== "object" && typeof source !== "function")) {
        return undefined;
      }
      return source[key];
    },
    normalizeTargetRoomName,
    normalizeRoomType: normalizeFetchRoomType,
    getRoomTypeForRoomName,
    excludedRoomSet: EXCLUDED_CREW_ROOM_SET,
    timelineSlotMinutes: LMS_TIME_STEP_MINUTES,
    minuteToHourMinute,
  });

  async function loadSpaceContext(roomType = null) {
    const spacesResponse = await fetchApiJson(`${LMS_API_BASE_URL}/api/spaces`);
    const spaces = lmsDataNormalizers.normalizeSpaces(spacesResponse);

    return {
      mapId: null,
      mapName: "회의실",
      targetRooms: lmsDataNormalizers.buildTargetRooms(spaces, roomType),
    };
  }

  async function fetchReservationsForRoom(roomId, date) {
    const query = new URLSearchParams({
      date,
      spaceId: String(roomId),
    }).toString();

    const response = await fetchApiJson(`${LMS_API_BASE_URL}/api/space-reservations?${query}`);
    const reservationsValue = Array.isArray(response) ? response : response?.reservations;
    return lmsDataNormalizers.normalizeReservations(reservationsValue);
  }

  // 개편 서비스에는 availability 엔드포인트가 없어서, 각 공간의 당일 예약을 받아와
  // 요청 구간과 겹치는지로 예약 가능 여부를 계산한다.
  async function fetchAvailability(payload) {
    const date = sanitizeDateForApi(payload && payload.date, {
      allowPastDate: payload?.allowPastDate === true,
    });
    const startTime = sanitizeTimeForApi(payload && payload.startTime);
    const endTime = sanitizeTimeForApi(payload && payload.endTime);
    const roomType = normalizeFetchRoomType(payload && payload.roomType);

    if (startTime >= endTime) {
      throw new Error("종료 시간은 시작 시간보다 늦어야 합니다.");
    }

    const startMinute = lmsDataNormalizers.parseTimeToMinute(startTime);
    const endMinute = lmsDataNormalizers.parseTimeToMinute(endTime);
    const spaceContext = await loadSpaceContext(roomType);

    const rooms = await Promise.all(
      spaceContext.targetRooms.map(async (room) => {
        const reservations = await fetchReservationsForRoom(room.id, date);

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

  async function fetchDailySchedule(payload) {
    const date = sanitizeDateForApi(payload && payload.date, {
      allowPastDate: payload?.allowPastDate === true,
    });
    const roomType = normalizeFetchRoomType(payload && payload.roomType);
    const spaceContext = await loadSpaceContext(roomType);

    const rooms = await Promise.all(
      spaceContext.targetRooms.map(async (room) => ({
        id: room.id,
        name: room.name,
        color: room.color,
        floor: room.floor,
        floorLabel: room.floorLabel,
        windowStartMinute: room.windowStartMinute,
        windowEndMinute: room.windowEndMinute,
        reservations: await fetchReservationsForRoom(room.id, date),
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

  // 개편 서비스 전용. 일/월 예약 한도 잔량을 보여줄 때 쓴다.
  async function fetchQuota(payload) {
    const date = sanitizeDateForApi(payload && payload.date, {
      allowPastDate: payload?.allowPastDate === true,
    });

    const response = await fetchApiJson(
      `${LMS_API_BASE_URL}/api/space-reservations/quota?date=${encodeURIComponent(date)}`,
    );

    return lmsDataNormalizers.normalizeQuota(response);
  }

  // 개편 서비스 API 는 Authorization: Bearer <JWT> 로 인증한다. 이 토큰은 페이지 앱이
  // 저장소에 넣어두므로(콘텐츠 스크립트는 같은 origin 의 localStorage 를 읽을 수 있다),
  // 요청 시점에 읽어 헤더로 붙인다. 토큰을 코드에 하드코딩하지 않는다.
  const JWT_PATTERN = /eyJ[\w-]+\.[\w-]+\.[\w-]+/;

  function stripBearer(value) {
    return typeof value === "string" ? value.replace(/^Bearer\s+/i, "").trim() : "";
  }

  function extractJwtFromValue(rawValue) {
    if (typeof rawValue !== "string" || rawValue === "") {
      return "";
    }
    const bare = stripBearer(rawValue);
    if (JWT_PATTERN.test(bare) && /^eyJ[\w-]+\.[\w-]+\.[\w-]+$/.test(bare)) {
      return bare;
    }
    // 값이 JSON 이면 그 안에서 JWT 를 찾는다 (예: {"accessToken":"eyJ..."}).
    const match = rawValue.match(JWT_PATTERN);
    return match ? match[0] : "";
  }

  function readLmsAuthToken() {
    const stores = [];
    try {
      if (typeof localStorage !== "undefined") stores.push(localStorage);
    } catch (error) {
      /* 접근 불가 시 무시 */
    }
    try {
      if (typeof sessionStorage !== "undefined") stores.push(sessionStorage);
    } catch (error) {
      /* 접근 불가 시 무시 */
    }

    for (const store of stores) {
      let length = 0;
      try {
        length = store.length;
      } catch (error) {
        continue;
      }
      for (let index = 0; index < length; index += 1) {
        let key = null;
        try {
          key = store.key(index);
        } catch (error) {
          continue;
        }
        if (!key) {
          continue;
        }
        let value = "";
        try {
          value = store.getItem(key) || "";
        } catch (error) {
          continue;
        }
        if (!value.includes("eyJ")) {
          continue;
        }
        const token = extractJwtFromValue(value);
        if (token) {
          return token;
        }
      }
    }

    return "";
  }

  async function fetchApiJson(url) {
    const headers = {
      accept: "application/json",
    };
    const token = readLmsAuthToken();
    if (token) {
      headers.authorization = `Bearer ${token}`;
    }

    const response = await fetch(url, {
      headers,
      // 쿠키도 함께 보낸다(일부 엔드포인트가 세션 쿠키를 병행할 수 있음).
      credentials: "include",
    });

    const text = await response.text();
    let data = null;
    if (text) {
      try {
        data = JSON.parse(text);
      } catch (error) {
        data = null;
      }
    }

    if (!response.ok) {
      if (response.status === 401 || response.status === 403) {
        throw new Error(
          token
            ? "로그인 정보가 만료되었어요. 페이지를 새로고침한 뒤 다시 시도해 주세요."
            : "로그인이 필요해요. 회의실 예약 페이지에 로그인한 뒤 다시 시도해 주세요.",
        );
      }
      const message =
        data && typeof data.message === "string"
          ? data.message
          : `요청 실패 (${response.status})`;
      throw new Error(message);
    }

    if (data == null || typeof data !== "object") {
      throw new Error("서버 응답 형식이 올바르지 않습니다.");
    }

    return data;
  }

  globalThis.__zzkLmsDataShared = {
    fetchAvailability,
    fetchDailySchedule,
    fetchQuota,
    loadSpaceContext,
    fetchReservationsForRoom,
    buildTargetRooms: lmsDataNormalizers.buildTargetRooms,
    normalizeReservations: lmsDataNormalizers.normalizeReservations,
    normalizeQuota: lmsDataNormalizers.normalizeQuota,
    isRoomAvailableInWindow: lmsDataNormalizers.isRoomAvailableInWindow,
    parseTimeToMinute: lmsDataNormalizers.parseTimeToMinute,
    computeTimelineRange: lmsDataNormalizers.computeTimelineRange,
    buildTimelineSlots: lmsDataNormalizers.buildTimelineSlots,
    fetchApiJson,
  };
})();
