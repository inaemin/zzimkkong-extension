// MAIN world content script 진입점.
//
// 페이지 앱이 쓰는 fetch/XMLHttpRequest 를 패치하려면 isolated world 가 아니라
// 페이지와 같은 실행 환경(MAIN world)에 있어야 한다. 예전에는 content script 가
// <script src=chrome.runtime.getURL(...)> 를 주입해 이걸 우회했지만,
// manifest 의 world: "MAIN" 으로 크롬이 직접 실행해준다.
//
// 순서: shared 가 globalThis.__zzkPageHookShared 를 올리고 hook 이 그걸 읽는다.
import "./page-hook/shared.js";
import "./page-network-hook.js";
