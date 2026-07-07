(() => {
  if (globalThis.__zzkGuestDataShared) {
    return;
  }

  function reportMissingBootstrapDependencies(missing) {
    if (!Array.isArray(globalThis.__zzkBootstrapLoadErrors)) {
      globalThis.__zzkBootstrapLoadErrors = [];
    }
    globalThis.__zzkBootstrapLoadErrors.push({
      script: "src/services/guest-data/shared.js",
      reason: "missing-bootstrap-dependencies",
      missing,
    });
  }

  const missingBootstrapDependencies = [
    ["__zzkSharedConstants", globalThis.__zzkSharedConstants],
    ["__zzkDateTimeUtils", globalThis.__zzkDateTimeUtils],
    ["__zzkGuestDataNormalizers", globalThis.__zzkGuestDataNormalizers],
  ]
    .filter(([, value]) => !value)
    .map(([name]) => name);

  if (missingBootstrapDependencies.length > 0) {
    reportMissingBootstrapDependencies(missingBootstrapDependencies);
    return;
  }

  const { API_BASE_URL, TIME_STEP_MINUTES, TARGET_ROOM_SET, TARGET_ROOM_ORDER, EXCLUDED_CREW_ROOM_SET, KST_TIME_PARTS_FORMATTER, normalizeTargetRoomName, normalizeFetchRoomType } = globalThis.__zzkSharedConstants;
  const { TARGET_ROOM_METADATA_BY_NORMALIZED_NAME, MAP_CALENDAR_SPACE_TAB_MEETING } = globalThis.__zzkSharedConstants;
  const { sanitizeDateForApi, sanitizeTimeForApi, minuteToHourMinute } = globalThis.__zzkDateTimeUtils;
  const guestDataNormalizers = globalThis.__zzkGuestDataNormalizers.createGuestDataNormalizers({
    getProperty(source, key) {
      if (source == null || (typeof source !== "object" && typeof source !== "function")) {
        return undefined;
      }
      return source[key];
    },
    normalizeTargetRoomName,
    normalizeRoomType: normalizeFetchRoomType,
    getRoomTypeForRoomName,
    targetRoomSet: TARGET_ROOM_SET,
    targetRoomOrder: TARGET_ROOM_ORDER,
    excludedRoomSet: EXCLUDED_CREW_ROOM_SET,
    timelineSlotMinutes: TIME_STEP_MINUTES,
    minuteToHourMinute,
    timePartsFormatter: KST_TIME_PARTS_FORMATTER,
  });

  function getRoomTypeForRoomName(roomName) {
    const normalizedName = normalizeTargetRoomName(roomName);
    const metadata = TARGET_ROOM_METADATA_BY_NORMALIZED_NAME.get(normalizedName);
    return metadata?.kind || (normalizedName.startsWith("페") ? "pair" : MAP_CALENDAR_SPACE_TAB_MEETING);
  }

  async function fetchAvailabilityDirect(payload) {
    const date = sanitizeDateForApi(payload && payload.date, {
      allowPastDate: payload?.allowPastDate === true,
    });
    const startTime = sanitizeTimeForApi(payload && payload.startTime);
    const endTime = sanitizeTimeForApi(payload && payload.endTime);
    const roomType = normalizeFetchRoomType(payload && payload.roomType);

    if (startTime >= endTime) {
      throw new Error("종료 시간은 시작 시간보다 늦어야 합니다.");
    }

    const mapContext = await loadMapContextDirect(payload || {}, roomType);
    const startDateTime = `${date}T${startTime}:00+09:00`;
    const endDateTime = `${date}T${endTime}:00+09:00`;
    const query = new URLSearchParams({
      startDateTime,
      endDateTime,
    }).toString();

    const availabilityResponse = await fetchApiJson(
      `${API_BASE_URL}/api/guests/maps/${mapContext.mapId}/spaces/availability?${query}`,
    );

    const availabilitySpaces =
      availabilityResponse && Array.isArray(availabilityResponse.spaces)
        ? availabilityResponse.spaces
        : [];

    const availabilityBySpaceId = new Map();
    availabilitySpaces.forEach((entry) => {
      const spaceId = Number(entry && entry.spaceId);
      if (!Number.isInteger(spaceId)) {
        return;
      }
      availabilityBySpaceId.set(spaceId, Boolean(entry && entry.isAvailable));
    });

    const rooms = mapContext.targetRooms.map((room) => ({
      id: room.id,
      name: room.name,
      color: room.color,
      isAvailable: availabilityBySpaceId.get(room.id) === true,
    }));

    const availableCount = rooms.filter((room) => room.isAvailable).length;

    return {
      mapId: mapContext.mapId,
      mapName: mapContext.mapName,
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

  async function fetchDailyScheduleDirect(payload) {
    const date = sanitizeDateForApi(payload && payload.date, {
      allowPastDate: payload?.allowPastDate === true,
    });
    const roomType = normalizeFetchRoomType(payload && payload.roomType);
    const mapContext = await loadMapContextDirect(payload || {}, roomType);

    const rooms = await Promise.all(
      mapContext.targetRooms.map(async (room) => {
        const reservationsResponse = await fetchApiJson(
          `${API_BASE_URL}/api/guests/maps/${mapContext.mapId}/spaces/${room.id}/reservations?date=${encodeURIComponent(
            date,
          )}`,
        );

        return {
          id: room.id,
          name: room.name,
          color: room.color,
          windowStartMinute: room.windowStartMinute,
          windowEndMinute: room.windowEndMinute,
      reservations: guestDataNormalizers.normalizeReservations(
            reservationsResponse ? reservationsResponse.reservations : null,
          ),
        };
      }),
    );

    const range = guestDataNormalizers.computeTimelineRange(rooms);
    const timeline = guestDataNormalizers.buildTimelineSlots(
      range.startMinute,
      range.endMinute,
      TIME_STEP_MINUTES,
    );

    return {
      mapId: mapContext.mapId,
      mapName: mapContext.mapName,
      date,
      roomType,
      range,
      timeline,
      rooms,
    };
  }

  async function loadMapContextDirect(payload, roomType = null) {
    const sharingMapId = sanitizeSharingMapIdForApi(
      payload && payload.sharingMapId,
    );
    const mapData = await fetchApiJson(
      `${API_BASE_URL}/api/guests/maps?sharingMapId=${encodeURIComponent(sharingMapId)}`,
    );

    const mapId = Number(mapData && mapData.mapId);
    if (!Number.isInteger(mapId)) {
      throw new Error("맵 정보를 불러오지 못했습니다.");
    }

    const spacesResponse = await fetchApiJson(
      `${API_BASE_URL}/api/guests/maps/${mapId}/spaces`,
    );
    const spaces = guestDataNormalizers.normalizeSpaces(spacesResponse);

    return {
      mapId,
      mapName:
        mapData && typeof mapData.mapName === "string"
          ? mapData.mapName
          : "회의실 지도",
      targetRooms: guestDataNormalizers.buildTargetRooms(spaces, roomType),
    };
  }

  function buildTargetRoomsFromSpaces(spaces, roomType = null) {
    const normalizedRoomType = normalizeFetchRoomType(roomType);
    return spaces
      .filter((space) => Boolean(space && space.reservationEnable))
      .map((space) => {
        const id = Number(space && space.id);
        const rawName =
          space && typeof space.name === "string" ? space.name.trim() : "";
        const name = rawName || `공간 ${id}`;

        return {
          id,
          name,
          color:
            space && typeof space.color === "string" ? space.color : "#9CA3AF",
          windowStartMinute: parseApiWindowStartMinute(space && space.settings),
          windowEndMinute: parseApiWindowEndMinute(space && space.settings),
        };
      })
      .filter(
        (room) =>
          Number.isInteger(room.id) &&
          TARGET_ROOM_SET.has(normalizeTargetRoomName(room.name)) &&
          (!normalizedRoomType ||
            getRoomTypeForRoomName(room.name) === normalizedRoomType),
      )
      .sort((a, b) => {
        const normalizedNameA = normalizeTargetRoomName(a.name);
        const normalizedNameB = normalizeTargetRoomName(b.name);
        const orderA = TARGET_ROOM_ORDER.has(normalizedNameA)
          ? TARGET_ROOM_ORDER.get(normalizedNameA)
          : Number.MAX_SAFE_INTEGER;
        const orderB = TARGET_ROOM_ORDER.has(normalizedNameB)
          ? TARGET_ROOM_ORDER.get(normalizedNameB)
          : Number.MAX_SAFE_INTEGER;
        return orderA - orderB;
      });
  }

  function normalizeDirectReservations(reservationsValue) {
    if (!Array.isArray(reservationsValue)) {
      return [];
    }

    return reservationsValue
      .map((reservation) => {
        const startMinute = toKstMinuteOfDay(
          reservation && reservation.startDateTime,
        );
        const endMinute = toKstMinuteOfDay(
          reservation && reservation.endDateTime,
        );

        if (!Number.isInteger(startMinute) || !Number.isInteger(endMinute)) {
          return null;
        }

        const rawDescription =
          reservation && typeof reservation.description === "string"
            ? reservation.description.trim()
            : "";
        const rawOwner =
          reservation && typeof reservation.name === "string"
            ? reservation.name.trim()
            : "";

        return {
          id: Number(reservation && reservation.id),
          title: rawDescription || "예약",
          owner: rawOwner,
          startMinute,
          endMinute,
          startTime: minuteToHourMinute(startMinute),
          endTime: minuteToHourMinute(endMinute),
        };
      })
      .filter((reservation) => reservation != null)
      .sort((a, b) => a.startMinute - b.startMinute);
  }

  function parseApiWindowStartMinute(settingsValue) {
    if (!Array.isArray(settingsValue)) {
      return null;
    }

    const minutes = settingsValue
      .map((setting) =>
        parseApiTimeToMinute(setting && setting.settingStartTime),
      )
      .filter((minute) => Number.isInteger(minute));

    if (minutes.length === 0) {
      return null;
    }

    return Math.min(...minutes);
  }

  function parseApiWindowEndMinute(settingsValue) {
    if (!Array.isArray(settingsValue)) {
      return null;
    }

    const minutes = settingsValue
      .map((setting) => parseApiTimeToMinute(setting && setting.settingEndTime))
      .filter((minute) => Number.isInteger(minute));

    if (minutes.length === 0) {
      return null;
    }

    return Math.max(...minutes);
  }

  function parseApiTimeToMinute(value) {
    if (typeof value !== "string") {
      return null;
    }

    const match = value.match(/^(\d{2}):(\d{2})(?::\d{2})?$/);
    if (!match) {
      return null;
    }

    const hour = Number(match[1]);
    const minute = Number(match[2]);
    if (!Number.isInteger(hour) || !Number.isInteger(minute)) {
      return null;
    }
    if (hour < 0 || hour > 23 || minute < 0 || minute > 59) {
      return null;
    }

    return hour * 60 + minute;
  }

  function computeDirectTimelineRange(rooms) {
    const fallbackStartMinute = 7 * 60;
    const fallbackEndMinute = 23 * 60;

    const startCandidates = rooms
      .map((room) => room.windowStartMinute)
      .filter((minute) => Number.isInteger(minute));
    const endCandidates = rooms
      .map((room) => room.windowEndMinute)
      .filter((minute) => Number.isInteger(minute));

    const rawStartMinute =
      startCandidates.length > 0
        ? Math.min(...startCandidates)
        : fallbackStartMinute;
    const rawEndMinute =
      endCandidates.length > 0 ? Math.max(...endCandidates) : fallbackEndMinute;

    const startMinute = Math.max(
      0,
      Math.floor(rawStartMinute / TIME_STEP_MINUTES) * TIME_STEP_MINUTES,
    );

    let endMinute = Math.min(
      24 * 60,
      Math.ceil(rawEndMinute / TIME_STEP_MINUTES) * TIME_STEP_MINUTES,
    );

    if (endMinute <= startMinute) {
      endMinute = Math.min(24 * 60, startMinute + TIME_STEP_MINUTES);
    }

    return {
      startMinute,
      endMinute,
      slotMinutes: TIME_STEP_MINUTES,
      startTime: minuteToHourMinute(startMinute),
      endTime: minuteToHourMinute(endMinute),
    };
  }

  function buildDirectTimelineSlots(startMinute, endMinute, slotMinutes) {
    const slots = [];

    for (let minute = startMinute; minute < endMinute; minute += slotMinutes) {
      slots.push({
        startMinute: minute,
        endMinute: minute + slotMinutes,
        label: minuteToHourMinute(minute),
        isHourMark: minute % 60 === 0,
      });
    }

    return slots;
  }

  function toKstMinuteOfDay(isoDateTime) {
    if (typeof isoDateTime !== "string") {
      return null;
    }

    const date = new Date(isoDateTime);
    if (Number.isNaN(date.getTime())) {
      return null;
    }

    const parts = KST_TIME_PARTS_FORMATTER.formatToParts(date);
    const hourNode = parts.find((part) => part.type === "hour");
    const minuteNode = parts.find((part) => part.type === "minute");
    const hour = Number(hourNode && hourNode.value ? hourNode.value : "0");
    const minute = Number(
      minuteNode && minuteNode.value ? minuteNode.value : "0",
    );

    if (!Number.isInteger(hour) || !Number.isInteger(minute)) {
      return null;
    }

    return hour * 60 + minute;
  }

  async function fetchApiJson(url) {
    const response = await fetch(url, {
      headers: {
        accept: "application/json",
      },
    });

    const text = await response.text();
    let data = {};
    if (text) {
      try {
        data = JSON.parse(text);
      } catch (error) {
        data = {};
      }
    }

    if (!response.ok) {
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

  function sanitizeSharingMapIdForApi(value) {
    if (typeof value !== "string" || value.trim() === "") {
      throw new Error("공유 맵 ID를 찾을 수 없습니다.");
    }

    return value.trim();
  }


  globalThis.__zzkGuestDataShared = {
    fetchAvailabilityDirect,
    fetchDailyScheduleDirect,
    loadMapContextDirect,
    buildTargetRoomsFromSpaces: guestDataNormalizers.buildTargetRooms,
    normalizeDirectReservations: guestDataNormalizers.normalizeReservations,
    parseApiWindowStartMinute: guestDataNormalizers.parseWindowStartMinute,
    parseApiWindowEndMinute: guestDataNormalizers.parseWindowEndMinute,
    parseApiTimeToMinute: guestDataNormalizers.parseTimeToMinute,
    computeDirectTimelineRange: guestDataNormalizers.computeTimelineRange,
    buildDirectTimelineSlots: guestDataNormalizers.buildTimelineSlots,
    toKstMinuteOfDay: guestDataNormalizers.toKstMinuteOfDay,
    fetchApiJson,
    sanitizeSharingMapIdForApi,
  };
})();
