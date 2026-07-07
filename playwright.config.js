import { defineConfig, devices } from "@playwright/test";

export default defineConfig({
  use: {
    ...devices["Desktop Chrome"],
    channel: "chrome",
  },
});
