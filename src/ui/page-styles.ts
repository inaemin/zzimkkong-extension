import styleText from "./page-styles.css?inline";

// 레이더 오버레이는 shadow root 가 아니라 페이지에 직접 렌더된다(오버레이 CSS 약
// 800줄이 #zzk-map-calendar-overlay 로 스코프돼 있어서, shadow root 로 옮기면
// 그 CSS 가 통째로 안 닿는다). 그래서 Tailwind 유틸리티가 페이지에 없고,
// 컴포넌트에 준 클래스(size-7 등)가 아무 효과도 내지 못한다.
//
// 오버레이 내용을 전부 컴포넌트로 옮기고 shadow root 로 넘어가면 이 파일은 사라진다.

const STYLE_ID = "zzk-tailwind-page-style";

/** Tailwind 를 페이지에 한 번만 주입한다. */
export function ensurePageTailwindStyle(): void {
  if (document.getElementById(STYLE_ID)) {
    return;
  }
  const style = document.createElement("style");
  style.id = STYLE_ID;
  style.textContent = styleText;
  // 페이지 스타일보다 먼저 와야 lms+ 의 규칙이 필요할 때 이길 수 있다.
  document.head.prepend(style);
}
