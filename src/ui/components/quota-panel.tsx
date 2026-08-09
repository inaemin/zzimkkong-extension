import {
  buildQuotaBars,
  formatQuotaMinutes,
  previewRemainingMinutes,
  type QuotaBar,
} from "@/features/radar/quota";
import type { ReservationQuota } from "@/services/lms-data/types";
import { Progress, ProgressLabel, ProgressValue } from "@/ui/components/ui/progress";

// 호스트 페이지의 "남은 시간" 요약 블록을 대신 그린다.
//
// 호스트도 같은 숫자를 보여주지만 텍스트뿐이라, 얼마나 남았는지가 한눈에 들어오지
// 않는다. 같은 자리에 같은 모양으로 두되 막대를 얹는다.
//
// 바깥 껍데기(테두리·배경·간격)는 호스트 마크업을 그대로 따른다. 이 블록만
// 다르게 생기면 페이지에서 겉돈다.

export interface QuotaPanelProps {
  quota: ReservationQuota | null;
  /**
   * 지금 고른 구간의 길이(분). 있으면 예약 후 잔여를 함께 보여준다.
   *
   * 호스트가 못 하는 일이고, 이 자리를 대신 쓰는 이유이기도 하다.
   */
  selectedMinutes?: number | null;
}

/** 막대 색. 잔여가 부족하면 경고색이 이긴다. */
function trackClassName(bar: QuotaBar): string {
  if (bar.low) {
    return "**:data-[slot=progress-track]:h-1.5 **:data-[slot=progress-indicator]:bg-red-500";
  }
  // 두 항목을 나란히 두므로 색을 갈라 둔다. 라벨을 읽지 않고도 구분된다.
  // 이번 달은 청록, 오늘은 기본색(거의 검정).
  return bar.label === "오늘"
    ? "**:data-[slot=progress-track]:h-1.5 **:data-[slot=progress-indicator]:bg-primary"
    : "**:data-[slot=progress-track]:h-1.5 **:data-[slot=progress-indicator]:bg-teal-500";
}

/** 호스트가 쓰던 문구. 그대로 따라 쓴다. */
function panelLabel(bar: QuotaBar): string {
  return bar.label === "오늘" ? "이 날 남은 시간" : "이번 달 남은 시간";
}

function QuotaItem({ bar, selectedMinutes }: { bar: QuotaBar; selectedMinutes: number }) {
  const preview = previewRemainingMinutes(bar, selectedMinutes);
  const hasPreview = selectedMinutes > 0 && preview !== bar.remainingMinutes;

  const limitText = formatQuotaMinutes(bar.limitMinutes);
  const remainingText = formatQuotaMinutes(bar.remainingMinutes);

  // 구간을 고르면 잔여 자리에 "예약 후" 값을 앉히고, 줄어드는 양을 괄호로 덧붙인다.
  //
  // 화살표로 두 값을 나란히 두면(17시간 30분 → 16시간 30분) 줄이 길어져 두 줄로
  // 갈라지고, 어느 쪽이 지금 값인지도 헷갈린다. 예약하려는 참이므로 "예약 후"가
  // 주인공이고, 지금 값은 변화량으로 되짚을 수 있다.
  const shownRemaining = hasPreview ? formatQuotaMinutes(preview) : remainingText;
  const deltaText = hasPreview ? `-${formatQuotaMinutes(bar.remainingMinutes - preview)}` : "";

  // 막대도 예약 후 기준으로 찬다. 한도를 넘어서도 100% 를 넘지 않는다.
  const previewRatio = hasPreview
    ? Math.min(1, (bar.limitMinutes - preview) / bar.limitMinutes)
    : bar.ratio;

  // 툴팁은 두지 않는다.
  //
  // 처음에는 자세한 숫자를 툴팁으로 미뤘는데, 그 뒤 값 줄이 잔여·한도·변화량을
  // 모두 보여주게 되면서 툴팁이 같은 얘기를 순서만 바꿔 반복하게 됐다.
  // (게다가 "남은 시간 2시간 30분" 처럼 라벨은 잔여인데 숫자는 사용량이라
  //  서로 어긋나 있었다.)
  return (
    <div className="w-full" data-testid="quota-item">
      {/*
        shadcn ProgressWithLabel 형태 그대로다. 라벨은 왼쪽, 값은 오른쪽
        (ProgressValue 기본 ml-auto), 막대는 그 아래.

        Track·Indicator 는 직접 넣지 않는다 — Progress 가 children 뒤에 자기 것을
        항상 붙이므로, 또 넣으면 막대가 두 개 그려진다.

        막대는 "예약 후" 기준으로 찬다. 숫자만 앞서가고 막대는 지금 상태에 머물면
        둘이 다른 말을 하게 된다.
      */}
      <Progress value={Math.round(previewRatio * 100)} className={`w-full ${trackClassName(bar)}`}>
        <ProgressLabel>{panelLabel(bar)}</ProgressLabel>

        {/*
            기본값은 백분율이라 render 로 "잔여 / 한도"를 넣는다.
            잔여가 부족하면 숫자도 함께 경고색으로 간다 — 막대만 빨갛고 숫자는
            검으면 무엇이 문제인지가 갈라져 보인다.
          */}
        <ProgressValue className={bar.low ? "text-red-600" : undefined} render={<span />}>
          {() => (
            // 사이 간격은 gap 으로 준다. 조각마다 margin 을 붙이면 어느 쪽이
            // 간격을 소유하는지가 흐려지고, 조각이 빠졌을 때 간격만 남는다.
            <span className="inline-flex items-baseline gap-1">
              {/*
                  구간을 고르면 이 자리가 "예약 후" 값으로 바뀐다. 색으로 지금
                  값이 아님을 알린다.
                */}
              <span
                className={
                  hasPreview ? "font-semibold text-sky-600" : "font-semibold text-foreground"
                }
              >
                {shownRemaining}
              </span>
              <span>/ {limitText}</span>
              {/* 얼마나 줄어드는지. 이걸로 지금 값을 되짚을 수 있다. */}
              {hasPreview ? <span className="text-sky-600">({deltaText})</span> : null}
            </span>
          )}
        </ProgressValue>
      </Progress>
    </div>
  );
}

export function QuotaPanel({ quota, selectedMinutes = null }: QuotaPanelProps) {
  const bars = buildQuotaBars(quota);
  if (bars.length === 0) {
    return null;
  }

  const normalizedSelected = Number.isFinite(selectedMinutes) ? (selectedMinutes ?? 0) : 0;

  // 호스트는 월간을 먼저 보여준다. 순서를 맞춘다.
  const ordered = [...bars].sort((left) => (left.label === "오늘" ? 1 : -1));

  return (
    <div
      className="flex gap-6 rounded-lg border border-border bg-muted/30 px-4 py-2 text-sm"
      data-testid="quota-panel"
      aria-live="polite"
    >
      {/*
          항목마다 자기 내용이 한 줄로 들어가는 만큼만 차지한다.

          폭을 비율로 나누면(1:1 이든 2:1 이든) 값이 길어질 때 좁은 쪽부터 줄이
          갈라진다. 여기서는 값 길이가 상황에 따라 바뀌므로(예약 후 잔여가 붙고
          빠진다) 내용이 폭을 정하게 두는 편이 안전하다.

          막대는 항목 폭을 꽉 채우므로 "얼마나 찼는지"는 각자의 기준으로 읽힌다.
          두 막대의 길이가 달라지지만, 애초에 한도가 다르므로(이번 달 20시간 /
          이 날 3시간) 같은 길이로 맞추는 게 오히려 오해를 만든다.
        */}
      {ordered.map((bar) => (
        <div key={bar.label} className="min-w-fit">
          <QuotaItem bar={bar} selectedMinutes={normalizedSelected} />
        </div>
      ))}
    </div>
  );
}
