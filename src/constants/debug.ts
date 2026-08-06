// 테스트/개발 중에만 켠다. 페이지가 미리 심어두는 플래그를 읽는다.
declare global {
  // eslint-disable-next-line no-var
  var __ZZK_DEBUG_MODE__: boolean | undefined;
}

export const DEBUG_MODE: boolean = globalThis.__ZZK_DEBUG_MODE__ === true;
