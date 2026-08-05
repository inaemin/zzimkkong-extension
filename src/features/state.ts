// content.js 가 만들어 모든 기능 모듈에 넘기는 공유 상태.
//
// 실제 객체는 아직 content.js(.js) 안에 있어 타입을 끌어올 수 없다. 그래서
// 여기에 형태만 선언하고 각 DI 팩토리가 이걸 참조한다. content.js 가 컴포넌트로
// 쪼개질 때 이 인터페이스가 그대로 실제 타입이 된다.
//
// 이 선언이 없으면 state 가 any 로 퍼져서 팩토리 안의 모든 접근이
// no-unsafe-member-access 로 잡힌다(실측 약 200건).

import type { SpaceTab } from "../constants/runtime.js";

/** 패널 입력 요소들. 화면에 붙지 않고 값 보관용으로만 쓴다. */
export interface PanelElements {
  dateInput: HTMLInputElement;
  startInput: HTMLInputElement;
  endInput: HTMLInputElement;
  scheduleToggle: HTMLInputElement;
}

export interface RadarState {
  mounted: boolean;
  loading: boolean;

  // 예약 현황 조회 캐시. 같은 조건이면 TTL 안에서 재사용한다.
  availabilityInflightToken: string | null;
  availabilityCache: Map<string, unknown>;
  availabilityCacheFetchedAt: Map<string, number>;
  availabilityInflightByToken: Map<string, Promise<unknown>>;
  pendingAvailabilityRefresh: boolean;
  latestRooms: unknown[];
  latestRoomsBySpaceTab: Map<string, unknown>;

  // 일별 스케줄(타임블록) 캐시.
  scheduleOverlayEnabled: boolean;
  scheduleCache: Map<string, unknown>;
  scheduleCacheFetchedAtByDate: Map<string, number>;
  scheduleInflightByDate: Map<string, Promise<unknown>>;
  lastRenderedScheduleDate: string | null;
  lastRenderedScheduleTab: SpaceTab | null;
  scheduleLoadingDate: string | null;
  scheduleLoadingTab: SpaceTab | null;
  activeScheduleDate: string | null;
  activeScheduleTab: SpaceTab | null;

  // 레이더 오버레이의 표시 상태.
  mapCalendarVisible: boolean;
  mapCalendarAlwaysOpen: boolean;
  mapCalendarSpaceTab: SpaceTab;
  mapCalendarCollapsed: boolean;
  mapCalendarWidth: number | null;
  mapCalendarCurrentTimeScrollDate: string | null;
  mapCalendarOffset: { x: number; y: number } | null;
  mapCalendarSuppressedBySlack: boolean;

  // 타임블록 선택 → 호스트 폼 반영.
  appliedSelection: unknown;
  timelineSelectionRequestId: number;
  timelineSelectionApplyTimer: number | null;
  currentSharingMapId: string | null;
  inputRefreshTimer: number | null;
  autoScheduleRefreshTimer: number | null;
  mutationGuestUiSyncTimer: number | null;

  // 호스트 페이지 감시·우회.
  topNavBypassInstalled: boolean;
  topNavForwarding: boolean;
  hostTimePickerIdleClass: string | null;
  lastHostTimePickerManualInteractionAt: number;
  hostDateSyncDepth: number;
  lastGuestRouteChangeAt: number;
  lastObservedPathname: string;
  lastObservedRouteKey: string;
  lastAutoOpenPath: string | null;
  editReservationBaselineConstraint: unknown;
  editReservationBaselinePathKey: string;
  latestMapName: string;

  // 예약 감지(MAIN world 훅 → content script).
  reservationIntentWatcherInstalled: boolean;
  reservationMessageListenerInstalled: boolean;
  reservationOwnerWatcherInstalled: boolean;
  hostTimePickerInteractionWatcherInstalled: boolean;
  historyHookInstalled: boolean;
  lastReservationActionAt: number;
  lastReservationContext: unknown;
  lastReservationAttemptId: string;
  reservationAttemptSequence: number;
  pendingReservationAttempts: Map<string, unknown>;
  lastKnownReservationOwnerName: string;

  // Slack 복사 모달.
  lastSlackModalFingerprint: string;
  lastSlackModalShownAt: number;
  pendingSlackModalContext: unknown;
  pendingSlackModalRequiresNonEditPage: boolean;
  pendingSlackModalReloadAttempted: boolean;
  pendingSlackModalTimer: number | null;
  slackModalKeydownHandler: ((event: KeyboardEvent) => void) | null;
  slackModalVisible: boolean;
  slackChannelMention: string;
  slackChannelHistory: string[];
  slackReminderLeadMinutes: number;

  lastLauncherRemountAt: number;
  /** 스크롤 위치 계산에 쓰는 마지막 타임라인. */
  mapCalendarTimelineSnapshot: unknown[];
  elements: PanelElements | null;
}
