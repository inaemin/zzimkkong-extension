// 슬롯 그리드의 순수 계산.
//
// 프레임워크 무관 함수로 둔다(로드맵 3단계 원칙). 컴포넌트는 여기서 나온 결과를
// 그리기만 하고, 판단은 전부 이 파일에서 한다. 그래야 렌더 없이 검증할 수 있다.

import type { Reservation, RoomSchedule, TimelineSlot } from "../../services/lms-data/types.js";

/** 한 방·한 슬롯의 상태. 클래스와 툴팁이 전부 여기서 갈린다. */
export interface SlotState {
  slot: TimelineSlot;
  /** 이 슬롯과 겹치는 예약들. 툴팁 미리보기에 쓴다. */
  overlappedReservations: Reservation[];
  isBusy: boolean;
  /** 현재 시각 이전이라 고를 수 없다. */
  isPastBlocked: boolean;
  /**
   * 지난 시간이면서 예약도 있었던 슬롯.
   *
   * "비어 있던 과거"와 "예약이 있었던 과거"는 다른 정보다. 둘 다 못 고르는 건
   * 같지만, 후자는 그 시간에 누가 썼는지가 남아 있어 더 진하게 표시한다.
   */
  isPastReserved: boolean;
  isSelectable: boolean;
}

/** 이 슬롯과 겹치는 예약들. 경계는 열린 구간이라 끝나는 시각은 겹치지 않는다. */
function findOverlappingReservations(reservations: Reservation[], slot: TimelineSlot) {
  return reservations.filter(
    (reservation) =>
      Number.isInteger(reservation.startMinute) &&
      Number.isInteger(reservation.endMinute) &&
      reservation.startMinute < slot.endMinute &&
      reservation.endMinute > slot.startMinute,
  );
}

function toSlotState(
  slot: TimelineSlot,
  overlappedReservations: Reservation[],
  earliestSelectableMinute: number,
): SlotState {
  const isPastBlocked =
    Number.isFinite(earliestSelectableMinute) && slot.startMinute < earliestSelectableMinute;
  const isBusy = overlappedReservations.length > 0;

  return {
    slot,
    overlappedReservations,
    isBusy,
    isPastBlocked,
    isPastReserved: isPastBlocked && isBusy,
    isSelectable: !isBusy && !isPastBlocked,
  };
}

export function buildSlotStates(
  room: RoomSchedule,
  timeline: TimelineSlot[],
  earliestSelectableMinute: number,
): SlotState[] {
  const reservations = Array.isArray(room.reservations) ? room.reservations : [];

  return timeline.map((slot) =>
    toSlotState(slot, findOverlappingReservations(reservations, slot), earliestSelectableMinute),
  );
}

/**
 * startIndex 부터 보며 stop 이 처음 참이 되는 칸의 바로 앞 인덱스.
 *
 * 끝까지 참이 없으면 마지막 인덱스. "조건이 깨지는 순간 멈춘다"를 두 군데서
 * 쓰고 있어 뽑았다.
 */
function lastIndexBefore(
  slotStates: SlotState[],
  startIndex: number,
  stop: (state: SlotState) => boolean,
): number {
  const found = slotStates.findIndex((state, index) => index >= startIndex && stop(state));
  return (found === -1 ? slotStates.length : found) - 1;
}

/**
 * 시작 슬롯에서 실제로 잡히는 범위의 끝 인덱스.
 *
 * lms+ 는 클릭 한 번에 기본 60분(30분 슬롯 2칸)을 잡되, 다음 칸이 예약 등으로
 * 막혀 있으면 30분만 잡는다. hover 미리보기와 클릭 결과가 같아야 하므로 둘 다
 * 이 함수를 쓴다.
 */
export function resolveSelectionEndIndex(
  slotStates: SlotState[],
  startIndex: number,
  defaultReservationMinutes: number,
): number {
  if (startIndex < 0 || startIndex >= slotStates.length) {
    return -1;
  }
  if (!slotStates[startIndex].isSelectable) {
    return -1;
  }

  const targetEndMinute = slotStates[startIndex].slot.startMinute + defaultReservationMinutes;

  // 기본 예약 길이를 넘는 칸, 그리고 고를 수 없는 칸. 각각 그 직전까지가 한계다.
  const limitIndex = lastIndexBefore(
    slotStates,
    startIndex,
    (state) => state.slot.endMinute > targetEndMinute,
  );
  const blockedLimit = lastIndexBefore(slotStates, startIndex, (state) => !state.isSelectable);

  return Math.max(startIndex, Math.min(limitIndex, blockedLimit, slotStates.length - 1));
}

/** 같은 층끼리 묶인 방 목록. 라벨 pane 과 타임라인 pane 이 같은 그룹을 그린다. */
export interface FloorGroup<TRoom> {
  floorKey: string;
  floorLabel: string;
  rooms: TRoom[];
  /** 이전 그룹과 층이 실제로 달라지는 경계인지(가로 구분선을 그린다). */
  isFloorDivider: boolean;
}

/**
 * 방 목록을 층 그룹으로 묶는다.
 *
 * 두 pane 이 각자 순회하며 그룹을 만들면 경계 판단이 어긋날 수 있어, 한 번만
 * 묶고 양쪽이 같은 결과를 쓰게 한다.
 */
/** 누적 상태. previousLabeledFloor 는 "마지막으로 이름이 있었던 층"이다. */
interface FloorGrouping<TRoom> {
  groups: FloorGroup<TRoom>[];
  previousLabeledFloor: string;
}

/** 마지막 그룹에 방을 덧붙인다(같은 층이 이어질 때). */
function appendToLastGroup<TRoom>(acc: FloorGrouping<TRoom>, room: TRoom): FloorGrouping<TRoom> {
  const lastGroup = acc.groups.at(-1);
  if (!lastGroup) {
    return acc;
  }
  return {
    groups: [...acc.groups.slice(0, -1), { ...lastGroup, rooms: [...lastGroup.rooms, room] }],
    previousLabeledFloor: acc.previousLabeledFloor,
  };
}

/** 새 층 그룹을 연다. 이름이 있고 직전 이름과 다를 때만 구분선을 긋는다. */
function startNewGroup<TRoom>(
  acc: FloorGrouping<TRoom>,
  room: TRoom,
  floor: { floorKey: string; floorLabel: string },
): FloorGrouping<TRoom> {
  const { floorKey, floorLabel } = floor;
  const isFloorDivider = Boolean(
    floorLabel && acc.previousLabeledFloor && acc.previousLabeledFloor !== floorLabel,
  );
  return {
    groups: [...acc.groups, { floorKey, floorLabel, rooms: [room], isFloorDivider }],
    // 이름이 비어 있으면 직전 이름을 그대로 들고 간다(경계 판단에서 건너뛴다).
    previousLabeledFloor: floorLabel || acc.previousLabeledFloor,
  };
}

export function groupRoomsByFloor<TRoom>(
  rooms: TRoom[],
  resolveFloor: (room: TRoom) => { floorKey: string; floorLabel: string },
): FloorGroup<TRoom>[] {
  const { groups } = rooms.reduce<FloorGrouping<TRoom>>(
    (acc, room) => {
      const { floorKey, floorLabel } = resolveFloor(room);
      const continuesLastGroup = acc.groups.at(-1)?.floorKey === floorKey;
      return continuesLastGroup
        ? appendToLastGroup(acc, room)
        : startNewGroup(acc, room, { floorKey, floorLabel });
    },
    { groups: [], previousLabeledFloor: "" },
  );

  return groups;
}

/**
 * 슬롯에 붙일 툴팁 문구.
 *
 * 툴팁은 예약이 있는 칸에만 뜬다(radar-grid 참고). 그래서 화면에 이미 있는
 * 정보는 뺀다 — 방 이름은 왼쪽 라벨에, 슬롯 시간대는 마우스 위치에, "지난
 * 예약"인지는 칸 색에 드러난다. 남는 건 색만으로 알 수 없는 것뿐이다:
 * 예약이 실제로 언제부터 언제까지이고 누구 것인지.
 *
 *   16:30~17:30 라텔(김규빈)
 */
export function buildSlotTitle(slotState: SlotState): string {
  return slotState.overlappedReservations
    .slice(0, 2)
    .map((reservation) => {
      const range = `${reservation.startTime}~${reservation.endTime}`;
      return reservation.owner ? `${range} ${reservation.owner}` : range;
    })
    .join("\n");
}

/** 폼에 반영이 끝난 선택. 그리드가 파란 칸으로 표시한다. */
export interface AppliedSelection {
  date: string;
  roomId: number;
  startMinute: number;
  endMinute: number;
}

/** 그리드 한 칸(회의실 한 줄)에 필요한 것. */
export interface RoomRow {
  room: RoomSchedule;
  slotStates: SlotState[];
  appliedRange: { startMinute: number; endMinute: number } | null;
}

/**
 * 반영된 선택이 이 방·이 날짜의 것인지.
 *
 * 날짜를 넘기거나 다른 방을 고른 뒤에도 파란 칸이 남으면, 실제로 예약되지
 * 않은 구간이 예약된 것처럼 보인다. 그래서 셋이 모두 맞을 때만 인정한다.
 */
export function resolveAppliedRange(
  selection: AppliedSelection | null,
  roomId: number,
  selectionDate: string,
): { startMinute: number; endMinute: number } | null {
  if (
    !selection ||
    selection.date !== selectionDate ||
    selection.roomId !== roomId ||
    !Number.isInteger(selection.startMinute) ||
    !Number.isInteger(selection.endMinute) ||
    selection.startMinute >= selection.endMinute
  ) {
    return null;
  }
  return { startMinute: selection.startMinute, endMinute: selection.endMinute };
}

/** 그리드에 넘길 층별 묶음을 만들 때 필요한 것. */
export interface GridFloorGroupsInput {
  rooms: RoomSchedule[];
  timeline: TimelineSlot[];
  earliestSelectableMinute: number;
  selectionDate: string;
  appliedSelection: AppliedSelection | null;
  resolveFloor: (room: RoomSchedule) => { floorKey: string; floorLabel: string };
}

function buildRoomRow(room: RoomSchedule, input: GridFloorGroupsInput): RoomRow {
  return {
    room,
    slotStates: buildSlotStates(room, input.timeline, input.earliestSelectableMinute),
    appliedRange: resolveAppliedRange(input.appliedSelection, room.id, input.selectionDate),
  };
}

/** 그리드에 넘길 층별 묶음. 방마다 슬롯 상태와 선택 표시를 미리 계산한다. */
export function buildGridFloorGroups(input: GridFloorGroupsInput): FloorGroup<RoomRow>[] {
  return groupRoomsByFloor(input.rooms, input.resolveFloor).map((floorGroup) => ({
    ...floorGroup,
    rooms: floorGroup.rooms.map((room) => buildRoomRow(room, input)),
  }));
}
