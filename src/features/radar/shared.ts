import { normalizeTextForMatch } from "../../utils/shared.js";

// 호스트 페이지 DOM 을 훑는 헬퍼들이라 판별 함수를 주입받는다.
// (확장이 만든 요소를 건너뛰고, 실제로 보이는 것만 후보로 삼는다)
interface DomProbes {
  isInsideExtensionSurface: (node: Element) => boolean;
  isElementVisible: (node: Element) => boolean;
}

/** 우리 UI 밖의 버튼들을 담고 있는 부모 요소들. */
function collectButtonParents(
  isInsideExtensionSurface: DomProbes["isInsideExtensionSurface"],
): HTMLElement[] {
  const parents = Array.from(document.querySelectorAll("button"))
    .filter((button) => !isInsideExtensionSurface(button))
    .map((button) => button.parentElement)
    .filter((parent): parent is HTMLElement => parent instanceof HTMLElement);
  return [...new Set(parents)];
}

/**
 * "예약하기 + 예약현황" 탭 묶음처럼 보이는지 점수로 매긴다.
 *
 * 조건에 안 맞으면 빈 배열이라 flatMap 에서 그대로 걸러진다.
 */
function scoreTabContainer(
  parent: HTMLElement,
  isElementVisible: DomProbes["isElementVisible"],
): Array<{ parent: HTMLElement; score: number }> {
  const childButtons = Array.from(parent.children).filter(
    (child) => child instanceof HTMLButtonElement && isElementVisible(child),
  );
  if (childButtons.length < 2) {
    return [];
  }

  const labels = childButtons.map((button) => normalizeTextForMatch(button.textContent || ""));
  if (!labels.includes("예약하기") || !labels.includes("예약현황")) {
    return [];
  }

  const score =
    20 +
    (childButtons.length <= 4 ? 6 : 0) +
    (isElementVisible(parent) ? 4 : 0) +
    (parent.closest("aside, nav, section") ? 3 : 0);

  return [{ parent, score }];
}

export function findGuestReservationTabContainer({
  isInsideExtensionSurface,
  isElementVisible,
}: DomProbes): HTMLElement | null {
  // 후보마다 점수를 매겨 가장 높은 것을 고른다. 점수가 같으면 먼저 나온 쪽이
  // 이긴다(>= 비교라 뒤엣것이 덮어쓰지 않는다).
  const scored = collectButtonParents(isInsideExtensionSurface).flatMap((parent) =>
    scoreTabContainer(parent, isElementVisible),
  );

  const best = scored.reduce<{ parent: HTMLElement; score: number } | null>(
    (winner, candidate) => (winner && winner.score >= candidate.score ? winner : candidate),
    null,
  );
  return best?.parent ?? null;
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
