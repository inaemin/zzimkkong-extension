import * as React from "react";

import {
  Combobox,
  ComboboxChip,
  ComboboxChips,
  ComboboxChipsInput,
  ComboboxContent,
  ComboboxItem,
  ComboboxList,
  ComboboxValue,
  useComboboxAnchor,
} from "@/ui/components/ui/combobox";
import { cn } from "@/ui/lib/utils";

// Slack 모달의 채널 선택기.
//
// 실제로 고를 수 있는 채널은 하나뿐인데 multiple 모드를 쓴다. chip 모양과
// 상자 안에서 바로 입력하는 형태가 목적이라, 값이 늘어나면 마지막 것만
// 남겨 단일 선택처럼 동작시킨다(아래 handleValueChange 참고).

export interface ChannelComboboxProps {
  /** 선택된 채널(`#채널명`). 없으면 빈 문자열. */
  value: string;
  onChange: (nextValue: string) => void;
  /** 최근 사용한 채널 목록. */
  history: string[];
  onRemoveFromHistory: (channel: string) => void;
  className?: string;
}

/** 사용자가 뭐라고 적었든 `#채널명` 한 가지 모양으로 만든다. */
function normalizeChannel(raw: string): string {
  const name = raw.trim().replace(/^#*/, "");
  return name ? `#${name}` : "";
}

export function ChannelCombobox({
  value,
  onChange,
  history,
  onRemoveFromHistory,
  className,
}: ChannelComboboxProps) {
  const anchor = useComboboxAnchor();
  const [query, setQuery] = React.useState("");
  const [open, setOpen] = React.useState(false);

  const selected = value ? [value] : [];
  const typed = normalizeChannel(query);
  // 적은 값이 목록에 없으면 "추가" 항목을 맨 위에 띄운다.
  const canAddTyped = typed !== "" && !history.includes(typed);
  // 걸러내기를 직접 한다. Base UI 내부 필터에 맡기면 칩을 고른 뒤 목록이
  // 갱신되지 않는 경우가 있다(선택으로 리렌더가 겹칠 때).
  const matched = query.trim()
    ? history.filter((channel) =>
        channel
          .replace(/^#/, "")
          .toLowerCase()
          .includes(query.trim().replace(/^#/, "").toLowerCase()),
      )
    : history;
  const items = canAddTyped ? [typed, ...matched] : matched;

  /**
   * multiple 이지만 하나만 남긴다.
   *
   * 이미 고른 걸 또 고르면 Base UI 가 값을 빼주므로 빈 배열이 온다. 그때는
   * 선택 해제로 본다. 새로 고르면 배열 끝에 붙으므로 마지막 것만 취한다.
   */
  const handleValueChange = (next: unknown) => {
    const list = Array.isArray(next) ? (next as string[]) : [];
    onChange(normalizeChannel(list[list.length - 1] ?? ""));
    // 입력값은 Base UI 가 스스로 비운다. 여기서 같이 건드리면 부모 리렌더와
    // 겹치면서 controlled 값과 DOM 이 어긋나, 그 뒤 타이핑이 반영되지 않는다.
  };

  return (
    <Combobox
      multiple
      autoHighlight
      open={open}
      onOpenChange={setOpen}
      // 걸러내기는 위에서 직접 한다. Base UI 내부 필터까지 겹치면 이미 고른
      // 채널이 목록에서 빠져(선택된 항목 제외) 아무것도 안 남는다.
      filter={null}
      items={items}
      value={selected}
      onValueChange={handleValueChange}
      onInputValueChange={setQuery}
    >
      <ComboboxChips ref={anchor} className={cn("w-full", className)}>
        <ComboboxValue>
          {(values: string[]) => (
            <React.Fragment>
              {values.map((channel) => (
                <ComboboxChip key={channel}>{channel}</ComboboxChip>
              ))}
              <ComboboxChipsInput
                placeholder={values.length > 0 ? "" : "채널명 입력 (예: #공지)"}
                aria-label="슬랙 채널"
                // 클릭뿐 아니라 포커스만 와도 목록을 연다. 키보드(Tab)로 온
                // 사용자가 저장된 채널을 못 보고 지나치지 않게 한다.
                onFocus={() => setOpen(true)}
              />
            </React.Fragment>
          )}
        </ComboboxValue>
      </ComboboxChips>

      {/*
        ComboboxEmpty 를 두지 않는다. 뭐라도 치면 항상 "추가" 항목이 생겨서
        (canAddTyped) 목록이 빌 일이 없고, 아무것도 안 쳤을 때는 Base UI 가
        빈 상태를 띄우지 않는다. 그래서 노드만 남아 빈 줄로 보였다.
      */}
      <ComboboxContent anchor={anchor}>
        <ComboboxList>
          {(channel: string) => (
            <ComboboxItem key={channel} value={channel}>
              <span className="flex-1">
                {canAddTyped && channel === typed ? `${channel} 추가` : channel}
              </span>
              {history.includes(channel) ? (
                <button
                  type="button"
                  aria-label={`${channel} 기록에서 삭제`}
                  className="rounded-sm px-1 text-xs text-muted-foreground opacity-70 hover:bg-accent hover:opacity-100"
                  onPointerDown={(event) => {
                    // 항목 선택으로 번지지 않게 막는다(선택이 먼저 일어나면 창이 닫힌다).
                    event.preventDefault();
                    event.stopPropagation();
                    onRemoveFromHistory(channel);
                  }}
                >
                  삭제
                </button>
              ) : null}
            </ComboboxItem>
          )}
        </ComboboxList>
      </ComboboxContent>
    </Combobox>
  );
}
