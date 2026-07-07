(() => {
  if (globalThis.__zzkRadarFormSync) {
    return;
  }

  const { pushDebugEvent, debugLog } = globalThis.__zzkSharedUtils;

  function createRadarFormSync(deps) {
    const {
      state,
      ensurePanel,
      setStatus,
      getErrorMessage,
      clampDateToMin,
      getMinimumSelectableDateForCurrentContext,
      getTodayDateInKST,
      minuteToHourMinute,
      normalizeDateInput,
      normalizeTimeInput,
      syncPanelDateNavigationState,
      getFreshScheduleCache,
      setScheduleLoadingDate,
      renderMapCalendarOverlay,
      refreshAvailability,
      parseHourMinute,
      getHostReservationRoot,
      isHostReservationRootReady,
      waitForHostReservationReady,
      isHostRoomSelectionSynced,
      findHostRoomDropdownButton,
      syncHostRoomSelection,
      queryHostDateInput,
      readHostReservationTimeValues,
      queryHostTimeInput,
      queryFallbackHostTimeInputs,
      setHostTimeByPicker,
      waitForElement,
      setFormElementValue,
      setFormElementValueSilently,
      dispatchFormElementEvents,
      normalizeDateString,
      collapseHostTimePickers,
    } = deps;

    function handleHostDateChange(event) {
      if (!state.elements) {
        ensurePanel();
      }
      if (!state.elements) {
        return;
      }

      if (!event.isTrusted) {
        return;
      }

      const target = event.target;
      if (!(target instanceof HTMLInputElement)) {
        return;
      }

      if (target.name !== "date" || !target.value) {
        return;
      }

      if (isHandlingInternalHostDateSync()) {
        return;
      }

      const minimumDate =
        typeof getMinimumSelectableDateForCurrentContext === "function"
          ? getMinimumSelectableDateForCurrentContext(target.value)
          : getTodayDateInKST();
      const normalizedDate = clampDateToMin(target.value, minimumDate);

      deps.applyPanelDateChange(normalizedDate);
    }

    function isHandlingInternalHostDateSync() {
      return Number.isInteger(state.hostDateSyncDepth) && state.hostDateSyncDepth > 0;
    }

    function createTimelineSelectionRequestId() {
      state.timelineSelectionRequestId = Number.isInteger(state.timelineSelectionRequestId)
        ? state.timelineSelectionRequestId + 1
        : 1;
      return state.timelineSelectionRequestId;
    }

    function isLatestTimelineSelectionRequest(requestId) {
      if (!Number.isInteger(requestId)) {
        return true;
      }
      return requestId === state.timelineSelectionRequestId;
    }

    function queueTimelineSelectionApply(selection) {
      if (!selection) {
        return;
      }
      pushDebugEvent("radar-form-sync", "queue-selection", {
        date: selection.date,
        roomId: selection.room?.id,
        roomName: selection.room?.name,
        startMinute: selection.startMinute,
        endMinute: selection.endMinute,
      });
      if (!state.elements) {
        ensurePanel();
      }
      if (!state.elements) {
        return;
      }

      const requestId = createTimelineSelectionRequestId();
      const hadPendingApply = state.timelineSelectionApplyTimer != null;
      clearTimeout(state.timelineSelectionApplyTimer);
      state.timelineSelectionApplyTimer = setTimeout(() => {
        state.timelineSelectionApplyTimer = null;

        if (!isLatestTimelineSelectionRequest(requestId)) {
          return;
        }

        applyTimelineReservationSelection(selection, requestId).catch((error) => {
          if (!isLatestTimelineSelectionRequest(requestId)) {
            return;
          }
          if (state.elements) {
            setStatus(getErrorMessage(error), "error");
          }
        });
      }, hadPendingApply ? 80 : 0);
    }

    function withInternalHostDateSync(task) {
      if (typeof task !== "function") {
        return undefined;
      }

      state.hostDateSyncDepth = Number.isInteger(state.hostDateSyncDepth)
        ? state.hostDateSyncDepth + 1
        : 1;

      try {
        return task();
      } finally {
        state.hostDateSyncDepth = Math.max(0, (state.hostDateSyncDepth || 1) - 1);
      }
    }

    function resetTimelineSelectionState() {
      state.slotSelection = null;
      state.slotHover = null;
      state.appliedSelection = null;
      clearTimeout(state.timelineSelectionApplyTimer);
      state.timelineSelectionApplyTimer = null;
      createTimelineSelectionRequestId();
    }

    async function applyTimelineReservationSelection(selection, requestId = state.timelineSelectionRequestId) {
      if (!isLatestTimelineSelectionRequest(requestId)) {
        return;
      }
      debugLog("radar-form-sync", "applyTimelineReservationSelection:start", {
        requestId,
        date: selection?.date,
        roomId: selection?.room?.id,
        roomName: selection?.room?.name,
      });
      if (!state.elements) {
        ensurePanel();
      }
      if (!state.elements) {
        return;
      }

      const normalizedDate = clampDateToMin(selection.date, getTodayDateInKST());
      const startTime = minuteToHourMinute(selection.startMinute);
      const endTime = minuteToHourMinute(selection.endMinute);

      state.elements.dateInput.value = normalizedDate;
      state.elements.startInput.value = startTime;
      state.elements.endInput.value = endTime;

      state.appliedSelection = {
        date: normalizedDate,
        roomId: selection.room.id,
        startMinute: selection.startMinute,
        endMinute: selection.endMinute,
      };

      normalizeDateInput(state.elements.dateInput);
      syncPanelDateNavigationState();
      normalizeTimeInput(state.elements.startInput);
      normalizeTimeInput(state.elements.endInput);

      if (!isLatestTimelineSelectionRequest(requestId)) {
        return;
      }

      const timelineSelectionCached = state.scheduleOverlayEnabled ? getFreshScheduleCache(normalizedDate) : null;
      if (timelineSelectionCached) {
        state.activeScheduleDate = normalizedDate;
        setScheduleLoadingDate(normalizedDate, false);
        renderMapCalendarOverlay(timelineSelectionCached);
      }

      const hostSynced = await syncHostReservationForm(
        {
          date: normalizedDate,
          startTime,
          endTime,
          roomId: selection.room.id,
          roomName: selection.room.name,
        },
        requestId,
      );

      if (!isLatestTimelineSelectionRequest(requestId)) {
        return;
      }

      if (!hostSynced) {
        pushDebugEvent("radar-form-sync", "sync-failed", {
          requestId,
          date: normalizedDate,
          roomId: selection.room.id,
          roomName: selection.room.name,
          startTime,
          endTime,
        });
        setStatus(
          `예약 폼 시간 반영 실패: ${normalizedDate} ${startTime}~${endTime}. 다시 한번 선택해 주세요.`,
          "error",
        );
        return;
      }

      if (!isLatestTimelineSelectionRequest(requestId)) {
        return;
      }

      clearTimeout(state.inputRefreshTimer);
      pushDebugEvent("radar-form-sync", "sync-succeeded", {
        requestId,
        date: normalizedDate,
        roomId: selection.room.id,
        roomName: selection.room.name,
        startTime,
        endTime,
      });
      refreshAvailability();
    }

    function shouldUpdateStartBeforeEnd(observedStartTime, observedEndTime, targetStartTime, targetEndTime) {
      const observedStartMinute = parseHourMinute(String(observedStartTime || ""));
      const observedEndMinute = parseHourMinute(String(observedEndTime || ""));
      const targetStartMinute = parseHourMinute(String(targetStartTime || ""));
      const targetEndMinute = parseHourMinute(String(targetEndTime || ""));

      const hasAllMinutes =
        Number.isInteger(observedStartMinute) &&
        Number.isInteger(observedEndMinute) &&
        Number.isInteger(targetStartMinute) &&
        Number.isInteger(targetEndMinute);

      if (!hasAllMinutes) {
        return true;
      }

      const startFirstKeepsValid = targetStartMinute < observedEndMinute;
      const endFirstKeepsValid = observedStartMinute < targetEndMinute;

      if (startFirstKeepsValid && !endFirstKeepsValid) {
        return true;
      }
      if (!startFirstKeepsValid && endFirstKeepsValid) {
        return false;
      }
      if (targetStartMinute === observedStartMinute && targetEndMinute !== observedEndMinute) {
        return false;
      }
      if (targetEndMinute === observedEndMinute && targetStartMinute !== observedStartMinute) {
        return true;
      }

      return targetStartMinute <= observedStartMinute;
    }

    function applyHostTimeRangeByInputs(startInput, endInput, observedStartTime, observedEndTime, targetStartTime, targetEndTime) {
      if (!(startInput instanceof HTMLInputElement) || !(endInput instanceof HTMLInputElement)) {
        return;
      }

      const startNeedsUpdate = startInput.value !== String(targetStartTime);
      const endNeedsUpdate = endInput.value !== String(targetEndTime);
      if (!startNeedsUpdate && !endNeedsUpdate) {
        return;
      }

      const updateStartFirst = shouldUpdateStartBeforeEnd(
        observedStartTime,
        observedEndTime,
        targetStartTime,
        targetEndTime,
      );

      if (updateStartFirst) {
        if (startNeedsUpdate) {
          setFormElementValueSilently(startInput, targetStartTime);
        }
        if (endNeedsUpdate) {
          setFormElementValueSilently(endInput, targetEndTime);
        }
        if (startNeedsUpdate) {
          dispatchFormElementEvents(startInput);
        }
        if (endNeedsUpdate) {
          dispatchFormElementEvents(endInput);
        }
        return;
      }

      if (endNeedsUpdate) {
        setFormElementValueSilently(endInput, targetEndTime);
      }
      if (startNeedsUpdate) {
        setFormElementValueSilently(startInput, targetStartTime);
      }
      if (endNeedsUpdate) {
        dispatchFormElementEvents(endInput);
      }
      if (startNeedsUpdate) {
        dispatchFormElementEvents(startInput);
      }
    }

    async function syncHostReservationForm(payload, requestId = state.timelineSelectionRequestId) {
      const isStaleRequest = () => !isLatestTimelineSelectionRequest(requestId);
      if (isStaleRequest()) {
        return false;
      }

      const syncStartedAt = Date.now();
      let usedPickerAutomation = false;
      let synced = false;
      let latestRoot = getHostReservationRoot();

      for (let attempt = 0; attempt < 5; attempt += 1) {
        if (isStaleRequest()) {
          return false;
        }

        latestRoot = getHostReservationRoot();

        let hostReservationRoot = latestRoot;
        const requireTimeControls = attempt === 0;
        if (!isHostReservationRootReady(hostReservationRoot, { requireTimeControls })) {
          hostReservationRoot =
            (await waitForHostReservationReady(1100, requireTimeControls)) || hostReservationRoot;
        }

        if (isStaleRequest()) {
          return false;
        }

        latestRoot = hostReservationRoot;

        const roomAlreadySynced = isHostRoomSelectionSynced(payload.roomId, payload.roomName, hostReservationRoot);
        const roomDropdownButton = findHostRoomDropdownButton(hostReservationRoot);
        const isRoomDropdownDisabled =
          roomDropdownButton instanceof HTMLButtonElement &&
          (roomDropdownButton.disabled || roomDropdownButton.getAttribute("aria-disabled") === "true");
        const shouldDeferRoomSync = !roomAlreadySynced && isRoomDropdownDisabled;

        if (!roomAlreadySynced && !shouldDeferRoomSync) {
          await syncHostRoomSelection(payload.roomId, payload.roomName, hostReservationRoot);

          if (isStaleRequest()) {
            return false;
          }

          let postRoomRoot = getHostReservationRoot();
          if (!isHostReservationRootReady(postRoomRoot, { requireTimeControls })) {
            postRoomRoot = (await waitForHostReservationReady(1100, requireTimeControls)) || postRoomRoot;
          }

          if (isStaleRequest()) {
            return false;
          }

          hostReservationRoot = postRoomRoot;
          latestRoot = hostReservationRoot;
        }

        if (isStaleRequest()) {
          return false;
        }

        if (
          deps.isHostReservationFormSynced(payload, hostReservationRoot) &&
          isHostRoomSelectionSynced(payload.roomId, payload.roomName, hostReservationRoot)
        ) {
          synced = true;
          break;
        }

        const hostDateInput = queryHostDateInput(hostReservationRoot);
        if (hostDateInput instanceof HTMLInputElement && normalizeDateString(hostDateInput.value) !== payload.date) {
          withInternalHostDateSync(() => {
            setFormElementValue(hostDateInput, payload.date);
          });
        }

        const observedBeforeWrite = readHostReservationTimeValues(hostReservationRoot);
        const startNeedsUpdate = observedBeforeWrite.startTime !== payload.startTime;
        const endNeedsUpdate = observedBeforeWrite.endTime !== payload.endTime;

        const hostStartInput = queryHostTimeInput(["start", "starttime", "start_date", "begin", "시작"], hostReservationRoot);
        const hostEndInput = queryHostTimeInput(["end", "endtime", "end_date", "finish", "종료"], hostReservationRoot, hostStartInput);
        const hasDirectTimeInputs =
          hostStartInput instanceof HTMLInputElement &&
          hostEndInput instanceof HTMLInputElement &&
          hostStartInput !== hostEndInput;

        if (hasDirectTimeInputs) {
          applyHostTimeRangeByInputs(
            hostStartInput,
            hostEndInput,
            observedBeforeWrite.startTime,
            observedBeforeWrite.endTime,
            payload.startTime,
            payload.endTime,
          );
        } else if (startNeedsUpdate || endNeedsUpdate) {
          const fallbackPair = queryFallbackHostTimeInputs(hostReservationRoot);
          if (fallbackPair) {
            applyHostTimeRangeByInputs(
              fallbackPair.startInput,
              fallbackPair.endInput,
              observedBeforeWrite.startTime,
              observedBeforeWrite.endTime,
              payload.startTime,
              payload.endTime,
            );
          } else {
            let startSet = true;
            let endSet = true;
            const updateStartFirst = shouldUpdateStartBeforeEnd(
              observedBeforeWrite.startTime,
              observedBeforeWrite.endTime,
              payload.startTime,
              payload.endTime,
            );

            if (!updateStartFirst && endNeedsUpdate) {
              usedPickerAutomation = true;
              endSet = await setHostTimeByPicker(["종료시간", "종료"], payload.endTime, hostReservationRoot);
              if (isStaleRequest()) {
                return false;
              }
            }

            if (startNeedsUpdate && (updateStartFirst || !endNeedsUpdate)) {
              usedPickerAutomation = true;
              startSet = await setHostTimeByPicker(["시작시간", "시작"], payload.startTime, hostReservationRoot);
              if (isStaleRequest()) {
                return false;
              }
            }

            if (endNeedsUpdate && updateStartFirst) {
              usedPickerAutomation = true;
              endSet = await setHostTimeByPicker(["종료시간", "종료"], payload.endTime, hostReservationRoot);
              if (isStaleRequest()) {
                return false;
              }
            }

            if (!updateStartFirst && endNeedsUpdate && startNeedsUpdate) {
              usedPickerAutomation = true;
              startSet = await setHostTimeByPicker(["시작시간", "시작"], payload.startTime, hostReservationRoot);
              if (isStaleRequest()) {
                return false;
              }
            }

            if ((startNeedsUpdate && !startSet) || (endNeedsUpdate && !endSet)) {
              const lateFallbackPair = queryFallbackHostTimeInputs(hostReservationRoot);
              if (lateFallbackPair) {
                applyHostTimeRangeByInputs(
                  lateFallbackPair.startInput,
                  lateFallbackPair.endInput,
                  observedBeforeWrite.startTime,
                  observedBeforeWrite.endTime,
                  payload.startTime,
                  payload.endTime,
                );
              }
            }
          }
        }

        if (shouldDeferRoomSync && !isHostRoomSelectionSynced(payload.roomId, payload.roomName, hostReservationRoot)) {
          await syncHostRoomSelection(payload.roomId, payload.roomName, hostReservationRoot);

          if (isStaleRequest()) {
            return false;
          }

          const postDeferredRoomRoot = getHostReservationRoot();
          if (postDeferredRoomRoot instanceof HTMLElement || postDeferredRoomRoot === document) {
            hostReservationRoot = postDeferredRoomRoot;
            latestRoot = hostReservationRoot;
          }
        }

        const settledSync = await waitForElement(
          () =>
            deps.isHostReservationFormSynced(payload, hostReservationRoot) &&
            isHostRoomSelectionSynced(payload.roomId, payload.roomName, hostReservationRoot)
              ? true
              : null,
          260,
          40,
        );

        if (isStaleRequest()) {
          return false;
        }

        synced = settledSync === true;
        if (synced) {
          break;
        }
      }

      if (!synced) {
        if (isStaleRequest()) {
          return false;
        }

        let finalRoot = latestRoot || getHostReservationRoot();
        if (!isHostReservationRootReady(finalRoot, { requireTimeControls: true })) {
          finalRoot = (await waitForHostReservationReady(900, true)) || finalRoot;
        }

        if (isStaleRequest()) {
          return false;
        }

        latestRoot = finalRoot;

        if (!isHostRoomSelectionSynced(payload.roomId, payload.roomName, finalRoot)) {
          await syncHostRoomSelection(payload.roomId, payload.roomName, finalRoot);
        }

        if (isStaleRequest()) {
          return false;
        }

        const finalDateInput = queryHostDateInput(finalRoot);
        if (finalDateInput instanceof HTMLInputElement && normalizeDateString(finalDateInput.value) !== payload.date) {
          withInternalHostDateSync(() => {
            setFormElementValue(finalDateInput, payload.date);
          });
        }

        const finalObserved = readHostReservationTimeValues(finalRoot);
        const finalFallbackPair = queryFallbackHostTimeInputs(finalRoot);
        if (finalFallbackPair) {
          applyHostTimeRangeByInputs(
            finalFallbackPair.startInput,
            finalFallbackPair.endInput,
            finalObserved.startTime,
            finalObserved.endTime,
            payload.startTime,
            payload.endTime,
          );
        }

        synced =
          deps.isHostReservationFormSynced(payload, finalRoot) &&
          isHostRoomSelectionSynced(payload.roomId, payload.roomName, finalRoot);
      }

      if (isStaleRequest()) {
        return false;
      }

      if (usedPickerAutomation && shouldCollapseHostTimePickersAfterSync(syncStartedAt)) {
        await collapseHostTimePickers(latestRoot || document);
      }

      return synced;
    }

    function shouldCollapseHostTimePickersAfterSync(syncStartedAt) {
      if (!Number.isFinite(syncStartedAt)) {
        return true;
      }

      const lastManualInteractionAt = Number(state.lastHostTimePickerManualInteractionAt || 0);
      return !Number.isFinite(lastManualInteractionAt) || lastManualInteractionAt <= syncStartedAt;
    }

    return {
      handleHostDateChange,
      isHandlingInternalHostDateSync,
      createTimelineSelectionRequestId,
      isLatestTimelineSelectionRequest,
      queueTimelineSelectionApply,
      withInternalHostDateSync,
      resetTimelineSelectionState,
      applyTimelineReservationSelection,
      syncHostReservationForm,
    };
  }

  globalThis.__zzkRadarFormSync = {
    createRadarFormSync,
  };
})();
