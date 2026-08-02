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
  isSelectable: boolean;
}

export function buildSlotStates(
  room: RoomSchedule,
  timeline: TimelineSlot[],
  earliestSelectableMinute: number,
): SlotState[] {
  const reservations = Array.isArray(room.reservations) ? room.reservations : [];

  return timeline.map((slot) => {
    const overlappedReservations = reservations.filter(
      (reservation) =>
        Number.isInteger(reservation.startMinute) &&
        Number.isInteger(reservation.endMinute) &&
        reservation.startMinute < slot.endMinute &&
        reservation.endMinute > slot.startMinute,
    );
    const isPastBlocked =
      Number.isFinite(earliestSelectableMinute) && slot.startMinute < earliestSelectableMinute;

    return {
      slot,
      overlappedReservations,
      isBusy: overlappedReservations.length > 0,
      isPastBlocked,
      isSelectable: overlappedReservations.length === 0 && !isPastBlocked,
    };
  });
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

  let limitIndex = startIndex;
  for (
    let index = startIndex;
    index < slotStates.length && slotStates[index].slot.endMinute <= targetEndMinute;
    index += 1
  ) {
    limitIndex = index;
  }

  let endIndex = startIndex;
  for (let index = startIndex; index <= Math.min(slotStates.length - 1, limitIndex); index += 1) {
    if (!slotStates[index].isSelectable) {
      break;
    }
    endIndex = index;
  }
  return endIndex;
}

/** 슬롯에 붙일 툴팁 문구. */
export function buildSlotTitle(
  roomName: string,
  slotState: SlotState,
  slotEndLabel: string,
): string {
  const { slot, isBusy, isPastBlocked, overlappedReservations } = slotState;
  const range = `${roomName} ${slot.label}~${slotEndLabel}`;

  if (isBusy) {
    const preview = overlappedReservations
      .slice(0, 2)
      .map((reservation) =>
        reservation.owner
          ? `${reservation.startTime}~${reservation.endTime} ${reservation.owner}`
          : `${reservation.startTime}~${reservation.endTime}`,
      )
      .join(" | ");
    return `${range} 예약 있음${preview ? ` (${preview})` : ""}`;
  }
  if (isPastBlocked) {
    return `${range} 선택 불가 (현재 시간 이전)`;
  }
  return `${range} 비어 있음`;
}
