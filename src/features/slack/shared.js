(() => {
  if (globalThis.__zzkSlackShared) {
    return;
  }

  function reportMissingBootstrapDependencies(missing) {
    if (!Array.isArray(globalThis.__zzkBootstrapLoadErrors)) {
      globalThis.__zzkBootstrapLoadErrors = [];
    }
    globalThis.__zzkBootstrapLoadErrors.push({
      script: "src/features/slack/shared.js",
      reason: "missing-bootstrap-dependencies",
      missing,
    });
  }

  const missingBootstrapDependencies = [
    ["__zzkSharedConstants", globalThis.__zzkSharedConstants],
    ["__zzkDateTimeUtils", globalThis.__zzkDateTimeUtils],
  ]
    .filter(([, value]) => !value)
    .map(([name]) => name);

  if (missingBootstrapDependencies.length > 0) {
    reportMissingBootstrapDependencies(missingBootstrapDependencies);
    return;
  }

  const {
    DEFAULT_SLACK_REMINDER_LEAD_TIME_MINUTES,
    SLACK_REMINDER_LEAD_TIME_OPTIONS,
  } = globalThis.__zzkSharedConstants;
  const { isDateString, addDaysToDateString, parseHourMinute, minuteToHourMinute } = globalThis.__zzkDateTimeUtils;

  function normalizeSlackFieldText(value) {
    if (typeof value !== "string") {
      return "";
    }

    return value.replace(/\s+/g, " ").trim();
  }

  function normalizeSlackChannelToken(value, options = {}) {
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

  function normalizeSlackReminderLeadMinutes(value) {
    const parsed = Number.parseInt(String(value || ""), 10);
    if (SLACK_REMINDER_LEAD_TIME_OPTIONS.includes(parsed)) {
      return parsed;
    }
    return DEFAULT_SLACK_REMINDER_LEAD_TIME_MINUTES;
  }

  function formatSlackReminderLeadOptionLabel(minutes) {
    return minutes === 60 ? "1시간전" : `${minutes}분전`;
  }

  function computeSlackReminderDateTime(dateValue, startTimeValue, leadMinutesValue) {
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

  globalThis.__zzkSlackShared = {
    normalizeSlackFieldText,
    normalizeSlackChannelToken,
    normalizeSlackReminderLeadMinutes,
    formatSlackReminderLeadOptionLabel,
    computeSlackReminderDateTime,
  };
})();
