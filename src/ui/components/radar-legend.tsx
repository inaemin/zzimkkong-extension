import { InfoIcon } from "lucide-react";

import { Button } from "@/ui/components/ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "@/ui/components/ui/popover";

// 타임블록 색 범례.
//
// 헤더에 5개를 나란히 두면 자리가 부족해서 정보 버튼 뒤에 넣는다. 범례는 처음
// 볼 때만 필요하고 그 뒤에는 색만 봐도 아는 정보라, 항상 펼쳐둘 이유가 적다.
//
// 색은 CSS 변수(--zzk-slot-*)를 그대로 쓴다. 슬롯과 같은 값을 참조해야 한쪽만
// 바뀌어 범례가 조용히 어긋나는 일이 없다.

interface LegendItem {
  /** 슬롯 색을 담은 CSS 변수 이름. */
  colorVariable: string;
  label: string;
  description: string;
}

const LEGEND_ITEMS: LegendItem[] = [
  {
    colorVariable: "--zzk-slot-free",
    label: "비어 있음",
    description: "눌러서 예약할 수 있어요.",
  },
  {
    colorVariable: "--zzk-slot-busy",
    label: "예약 있음",
    description: "이미 예약된 시간이에요.",
  },
  {
    colorVariable: "--zzk-slot-selected",
    label: "선택한 시간",
    description: "지금 예약 폼에 들어간 시간이에요.",
  },
  {
    colorVariable: "--zzk-slot-past",
    label: "지난 시간",
    description: "이미 지나서 고를 수 없어요.",
  },
  {
    colorVariable: "--zzk-slot-past-reserved",
    label: "지난 예약",
    description: "지난 시간이고, 그때 예약이 있었어요.",
  },
];

export interface RadarLegendProps {
  /** 팝오버를 띄울 컨테이너(오버레이). body 로 나가면 클릭이 막힌다. */
  container?: HTMLElement | null;
}

export function RadarLegend({ container }: RadarLegendProps) {
  return (
    <Popover>
      <PopoverTrigger
        render={
          <Button
            type="button"
            variant="ghost"
            size="icon"
            className="size-7"
            aria-label="타임블록 색 설명"
            title="타임블록 색 설명"
          />
        }
      >
        <InfoIcon className="size-4" />
      </PopoverTrigger>
      <PopoverContent
        className="w-64"
        align="end"
        sideOffset={8}
        container={container ?? undefined}
      >
        <p className="mb-2 text-xs font-medium">타임블록 색</p>
        <ul className="flex flex-col gap-2">
          {LEGEND_ITEMS.map((item) => (
            <li key={item.colorVariable} className="flex items-start gap-2">
              <span
                aria-hidden="true"
                className="mt-0.5 size-3 shrink-0 rounded-sm border border-foreground/25"
                style={{ background: `var(${item.colorVariable})` }}
              />
              <span className="flex flex-col">
                <span className="text-xs font-medium">{item.label}</span>
                <span className="text-xs text-muted-foreground">{item.description}</span>
              </span>
            </li>
          ))}
        </ul>
      </PopoverContent>
    </Popover>
  );
}
