import { defineConfig, devices } from "@playwright/test";

export default defineConfig({
  // 확장 번들은 워커별이 아니라 전체에서 한 번만 빌드한다(tests/global-setup.js 참고).
  globalSetup: "./tests/global-setup.js",
  use: {
    ...devices["Desktop Chrome"],
    channel: "chrome",
  },
});
