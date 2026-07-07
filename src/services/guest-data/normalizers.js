(() => {
  if (globalThis.__zzkGuestDataNormalizers) {
    return;
  }

  function createGuestDataNormalizers(deps) {
    const {
      getProperty,
      normalizeTargetRoomName,
      normalizeRoomType,
      getRoomTypeForRoomName,
      targetRoomSet,
      targetRoomOrder,
      excludedRoomSet,
      timelineSlotMinutes,
      minuteToHourMinute,
      timePartsFormatter,
    } = deps;

    function normalizeSpaces(spacesResponse) {
      const nestedSpaces = getProperty(spacesResponse, "spaces");
      if (Array.isArray(nestedSpaces)) {
        return nestedSpaces;
      }
      if (Array.isArray(spacesResponse)) {
        return spacesResponse;
      }
      return [];
    }

    function buildTargetRooms(spaces, roomType = null) {
      const normalizedRoomType = normalizeRoomType(roomType);
      return spaces
        .filter((space) => Boolean(getProperty(space, "reservationEnable")))
        .map((space) => {
          const id = Number(getProperty(space, "id"));
          const rawName =
            typeof getProperty(space, "name") === "string" &&
            getProperty(space, "name").trim() !== ""
              ? getProperty(space, "name").trim()
              : "";
          const name = rawName || `공간 ${id}`;

          return {
            id,
            name,
            color:
              typeof getProperty(space, "color") === "string"
                ? getProperty(space, "color")
                : "#9CA3AF",
            windowStartMinute: parseWindowStartMinute(getProperty(space, "settings")),
            windowEndMinute: parseWindowEndMinute(getProperty(space, "settings")),
          };
        })
        .filter((room) => {
          if (!Number.isInteger(room.id)) {
            return false;
          }
          const normalizedName = normalizeTargetRoomName(room.name);
          if (excludedRoomSet instanceof Set && excludedRoomSet.has(normalizedName)) {
            return false;
          }
          if (!normalizedRoomType) {
            return true;
          }
          return getRoomTypeForRoomName(room.name) === normalizedRoomType;
        })
        .sort((a, b) => {
          const orderA = targetRoomOrder.has(normalizeTargetRoomName(a.name))
            ? targetRoomOrder.get(normalizeTargetRoomName(a.name))
            : Number.MAX_SAFE_INTEGER;
          const orderB = targetRoomOrder.has(normalizeTargetRoomName(b.name))
            ? targetRoomOrder.get(normalizeTargetRoomName(b.name))
            : Number.MAX_SAFE_INTEGER;
          if (orderA !== orderB) {
            return orderA - orderB;
          }
          if (orderA === Number.MAX_SAFE_INTEGER && orderB === Number.MAX_SAFE_INTEGER) {
            return a.name.localeCompare(b.name, "ko-KR") || a.id - b.id;
          }
          return orderA - orderB;
        });
    }

    function normalizeReservations(reservationsValue) {
      if (!Array.isArray(reservationsValue)) {
        return [];
      }

      return reservationsValue
        .map((reservation) => {
          const startMinute = toKstMinuteOfDay(getProperty(reservation, "startDateTime"));
          const endMinute = toKstMinuteOfDay(getProperty(reservation, "endDateTime"));

          if (!Number.isInteger(startMinute) || !Number.isInteger(endMinute)) {
            return null;
          }

          const rawDescription =
            typeof getProperty(reservation, "description") === "string" &&
            getProperty(reservation, "description").trim() !== ""
              ? getProperty(reservation, "description").trim()
              : "";
          const rawOwner =
            typeof getProperty(reservation, "name") === "string" &&
            getProperty(reservation, "name").trim() !== ""
              ? getProperty(reservation, "name").trim()
              : "";

          return {
            id: Number(getProperty(reservation, "id")),
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

    function parseWindowStartMinute(settingsValue) {
      if (!Array.isArray(settingsValue)) {
        return null;
      }

      const minutes = settingsValue
        .map((setting) => parseTimeToMinute(getProperty(setting, "settingStartTime")))
        .filter((minute) => Number.isInteger(minute));

      if (minutes.length === 0) {
        return null;
      }

      return Math.min(...minutes);
    }

    function parseWindowEndMinute(settingsValue) {
      if (!Array.isArray(settingsValue)) {
        return null;
      }

      const minutes = settingsValue
        .map((setting) => parseTimeToMinute(getProperty(setting, "settingEndTime")))
        .filter((minute) => Number.isInteger(minute));

      if (minutes.length === 0) {
        return null;
      }

      return Math.max(...minutes);
    }

    function parseTimeToMinute(value) {
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

    function computeTimelineRange(rooms) {
      const fallbackStartMinute = 7 * 60;
      const fallbackEndMinute = 23 * 60;

      const startCandidates = rooms
        .map((room) => room.windowStartMinute)
        .filter((minute) => Number.isInteger(minute));
      const endCandidates = rooms
        .map((room) => room.windowEndMinute)
        .filter((minute) => Number.isInteger(minute));

      const rawStartMinute =
        startCandidates.length > 0 ? Math.min(...startCandidates) : fallbackStartMinute;
      const rawEndMinute =
        endCandidates.length > 0 ? Math.max(...endCandidates) : fallbackEndMinute;

      const startMinute = Math.max(
        0,
        Math.floor(rawStartMinute / timelineSlotMinutes) * timelineSlotMinutes,
      );
      let endMinute = Math.min(
        24 * 60,
        Math.ceil(rawEndMinute / timelineSlotMinutes) * timelineSlotMinutes,
      );

      if (endMinute <= startMinute) {
        endMinute = Math.min(24 * 60, startMinute + timelineSlotMinutes);
      }

      return {
        startMinute,
        endMinute,
        slotMinutes: timelineSlotMinutes,
        startTime: minuteToHourMinute(startMinute),
        endTime: minuteToHourMinute(endMinute),
      };
    }

    function buildTimelineSlots(startMinute, endMinute, slotMinutes) {
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

      const parts = timePartsFormatter.formatToParts(date);
      const hourNode = parts.find((part) => part.type === "hour");
      const minuteNode = parts.find((part) => part.type === "minute");
      const hour = Number(hourNode && typeof hourNode.value === "string" ? hourNode.value : "0");
      const minute = Number(
        minuteNode && typeof minuteNode.value === "string" ? minuteNode.value : "0",
      );

      if (!Number.isInteger(hour) || !Number.isInteger(minute)) {
        return null;
      }

      return hour * 60 + minute;
    }

    return {
      normalizeSpaces,
      buildTargetRooms,
      normalizeReservations,
      parseWindowStartMinute,
      parseWindowEndMinute,
      parseTimeToMinute,
      computeTimelineRange,
      buildTimelineSlots,
      toKstMinuteOfDay,
    };
  }

  globalThis.__zzkGuestDataNormalizers = {
    createGuestDataNormalizers,
  };
})();
