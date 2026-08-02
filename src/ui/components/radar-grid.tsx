import * as React from "react";

import { minuteToHourMinute } from "@/utils/date-time";
import type { RoomSchedule, TimelineSlot } from "@/services/lms-data/types";
import {
  buildSlotTitle,
  resolveSelectionEndIndex,
  type FloorGroup,
  type SlotState,
} from "@/features/radar/slot-model";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/ui/components/ui/tooltip";

// 레이더의 슬롯 그리드.
//
// 2-pane 구조다:
//   gridWrap(flex) = [labelPane(고정)] [timelinePane(가로 스크롤)]
// 라벨 열(층/회의실)을 스크롤 밖에 두어야 가로 스크롤바가 라벨 아래로 번지지
// 않는다. 두 pane 의 각 행은 같은 고정 높이로 그려 세로 정렬을 맞춘다.
//
// 명령형 판이던 시절에는 hover 시 라벨 행을 같이 강조하려고 두 행에 서로
// 참조(__zzkLabelRow)를 걸어 뒀다. 여기서는 같은 hover 상태로 두 pane 을 함께
// 그리므로 그 연결이 필요 없다.

/** 그리드가 그릴 한 방. 슬롯 상태는 미리 계산해서 받는다. */
export interface RadarGridRoom {
  room: RoomSchedule;
  slotStates: SlotState[];
  /** 이미 확정돼 폼에 반영된 예약 범위(있으면 파란 칸으로 표시). */
  appliedRange: { startMinute: number; endMinute: number } | null;
}

export interface RadarGridProps {
  timeline: TimelineSlot[];
  floorGroups: FloorGroup<RadarGridRoom>[];
  /** 열 너비/경계선 위치. buildMapCalendarTimelineGridLayout 결과. */
  layout: {
    templateColumns: string;
    slotColumnStarts: number[];
    boundaryColumnStarts: number[];
    trackWidth: number;
  };
  /** 라벨 pane 헤더의 두 번째 열 제목("회의실"/"페어룸"). */
  roomColumnLabel: string;

  onSlotClick: (room: RoomSchedule, startIndex: number, endIndex: number) => void;

  /** 클릭 시 기본으로 잡히는 길이(분). hover 미리보기도 같은 값을 쓴다. */
  defaultReservationMinutes: number;
  /** 회의실 이름 옆 배지. 아직 명령형이라 붙일 자리만 내준다. */
  renderRoomLabel: (container: HTMLElement | null, room: RoomSchedule) => void;
  /** 타임라인 pane. 가로 스크롤 위치를 바깥에서 읽고 되돌린다. */
  timelinePaneRef?: React.Ref<HTMLDivElement>;
  minTrackWidth: number;
}

export function RadarGrid({
  timeline,
  floorGroups,
  layout,
  roomColumnLabel,
  onSlotClick,
  defaultReservationMinutes,
  renderRoomLabel,
  timelinePaneRef,
  minTrackWidth,
}: RadarGridProps) {
  // hover 는 그리드 안에서만 쓰인다. 바깥 상태로 두면 hover 한 번에 오버레이
  // 전체가 다시 그려지는데, 여기서 들고 있으면 React 가 바뀐 행만 갱신한다.
  const [hover, setHover] = React.useState<{
    roomId: string | number;
    startMinute: number;
  } | null>(null);

  // 날짜·탭이 바뀌면 이전 hover 는 의미가 없다. 방 목록이 갈리면 지운다.
  const roomIds = floorGroups.flatMap((group) => group.rooms.map(({ room }) => room.id)).join(",");
  React.useEffect(() => {
    setHover(null);
  }, [roomIds]);

  return (
    <div className="zzk-map-calendar-grid-wrap">
      <div className="zzk-map-calendar-label-pane">
        <div className="zzk-map-calendar-grid zzk-map-calendar-label-grid">
          <div className="zzk-map-calendar-axis-row zzk-map-calendar-label-row">
            <div className="zzk-map-calendar-floor-name axis">층</div>
            <div className="zzk-map-calendar-room-name axis">{roomColumnLabel}</div>
          </div>

          {floorGroups.map((floorGroup) => (
            <div
              key={floorGroup.floorKey}
              className={`zzk-map-calendar-floor-group floor-boundary${
                floorGroup.isFloorDivider ? " floor-divider" : ""
              }`}
            >
              <div className="zzk-map-calendar-floor-name">{floorGroup.floorLabel}</div>
              <div className="zzk-map-calendar-floor-rooms">
                {floorGroup.rooms.map(({ room }) => (
                  <div
                    key={room.id}
                    className={`zzk-map-calendar-row zzk-map-calendar-label-row${
                      hover?.roomId === room.id ? " hovered" : ""
                    }`}
                  >
                    <RoomNameCell room={room} render={renderRoomLabel} />
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>

        {/* 층↔회의실 세로 구분선. 헤더부터 마지막 행까지 덮어야 해서 별도 레이어다. */}
        <div className="zzk-map-calendar-divider-layer">
          <div className="zzk-map-calendar-divider-track" />
        </div>
      </div>

      <div className="zzk-map-calendar-timeline-pane" ref={timelinePaneRef}>
        <div className="zzk-map-calendar-timeline-track" style={{ minWidth: `${minTrackWidth}px` }}>
          {/* 정시 세로 경계선. 슬롯과 같은 그리드를 써서 열을 맞춘다. */}
          <div className="zzk-map-calendar-hour-boundary-layer">
            <div
              className="zzk-map-calendar-hour-boundary-track"
              style={{ gridTemplateColumns: layout.templateColumns }}
            >
              {layout.boundaryColumnStarts
                .filter((columnStart) => Number.isInteger(columnStart) && columnStart >= 1)
                .map((columnStart) => (
                  <div
                    key={columnStart}
                    className="zzk-map-calendar-hour-boundary-cell"
                    style={{ gridColumn: String(columnStart) }}
                  />
                ))}
            </div>
          </div>

          <div className="zzk-map-calendar-grid zzk-map-calendar-timeline-grid">
            <div className="zzk-map-calendar-axis-row zzk-map-calendar-timeline-row">
              <div
                className="zzk-map-calendar-slots"
                style={{ gridTemplateColumns: layout.templateColumns }}
              >
                {timeline.map((slot, index) => (
                  <div
                    key={slot.startMinute}
                    className={`zzk-map-calendar-hour-label${slot.isHourMark ? " hour-boundary" : ""}`}
                    style={{ gridColumn: String(layout.slotColumnStarts[index]) }}
                  >
                    {slot.isHourMark ? slot.label : ""}
                  </div>
                ))}
              </div>
            </div>

            {floorGroups.map((floorGroup) => (
              <div
                key={floorGroup.floorKey}
                className={`zzk-map-calendar-floor-group floor-boundary zzk-map-calendar-floor-group-timeline${
                  floorGroup.isFloorDivider ? " floor-divider" : ""
                }`}
              >
                <div className="zzk-map-calendar-floor-rooms">
                  {floorGroup.rooms.map((gridRoom) => (
                    <RadarGridRow
                      key={gridRoom.room.id}
                      gridRoom={gridRoom}
                      layout={layout}
                      isHovered={hover?.roomId === gridRoom.room.id}
                      hoveredStartMinute={hover?.startMinute ?? null}
                      onSlotHover={(room, slot) => {
                        setHover({ roomId: room.id, startMinute: slot.startMinute });
                      }}
                      onRoomLeave={(room) => {
                        setHover((current) => (current?.roomId === room.id ? null : current));
                      }}
                      onSlotClick={onSlotClick}
                      defaultReservationMinutes={defaultReservationMinutes}
                    />
                  ))}
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

/**
 * 회의실 이름 셀.
 *
 * 이름 옆 태그 배지를 아직 명령형 함수가 그린다. 그 함수가 컨테이너를 비우고
 * 다시 채우므로, React 가 관리하는 자식과 섞이지 않게 빈 div 만 내준다.
 */
function RoomNameCell({
  room,
  render,
}: {
  room: RoomSchedule;
  render: (container: HTMLElement | null, room: RoomSchedule) => void;
}) {
  const ref = React.useRef<HTMLDivElement | null>(null);

  React.useEffect(() => {
    render(ref.current, room);
  }, [render, room]);

  return <div className="zzk-map-calendar-room-name" ref={ref} title={`공간 ID: ${room.id}`} />;
}

function RadarGridRow({
  gridRoom,
  layout,
  isHovered,
  hoveredStartMinute,
  onSlotHover,
  onRoomLeave,
  onSlotClick,
  defaultReservationMinutes,
}: {
  gridRoom: RadarGridRoom;
  layout: RadarGridProps["layout"];
  isHovered: boolean;
  hoveredStartMinute: number | null;
  onSlotHover: (room: RoomSchedule, slot: TimelineSlot) => void;
  onRoomLeave: (room: RoomSchedule) => void;
  onSlotClick: RadarGridProps["onSlotClick"];
  defaultReservationMinutes: number;
}) {
  const { room, slotStates, appliedRange } = gridRoom;

  // hover 미리보기 범위. 클릭했을 때 실제로 잡히는 범위와 같아야 한다.
  const hoverStartIndex =
    isHovered && hoveredStartMinute !== null
      ? slotStates.findIndex((slotState) => slotState.slot.startMinute === hoveredStartMinute)
      : -1;
  const hoverEndIndex = resolveSelectionEndIndex(
    slotStates,
    hoverStartIndex,
    defaultReservationMinutes,
  );

  return (
    <div
      className={`zzk-map-calendar-row zzk-map-calendar-timeline-row${isHovered ? " hovered" : ""}`}
    >
      <div
        className="zzk-map-calendar-slots"
        style={{ gridTemplateColumns: layout.templateColumns }}
        onMouseLeave={() => onRoomLeave(room)}
      >
        {slotStates.map((slotState, index) => (
          <RadarGridSlot
            key={slotState.slot.startMinute}
            room={room}
            slotState={slotState}
            columnStart={layout.slotColumnStarts[index]}
            isSelected={
              appliedRange !== null &&
              appliedRange.startMinute < slotState.slot.endMinute &&
              appliedRange.endMinute > slotState.slot.startMinute
            }
            isHoverPreview={
              hoverEndIndex >= 0 && index >= hoverStartIndex && index <= hoverEndIndex
            }
            onHover={() => onSlotHover(room, slotState.slot)}
            onClick={() => {
              const endIndex = resolveSelectionEndIndex(
                slotStates,
                index,
                defaultReservationMinutes,
              );
              if (endIndex >= 0) {
                onSlotClick(room, index, endIndex);
              }
            }}
          />
        ))}
      </div>
    </div>
  );
}

function RadarGridSlot({
  room,
  slotState,
  columnStart,
  isSelected,
  isHoverPreview,
  onHover,
  onClick,
}: {
  room: RoomSchedule;
  slotState: SlotState;
  columnStart: number;
  isSelected: boolean;
  isHoverPreview: boolean;
  onHover: () => void;
  onClick: () => void;
}) {
  const { slot, isBusy, isPastBlocked, isPastReserved, isSelectable } = slotState;

  const className = [
    "zzk-map-calendar-slot",
    isBusy ? "busy" : "free",
    isPastBlocked ? "past-blocked" : "",
    isPastReserved ? "past-reserved" : "",
    isSelected ? "selected" : "",
    isHoverPreview ? "hover-preview" : "",
  ]
    .filter(Boolean)
    .join(" ");

  return (
    <Tooltip>
      <TooltipTrigger
        render={
          <div
            className={className}
            // 슬롯 시작 시각을 남겨 두면 테스트에서 특정 블록을 집기 쉽다.
            data-zzk-slot-start={slot.label}
            style={{ gridColumn: String(columnStart) }}
            onMouseEnter={() => {
              if (isSelectable) {
                onHover();
              }
            }}
            onClick={(event: React.MouseEvent) => {
              event.preventDefault();
              event.stopPropagation();
              if (isSelectable) {
                onClick();
              }
            }}
          />
        }
      />
      <TooltipContent>
        {buildSlotTitle(room.name, slotState, minuteToHourMinute(slot.endMinute))}
      </TooltipContent>
    </Tooltip>
  );
}
