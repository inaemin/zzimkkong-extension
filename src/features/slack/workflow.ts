import {
  closeSlackCopyModal as closeReactSlackCopyModal,
  openSlackCopyModal,
} from "../../ui/slack-copy-modal.js";

// content.js 가 주입하는 의존성 묶음.
//
// content.js 는 아직 .js 라(3단계에서 .tsx 로 다시 쓴다) 여기서 각 의존성의
// 정확한 타입을 알 수 없다. 지금은 형태만 열어두고, content.js 가 컴포넌트로
// 쪼개질 때 이 인터페이스를 구체 타입으로 좁힌다.
type Deps = Record<string, any>;

export function createSlackWorkflow(deps: Deps) {
  const {
    state,
    SLACK_CHANNEL_MENTION_STORAGE_KEY,
    SLACK_REMINDER_LEAD_TIME_STORAGE_KEY,
    SLACK_REMINDER_LEAD_TIME_OPTIONS,
    buildSlackReservationContext,
    setMapCalendarSuppressedBySlack,
    buildSlackReservationMessage,
    normalizeSlackChannelToken,
    normalizeSlackReminderLeadMinutes,
    formatSlackReminderLeadOptionLabel,
    rememberSlackChannelMention,
    forgetSlackChannelMention,
    writeStoredText,
  } = deps;

  function showSlackCopyModal(context) {
    if (!(document.body instanceof HTMLBodyElement)) {
      return;
    }

    closeSlackCopyModal({ restoreMapCalendar: false });
    state.slackModalVisible = true;
    setMapCalendarSuppressedBySlack(true);

    const baseContext =
      context && typeof context === "object" ? { ...context } : buildSlackReservationContext();
    if (typeof baseContext.channelMention !== "string") {
      baseContext.channelMention = state.slackChannelMention || "";
    }

    openSlackCopyModal({
      buildMessage: ({ channelMention, reminderLeadMinutes }) =>
        buildSlackReservationMessage({
          ...baseContext,
          channelMention,
          reminderLeadMinutes,
        }),
      copyText: (message) => copyTextToClipboard(message, null),

      initialChannel: normalizeSlackChannelToken(baseContext.channelMention, { allowBare: true }),
      channelHistory: Array.isArray(state.slackChannelHistory)
        ? [...state.slackChannelHistory]
        : [],
      onChannelCommitted: (channel) => {
        state.slackChannelMention = channel;
        writeStoredText(SLACK_CHANNEL_MENTION_STORAGE_KEY, channel);
        if (channel) {
          rememberSlackChannelMention(channel);
        }
      },
      onChannelRemovedFromHistory: (channel) => {
        forgetSlackChannelMention(channel);
      },

      initialReminderLeadMinutes: normalizeSlackReminderLeadMinutes(state.slackReminderLeadMinutes),
      reminderLeadOptions: [...SLACK_REMINDER_LEAD_TIME_OPTIONS],
      formatReminderLeadLabel: formatSlackReminderLeadOptionLabel,
      onReminderLeadCommitted: (minutes) => {
        state.slackReminderLeadMinutes = minutes;
        writeStoredText(SLACK_REMINDER_LEAD_TIME_STORAGE_KEY, String(minutes));
      },

      onClose: () => {
        state.slackModalVisible = false;
        setMapCalendarSuppressedBySlack(false);
      },
    });
  }

  function closeSlackCopyModal(options: { restoreMapCalendar?: boolean } = {}) {
    const restoreMapCalendar =
      !(options && typeof options === "object") || options.restoreMapCalendar !== false;

    // React 모달은 자기 마운트를 통째로 걷어낸다.
    closeReactSlackCopyModal();

    if (typeof state.slackModalKeydownHandler === "function") {
      document.removeEventListener("keydown", state.slackModalKeydownHandler, true);
      state.slackModalKeydownHandler = null;
    }

    if (restoreMapCalendar) {
      state.slackModalVisible = false;
      setMapCalendarSuppressedBySlack(false);
    }
  }

  async function copyTextToClipboard(textValue, textAreaElement) {
    if (typeof textValue !== "string" || textValue === "") {
      return false;
    }

    if (navigator.clipboard && typeof navigator.clipboard.writeText === "function") {
      try {
        await navigator.clipboard.writeText(textValue);
        return true;
      } catch (error) {
        const ignoredError = error;
        void ignoredError;
      }
    }

    if (textAreaElement instanceof HTMLTextAreaElement) {
      textAreaElement.focus();
      textAreaElement.select();
      try {
        return document.execCommand("copy");
      } catch (error) {
        return false;
      }
    }

    return false;
  }

  return {
    showSlackCopyModal,
    closeSlackCopyModal,
    copyTextToClipboard,
  };
}
