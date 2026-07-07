(() => {
  if (globalThis.__zzkRadarShared) {
    return;
  }

  const { normalizeTextForMatch } = globalThis.__zzkSharedUtils;

  function findGuestReservationTabContainer({ isInsideExtensionSurface, isElementVisible }) {
    const buttons = Array.from(document.querySelectorAll("button")).filter(
      (candidate) =>
        candidate instanceof HTMLButtonElement &&
        !isInsideExtensionSurface(candidate),
    );

    const parentCandidates = new Set();
    buttons.forEach((button) => {
      if (button.parentElement instanceof HTMLElement) {
        parentCandidates.add(button.parentElement);
      }
    });

    let bestContainer = null;
    let bestScore = Number.NEGATIVE_INFINITY;

    parentCandidates.forEach((parent) => {
      const childButtons = Array.from(parent.children).filter(
        (child) => child instanceof HTMLButtonElement && isElementVisible(child),
      );

      if (childButtons.length < 2) {
        return;
      }

      const labels = childButtons.map((button) =>
        normalizeTextForMatch(button.textContent || ""),
      );
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

  function findGuestReservationTabStyleSource({ isInsideExtensionSurface, isElementVisible }) {
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

  globalThis.__zzkRadarShared = {
    findGuestReservationTabContainer,
    findGuestReservationTabStyleSource,
  };
})();
