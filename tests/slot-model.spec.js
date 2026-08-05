import { expect, test } from "@playwright/test";

import {
  buildSlotStates,
  buildSlotTitle,
  groupRoomsByFloor,
  resolveSelectionEndIndex,
} from "../src/features/radar/slot-model.ts";

// 슬롯 그리드의 판단 로직. 브라우저가 필요 없어 함수만 직접 검증한다.
//
// 이 규칙들은 지금까지 렌더 결과로만 간접 확인됐다(슬롯에 어떤 클래스가 붙었는지).
// 경계 조건을 직접 넣어보는 편이 빠르고 촘촘하다.

const SLOT_MINUTES = 30;

/** 07:00 부터 count 개의 30분 슬롯. */
function makeTimeline(count, startMinute = 7 * 60) {
  return Array.from({ length: count }, (_, index) => {
    const begin = startMinute + index * SLOT_MINUTES;
    const hour = String(Math.floor(begin / 60)).padStart(2, "0");
    const minute = String(begin % 60).padStart(2, "0");
    return {
      startMinute: begin,
      endMinute: begin + SLOT_MINUTES,
      label: `${hour}:${minute}`,
      isHourMark: begin % 60 === 0,
    };
  });
}

function makeRoom(reservations = []) {
  return { id: 5, name: "보이저", reservations };
}

test.describe("buildSlotStates", () => {
  test("예약이 겹치는 슬롯만 busy 로 표시한다", () => {
    // 08:00~09:00 예약 → 08:00·08:30 두 칸이 겹친다.
    const states = buildSlotStates(
      makeRoom([{ startMinute: 480, endMinute: 540, startTime: "08:00", endTime: "09:00" }]),
      makeTimeline(6),
      0,
    );

    expect(states.map((state) => state.isBusy)).toEqual([false, false, true, true, false, false]);
  });

  test("예약 경계는 열린 구간이다 — 끝나는 시각에 시작하는 슬롯은 비어 있다", () => {
    // 08:00~08:30 예약. 08:30 슬롯은 겹치지 않는다.
    const states = buildSlotStates(
      makeRoom([{ startMinute: 480, endMinute: 510, startTime: "08:00", endTime: "08:30" }]),
      makeTimeline(4),
      0,
    );

    expect(states[2].isBusy).toBe(true); // 08:00
    expect(states[3].isBusy).toBe(false); // 08:30
  });

  test("최소 선택 시각 이전은 지난 칸으로 본다", () => {
    // 08:00 이전은 과거.
    const states = buildSlotStates(makeRoom(), makeTimeline(4), 480);

    expect(states.map((state) => state.isPastBlocked)).toEqual([true, true, false, false]);
    expect(states.every((state) => !state.isPastReserved)).toBe(true);
  });

  test("지난 시간이면서 예약도 있으면 isPastReserved 다", () => {
    const states = buildSlotStates(
      makeRoom([{ startMinute: 420, endMinute: 450, startTime: "07:00", endTime: "07:30" }]),
      makeTimeline(4),
      480,
    );

    expect(states[0].isPastReserved).toBe(true);
    // 예약 없이 지나간 칸은 구분된다.
    expect(states[1].isPastBlocked).toBe(true);
    expect(states[1].isPastReserved).toBe(false);
  });

  test("예약도 없고 과거도 아니어야 고를 수 있다", () => {
    const states = buildSlotStates(
      makeRoom([{ startMinute: 480, endMinute: 510, startTime: "08:00", endTime: "08:30" }]),
      makeTimeline(4),
      450,
    );

    expect(states.map((state) => state.isSelectable)).toEqual([false, true, false, true]);
  });

  test("reservations 가 없거나 배열이 아니어도 깨지지 않는다", () => {
    expect(buildSlotStates({ id: 1, name: "x" }, makeTimeline(2), 0)).toHaveLength(2);
    expect(
      buildSlotStates({ id: 1, name: "x", reservations: null }, makeTimeline(2), 0),
    ).toHaveLength(2);
  });
});

test.describe("resolveSelectionEndIndex", () => {
  const DEFAULT_MINUTES = 60;

  test("기본 60분이면 두 칸을 잡는다", () => {
    const states = buildSlotStates(makeRoom(), makeTimeline(6), 0);
    expect(resolveSelectionEndIndex(states, 0, DEFAULT_MINUTES)).toBe(1);
  });

  test("다음 칸이 예약이면 한 칸만 잡는다", () => {
    // 07:30 예약 → 07:00 에서 시작하면 한 칸.
    const states = buildSlotStates(
      makeRoom([{ startMinute: 450, endMinute: 480, startTime: "07:30", endTime: "08:00" }]),
      makeTimeline(6),
      0,
    );
    expect(resolveSelectionEndIndex(states, 0, DEFAULT_MINUTES)).toBe(0);
  });

  test("고를 수 없는 칸에서 시작하면 -1 이다", () => {
    const states = buildSlotStates(
      makeRoom([{ startMinute: 420, endMinute: 450, startTime: "07:00", endTime: "07:30" }]),
      makeTimeline(4),
      0,
    );
    expect(resolveSelectionEndIndex(states, 0, DEFAULT_MINUTES)).toBe(-1);
  });

  test("마지막 칸에서 시작해도 범위를 넘지 않는다", () => {
    const states = buildSlotStates(makeRoom(), makeTimeline(2), 0);
    expect(resolveSelectionEndIndex(states, 1, DEFAULT_MINUTES)).toBe(1);
  });

  test("범위 밖 인덱스는 -1 이다", () => {
    const states = buildSlotStates(makeRoom(), makeTimeline(2), 0);
    expect(resolveSelectionEndIndex(states, -1, DEFAULT_MINUTES)).toBe(-1);
    expect(resolveSelectionEndIndex(states, 99, DEFAULT_MINUTES)).toBe(-1);
  });
});

test.describe("groupRoomsByFloor", () => {
  const resolve = (room) => ({ floorKey: room.key, floorLabel: room.label });

  test("연속된 같은 층은 한 그룹으로 묶는다", () => {
    const groups = groupRoomsByFloor(
      [
        { name: "a", key: "11", label: "11층" },
        { name: "b", key: "11", label: "11층" },
        { name: "c", key: "12", label: "12층" },
      ],
      resolve,
    );

    expect(groups.map((group) => group.rooms.length)).toEqual([2, 1]);
  });

  test("첫 그룹에는 구분선을 긋지 않는다", () => {
    const groups = groupRoomsByFloor([{ name: "a", key: "11", label: "11층" }], resolve);
    expect(groups[0].isFloorDivider).toBe(false);
  });

  test("층이 바뀌는 경계에만 구분선을 긋는다", () => {
    const groups = groupRoomsByFloor(
      [
        { name: "a", key: "11", label: "11층" },
        { name: "b", key: "12", label: "12층" },
      ],
      resolve,
    );
    expect(groups.map((group) => group.isFloorDivider)).toEqual([false, true]);
  });

  test("이름 없는 층이 끼어도 직전의 '이름 있는' 층과 비교한다", () => {
    // 11층 → (이름 없음) → 12층: 마지막 경계에 구분선이 있어야 한다.
    const groups = groupRoomsByFloor(
      [
        { name: "a", key: "11", label: "11층" },
        { name: "x", key: "unknown-1", label: "" },
        { name: "b", key: "12", label: "12층" },
      ],
      resolve,
    );
    expect(groups.map((group) => group.isFloorDivider)).toEqual([false, false, true]);
  });

  test("이름이 같고 키만 다르면 그룹은 나뉘되 구분선은 없다", () => {
    const groups = groupRoomsByFloor(
      [
        { name: "a", key: "k1", label: "11층" },
        { name: "b", key: "k2", label: "11층" },
      ],
      resolve,
    );
    expect(groups).toHaveLength(2);
    expect(groups[1].isFloorDivider).toBe(false);
  });

  test("빈 목록은 빈 그룹이다", () => {
    expect(groupRoomsByFloor([], resolve)).toEqual([]);
  });
});

test.describe("buildSlotTitle", () => {
  const [slot] = makeTimeline(1);

  // 툴팁은 예약이 있는 칸에만 뜬다(radar-grid). 그래서 화면에 이미 있는
  // 정보(방 이름·슬롯 시간대·지난 예약 여부)는 넣지 않고, 색만으로 알 수 없는
  // "예약이 언제부터 언제까지, 누구 것인지"만 남긴다.

  test("예약 시간과 예약자만 보여준다", () => {
    const [state] = buildSlotStates(
      makeRoom([
        { startMinute: 420, endMinute: 480, startTime: "07:00", endTime: "08:00", owner: "아무개" },
      ]),
      [slot],
      0,
    );

    expect(buildSlotTitle(state)).toBe("07:00~08:00 아무개");
  });

  test("슬롯 시간대가 아니라 예약의 실제 시간을 보여준다", () => {
    // 07:00~07:30 칸에 걸린 06:30~07:30 예약. 툴팁에는 예약 쪽 시간이 뜬다.
    const [state] = buildSlotStates(
      makeRoom([{ startMinute: 390, endMinute: 450, startTime: "06:30", endTime: "07:30" }]),
      [slot],
      0,
    );

    expect(buildSlotTitle(state)).toBe("06:30~07:30");
  });

  test("지난 예약도 같은 형식이다 — 지난 것인지는 칸 색이 알려준다", () => {
    const [state] = buildSlotStates(
      makeRoom([
        { startMinute: 420, endMinute: 480, startTime: "07:00", endTime: "08:00", owner: "아무개" },
      ]),
      [slot],
      600,
    );

    expect(buildSlotTitle(state)).toBe("07:00~08:00 아무개");
  });

  test("예약이 겹치면 두 건까지, 줄을 바꿔 보여준다", () => {
    const [state] = buildSlotStates(
      makeRoom([
        { startMinute: 420, endMinute: 480, startTime: "07:00", endTime: "08:00", owner: "1번" },
        { startMinute: 420, endMinute: 480, startTime: "07:00", endTime: "08:00", owner: "2번" },
        { startMinute: 420, endMinute: 480, startTime: "07:00", endTime: "08:00", owner: "3번" },
      ]),
      [slot],
      0,
    );

    expect(buildSlotTitle(state)).toBe("07:00~08:00 1번\n07:00~08:00 2번");
  });

  test("예약이 없으면 빈 문자열이다(툴팁 자체가 안 뜬다)", () => {
    const [state] = buildSlotStates(makeRoom(), [slot], 0);
    expect(buildSlotTitle(state)).toBe("");
  });
});
