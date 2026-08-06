import { expect, test } from "@playwright/test";

import {
  buildScheduleScopeKey,
  clearAvailabilityCache,
  readAvailabilityCache,
  readScheduleCache,
  writeAvailabilityCache,
  writeScheduleCache,
} from "../src/features/radar/schedule-cache.ts";

// 스케줄·예약현황 캐시.
//
// content.ts 안에 있을 때는 TTL 이 지난 뒤의 동작을 확인할 방법이 없었다.
// state 를 인자로 받게 바꿔서, 가짜 state 로 만료·스코프 규칙을 직접 본다.
//
// 캐시가 틀리면 남의 예약이 남아 보이거나(스코프 섞임) 매번 다시 요청한다.

/** content.ts 의 state 중 캐시가 쓰는 부분만. */
function makeState() {
  return {
    scheduleCache: new Map(),
    scheduleCacheFetchedAtByDate: new Map(),
    availabilityCache: new Map(),
    availabilityCacheFetchedAt: new Map(),
    availabilityInflightByToken: new Map(),
  };
}

const SCOPE = { date: "2026-08-10", tab: "meeting", sharingMapId: "abc" };
const SCHEDULE = { rooms: [{ id: 1 }] };

test.describe("buildScheduleScopeKey", () => {
  test("맵·날짜·탭을 모두 키에 넣는다", () => {
    const key = buildScheduleScopeKey(SCOPE);
    expect(key).toContain("abc");
    expect(key).toContain("2026-08-10");
  });

  test("맵이 다르면 키도 다르다", () => {
    // 섞이면 다른 지점의 예약 현황을 보여주게 된다.
    expect(buildScheduleScopeKey(SCOPE)).not.toBe(
      buildScheduleScopeKey({ ...SCOPE, sharingMapId: "xyz" }),
    );
  });

  test("탭이 다르면 키도 다르다", () => {
    // 회의실 탭과 페어룸 탭은 조회 결과가 다르다. 섞이면 안 된다.
    expect(buildScheduleScopeKey(SCOPE)).not.toBe(buildScheduleScopeKey({ ...SCOPE, tab: "pair" }));
  });

  test("모르는 탭은 회의실 탭으로 친다", () => {
    // 아는 탭은 둘뿐이다. 나머지는 기본값으로 모아 캐시를 쪼개지 않는다.
    expect(buildScheduleScopeKey({ ...SCOPE, tab: "알수없음" })).toBe(
      buildScheduleScopeKey({ ...SCOPE, tab: "meeting" }),
    );
  });

  test("맵 id 가 없으면 빈 키다", () => {
    // 캐시하지 않는 편이 남의 맵 결과를 재사용하는 것보다 안전하다.
    expect(buildScheduleScopeKey({ ...SCOPE, sharingMapId: "" })).toBe("");
    expect(buildScheduleScopeKey({ ...SCOPE, sharingMapId: null })).toBe("");
  });

  test("날짜가 날짜 형식이 아니면 빈 키다", () => {
    expect(buildScheduleScopeKey({ ...SCOPE, date: "" })).toBe("");
    expect(buildScheduleScopeKey({ ...SCOPE, date: "내일" })).toBe("");
  });
});

test.describe("스케줄 캐시", () => {
  test("쓴 것을 그대로 읽는다", () => {
    const state = makeState();
    writeScheduleCache(state, SCOPE, SCHEDULE);
    expect(readScheduleCache(state, SCOPE)).toEqual(SCHEDULE);
  });

  test("빈 결과도 캐시로 인정한다", () => {
    // 예약이 하나도 없는 날은 rooms 가 빈 배열이다. 이걸 '캐시 없음'으로
    // 치면 한가한 날마다 매번 다시 요청하게 된다.
    const state = makeState();
    writeScheduleCache(state, SCOPE, { rooms: [] });
    expect(readScheduleCache(state, SCOPE)).toEqual({ rooms: [] });
  });

  test("스코프가 다르면 못 읽는다", () => {
    const state = makeState();
    writeScheduleCache(state, SCOPE, SCHEDULE);
    expect(readScheduleCache(state, { ...SCOPE, date: "2026-08-11" })).toBeNull();
    expect(readScheduleCache(state, { ...SCOPE, sharingMapId: "xyz" })).toBeNull();
  });

  test("TTL 이 지나면 못 읽고, 지워진다", () => {
    const state = makeState();
    writeScheduleCache(state, SCOPE, SCHEDULE);
    const key = buildScheduleScopeKey(SCOPE);
    // 아주 옛날에 받아온 것으로 위조한다.
    state.scheduleCacheFetchedAtByDate.set(key, Date.now() - 60 * 60 * 1000);

    expect(readScheduleCache(state, SCOPE)).toBeNull();
    // 만료분은 남겨두지 않는다.
    expect(state.scheduleCache.has(key)).toBe(false);
  });

  test("받아온 시각을 모르면 만료로 친다", () => {
    const state = makeState();
    const key = buildScheduleScopeKey(SCOPE);
    state.scheduleCache.set(key, SCHEDULE);
    // fetchedAt 이 없다 = 언제 받았는지 모른다 → 믿지 않는다.
    expect(readScheduleCache(state, SCOPE)).toBeNull();
  });

  test("키를 만들 수 없으면 쓰지 않는다", () => {
    const state = makeState();
    writeScheduleCache(state, { ...SCOPE, sharingMapId: "" }, SCHEDULE);
    expect(state.scheduleCache.size).toBe(0);
  });

  test("결과가 없으면 쓰지 않는다", () => {
    const state = makeState();
    writeScheduleCache(state, SCOPE, null);
    expect(state.scheduleCache.size).toBe(0);
  });
});

test.describe("예약현황 캐시", () => {
  test("쓴 것을 그대로 읽는다", () => {
    const state = makeState();
    writeAvailabilityCache(state, "token-1", { ok: true });
    expect(readAvailabilityCache(state, "token-1")).toEqual({ ok: true });
  });

  test("모르는 토큰은 null 이다", () => {
    expect(readAvailabilityCache(makeState(), "없는토큰")).toBeNull();
  });

  test("TTL 이 지나면 못 읽고, 지워진다", () => {
    const state = makeState();
    writeAvailabilityCache(state, "token-1", { ok: true });
    state.availabilityCacheFetchedAt.set("token-1", Date.now() - 60 * 60 * 1000);

    expect(readAvailabilityCache(state, "token-1")).toBeNull();
    expect(state.availabilityCache.has("token-1")).toBe(false);
  });

  test("비우면 진행 중인 요청 기록까지 같이 지운다", () => {
    // 예약을 새로 잡은 직후엔 TTL 을 기다리면 안 된다. 이때 inflight 를
    // 남겨두면 다음 요청이 '이미 요청 중'으로 보고 낡은 값을 기다린다.
    const state = makeState();
    writeAvailabilityCache(state, "token-1", { ok: true });
    state.availabilityInflightByToken.set("token-1", Promise.resolve());

    clearAvailabilityCache(state);

    expect(state.availabilityCache.size).toBe(0);
    expect(state.availabilityCacheFetchedAt.size).toBe(0);
    expect(state.availabilityInflightByToken.size).toBe(0);
  });
});
