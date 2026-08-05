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

  // 이미 채널 형식(<#C123> 또는 #general)이면 그대로 둔다.
  const isChannelForm =
    (normalized.startsWith("<#") && normalized.endsWith(">")) || normalized.startsWith("#");
  if (isChannelForm) {
    return normalized;
  }

  // 사람 멘션(@user, <@U123>)은 채널이 아니다.
  const isUserMention = normalized.startsWith("@") || normalized.startsWith("<@");
  if (!allowBare || isUserMention) {
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

  const rawRemindMinute = startMinute - normalizeSlackReminderLeadMinutes(leadMinutesValue);
  // 음수면 전날로 넘어간다.
  const crossesMidnight = rawRemindMinute < 0;

  return {
    date: crossesMidnight ? addDaysToDateString(dateValue, -1) : dateValue,
    time: minuteToHourMinute(crossesMidnight ? rawRemindMinute + 24 * 60 : rawRemindMinute),
  };
}
