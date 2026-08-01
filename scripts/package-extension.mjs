import { spawnSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import process from "node:process";

// Vite 빌드 산출물(dist/extension)을 웹스토어 업로드용 zip 으로 묶는다.
// 소스를 직접 압축하던 예전 방식과 달리, 번들된 결과만 담는다.

const rootDir = process.cwd();
const buildDir = path.join(rootDir, "dist", "extension");
const distDir = path.join(rootDir, "dist");

function run(command, args, options = {}) {
  const result = spawnSync(command, args, {
    cwd: options.cwd || rootDir,
    stdio: "inherit",
  });

  if (result.error) {
    throw result.error;
  }
  if (result.status !== 0) {
    throw new Error(`${command} ${args.join(" ")} failed with exit code ${result.status}`);
  }
}

// 항상 새로 빌드해서 오래된 산출물이 배포되는 일을 막는다.
run("npx", ["vite", "build"]);

const manifestPath = path.join(buildDir, "manifest.json");
if (!fs.existsSync(manifestPath)) {
  throw new Error(`Build did not produce a manifest: ${path.relative(rootDir, manifestPath)}`);
}

const manifest = JSON.parse(fs.readFileSync(manifestPath, "utf8"));
const version = typeof manifest.version === "string" ? manifest.version : "0.0.0";
const outputPath = path.join(distDir, `zzimkkong-radar-${version}-webstore.zip`);

// content script 청크가 실제로 존재하는지 확인한다. 이게 비면 확장이 아무 일도 안 한다.
const contentScripts = manifest.content_scripts?.[0]?.js ?? [];
if (contentScripts.length === 0) {
  throw new Error("Build produced a manifest with no content script");
}
for (const relativePath of contentScripts) {
  if (!fs.existsSync(path.join(buildDir, relativePath))) {
    throw new Error(`Missing content script in build output: ${relativePath}`);
  }
}

// 런타임에 chrome.runtime.getURL 로 직접 부르는 파일들.
// 번들러가 경로를 바꾸면 예약 훅과 Slack 모달 스타일이 조용히 깨지므로 여기서 막는다.
const runtimeLoadedPaths = ["assets/basecoat-dialog.css"];
for (const relativePath of runtimeLoadedPaths) {
  if (!fs.existsSync(path.join(buildDir, relativePath))) {
    throw new Error(`Missing runtime-loaded resource in build output: ${relativePath}`);
  }
}

fs.rmSync(outputPath, { force: true });

// buildDir 안에서 압축해야 zip 루트에 manifest.json 이 온다(웹스토어 요구사항).
run("zip", ["-qr", outputPath, ".", "-x", "*.DS_Store", "__MACOSX/*"], { cwd: buildDir });
run("unzip", ["-t", outputPath]);

console.log(`Created ${path.relative(rootDir, outputPath)}`);
