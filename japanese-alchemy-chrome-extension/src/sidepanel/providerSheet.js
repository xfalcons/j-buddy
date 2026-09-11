let providerSheetLockState = null;

function setProviderSheetExpanded(elements, expanded) {
  const value = String(expanded);
  if (elements.providerStatusButton?.getAttribute?.('aria-expanded') === value) return;
  elements.providerStatusButton?.setAttribute('aria-expanded', value);
}

export function announceProviderStatus(elements, message = '') {
  if (!elements.providerStatusAnnouncement) return;
  const hidden = !message;
  if (
    elements.providerStatusAnnouncement.textContent === message
    && elements.providerStatusAnnouncement.hidden === hidden
  ) return;
  elements.providerStatusAnnouncement.textContent = message;
  elements.providerStatusAnnouncement.hidden = hidden;
}

export function openProviderSheet(elements) {
  const dialog = elements.providerSheet;
  if (!dialog || dialog.open) return;

  dialog.showModal?.();
  setProviderSheetExpanded(elements, true);
  elements.providerModeButtons?.[0]?.focus?.();
}

export function closeProviderSheet(elements) {
  const dialog = elements.providerSheet;
  if (!dialog || !dialog.open) {
    setProviderSheetExpanded(elements, false);
    return;
  }

  dialog.close?.();
  elements.providerStatusButton?.focus?.();
}

export function setupProviderSheetListeners(elements) {
  elements.providerStatusButton?.addEventListener('click', () => {
    openProviderSheet(elements);
  });
  elements.providerSheetCloseButton?.addEventListener('click', () => {
    closeProviderSheet(elements);
  });
  elements.providerSheet?.addEventListener('cancel', (event) => {
    event.preventDefault();
    closeProviderSheet(elements);
  });
  elements.providerSheet?.addEventListener('close', () => {
    setProviderSheetExpanded(elements, false);
  });
}

export function setProviderSheetReadOnly(elements, readOnly) {
  const controls = [
    ...(elements.providerModeButtons || []),
    elements.personalProviderApiUrl,
    elements.personalProviderApiKey,
    elements.personalProviderProtocol,
    elements.personalProviderModel,
    elements.personalProviderManualModel,
    elements.loadPersonalProviderModelsButton,
    elements.savePersonalProviderButton,
    elements.clearPersonalProviderButton,
  ];

  if (readOnly) {
    if (providerSheetLockState) return;
    providerSheetLockState = {
      controls: controls
        .filter((control) => control)
        .map((control) => ({ control, disabled: control.disabled })),
      status: elements.personalProviderStatus
        ? {
          textContent: elements.personalProviderStatus.textContent,
          hidden: elements.personalProviderStatus.hidden,
        }
        : null,
    };
  } else {
    providerSheetLockState?.controls.forEach(({ control, disabled }) => {
      control.disabled = disabled;
    });
    const status = providerSheetLockState?.status;
    if (status && elements.personalProviderStatus) {
      elements.personalProviderStatus.textContent = status.textContent;
      elements.personalProviderStatus.hidden = status.hidden;
    }
    providerSheetLockState = null;
    return;
  }

  controls.forEach((control) => {
    if (control) control.disabled = true;
  });
}
