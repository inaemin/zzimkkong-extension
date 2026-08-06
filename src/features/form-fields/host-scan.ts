// lms+ 예약 폼에서 날짜·시간 입력을 찾아내는 스캔 로직.
//
// 호스트 페이지는 우리가 만들지 않았고 마크업이 바뀔 수 있다. 그래서 "이름이
// date 다" 같은 단정 대신 여러 신호에 점수를 매겨 가장 그럴듯한 것을 고른다.
// DOM 을 읽지만 전역 상태는 안 건드려서, 가짜 엘리먼트로 검증할 수 있다.

import { normalizeTextForMatch } from "../../utils/shared.js";

import { buildHostInputDescriptor } from "./shared.js";

/** 화면에 실제로 보이는지. 숨은 입력은 후보에서 뺀다. */
export function isElementVisible(element: Element | null): boolean {
  if (!element) {
    return false;
  }
  const rect = element.getBoundingClientRect();
  return rect.width > 0 && rect.height > 0;
}

/** 값을 써넣을 수 있는 호스트 입력인지. */
function isHostInputCandidate(
  input: Element | null,
  isInsideExtensionSurface: (node: Element) => boolean,
): input is HTMLInputElement {
  if (!(input instanceof HTMLInputElement)) {
    return false;
  }
  if (input.disabled || input.readOnly || input.type === "hidden") {
    return false;
  }
  return !isInsideExtensionSurface(input);
}

function getScopedHostInputs(root: Document | HTMLElement) {
  const scoped = Array.from(root.querySelectorAll("input")).filter(
    (candidate) => candidate instanceof HTMLInputElement,
  );
  if (scoped.length > 0) {
    return scoped;
  }

  return Array.from(document.querySelectorAll("input")).filter(
    (candidate) => candidate instanceof HTMLInputElement,
  );
}

/**
 * 스캔 대상인 입력인지.
 *
 * isInsideExtensionSurface 를 주입받는다 — 우리가 만든 UI 안의 입력을 호스트
 * 것으로 착각하면 값을 엉뚱한 데 쓴다.
 */
export function isHostScannableInput(
  input: Element | null,
  isInsideExtensionSurface: (node: Element) => boolean,
) {
  if (!(input instanceof HTMLInputElement)) {
    return false;
  }
  if (input.type === "hidden") {
    return false;
  }
  if (isInsideExtensionSurface(input)) {
    return false;
  }

  return true;
}

const HHMM = /^\d{1,2}:\d{2}$/;
const START_KEYWORDS = ["start", "starttime", "begin", "시작"];
const END_KEYWORDS = ["end", "endtime", "finish", "종료"];

/** 시각처럼 보이는 입력인지(type=time 이거나 값/설명이 HH:MM 꼴). */
function looksLikeTimeInput(input: HTMLInputElement, descriptor: string): boolean {
  return (
    input.type === "time" ||
    descriptor.includes("time") ||
    descriptor.includes("시간") ||
    HHMM.test((input.value || "").trim()) ||
    HHMM.test((input.getAttribute("placeholder") || "").trim())
  );
}

/** name/id 가 찾는 쪽(시작 또는 종료)과 정확히 맞으면 크게 가산한다. */
function scoreExactNameMatch(input: HTMLInputElement, keywords: string[]): number {
  const exactKeys = [
    normalizeTextForMatch(input.name || ""),
    normalizeTextForMatch(input.id || ""),
  ];
  const wantsStart = keywords.some((keyword) => START_KEYWORDS.includes(keyword));
  const wantsEnd = keywords.some((keyword) => END_KEYWORDS.includes(keyword));

  const startHit =
    wantsStart && exactKeys.some((key) => ["starttime", "start", "startdate"].includes(key));
  const endHit = wantsEnd && exactKeys.some((key) => ["endtime", "end", "enddate"].includes(key));
  return (startHit ? 30 : 0) + (endHit ? 30 : 0);
}

/**
 * 이 입력이 찾는 시각 입력일 가능성. 높을수록 그럴듯하다.
 *
 * 키워드가 안 맞거나 시각 입력이 아니면 후보에서 아예 뺀다(-Infinity).
 */
function scoreHostTimeInput(input: HTMLInputElement, keywords: string[]): number {
  const descriptor = buildHostInputDescriptor(input);
  const hasKeyword = keywords.some((keyword) => descriptor.includes(keyword));
  if (!hasKeyword || !looksLikeTimeInput(input, descriptor)) {
    return Number.NEGATIVE_INFINITY;
  }

  return (
    14 +
    scoreExactNameMatch(input, keywords) +
    (input.type === "time" ? 12 : 0) +
    (descriptor.includes("time") || descriptor.includes("시간") ? 4 : 0) +
    (HHMM.test((input.value || "").trim()) ? 2 : 0) +
    (isElementVisible(input) ? 0 : -8)
  );
}

/** 시각 컨트롤을 가리키는 말들. input 이든 버튼이든 같은 목록을 본다. */
const TIME_CONTROL_TOKENS = ["start", "end", "time", "시작", "종료", "시간"];

function mentionsTimeControl(descriptor: string): boolean {
  return TIME_CONTROL_TOKENS.some((token) => descriptor.includes(token));
}

/**
 * 호스트 폼의 시각 컨트롤인지.
 *
 * lms+ 는 input 을 쓰기도 하고 버튼+팝오버를 쓰기도 해서 둘 다 받는다.
 */
export function isHostTimeControlElement(control: Element | null): boolean {
  if (!(control instanceof HTMLElement)) {
    return false;
  }

  if (control instanceof HTMLInputElement) {
    return control.type === "time" || mentionsTimeControl(buildHostInputDescriptor(control));
  }

  const descriptor = normalizeTextForMatch(
    [
      control.textContent || "",
      control.getAttribute("aria-label") || "",
      control.getAttribute("title") || "",
    ].join(" "),
  );
  return Boolean(descriptor) && mentionsTimeControl(descriptor);
}

/**
 * 점수가 가장 높은 후보. 최소 점수에 못 미치면 null.
 *
 * 동점이면 먼저 나온 쪽이 이긴다(호스트 폼은 대개 위에서 아래 순서로 중요하다).
 */
function pickHighestScored<T>(
  candidates: T[],
  scoreOf: (candidate: T) => number,
  minimumScore: number,
): T | null {
  const best = candidates.reduce<{ item: T; score: number } | null>((winner, item) => {
    const score = scoreOf(item);
    return winner && winner.score >= score ? winner : { item, score };
  }, null);
  return best && best.score >= minimumScore ? best.item : null;
}

/** 날짜 입력다움 점수. */
function scoreHostDateInput(input: HTMLInputElement): number {
  const descriptor = buildHostInputDescriptor(input);
  return (
    (input.name === "date" ? 16 : 0) +
    (input.type === "date" ? 12 : 0) +
    (descriptor.includes("date") || descriptor.includes("날짜") ? 6 : 0)
  );
}

export function queryHostDateInput(
  root: Document | HTMLElement = document,
  isInsideExtensionSurface: (node: Element) => boolean = () => false,
): HTMLInputElement | null {
  const candidates = getScopedHostInputs(root).filter((input) =>
    isHostScannableInput(input, isInsideExtensionSurface),
  );
  return pickHighestScored(candidates, scoreHostDateInput, 8);
}

/** 후보를 거를 때 쓰는 옵션. 파라미터가 늘어나 객체로 묶었다. */
export interface HostTimeInputQuery {
  root?: Document | HTMLElement;
  excludedInput?: Element | null;
  isInsideExtensionSurface?: (node: Element) => boolean;
}

export function queryHostTimeInput(
  nameKeywords: string[],
  {
    root = document,
    excludedInput = null,
    isInsideExtensionSurface = () => false,
  }: HostTimeInputQuery = {},
): HTMLInputElement | null {
  const keywords = nameKeywords.map((keyword) => keyword.toLowerCase());
  const candidates = getScopedHostInputs(root).filter(
    (input) => isHostInputCandidate(input, isInsideExtensionSurface) && input !== excludedInput,
  );
  // 점수가 0 이하면 후보로 안 본다(키워드가 하나도 안 맞은 것).
  return pickHighestScored(candidates, (input) => scoreHostTimeInput(input, keywords), 1);
}

/** 시각 입력 쌍. 시작·종료를 함께 찾는다. */
export interface HostTimeInputPair {
  startInput: HTMLInputElement;
  endInput: HTMLInputElement;
}

/**
 * 이름으로 못 찾았을 때의 대비책.
 *
 * 시각처럼 보이는 입력이 둘 이상이면, 먼저 키워드 스캔을 시도하고 그것도
 * 실패하면 type=time 인 것 앞 두 개를 시작·종료로 본다.
 */
export function queryFallbackHostTimeInputs(
  root: Document | HTMLElement = document,
  isInsideExtensionSurface: (node: Element) => boolean = () => false,
): HostTimeInputPair | null {
  const candidates = getScopedHostInputs(root).filter(
    (input) =>
      isHostInputCandidate(input, isInsideExtensionSurface) &&
      looksLikeTimeInput(input, buildHostInputDescriptor(input)),
  );
  if (candidates.length < 2) {
    return null;
  }

  const byKeyword = findTimeInputPairByKeyword(root, isInsideExtensionSurface);
  if (byKeyword) {
    return byKeyword;
  }

  const timeTyped = candidates.filter((input) => input.type === "time");
  return timeTyped.length >= 2 ? { startInput: timeTyped[0], endInput: timeTyped[1] } : null;
}

/** 시작/종료 키워드로 한 쌍을 찾는다. 둘 다 못 찾으면 null. */
function findTimeInputPairByKeyword(
  root: Document | HTMLElement,
  isInsideExtensionSurface: (node: Element) => boolean,
): HostTimeInputPair | null {
  const startInput = queryHostTimeInput(["start", "starttime", "start_date", "begin", "시작"], {
    root,
    isInsideExtensionSurface,
  });
  const endInput = queryHostTimeInput(["end", "endtime", "end_date", "finish", "종료"], {
    root,
    excludedInput: startInput,
    isInsideExtensionSurface,
  });

  return startInput && endInput ? { startInput, endInput } : null;
}
