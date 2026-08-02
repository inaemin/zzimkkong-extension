// 레이더 오버레이의 상태 저장소.
//
// 기존 구조는 renderMapCalendarOverlay(scheduleData) 를 부를 때마다
// overlay.textContent = "" 로 트리를 통째로 날리고 다시 그렸다. 그래서 호출부가
// "데이터를 준다"와 "다시 그려라"를 겸했고, hover 처럼 데이터가 그대로인 경우에도
// 같은 데이터를 되돌려주며 리렌더를 시켜야 했다.
//
// 여기서는 그 둘을 나눈다. 호출부는 데이터만 갱신하고, 무엇을 다시 그릴지는
// React 가 판단한다. 그 결과 스크롤 위치를 손으로 보존하던 코드도 필요 없어진다.
//
// React 전용이 아니라 일반 구독 저장소다. content.js(아직 .js)에서도 그대로
// 부를 수 있어야 전환 중에 양쪽이 공존한다.

import { MAP_CALENDAR_SPACE_TAB_MEETING, type SpaceTab } from "../constants/runtime.js";
import type { DailyScheduleResult } from "../services/lms-data/types.js";

/**
 * hover 중인 슬롯.
 *
 * 날짜까지 들고 있는 이유: 날짜를 바꾸면 같은 방·같은 시각이라도 다른 슬롯이다.
 * 이게 없으면 날짜 전환 후에도 이전 hover 가 살아 있는 것처럼 보인다.
 */
export interface SlotHover {
  date: string;
  roomId: string | number;
  startMinute: number;
}

/**
 * 드래그 선택 중인 범위. 시작점은 클릭한 슬롯, 끝은 현재 hover 중인 슬롯이다.
 * 확정되면 null 로 돌아가고 예약 폼에 반영된다.
 */
export interface SlotSelection {
  date: string;
  roomId: string | number;
  hoverMinute: number;
}

export interface RadarState {
  /** 그릴 스케줄. null 이면 아직 데이터가 없다. */
  schedule: DailyScheduleResult | null;
  /** 오버레이를 띄울지. 데이터 유무와 별개다(로딩 중에도 열려 있을 수 있다). */
  open: boolean;
  collapsed: boolean;
  loading: boolean;
  slotHover: SlotHover | null;
  slotSelection: SlotSelection | null;
  spaceTab: SpaceTab;
  /** 드래그로 옮긴 위치. */
  offset: { x: number; y: number } | null;
  floorMapOpen: boolean;
}

const INITIAL_STATE: RadarState = {
  schedule: null,
  open: false,
  collapsed: false,
  loading: false,
  slotHover: null,
  slotSelection: null,
  spaceTab: MAP_CALENDAR_SPACE_TAB_MEETING,
  offset: null,
  floorMapOpen: false,
};

type Listener = () => void;

let state: RadarState = INITIAL_STATE;
const listeners = new Set<Listener>();

export function getRadarState(): RadarState {
  return state;
}

/**
 * 상태를 갱신한다. 바뀐 값이 없으면 구독자를 깨우지 않는다.
 *
 * hover 처럼 초당 수십 번 들어오는 갱신이 있어서, 같은 값이면 조용히 넘겨야
 * React 가 불필요하게 리렌더하지 않는다.
 */
export function setRadarState(patch: Partial<RadarState>): void {
  let changed = false;
  for (const key of Object.keys(patch) as Array<keyof RadarState>) {
    if (!Object.is(state[key], patch[key])) {
      changed = true;
      break;
    }
  }
  if (!changed) {
    return;
  }
  state = { ...state, ...patch };
  for (const listener of listeners) {
    listener();
  }
}

export function subscribeRadarState(listener: Listener): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

/** 테스트용. 저장소를 초기 상태로 되돌린다. */
export function resetRadarState(): void {
  state = INITIAL_STATE;
  for (const listener of listeners) {
    listener();
  }
}
