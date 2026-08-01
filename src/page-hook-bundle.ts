// MAIN world content script 진입점.
//
// 페이지 앱이 쓰는 fetch/XMLHttpRequest 를 패치하려면 isolated world 가 아니라
// 페이지와 같은 실행 환경(MAIN world)에 있어야 한다. manifest 의 world: "MAIN"
// 으로 크롬이 직접 실행해준다.
//
// page-network-hook 이 page-hook/shared 를 import 하므로 순서는 번들러가 잡는다.
import "./page-network-hook.js";
