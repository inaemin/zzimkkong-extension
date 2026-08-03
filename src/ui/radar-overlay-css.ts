import {
  CALENDAR_FLOOR_COL_WIDTH,
  CALENDAR_ROOM_COL_WIDTH,
  CALENDAR_ROW_GAP,
  CALENDAR_SIDE_MARGIN,
  MAP_CALENDAR_MIN_WIDTH,
  MAP_CALENDAR_VIEWPORT_MARGIN,
  RADAR_OVERLAY_Z_INDEX,
} from "../constants/runtime.js";

// 레이더 오버레이 CSS.
//
// shadow root 안에 주입되므로 #zzk-map-calendar-overlay 대신 :host 로 스코프한다.
// 격리돼 있어 호스트(lms+) CSS 와 이름이 겹쳐도 서로 간섭하지 않는다.
//
// 값 일부가 상수(열 너비·간격 등)를 참조해 일반 .css 파일이 아니라 문자열을
// 만드는 모듈로 둔다.

export const RADAR_OVERLAY_CSS = `
:host {
  position: fixed;
  left: auto;
  right: 16px;
  top: auto;
  bottom: 16px;
  width: max-content;
  max-width: calc(100vw - 24px);
  max-height: calc(100vh - 24px);
  z-index: ${RADAR_OVERLAY_Z_INDEX};
  pointer-events: auto;
  overflow: visible;
  display: flex;
  flex-direction: column;
  align-items: flex-end;
}

:host .zzk-map-calendar-shell {
  display: flex;
  flex-direction: column;
  align-items: flex-start;
  width: max-content;
  max-width: calc(100vw - 24px);
  pointer-events: auto;
  position: relative;
}

:host .zzk-map-calendar-shell > .zzk-map-calendar-space-tabs {
  display: inline-grid;
  grid-template-columns: 1fr 1fr;
  gap: 2px;
  width: fit-content;
  margin-left: 12px;
  margin-bottom: -4px;
  padding: 0;
  border: none;
  border-radius: 0;
  background: transparent;
  box-shadow: none;
  pointer-events: auto;
  position: relative;
  z-index: 3;
}

:host .zzk-map-calendar-shell > .zzk-map-calendar-space-tabs::after {
  content: "";
  position: absolute;
  left: 0;
  right: 0;
  bottom: -1px;
  height: 2px;
  background: rgba(255, 255, 255, 0.94);
  pointer-events: none;
}

:host {
  /* 슬롯 색. 범례가 이 변수를 그대로 참조하므로 한쪽만 바뀌지 않는다. */
  --zzk-slot-free: rgba(34, 197, 94, 0.32);
  --zzk-slot-busy: rgba(239, 68, 68, 0.45);
  --zzk-slot-past: rgba(148, 163, 184, 0.32);
  --zzk-slot-past-reserved: rgba(100, 116, 139, 0.55);
  --zzk-slot-selected: rgba(14, 165, 233, 0.38);
}

:host .zzk-map-calendar-card {
  --zzk-floor-col-width: ${CALENDAR_FLOOR_COL_WIDTH}px;
  --zzk-room-col-width: ${CALENDAR_ROOM_COL_WIDTH}px;
  --zzk-row-gap: ${CALENDAR_ROW_GAP}px;
  --zzk-timeline-side-margin: ${CALENDAR_SIDE_MARGIN}px;
  --zzk-section-divider-color: rgba(15, 23, 42, 0.18);
  --zzk-section-divider: 1px solid var(--zzk-section-divider-color);
  border: 1px solid rgba(15, 23, 42, 0.15);
  border-radius: 18px;
  background: rgba(255, 255, 255, 0.94);
  box-shadow: 0 10px 24px rgba(15, 23, 42, 0.2);
  backdrop-filter: blur(7px);
  color: #0f172a;
  font-family: "SUIT Variable", "Pretendard", "Noto Sans KR", "Apple SD Gothic Neo", sans-serif;
  padding: 10px 10px 10px 14px;
  display: flex;
  flex-direction: column;
  min-height: 0;
  position: relative;
  box-sizing: border-box;
  width: max-content;
  min-width: ${MAP_CALENDAR_MIN_WIDTH}px;
  max-width: calc(100vw - ${MAP_CALENDAR_VIEWPORT_MARGIN}px);
  max-height: calc(100vh - 24px);
  pointer-events: auto;
  overflow: hidden;
}

:host .zzk-map-calendar-card.collapsed .zzk-map-calendar-body {
  display: none;
}

:host .zzk-map-calendar-card.collapsed .zzk-map-calendar-header {
  margin-bottom: 0;
}

:host .zzk-map-calendar-header {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 12px;
  margin-bottom: 8px;
  cursor: move;
  user-select: none;
}

:host .zzk-map-calendar-title-controls {
  display: grid;
  gap: 6px;
  min-width: 0;
}

:host .zzk-map-calendar-space-tab {
  min-width: 84px;
  min-height: 40px;
  padding: 0 12px;
  border: 1px solid rgba(15, 23, 42, 0.12);
  border-bottom: none;
  border-radius: 18px 18px 0 0;
  background: rgba(217, 216, 220, 0.72);
  color: #7b7b84;
  font-size: 13px;
  font-weight: 800;
  line-height: 1;
  cursor: pointer;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  position: relative;
  transition: background-color 120ms ease, color 120ms ease, box-shadow 120ms ease,
transform 120ms ease;
}

:host .zzk-map-calendar-space-tab::after {
  content: "";
  position: absolute;
  left: 0;
  right: 0;
  bottom: 0;
  height: 0;
  background: inherit;
  pointer-events: none;
}

:host .zzk-map-calendar-space-tab[aria-selected="true"] {
  background: rgba(255, 255, 255, 1);
  color: #ff8833;
  box-shadow: none;
  transform: translateY(0);
  z-index: 2;
}

:host .zzk-map-calendar-space-tab[aria-selected="true"]::after {
  bottom: -1px;
  height: 2px;
}

:host .zzk-map-calendar-space-tab[aria-selected="false"] {
  background: rgba(217, 216, 220, 0.72);
  z-index: 1;
}

:host .zzk-map-calendar-space-tab:focus-visible {
  outline: 2px solid rgba(255, 136, 51, 0.18);
  outline-offset: 2px;
}



:host .zzk-map-calendar-header-right {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-left: auto;
}

:host .zzk-map-calendar-always-open {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  font-size: 13px;
  font-weight: 700;
  color: #334155;
  white-space: nowrap;
  user-select: none;
}

:host .zzk-map-calendar-always-open input {
  margin: 0;
  cursor: pointer;
  accent-color: #0284c7;
}

:host .zzk-map-calendar-header strong {
  font-size: 14px;
}

:host .zzk-room-tag-legend[hidden] {
  display: none !important;
}

:host .zzk-room-tag-legend {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
  margin-top: 6px;
}

:host .zzk-room-tag-badge {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  flex: none;
  min-width: 18px;
  min-height: 18px;
  padding: 0 2px;
  border-radius: 4px;
  background: rgba(14, 165, 233, 0.14);
  border: 1px solid rgba(14, 165, 233, 0.22);
  color: #0369a1;
  font-size: 10px;
  font-weight: 800;
  line-height: 1;
  letter-spacing: 0.01em;
}

:host .zzk-room-tag-badge::before {
  content: attr(data-label);
}

:host .zzk-room-name-text {
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
}

:host .zzk-map-calendar-resize-handle {
  position: absolute;
  left: 0;
  top: 0;
  bottom: 0;
  width: 10px;
  cursor: ew-resize;
  z-index: 6;
  touch-action: none;
  border-top-left-radius: 18px;
  border-bottom-left-radius: 18px;
}

:host .zzk-map-calendar-resize-handle::after {
  content: "";
  position: absolute;
  left: 3px;
  top: 50%;
  transform: translateY(-50%);
  width: 4px;
  height: 44px;
  border-radius: 999px;
  background: rgba(15, 23, 42, 0.18);
  transition: background 120ms ease;
}

:host .zzk-map-calendar-resize-handle:hover::after,
:host .zzk-map-calendar-resize-handle.is-resizing::after {
  background: rgba(2, 132, 199, 0.75);
}

@media (prefers-reduced-motion: reduce) {
  :host .zzk-map-calendar-resize-handle::after {
transition: none;
  }
}

:host .zzk-map-calendar-body {
  flex: 1 1 auto;
  min-height: 0;
  max-height: none;
  position: relative;
  /* 가로 스크롤은 안쪽 timeline-pane 에서 처리한다. body 는 세로만. */
  overflow-x: hidden;
  overflow-y: hidden;
  box-sizing: border-box;
}

:host .zzk-map-calendar-body.zzk-map-calendar-body-scrollable {
  overflow-y: auto;
}

:host .zzk-map-calendar-body.zzk-map-calendar-error-body {
  overflow: hidden;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 28px 20px;
}

:host .zzk-map-calendar-error {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 14px;
  max-width: 320px;
  text-align: center;
}

:host .zzk-map-calendar-error-message {
  margin: 0;
  font-size: 13px;
  line-height: 1.6;
  color: #b91c1c;
  white-space: pre-line;
  word-break: keep-all;
}

:host .zzk-map-calendar-error-retry {
  appearance: none;
  border: 1px solid rgba(2, 132, 199, 0.5);
  background: #ffffff;
  color: #0284c7;
  font-size: 12px;
  font-weight: 700;
  padding: 7px 16px;
  border-radius: 8px;
  cursor: pointer;
  transition: background 120ms ease, color 120ms ease;
}

:host .zzk-map-calendar-error-retry:hover {
  background: #0284c7;
  color: #ffffff;
}

:host .zzk-map-calendar-loading-overlay {
  position: absolute;
  inset: 0;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 8px;
  opacity: 0;
  pointer-events: none;
  color: #0f172a;
  font-size: 13px;
  font-weight: 700;
  background: linear-gradient(180deg, rgba(248, 250, 252, 0.72), rgba(248, 250, 252, 0.84));
  backdrop-filter: blur(1px);
  transition: opacity 120ms ease;
  z-index: 5;
}

:host .zzk-map-calendar-loading-spinner {
  width: 14px;
  height: 14px;
  border-radius: 999px;
  border: 2px solid rgba(14, 116, 144, 0.22);
  border-top-color: #0284c7;
  animation: zzk-map-calendar-loading-spin 720ms linear infinite;
}

:host .zzk-map-calendar-body.zzk-map-calendar-body-loading .zzk-map-calendar-loading-overlay {
  opacity: 1;
  pointer-events: auto;
  cursor: progress;
}

:host .zzk-map-calendar-body.zzk-map-calendar-body-loading .zzk-map-calendar-grid-wrap {
  opacity: 0.58;
}

/* 층별 평면도 영역 — 타임라인 아래에 접이식으로 붙는다. */
:host .zzk-map-calendar-floormap-section {
  border-top: 1px solid var(--zzk-section-divider-color);
  margin-top: 8px;
  padding-top: 8px;
}

:host .zzk-map-calendar-floormap-header {
  display: flex;
  align-items: center;
  gap: 6px;
  width: 100%;
  padding: 6px 4px;
  background: none;
  border: none;
  cursor: pointer;
  font-size: 13px;
  font-weight: 700;
  color: #1e293b;
  text-align: left;
}

:host .zzk-map-calendar-floormap-caret {
  font-size: 11px;
  color: #64748b;
  line-height: 1;
}

/* 접힌 상태에서는 평면도 스크롤 영역을 숨긴다(기본). */
:host .zzk-map-calendar-floormap-scroller {
  display: none;
  gap: 12px;
  overflow-x: auto;
  overflow-y: hidden;
  padding: 6px 4px 10px;
}

:host .zzk-map-calendar-floormap-section.open .zzk-map-calendar-floormap-scroller {
  display: flex;
}

:host .zzk-map-calendar-floormap-card {
  flex: 0 0 auto;
  margin: 0;
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 4px;
}

:host .zzk-map-calendar-floormap-image {
  display: block;
  height: 220px;
  width: auto;
  max-width: none;
  border: 1px solid var(--zzk-section-divider-color);
  border-radius: 8px;
  background: #ffffff;
  cursor: zoom-in;
}

:host .zzk-map-calendar-floormap-caption {
  font-size: 12px;
  font-weight: 600;
  color: #475569;
}

@keyframes zzk-map-calendar-loading-spin {
  from {
transform: rotate(0deg);
  }
  to {
transform: rotate(360deg);
  }
}

@media (prefers-reduced-motion: reduce) {
  :host .zzk-map-calendar-loading-overlay {
transition: none;
  }

  :host .zzk-map-calendar-loading-spinner {
animation: none;
  }
}

/*
 * === 2-pane 레이아웃 ===
 * grid-wrap 을 좌우 flex 로 나눈다.
 *  - label-pane: 층/회의실 라벨(스크롤 밖, 고정)
 *  - timeline-pane: 정시 헤더 + 타임블록(가로 스크롤). 스크롤바가 이 pane 아래에만 생긴다.
 * 두 pane 의 각 행은 같은 고정 높이(--zzk-cal-row-h)로 그려 세로 정렬을 맞춘다.
 */
:host .zzk-map-calendar-grid-wrap {
  position: relative;
  display: flex;
  align-items: stretch;
  --zzk-cal-row-h: 26px;
  --zzk-cal-header-h: 24px;
  --zzk-hscroll-gutter: 12px;
}

:host .zzk-map-calendar-label-pane {
  /* 층 + gap + 회의실 열 고정 너비. */
  flex: 0 0 calc(
var(--zzk-floor-col-width) + var(--zzk-row-gap) + var(--zzk-room-col-width)
  );
  width: calc(
var(--zzk-floor-col-width) + var(--zzk-row-gap) + var(--zzk-room-col-width)
  );
  position: relative;
  z-index: 2;
  background: #ffffff;
  /* 라벨 열 고정 폭 밖으로는 어떤 것도(타임블록 등) 넘치지 못하게 잘라낸다. */
  overflow: hidden;
  /* 회의실↔타임블록 경계 세로선(오른쪽 테두리). */
  border-right: 1px solid var(--zzk-section-divider-color);
}

:host .zzk-map-calendar-timeline-pane {
  flex: 1 1 auto;
  min-width: 0;
  overflow-x: auto;
  overflow-y: hidden;
}

/* 가로 스크롤이 생길 때만 트랙 하단에 스크롤바 전용 공백(gutter)을 둔다.
   가로 스크롤바가 이 빈 공간에 놓여 마지막 타임블록 행의 클릭을 방해하지 않는다.
   이 gutter 는 세로 스크롤 판정에서 제외된다(syncMapCalendarBodyScrollState). */
:host .zzk-map-calendar-timeline-pane-hscroll
  .zzk-map-calendar-timeline-track {
  padding-bottom: var(--zzk-hscroll-gutter, 12px);
}

/* 정시 세로선이 빈 gutter 까지 내려가지 않고 마지막 행에서 멈추게 한다. */
:host .zzk-map-calendar-timeline-pane-hscroll
  .zzk-map-calendar-hour-boundary-layer {
  bottom: var(--zzk-hscroll-gutter, 12px);
}

:host .zzk-map-calendar-timeline-track {
  position: relative;
}

/* 정시 세로 경계선 레이어 — 타임블록 트랙 전체에 절대배치. */
:host .zzk-map-calendar-hour-boundary-layer {
  position: absolute;
  top: 0;
  left: 0;
  right: 0;
  bottom: 0;
  z-index: 1;
  pointer-events: none;
  /* 정시선이 시각 텍스트 아래까지만 올라오도록 위쪽을 잘라낸다. */
  clip-path: inset(
var(--zzk-hour-boundary-clip-top, var(--zzk-cal-header-h, 24px)) 0 0 0
  );
}

:host .zzk-map-calendar-hour-boundary-track {
  display: grid;
  grid-template-rows: minmax(0, 1fr);
  height: 100%;
  width: 100%;
  padding-left: var(--zzk-timeline-side-margin);
  padding-right: var(--zzk-timeline-side-margin);
  box-sizing: border-box;
}

:host .zzk-map-calendar-hour-boundary-cell {
  grid-row: 1;
  height: 100%;
  align-self: stretch;
  justify-self: stretch;
  width: 100%;
  border-radius: 1px;
  background: var(--zzk-section-divider-color);
  pointer-events: none;
  z-index: 0;
}

:host .zzk-map-calendar-grid {
  position: relative;
  z-index: 2;
  display: grid;
  gap: 0;
}

/* 층↔회의실 세로 구분선(라벨 pane 안, 왼쪽으로 2px 이동). */
:host .zzk-map-calendar-divider-layer {
  position: absolute;
  top: 0;
  bottom: 0;
  left: calc(var(--zzk-floor-col-width) + (var(--zzk-row-gap) * 0.5) - 2px);
  width: 1px;
  pointer-events: none;
  z-index: 5;
}

:host .zzk-map-calendar-divider-track {
  width: 1px;
  height: 100%;
  background: var(--zzk-section-divider-color);
}

/* 헤더(축) 행: 라벨 pane 은 [층][회의실], 타임블록 pane 은 정시 라벨. */
:host .zzk-map-calendar-axis-row {
  position: relative;
  height: var(--zzk-cal-header-h, 24px);
  box-sizing: border-box;
  border-bottom: 1px solid var(--zzk-section-divider-color);
}

:host .zzk-map-calendar-axis-row.zzk-map-calendar-label-row {
  display: grid;
  grid-template-columns: var(--zzk-floor-col-width) var(--zzk-room-col-width);
  align-items: center;
  gap: var(--zzk-row-gap);
}

:host .zzk-map-calendar-axis-row.zzk-map-calendar-timeline-row {
  display: block;
}

/* 층 그룹: 라벨 pane 은 [층][회의실 행들], 타임블록 pane 은 [슬롯 행들]. */
:host .zzk-map-calendar-floor-group {
  display: grid;
  /* 라벨 열은 고정 너비(층 + 회의실). 1fr 을 쓰면 pane 이 무한정 늘어난다. */
  grid-template-columns: var(--zzk-floor-col-width) var(--zzk-room-col-width);
  align-items: stretch;
  column-gap: var(--zzk-row-gap);
  row-gap: 0;
  position: relative;
}

:host .zzk-map-calendar-floor-group.zzk-map-calendar-floor-group-timeline {
  display: block;
}

/* 실제 층이 바뀌는 경계에만 가로 구분선. */
:host .zzk-map-calendar-floor-group.floor-divider::before {
  content: "";
  position: absolute;
  top: 0;
  left: 0;
  right: 0;
  height: 1px;
  background: var(--zzk-section-divider-color);
  pointer-events: none;
  z-index: 6;
}

:host .zzk-map-calendar-floor-rooms {
  display: grid;
  gap: 0;
}

/* 행(라벨/타임블록 공통): 같은 고정 높이로 정렬. */
:host .zzk-map-calendar-row {
  height: var(--zzk-cal-row-h, 26px);
  box-sizing: border-box;
  transition: background-color 120ms ease;
}

:host .zzk-map-calendar-row.zzk-map-calendar-label-row {
  display: flex;
  align-items: center;
}

:host .zzk-map-calendar-row.zzk-map-calendar-timeline-row {
  display: block;
}

:host .zzk-map-calendar-row.hovered {
  background: rgba(14, 165, 233, 0.12);
}

:host .zzk-map-calendar-row.hovered .zzk-map-calendar-room-name {
  color: #0f172a;
  background: #e3f4fd;
}

:host .zzk-map-calendar-floor-name,
:host .zzk-map-calendar-room-name {
  font-size: 13px;
  font-weight: 700;
  color: #1e293b;
  white-space: nowrap;
}

:host .zzk-map-calendar-floor-name {
  display: flex;
  align-items: center;
  align-self: stretch;
  min-height: 100%;
  padding-right: 4px;
  box-sizing: border-box;
}

:host .zzk-map-calendar-room-name {
  display: flex;
  align-items: center;
  gap: 4px;
  min-width: 0;
  padding-left: 4px;
  box-sizing: border-box;
}

:host .zzk-map-calendar-floor-name.axis,
:host .zzk-map-calendar-room-name.axis {
  color: #475569;
}

:host .zzk-map-calendar-slots {
  display: grid;
  gap: 0;
  height: 100%;
  /* 슬롯(16px)을 행 높이 안에서 세로 가운데 정렬한다. */
  align-items: center;
  align-content: center;
  padding-left: var(--zzk-timeline-side-margin);
  padding-right: var(--zzk-timeline-side-margin);
  box-sizing: border-box;
  position: relative;
}

/* 헤더의 정시 라벨 슬롯은 여백 없이 꽉 채운다. */
:host .zzk-map-calendar-axis-row .zzk-map-calendar-slots {
  height: 100%;
  padding-top: 0;
  padding-bottom: 0;
  align-items: end;
}

:host .zzk-map-calendar-hour-label {
  font-size: 11px;
  color: #64748b;
  text-align: left;
  /* 정시 텍스트가 세로 구분선/경계선에 바싹 붙어 잘리지 않도록 살짝 들여쓴다. */
  padding-left: 2px;
  min-height: 10px;
  position: relative;
  z-index: 1;
}

:host .zzk-map-calendar-hour-label.hour-boundary {
  color: #1e293b;
  font-weight: 700;
}

:host .zzk-map-calendar-slot {
  height: 16px;
  box-sizing: border-box;
  border-radius: 3px;
  border: 1px solid rgba(15, 23, 42, 0.12);
  position: relative;
  z-index: 1;
}

:host .zzk-map-calendar-slot.free {
  background: var(--zzk-slot-free);
}
:host .zzk-map-calendar-slot.busy {
  background: var(--zzk-slot-busy);
}
:host .zzk-map-calendar-slot.past-blocked {
  background: var(--zzk-slot-past);
  border-color: rgba(100, 116, 139, 0.2);
}

/* 지난 시간 + 예약 있었음. 빈 과거보다 진하게 해서 "그때 누가 썼다"를 보여준다. */
:host .zzk-map-calendar-slot.past-blocked.past-reserved {
  background: var(--zzk-slot-past-reserved);
  border-color: rgba(71, 85, 105, 0.4);
}

:host .zzk-map-calendar-slot.selected {
  outline: 1.5px solid rgba(14, 116, 144, 0.95);
  outline-offset: -1px;
  background: var(--zzk-slot-selected);
}

:host .zzk-map-calendar-slot.hover-preview {
  background: rgba(14, 165, 233, 0.24);
  box-shadow: inset 0 0 0 1px rgba(2, 132, 199, 0.28);
}

:host .zzk-map-calendar-slot.busy {
  cursor: not-allowed;
}

:host .zzk-map-calendar-slot.past-blocked {
  cursor: not-allowed;
}

:host .zzk-map-calendar-empty {
  margin: 0;
  font-size: 14px;
  color: #64748b;
}

@media (max-width: 920px) {
  :host {
left: auto;
right: 8px;
top: auto;
bottom: 8px;
max-width: calc(100vw - 16px);
max-height: calc(100vh - 16px);
  }

  :host .zzk-map-calendar-card {
max-width: calc(100vw - 16px);
max-height: calc(100vh - 16px);
  }

  :host .zzk-map-calendar-header {
flex-wrap: wrap;
  }

  :host .zzk-map-calendar-controls {
flex-wrap: wrap;
  }
}
`;
