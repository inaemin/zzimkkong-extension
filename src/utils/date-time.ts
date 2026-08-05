import {
  KST_DATE_PARTS_FORMATTER,
  KST_TIME_PARTS_FORMATTER,
  KST_WEEKDAY_FORMATTER,
  TIME_STEP_MINUTES,
} from "../constants/runtime.js";

// UTC 기준이라 서머타임 영향을 받지 않는다(Date.UTC 로 만든 값에만 쓴다).
const MILLISECONDS_PER_DAY = 24 * 60 * 60 * 1000;

export function isDateString(value: unknown): value is string {
  return typeof value === "string" && /^\d{4}-\d{2}-\d{2}$/.test(value);
}

export function normalizeDateString(value: unknown): string | null {
  if (!isDateString(value)) {
    return null;
  }
  return value;
}

/**
 * 시/분 숫자쌍을 분으로. 범위를 벗어나면 null.
 *
 * parseHourMinute / parseLocalizedHourMinute / extractHourMinute 이 같은 검사를
 * 반복하고 있어 한 곳으로 모았다.
 */
function toMinuteOfDay(hourValue: string, minuteValue: string): number | null {
  const hour = Number(hourValue);
  const minute = Number(minuteValue);
  if (!Number.isInteger(hour) || !Number.isInteger(minute)) {
    return null;
  }
  if (hour < 0 || hour > 23 || minute < 0 || minute > 59) {
    return null;
  }
  return hour * 60 + minute;
}

export function parseHourMinute(value: unknown): number | null {
  if (typeof value !== "string") {
    return null;
  }

  const match = value.match(/^(\d{2}):(\d{2})$/);
  return match ? toMinuteOfDay(match[1], match[2]) : null;
}

export function minuteToHourMinute(totalMinute: number): string {
  if (!Number.isFinite(totalMinute)) {
    return "00:00";
  }

  const minute = ((Math.trunc(totalMinute) % (24 * 60)) + 24 * 60) % (24 * 60);
  const hour = Math.floor(minute / 60);
  const remainMinute = minute % 60;
  return `${String(hour).padStart(2, "0")}:${String(remainMinute).padStart(2, "0")}`;
}

/** "오후 3시 30분" 형태의 매치를 분으로. 범위를 벗어나면 null. */
function parseMeridiemMatch(match: RegExpMatchArray): number | null {
  const hour12 = Number(match[2]);
  if (!Number.isInteger(hour12) || hour12 < 1 || hour12 > 12) {
    return null;
  }
  // 12시제 → 24시제. 오전 12시는 0시, 오후 12시는 12시다.
  const hour24 = (hour12 % 12) + (match[1] === "오후" ? 12 : 0);
  return toMinuteOfDay(String(hour24), match[3]);
}

function parseLocalizedHourMinute(value: unknown): number | null {
  if (typeof value !== "string") {
    return null;
  }

  const normalized = value.replace(/\s+/g, " ").trim();
  const meridiemMatch = normalized.match(/(오전|오후)\s*(\d{1,2})\s*[:시]\s*(\d{1,2})/);
  if (meridiemMatch) {
    return parseMeridiemMatch(meridiemMatch);
  }

  const compactMatch = normalized.match(/(^|[^0-9])(\d{1,2})\s*:\s*(\d{2})(?!\d)/);
  return compactMatch ? toMinuteOfDay(compactMatch[2], compactMatch[3]) : null;
}

function extractHourMinute(value: unknown): string | null {
  if (typeof value !== "string") {
    return null;
  }

  const match = value.match(/(^|[^0-9])(\d{1,2})\s*:\s*(\d{2})(?!\d)/);
  const totalMinute = match ? toMinuteOfDay(match[2], match[3]) : null;
  return totalMinute === null ? null : minuteToHourMinute(totalMinute);
}

export function normalizeHourMinute(value: unknown): string | null {
  if (typeof value !== "string") {
    return null;
  }

  const raw = value.trim();
  const parsed = parseHourMinute(raw);
  if (parsed !== null) {
    return minuteToHourMinute(parsed);
  }

  const localized = parseLocalizedHourMinute(raw);
  if (localized !== null) {
    return minuteToHourMinute(localized);
  }

  return extractHourMinute(value);
}

// 파싱 실패 시 입력을 그대로 돌려준다(호출부가 input.value 라 항상 문자열).
export function normalizeToTenMinute(value: string): string {
  const totalMinute = parseHourMinute(value);
  if (totalMinute === null) {
    return value;
  }

  const normalizedMinute = Math.round(totalMinute / TIME_STEP_MINUTES) * TIME_STEP_MINUTES;
  const maxMinute = 24 * 60 - TIME_STEP_MINUTES;
  const clampedMinute = Math.max(0, Math.min(maxMinute, normalizedMinute));
  return minuteToHourMinute(clampedMinute);
}

export function isTenMinuteAligned(value: unknown): boolean {
  const totalMinute = parseHourMinute(value);
  if (totalMinute === null) {
    return false;
  }

  return totalMinute % TIME_STEP_MINUTES === 0;
}

export function getTodayDateInKST(): string {
  const parts = KST_DATE_PARTS_FORMATTER.formatToParts(new Date());
  const year = parts.find((part) => part.type === "year")?.value || "1970";
  const month = parts.find((part) => part.type === "month")?.value || "01";
  const day = parts.find((part) => part.type === "day")?.value || "01";
  return `${year}-${month}-${day}`;
}

export function getCurrentMinuteOfDayInKST(): number {
  const parts = KST_TIME_PARTS_FORMATTER.formatToParts(new Date());
  const hour = Number(parts.find((part) => part.type === "hour")?.value || "0");
  const minute = Number(parts.find((part) => part.type === "minute")?.value || "0");
  const second = Number(parts.find((part) => part.type === "second")?.value || "0");

  if (!Number.isInteger(hour) || !Number.isInteger(minute) || !Number.isInteger(second)) {
    return 0;
  }

  return hour * 60 + minute + second / 60;
}

export function sanitizeDateForApi(
  value: unknown,
  options: { allowPastDate?: boolean } = {},
): string {
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    throw new Error("날짜 형식이 올바르지 않습니다.");
  }

  if (options?.allowPastDate !== true && value < getTodayDateInKST()) {
    throw new Error("오늘 이전 날짜는 선택할 수 없습니다.");
  }

  return value;
}

export function sanitizeTimeForApi(value: unknown): string {
  if (typeof value !== "string" || !/^\d{2}:\d{2}$/.test(value)) {
    throw new Error("시간 형식이 올바르지 않습니다.");
  }

  const minute = parseHourMinute(value);
  if (minute === null) {
    throw new Error("시간 형식이 올바르지 않습니다.");
  }
  if (minute % TIME_STEP_MINUTES !== 0) {
    throw new Error("시간은 10분 단위로 선택해 주세요.");
  }

  return minuteToHourMinute(minute);
}

/** 회의실 운영 시간(07:00~23:00). 이 밖이면 다음 날로 넘긴다. */
const OPENING_MINUTE = 7 * 60;
const CLOSING_MINUTE = 23 * 60;

/** 지금 이후로 잡을 수 있는 가장 이른 시작 시각(10분 단위로 올림). */
function nextSelectableStartMinute(): number {
  const snappedNow =
    Math.ceil(getCurrentMinuteOfDayInKST() / TIME_STEP_MINUTES) * TIME_STEP_MINUTES;
  return Math.max(OPENING_MINUTE, snappedNow);
}

export function getNextHourRange() {
  const startMinute = nextSelectableStartMinute();
  const endMinute = Math.min(CLOSING_MINUTE, startMinute + 60);

  // 오늘 안에 한 칸도 못 잡으면 다음 날 첫 시간으로 넘긴다.
  if (startMinute >= CLOSING_MINUTE || endMinute <= startMinute) {
    return { startTime: "07:00", endTime: "08:00", useNextDay: true };
  }

  return {
    startTime: minuteToHourMinute(startMinute),
    endTime: minuteToHourMinute(endMinute),
    useNextDay: false,
  };
}

/** 오늘 안에서 지금까지 지나간 부분. 시각을 못 읽으면 0(제한 없음). */
function elapsedMinuteToday(): number {
  const nowMinute = getCurrentMinuteOfDayInKST();
  if (!Number.isFinite(nowMinute)) {
    return 0;
  }
  const snappedMinute = Math.ceil(nowMinute / TIME_STEP_MINUTES) * TIME_STEP_MINUTES;
  return Math.max(0, Math.min(24 * 60, snappedMinute));
}

export function getEarliestSelectableMinuteForDate(date: unknown): number {
  const todayDate = getTodayDateInKST();
  if (!isDateString(date)) {
    return 0;
  }
  // 지난 날짜는 하루 전체가 막힌다. 미래는 처음부터 고를 수 있다.
  if (date < todayDate) {
    return 24 * 60;
  }
  if (date > todayDate) {
    return 0;
  }
  return elapsedMinuteToday();
}

export function addDaysToDateString(dateString: string, dayOffset: number): string {
  if (!isDateString(dateString) || !Number.isInteger(dayOffset)) {
    return dateString;
  }
  const [year, month, day] = dateString.split("-").map((value) => Number(value));
  const date = new Date(Date.UTC(year, month - 1, day));
  if (Number.isNaN(date.getTime())) {
    return dateString;
  }
  // setUTCDate 는 원본을 바꾼다. 옮긴 날짜로 새 Date 를 만든다.
  const shifted = new Date(date.getTime() + dayOffset * MILLISECONDS_PER_DAY);
  const shiftedYear = String(shifted.getUTCFullYear()).padStart(4, "0");
  const shiftedMonth = String(shifted.getUTCMonth() + 1).padStart(2, "0");
  const shiftedDay = String(shifted.getUTCDate()).padStart(2, "0");
  return `${shiftedYear}-${shiftedMonth}-${shiftedDay}`;
}

function parseDateStringAsUTC(dateString: string): Date | null {
  if (!isDateString(dateString)) {
    return null;
  }
  const [year, month, day] = dateString.split("-").map((value) => Number(value));
  const date = new Date(Date.UTC(year, month - 1, day));
  return Number.isNaN(date.getTime()) ? null : date;
}

function formatKSTWeekday(dateString: string): string {
  const parsedDate = parseDateStringAsUTC(dateString);
  if (!(parsedDate instanceof Date)) {
    return "";
  }
  return KST_WEEKDAY_FORMATTER.format(parsedDate);
}

export function formatDateSelectorText(dateString: string): string {
  if (!isDateString(dateString)) {
    return "";
  }
  const [year, month, day] = dateString.split("-");
  const weekdayText = formatKSTWeekday(dateString);
  return weekdayText ? `${year}.${month}.${day} (${weekdayText})` : `${year}.${month}.${day}`;
}

/**
 * 최소 날짜 아래로 내려가지 않게 잡아준다.
 *
 * 레이더는 과거 날짜를 고를 수 없다. 날짜를 옮길 때마다 이 함수로 한 번
 * 거른다. 최소값이 없으면(형식이 아니면) 값만 검증해서 돌려준다.
 */
export function clampDateToMin(value: unknown, minDate: unknown): string {
  if (!isDateString(minDate)) {
    return isDateString(value) ? value : "";
  }
  if (!isDateString(value)) {
    return minDate;
  }
  return value < minDate ? minDate : value;
}
