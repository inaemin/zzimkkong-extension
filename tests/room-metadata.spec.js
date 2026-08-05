import { expect, test } from "@playwright/test";

import {
  getRoomTags,
  getTargetRoomMetadata,
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
