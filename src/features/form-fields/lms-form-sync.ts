import {
  normalizeDateString,
  normalizeHourMinute,
  parseHourMinute,
} from "../../utils/date-time.js";
import { normalizeTextForMatch } from "../../utils/shared.js";

import { isElementVisible, queryHostDateInput } from "./host-scan.js";
import { extractKnownRoomName } from "./shared.js";

// lms+ 예약 폼에 타임블록 선택 결과를 반영하는 계층.
//
// 호스트 폼의 생김새를 아는 유일한 자리다. lms+ 는 예약 입력을 세 컨트롤로 받는다.
//  - 회의실: 이름이 적힌 <button> (선택 시 bg-primary 클래스)
//  - 시작 시간: <select>, option value 가 "HH:MM"
//  - 이용 시간: <select>, option value 가 30분 단위 개수 ("1"=30분, "2"=60분)
//
// 이 모듈은 공유 state 를 건드리지 않는다. 들어온 payload 와 DOM 만 보고 폼을
// 채운 뒤 성공 여부를 돌려준다. 덕분에 예약 목적 자동 입력·단축키 예약처럼
// "폼을 채우는" 후속 기능이 전부 여기 안에서 자란다.

/** 폼에 반영할 예약 구간. 타임블록 선택이 만들어 넘긴다. */
export interface LmsFormSyncPayload {
  date?: unknown;
  startTime?: unknown;
  endTime?: unknown;
  roomId?: unknown;
  roomName?: unknown;
}

interface Deps {
  /** 우리 UI(오버레이·런처·모달) 안쪽 요소인지. 호스트 폼만 건드리려고 거른다. */
  isInsideExtensionSurface: (target: unknown) => boolean;
  /** React 가 알아채는 방식으로 값을 넣는다(네이티브 setter + input/change). */
  setFormElementValue: (element: Element | null, value: unknown) => void;
  /**
   * 이 요청이 아직 최신 선택인지.
   *
   * 타임블록을 연속으로 누르면 앞선 sync 가 await 중에 뒤처진다. 각 await 뒤에
   * 물어보고, 뒤처졌으면 폼을 더 건드리지 않고 빠진다.
   */
  isLatestTimelineSelectionRequest: (requestId: number) => boolean;
}

/** 시작 시간 select 인지(옵션 value 가 "HH:MM"). 이용 시간 select 와 가르는 기준이다. */
function hasHourMinuteOptions(select: HTMLSelectElement): boolean {
  return Array.from(select.options).some((option) => /^\d{2}:\d{2}$/.test(option.value));
}

function hasOptionValue(select: HTMLSelectElement, value: string): boolean {
  return Array.from(select.options).some((option) => option.value === value);
}

/** 버튼이 공간 선택 드롭다운일 가능성 점수. 높을수록 유력하다. */
function scoreRoomDropdownButton(candidate: HTMLButtonElement): number {
  const descriptor = normalizeTextForMatch(
    `${candidate.textContent || ""} ${candidate.getAttribute("aria-label") || ""} ${
      candidate.getAttribute("title") || ""
    }`,
  );

  const namesSpace =
    descriptor.includes("공간") ||
    descriptor.includes("space") ||
    descriptor.includes("room") ||
    descriptor.includes("회의실");
  // 시작/종료 시간 버튼은 같은 폼 안에 있어 점수가 붙기 쉬우므로 크게 깎는다.
  const isTimePicker = descriptor.includes("시작시간") || descriptor.includes("종료시간");

  return (
    (candidate.hasAttribute("aria-expanded") ? 16 : 0) +
    (namesSpace ? 8 : 0) +
    (isTimePicker ? -12 : 0) +
    (candidate.closest("form") ? 4 : 0)
  );
}

/** 점수가 가장 높은 버튼. 확신이 없으면(8점 이하) null. */
function pickBestRoomDropdownButton(
  buttons: Element[],
  isEligible: (candidate: HTMLButtonElement) => boolean,
): HTMLButtonElement | null {
  const scored = buttons
    .filter((candidate): candidate is HTMLButtonElement => candidate instanceof HTMLButtonElement)
    .filter(isEligible)
    .map((candidate) => ({ candidate, score: scoreRoomDropdownButton(candidate) }));

  const best = scored.reduce<{ candidate: HTMLButtonElement; score: number } | null>(
    (winner, entry) => (winner === null || entry.score > winner.score ? entry : winner),
    null,
  );

  return best !== null && best.score > 8 ? best.candidate : null;
}

// DI 팩토리 래퍼: 길이가 곧 복잡도가 아니다(안쪽 함수는 개별 측정된다).
// eslint-disable-next-line max-lines-per-function
export function createLmsFormSync(deps: Deps) {
  const { isInsideExtensionSurface, setFormElementValue, isLatestTimelineSelectionRequest } = deps;

  /** 우리 UI 밖의, 눈에 보이는 버튼만 후보로 본다. */
  function isEligibleRoomDropdownButton(candidate: HTMLButtonElement): boolean {
    return !isInsideExtensionSurface(candidate) && isElementVisible(candidate);
  }

  /**
   * 호스트의 공간 선택 드롭다운 버튼.
   *
   * lms+ 는 공간을 버튼 목록으로 주지만, 화면 폭이 좁으면 드롭다운으로 접힌다.
   * 확실한 표식이 없어 여러 신호에 점수를 매겨 고르고, 확신이 없으면(8점 이하)
   * null 을 준다 — 예약 도메인에서는 엉뚱한 버튼을 누르는 것보다 미반영이 안전하다.
   */
  function findHostRoomDropdownButton(root: Document | HTMLElement = document) {
    const scopedBest = pickBestRoomDropdownButton(
      Array.from(root.querySelectorAll("button")),
      isEligibleRoomDropdownButton,
    );
    if (scopedBest !== null) {
      return scopedBest;
    }

    // 범위를 좁혀 못 찾았으면 문서 전체에서 한 번 더 본다.
    if (root === document) {
      return null;
    }
    return pickBestRoomDropdownButton(
      Array.from(document.querySelectorAll("button")),
      isEligibleRoomDropdownButton,
    );
  }

  function findLmsRoomButton(roomName: unknown) {
    const target = normalizeTextForMatch(extractKnownRoomName(roomName || "") || roomName || "");
    if (!target) {
      return null;
    }

    const labelled = Array.from(document.querySelectorAll("button"))
      .map((button) => ({ button, label: normalizeTextForMatch(button.textContent || "") }))
      .filter((entry) => entry.label !== "");

    const exact = labelled.find((entry) => entry.label === target);
    if (exact !== undefined) {
      return exact.button;
    }

    // fallback 은 "라벨이 방 이름을 포함" 한 방향만 허용한다. 반대 방향
    // (target.includes(label))은 "저장"·"선택" 같은 짧은 버튼이 방 이름에 우연히
    // 포함되면 엉뚱한 버튼을 눌러 다른 공간을 선택할 위험이 있어 제외한다.
    const fallbackCandidates =
      target.length >= 2 ? labelled.filter((entry) => entry.label.includes(target)) : [];

    // 후보가 둘 이상이면 어느 버튼인지 확신할 수 없으므로 실패로 둔다
    // (예약이라는 도메인에서 조용히 잘못된 선택보다 미반영이 안전하다).
    return fallbackCandidates.length === 1 ? fallbackCandidates[0].button : null;
  }

  function isLmsRoomButtonSelected(button: Element | null) {
    if (!(button instanceof HTMLElement)) {
      return false;
    }
    // 선택된 방 버튼은 primary 배경 클래스를 가진다.
    return button.className.includes("bg-primary");
  }

  // 시작 시간 select 는 "HH:MM" 옵션들을, 이용 시간 select 는 "1"/"2" 옵션을 갖는다.
  function findLmsStartTimeSelect(startTime: unknown) {
    const match = Array.from(document.querySelectorAll("select"))
      .filter(hasHourMinuteOptions)
      .find(
        (select) =>
          typeof startTime !== "string" || !startTime || hasOptionValue(select, startTime),
      );
    return match ?? null;
  }

  function findLmsDurationSelect() {
    // 이용 시간 select 는 30분 단위 개수를 value 로 갖는다("1","2",...).
    const match = Array.from(document.querySelectorAll("select"))
      .filter((select) => !hasHourMinuteOptions(select))
      // "1"/"2" 같은 순수 숫자 옵션이 있으면 이용 시간 select 로 본다.
      .find((select) => Array.from(select.options).some((option) => /^\d+$/.test(option.value)));
    return match ?? null;
  }

  /** payload 의 시작·종료에서 이용 시간(분)을 뽑는다. 못 구하면 null. */
  function resolveDurationMinutes(startTime: string | null, endTimeValue: unknown): number | null {
    const startMinute = startTime === null ? null : parseHourMinute(startTime);
    const endMinute = parseHourMinute(normalizeHourMinute(endTimeValue));
    if (startMinute === null || endMinute === null || endMinute <= startMinute) {
      return null;
    }
    return endMinute - startMinute;
  }

  /**
   * 날짜 input 을 맞춘다.
   *
   * 회의실 버튼 클릭으로 React 가 리렌더되기 전에 먼저 맞춰야, 날짜가 바뀐
   * 스케줄로 폼이 반영된다.
   */
  async function syncDateInput(payload: LmsFormSyncPayload): Promise<boolean> {
    const targetDate = normalizeDateString(payload.date);
    if (!targetDate) {
      return true;
    }

    const dateInput = queryHostDateInput(document, isInsideExtensionSurface);
    if (!(dateInput instanceof HTMLInputElement)) {
      return false;
    }

    setFormElementValue(dateInput, targetDate);
    const synced = normalizeDateString(dateInput.value) === targetDate;
    // React 가 날짜 변경으로 예약 목록/폼을 다시 그릴 수 있어 한 틱 기다린다.
    await waitForHostRerender();
    return synced;
  }

  /** 회의실 버튼을 고른다. 이미 선택돼 있으면 누르지 않는다. */
  async function syncRoomButton(payload: LmsFormSyncPayload): Promise<boolean> {
    const roomButton = findLmsRoomButton(payload.roomName);
    if (!(roomButton instanceof HTMLElement)) {
      return false;
    }
    if (isLmsRoomButtonSelected(roomButton)) {
      return true;
    }

    roomButton.click();
    // React 리렌더로 select 들이 새로 붙을 수 있어 한 틱 기다린다.
    await waitForHostRerender();
    return true;
  }

  function syncStartTimeSelect(startTime: string | null): boolean {
    if (!startTime) {
      return true;
    }

    const startSelect = findLmsStartTimeSelect(startTime);
    if (!(startSelect instanceof HTMLSelectElement)) {
      return false;
    }
    if (!hasOptionValue(startSelect, startTime)) {
      return false;
    }

    setFormElementValue(startSelect, startTime);
    return startSelect.value === startTime;
  }

  function syncDurationSelect(durationMinutes: number | null): boolean {
    if (durationMinutes === null || durationMinutes <= 0) {
      return true;
    }

    const durationSelect = findLmsDurationSelect();
    if (!(durationSelect instanceof HTMLSelectElement)) {
      return false;
    }

    const units = String(Math.max(1, Math.round(durationMinutes / 30)));
    if (!hasOptionValue(durationSelect, units)) {
      return false;
    }

    setFormElementValue(durationSelect, units);
    return durationSelect.value === units;
  }

  /** 호스트(React)가 다시 그릴 틈을 준다. */
  function waitForHostRerender(): Promise<void> {
    return new Promise((resolve) => {
      window.setTimeout(resolve, 60);
    });
  }

  /**
   * 타임블록 선택을 예약 폼에 반영한다.
   *
   * 네 컨트롤을 각각 맞추고, 전부 성공했을 때만 true 를 준다. 부분 반영도
   * 그대로 남긴다 — 사용자가 이어서 손으로 채울 수 있는 편이 낫다.
   */
  async function syncLmsReservationForm(
    payload: LmsFormSyncPayload,
    requestId: number | null = null,
  ): Promise<boolean> {
    // 타임블록 연속 클릭 시 이전 sync 가 나중 선택을 덮어쓰지 않도록
    // 각 await 뒤에서 최신 요청인지 확인한다.
    const isStaleRequest = () => requestId != null && !isLatestTimelineSelectionRequest(requestId);

    const startTime = normalizeHourMinute(payload.startTime);
    const durationMinutes = resolveDurationMinutes(startTime, payload.endTime);

    const dateSynced = await syncDateInput(payload);
    if (isStaleRequest()) {
      return false;
    }

    const roomSynced = await syncRoomButton(payload);
    if (isStaleRequest()) {
      return false;
    }

    const startSynced = syncStartTimeSelect(startTime);
    const durationSynced = syncDurationSelect(durationMinutes);

    return dateSynced && roomSynced && startSynced && durationSynced;
  }

  return {
    findHostRoomDropdownButton,
    findLmsRoomButton,
    isLmsRoomButtonSelected,
    findLmsStartTimeSelect,
    findLmsDurationSelect,
    syncLmsReservationForm,
  };
}
