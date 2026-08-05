// 타임라인 그리드의 열 계산과 스크롤 위치 계산.
//
// DOM 을 만지지 않는 순수 계산이라 모듈로 뺐다. content.ts 안에 있을 때는
// 단위 테스트를 붙일 수 없었다(로드맵의 이월 항목).

import {
  CALENDAR_HOUR_BOUNDARY_LINE_WIDTH,
  CALENDAR_HOUR_BOUNDARY_SIDE_GAP,
  CALENDAR_SLOT_GAP,
  LMS_CALENDAR_SLOT_MIN_WIDTH,
  MAP_CALENDAR_CURRENT_TIME_SCROLL_LEAD_MINUTES,
} from "../../constants/runtime.js";
import type { TimelineSlot } from "../../services/lms-data/types.js";

/** CSS grid 로 그릴 열 정보. */
export interface TimelineGridLayout {
  /** grid-template-columns 값. */
  templateColumns: string;
  /** 슬롯 i 가 시작하는 열 번호(1-based). */
  slotColumnStarts: number[];
  /** 정시 경계선이 들어갈 열 번호. */
  boundaryColumnStarts: number[];
  /** 전체 트랙 폭(px). */
  trackWidth: number;
}

const EMPTY_LAYOUT: TimelineGridLayout = {
  templateColumns: "",
  slotColumnStarts: [],
  boundaryColumnStarts: [],
  trackWidth: 0,
};

/** 슬롯 하나가 차지하는 열들. 앞의 구분(경계 또는 여백)과 슬롯 본체. */
function columnsForSlot(slot: TimelineSlot | undefined, isFirst: boolean): number[] {
  if (isFirst) {
    // 첫 슬롯이 정시면 선 없이 여백만 넣어 다른 정시와 리듬을 맞춘다.
    // (선을 그리면 회의실↔타임블록 세로 구분선과 겹쳐 이중선이 된다)
    const lead = slot?.isHourMark
      ? [CALENDAR_HOUR_BOUNDARY_SIDE_GAP * 2 + CALENDAR_HOUR_BOUNDARY_LINE_WIDTH]
      : [];
    return [...lead, LMS_CALENDAR_SLOT_MIN_WIDTH];
  }
  const separator = slot?.isHourMark ? BOUNDARY_SEGMENT : [CALENDAR_SLOT_GAP];
  return [...separator, LMS_CALENDAR_SLOT_MIN_WIDTH];
}

/** 정시 경계 한 세트: 여백 + 선 + 여백. */
const BOUNDARY_SEGMENT = [
  CALENDAR_HOUR_BOUNDARY_SIDE_GAP,
  CALENDAR_HOUR_BOUNDARY_LINE_WIDTH,
  CALENDAR_HOUR_BOUNDARY_SIDE_GAP,
];

/** 슬롯들을 훑어 열 목록과 각 슬롯·경계의 시작 열을 모은다. */
function accumulateColumns(timeline: TimelineSlot[]): {
  columns: number[];
  slotColumnStarts: number[];
  boundaryColumnStarts: number[];
} {
  const columns: number[] = [];
  const slotColumnStarts: number[] = [];
  const boundaryColumnStarts: number[] = [];

  timeline.forEach((slot, index) => {
    const group = columnsForSlot(slot, index === 0);
    // 경계 세그먼트(여백+선+여백)를 넣었다면 가운데가 선이다.
    if (index > 0 && slot?.isHourMark) {
      boundaryColumnStarts.push(columns.length + 2);
    }
    columns.push(...group);
    // 슬롯 본체는 그룹의 마지막 열이다.
    slotColumnStarts.push(columns.length);
  });

  return { columns, slotColumnStarts, boundaryColumnStarts };
}

/**
 * 슬롯 사이에 정시 경계(여백+선+여백)를 끼워 넣은 열 목록을 만든다.
 *
 * 첫 슬롯(보통 07:00) 앞에는 선을 그리지 않는다 — 회의실↔타임블록 세로
 * 구분선과 겹쳐 이중선처럼 보인다. 다만 다른 정시들은 앞뒤로 여백을 갖는데
 * 07:00 만 붙으면 어색하므로, 선 없이 같은 폭의 여백만 넣어 리듬을 맞춘다.
 */
export function buildMapCalendarTimelineGridLayout(
  timeline: TimelineSlot[],
  hasTerminalHourBoundary: boolean,
): TimelineGridLayout {
  if (!Array.isArray(timeline) || timeline.length === 0) {
    return EMPTY_LAYOUT;
  }

  const { columns, slotColumnStarts, boundaryColumnStarts } = accumulateColumns(timeline);

  if (hasTerminalHourBoundary) {
    boundaryColumnStarts.push(columns.length + 2);
    columns.push(...BOUNDARY_SEGMENT);
  }

  return {
    templateColumns: columns.map((width) => `${width}px`).join(" "),
    slotColumnStarts,
    boundaryColumnStarts,
    trackWidth: columns.reduce((total, width) => total + width, 0),
  };
}

export interface ScrollTargetInput {
  timeline: TimelineSlot[];
  slotStride: number;
  maxScrollLeft: number;
  isToday: boolean;
  currentMinute: number;
}

/** 스크롤 위치를 계산할 수 있는 상태인지. */
function canComputeScroll({
  timeline,
  slotStride,
  maxScrollLeft,
  isToday,
  currentMinute,
}: ScrollTargetInput): boolean {
  return (
    isToday === true &&
    Array.isArray(timeline) &&
    timeline.length > 0 &&
    Number.isFinite(maxScrollLeft) &&
    maxScrollLeft > 0 &&
    Number.isFinite(slotStride) &&
    slotStride > 0 &&
    Number.isFinite(currentMinute)
  );
}

/** 현재 시각(에서 조금 앞)을 담는 슬롯의 인덱스. 없으면 마지막 칸. */
function findScrollTargetIndex(timeline: TimelineSlot[], currentMinute: number): number {
  // 타임라인 시작 이전(예: 새벽)이면 시작 시각으로 끌어올린다.
  const timelineStartMinute = Number(timeline[0]?.startMinute);
  const effectiveMinute = Number.isFinite(timelineStartMinute)
    ? Math.max(timelineStartMinute, currentMinute)
    : currentMinute;

  const leadMinute = effectiveMinute - MAP_CALENDAR_CURRENT_TIME_SCROLL_LEAD_MINUTES;
  const found = timeline.findIndex((slot) => Number(slot?.endMinute) > leadMinute);
  return found < 0 ? timeline.length - 1 : found;
}

/**
 * 현재 시각이 왼쪽 끝에 오도록 할 가로 스크롤 위치. 계산할 수 없으면 null.
 *
 * 층/회의실 열은 sticky 라 스크롤을 소비하지 않는다. 따라서 목표 슬롯을 왼쪽
 * 끝에 두려면 고정 열 폭을 더하지 않고 슬롯 인덱스 × 슬롯 폭 만큼만 옮긴다.
 */
export function computeMapCalendarCurrentTimeScrollLeft({
  timeline,
  slotStride,
  maxScrollLeft,
  isToday,
  currentMinute,
}: ScrollTargetInput): number | null {
  if (!canComputeScroll({ timeline, slotStride, maxScrollLeft, isToday, currentMinute })) {
    return null;
  }

  const targetIndex = findScrollTargetIndex(timeline, currentMinute);

  // 첫 슬롯이면 맨 처음을 그대로 보여준다.
  if (targetIndex <= 0) {
    return 0;
  }

  return Math.min(maxScrollLeft, Math.max(0, Math.round(targetIndex * slotStride)));
}
