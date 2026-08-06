// 개발 빌드 플래그.
//
// 빌드할 때 vite 가 리터럴(true/false)로 치환한다. 배포 빌드에는 false 가
// 박히므로 이 상수로 감싼 분기는 실행되지 않는다.
//
// 지금은 build.minify 가 false 라 코드 자체는 번들에 남는다. minify 를 켜면
// 그때 dead code 로 제거된다.
//
//   npm run build      → 배포용. DEV_BUILD = false
//   npm run build:dev  → 개발용. DEV_BUILD = true
//   npm run dev        → 개발 서버. DEV_BUILD = true
declare const __ZZK_DEV_BUILD__: boolean;

/** 개발 빌드인가. 배포 빌드에서는 항상 false. */
export const DEV_BUILD: boolean =
  typeof __ZZK_DEV_BUILD__ === "boolean" ? __ZZK_DEV_BUILD__ : false;

// 페이지가 미리 심어두는 런타임 플래그. 테스트 하네스가 쓴다.
declare global {
  var __ZZK_DEBUG_MODE__: boolean | undefined;
}

/**
 * 디버그 로그·테스트 훅을 켤지.
 *
 * 개발 빌드면 항상 켜고, 배포 빌드에서도 페이지가 플래그를 심어두면 켠다
 * (실제 사이트에서 문제를 재현할 때 쓴다).
 */
export const DEBUG_MODE: boolean = DEV_BUILD || globalThis.__ZZK_DEBUG_MODE__ === true;
