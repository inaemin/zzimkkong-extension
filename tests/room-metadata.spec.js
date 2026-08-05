import { expect, test } from "@playwright/test";

import {
  compareRoomsForRadar,
  filterRoomsBySpaceTab,
  getRoomKind,
  getRoomTags,
  getTargetRoomMetadata,
  inferRoomKindFromName,
  resolveMapCalendarRoomFloor,
} from "../src/features/radar/room-metadata.ts";

// 방 이름 → 층·태그 조회. content.ts 안에 있을 때는 렌더 결과로만 확인할 수
// 있었다. 층 그룹이 어긋나면 그리드 구분선이 엉뚱한 자리에 그려진다.

test.describe("resolveMapCalendarRoomFloor", () => {
  test("서버가 준 floorLabel 을 우선한다", () => {
    const floor = resolveMapCalendarRoomFloor({ id: 5, name: "보이저", floorLabel: "11층" });
    expect(floor.floorLabel).toBe("11층");
    expect(floor.floorKey).toBe("11층");
  });

  test("floorLabel 의 앞뒤 공백은 다듬는다", () => {
    expect(
      resolveMapCalendarRoomFloor({ id: 5, name: "보이저", floorLabel: "  11층  " }).floorLabel,
    ).toBe("11층");
  });

  test("층을 모르면 방마다 다른 키를 준다", () => {
    // 같은 키를 주면 "모르는 층"끼리 한 그룹으로 묶여 버린다.
    const a = resolveMapCalendarRoomFloor({ id: 1, name: "알수없는방A" });
    const b = resolveMapCalendarRoomFloor({ id: 2, name: "알수없는방B" });
    expect(a.floorLabel).toBe("");
    expect(b.floorLabel).toBe("");
    expect(a.floorKey).not.toBe(b.floorKey);
  });

  test("id 가 없으면 이름으로 키를 만든다", () => {
    const floor = resolveMapCalendarRoomFloor({ name: "알수없는방" });
    expect(floor.floorKey).toContain("알수없는방");
  });

  test("이름도 id 도 없으면 고정 키로 떨어진다", () => {
    expect(resolveMapCalendarRoomFloor({}).floorKey).toBe("unknown-unknown-room");
    expect(resolveMapCalendarRoomFloor(null).floorKey).toBe("unknown-unknown-room");
  });

  test("문자열만 넘겨도 동작한다", () => {
    expect(resolveMapCalendarRoomFloor("보이저")).toHaveProperty("floorKey");
  });
});

test.describe("getRoomTags", () => {
  test("메타데이터가 없는 방은 빈 배열이다", () => {
    expect(getRoomTags("존재하지않는방")).toEqual([]);
    expect(getRoomTags(null)).toEqual([]);
  });

  test("돌려주는 태그마다 key 가 있다", () => {
    const metadata = getTargetRoomMetadata("보이저");
    // 태그가 있는 방이면 각 항목이 key 를 갖는다.
    for (const tag of getRoomTags("보이저")) {
      expect(tag).toHaveProperty("key");
    }
    // 메타데이터가 있으면 tags 도 배열이다.
    if (metadata) {
      expect(Array.isArray(metadata.tags ?? [])).toBe(true);
    }
  });

  test("같은 태그가 두 번 들어가지 않는다", () => {
    const tags = getRoomTags("보이저");
    const keys = tags.map((tag) => tag.key);
    expect(new Set(keys).size).toBe(keys.length);
  });
});

test.describe("getTargetRoomMetadata", () => {
  test("모르는 방은 null 이다", () => {
    expect(getTargetRoomMetadata("존재하지않는방")).toBeNull();
    expect(getTargetRoomMetadata(null)).toBeNull();
    expect(getTargetRoomMetadata(undefined)).toBeNull();
  });

  test("방 객체와 이름 문자열을 모두 받는다", () => {
    expect(getTargetRoomMetadata("보이저")).toEqual(getTargetRoomMetadata({ name: "보이저" }));
  });
});

// 레이더 표시 순서·탭 분류. content.ts 의 renderMapCalendarOverlay 안에
// 인라인으로 있던 것을 뺐다. 순서가 어긋나면 층 구분선이 엉뚱한 데 그려진다.

test.describe("compareRoomsForRadar", () => {
  test("층이 낮은 방이 먼저 온다", () => {
    // 11층 금성 < 12층 보이저
    expect(compareRoomsForRadar({ name: "금성" }, { name: "보이저" })).toBeLessThan(0);
    expect(compareRoomsForRadar({ name: "보이저" }, { name: "금성" })).toBeGreaterThan(0);
  });

  test("같은 층이면 표에 적힌 순서를 따른다", () => {
    // 둘 다 11층. 표에서 금성이 지구보다 앞이다.
    expect(compareRoomsForRadar({ name: "금성" }, { name: "지구" })).toBeLessThan(0);
  });

  test("서버가 층을 내려주면 그걸 먼저 본다", () => {
    // 표만 보면 금성(11층)이 보이저(12층)보다 앞이다. 서버가 보이저를 10층이라
    // 하면 순서가 뒤집혀야 한다 — 표를 보고 있으면 이 단정이 깨진다.
    const moved = { name: "보이저", floorLabel: "10층" };
    expect(compareRoomsForRadar(moved, { name: "금성" })).toBeLessThan(0);
    expect(compareRoomsForRadar({ name: "금성" }, moved)).toBeGreaterThan(0);
  });

  test("모르는 방은 맨 뒤로 간다", () => {
    expect(compareRoomsForRadar({ name: "금성" }, { name: "없는방" })).toBeLessThan(0);
  });

  test("정렬에 넣으면 층 순서대로 늘어선다", () => {
    const sorted = [{ name: "보이저" }, { name: "금성" }, { name: "지구" }]
      .sort(compareRoomsForRadar)
      .map((room) => room.name);
    expect(sorted).toEqual(["금성", "지구", "보이저"]);
  });
});

test.describe("getRoomKind / inferRoomKindFromName", () => {
  test("표에 있으면 표의 분류를 쓴다", () => {
    expect(getRoomKind({ name: "금성" })).toBe("meeting");
    expect(getRoomKind({ name: "페어룸 01" })).toBe("pair");
  });

  test("표에 없는 '페' 이름만 추론으로 pair 가 된다", () => {
    // 지금 표에 있는 방은 이름 추론과 분류가 모두 일치한다. 그래서 둘 중
    // 무엇이 이기는지는 표에 없는 이름으로만 구분된다 — 추론이 담당하는
    // 범위가 '표에 없는 방'뿐이라는 것을 고정한다.
    expect(getRoomKind({ name: "페어룸 99" })).toBe("pair");
    expect(getRoomKind({ name: "새로운방" })).toBe("meeting");
  });

  test("표에 없으면 이름으로 추론한다", () => {
    // '페' 로 시작하면 페어룸으로 본다.
    expect(inferRoomKindFromName("페어룸 99")).toBe("pair");
    expect(inferRoomKindFromName("새회의실")).toBe("meeting");
  });
});

test.describe("filterRoomsBySpaceTab", () => {
  const rooms = [{ name: "금성" }, { name: "페어룸 01" }, { name: "보이저" }];

  test("고른 탭에 속한 방만 남긴다", () => {
    expect(filterRoomsBySpaceTab(rooms, "meeting").map((room) => room.name)).toEqual([
      "금성",
      "보이저",
    ]);
    expect(filterRoomsBySpaceTab(rooms, "pair").map((room) => room.name)).toEqual(["페어룸 01"]);
  });

  test("배열이 아니면 빈 배열이다", () => {
    expect(filterRoomsBySpaceTab(null, "meeting")).toEqual([]);
  });
});
