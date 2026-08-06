import {
  DEFAULT_SLACK_REMINDER_LEAD_TIME_MINUTES,
  SLACK_REMINDER_LEAD_TIME_OPTIONS,
} from "../../constants/runtime.js";
import { toDisplayString } from "../../utils/shared.js";
import {
  addDaysToDateString,
  isDateString,
  minuteToHourMinute,
  parseHourMinute,
} from "../../utils/date-time.js";

export function normalizeSlackFieldText(value: unknown): string {
  if (typeof value !== "string") {
    return "";
  }

  return value.replace(/\s+/g, " ").trim();
}

export function normalizeSlackChannelToken(
  value: unknown,
  options: { allowBare?: boolean } = {},
): string {
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

export function normalizeSlackReminderLeadMinutes(value: unknown): number {
  const parsed = Number.parseInt(toDisplayString(value), 10);
  if (SLACK_REMINDER_LEAD_TIME_OPTIONS.includes(parsed)) {
    return parsed;
  }
  return DEFAULT_SLACK_REMINDER_LEAD_TIME_MINUTES;
}

export function formatSlackReminderLeadOptionLabel(minutes: number): string {
  return minutes === 60 ? "1시간전" : `${minutes}분전`;
}

export interface SlackReminderDateTime {
  date: string;
  time: string;
}

export function computeSlackReminderDateTime(
  dateValue: unknown,
  startTimeValue: unknown,
  leadMinutesValue: unknown,
): SlackReminderDateTime | null {
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
