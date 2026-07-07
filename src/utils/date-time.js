(() => {
  if (globalThis.__zzkDateTimeUtils) {
    return;
  }

  function reportMissingBootstrapDependencies(missing) {
    if (!Array.isArray(globalThis.__zzkBootstrapLoadErrors)) {
      globalThis.__zzkBootstrapLoadErrors = [];
    }
    globalThis.__zzkBootstrapLoadErrors.push({
      script: "src/utils/date-time.js",
      reason: "missing-bootstrap-dependencies",
      missing,
    });
  }

  const missingBootstrapDependencies = [
    ["__zzkSharedConstants", globalThis.__zzkSharedConstants],
    ["__zzkSharedUtils", globalThis.__zzkSharedUtils],
  ]
    .filter(([, value]) => !value)
    .map(([name]) => name);

  if (missingBootstrapDependencies.length > 0) {
    reportMissingBootstrapDependencies(missingBootstrapDependencies);
    return;
  }

  const {
    KST_DATE_PARTS_FORMATTER,
    KST_TIME_PARTS_FORMATTER,
    KST_WEEKDAY_FORMATTER,
    TIME_STEP_MINUTES,
  } = globalThis.__zzkSharedConstants;
  const { getErrorMessage } = globalThis.__zzkSharedUtils;

  function isDateString(value) {
    return typeof value === "string" && /^\d{4}-\d{2}-\d{2}$/.test(value);
  }

  function normalizeDateString(value) {
    if (!isDateString(value)) {
      return null;
    }
    return value;
  }

  function parseHourMinute(value) {
    if (typeof value !== "string") {
      return null;
    }

    const match = value.match(/^(\d{2}):(\d{2})$/);
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

  function minuteToHourMinute(totalMinute) {
    if (!Number.isFinite(totalMinute)) {
      return "00:00";
    }

    const minute = ((Math.trunc(totalMinute) % (24 * 60)) + 24 * 60) % (24 * 60);
    const hour = Math.floor(minute / 60);
    const remainMinute = minute % 60;
    return `${String(hour).padStart(2, "0")}:${String(remainMinute).padStart(2, "0")}`;
  }

  function parseLocalizedHourMinute(value) {
    if (typeof value !== "string") {
      return null;
    }

    const normalized = value.replace(/\s+/g, " ").trim();
    const meridiemMatch = normalized.match(/(오전|오후)\s*(\d{1,2})\s*[:시]\s*(\d{1,2})/);
    if (meridiemMatch) {
      const meridiem = meridiemMatch[1];
      const hour12 = Number(meridiemMatch[2]);
      const minute = Number(meridiemMatch[3]);
      if (!Number.isInteger(hour12) || !Number.isInteger(minute)) {
        return null;
      }
      if (hour12 < 1 || hour12 > 12 || minute < 0 || minute > 59) {
        return null;
      }
      let hour24 = hour12 % 12;
      if (meridiem === "오후") {
        hour24 += 12;
      }
      return hour24 * 60 + minute;
    }

    const compactMatch = normalized.match(/(^|[^0-9])(\d{1,2})\s*:\s*(\d{2})(?!\d)/);
    if (!compactMatch) {
      return null;
    }

    const hour = Number(compactMatch[2]);
    const minute = Number(compactMatch[3]);
    if (!Number.isInteger(hour) || !Number.isInteger(minute)) {
      return null;
    }
    if (hour < 0 || hour > 23 || minute < 0 || minute > 59) {
      return null;
    }

    return hour * 60 + minute;
  }

  function extractHourMinute(value) {
    if (typeof value !== "string") {
      return null;
    }

    const match = value.match(/(^|[^0-9])(\d{1,2})\s*:\s*(\d{2})(?!\d)/);
    if (!match) {
      return null;
    }

    const hour = Number(match[2]);
    const minute = Number(match[3]);
    if (!Number.isInteger(hour) || !Number.isInteger(minute)) {
      return null;
    }
    if (hour < 0 || hour > 23 || minute < 0 || minute > 59) {
      return null;
    }

    return `${String(hour).padStart(2, "0")}:${String(minute).padStart(2, "0")}`;
  }

  function normalizeHourMinute(value) {
    if (typeof value !== "string") {
      return null;
    }

    const raw = value.trim();
    const parsed = parseHourMinute(raw);
    if (Number.isInteger(parsed)) {
      return minuteToHourMinute(parsed);
    }

    const localized = parseLocalizedHourMinute(raw);
    if (Number.isInteger(localized)) {
      return minuteToHourMinute(localized);
    }

    return extractHourMinute(value);
  }

  function normalizeToTenMinute(value) {
    const totalMinute = parseHourMinute(value);
    if (!Number.isInteger(totalMinute)) {
      return value;
    }

    const normalizedMinute = Math.round(totalMinute / TIME_STEP_MINUTES) * TIME_STEP_MINUTES;
    const maxMinute = 24 * 60 - TIME_STEP_MINUTES;
    const clampedMinute = Math.max(0, Math.min(maxMinute, normalizedMinute));
    return minuteToHourMinute(clampedMinute);
  }

  function isTenMinuteAligned(value) {
    const totalMinute = parseHourMinute(value);
    if (!Number.isInteger(totalMinute)) {
      return false;
    }

    return totalMinute % TIME_STEP_MINUTES === 0;
  }

  function formatDate(date) {
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, "0");
    const day = String(date.getDate()).padStart(2, "0");
    return `${year}-${month}-${day}`;
  }

  function getTodayDateInKST() {
    const parts = KST_DATE_PARTS_FORMATTER.formatToParts(new Date());
    const year = parts.find((part) => part.type === "year")?.value || "1970";
    const month = parts.find((part) => part.type === "month")?.value || "01";
    const day = parts.find((part) => part.type === "day")?.value || "01";
    return `${year}-${month}-${day}`;
  }

  function getCurrentMinuteOfDayInKST() {
    const parts = KST_TIME_PARTS_FORMATTER.formatToParts(new Date());
    const hour = Number(parts.find((part) => part.type === "hour")?.value || "0");
    const minute = Number(parts.find((part) => part.type === "minute")?.value || "0");
    const second = Number(parts.find((part) => part.type === "second")?.value || "0");

    if (!Number.isInteger(hour) || !Number.isInteger(minute) || !Number.isInteger(second)) {
      return 0;
    }

    return hour * 60 + minute + second / 60;
  }

  function sanitizeDateForApi(value, options = {}) {
    if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(value)) {
      throw new Error("날짜 형식이 올바르지 않습니다.");
    }

    if (options?.allowPastDate !== true && value < getTodayDateInKST()) {
      throw new Error("오늘 이전 날짜는 선택할 수 없습니다.");
    }

    return value;
  }

  function sanitizeTimeForApi(value) {
    if (typeof value !== "string" || !/^\d{2}:\d{2}$/.test(value)) {
      throw new Error("시간 형식이 올바르지 않습니다.");
    }

    const minute = parseHourMinute(value);
    if (!Number.isInteger(minute)) {
      throw new Error("시간 형식이 올바르지 않습니다.");
    }
    if (minute % TIME_STEP_MINUTES !== 0) {
      throw new Error("시간은 10분 단위로 선택해 주세요.");
    }

    return minuteToHourMinute(minute);
  }

  function getNextHourRange() {
    const earliestMinute = 7 * 60;
    const latestEndMinute = 23 * 60;
    const nowMinute = getCurrentMinuteOfDayInKST();
    const snappedNow = Math.ceil(nowMinute / TIME_STEP_MINUTES) * TIME_STEP_MINUTES;
    const startMinute = Math.max(earliestMinute, snappedNow);

    if (startMinute < latestEndMinute) {
      const endMinute = Math.min(latestEndMinute, startMinute + 60);
      if (endMinute > startMinute) {
        return {
          startTime: minuteToHourMinute(startMinute),
          endTime: minuteToHourMinute(endMinute),
          useNextDay: false,
        };
      }
    }

    return {
      startTime: "07:00",
      endTime: "08:00",
      useNextDay: true,
    };
  }

  function getEarliestSelectableMinuteForDate(date) {
    const todayDate = getTodayDateInKST();
    if (!isDateString(date)) {
      return 0;
    }
    if (date < todayDate) {
      return 24 * 60;
    }
    if (date > todayDate) {
      return 0;
    }

    const nowMinute = getCurrentMinuteOfDayInKST();
    if (!Number.isFinite(nowMinute)) {
      return 0;
    }

    const snappedMinute = Math.ceil(nowMinute / TIME_STEP_MINUTES) * TIME_STEP_MINUTES;
    return Math.max(0, Math.min(24 * 60, snappedMinute));
  }

  function addDaysToDateString(dateString, dayOffset) {
    if (!isDateString(dateString) || !Number.isInteger(dayOffset)) {
      return dateString;
    }
    const [year, month, day] = dateString.split('-').map((value) => Number(value));
    const date = new Date(Date.UTC(year, month - 1, day));
    if (Number.isNaN(date.getTime())) {
      return dateString;
    }
    date.setUTCDate(date.getUTCDate() + dayOffset);
    const shiftedYear = String(date.getUTCFullYear()).padStart(4, "0");
    const shiftedMonth = String(date.getUTCMonth() + 1).padStart(2, "0");
    const shiftedDay = String(date.getUTCDate()).padStart(2, "0");
    return `${shiftedYear}-${shiftedMonth}-${shiftedDay}`;
  }

  function formatUTCDateString(date) {
    if (!(date instanceof Date) || Number.isNaN(date.getTime())) {
      return "";
    }
    const year = String(date.getUTCFullYear()).padStart(4, "0");
    const month = String(date.getUTCMonth() + 1).padStart(2, "0");
    const day = String(date.getUTCDate()).padStart(2, "0");
    return `${year}-${month}-${day}`;
  }

  function parseDateStringAsUTC(dateString) {
    if (!isDateString(dateString)) {
      return null;
    }
    const [year, month, day] = dateString.split('-').map((value) => Number(value));
    const date = new Date(Date.UTC(year, month - 1, day));
    return Number.isNaN(date.getTime()) ? null : date;
  }

  function addMonthsToDateString(dateString, monthOffset) {
    if (!isDateString(dateString) || !Number.isInteger(monthOffset)) {
      return dateString;
    }
    const parsedDate = parseDateStringAsUTC(dateString);
    if (!(parsedDate instanceof Date)) {
      return dateString;
    }
    parsedDate.setUTCDate(1);
    parsedDate.setUTCMonth(parsedDate.getUTCMonth() + monthOffset);
    return formatUTCDateString(parsedDate);
  }

  function getMonthStartDateString(dateString) {
    const parsedDate = parseDateStringAsUTC(dateString);
    if (!(parsedDate instanceof Date)) {
      return "";
    }
    parsedDate.setUTCDate(1);
    return formatUTCDateString(parsedDate);
  }

  function formatMonthTitle(date) {
    if (!(date instanceof Date) || Number.isNaN(date.getTime())) {
      return "";
    }
    const year = date.getUTCFullYear();
    const month = String(date.getUTCMonth() + 1).padStart(2, "0");
    return `${year}.${month}`;
  }

  function formatKSTWeekday(dateString) {
    const parsedDate = parseDateStringAsUTC(dateString);
    if (!(parsedDate instanceof Date)) {
      return "";
    }
    return KST_WEEKDAY_FORMATTER.format(parsedDate);
  }

  function formatDateSelectorText(dateString) {
    if (!isDateString(dateString)) {
      return "";
    }
    const [year, month, day] = dateString.split('-');
    const weekdayText = formatKSTWeekday(dateString);
    return weekdayText ? `${year}.${month}.${day} (${weekdayText})` : `${year}.${month}.${day}`;
  }

  globalThis.__zzkDateTimeUtils = {
    getErrorMessage,
    normalizeDateString,
    isDateString,
    parseHourMinute,
    minuteToHourMinute,
    parseLocalizedHourMinute,
    extractHourMinute,
    normalizeHourMinute,
    normalizeToTenMinute,
    isTenMinuteAligned,
    formatDate,
    getTodayDateInKST,
    getCurrentMinuteOfDayInKST,
    sanitizeDateForApi,
    sanitizeTimeForApi,
    getNextHourRange,
    getEarliestSelectableMinuteForDate,
    addDaysToDateString,
    formatUTCDateString,
    parseDateStringAsUTC,
    addMonthsToDateString,
    getMonthStartDateString,
    formatMonthTitle,
    formatKSTWeekday,
    formatDateSelectorText,
  };
})();
