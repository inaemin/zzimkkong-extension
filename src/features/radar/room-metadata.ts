// 방 이름 → 층·태그 메타데이터 조회.
//
// lms+ 가 내려주는 값(floorLabel)을 우선하고, 없으면 하드코딩된 표를 본다.
// DOM 을 만지지 않는 순수 조회라 모듈로 뺐다.

import {
  MAP_CALENDAR_ROOM_FLOOR_BY_NAME,
  ROOM_TAG_METADATA_BY_KEY,
  TARGET_ROOM_METADATA_BY_NORMALIZED_NAME,
  normalizeRoomTagKey,
  normalizeTargetRoomName,
} from "../../constants/runtime.js";
import type { RoomTagMetadata } from "../../constants/runtime.js";

/** 방 객체 또는 방 이름 문자열. 호출부가 둘 다 넘긴다. */
type RoomOrName =
  string | { id?: unknown; name?: unknown; floorLabel?: unknown } | null | undefined;

/** 층 그룹을 나눌 때 쓰는 키와 표시 이름. */
export interface RoomFloor {
  floorLabel: string;
  /** 같은 층이면 같은 키. 층을 모르면 방마다 다른 키를 줘서 묶이지 않게 한다. */
  floorKey: string;
}

function readRoomName(roomOrName: RoomOrName): string {
  if (typeof roomOrName === "string") {
    return roomOrName;
  }
  return typeof roomOrName?.name === "string" ? roomOrName.name : "";
}

export function getTargetRoomMetadata(roomOrName: RoomOrName) {
  const normalizedName = normalizeTargetRoomName(readRoomName(roomOrName));
  return TARGET_ROOM_METADATA_BY_NORMALIZED_NAME.get(normalizedName) ?? null;
}

/**
 * 방이 속한 층.
 *
 * 서버가 floorLabel 을 주면 그걸 쓰고, 없으면 이름으로 표에서 찾는다.
 * 둘 다 없으면 방마다 다른 키를 줘서 "모르는 층"끼리 묶이지 않게 한다.
 */
export function resolveMapCalendarRoomFloor(roomOrName: RoomOrName): RoomFloor {
  const roomName = readRoomName(roomOrName).trim();
  const room = typeof roomOrName === "string" ? null : roomOrName;

  const serverFloor =
    typeof room?.floorLabel === "string" && room.floorLabel.trim() !== ""
      ? room.floorLabel.trim()
      : "";
  const mappedFloor =
    serverFloor || MAP_CALENDAR_ROOM_FLOOR_BY_NAME.get(normalizeTargetRoomName(roomName)) || "";

  const roomId = Number(room?.id);
  const fallbackRoomKey = Number.isFinite(roomId) ? String(roomId) : roomName || "unknown-room";

  return {
    floorLabel: mappedFloor,
    floorKey: mappedFloor || `unknown-${fallbackRoomKey}`,
  };
}

/** 방에 붙일 배지들. 같은 태그가 두 번 들어가지 않는다. */
export function getRoomTags(roomOrName: RoomOrName): RoomTagMetadata[] {
  const metadata = getTargetRoomMetadata(roomOrName);
  if (!metadata || !Array.isArray(metadata.tags)) {
    return [];
  }

  const seenKeys = new Set<string>();
  return metadata.tags.reduce<RoomTagMetadata[]>((acc, tagKey) => {
    const tagMetadata = ROOM_TAG_METADATA_BY_KEY.get(normalizeRoomTagKey(tagKey));
    if (!tagMetadata || seenKeys.has(tagMetadata.key)) {
      return acc;
    }
    seenKeys.add(tagMetadata.key);
    return [...acc, tagMetadata];
  }, []);
}
