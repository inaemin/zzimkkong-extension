import type * as React from "react";
import { ChevronLeftIcon, ChevronRightIcon } from "lucide-react";

import { addDaysToDateString, formatDateSelectorText } from "@/utils/date-time";
import { Button } from "@/ui/components/ui/button";
import { DatePicker } from "@/ui/components/date-picker";
import { RadarLegend } from "@/ui/components/radar-legend";
import { RadarQuota } from "@/ui/components/radar-quota";
import { Label } from "@/ui/components/ui/label";
import { Switch } from "@/ui/components/ui/switch";
import { Tabs, TabsList, TabsTrigger } from "@/ui/components/ui/tabs";
import {
  MAP_CALENDAR_OVERLAY_TAB_MEETING_ID,
  MAP_CALENDAR_OVERLAY_TAB_PAIR_ID,
  MAP_CALENDAR_SPACE_TAB_MEETING,
  MAP_CALENDAR_SPACE_TAB_PAIR,
  type SpaceTab,
} from "@/constants/runtime";
import type { ReservationQuota } from "@/services/lms-data/types";

// 레이더 헤더의 컨트롤 줄.
//
// 날짜 선택은 손으로 만든 팝오버(달력 그리기 + 위치 계산 + 바깥 클릭 감지)를
// 쓰고 있었는데, shadcn DatePicker 로 대체한다. Base UI Popover 가 위치와
// 바깥 클릭을 처리하므로 뷰포트 밖으로 나가지 않게 좌표를 손으로 보정하던 코드가
// 통째로 사라진다.
//
// 날짜 계산(최소일·오늘·하루 이동)은 프레임워크 무관 함수라 그대로 주입받는다.

export interface RadarHeaderProps {
  /** 지금 보고 있는 공간 유형(회의실/페어룸). */
  spaceTab: SpaceTab;
  onSpaceTabChange: (tab: SpaceTab) => void;

  /** 현재 선택된 날짜("YYYY-MM-DD"). */
  date: string;
  /** 이 날짜보다 이전은 고를 수 없다. */
  minDate: string;
  todayDate: string;

  onDateChange: (nextDate: string) => void;
  onShiftDate: (dayOffset: number) => void;

  collapsed: boolean;
  onToggleCollapsed: () => void;

  alwaysOpen: boolean;
  onAlwaysOpenChange: (nextAlwaysOpen: boolean) => void;

  /** 예약 한도. null 이거나 무제한이면 표시하지 않는다. */
  quota?: ReservationQuota | null;
  /** 지금 고른 구간의 길이(분). 예약 후 잔여를 미리 보여주는 데 쓴다. */
  selectedMinutes?: number | null;

  /** 방 태그 범례. 아직 명령형이라 붙일 자리만 내준다. */
}

export function RadarHeader({
  spaceTab,
  onSpaceTabChange,
  date,
  minDate,
  todayDate,
  onDateChange,
  onShiftDate,
  collapsed,
  onToggleCollapsed,
  alwaysOpen,
  onAlwaysOpenChange,
  quota = null,
  selectedMinutes = null,
}: RadarHeaderProps) {
  // 최소일 이하로는 못 내려간다. 지난 날짜는 예약할 수 없기 때문이다.
  const canGoPrev = !minDate || date > minDate;
  const isToday = date === todayDate;

  const prevDate = addDaysToDateString(date, -1);
  const nextDate = addDaysToDateString(date, 1);

  return (
    <>
      <div className="zzk-map-calendar-title-controls">
        <div className="zzk-map-calendar-controls">
          {/*
            zzk-map-calendar-date-row 는 쓰지 않는다. 그 CSS 가 grid +
            align-items:stretch + 1fr 컬럼이라 버튼이 늘어나 정방형이 깨진다.
          */}
          <div className="flex items-center gap-1">
            {/* 공간 유형 전환. 날짜 컨트롤 왼쪽에 둔다. */}
            <Tabs
              className="mr-1"
              value={spaceTab}
              onValueChange={(next) => onSpaceTabChange(next as SpaceTab)}
            >
              <TabsList className="h-7" aria-label="공간 유형 선택">
                <TabsTrigger
                  id={MAP_CALENDAR_OVERLAY_TAB_MEETING_ID}
                  className="h-6 text-xs"
                  value={MAP_CALENDAR_SPACE_TAB_MEETING}
                >
                  회의실
                </TabsTrigger>
                <TabsTrigger
                  id={MAP_CALENDAR_OVERLAY_TAB_PAIR_ID}
                  className="h-6 text-xs"
                  value={MAP_CALENDAR_SPACE_TAB_PAIR}
                >
                  페어룸
                </TabsTrigger>
              </TabsList>
            </Tabs>

            <Button
              type="button"
              variant="outline"
              size="icon"
              className="size-7"
              disabled={!canGoPrev}
              title={prevDate ? `이전일 (${prevDate})` : "이전일"}
              aria-label={prevDate ? `이전일 (${prevDate})` : "이전일"}
              onClick={() => onShiftDate(-1)}
            >
              <ChevronLeftIcon className="size-4" />
            </Button>

            {/* 날짜는 보여야 한다. 아이콘만 두면 지금 며칠인지 알 수 없다. */}
            <DatePicker
              value={date}
              onChange={onDateChange}
              min={minDate || undefined}
              aria-label="지도 날짜 선택"
              className="h-7 gap-1 px-2 text-xs"
            />

            <Button
              type="button"
              variant="outline"
              size="icon"
              className="size-7"
              title={nextDate ? `다음일 (${nextDate})` : "다음일"}
              aria-label={nextDate ? `다음일 (${nextDate})` : "다음일"}
              onClick={() => onShiftDate(1)}
            >
              <ChevronRightIcon className="size-4" />
            </Button>

            {/* 글자 버튼은 정방형으로 만들면 글씨가 눌린다. 높이만 맞춘다. */}
            <Button
              type="button"
              variant="secondary"
              size="sm"
              className="h-7 px-2 text-xs"
              disabled={isToday}
              title={`오늘 (${todayDate})`}
              aria-label={`오늘 (${todayDate})`}
              onClick={() => onDateChange(todayDate)}
            >
              오늘
            </Button>

            {/* 스크린리더용. 날짜가 바뀌면 읽어준다. */}
            <span className="sr-only" aria-live="polite">
              {formatDateSelectorText(date)}
            </span>
          </div>
        </div>
      </div>

      <div className="zzk-map-calendar-header-right">
        <RadarQuota quota={quota} selectedMinutes={selectedMinutes} />

        {/* 폼 제출용 선택이 아니라 즉시 저장되는 설정이라 Switch 를 쓴다. */}
        <div className="zzk-map-calendar-always-open flex items-center gap-1.5">
          <Switch
            id="zzk-radar-always-open"
            checked={alwaysOpen}
            aria-label="지도 타임블록 항상 열기"
            onCheckedChange={onAlwaysOpenChange}
          />
          <Label htmlFor="zzk-radar-always-open" className="text-xs font-normal">
            항상 열기
          </Label>
        </div>

        <RadarLegend />

        <Button
          type="button"
          variant="outline"
          size="sm"
          className="h-7 px-2 text-xs"
          aria-label="지도 타임블록 접기/펼치기"
          onClick={onToggleCollapsed}
        >
          {collapsed ? "열기" : "접기"}
        </Button>
      </div>
    </>
  );
}
