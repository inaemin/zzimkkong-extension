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
              "justify-start text-left font-normal data-[empty=true]:text-muted-foreground",
              className,
            )}
          />
        }
      >
        <CalendarIcon />
        {selected ? label : <span>날짜 선택</span>}
      </PopoverTrigger>
      <PopoverContent className="w-auto p-0" align="start" container={container ?? undefined}>
        <Calendar
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
