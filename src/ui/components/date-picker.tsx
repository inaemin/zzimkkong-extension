import * as React from "react";
import { CalendarIcon } from "lucide-react";

import { Button } from "@/ui/components/ui/button";
import { Calendar } from "@/ui/components/ui/calendar";
import { Popover, PopoverContent, PopoverTrigger } from "@/ui/components/ui/popover";
import { cn } from "@/ui/lib/utils";

// shadcn 에는 DatePicker 루트 컴포넌트가 없다. Popover + Calendar 조합이 공식 방식이라
// 프로젝트 컴포넌트로 한 번만 만들어 두고 재사용한다.

export interface DatePickerProps {
  /** "YYYY-MM-DD". 레이더/예약 폼이 이 형식을 쓴다. */
  value: string;
  onChange: (nextValue: string) => void;
  /** 이 날짜보다 이전은 고를 수 없다("YYYY-MM-DD"). */
  min?: string;
  disabled?: boolean;
  className?: string;
  "aria-label"?: string;
  /**
   * 달력을 렌더할 컨테이너. 기본값(document.body)이면 트리거를 감싼 요소가
   * "팝오버 바깥"으로 취급돼 열려 있는 동안 클릭이 막힌다. 높은 z-index 안에
   * 들어있는 트리거라면 그 컨테이너를 넘겨야 한다.
   */
  container?: HTMLElement | null;
}

function parseDateString(value: string): Date | undefined {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    return undefined;
  }
  const [year, month, day] = value.split("-").map(Number);
  const parsed = new Date(year, month - 1, day);
  return Number.isNaN(parsed.getTime()) ? undefined : parsed;
}

function formatDateString(date: Date): string {
  const year = String(date.getFullYear()).padStart(4, "0");
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

const WEEKDAY_LABELS = ["일", "월", "화", "수", "목", "금", "토"];

function formatDisplayLabel(date: Date): string {
  const month = date.getMonth() + 1;
  const day = date.getDate();
  return `${month}월 ${day}일 (${WEEKDAY_LABELS[date.getDay()]})`;
}

export function DatePicker({
  value,
  onChange,
  min,
  disabled,
  className,
  "aria-label": ariaLabel,
  container,
}: DatePickerProps) {
  const [open, setOpen] = React.useState(false);
  const selected = parseDateString(value);
  const minDate = min ? parseDateString(min) : undefined;
  const label = selected ? formatDisplayLabel(selected) : "날짜 선택";

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger
        render={
          <Button
            type="button"
            variant="outline"
            disabled={disabled}
            aria-label={ariaLabel ?? label}
            title={label}
            data-empty={!selected}
            className={cn(
              // 너비를 고정한다. 라벨이 "1월 1일 (수)" ~ "10월 28일 (월)" 로
              // 길이가 달라서, 자동 너비면 날짜를 옮길 때마다 버튼 폭이 바뀌어
              // 옆 컨트롤이 밀린다.
              //
              // 136px 은 가장 긴 라벨 기준 실측값이다
              // (글자 96 + 아이콘 16 + 간격 4 + 좌우 패딩 16 = 132, 여유 4).
              "w-[136px] justify-start text-left font-normal data-[empty=true]:text-muted-foreground",
              className,
            )}
          />
        }
      >
        <CalendarIcon />
        {selected ? label : <span>날짜 선택</span>}
      </PopoverTrigger>
      {/* 레이더 헤더 바로 아래에 뜨므로 조금 띄워야 컨트롤과 붙어 보이지 않는다. */}
      <PopoverContent
        className="w-auto p-0"
        align="start"
        sideOffset={8}
        container={container ?? undefined}
      >
        {/*
          bg-transparent 를 직접 준다. Calendar 에는
          in-data-[slot=popover-content]:bg-transparent 가 붙어 있지만, 그 규칙은
          :where(...) 로 감싸져 있어 .bg-background 와 명시도가 같다. 즉 승패가
          CSS 안의 순서로만 갈려서, 페이지에 따로 주입하는 지금 구조에서는
          달력 배경이 남아 팝오버 그림자를 덮을 수 있다.
        */}
        <Calendar
          className="bg-transparent"
          mode="single"
          selected={selected}
          defaultMonth={selected}
          disabled={minDate ? { before: minDate } : undefined}
          onSelect={(nextDate) => {
            if (!nextDate) {
              return;
            }
            onChange(formatDateString(nextDate));
            setOpen(false);
          }}
        />
      </PopoverContent>
    </Popover>
  );
}
