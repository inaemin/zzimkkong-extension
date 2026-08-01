import {
  DEFAULT_SLACK_REMINDER_LEAD_TIME_MINUTES,
  SLACK_REMINDER_LEAD_TIME_OPTIONS,
} from "../../constants/runtime.js";
import {
  addDaysToDateString,
  isDateString,
  minuteToHourMinute,
  parseHourMinute,
} from "../../utils/date-time.js";

export function normalizeSlackFieldText(value) {
  if (typeof value !== "string") {
    return "";
  }

  return value.replace(/\s+/g, " ").trim();
}

export function normalizeSlackChannelToken(value, options = {}) {
  const allowBare = options.allowBare !== false;
  const normalized = normalizeSlackFieldText(value);
  if (!normalized || /\s/.test(normalized)) {
    return "";
  }

  if (normalized.startsWith("<#") && normalized.endsWith(">")) {
    return normalized;
  }

  if (normalized.startsWith("#")) {
    return normalized;
  }

  if (!allowBare) {
    return "";
  }

  if (normalized.startsWith("@") || normalized.startsWith("<@")) {
    return "";
  }

  return `#${normalized}`;
}

export function normalizeSlackReminderLeadMinutes(value) {
  const parsed = Number.parseInt(String(value || ""), 10);
  if (SLACK_REMINDER_LEAD_TIME_OPTIONS.includes(parsed)) {
    return parsed;
  }
  return DEFAULT_SLACK_REMINDER_LEAD_TIME_MINUTES;
}

export function formatSlackReminderLeadOptionLabel(minutes) {
  return minutes === 60 ? "1시간전" : `${minutes}분전`;
}

export function computeSlackReminderDateTime(dateValue, startTimeValue, leadMinutesValue) {
  if (!isDateString(dateValue)) {
    return null;
  }

  const startMinute = parseHourMinute(typeof startTimeValue === "string" ? startTimeValue : "");
  if (!Number.isInteger(startMinute)) {
    return null;
  }

  let remindDate = dateValue;
  let remindMinute = startMinute - normalizeSlackReminderLeadMinutes(leadMinutesValue);
  if (remindMinute < 0) {
    remindMinute += 24 * 60;
    remindDate = addDaysToDateString(remindDate, -1);
  }

  return {
    date: remindDate,
    time: minuteToHourMinute(remindMinute),
  };
}
