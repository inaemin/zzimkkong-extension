import path from "node:path";
import { defineConfig } from "vite";
import { crx } from "@crxjs/vite-plugin";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import manifest from "./manifest.config.ts";

export default defineConfig(({ mode }) => ({
  plugins: [react(), tailwindcss(), crx({ manifest })],
  define: {
    // 개발 빌드에서만 켜지는 플래그. 배포 빌드(`npm run build`)에는 false 가
    // 리터럴로 박힌다(minify 를 켜면 그 분기는 dead code 로 제거된다).
    //
    // 켜지는 조건: `npm run dev`, `npm run build:dev`, `vite build --mode development`
    __ZZK_DEV_BUILD__: JSON.stringify(mode !== "production"),
  },
  resolve: {
    alias: {
      "@": path.resolve(import.meta.dirname, "./src"),
    },
  },
  build: {
    outDir: "dist/extension",
    emptyOutDir: true,
    // 아직 전역/DOM 조립 코드가 많이 남아 있어 난독화된 이름이 디버깅을
    // 어렵게 만든다. UI 전환이 끝나는 5단계에서 켠다.
    minify: false,
  },
}));
