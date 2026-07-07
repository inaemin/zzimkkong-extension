import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import process from "node:process";
import readline from "node:readline/promises";
import { chromium } from "@playwright/test";
import "./env.mjs";

const extensionPath = path.resolve(process.env.ZZK_EXTENSION_PATH || process.cwd());
const guestDetailUrl = process.env.ZZK_GUEST_DETAIL_URL || "https://zzimkkong.com";
const browserChannel = process.env.PW_BROWSER_CHANNEL || "chromium";
const shouldPauseBeforeCheck = process.argv.includes("--pause-before-check");
const uiWaitTimeoutMs = Number.parseInt(process.env.ZZK_MANUAL_UI_TIMEOUT_MS || "60000", 10);
const userDataDir = path.resolve(os.tmpdir(), `zzk-chromium-remind-verify-${Date.now()}`);

if (!fs.existsSync(extensionPath)) {
  throw new Error(`Extension path not found: ${extensionPath}`);
}

const manifestPath = path.join(extensionPath, "manifest.json");
if (!fs.existsSync(manifestPath)) {
  throw new Error(
    [
      "Extension manifest not found. ZZK_EXTENSION_PATH must point to the unpacked extension root.",
      `extensionPath=${extensionPath}`,
      `expectedManifest=${manifestPath}`,
    ].join("\n")
  );
}

const reminderScreenshot = path.resolve(process.cwd(), "artifacts/remind-message-modal.png");
const reminderPayloadPath = path.resolve(process.cwd(), "artifacts/remind-message.txt");

let context = null;

async function waitForExtensionLoaded(context) {
  try {
    const worker =
      context.serviceWorkers()[0] ||
      (await context.waitForEvent("serviceworker", { timeout: 10000 }));
    const workerUrl = worker.url();
    const extensionId = workerUrl.startsWith("chrome-extension://")
      ? new URL(workerUrl).host
      : "";
    if (!extensionId) {
      throw new Error(`Unexpected extension service worker URL: ${workerUrl}`);
    }

    console.log(`확장 프로그램 로드 확인: ${workerUrl}`);
    return extensionId;
  } catch (error) {
    console.warn(
      [
        "확장 프로그램 service worker를 아직 찾지 못했습니다. MV3 service worker는 지연 시작될 수 있어 페이지 주입 검증을 계속합니다.",
        `extensionPath=${extensionPath}`,
        `browserChannel=${browserChannel}`,
        `원인: ${error instanceof Error ? error.message : String(error)}`,
      ].join("\n")
    );
    return "";
  }
}

async function waitForManualLogin(page) {
  let resumeVerification = null;
  const pageResumePromise = new Promise((resolve) => {
    resumeVerification = resolve;
  });
  await page.exposeFunction("zzkStartManualVerification", () => {
    if (typeof resumeVerification === "function") {
      resumeVerification("page");
    }
  });

  const terminal = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
  });

  try {
    const terminalPromise = terminal.question(
      [
        "\n브라우저 창에서 OAuth 로그인을 완료하고 검증할 guest 페이지로 돌아오세요.",
        "준비되면 터미널에서 Enter를 누르면 /remind 메시지 검증을 시작합니다.",
        "터미널 입력이 먹지 않으면 DevTools Console에서 window.zzkStartManualVerification()을 실행해도 됩니다.",
        "> ",
      ].join("\n")
    ).then(() => "terminal");
    const resumedBy = await Promise.race([terminalPromise, pageResumePromise]);
    console.log(`\n수동 검증을 시작합니다. resumedBy=${resumedBy}`);
  } finally {
    terminal.close();
  }
}

async function waitForManualSlackModal(page) {
  const hasDebugTrigger = await page.evaluate(() => {
    return document.getElementById("zzk-slack-modal-trigger") instanceof HTMLButtonElement;
  });

  if (hasDebugTrigger) {
    await page.click("#zzk-slack-modal-trigger");
    return;
  }

  const hasSlackModal = await page.evaluate(() => {
    return document.getElementById("zzk-slack-copy-modal") instanceof HTMLElement;
  });

  if (hasSlackModal) {
    return;
  }

  const terminal = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
  });

  try {
    await terminal.question(
      [
        "\n레이더가 열린 상태입니다.",
        "브라우저에서 예약 생성/수정 성공 흐름을 직접 완료해 Slack 복사 모달을 띄워 주세요.",
        "Slack 복사 모달이 보이면 터미널에서 Enter를 누르면 /remind 메시지 검증을 계속합니다.",
        "> ",
      ].join("\n")
    );
  } finally {
    terminal.close();
  }
}

function validateReminderPayload(payload) {
  if (typeof payload !== "string" || payload.trim() === "") {
    throw new Error("Slack /remind 메시지가 비어 있습니다.");
  }

  const normalizedPayload = payload.trim();
  if (!normalizedPayload.startsWith("/remind ")) {
    throw new Error(`Slack 메시지가 /remind 명령으로 시작하지 않습니다. payload=${normalizedPayload}`);
  }

  const reminderPattern = /^\/remind\s+(me|#[^\s]+)\s+"[^"]+"\s+on\s+\d{4}-\d{2}-\d{2}\s+at\s+\d{2}:\d{2}$/;
  if (!reminderPattern.test(normalizedPayload)) {
    throw new Error(`Slack /remind 메시지 형식이 올바르지 않습니다. payload=${normalizedPayload}`);
  }

  if (normalizedPayload.includes("at HH:MM")) {
    throw new Error(`Slack /remind 메시지에 placeholder 시간이 남아 있습니다. payload=${normalizedPayload}`);
  }

  return normalizedPayload;
}

async function waitForUiReady(page, selector, description) {
  try {
    await page.waitForFunction(
      (targetSelector) => document.querySelector(targetSelector) instanceof HTMLElement,
      selector,
      { timeout: uiWaitTimeoutMs }
    );
  } catch (error) {
    const snapshot = await page.evaluate((targetSelector) => {
      return {
        url: location.href,
        title: document.title,
        readyState: document.readyState,
        hasTarget: document.querySelector(targetSelector) instanceof HTMLElement,
        bodyText: (document.body && document.body.innerText ? document.body.innerText : "").slice(0, 500),
      };
    }, selector);
    throw new Error(
      `${description}를 찾지 못했습니다. selector=${selector}, state=${JSON.stringify(snapshot)}`
    );
  }
}

function createBrowserLaunchError(error) {
  const message = error instanceof Error ? error.message : String(error);
  const isBrokenPlaywrightBrowser =
    message.includes("Google Chrome for Testing Framework") &&
    message.includes("no such file");

  const isMissingPlaywrightBrowser =
    message.includes("Executable doesn't exist") ||
    message.includes("Please run the following command to download new browsers");

  if (isMissingPlaywrightBrowser) {
    return new Error(
      [
        "Playwright Chromium 실행 파일이 설치되어 있지 않아 브라우저를 시작하지 못했습니다.",
        `browserChannel=${browserChannel}`,
        "복구 순서:",
        "1. npx playwright install chromium",
        "2. 그래도 실패하면 npm run pw:install",
        "3. 다시 node scripts/verify-modal-overlap.mjs --pause-before-check 실행",
        `원본 오류: ${message}`,
      ].join("\n")
    );
  }

  if (!isBrokenPlaywrightBrowser) {
    return error;
  }

  return new Error(
    [
      "Playwright Chromium 설치가 깨져 브라우저를 시작하지 못했습니다.",
      "Chrome for Testing 앱 번들 내부 Framework 파일이 누락되어 있습니다.",
      `browserChannel=${browserChannel}`,
      "복구 순서:",
      "1. npx playwright install --force chromium",
      "2. 그래도 실패하면 rm -rf ~/Library/Caches/ms-playwright 후 npm run pw:install",
      "3. 다시 node scripts/verify-modal-overlap.mjs --pause-before-check 실행",
      `원본 오류: ${message}`,
    ].join("\n")
  );
}

async function launchVerificationContext() {
  try {
    return await chromium.launchPersistentContext(userDataDir, {
      channel: browserChannel,
      headless: false,
      args: [
        `--disable-extensions-except=${extensionPath}`,
        `--load-extension=${extensionPath}`,
      ],
    });
  } catch (error) {
    throw createBrowserLaunchError(error);
  }
}

try {
  context = await launchVerificationContext();

  await waitForExtensionLoaded(context);

  let page = context.pages()[0] || null;
  if (!page) {
    page = await context.newPage();
  }

  await page.goto(guestDetailUrl, { waitUntil: "domcontentloaded" });

  if (shouldPauseBeforeCheck) {
    await waitForManualLogin(page);
    console.log(`검증 URL로 다시 이동합니다: ${guestDetailUrl}`);
    await page.goto(guestDetailUrl, { waitUntil: "domcontentloaded" });
  }

  console.log(`검증 대상 페이지: ${page.url()}`);

  await waitForUiReady(page, "#zzk-map-calendar-radar-launcher", "레이더 실행 버튼");

  await waitForManualSlackModal(page);

  await waitForUiReady(page, "#zzk-slack-copy-modal", "Slack 복사 모달");

  const reminderState = await page.evaluate(() => {
    const modal = document.getElementById("zzk-slack-copy-modal");
    const copyButton = document.querySelector("#zzk-slack-copy-modal .zzk-slack-copy-button.primary");
    const textarea = document.querySelector("#zzk-slack-copy-modal .zzk-slack-copy-textarea");
    const channelInput = document.querySelector("#zzk-slack-copy-modal .zzk-slack-copy-channel-input");
    const reminderSelect = document.querySelector("#zzk-slack-reminder-lead-time");

    return {
      hasModal: modal instanceof HTMLElement,
      payload: textarea instanceof HTMLTextAreaElement ? textarea.value : "",
      hasChannelInput: channelInput instanceof HTMLInputElement,
      channelValue: channelInput instanceof HTMLInputElement ? channelInput.value : "",
      hasReminderSelect: reminderSelect instanceof HTMLSelectElement,
      reminderLeadTime: reminderSelect instanceof HTMLSelectElement ? reminderSelect.value : "",
      reminderOptions:
        reminderSelect instanceof HTMLSelectElement
          ? Array.from(reminderSelect.options).map((option) => option.textContent || "")
          : [],
      copyButtonBackground:
        copyButton instanceof HTMLElement ? window.getComputedStyle(copyButton).backgroundColor : null,
    };
  });

  if (!reminderState.hasModal) {
    throw new Error(`Slack modal did not appear. State: ${JSON.stringify(reminderState)}`);
  }

  if (!reminderState.hasChannelInput || !reminderState.hasReminderSelect) {
    throw new Error(`Slack modal input state mismatch: ${JSON.stringify(reminderState)}`);
  }

  if (
    typeof reminderState.copyButtonBackground !== "string" ||
    !reminderState.copyButtonBackground.includes("255, 136, 51")
  ) {
    throw new Error(`Copy button is not orange. background=${String(reminderState.copyButtonBackground)}`);
  }

  const normalizedPayload = validateReminderPayload(reminderState.payload);

  fs.mkdirSync(path.dirname(reminderScreenshot), { recursive: true });
  fs.writeFileSync(reminderPayloadPath, `${normalizedPayload}\n`, "utf8");
  await page.screenshot({ path: reminderScreenshot, fullPage: true });

  console.log(
    JSON.stringify(
      {
        ok: true,
        reminderState: {
          ...reminderState,
          payload: normalizedPayload,
        },
        screenshots: [
          path.relative(process.cwd(), reminderScreenshot),
        ],
        payloadFile: path.relative(process.cwd(), reminderPayloadPath),
      },
      null,
      2
    )
  );
} finally {
  if (context) {
    await context.close();
  }

  fs.rmSync(userDataDir, { recursive: true, force: true });
}
