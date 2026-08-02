// 타임라인 아래에 붙는 층별 평면도(접이식).
//
// lms+ 에는 지도가 없어 공간의 물리적 위치를 알 수 없다. 페어룸 등이 실제로
// 어디인지 확인하라고 평면도를 붙인다. 카드를 누르고 있는 동안에만 확대해서
// 보여준다(확대 뷰는 별도 shadow root 마운트).

export interface RadarFloorMapsProps {
  /** 평면도가 있는 층 목록. */
  floors: number[];
  /** 층 -> data URI. 없으면 그 층은 건너뛴다. */
  getFloorMapDataUri: (floor: number) => string | null;

  open: boolean;
  onOpenChange: (open: boolean) => void;

  /** 카드를 누르는 동안 확대해서 보여준다. */
  onZoomStart: (floor: number, dataUri: string) => void;
  onZoomEnd: () => void;
}

export function RadarFloorMaps({
  floors,
  getFloorMapDataUri,
  open,
  onOpenChange,
  onZoomStart,
  onZoomEnd,
}: RadarFloorMapsProps) {
  // 스크롤 위치를 손으로 보존하지 않는다. React 가 스크롤러 엘리먼트를 유지하므로
  // 리렌더돼도 브라우저가 알아서 위치를 들고 있다(예전에는 매번 새로 만들어서
  // 직전 scrollLeft 를 읽어다 되돌려야 했다).
  const cards = floors
    .map((floor) => ({ floor, dataUri: getFloorMapDataUri(floor) }))
    .filter((card): card is { floor: number; dataUri: string } => Boolean(card.dataUri));

  if (cards.length === 0) {
    return null;
  }

  return (
    <section className={`zzk-map-calendar-floormap-section${open ? " open" : ""}`}>
      <button
        type="button"
        className="zzk-map-calendar-floormap-header"
        aria-expanded={open}
        onClick={() => onOpenChange(!open)}
      >
        <span className="zzk-map-calendar-floormap-caret" aria-hidden="true">
          {open ? "▾" : "▸"}
        </span>
        <span className="zzk-map-calendar-floormap-title">평면도</span>
      </button>

      <div className="zzk-map-calendar-floormap-scroller">
        {cards.map(({ floor, dataUri }) => (
          <FloorMapCard
            key={floor}
            floor={floor}
            dataUri={dataUri}
            onZoomStart={onZoomStart}
            onZoomEnd={onZoomEnd}
          />
        ))}
      </div>
    </section>
  );
}

function FloorMapCard({
  floor,
  dataUri,
  onZoomStart,
  onZoomEnd,
}: {
  floor: number;
  dataUri: string;
  onZoomStart: RadarFloorMapsProps["onZoomStart"];
  onZoomEnd: RadarFloorMapsProps["onZoomEnd"];
}) {
  const handlePointerDown = (event: React.PointerEvent<HTMLImageElement>) => {
    // 주 버튼(좌클릭)/터치만 처리한다.
    if (event.button !== 0) {
      return;
    }
    event.preventDefault();
    onZoomStart(floor, dataUri);

    // 이미지 밖에서 손을 떼도 닫혀야 하므로 window 에 건다.
    const release = () => {
      onZoomEnd();
      window.removeEventListener("pointerup", release);
      window.removeEventListener("pointercancel", release);
      window.removeEventListener("blur", release);
    };
    window.addEventListener("pointerup", release);
    window.addEventListener("pointercancel", release);
    window.addEventListener("blur", release);
  };

  return (
    <figure className="zzk-map-calendar-floormap-card">
      <img
        className="zzk-map-calendar-floormap-image"
        src={dataUri}
        alt={`${floor}층 평면도`}
        loading="lazy"
        draggable={false}
        onPointerDown={handlePointerDown}
      />
      <figcaption className="zzk-map-calendar-floormap-caption">{floor}F</figcaption>
    </figure>
  );
}
