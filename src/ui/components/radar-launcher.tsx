import { Toggle } from "@/ui/components/ui/toggle";

// 화면 오른쪽 아래 플로팅 런처.
//
// lms+ 에는 호스트 폼에 인라인으로 붙일 자리가 없어 40x40 원형 버튼으로 띄운다.
// 라벨이 바뀌지 않고 열린 상태가 색으로 유지되므로 Toggle 이 맞다(헤더의 접기
// 버튼은 라벨이 접기↔열기로 바뀌어 Button 이 맞았다).
//
// 브랜드 색(#FF8833)은 Tailwind 토큰에 없어 그대로 쓴다. shadow root 안이라
// 페이지로 새지 않는다.

const RADAR_ICON_PATHS = [
  "M19.0701 4.9298C17.513 3.37102 15.4847 2.37012 13.3002 2.0826C11.1158 1.79508 8.89754 2.23703 6.99011 3.3398M4.00011 5.9998H4.01011M2.29011 9.6198C1.9152 11.1469 1.90569 12.7408 2.26233 14.2722C2.61898 15.8037 3.33174 17.2294 4.34274 18.4337C5.35374 19.638 6.63449 20.5869 8.08101 21.2034C9.52752 21.8199 11.099 22.0866 12.6679 21.9819C14.2369 21.8771 15.759 21.4038 17.1107 20.6005C18.4624 19.7972 19.6056 18.6864 20.4475 17.3584C21.2894 16.0303 21.8063 14.5225 21.9562 12.9572C22.1061 11.392 21.8847 9.81347 21.3101 8.3498",
  "M16.24 7.75992C15.6646 7.18108 14.977 6.72575 14.2195 6.42179C13.462 6.11783 12.6504 5.97163 11.8344 5.99213C11.0184 6.01263 10.2152 6.1994 9.47391 6.54103C8.7326 6.88265 8.0688 7.37193 7.5231 7.97894C6.97741 8.58594 6.56131 9.29791 6.30025 10.0713C6.0392 10.8446 5.93868 11.6631 6.00486 12.4767C6.07103 13.2902 6.30251 14.0817 6.68512 14.8027C7.06772 15.5237 7.59342 16.1591 8.23004 16.6699M12 17.9999H12.01M17.99 11.6599C18.0444 12.6113 17.8715 13.5619 17.4854 14.4332C17.0993 15.3044 16.5113 16.0711 15.77 16.6699",
  "M12 14C13.1046 14 14 13.1046 14 12C14 10.8954 13.1046 10 12 10C10.8954 10 10 10.8954 10 12C10 13.1046 10.8954 14 12 14Z",
];

export interface RadarLauncherProps {
  /** 레이더가 열려 있는지. 눌린 상태로 표시된다. */
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /**
   * Slack 모달을 띄우는 개발용 버튼. 개발 빌드에서만 넘어온다.
   *
   * 예전에는 호스트의 예약 탭 바에 끼워 넣었는데, 그 바가 없는 화면에서는
   * 버튼이 아예 안 보였다. 런처 옆이면 레이더가 뜨는 곳이면 항상 보인다.
   */
  onOpenSlackModal?: (() => void) | null;
}

export function RadarLauncher({ open, onOpenChange, onOpenSlackModal }: RadarLauncherProps) {
  const label = open ? "레이더 닫기" : "레이더 열기";

  return (
    <div className="flex items-center gap-2">
      {onOpenSlackModal ? (
        <button
          type="button"
          onClick={onOpenSlackModal}
          aria-label="Slack 모달 테스트 (개발 전용)"
          title="Slack 모달 테스트 (개발 전용)"
          className={[
            "h-10 rounded-full border px-3 text-xs font-medium whitespace-nowrap",
            // 개발 전용이라 브랜드 색을 쓰지 않는다. 실서비스 버튼과 헷갈리면 안 된다.
            "border-dashed border-slate-400 bg-white/95 text-slate-600",
            "shadow-[0_0_0_1px_rgba(100,116,139,0.16)]",
            "hover:bg-slate-100 hover:text-slate-900",
          ].join(" ")}
        >
          Slack 모달
        </button>
      ) : null}
      {renderRadarToggle(label, open, onOpenChange)}
    </div>
  );
}

function renderRadarToggle(label: string, open: boolean, onOpenChange: (open: boolean) => void) {
  return (
    <Toggle
      pressed={open}
      onPressedChange={onOpenChange}
      aria-label={label}
      title={label}
      // 브랜드 색은 토큰에 없어 임의 값으로 준다. 열림/닫힘을 색으로 구분한다.
      //
      // 눌림 상태 배경은 aria-pressed: 로 줘야 한다. Toggle 기본 스타일에
      // aria-pressed:bg-muted 가 들어 있어, 평범한 bg-* 로는 그걸 못 이긴다.
      className={[
        "size-10 rounded-full border p-0 transition-all",
        "aria-pressed:border-[#FF8833] aria-pressed:bg-[#FF8833] aria-pressed:text-white",
        "aria-pressed:-translate-y-px",
        "aria-pressed:shadow-[0_0_0_1px_rgba(255,136,51,0.18),0_4px_12px_rgba(255,136,51,0.3)]",
        "aria-pressed:hover:bg-[#FF8833]",
        // 닫힘 상태. hover 도 명시해야 한다 — Toggle 기본에 hover:bg-muted /
        // hover:text-foreground 가 있어 그냥 두면 회색 배경에 검은 아이콘이 된다.
        "border-[rgba(255,136,51,0.56)] bg-white/95 text-[#FF8833]",
        "shadow-[0_0_0_1px_rgba(255,136,51,0.16)]",
        "hover:bg-[#FFF4EC] hover:text-[#FF8833]",
      ].join(" ")}
    >
      <svg
        viewBox="0 0 24 24"
        width="16"
        height="16"
        fill="none"
        aria-hidden="true"
        focusable="false"
        className="block shrink-0"
      >
        {RADAR_ICON_PATHS.map((d) => (
          <path
            key={d.slice(0, 24)}
            d={d}
            stroke="currentColor"
            strokeWidth="1.8"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        ))}
      </svg>
    </Toggle>
  );
}
