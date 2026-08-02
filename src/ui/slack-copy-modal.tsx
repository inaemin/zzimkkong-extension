import * as React from "react";

import { SLACK_COPY_MODAL_MOUNT_ID } from "../constants/runtime.js";

import { createShadowMount, type ShadowMount } from "./mount.js";
import { SlackCopyDialog } from "./components/slack-copy-dialog.js";

// 기존 코드(content.js 계열)는 명령형이다: showSlackCopyModal(context) 를 부르면
// 모달이 뜬다. React 컴포넌트를 그 인터페이스 뒤에 숨겨, 호출부를 바꾸지 않고
// 내부만 교체한다. content.js 가 컴포넌트로 쪼개지면 이 어댑터는 사라진다.

const MOUNT_ID = SLACK_COPY_MODAL_MOUNT_ID;

export interface SlackCopyModalDeps {
  /** 현재 선택으로 메시지 본문을 만든다(프레임워크 무관 순수 함수). */
  buildMessage: (input: { channelMention: string; reminderLeadMinutes: number }) => string;
  copyText: (message: string) => Promise<boolean>;

  initialChannel: string;
  channelHistory: string[];
  onChannelCommitted: (channel: string) => void;
  onChannelRemovedFromHistory: (channel: string) => void;

  initialReminderLeadMinutes: number;
  reminderLeadOptions: number[];
  formatReminderLeadLabel: (minutes: number) => string;
  onReminderLeadCommitted: (minutes: number) => void;

  /** 모달이 닫힐 때. 기존 코드가 레이더 복원 등을 여기서 한다. */
  onClose: () => void;
}

function SlackCopyModalRoot({ deps, mount }: { deps: SlackCopyModalDeps; mount: ShadowMount }) {
  const [open, setOpen] = React.useState(true);
  const [channel, setChannel] = React.useState(deps.initialChannel);
  const [reminderLeadMinutes, setReminderLeadMinutes] = React.useState(
    deps.initialReminderLeadMinutes,
  );
  // 사용자가 직접 고친 메시지를 덮어쓰지 않도록, 편집 여부를 따로 기억한다.
  const [editedMessage, setEditedMessage] = React.useState<string | null>(null);

  const composedMessage = deps.buildMessage({
    channelMention: channel,
    reminderLeadMinutes,
  });
  const message = editedMessage ?? composedMessage;

  const handleOpenChange = (nextOpen: boolean) => {
    setOpen(nextOpen);
    if (nextOpen) {
      return;
    }
    deps.onClose();
    // 닫는 애니메이션이 끝날 시간을 준 뒤 DOM 에서 걷어낸다.
    window.setTimeout(() => mount.unmount(), 200);
  };

  return (
    <SlackCopyDialog
      open={open}
      onOpenChange={handleOpenChange}
      channel={channel}
      onChannelChange={(next) => {
        setChannel(next);
        // 채널이 바뀌면 조립된 메시지를 다시 따라가게 한다.
        setEditedMessage(null);
        deps.onChannelCommitted(next);
      }}
      channelHistory={deps.channelHistory}
      onRemoveChannelFromHistory={deps.onChannelRemovedFromHistory}
      reminderLeadMinutes={reminderLeadMinutes}
      reminderLeadOptions={deps.reminderLeadOptions}
      onReminderLeadChange={(next) => {
        setReminderLeadMinutes(next);
        setEditedMessage(null);
        deps.onReminderLeadCommitted(next);
      }}
      formatReminderLeadLabel={deps.formatReminderLeadLabel}
      message={message}
      onMessageChange={setEditedMessage}
      onCopy={deps.copyText}
    />
  );
}

/** 기존 showSlackCopyModal 자리에서 부른다. */
export function openSlackCopyModal(deps: SlackCopyModalDeps): void {
  const mount = createShadowMount(MOUNT_ID);
  mount.render(<SlackCopyModalRoot deps={deps} mount={mount} />);
}

/** 기존 closeSlackCopyModal 자리에서 부른다. */
export function closeSlackCopyModal(): void {
  document.getElementById(MOUNT_ID)?.remove();
}
