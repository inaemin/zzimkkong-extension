import { defineConfig } from "vite";
import { crx } from "@crxjs/vite-plugin";
import manifest from "./manifest.config.js";

export default defineConfig({
  plugins: [crx({ manifest })],
  build: {
    outDir: "dist/extension",
    emptyOutDir: true,
    // 소스가 아직 전역(globalThis.__zzk*) 기반이라 난독화된 이름이
    // 디버깅을 어렵게 만든다. 번들만 도입하는 단계라 압축은 끄고 간다.
    minify: false,
  },
});
