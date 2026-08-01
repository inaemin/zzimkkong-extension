import { defineManifest } from "@crxjs/vite-plugin";
import pkg from "./package.json" with { type: "json" };

const LMS_WEB_ORIGIN = "https://techcourse-lms-plus-web.woowahan.com/*";
const LMS_API_ORIGIN = "https://techcourse-lms-plus-api.woowahan.com/*";

export default defineManifest({
  manifest_version: 3,
  name: "찜꽁 레이더",
  version: pkg.version,
  description:
    "우아한테크코스 공간 예약에서 시간대별 회의실·페어룸 현황을 레이더로 한눈에 보고, 예약까지 빠르게 완료하세요.",
  icons: {
    16: "icons/icon16.png",
    24: "icons/icon24.png",
    32: "icons/icon32.png",
    48: "icons/icon48.png",
    128: "icons/icon128.png",
  },
  background: {
    service_worker: "src/background.js",
  },
  content_scripts: [
    {
      matches: [LMS_WEB_ORIGIN],
      // 전역 기반 IIFE 들을 순서대로 import 하는 단일 진입점.
      // 로드 순서는 src/content-bundle.js 안에서 관리한다.
      js: ["src/content-bundle.js"],
      run_at: "document_idle",
    },
    {
      matches: [LMS_WEB_ORIGIN],
      // 예약 네트워크 훅은 페이지의 fetch/XHR 을 패치해야 하므로 MAIN world 에서 돈다.
      // document_start 로 페이지 앱보다 먼저 떠야 초기 요청을 놓치지 않는다.
      js: ["src/page-hook-bundle.js"],
      world: "MAIN",
      run_at: "document_start",
    },
  ],
  web_accessible_resources: [
    {
      // 훅은 이제 content script 로 실행되므로 공개할 필요가 없다.
      // Slack 모달 스타일만 런타임에 URL 로 불러온다.
      resources: ["assets/basecoat-dialog.css"],
      matches: [LMS_WEB_ORIGIN],
    },
  ],
  host_permissions: [LMS_WEB_ORIGIN, LMS_API_ORIGIN],
});
