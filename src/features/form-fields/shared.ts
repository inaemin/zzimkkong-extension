import { TARGET_ROOM_NAMES } from "../../constants/runtime.js";
import { normalizeTextForMatch } from "../../utils/shared.js";
import { normalizeSlackFieldText } from "../slack/shared.js";

function getInputAssociatedLabelText(input: HTMLInputElement): string {
  const labels: string[] = [];
  if (input.labels && input.labels.length > 0) {
    Array.from(input.labels).forEach((label) => {
      labels.push(label.textContent || "");
    });
  }

  const labelledBy = (input.getAttribute("aria-labelledby") || "")
    .split(/\s+/)
    .map((token) => token.trim())
    .filter(Boolean);
  labelledBy.forEach((id) => {
    const node = document.getElementById(id);
    if (node instanceof HTMLElement) {
      labels.push(node.textContent || "");
    }
  });

  return labels.join(" ");
}

export function buildHostInputDescriptor(input: HTMLInputElement): string {
  return [
    input.name,
    input.id,
    input.type,
    input.getAttribute("aria-label") || "",
    input.getAttribute("placeholder") || "",
    input.getAttribute("title") || "",
    getInputAssociatedLabelText(input),
  ]
    .join(" ")
    .toLowerCase();
}

/**
 * 예약자 이름이 아니라 자리표시자·라벨인 값들.
 *
 * 호출마다 Set 을 새로 만들 이유가 없어 모듈 상수로 둔다.
 */
const IGNORED_OWNER_TOKENS = new Set([
  "-",
  "이름",
  "name",
  "예약자",
  "예약자명",
  "신청자",
  "신청자명",
  "owner",
  "ownername",
  "requester",
  "booker",
  "guest",
  "guestname",
  "select",
  "선택",
  "choose",
  "입력",
]);

export function normalizeHostReservationOwnerCandidate(value: unknown): string {
  const normalized = normalizeSlackFieldText(value || "");
  if (!normalized) {
    return "";
  }

  return IGNORED_OWNER_TOKENS.has(normalizeTextForMatch(normalized)) ? "" : normalized;
}

export function normalizeHostRoomCandidate(rawName: unknown): string {
  const normalizedName = normalizeSlackFieldText(rawName || "");
  if (!normalizedName) {
    return "";
  }

  const normalizedKey = normalizeTextForMatch(normalizedName);
  const isPlaceholder =
    normalizedKey === normalizeTextForMatch("공간 선택") ||
    normalizedKey === normalizeTextForMatch("회의실 선택") ||
    normalizedKey === normalizeTextForMatch("장소 선택") ||
    normalizedKey === normalizeTextForMatch("select room") ||
    normalizedKey === normalizeTextForMatch("select space") ||
    normalizedKey === normalizeTextForMatch("선택") ||
    normalizedKey === "-";

  return isPlaceholder ? "" : normalizedName;
}

/** 표에 있는 회의실 이름인가. 추측으로 고른 후보를 걸러낼 때 쓴다. */
export function isKnownRoomName(rawName: unknown): boolean {
  const normalized = normalizeTextForMatch(rawName);
  return (
    normalized !== "" &&
    TARGET_ROOM_NAMES.some((roomName) => normalizeTextForMatch(roomName) === normalized)
  );
}

export function extractKnownRoomName(rawName: unknown): string {
  const normalized = normalizeTextForMatch(rawName);
  const matchedKnownRoom = TARGET_ROOM_NAMES.find((roomName) => {
    return normalized.includes(normalizeTextForMatch(roomName));
  });
  if (matchedKnownRoom) {
    return matchedKnownRoom;
  }

  return normalizeSlackFieldText(rawName);
}

/** control.labels 로 이어진 라벨(<label> 이 for/중첩으로 붙은 경우). */
function readNativeLabels(control: HTMLElement): string[] {
  const supportsLabels =
    control instanceof HTMLInputElement ||
    control instanceof HTMLTextAreaElement ||
    control instanceof HTMLSelectElement ||
    control instanceof HTMLButtonElement;
  if (!supportsLabels || !control.labels?.length) {
    return [];
  }
  return Array.from(control.labels).map((label) => label.textContent || "");
}

/** label[for=id] 로 가리키는 라벨. control.labels 가 못 잡는 경우를 채운다. */
function readForLabels(control: HTMLElement): string[] {
  if (!control.id) {
    return [];
  }
  return Array.from(document.querySelectorAll("label[for]"))
    .filter((label) => label instanceof HTMLLabelElement && label.htmlFor === control.id)
    .map((label) => label.textContent || "");
}

/** aria-labelledby 가 가리키는 요소들의 텍스트. */
function readAriaLabelledByTexts(control: HTMLElement): string[] {
  return (control.getAttribute("aria-labelledby") || "")
    .split(/\s+/)
    .map((token) => token.trim())
    .filter(Boolean)
    .map((id) => document.getElementById(id))
    .filter((node) => node instanceof HTMLElement)
    .map((node) => node.textContent || "");
}

function getControlAssociatedLabelText(control: Element | null): string {
  if (!(control instanceof HTMLElement)) {
    return "";
  }

  const wrappedLabel = control.closest("label");

  return [
    ...readNativeLabels(control),
    ...readForLabels(control),
    ...readAriaLabelledByTexts(control),
    ...(wrappedLabel instanceof HTMLLabelElement ? [wrappedLabel.textContent || ""] : []),
  ].join(" ");
}

/** name 속성이 없으면 폼 요소의 name 프로퍼티로 대신한다. */
function readControlName(control: HTMLElement): string {
  const attribute = control.getAttribute("name");
  if (attribute) {
    return attribute;
  }
  const isFormField =
    control instanceof HTMLInputElement ||
    control instanceof HTMLTextAreaElement ||
    control instanceof HTMLSelectElement;
  return isFormField ? control.name : "";
}

export function buildHostFieldDescriptor(control: Element | null): string {
  if (!(control instanceof HTMLElement)) {
    return "";
  }

  return [
    readControlName(control),
    control.id,
    control.getAttribute("aria-label") || "",
    control.getAttribute("placeholder") || "",
    control.getAttribute("title") || "",
    control.getAttribute("role") || "",
    control.getAttribute("data-value") || "",
    getControlAssociatedLabelText(control),
  ]
    .join(" ")
    .toLowerCase();
}

/** select 는 고른 option 의 텍스트를 우선하고, 없으면 value 를 쓴다. */
function readSelectDisplayValue(control: HTMLSelectElement): string {
  const selectedOption = control.selectedIndex >= 0 ? control.options[control.selectedIndex] : null;
  const selectedText =
    selectedOption instanceof HTMLOptionElement
      ? normalizeSlackFieldText(selectedOption.textContent || "")
      : "";
  return selectedText || normalizeSlackFieldText(control.value || "");
}

/** 커스텀 컨트롤(div 기반 등)은 값을 어디에 두는지 제각각이라 순서대로 훑는다. */
function readCustomControlValue(control: HTMLElement): string {
  return (
    [
      control.getAttribute("data-value") || "",
      control.getAttribute("aria-valuetext") || "",
      control.textContent || "",
      control.getAttribute("aria-label") || "",
      control.getAttribute("title") || "",
    ]
      .map((snapshot) => normalizeSlackFieldText(snapshot))
      .find((snapshot) => Boolean(snapshot)) || ""
  );
}

export function readHostFieldDisplayValue(control: Element | null): string {
  if (!(control instanceof HTMLElement)) {
    return "";
  }

  if (control instanceof HTMLInputElement || control instanceof HTMLTextAreaElement) {
    return normalizeSlackFieldText(control.value || "");
  }

  if (control instanceof HTMLSelectElement) {
    return readSelectDisplayValue(control);
  }

  return readCustomControlValue(control);
}
