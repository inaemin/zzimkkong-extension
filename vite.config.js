import path from "node:path";
import { defineConfig } from "vite";
import { crx } from "@crxjs/vite-plugin";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import manifest from "./manifest.config.ts";

export default defineConfig({
  plugins: [react(), tailwindcss(), crx({ manifest })],
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
});
