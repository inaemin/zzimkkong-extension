import * as React from "react";

import { Button } from "@/ui/components/ui/button";
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/ui/components/ui/dialog";
import { Label } from "@/ui/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/ui/components/ui/select";
import { Spinner } from "@/ui/components/ui/spinner";
import { Textarea } from "@/ui/components/ui/textarea";
import { ChannelCombobox } from "@/ui/components/channel-combobox";

// Slack 메시지 복사 모달.
//
// 메시지 조립(buildMessage)과 복사(copyText)는 프레임워크 무관 함수로 주입받는다.
// 서비스워커·기존 코드에서도 쓰이므로 훅으로 만들지 않는다(로드맵 3단계 원칙).

export type CopyStatusState = "idle" | "success" | "error";

export interface SlackCopyDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;

  /** 선택된 채널(`#채널명`). */
  channel: string;
  onChannelChange: (channel: string) => void;
  channelHistory: string[];
  onRemoveChannelFromHistory: (channel: string) => void;

  reminderLeadMinutes: number;
  reminderLeadOptions: number[];
  onReminderLeadChange: (minutes: number) => void;
  formatReminderLeadLabel: (minutes: number) => string;

  /** 현재 선택으로 만든 메시지 본문. */
  message: string;
  onMessageChange: (message: string) => void;

  /** 클립보드 복사. 성공 여부를 돌려준다. */
  onCopy: (message: string) => Promise<boolean>;
}

/** 복사 상태와 채널에 따른 안내 문구. */
function buildStatusMessage(status: CopyStatusState, channel: string): string {
  if (status === "success") {
    return "복사 완료! Slack 채널에 붙여넣어 주세요.";
  }
  if (status === "error") {
    return "복사에 실패했습니다. 직접 선택해서 복사해 주세요.";
  }
  return channel
    ? `${channel} 채널로 리마인드를 생성합니다.`
    : "채널을 입력하면 해당 채널용 /remind 명령이 생성됩니다.";
}

export function SlackCopyDialog({
  open,
  onOpenChange,
  channel,
  onChannelChange,
  channelHistory,
  onRemoveChannelFromHistory,
  reminderLeadMinutes,
  reminderLeadOptions,
  onReminderLeadChange,
  formatReminderLeadLabel,
  message,
  onMessageChange,
  onCopy,
}: SlackCopyDialogProps) {
  const [copying, setCopying] = React.useState(false);
  const [status, setStatus] = React.useState<CopyStatusState>("idle");

  const statusMessage = buildStatusMessage(status, channel);
  // Select 는 items 로 값→라벨 대응을 받는다. 닫힌 상태의 표시에 쓰인다.
  const reminderLeadItems = React.useMemo(
    () =>
      reminderLeadOptions.map((minutes) => ({
        value: String(minutes),
        label: formatReminderLeadLabel(minutes),
      })),
    [reminderLeadOptions, formatReminderLeadLabel],
  );

  const handleCopy = () => {
    setCopying(true);
    // 리스너에 async 함수를 그대로 넘기면 거부를 아무도 받지 않는다.
    // 여기서 Promise 를 만들고 실패까지 처리한다.
    onCopy(message)
      .then((copied) => {
        setStatus(copied ? "success" : "error");
      })
      .catch(() => {
        setStatus("error");
      })
      .finally(() => {
        setCopying(false);
      });
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>슬랙 메시지 복사</DialogTitle>
          <DialogDescription>Slack에 붙여넣기 전에 내용을 확인해 주세요.</DialogDescription>
        </DialogHeader>

        <div className="grid gap-4">
          {/* 채널과 리마인드 시점을 한 줄에 둔다. 채널이 남는 폭을 갖는다. */}
          <div className="flex items-start gap-3">
            <div className="grid min-w-0 flex-1 gap-2">
              <Label>슬랙 채널</Label>
              <ChannelCombobox
                value={channel}
                onChange={onChannelChange}
                history={channelHistory}
                onRemoveFromHistory={onRemoveChannelFromHistory}
              />
              <p className="text-xs text-muted-foreground">
                비워두면 나에게만 보내고, 채널을 고르면 그 채널에 리마인드를 겁니다.
              </p>
            </div>

            <div className="grid w-32 shrink-0 gap-2">
              <Label htmlFor="zzk-slack-reminder-lead">리마인드 시점</Label>
              <Select
                // items 를 넘겨야 닫혔을 때 SelectValue 가 라벨("10분 전")을 그린다.
                // 안 넘기면 값("10")만 나온다.
                items={reminderLeadItems}
                value={String(reminderLeadMinutes)}
                onValueChange={(next) => onReminderLeadChange(Number(next))}
              >
                <SelectTrigger id="zzk-slack-reminder-lead" className="w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {reminderLeadItems.map((item) => (
                    <SelectItem key={item.value} value={item.value}>
                      {item.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="grid gap-2">
            <Label htmlFor="zzk-slack-message">메시지</Label>
            <Textarea
              id="zzk-slack-message"
              value={message}
              onChange={(event) => onMessageChange(event.target.value)}
              rows={6}
              className="font-mono text-xs"
            />
            {/*
              상태 문구는 DialogDescription 을 쓰지 않는다. Base UI 는 Description 을
              컨텍스트로 등록해 aria-describedby 에 물리는데, 두 개를 두면 나중 것이
              이겨서 헤더의 안내문 대신 이 한 줄만 읽힌다("무엇을 하는 창인지"가 사라짐).
              변경 알림은 role=status(aria-live)로 따로 처리한다.
            */}
            <p
              data-state={status}
              role="status"
              aria-live="polite"
              className="text-xs text-muted-foreground data-[state=error]:text-destructive"
            >
              {statusMessage}
            </p>
          </div>
        </div>

        <DialogFooter>
          <DialogClose render={<Button type="button" variant="outline" />}>취소</DialogClose>
          <Button type="button" onClick={handleCopy} disabled={copying}>
            {copying ? <Spinner /> : null}
            복사하기
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
