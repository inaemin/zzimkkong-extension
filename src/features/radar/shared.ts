import { normalizeTextForMatch } from "../../utils/shared.js";

// 호스트 페이지 DOM 을 훑는 헬퍼들이라 판별 함수를 주입받는다.
// (확장이 만든 요소를 건너뛰고, 실제로 보이는 것만 후보로 삼는다)
interface DomProbes {
  isInsideExtensionSurface: (node: Element) => boolean;
  isElementVisible: (node: Element) => boolean;
}

export function findGuestReservationTabContainer({
  isInsideExtensionSurface,
  isElementVisible,
}: DomProbes): HTMLElement | null {
  const buttons = Array.from(document.querySelectorAll("button")).filter(
    (candidate) => candidate instanceof HTMLButtonElement && !isInsideExtensionSurface(candidate),
  );

  const parentCandidates = new Set<HTMLElement>();
  buttons.forEach((button) => {
    if (button.parentElement instanceof HTMLElement) {
      parentCandidates.add(button.parentElement);
    }
  });

  let bestContainer: HTMLElement | null = null;
  let bestScore = Number.NEGATIVE_INFINITY;

  parentCandidates.forEach((parent) => {
    const childButtons = Array.from(parent.children).filter(
      (child) => child instanceof HTMLButtonElement && isElementVisible(child),
    );

    if (childButtons.length < 2) {
      return;
    }

    const labels = childButtons.map((button) => normalizeTextForMatch(button.textContent || ""));
    const hasReserve = labels.some((label) => label === "예약하기");
    const hasStatus = labels.some((label) => label === "예약현황");
    if (!hasReserve || !hasStatus) {
      return;
    }

    let score = 0;
    score += 20;
    if (childButtons.length <= 4) {
      score += 6;
    }
    if (isElementVisible(parent)) {
      score += 4;
    }
    if (parent.closest("aside, nav, section")) {
      score += 3;
    }

    if (score > bestScore) {
      bestScore = score;
      bestContainer = parent;
    }
  });

  return bestContainer;
}

export function findGuestReservationTabStyleSource({
  isInsideExtensionSurface,
  isElementVisible,
}: DomProbes): HTMLButtonElement | null {
  const actionContainer = findGuestReservationTabContainer({
    isInsideExtensionSurface,
    isElementVisible,
  });
  if (!(actionContainer instanceof HTMLElement)) {
    return null;
  }

  const buttonCandidates = Array.from(actionContainer.children).filter(
    (child) => child instanceof HTMLButtonElement && isElementVisible(child),
  );

  const prioritized = buttonCandidates.find((button) => {
    const text = normalizeTextForMatch(button.textContent || "");
    return text === "예약하기" || text === "예약현황";
  });

  return prioritized instanceof HTMLButtonElement
    ? prioritized
    : buttonCandidates[0] instanceof HTMLButtonElement
      ? buttonCandidates[0]
      : null;
}
