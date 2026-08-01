// content script 번들 진입점(isolated world).
//
// 예전에는 여기서 17개 파일을 순서대로 import 했다. 소스가 전역
// (globalThis.__zzk*) 기반 IIFE 라 "로드 순서 = 의존성 순서" 였기 때문이다.
// 2.5-A 에서 모듈 그래프로 바꾼 뒤로는 번들러가 순서를 직접 판단하므로
// 진입점 하나만 가리키면 된다.
import "./content.js";
