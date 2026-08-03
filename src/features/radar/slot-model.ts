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

/** 예약 미리보기. 두 건까지만 보여준다(더 붙으면 툴팁이 길어진다). */
function buildReservationPreview(reservations: Reservation[]): string {
  return reservations
    .slice(0, 2)
    .map((reservation) =>
      reservation.owner
        ? `${reservation.startTime}~${reservation.endTime} ${reservation.owner}`
        : `${reservation.startTime}~${reservation.endTime}`,
    )
    .join(" | ");
}

/** 슬롯에 붙일 툴팁 문구. */
export function buildSlotTitle(
  roomName: string,
  slotState: SlotState,
  slotEndLabel: string,
): string {
  const { slot, isBusy, isPastBlocked, isPastReserved, overlappedReservations } = slotState;
  const range = `${roomName} ${slot.label}~${slotEndLabel}`;

  if (isBusy) {
    const preview = buildReservationPreview(overlappedReservations);
    // 지난 예약도 누가 썼는지는 알려준다. 지난 시간이라는 것만 덧붙인다.
    const label = isPastReserved ? "지난 예약" : "예약 있음";
    // 예약 내용은 줄을 바꿔 보여준다. 한 줄로 붙이면 방 이름·시간대·예약자가
    // 뭉쳐서 어디까지가 무엇인지 읽기 어렵다.
    return preview ? `${range} ${label}\n(${preview})` : `${range} ${label}`;
  }
  if (isPastBlocked) {
    return `${range} 선택 불가 (현재 시간 이전)`;
  }
  return `${range} 비어 있음`;
}
