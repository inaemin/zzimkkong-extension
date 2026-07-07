(() => {
  if (globalThis.__zzkHostSyncShared) {
    return;
  }

  const { normalizeTextForMatch } = globalThis.__zzkSharedUtils;
  const { normalizeSlackFieldText } = globalThis.__zzkSlackShared;
  const { TARGET_ROOM_NAMES } = globalThis.__zzkSharedConstants;

  function getInputAssociatedLabelText(input) {
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

  function buildHostInputDescriptor(input) {
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

  function normalizeHostReservationOwnerCandidate(value) {
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

  function normalizeHostRoomCandidate(rawName) {
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

  function extractKnownRoomName(rawName) {
    const normalized = normalizeTextForMatch(rawName);
    const matchedKnownRoom = TARGET_ROOM_NAMES.find((roomName) => {
      return normalized.includes(normalizeTextForMatch(roomName));
    });
    if (matchedKnownRoom) {
      return matchedKnownRoom;
    }

    return normalizeSlackFieldText(rawName);
  }

  function getControlAssociatedLabelText(control) {
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
      const forLabelCandidates = Array.from(document.querySelectorAll("label[for]")).filter((label) => {
        return label instanceof HTMLLabelElement && label.htmlFor === control.id;
      });
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

  function buildHostFieldDescriptor(control) {
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

  function readHostFieldDisplayValue(control) {
    if (!(control instanceof HTMLElement)) {
      return "";
    }

    if (control instanceof HTMLInputElement || control instanceof HTMLTextAreaElement) {
      return normalizeSlackFieldText(control.value || "");
    }

    if (control instanceof HTMLSelectElement) {
      const selectedOption = control.selectedIndex >= 0 ? control.options[control.selectedIndex] : null;
      if (selectedOption instanceof HTMLOptionElement) {
        const selectedText = normalizeSlackFieldText(selectedOption.textContent || "");
        if (selectedText) {
          return selectedText;
        }
      }

      return normalizeSlackFieldText(control.value || "");
    }

    const valueSnapshots = [
      control.getAttribute("data-value") || "",
      control.getAttribute("aria-valuetext") || "",
      control.textContent || "",
      control.getAttribute("aria-label") || "",
      control.getAttribute("title") || "",
    ];
    for (const snapshot of valueSnapshots) {
      const normalizedSnapshot = normalizeSlackFieldText(snapshot);
      if (normalizedSnapshot) {
        return normalizedSnapshot;
      }
    }

    return "";
  }

  globalThis.__zzkHostSyncShared = {
    getInputAssociatedLabelText,
    buildHostInputDescriptor,
    normalizeHostReservationOwnerCandidate,
    normalizeHostRoomCandidate,
    extractKnownRoomName,
    getControlAssociatedLabelText,
    buildHostFieldDescriptor,
    readHostFieldDisplayValue,
  };
})();
