import { TARGET_ROOM_NAMES } from "../../constants/runtime.js";
import { normalizeTextForMatch } from "../../utils/shared.js";
import { normalizeSlackFieldText } from "../slack/shared.js";

export function getInputAssociatedLabelText(input: HTMLInputElement): string {
  const labels = [];
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

export function normalizeHostReservationOwnerCandidate(value: unknown): string {
  const normalized = normalizeSlackFieldText(value || "");
  if (!normalized) {
    return "";
  }

  const normalizedKey = normalizeTextForMatch(normalized);
  const ignoredTokens = new Set([
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
  if (ignoredTokens.has(normalizedKey)) {
    return "";
  }

  return normalized;
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

export function getControlAssociatedLabelText(control: Element | null): string {
  if (!(control instanceof HTMLElement)) {
    return "";
  }

  const labels = [];
  if (
    (control instanceof HTMLInputElement ||
      control instanceof HTMLTextAreaElement ||
      control instanceof HTMLSelectElement ||
      control instanceof HTMLButtonElement) &&
    control.labels &&
    control.labels.length > 0
  ) {
    Array.from(control.labels).forEach((label) => {
      labels.push(label.textContent || "");
    });
  }

  if (control.id) {
    const forLabelCandidates = Array.from(document.querySelectorAll("label[for]")).filter(
      (label) => {
        return label instanceof HTMLLabelElement && label.htmlFor === control.id;
      },
    );
    forLabelCandidates.forEach((label) => {
      labels.push(label.textContent || "");
    });
  }

  const labelledBy = (control.getAttribute("aria-labelledby") || "")
    .split(/\s+/)
    .map((token) => token.trim())
    .filter(Boolean);

  labelledBy.forEach((id) => {
    const node = document.getElementById(id);
    if (node instanceof HTMLElement) {
      labels.push(node.textContent || "");
    }
  });

  const wrappedLabel = control.closest("label");
  if (wrappedLabel instanceof HTMLLabelElement) {
    labels.push(wrappedLabel.textContent || "");
  }

  return labels.join(" ");
}

export function buildHostFieldDescriptor(control: Element | null): string {
  if (!(control instanceof HTMLElement)) {
    return "";
  }

  return [
    control.getAttribute("name") ||
      (control instanceof HTMLInputElement ||
      control instanceof HTMLTextAreaElement ||
      control instanceof HTMLSelectElement
        ? control.name
        : ""),
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

export function readHostFieldDisplayValue(control: Element | null): string {
  if (!(control instanceof HTMLElement)) {
    return "";
  }

  if (control instanceof HTMLInputElement || control instanceof HTMLTextAreaElement) {
    return normalizeSlackFieldText(control.value || "");
  }

  if (control instanceof HTMLSelectElement) {
    const selectedOption =
      control.selectedIndex >= 0 ? control.options[control.selectedIndex] : null;
    const selectedText =
      selectedOption instanceof HTMLOptionElement
        ? normalizeSlackFieldText(selectedOption.textContent || "")
        : "";

    return selectedText || normalizeSlackFieldText(control.value || "");
  }

  const valueSnapshots = [
    control.getAttribute("data-value") || "",
    control.getAttribute("aria-valuetext") || "",
    control.textContent || "",
    control.getAttribute("aria-label") || "",
    control.getAttribute("title") || "",
  ];
  const firstFilled = valueSnapshots
    .map((snapshot) => normalizeSlackFieldText(snapshot))
    .find((snapshot) => Boolean(snapshot));
  if (firstFilled) {
    return firstFilled;
  }

  return "";
}
