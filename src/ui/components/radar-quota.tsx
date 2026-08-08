import {
  buildQuotaBars,
  formatQuotaMinutes,
  previewRemainingMinutes,
  type QuotaBar,
} from "@/features/radar/quota";
import type { ReservationQuota } from "@/services/lms-data/types";

// 예약 한도 표시.
//
// 원래 예약 사이트에 있는 정보지만, 레이더를 보는 중에는 페이지를 오가야
// 확인할 수 있다. 빈 시간을 고르는 바로 그 자리에서 보이는 편이 낫다.
//
// 헤더는 이미 날짜·탭·범례·접기로 붐빈다. 그래서 막대는 아주 납작하게 그리고,
// 자세한 숫자는 title 로 미룬다.

export interface RadarQuotaProps {
  quota: ReservationQuota | null;
  /**
   * 지금 고른 구간의 길이(분). 있으면 예약 후 잔여를 미리 보여준다.
   *
   * 이게 이 UI 의 핵심이다 — "이번 달 몇 시간 남았나"보다 "지금 이걸 예약하면
   * 얼마 남나"가 실제로 궁금한 것이다.
   */
  selectedMinutes?: number | null;
}

function QuotaRow({ bar, selectedMinutes }: { bar: QuotaBar; selectedMinutes: number }) {
  const preview = previewRemainingMinutes(bar, selectedMinutes);
  const hasPreview = selectedMinutes > 0 && preview !== bar.remainingMinutes;

  const usedText = formatQuotaMinutes(bar.usedMinutes);
  const limitText = formatQuotaMinutes(bar.limitMinutes);
  const remainingText = formatQuotaMinutes(bar.remainingMinutes);

  const title = hasPreview
    ? `${bar.label} ${usedText} / ${limitText} 사용. 이 시간을 예약하면 잔여 ${remainingText} → ${formatQuotaMinutes(preview)}`
    : `${bar.label} ${usedText} / ${limitText} 사용. 잔여 ${remainingText}`;

  return (
    <div className="flex items-center gap-1.5" title={title}>
      <span className="shrink-0 text-[11px] text-muted-foreground">{bar.label}</span>

      <span
        aria-hidden="true"
        className="h-1.5 w-10 shrink-0 overflow-hidden rounded-full bg-foreground/10"
      >
        <span
          className={
            bar.low
              ? "block h-full rounded-full bg-red-500"
              : "block h-full rounded-full bg-primary"
          }
          style={{ width: `${Math.round(bar.ratio * 100)}%` }}
        />
      </span>

      <span className={bar.low ? "text-[11px] text-red-500" : "text-[11px] text-muted-foreground"}>
        {remainingText}
        {hasPreview ? ` → ${formatQuotaMinutes(preview)}` : ""}
      </span>
    </div>
  );
}

export function RadarQuota({ quota, selectedMinutes = null }: RadarQuotaProps) {
  const bars = buildQuotaBars(quota);

  // 무제한이거나 한도를 모르면 아무것도 그리지 않는다. 빈 자리를 남기지 않는다.
  if (bars.length === 0) {
    return null;
  }

  const normalizedSelected = Number.isFinite(selectedMinutes) ? (selectedMinutes ?? 0) : 0;

  return (
    <div
      className="flex items-center gap-3"
      data-testid="radar-quota"
      // 값이 바뀌면 읽어준다. 예약 뒤 잔여가 줄어드는 걸 알 수 있어야 한다.
      aria-live="polite"
    >
      {bars.map((bar) => (
        <QuotaRow key={bar.label} bar={bar} selectedMinutes={normalizedSelected} />
      ))}
    </div>
  );
}
