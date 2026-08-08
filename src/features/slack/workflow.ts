import type { RadarState } from "../state.js";
import {
  closeSlackCopyModal as closeReactSlackCopyModal,
  openSlackCopyModal,
} from "../../ui/slack-copy-modal.js";

// content.ts 가 주입하는 의존성 묶음.
//
// 의존성 상당수가 content.ts 의 IIFE 클로저 안에 정의돼 있어 바깥에서 타입을
// 끌어올 수 없다. 그래서 여기서는 "쓰는 형태"만 적는다. 해당 함수가 모듈로
// 빠져나오면 그 자리를 typeof import(...) 로 좁힌다.
/**
 * 이미 타입이 있는 의존성은 원본에서 끌어온다. 손으로 다시 적으면 원본이
 * 바뀔 때 조용히 어긋난다. content.ts 클로저 안에만 있는 것들은 형태만 적는다.
 */
type Deps = {
  state: RadarState;
  SLACK_CHANNEL_MENTION_STORAGE_KEY: string;
  SLACK_CHANNEL_HISTORY_STORAGE_KEY: string;
  X_ICON_SVG: string;
  normalizeSlackFieldText: typeof import("./shared.js").normalizeSlackFieldText;
  SLACK_REMINDER_LEAD_TIME_STORAGE_KEY: string;
  SLACK_REMINDER_LEAD_TIME_OPTIONS: readonly number[];
  writeStoredText: typeof import("../../utils/storage.js").writeStoredText;
  normalizeSlackChannelToken: typeof import("./shared.js").normalizeSlackChannelToken;
  normalizeSlackReminderLeadMinutes: typeof import("./shared.js").normalizeSlackReminderLeadMinutes;
  setMapCalendarSuppressedBySlack: (suppressed: boolean) => void;
  formatSlackReminderLeadOptionLabel: typeof import("./shared.js").formatSlackReminderLeadOptionLabel;
  // content.ts 클로저 안에 있어 타입을 끌어올 수 없다. 쓰는 형태만 적는다.
  buildSlackReservationContext: (
    rootOverride?: Document | HTMLElement | null,
  ) => Record<string, unknown>;
  buildSlackReservationMessage: (context: Record<string, unknown>) => string;
  /** 기록에 넣고 갱신된 목록을 돌려준다. */
  rememberSlackChannelMention: (channel: string) => string[];
  /** 기록에서 지우고 남은 목록을 돌려준다. */
  forgetSlackChannelMention: (channel: string) => string[];
};

/** 클립보드 API 로 복사. 권한이 없거나 막히면 false. */
async function writeToClipboard(textValue: string): Promise<boolean> {
  if (!navigator.clipboard || typeof navigator.clipboard.writeText !== "function") {
    return false;
  }
  try {
    await navigator.clipboard.writeText(textValue);
    return true;
  } catch {
    return false;
  }
}

function execCopyCommand(): boolean {
  try {
    return document.execCommand("copy");
  } catch {
    return false;
  }
}

// DI 팩토리 래퍼: 길이가 곧 복잡도가 아니다(안쪽 함수는 개별 측정된다).
// eslint-disable-next-line max-lines-per-function
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

  /** 넘겨받은 문맥을 쓰되, 채널이 비어 있으면 마지막으로 쓴 채널을 채운다. */
  function buildBaseSlackContext(context: unknown): Record<string, unknown> {
    const base =
      context && typeof context === "object" ? { ...context } : buildSlackReservationContext();
    return typeof base.channelMention === "string"
      ? base
      : { ...base, channelMention: state.slackChannelMention || "" };
  }

  function showSlackCopyModal(context: unknown) {
    if (!(document.body instanceof HTMLBodyElement)) {
      return;
    }

    closeSlackCopyModal({ restoreMapCalendar: false });
    state.slackModalVisible = true;
    setMapCalendarSuppressedBySlack(true);

    const baseContext = buildBaseSlackContext(context);

    openSlackCopyModal({
      buildMessage: ({ channelMention, reminderLeadMinutes }) =>
        buildSlackReservationMessage({ ...baseContext, channelMention, reminderLeadMinutes }),
      copyText: (message) => copyTextToClipboard(message, null),
      ...buildChannelOptions(baseContext),
      ...buildReminderOptions(),
      onClose: () => {
        state.slackModalVisible = false;
        setMapCalendarSuppressedBySlack(false);
      },
    });
  }

  /** 채널 입력 관련 옵션. 고른 채널은 저장소와 최근 목록에 남는다. */
  function buildChannelOptions(baseContext: Record<string, unknown>) {
    return {
      initialChannel: normalizeSlackChannelToken(baseContext.channelMention, { allowBare: true }),
      channelHistory: Array.isArray(state.slackChannelHistory)
        ? [...state.slackChannelHistory]
        : [],
      onChannelCommitted: (channel: string) => {
        state.slackChannelMention = channel;
        writeStoredText(SLACK_CHANNEL_MENTION_STORAGE_KEY, channel);
        // 갱신된 목록을 돌려준다. 모달이 이걸로 드롭다운을 맞춘다 —
        // 안 그러면 방금 추가한 채널이 목록에 안 보인다.
        return channel ? rememberSlackChannelMention(channel) : state.slackChannelHistory;
      },
      onChannelRemovedFromHistory: (channel: string) => {
        // 저장소에서 지우고 남은 목록을 돌려준다. 모달이 이걸로 목록을 갱신한다.
        return forgetSlackChannelMention(channel);
      },
    };
  }

  /** 리마인더 시간 관련 옵션. */
  function buildReminderOptions() {
    return {
      initialReminderLeadMinutes: normalizeSlackReminderLeadMinutes(state.slackReminderLeadMinutes),
      reminderLeadOptions: [...SLACK_REMINDER_LEAD_TIME_OPTIONS],
      formatReminderLeadLabel: formatSlackReminderLeadOptionLabel,
      onReminderLeadCommitted: (minutes: number) => {
        state.slackReminderLeadMinutes = minutes;
        writeStoredText(SLACK_REMINDER_LEAD_TIME_STORAGE_KEY, String(minutes));
      },
    };
  }

  function closeSlackCopyModal(options: { restoreMapCalendar?: boolean } = {}) {
    const restoreMapCalendar =
      !(options && typeof options === "object") || options.restoreMapCalendar !== false;

    // React 모달은 자기 마운트를 통째로 걷어낸다.
    closeReactSlackCopyModal();

    if (restoreMapCalendar) {
      state.slackModalVisible = false;
      setMapCalendarSuppressedBySlack(false);
    }
  }

  async function copyTextToClipboard(textValue: string, textAreaElement: HTMLElement | null) {
    if (typeof textValue !== "string" || textValue === "") {
      return false;
    }

    const copiedViaClipboardApi = await writeToClipboard(textValue);
    if (copiedViaClipboardApi) {
      return true;
    }

    // 클립보드 API 가 막힌 환경(권한·비보안 컨텍스트)에서는 선택 후 execCommand.
    if (textAreaElement instanceof HTMLTextAreaElement) {
      textAreaElement.focus();
      textAreaElement.select();
      return execCopyCommand();
    }

    return false;
  }

  return {
    showSlackCopyModal,
    closeSlackCopyModal,
    copyTextToClipboard,
  };
}
