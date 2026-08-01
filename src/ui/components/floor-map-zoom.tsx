// 평면도 확대 뷰. 카드를 누르고 있는 동안에만 화면 중앙에 크게 띄운다.
//
// Dialog 를 쓰지 않는다. 이건 "누르는 동안만 보이는" 겹쳐보기라 포커스를 뺏거나
// 스크롤을 잠그면 안 되고(손을 떼면 바로 사라진다), 닫기 버튼도 없다.
// Dialog 의 모달 동작(focus trap·scroll lock·Escape)이 전부 방해가 된다.

export interface FloorMapZoomProps {
  /** 확대할 층. null 이면 닫힌 상태. */
  floor: number | null;
  dataUri: string | null;
}

export function FloorMapZoom({ floor, dataUri }: FloorMapZoomProps) {
  const visible = floor !== null && Boolean(dataUri);

  return (
    <div
      // 테스트와 기존 CSS 가 이 id/클래스를 본다.
      id="zzk-floormap-zoom"
      data-visible={visible ? "true" : "false"}
      aria-hidden={visible ? "false" : "true"}
      // 누르는 동안 보기용이라 클릭을 가로채지 않는다.
      className={`fixed inset-0 z-[2147483646] flex-col items-center justify-center gap-3 bg-slate-900/70 p-8 ${
        visible ? "flex" : "hidden"
      }`}
      style={{ pointerEvents: "none" }}
    >
      {visible ? (
        <>
          <img
            className="zzk-floormap-zoom-image max-h-[82vh] max-w-[92vw] rounded-xl bg-white object-contain shadow-2xl"
            src={dataUri ?? undefined}
            alt={`${floor}층 평면도 확대`}
            draggable={false}
          />
          <div className="zzk-floormap-zoom-caption text-[15px] font-bold tracking-wider text-white">
            {floor}F
          </div>
        </>
      ) : null}
    </div>
  );
}
