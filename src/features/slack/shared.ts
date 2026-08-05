import {
  DEFAULT_SLACK_REMINDER_LEAD_TIME_MINUTES,
  MAP_CALENDAR_ROOM_FLOOR_BY_NAME,
  SLACK_REMINDER_LEAD_TIME_OPTIONS,
} from "../../constants/runtime.js";
import { toDisplayString } from "../../utils/shared.js";
import {
  addDaysToDateString,
  isDateString,
  minuteToHourMinute,
  normalizeHourMinute,
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

/** Slack /remind 명령에 담을 문맥. content 가 호스트 폼에서 모아 넘긴다. */
export interface SlackRemindContext {
  date?: unknown;
  startTime?: unknown;
  endTime?: unknown;
  description?: unknown;
  roomName?: unknown;
  reminderLeadMinutes?: unknown;
}

/** "09:00-10:00". 읽을 수 없는 값은 --:-- 로 자리만 채운다. */
export function resolveSlackRemindTimeRangeLabel(context: SlackRemindContext): string {
  const start = typeof context?.startTime === "string" ? context.startTime : "";
  const end = typeof context?.endTime === "string" ? context.endTime : "";
  return `${normalizeHourMinute(start) || "--:--"}-${normalizeHourMinute(end) || "--:--"}`;
}

/** 회의 제목. 비어 있거나 자리표시자(-)면 "회의". */
export function resolveSlackRemindSubjectLabel(context: SlackRemindContext): string {
  const subject = normalizeSlackFieldText(
    typeof context?.description === "string" ? context.description : "",
  );
  return !subject || subject === "-" ? "회의" : subject;
}

/** "11F 보이저". 층은 표에서 찾고, 없으면 이름에 섞인 "11층"을 쓴다. */
export function formatSlackFloorLabel(value: unknown): string {
  const normalized = normalizeSlackFieldText(value);
  const matched = normalized.match(/^(\d+)\s*층$/u);
  return matched ? `${matched[1]}F` : normalized;
}

export function resolveSlackRemindLocationLabel(context: SlackRemindContext): string {
  const rawRoomName = normalizeSlackFieldText(
    typeof context?.roomName === "string" ? context.roomName : "",
  );
  const sanitized = rawRoomName === "-" ? "" : rawRoomName;
  // "11층 보이저" 처럼 층이 이름에 붙어 오는 경우가 있어 떼어낸다.
  const roomName = sanitized.replace(/^\d+\s*층\s*/u, "").trim() || sanitized;

  const floorFromMap = roomName ? MAP_CALENDAR_ROOM_FLOOR_BY_NAME.get(roomName) || "" : "";
  const floorFromText = sanitized.match(/(\d+\s*층)/u)?.[1]?.replace(/\s+/g, "") || "";

  return [formatSlackFloorLabel(floorFromMap || floorFromText), roomName || "회의실"]
    .filter(Boolean)
    .join(" ");
}

/** /remind 한 줄로 조립한다. 큰따옴표는 명령을 깨지 않게 이스케이프한다. */
function formatRemindCommand(
  channel: string,
  body: string,
  reminderDateTime: { date: string; time: string } | null,
): string {
  const recipient = channel || "me";
  const remindBody = (channel ? `${body} @channel` : body).replace(/"/g, '\\"');
  const when = reminderDateTime
    ? `on ${reminderDateTime.date} at ${reminderDateTime.time}`
    : "at HH:MM";
  return `/remind ${recipient} "${remindBody}" ${when}`;
}

/**
 * Slack /remind 명령 한 줄.
 *
 * 채널을 지정하면 그 채널에 @channel 로, 없으면 me 에게 보낸다.
 * 예약 시각을 알면 "on <날짜> at <시각>" 을 붙이고, 모르면 HH:MM 자리만 둔다.
 */
export function buildSlackRemindCommand(
  context: SlackRemindContext,
  channelMention: unknown,
): string {
  const channel = normalizeSlackChannelToken(channelMention || "", { allowBare: true });
  const body = [
    resolveSlackRemindTimeRangeLabel(context),
    resolveSlackRemindSubjectLabel(context),
    "at",
    resolveSlackRemindLocationLabel(context),
  ].join(" ");
  const reminderDateTime = computeSlackReminderDateTime(
    context?.date,
    context?.startTime,
    context?.reminderLeadMinutes,
  );

  return formatRemindCommand(channel, body, reminderDateTime);
}
