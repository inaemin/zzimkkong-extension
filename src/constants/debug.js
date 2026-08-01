export const DEBUG_MODE = globalThis.__ZZK_DEBUG_MODE__ === true;

// content.js 등 아직 전역을 읽는 소비처를 위해 이중 등록한다.
// 소비처가 전부 import 로 옮겨지면 이 줄만 지우면 된다.
globalThis.__zzkDebugConfig = {
  DEBUG_MODE,
  source: "globalThis.__ZZK_DEBUG_MODE__",
};
