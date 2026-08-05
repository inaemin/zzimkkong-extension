import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

// 루트의 floor_map_<N>F.svg 들을 data-URI 로 인라인한
// src/features/radar/floor-maps.js 를 생성한다.
// SVG 를 수정한 뒤 `node scripts/generate-floor-maps.mjs` 로 다시 만든다.

// 실행 위치(cwd)에 의존하지 않도록, 스크립트 파일 기준으로 저장소 루트를 계산한다.
// (scripts/ 의 상위가 루트)
const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const rootDir = path.resolve(scriptDir, "..");
const floors = [11, 12, 13];
const outputPath = path.join(rootDir, "src/features/radar/floor-maps.js");

const map = {};
for (const floor of floors) {
  const svgPath = path.join(rootDir, `floor_map_${floor}F.svg`);
  const raw = fs
    .readFileSync(svgPath, "utf8")
    .replace(/<\?xml[^>]*\?>\s*/i, "") // data-URI 에 XML 선언은 불필요
    .replace(/\s+/g, " ") // 공백 축소로 용량 절감
    .trim();
  map[floor] = `data:image/svg+xml,${encodeURIComponent(raw)}`;
}

const body = `// 층별 평면도(SVG) 데이터. floor_map_<N>F.svg 를 data-URI 로 인라인해 격리한다.
// <img src> 로 렌더하면 SVG 내부 <style>(.wall/.label 등 범용 클래스)이 페이지 CSS 와
// 완전히 분리되어 오염되지 않는다. 외부 로드가 없어 CSP/원격코드 정책과도 일관.
//
// 재생성: 루트의 floor_map_11F.svg / 12F / 13F 를 수정한 뒤
//   node scripts/generate-floor-maps.mjs
// 로 이 파일을 다시 만든다.
(function () {
  if (globalThis.__zzkFloorMaps) {
    return;
  }
  const FLOOR_MAP_DATA_URIS = ${JSON.stringify(map, null, 2)};
  function getFloorMapDataUri(floor) {
    const key = String(Number(floor));
    return Object.prototype.hasOwnProperty.call(FLOOR_MAP_DATA_URIS, key)
      ? FLOOR_MAP_DATA_URIS[key]
      : null;
  }
  function getAvailableFloorMapFloors() {
    return Object.keys(FLOOR_MAP_DATA_URIS)
      .map((value) => Number(value))
      .filter((value) => Number.isInteger(value))
      .sort((a, b) => a - b);
  }
  globalThis.__zzkFloorMaps = {
    getFloorMapDataUri,
    getAvailableFloorMapFloors,
  };
})();
`;

fs.writeFileSync(outputPath, body);
console.log(`Generated ${path.relative(rootDir, outputPath)}`);
