(() => {
  if (globalThis.__zzkSlackWorkflow) {
    return;
  }

  function createSlackWorkflow(deps) {
    const {
      state,
      SLACK_COPY_MODAL_ID,
      SLACK_COPY_MODAL_STYLE_ID,
      SLACK_COPY_MODAL_BASECOAT_STYLE_ID,
      SLACK_COPY_MODAL_BASECOAT_STYLE_PATH,
      SLACK_CHANNEL_MENTION_STORAGE_KEY,
      SLACK_CHANNEL_HISTORY_STORAGE_KEY,
      SLACK_REMINDER_LEAD_TIME_STORAGE_KEY,
      SLACK_REMINDER_LEAD_TIME_OPTIONS,
      X_ICON_SVG,
      buildSlackReservationContext,
      setMapCalendarSuppressedBySlack,
      buildSlackReservationMessage,
      normalizeSlackFieldText,
      normalizeSlackChannelToken,
      normalizeSlackReminderLeadMinutes,
      formatSlackReminderLeadOptionLabel,
      rememberSlackChannelMention,
      forgetSlackChannelMention,
      writeStoredText,
    } = deps;

  function ensureSlackCopyModalStyle() {
    if (document.getElementById(SLACK_COPY_MODAL_STYLE_ID)) {
      return;
    }

    const runtime =
      typeof globalThis !== "undefined" &&
      globalThis.chrome &&
      globalThis.chrome.runtime
        ? globalThis.chrome.runtime
        : null;
    if (
      runtime &&
      typeof runtime.getURL === "function" &&
      !document.getElementById(SLACK_COPY_MODAL_BASECOAT_STYLE_ID)
    ) {
      const basecoatLink = document.createElement("link");
      basecoatLink.id = SLACK_COPY_MODAL_BASECOAT_STYLE_ID;
      basecoatLink.rel = "stylesheet";
      basecoatLink.href = runtime.getURL(SLACK_COPY_MODAL_BASECOAT_STYLE_PATH);
      document.head.appendChild(basecoatLink);
    }

    const style = document.createElement("style");
    style.id = SLACK_COPY_MODAL_STYLE_ID;
    style.textContent = `
      #${SLACK_COPY_MODAL_ID} {
        position: fixed;
        inset: 0;
        display: flex;
        align-items: center;
        justify-content: center;
        width: min(680px, calc(100vw - 24px));
        padding: 20px;
        border: none;
        background: transparent;
        overflow: visible;
        max-height: none;
        color: inherit;
        z-index: 2147483647;
      }

      #${SLACK_COPY_MODAL_ID}::backdrop {
        background: rgba(15, 23, 42, 0.56);
        backdrop-filter: blur(6px);
      }

      #${SLACK_COPY_MODAL_ID} .zzk-slack-copy-card {
        position: relative;
        width: 100%;
        max-height: calc(100vh - 16px);
        border: 1px solid rgba(15, 23, 42, 0.08);
        border-radius: 14px;
        background: #ffffff;
        box-shadow: 0 24px 80px rgba(15, 23, 42, 0.18), 0 2px 8px rgba(15, 23, 42, 0.06);
        overflow: visible;
        font-family: "SUIT Variable", "Pretendard", "Noto Sans KR", "Apple SD Gothic Neo", sans-serif;
        color: #0f172a;
        display: grid;
        gap: 16px;
        padding: 24px;
      }

      #${SLACK_COPY_MODAL_ID} .zzk-slack-copy-body {
        display: grid;
        gap: 16px;
      }

      #${SLACK_COPY_MODAL_ID} .zzk-slack-copy-header {
        display: grid;
        gap: 4px;
        padding-right: 40px;
      }

      #${SLACK_COPY_MODAL_ID} .zzk-slack-copy-header h2 {
        margin: 0;
        font-size: 18px;
        font-weight: 700;
        letter-spacing: -0.02em;
        line-height: 1.25;
      }

      #${SLACK_COPY_MODAL_ID} .zzk-slack-copy-close {
        position: absolute;
        top: 18px;
        right: 18px;
        display: inline-flex;
        align-items: center;
        justify-content: center;
        width: 34px;
        height: 34px;
        border: none;
        border-radius: 8px;
        background: transparent;
        color: #64748b;
        line-height: 0;
        padding: 0;
        cursor: pointer;
        transition:
          background-color 120ms ease,
          color 120ms ease,
          border-color 120ms ease,
          box-shadow 120ms ease,
          transform 120ms ease;
      }

      #${SLACK_COPY_MODAL_ID} .zzk-slack-copy-close:hover {
        background: rgba(15, 23, 42, 0.06);
        color: #0f172a;
        transform: none;
      }

      #${SLACK_COPY_MODAL_ID} .zzk-slack-copy-close:focus-visible {
        outline: 2px solid rgba(255, 136, 51, 0.18);
        outline-offset: 2px;
      }

      #${SLACK_COPY_MODAL_ID} .zzk-slack-copy-close svg {
        display: block;
        width: 14px;
        height: 14px;
      }

      #${SLACK_COPY_MODAL_ID} .zzk-slack-copy-description {
        margin: 0;
        font-size: 13px;
        font-weight: 400;
        line-height: 1.5;
        color: #64748b;
        white-space: pre-line;
      }

      #${SLACK_COPY_MODAL_ID} .zzk-slack-copy-attendee-row {
        display: grid;
        grid-template-columns: minmax(0, 1fr) auto;
        grid-template-areas:
          "label setting"
          "editor setting";
        align-items: start;
        row-gap: 4px;
        column-gap: 16px;
        padding: 0;
        border: none;
        border-radius: 0;
        background: transparent;
        box-shadow: none;
      }

      #${SLACK_COPY_MODAL_ID} .zzk-slack-copy-attendee-label {
        grid-area: label;
        font-size: 13px;
        font-weight: 600;
        color: #0f172a;
        white-space: nowrap;
      }

      #${SLACK_COPY_MODAL_ID} .zzk-slack-copy-setting-row {
        grid-area: setting;
        display: grid;
        grid-template-rows: auto auto;
        justify-items: start;
        align-content: start;
        gap: 4px;
        padding: 0;
        margin: 0 0 0 16px;
        border: none;
        border-radius: 0;
        background: transparent;
        box-shadow: none;
      }

      #${SLACK_COPY_MODAL_ID} .zzk-slack-copy-setting-label {
        font-size: 13px;
        font-weight: 600;
        color: #0f172a;
        white-space: nowrap;
      }

      #${SLACK_COPY_MODAL_ID} .zzk-slack-copy-reminder-select {
        display: block;
        height: 36px;
        min-height: 36px;
        max-height: 36px;
        width: 100%;
        padding: 0 12px;
        box-sizing: border-box;
        border: 1px solid #e2e8f0;
        border-radius: 8px;
        background: #ffffff;
        color: #0f172a;
        font-size: 13px;
      }

      #${SLACK_COPY_MODAL_ID} .zzk-slack-copy-attendee-editor {
        grid-area: editor;
        position: relative;
      }

      #${SLACK_COPY_MODAL_ID} .zzk-slack-copy-channel-combobox {
        position: relative;
        width: 100%;
      }

      #${SLACK_COPY_MODAL_ID} .zzk-slack-copy-channel-chip-wrap {
        display: flex;
        flex-wrap: wrap;
        align-items: center;
        gap: 6px;
        min-height: 36px;
        height: 36px;
        border: 1px solid #e2e8f0;
        border-radius: 8px;
        background: #ffffff;
        padding: 0 6px;
        box-sizing: border-box;
        transition:
          border-radius 120ms ease,
          box-shadow 120ms ease,
          outline-offset 120ms ease;
      }

      #${SLACK_COPY_MODAL_ID} .zzk-slack-copy-channel-combobox.is-open
        .zzk-slack-copy-channel-chip-wrap {
        border-bottom-left-radius: 8px;
        border-bottom-right-radius: 8px;
      }

      #${SLACK_COPY_MODAL_ID} .zzk-slack-copy-channel-chip-wrap:focus-within {
        border-color: #e2e8f0;
        box-shadow: none;
        outline: 3px solid rgba(255, 136, 51, 0.28);
        outline-offset: 0;
      }

      #${SLACK_COPY_MODAL_ID} .zzk-slack-copy-channel-chip {
        display: inline-flex;
        align-items: center;
        gap: 6px;
        max-width: 100%;
        border: 1px solid rgba(255, 136, 51, 0.24);
        border-radius: 999px;
        background: rgba(255, 247, 237, 0.92);
        color: #9a3412;
        font-size: 12px;
        font-weight: 600;
        line-height: 1.2;
        padding: 4px 8px;
      }

      #${SLACK_COPY_MODAL_ID} .zzk-slack-copy-channel-chip-label {
        min-width: 0;
        overflow: hidden;
        text-overflow: ellipsis;
        white-space: nowrap;
      }

      #${SLACK_COPY_MODAL_ID} .zzk-slack-copy-channel-chip-remove {
        display: inline-flex;
        align-items: center;
        justify-content: center;
        width: 14px;
        height: 14px;
        border: none;
        background: transparent;
        color: inherit;
        font-size: 12px;
        line-height: 1;
        cursor: pointer;
        padding: 0;
        border-radius: 999px;
      }

      #${SLACK_COPY_MODAL_ID} .zzk-slack-copy-channel-chip-remove:hover {
        background: rgba(15, 23, 42, 0.08);
      }

      #${SLACK_COPY_MODAL_ID} .zzk-slack-copy-channel-input {
        display: block;
        width: auto;
        min-width: 120px;
        flex: 1 1 120px;
        height: auto;
        min-height: 0;
        max-height: none;
        padding: 0;
        margin: 0;
        box-sizing: border-box;
        border: none;
        border-radius: 0;
        background: #ffffff;
        color: #0f172a;
        font-size: 14px;
        line-height: 1.35;
        box-shadow: none;
        appearance: none;
        -webkit-appearance: none;
      }

      #${SLACK_COPY_MODAL_ID} .zzk-slack-copy-channel-input::placeholder {
        color: #94a3b8;
      }

      #${SLACK_COPY_MODAL_ID} .zzk-slack-copy-channel-input:focus,
      #${SLACK_COPY_MODAL_ID} .zzk-slack-copy-channel-input:focus-visible,
      #${SLACK_COPY_MODAL_ID} .zzk-slack-copy-reminder-select:focus,
      #${SLACK_COPY_MODAL_ID} .zzk-slack-copy-reminder-select:focus-visible {
        box-shadow: none;
        outline: none;
      }

      #${SLACK_COPY_MODAL_ID} .zzk-slack-copy-channel-suggest {
        position: absolute;
        top: calc(100% + 6px);
        left: 0;
        right: 0;
        max-height: 168px;
        overflow-y: auto;
        border: 1px solid #e2e8f0;
        border-radius: 12px;
        background: #ffffff;
        box-shadow: 0 16px 40px rgba(15, 23, 42, 0.14), 0 8px 18px rgba(15, 23, 42, 0.06);
        z-index: 3;
      }

      #${SLACK_COPY_MODAL_ID} .zzk-slack-copy-channel-suggest[hidden] {
        display: none;
      }

      #${SLACK_COPY_MODAL_ID} .zzk-slack-copy-channel-option {
        display: flex;
        align-items: center;
        justify-content: space-between;
        width: 100%;
        border: none;
        background: transparent;
        color: #0f172a;
        text-align: left;
        font-size: 13px;
        line-height: 1.35;
        padding: 9px 12px;
        cursor: pointer;
      }

      #${SLACK_COPY_MODAL_ID} .zzk-slack-copy-channel-option:hover,
      #${SLACK_COPY_MODAL_ID} .zzk-slack-copy-channel-option.is-active {
        background: #f8fafc;
      }

      #${SLACK_COPY_MODAL_ID} .zzk-slack-copy-channel-option-add {
        color: #ea580c;
        font-weight: 700;
      }

      #${SLACK_COPY_MODAL_ID} .zzk-slack-copy-channel-option-delete {
        display: inline-flex;
        align-items: center;
        justify-content: center;
        width: 18px;
        height: 18px;
        border: none;
        background: transparent;
        color: #94a3b8;
        border-radius: 999px;
        padding: 0;
        line-height: 0;
        cursor: pointer;
      }

      #${SLACK_COPY_MODAL_ID} .zzk-slack-copy-channel-option-delete:hover {
        background: rgba(248, 113, 113, 0.18);
        color: #b91c1c;
      }

      #${SLACK_COPY_MODAL_ID} .zzk-slack-copy-channel-option-delete svg {
        display: block;
        width: 10px;
        height: 10px;
      }

      #${SLACK_COPY_MODAL_ID} .zzk-slack-copy-channel-empty {
        width: 100%;
        padding: 9px 12px;
        color: #64748b;
        font-size: 12px;
        line-height: 1.35;
      }

      #${SLACK_COPY_MODAL_ID} .zzk-slack-copy-textarea {
        width: 100%;
        height: 80px;
        border: 1px solid #e2e8f0;
        border-radius: 14px;
        background: #ffffff;
        color: #0f172a;
        font-size: 13px;
        line-height: 1.5;
        padding: 14px 15px;
        resize: none;
        overflow: auto;
        box-shadow: none;
        font-family: "SUIT Variable", "Pretendard", "Noto Sans KR", "Apple SD Gothic Neo", sans-serif;
      }

      #${SLACK_COPY_MODAL_ID} .zzk-slack-copy-textarea:focus,
      #${SLACK_COPY_MODAL_ID} .zzk-slack-copy-textarea:focus-visible {
        border-color: #e2e8f0;
        box-shadow: none;
        outline: 3px solid rgba(255, 136, 51, 0.28);
        outline-offset: 2px;
      }

      #${SLACK_COPY_MODAL_ID} .zzk-slack-copy-button {
        border: 1px solid #e2e8f0;
        border-radius: 10px;
        background: #ffffff;
        color: #334155;
        font-size: 13px;
        font-weight: 700;
        line-height: 1;
        min-height: 40px;
        padding: 10px 16px;
        cursor: pointer;
        box-shadow: none;
        transition:
          background-color 120ms ease,
          border-color 120ms ease,
          color 120ms ease,
          box-shadow 120ms ease,
          transform 120ms ease;
      }

      #${SLACK_COPY_MODAL_ID} .zzk-slack-copy-button:focus-visible {
        outline: 2px solid rgba(255, 136, 51, 0.18);
        outline-offset: 2px;
      }

      #${SLACK_COPY_MODAL_ID} .zzk-slack-copy-button.outline {
        background: #ffffff;
        color: #475569;
      }

      #${SLACK_COPY_MODAL_ID} .zzk-slack-copy-button.primary {
        border-color: #ff8833;
        background: #ff8833;
        color: #ffffff;
        box-shadow: 0 10px 20px rgba(255, 136, 51, 0.22);
      }

      #${SLACK_COPY_MODAL_ID} .zzk-slack-copy-button:hover {
        border-color: #cbd5e1;
        background: #f8fafc;
        color: #0f172a;
        box-shadow: none;
        transform: translateY(-1px);
      }

      #${SLACK_COPY_MODAL_ID} .zzk-slack-copy-button.primary:hover {
        border-color: #ea7b2e;
        background: #ea7b2e;
        box-shadow: 0 12px 24px rgba(255, 136, 51, 0.24);
      }

      #${SLACK_COPY_MODAL_ID} .zzk-slack-copy-button:disabled {
        background: #e2e8f0;
        border-color: #cbd5e1;
        color: #94a3b8;
        cursor: not-allowed;
      }

      #${SLACK_COPY_MODAL_ID} .zzk-slack-copy-button.primary:disabled {
        background: #fdba74;
        border-color: #fdba74;
        color: #ffffff;
      }

      #${SLACK_COPY_MODAL_ID} .zzk-slack-copy-footer {
        display: flex;
        align-items: center;
        justify-content: space-between;
        gap: 12px;
        margin-top: 16px;
        margin-left: -24px;
        margin-right: -24px;
        margin-bottom: -24px;
        padding: 16px 24px 24px;
        border-top: 1px solid rgba(226, 232, 240, 0.9);
        background: rgba(255, 255, 255, 0.96);
        box-shadow: 0 -8px 20px rgba(15, 23, 42, 0.04);
        border-radius: 0 0 14px 14px;
      }

      #${SLACK_COPY_MODAL_ID} .zzk-slack-copy-status {
        margin: 0;
        min-height: 20px;
        flex: 1;
        font-size: 13px;
        font-weight: 400;
        line-height: 1.45;
        color: #64748b;
        text-align: left;
      }

      @media (max-width: 640px) {
        #${SLACK_COPY_MODAL_ID} {
          padding: 12px;
          width: calc(100vw - 24px);
        }

        #${SLACK_COPY_MODAL_ID} .zzk-slack-copy-card {
          width: calc(100vw - 24px);
          max-height: calc(100vh - 16px);
          border-radius: 12px;
          padding: 16px;
          gap: 12px;
        }

        #${SLACK_COPY_MODAL_ID} .zzk-slack-copy-footer {
          margin-left: -16px;
          margin-right: -16px;
          margin-bottom: -16px;
          padding: 16px 16px 16px;
          border-radius: 0 0 12px 12px;
        }

        #${SLACK_COPY_MODAL_ID} .zzk-slack-copy-header h2 {
          font-size: 17px;
        }
      }

      #${SLACK_COPY_MODAL_ID} .zzk-slack-copy-status[data-state='success'] {
        color: #0f766e;
      }

      #${SLACK_COPY_MODAL_ID} .zzk-slack-copy-status[data-state='error'] {
        color: #b91c1c;
      }
    `;
    document.head.appendChild(style);
  }

  function showSlackCopyModal(context) {
    if (!(document.body instanceof HTMLBodyElement)) {
      return;
    }

    ensureSlackCopyModalStyle();
    closeSlackCopyModal({ restoreMapCalendar: false });
    state.slackModalVisible = true;
    setMapCalendarSuppressedBySlack(true);

    const baseContext =
      context && typeof context === "object"
        ? { ...context }
        : buildSlackReservationContext();
    if (typeof baseContext.channelMention !== "string") {
      baseContext.channelMention = state.slackChannelMention || "";
    }

    let selectedChannelMention = normalizeSlackChannelToken(
      baseContext.channelMention,
      { allowBare: true },
    );
    let selectedReminderLeadMinutes = normalizeSlackReminderLeadMinutes(
      state.slackReminderLeadMinutes,
    );

    const overlay = document.createElement("dialog");
    overlay.id = SLACK_COPY_MODAL_ID;
    overlay.className = "dialog";
    overlay.setAttribute("role", "dialog");
    overlay.setAttribute("aria-modal", "true");
    overlay.setAttribute("aria-label", "슬랙 메시지 복사");

    const card = document.createElement("div");
    card.className = "zzk-slack-copy-card";
    const stopPropagation = (event) => {
      event.stopPropagation();
    };
    [
      "pointerdown",
      "mousedown",
      "mouseup",
      "click",
      "dblclick",
      "touchstart",
      "touchend",
    ].forEach((eventName) => {
      card.addEventListener(eventName, stopPropagation);
    });
    card.addEventListener("wheel", stopPropagation, { passive: true });

    const header = document.createElement("header");
    header.className = "zzk-slack-copy-header";
    const title = document.createElement("h2");
    title.textContent = "슬랙 메시지 복사";

    const description = document.createElement("p");
    description.className = "zzk-slack-copy-description";
    description.textContent =
      "Slack에 붙여넣기 전에 내용을 한 번만 확인해 주세요.\n채널을 입력하면 해당 채널을 대상으로 한 줄짜리 /remind 명령을 생성합니다.\n내가 받은 리마인더는 Later 탭에서 볼 수 있고, /remind list에는 채널 리마인더만 보여요.";

    const body = document.createElement("section");
    body.className = "zzk-slack-copy-body form";

    const closeIconButton = document.createElement("button");
    closeIconButton.type = "button";
    closeIconButton.className = "zzk-slack-copy-close";
    closeIconButton.innerHTML = X_ICON_SVG;
    closeIconButton.setAttribute("aria-label", "닫기");
    closeIconButton.title = "닫기";
    closeIconButton.addEventListener("click", () => {
      closeSlackCopyModal();
    });
    header.append(title, closeIconButton);

    const channelRow = document.createElement("div");
    channelRow.className = "zzk-slack-copy-attendee-row field";

    const channelLabel = document.createElement("label");
    channelLabel.className = "zzk-slack-copy-attendee-label label";
    channelLabel.textContent = "리마인드 채널";

    const channelEditor = document.createElement("div");
    channelEditor.className = "zzk-slack-copy-attendee-editor";

    const channelCombobox = document.createElement("div");
    channelCombobox.className = "zzk-slack-copy-channel-combobox";

    const channelChipWrap = document.createElement("div");
    channelChipWrap.className = "zzk-slack-copy-channel-chip-wrap";

    const channelInput = document.createElement("input");
    channelInput.className = "zzk-slack-copy-channel-input";
    channelInput.type = "text";
    channelInput.placeholder = "#채널명";
    channelInput.value = "";

    const channelSuggestionList = document.createElement("div");
    channelSuggestionList.className = "zzk-slack-copy-channel-suggest";
    channelSuggestionList.hidden = true;

    channelChipWrap.append(channelInput);
    channelCombobox.append(channelChipWrap, channelSuggestionList);
    channelEditor.append(channelCombobox);
    channelRow.append(channelLabel, channelEditor);

    const reminderRow = document.createElement("div");
    reminderRow.className = "zzk-slack-copy-setting-row field";

    const reminderLabel = document.createElement("label");
    reminderLabel.className = "zzk-slack-copy-setting-label label";
    reminderLabel.textContent = "알림 시점";

    const reminderSelect = document.createElement("select");
    reminderSelect.className = "zzk-slack-copy-reminder-select input";
    reminderSelect.setAttribute("aria-label", "슬랙 리마인드 알림 시점 선택");
    reminderSelect.id = "zzk-slack-reminder-lead-time";
    reminderLabel.htmlFor = reminderSelect.id;
    SLACK_REMINDER_LEAD_TIME_OPTIONS.forEach((minutes) => {
      const option = document.createElement("option");
      option.value = String(minutes);
      option.textContent = formatSlackReminderLeadOptionLabel(minutes);
      option.selected = minutes === selectedReminderLeadMinutes;
      reminderSelect.appendChild(option);
    });
    reminderRow.append(reminderLabel, reminderSelect);
    channelRow.append(reminderRow);

    const textarea = document.createElement("textarea");
    textarea.className = "zzk-slack-copy-textarea textarea";
    textarea.readOnly = true;
    textarea.setAttribute("aria-label", "슬랙에 붙여넣을 예약 메시지");

    const copyButton = document.createElement("button");
    copyButton.type = "button";
    copyButton.className = "zzk-slack-copy-button btn primary";
    copyButton.textContent = "복사하기";

    const footer = document.createElement("footer");
    footer.className = "zzk-slack-copy-footer";

    const status = document.createElement("p");
    status.className = "zzk-slack-copy-status";
    status.dataset.state = "idle";
    status.textContent = "";

    footer.append(status, copyButton);

    const setStatusMessage = (message, stateName = "idle") => {
      status.dataset.state = stateName;
      status.textContent = typeof message === "string" ? message : "";
    };

    let channelSuggestionsVisible = false;
    let channelSuggestionTokens = [];
    let activeChannelSuggestionIndex = -1;

    const normalizeTypedChannel = () => {
      const rawValue = channelInput.value.trim();
      return rawValue ? normalizeSlackChannelToken(rawValue, { allowBare: true }) : "";
    };

    const renderSelectedChannelChip = () => {
      channelChipWrap
        .querySelectorAll(".zzk-slack-copy-channel-chip")
        .forEach((node) => node.remove());

      channelInput.placeholder = selectedChannelMention ? "채널 변경 또는 새 채널 추가" : "#채널명";

      if (!selectedChannelMention) {
        return;
      }

      const chip = document.createElement("span");
      chip.className = "zzk-slack-copy-channel-chip";

      const chipLabel = document.createElement("span");
      chipLabel.className = "zzk-slack-copy-channel-chip-label";
      chipLabel.textContent = selectedChannelMention;

      const removeButton = document.createElement("button");
      removeButton.type = "button";
      removeButton.className = "zzk-slack-copy-channel-chip-remove";
      removeButton.innerHTML = X_ICON_SVG;
      removeButton.setAttribute("aria-label", `${selectedChannelMention} 제거`);
      removeButton.addEventListener("click", () => {
        selectedChannelMention = "";
        persistChannelMention();
        refreshPreviewText();
        renderSelectedChannelChip();
        refreshChannelSuggestions();
        channelInput.focus();
      });

      chip.append(chipLabel, removeButton);
      channelChipWrap.insertBefore(chip, channelInput);
    };

    const persistChannelMention = () => {
      state.slackChannelMention = selectedChannelMention;
      writeStoredText(SLACK_CHANNEL_MENTION_STORAGE_KEY, selectedChannelMention);
      return selectedChannelMention;
    };

    const persistReminderLeadMinutes = () => {
      state.slackReminderLeadMinutes = selectedReminderLeadMinutes;
      writeStoredText(
        SLACK_REMINDER_LEAD_TIME_STORAGE_KEY,
        String(selectedReminderLeadMinutes),
      );
      return selectedReminderLeadMinutes;
    };

    const getFilteredChannelSuggestions = (queryValue) => {
      const normalizedQuery = normalizeSlackFieldText(queryValue).toLowerCase();
      const sourceTokens = Array.isArray(state.slackChannelHistory)
        ? state.slackChannelHistory
        : [];
      if (!normalizedQuery) {
        return sourceTokens.slice();
      }

      return sourceTokens.filter((token) => token.toLowerCase().includes(normalizedQuery));
    };

    const hideChannelSuggestions = () => {
      channelSuggestionsVisible = false;
      channelSuggestionTokens = [];
      activeChannelSuggestionIndex = -1;
      channelSuggestionList.hidden = true;
      channelSuggestionList.textContent = "";
      channelCombobox.classList.remove("is-open");
    };

    const syncActiveChannelSuggestion = () => {
      const options = Array.from(
        channelSuggestionList.querySelectorAll(".zzk-slack-copy-channel-option"),
      );
      options.forEach((option) => {
        const index = Number(option.getAttribute("data-option-index"));
        const isActive = Number.isInteger(index) && index === activeChannelSuggestionIndex;
        option.classList.toggle("is-active", isActive);
        if (isActive) {
          option.scrollIntoView({ block: "nearest" });
        }
      });
    };

    const renderChannelSuggestions = () => {
      channelSuggestionList.textContent = "";
      if (!channelSuggestionsVisible) {
        channelSuggestionList.hidden = true;
        return;
      }

      const typedChannel = normalizeTypedChannel();
      const canAddTypedChannel =
        typedChannel && !channelSuggestionTokens.includes(typedChannel);
      let addIndex = -1;

      if (channelSuggestionTokens.length === 0 && !canAddTypedChannel) {
        const empty = document.createElement("div");
        empty.className = "zzk-slack-copy-channel-empty";
        empty.textContent = "저장된 채널이 없습니다.";
        channelSuggestionList.appendChild(empty);
        channelSuggestionList.hidden = false;
        return;
      }

      if (canAddTypedChannel) {
        addIndex = channelSuggestionTokens.length;
        channelSuggestionTokens = channelSuggestionTokens.concat(typedChannel);
        const addOption = document.createElement("button");
        addOption.type = "button";
        addOption.className = "zzk-slack-copy-channel-option";
        addOption.setAttribute("data-option-index", String(addIndex));

        const addLabel = document.createElement("span");
        addLabel.textContent = typedChannel;
        const addBadge = document.createElement("span");
        addBadge.className = "zzk-slack-copy-channel-option-add";
        addBadge.textContent = "추가";
        addOption.append(addLabel, addBadge);

        addOption.addEventListener("mouseenter", () => {
          activeChannelSuggestionIndex = addIndex;
          syncActiveChannelSuggestion();
        });
        addOption.addEventListener("click", (event) => {
          event.preventDefault();
          selectedChannelMention = typedChannel;
          channelInput.value = "";
          persistChannelMention();
          rememberSlackChannelMention(typedChannel);
          renderSelectedChannelChip();
          refreshPreviewText();
          hideChannelSuggestions();
          channelInput.focus();
        });
        channelSuggestionList.appendChild(addOption);
      }

      channelSuggestionTokens.forEach((token, index) => {
        if (canAddTypedChannel && token === typedChannel && index === addIndex) {
          return;
        }
        const option = document.createElement("button");
        option.type = "button";
        option.className = "zzk-slack-copy-channel-option";
        option.setAttribute("data-option-index", String(index));
        const optionLabel = document.createElement("span");
        optionLabel.textContent = token;
        option.appendChild(optionLabel);
        option.addEventListener("mouseenter", () => {
          activeChannelSuggestionIndex = index;
          syncActiveChannelSuggestion();
        });
        option.addEventListener("click", (event) => {
          event.preventDefault();
          selectedChannelMention = token;
          channelInput.value = "";
          persistChannelMention();
          rememberSlackChannelMention(token);
          renderSelectedChannelChip();
          refreshPreviewText();
          hideChannelSuggestions();
          channelInput.focus();
        });

        const deleteButton = document.createElement("button");
        deleteButton.type = "button";
        deleteButton.className = "zzk-slack-copy-channel-option-delete";
        deleteButton.innerHTML = X_ICON_SVG;
        deleteButton.setAttribute("aria-label", `${token} 채널 삭제`);
        deleteButton.addEventListener("click", (event) => {
          event.preventDefault();
          event.stopPropagation();
          forgetSlackChannelMention(token);
          if (selectedChannelMention === token) {
            selectedChannelMention = "";
            persistChannelMention();
            renderSelectedChannelChip();
            refreshPreviewText();
          }
          refreshChannelSuggestions();
          channelInput.focus();
        });
        option.appendChild(deleteButton);

        channelSuggestionList.appendChild(option);
      });

      activeChannelSuggestionIndex = channelSuggestionTokens.length > 0 ? 0 : -1;
      syncActiveChannelSuggestion();
      channelSuggestionList.hidden = false;
      channelCombobox.classList.add("is-open");
    };

    const refreshChannelSuggestions = () => {
      channelSuggestionTokens = getFilteredChannelSuggestions(channelInput.value);
      channelSuggestionsVisible = true;
      renderChannelSuggestions();
    };

    const commitActiveChannelSuggestion = () => {
      const nextToken = channelSuggestionTokens[activeChannelSuggestionIndex];
      if (!nextToken) {
        return false;
      }
      selectedChannelMention = nextToken;
      channelInput.value = "";
      persistChannelMention();
      rememberSlackChannelMention(nextToken);
      renderSelectedChannelChip();
      refreshPreviewText();
      hideChannelSuggestions();
      return true;
    };

    const moveActiveChannelSuggestion = (delta) => {
      if (!channelSuggestionsVisible || channelSuggestionTokens.length === 0) {
        return false;
      }

      if (
        !Number.isInteger(activeChannelSuggestionIndex) ||
        activeChannelSuggestionIndex < 0
      ) {
        activeChannelSuggestionIndex = delta >= 0 ? 0 : channelSuggestionTokens.length - 1;
      } else {
        const size = channelSuggestionTokens.length;
        activeChannelSuggestionIndex = (activeChannelSuggestionIndex + delta + size) % size;
      }
      syncActiveChannelSuggestion();
      return true;
    };

    const commitTypedChannel = () => {
      const typedChannel = normalizeTypedChannel();
      if (!typedChannel) {
        return false;
      }

      selectedChannelMention = typedChannel;
      channelInput.value = "";
      persistChannelMention();
      rememberSlackChannelMention(typedChannel);
      renderSelectedChannelChip();
      refreshPreviewText();
      hideChannelSuggestions();
      return true;
    };

    const buildPreviewText = () => {
      return buildSlackReservationMessage({
        ...baseContext,
        channelMention: selectedChannelMention,
        reminderLeadMinutes: selectedReminderLeadMinutes,
      });
    };

    const refreshPreviewText = () => {
      textarea.value = buildPreviewText();
    };

    channelInput.addEventListener("input", () => {
      refreshPreviewText();
      refreshChannelSuggestions();
    });

    channelInput.addEventListener("focus", () => {
      refreshChannelSuggestions();
    });

    channelInput.addEventListener("click", () => {
      refreshChannelSuggestions();
    });

    channelChipWrap.addEventListener("click", (event) => {
      const target = event.target;
      if (
        target instanceof Element &&
        target.closest(".zzk-slack-copy-channel-chip-remove")
      ) {
        return;
      }

      channelInput.focus();
      refreshChannelSuggestions();
    });

    channelInput.addEventListener("blur", () => {
      window.setTimeout(() => {
        const activeElement = document.activeElement;
        if (activeElement === channelInput) {
          return;
        }
        if (
          activeElement instanceof Element &&
          channelSuggestionList.contains(activeElement)
        ) {
          return;
        }
        hideChannelSuggestions();
      }, 120);
    });

    channelInput.addEventListener("keydown", (event) => {
      if (event.key === "ArrowDown") {
        if (!channelSuggestionsVisible) {
          refreshChannelSuggestions();
        }
        if (moveActiveChannelSuggestion(1)) {
          event.preventDefault();
        }
        return;
      }

      if (event.key === "ArrowUp") {
        if (!channelSuggestionsVisible) {
          refreshChannelSuggestions();
        }
        if (moveActiveChannelSuggestion(-1)) {
          event.preventDefault();
        }
        return;
      }

      if (event.key === "Enter" && event.isComposing !== true) {
        if (commitActiveChannelSuggestion()) {
          event.preventDefault();
        }
        return;
      }

      if (event.key === "Escape") {
        hideChannelSuggestions();
      }
    });

    reminderSelect.addEventListener("change", () => {
      selectedReminderLeadMinutes = normalizeSlackReminderLeadMinutes(
        reminderSelect.value,
      );
      reminderSelect.value = String(selectedReminderLeadMinutes);
      persistReminderLeadMinutes();
      refreshPreviewText();
    });

    copyButton.addEventListener("click", async () => {
      if (!selectedChannelMention) {
        commitTypedChannel();
      } else {
        persistChannelMention();
        rememberSlackChannelMention(selectedChannelMention);
        renderSelectedChannelChip();
      }
      refreshPreviewText();
      const copied = await copyTextToClipboard(textarea.value, textarea);
      if (copied) {
        status.dataset.state = "success";
        status.textContent = "복사 완료! Slack 채널에 붙여넣어 주세요.";
        return;
      }

      status.dataset.state = "error";
      status.textContent = "복사에 실패했습니다. 직접 선택해서 복사해 주세요.";
    });

    setStatusMessage(
      selectedChannelMention
        ? `${selectedChannelMention} 채널로 리마인드를 생성합니다.`
        : "채널을 입력하면 해당 채널용 /remind 명령이 생성됩니다.",
      selectedChannelMention ? "success" : "idle",
    );
    reminderSelect.value = String(selectedReminderLeadMinutes);
    persistChannelMention();
    persistReminderLeadMinutes();
    renderSelectedChannelChip();
    refreshPreviewText();

    body.append(description, channelRow, textarea);
    card.append(header, body, footer);
    overlay.appendChild(card);

    overlay.addEventListener("click", (event) => {
      if (event.target === overlay) {
        closeSlackCopyModal();
      }
    });

    overlay.addEventListener("cancel", (event) => {
      event.preventDefault();
      closeSlackCopyModal();
    });

    document.body.appendChild(overlay);
    if (
      overlay instanceof HTMLDialogElement &&
      typeof overlay.showModal === "function"
    ) {
      overlay.showModal();
    }
    const keydownHandler = (event) => {
      if (event.key === "Escape") {
        event.preventDefault();
        closeSlackCopyModal();
      }
    };
    state.slackModalKeydownHandler = keydownHandler;
    document.addEventListener("keydown", keydownHandler, true);
  }

  function closeSlackCopyModal(options = {}) {
    const restoreMapCalendar =
      !(options && typeof options === "object") ||
      options.restoreMapCalendar !== false;

    const modal = document.getElementById(SLACK_COPY_MODAL_ID);
    if (modal) {
      modal.remove();
    }

    if (typeof state.slackModalKeydownHandler === "function") {
      document.removeEventListener(
        "keydown",
        state.slackModalKeydownHandler,
        true,
      );
      state.slackModalKeydownHandler = null;
    }

    if (restoreMapCalendar) {
      state.slackModalVisible = false;
      setMapCalendarSuppressedBySlack(false);
    }
  }

  async function copyTextToClipboard(textValue, textAreaElement) {
    if (typeof textValue !== "string" || textValue === "") {
      return false;
    }

    if (
      navigator.clipboard &&
      typeof navigator.clipboard.writeText === "function"
    ) {
      try {
        await navigator.clipboard.writeText(textValue);
        return true;
      } catch (error) {
        const ignoredError = error;
        void ignoredError;
      }
    }

    if (textAreaElement instanceof HTMLTextAreaElement) {
      textAreaElement.focus();
      textAreaElement.select();
      try {
        return document.execCommand("copy");
      } catch (error) {
        return false;
      }
    }

    return false;
  }


    return {
      ensureSlackCopyModalStyle,
      showSlackCopyModal,
      closeSlackCopyModal,
      copyTextToClipboard,
    };
  }

  globalThis.__zzkSlackWorkflow = {
    createSlackWorkflow,
  };
})();
