// 호스트 페이지의 "남은 시간" 요약 블록을 찾는다.
//
// lms+ 예약 페이지는 이미 같은 숫자를 보여준다. 다만 텍스트뿐이라 한눈에
// 들어오지 않는다. 그 자리를 우리 UI(막대 + 예약 후 잔여 미리보기)로 바꾼다.
//
// 호스트 마크업에 기대는 코드다. 구조가 바뀌면 못 찾는데, 그때는 아무것도 하지
// 않아야 한다 — 엉뚱한 요소를 숨기면 페이지 정보가 사라진다. 그래서 라벨 두 개를
// 모두 확인하고, 확신이 없으면 null 을 준다.

import { normalizeTextForMatch } from "../../utils/shared.js";

/** 이 블록임을 알아보는 라벨. 둘 다 있어야 한다. */
const MONTHLY_LABEL = "이번달남은시간";
const DAILY_LABEL = "이날남은시간";

/** 후보를 이 개수 이상 훑지 않는다. 페이지 전체 스캔 비용을 묶어 둔다. */
const MAX_CANDIDATES = 400;

function hasBothLabels(element: Element): boolean {
  const text = normalizeTextForMatch(element.textContent || "");
  return text.includes(MONTHLY_LABEL) && text.includes(DAILY_LABEL);
}

/**
 * 두 라벨을 모두 담은 가장 안쪽 요소.
 *
 * body 부터 위로 훑으면 "둘 다 포함"은 조상 전체가 참이라, 가장 깊은 것을
 * 골라야 요약 블록 자신이 잡힌다.
 */
export function findHostQuotaPanel(root: Document | HTMLElement = document): HTMLElement | null {
  const candidates = Array.from(root.querySelectorAll("div")).slice(0, MAX_CANDIDATES);

  const matched = candidates.filter(
    (candidate): candidate is HTMLDivElement =>
      candidate instanceof HTMLDivElement && hasBothLabels(candidate),
  );
  if (matched.length === 0) {
    return null;
  }

  // 가장 깊은(다른 후보를 품지 않는) 것.
  const deepest = matched.filter(
    (candidate) => !matched.some((other) => other !== candidate && candidate.contains(other)),
  );

  // 둘 이상 남으면 어느 것이 요약 블록인지 확신할 수 없다. 건드리지 않는다.
  return deepest.length === 1 ? deepest[0] : null;
}
