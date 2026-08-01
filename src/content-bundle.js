// content script 번들 진입점.
//
// 소스가 아직 전역(globalThis.__zzk*) 기반 IIFE 라 각 파일이 import/export 를
// 쓰지 않는다. 번들러에게는 의존 관계가 안 보이므로, manifest 에 17개를 나열하는
// 대신 여기서 순서대로 import 해 하나의 청크로 만든다.
//
// !! 순서가 곧 의존성 순서다. 각 파일이 자기 API 를 globalThis 에 올리고
// 뒤 파일이 그걸 읽으므로, 순서를 바꾸면 부트스트랩이 깨진다.
// (tests/setup-smoke.spec.js 가 이 순서를 검증한다)
import "./constants/debug.js";
import "./utils/shared.js";
import "./utils/storage.js";
import "./constants/runtime.js";
import "./utils/date-time.js";
import "./utils/routes.js";
import "./features/slack/shared.js";
import "./features/slack/workflow.js";
import "./features/slack/success-flow.js";
import "./features/form-fields/shared.js";
import "./services/lms-data/normalizers.js";
import "./services/lms-data/shared.js";
import "./features/radar/floor-maps.js";
import "./features/radar/shared.js";
import "./features/radar/workflow.js";
import "./features/radar/form-sync.js";
import "./content.js";
