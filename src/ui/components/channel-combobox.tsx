import * as React from "react";
import { CheckIcon, XIcon } from "lucide-react";

import { Badge } from "@/ui/components/ui/badge";
import { Button } from "@/ui/components/ui/button";
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/ui/components/ui/command";
import { Popover, PopoverContent, PopoverTrigger } from "@/ui/components/ui/popover";
import { cn } from "@/ui/lib/utils";

// Slack 모달의 채널 선택기. 고른 채널은 chip(Badge)으로 보여주고,
// 목록은 command(combobox)로 고른다. 과거에 쓴 채널은 목록에서 지울 수 있다.

export interface ChannelComboboxProps {
  /** 선택된 채널(`#채널명`). 없으면 빈 문자열. */
  value: string;
  onChange: (nextValue: string) => void;
  /** 최근 사용한 채널 목록. */
  history: string[];
  onRemoveFromHistory: (channel: string) => void;
  className?: string;
}

export function ChannelCombobox({
  value,
  onChange,
  history,
  onRemoveFromHistory,
  className,
}: ChannelComboboxProps) {
  const [open, setOpen] = React.useState(false);
  const [query, setQuery] = React.useState("");

  const trimmedQuery = query.trim();
  // 입력한 값이 목록에 없으면 "새로 추가" 항목을 띄운다.
  const canAddTyped =
    trimmedQuery !== "" &&
    !history.some((channel) => channel.replace(/^#/, "") === trimmedQuery.replace(/^#/, ""));

  const commitChannel = (channel: string) => {
    const normalized = channel.trim().replace(/^#*/, "");
    onChange(normalized ? `#${normalized}` : "");
    setQuery("");
    setOpen(false);
  };

  return (
    <div className={cn("flex flex-wrap items-center gap-2", className)}>
      {value ? (
        <Badge variant="secondary" className="gap-1 pr-1">
          {value}
          <Button
            type="button"
            variant="ghost"
            size="icon"
            aria-label={`${value} 선택 해제`}
            // Badge 안에 들어가므로 Button 기본 크기(size-9)를 chip 높이에 맞춘다.
            className="size-4 rounded-sm opacity-70 hover:opacity-100"
            onClick={() => onChange("")}
          >
            <XIcon className="size-3" />
          </Button>
        </Badge>
      ) : null}

      <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger
          render={<Button type="button" variant="outline" size="sm" aria-label="슬랙 채널 선택" />}
        >
          {value ? "채널 변경" : "채널 선택"}
        </PopoverTrigger>
        <PopoverContent className="w-64 p-0" align="start">
          <Command shouldFilter>
            <CommandInput
              placeholder="채널명 입력"
              value={query}
              onValueChange={setQuery}
              onKeyDown={(event) => {
                if (event.key === "Enter" && canAddTyped) {
                  event.preventDefault();
                  commitChannel(trimmedQuery);
                }
              }}
            />
            <CommandList>
              <CommandEmpty>일치하는 채널이 없습니다.</CommandEmpty>
              {canAddTyped ? (
                <CommandGroup>
                  <CommandItem value={trimmedQuery} onSelect={() => commitChannel(trimmedQuery)}>
                    {`#${trimmedQuery.replace(/^#/, "")} 추가`}
                  </CommandItem>
                </CommandGroup>
              ) : null}
              {history.length > 0 ? (
                <CommandGroup heading="최근 사용">
                  {history.map((channel) => (
                    <CommandItem
                      key={channel}
                      value={channel}
                      onSelect={() => commitChannel(channel)}
                      className="group"
                    >
                      <CheckIcon
                        className={cn("size-4", value === channel ? "opacity-100" : "opacity-0")}
                      />
                      <span className="flex-1">{channel}</span>
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon"
                        aria-label={`${channel} 기록에서 삭제`}
                        // 목록 한 줄 높이를 넘기지 않게 Button 기본 크기를 줄인다.
                        className="size-5 opacity-0 group-hover:opacity-70 hover:opacity-100"
                        onClick={(event) => {
                          // 항목 선택으로 번지지 않게 막는다.
                          event.stopPropagation();
                          onRemoveFromHistory(channel);
                        }}
                      >
                        <XIcon className="size-3" />
                      </Button>
                    </CommandItem>
                  ))}
                </CommandGroup>
              ) : null}
            </CommandList>
          </Command>
        </PopoverContent>
      </Popover>
    </div>
  );
}
