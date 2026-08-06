import { execFileSync } from "node:child_process";

// 확장 번들은 테스트 전체에서 한 번만 빌드한다.
//
// 워커별로 빌드하면 emptyOutDir 로 dist 를 비우는 순간 다른 워커가 그 파일을
// 읽다가 깨진다("Failed to fetch dynamically imported module"). 워커 안에서만
// 중복을 막는 것으로는 부족해서 글로벌 셋업으로 올린다.
export default function globalSetup() {
  execFileSync("npx", ["vite", "build"], { cwd: process.cwd(), stdio: "pipe" });
}
