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
  ],
  web_accessible_resources: [
    {
      resources: [
        "src/page-hook/shared.js",
        "src/page-network-hook.js",
        "src/page-network-restore.js",
        "assets/basecoat-dialog.css",
      ],
      matches: [LMS_WEB_ORIGIN],
    },
  ],
  host_permissions: [LMS_WEB_ORIGIN, LMS_API_ORIGIN],
});
