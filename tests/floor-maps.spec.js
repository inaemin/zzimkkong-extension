import path from "node:path";
import { pathToFileURL } from "node:url";
import { expect, test } from "@playwright/test";

// floor-maps.js 는 IIFE 로 globalThis.__zzkFloorMaps 에 API 를 붙인다.
// 브라우저 DOM 이 필요 없으므로 Node 컨텍스트에서 직접 로드해 검증한다.
async function loadFloorMaps() {
  const modulePath = path.resolve(process.cwd(), "src/features/radar/floor-maps.js");
  await import(pathToFileURL(modulePath).href);
  return globalThis.__zzkFloorMaps;
}

test("각 층 평면도 data-URI 가 정상 SVG 로 디코딩된다", async () => {
  const floorMaps = await loadFloorMaps();
  const floors = floorMaps.getAvailableFloorMapFloors();
  expect(floors).toEqual([11, 12, 13]);

  for (const floor of floors) {
    const uri = floorMaps.getFloorMapDataUri(floor);
    // data-URI 형식이어야 한다(외부 로드 없음).
    expect(uri.startsWith("data:image/svg+xml,")).toBe(true);

    // URI 를 디코딩하면 온전한 SVG 여야 한다(인코딩/오탈자 회귀 감지).
    const svg = decodeURIComponent(uri.slice("data:image/svg+xml,".length));
    expect(svg).toMatch(/^<svg[\s>]/);
    expect(svg.trimEnd().endsWith("</svg>")).toBe(true);
    // 각 층 라벨이 들어있어야 한다(디코딩 정합성).
    expect(svg).toContain(`${floor}F floor map`);
  }
});

test("평면도 페어룸 라벨이 '페 N' 으로 표기된다(패 → 페 오타 회귀 방지)", async () => {
  const floorMaps = await loadFloorMaps();

  // 12F: 페7~14, 13F: 페1~6. (11F 는 페어룸 라벨 없음)
  const expectedPodLabels = {
    12: [7, 8, 9, 10, 11, 12, 13, 14].map((n) => `페 ${n}`),
    13: [1, 2, 3, 4, 5, 6].map((n) => `페 ${n}`),
  };

  for (const floor of floorMaps.getAvailableFloorMapFloors()) {
    const svg = decodeURIComponent(
      floorMaps.getFloorMapDataUri(floor).slice("data:image/svg+xml,".length),
    );
    // 어느 층에도 '패' 라벨(오타)이 남아있으면 안 된다.
    expect(svg).not.toContain(">패 ");
    // 해당 층의 페어룸 라벨이 '페 N' 으로 정확히 들어있어야 한다.
    for (const label of expectedPodLabels[floor] ?? []) {
      expect(svg).toContain(`>${label}<`);
    }
  }
});

test("평면도 SVG 에 non-scaling-stroke 가 없어 확대 시 선 굵기도 함께 커진다", async () => {
  const floorMaps = await loadFloorMaps();
  for (const floor of floorMaps.getAvailableFloorMapFloors()) {
    const svg = decodeURIComponent(
      floorMaps.getFloorMapDataUri(floor).slice("data:image/svg+xml,".length),
    );
    // non-scaling-stroke 가 다시 들어오면 확대해도 선이 얇게 고정된다(회귀 방지).
    expect(svg).not.toContain("non-scaling-stroke");
  }
});
