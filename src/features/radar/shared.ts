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
/** 탭 묶음다움 점수. 버튼이 적고, 보이고, 사이드 영역에 있을수록 높다. */
function scoreOf(
  parent: HTMLElement,
  buttonCount: number,
  isElementVisible: DomProbes["isElementVisible"],
): number {
  return (
    20 +
    (buttonCount <= 4 ? 6 : 0) +
    (isElementVisible(parent) ? 4 : 0) +
    (parent.closest("aside, nav, section") ? 3 : 0)
  );
}

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

  return [{ parent, score: scoreOf(parent, childButtons.length, isElementVisible) }];
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

const TAB_LABELS = ["예약하기", "예약현황"];

/** 컨테이너 직계 자식 중 보이는 버튼들. */
function visibleButtonsIn(
  container: HTMLElement,
  isElementVisible: DomProbes["isElementVisible"],
): Element[] {
  return Array.from(container.children).filter(
    (child) => child instanceof HTMLButtonElement && isElementVisible(child),
  );
}

/** 탭 버튼을 우선하고, 없으면 첫 버튼의 스타일을 빌린다. */
function pickStyleSourceButton(buttons: Element[]): HTMLButtonElement | null {
  const prioritized = buttons.find((button) =>
    TAB_LABELS.includes(normalizeTextForMatch(button.textContent || "")),
  );
  const chosen = prioritized ?? buttons[0];
  return chosen instanceof HTMLButtonElement ? chosen : null;
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
  return pickStyleSourceButton(visibleButtonsIn(actionContainer, isElementVisible));
}
