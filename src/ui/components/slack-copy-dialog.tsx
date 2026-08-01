import * as React from "react";

import { Button } from "@/ui/components/ui/button";
import {
  Dialog,
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

  const statusMessage =
    status === "success"
      ? "복사 완료! Slack 채널에 붙여넣어 주세요."
      : status === "error"
        ? "복사에 실패했습니다. 직접 선택해서 복사해 주세요."
        : channel
          ? `${channel} 채널로 리마인드를 생성합니다.`
          : "채널을 입력하면 해당 채널용 /remind 명령이 생성됩니다.";

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
          <DialogDescription className="whitespace-pre-line">
            {
              "Slack에 붙여넣기 전에 내용을 한 번만 확인해 주세요.\n채널을 입력하면 해당 채널을 대상으로 한 줄짜리 /remind 명령을 생성합니다.\n내가 받은 리마인더는 Later 탭에서 볼 수 있고, /remind list에는 채널 리마인더만 보여요."
            }
          </DialogDescription>
        </DialogHeader>

        <div className="grid gap-4">
          <div className="grid gap-2">
            <Label>슬랙 채널</Label>
            <ChannelCombobox
              value={channel}
              onChange={onChannelChange}
              history={channelHistory}
              onRemoveFromHistory={onRemoveChannelFromHistory}
            />
          </div>

          <div className="grid gap-2">
            <Label htmlFor="zzk-slack-reminder-lead">리마인드 시점</Label>
            <Select
              value={String(reminderLeadMinutes)}
              onValueChange={(next) => onReminderLeadChange(Number(next))}
            >
              <SelectTrigger id="zzk-slack-reminder-lead" className="w-40">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {reminderLeadOptions.map((minutes) => (
                  <SelectItem key={minutes} value={String(minutes)}>
                    {formatReminderLeadLabel(minutes)}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
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
          </div>
        </div>

        <DialogFooter className="sm:justify-between">
          <p
            data-state={status}
            className="text-muted-foreground data-[state=error]:text-destructive text-xs"
          >
            {statusMessage}
          </p>
          <Button type="button" onClick={handleCopy} disabled={copying}>
            {copying ? <Spinner /> : null}
            복사하기
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
