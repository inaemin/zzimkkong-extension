import { buildHostFieldDescriptor } from "./shared.js";
import { isElementVisible } from "./host-scan.js";

// 호스트 예약 폼의 "예약 목적" 입력을 찾는다.
//
// 기존 readHostReservationFieldValue 로는 이 일을 할 수 없다. 그 함수는 값이
// 있는 컨트롤만 후보로 치고(빈 값이면 점수를 안 매긴다) 엘리먼트가 아니라
// 문자열을 돌려준다. 우리가 채우려는 건 정확히 "비어 있는 목적 칸"이라,
// 찾는 규칙을 따로 둔다.

/** 목적 칸을 알아보는 라벨. 앞쪽이 더 확실한 단서다. */
const PURPOSE_KEYWORDS = ["사용목적", "이용목적", "예약목적", "purpose", "목적"];

/** 이 점수 아래는 목적 칸으로 보지 않는다. */
const MIN_SCORE = 1;

function scorePurposeField(control: HTMLElement): number {
  const descriptor = buildHostFieldDescriptor(control);

  // 앞쪽 키워드일수록 더 확실하다("목적" 하나만으로는 약하다).
  const keywordScore = PURPOSE_KEYWORDS.reduce((best, keyword, index) => {
    if (!descriptor.includes(keyword)) {
      return best;
    }
    return Math.max(best, PURPOSE_KEYWORDS.length - index);
  }, 0);

  if (keywordScore === 0) {
    return 0;
  }

  // 같은 폼 안에 있으면 조금 더 유력하다.
  return keywordScore + (control.closest("form") ? 1 : 0);
}

interface FindOptions {
  /** 우리 UI 안쪽 요소인지. 호스트 폼만 건드리려고 거른다. */
  isInsideExtensionSurface: (node: Element) => boolean;
}

/**
 * 목적 입력 엘리먼트. 못 찾으면 null.
 *
 * 값이 비어 있어도 찾는다 — 채우는 게 목적이므로 빈 칸이 오히려 정상이다.
 */
/** 목적 칸이 될 수 있는 컨트롤인지. 값이 비어 있어도 통과한다. */
function isFillableTextField(
  control: Element,
  isInsideExtensionSurface: (node: Element) => boolean,
): control is HTMLInputElement | HTMLTextAreaElement {
  if (!(control instanceof HTMLInputElement || control instanceof HTMLTextAreaElement)) {
    return false;
  }
  // 우리 UI 안쪽은 건드리지 않는다.
  //
  // isHostScannableInput 을 쓰지 않는다. 그쪽은 HTMLInputElement 만 받아서
  // textarea 를 전부 걸러낸다(목적 칸이 textarea 인 경우가 있다).
  if (isInsideExtensionSurface(control)) {
    return false;
  }
  // 읽기 전용·비활성 칸은 채울 수 없다.
  if (control.disabled || control.readOnly) {
    return false;
  }
  // 목적은 자유 입력이다. 날짜·시간 같은 특수 입력은 제외한다.
  if (control instanceof HTMLInputElement && !["text", "search", ""].includes(control.type)) {
    return false;
  }
  return isElementVisible(control);
}

export function findPurposeField(
  root: Document | HTMLElement,
  { isInsideExtensionSurface }: FindOptions,
): HTMLInputElement | HTMLTextAreaElement | null {
  const best = Array.from(root.querySelectorAll("input, textarea"))
    .filter((control): control is HTMLInputElement | HTMLTextAreaElement =>
      isFillableTextField(control, isInsideExtensionSurface),
    )
    .map((control) => ({ control, score: scorePurposeField(control) }))
    .filter((entry) => entry.score >= MIN_SCORE)
    .reduce<{ control: HTMLInputElement | HTMLTextAreaElement; score: number } | null>(
      (winner, entry) => (winner === null || entry.score > winner.score ? entry : winner),
      null,
    );

  return best?.control ?? null;
}

interface FillOptions extends FindOptions {
  /** React 가 알아채는 방식으로 값을 넣는다(네이티브 setter + input/change). */
  setFormElementValue: (element: Element | null, value: unknown) => void;
}

/**
 * 목적 칸이 비어 있으면 채운다. 이미 뭔가 적혀 있으면 건드리지 않는다.
 *
 * 사용자가 쓴 것을 덮어쓰는 건 자동 입력이 할 수 있는 가장 나쁜 일이다.
 * 채웠으면 true.
 */
export function fillPurposeIfEmpty(
  root: Document | HTMLElement,
  purpose: string,
  options: FillOptions,
): boolean {
  const normalized = typeof purpose === "string" ? purpose.trim() : "";
  if (!normalized) {
    return false;
  }

  const field = findPurposeField(root, options);
  if (!field || field.value.trim() !== "") {
    return false;
  }

  options.setFormElementValue(field, normalized);
  return field.value.trim() === normalized;
}
