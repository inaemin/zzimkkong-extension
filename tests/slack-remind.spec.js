import { expect, test } from "@playwright/test";

import {
  buildSlackRemindCommand,
  formatSlackFloorLabel,
  resolveSlackRemindLocationLabel,
  resolveSlackRemindSubjectLabel,
  resolveSlackRemindTimeRangeLabel,
} from "../src/features/slack/shared.ts";

// Slack /remind 명령 조립. content.ts 안에 있을 때는 모달을 실제로 띄워야
// 확인할 수 있었다. 사용자가 그대로 복사해 붙여넣는 문자열이라 형식이 중요하다.

const FULL = {
  date: "2026-08-10",
  startTime: "09:00",
  endTime: "10:00",
  description: "스프린트 회의",
  roomName: "11층 보이저",
  reminderLeadMinutes: 10,
};

test.describe("buildSlackRemindCommand", () => {
  test("채널을 주면 그 채널에 @channel 로 보낸다", () => {
    expect(buildSlackRemindCommand(FULL, "#dev")).toBe(
      '/remind #dev "09:00-10:00 스프린트 회의 at 12F 보이저 @channel" on 2026-08-10 at 08:50',
    );
  });

  test("채널이 없으면 me 에게 보낸다", () => {
    const command = buildSlackRemindCommand(FULL, "");
    expect(command.startsWith('/remind me "')).toBe(true);
    expect(command).not.toContain("@channel");
  });

  test("예약 시각을 모르면 HH:MM 자리만 둔다", () => {
    expect(buildSlackRemindCommand({ startTime: "09:00", endTime: "10:00" }, "")).toBe(
      '/remind me "09:00-10:00 회의 at 회의실" at HH:MM',
    );
  });

  test("리마인더는 시작 시각보다 앞선다", () => {
    const command = buildSlackRemindCommand(FULL, "#dev");
    // 09:00 시작에 10분 전 → 08:50
    expect(command).toContain("at 08:50");
  });

  test("제목의 큰따옴표는 이스케이프한다", () => {
    // 이스케이프하지 않으면 Slack 이 명령을 중간에서 끊는다.
    const command = buildSlackRemindCommand({ ...FULL, description: '"긴급" 회의' }, "");
    expect(command).toContain('\\"긴급\\"');
  });
});

test.describe("resolveSlackRemindTimeRangeLabel", () => {
  test("시작-종료를 붙인다", () => {
    expect(resolveSlackRemindTimeRangeLabel({ startTime: "09:00", endTime: "10:30" })).toBe(
      "09:00-10:30",
    );
  });

  test("읽을 수 없으면 자리만 채운다", () => {
    expect(resolveSlackRemindTimeRangeLabel({})).toBe("--:-----:--");
    expect(resolveSlackRemindTimeRangeLabel({ startTime: "09:00" })).toBe("09:00---:--");
  });
});

test.describe("resolveSlackRemindSubjectLabel", () => {
  test("설명이 있으면 그대로 쓴다", () => {
    expect(resolveSlackRemindSubjectLabel({ description: "스프린트 회의" })).toBe("스프린트 회의");
  });

  test("비었거나 자리표시자면 '회의' 다", () => {
    expect(resolveSlackRemindSubjectLabel({})).toBe("회의");
    expect(resolveSlackRemindSubjectLabel({ description: "-" })).toBe("회의");
    expect(resolveSlackRemindSubjectLabel({ description: "   " })).toBe("회의");
  });
});

test.describe("resolveSlackRemindLocationLabel", () => {
  test("이름에 층이 붙어 와도 떼어낸다", () => {
    // "11층 보이저" → 층은 따로, 방 이름만 남긴다.
    expect(resolveSlackRemindLocationLabel({ roomName: "11층 보이저" })).toContain("보이저");
    expect(resolveSlackRemindLocationLabel({ roomName: "11층 보이저" })).not.toContain(
      "11층 보이저",
    );
  });

  test("방 이름이 없으면 '회의실' 이다", () => {
    expect(resolveSlackRemindLocationLabel({})).toBe("회의실");
    expect(resolveSlackRemindLocationLabel({ roomName: "-" })).toBe("회의실");
  });
});

test.describe("formatSlackFloorLabel", () => {
  test("'11층' 을 '11F' 로 바꾼다", () => {
    expect(formatSlackFloorLabel("11층")).toBe("11F");
    expect(formatSlackFloorLabel("11 층")).toBe("11F");
  });

  test("형식이 다르면 그대로 둔다", () => {
    expect(formatSlackFloorLabel("지하")).toBe("지하");
    expect(formatSlackFloorLabel("")).toBe("");
  });
});
