import { spawnSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import process from "node:process";

const rootDir = process.cwd();
const manifestPath = path.join(rootDir, "manifest.json");

const manifest = JSON.parse(fs.readFileSync(manifestPath, "utf8"));
const version = typeof manifest.version === "string" ? manifest.version : "0.0.0";
const distDir = path.join(rootDir, "dist");
const outputPath = path.join(distDir, `zzimkkong-radar-${version}-webstore.zip`);

const includePaths = ["manifest.json", "src", "assets", "icons", "README.md"];
const excludePatterns = [
  "*.DS_Store",
  "__MACOSX/*",
  "src/ISSUE.md",
  "src-backup/*",
  "test-results/*",
  "artifacts/*",
  "dist/*",
  "node_modules/*",
  "tests/*",
  ".env*",
  "crews.csv",
];

function run(command, args) {
  const result = spawnSync(command, args, {
    cwd: rootDir,
    stdio: "inherit",
  });

  if (result.error) {
    throw result.error;
  }
  if (result.status !== 0) {
    throw new Error(`${command} ${args.join(" ")} failed with exit code ${result.status}`);
  }
}

for (const relativePath of includePaths) {
  if (!fs.existsSync(path.join(rootDir, relativePath))) {
    throw new Error(`Missing required package input: ${relativePath}`);
  }
}

fs.mkdirSync(distDir, { recursive: true });
fs.rmSync(outputPath, { force: true });

run("zip", [
  "-qr",
  outputPath,
  ...includePaths,
  "-x",
  ...excludePatterns,
]);
run("unzip", ["-t", outputPath]);

console.log(`Created ${path.relative(rootDir, outputPath)}`);
