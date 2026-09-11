function setProviderSheetExpanded(elements, expanded) {
  elements.providerStatusButton?.setAttribute('aria-expanded', String(expanded));
}

export function announceProviderStatus(elements, message = '') {
  if (!elements.providerStatusAnnouncement) return;
  elements.providerStatusAnnouncement.textContent = message;
  elements.providerStatusAnnouncement.hidden = !message;
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
  setProviderSheetExpanded(elements, false);
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

  controls.forEach((control) => {
    if (control) control.disabled = readOnly;
  });
}
