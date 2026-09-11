import {
  announceProviderStatus,
  closeProviderSheet,
  openProviderSheet,
  setupProviderSheetListeners,
} from '../src/sidepanel/providerSheet.js';

function createProviderSheetElements() {
  const listeners = new Map();
  const addListener = (element) => {
    element.addEventListener = jest.fn((type, listener) => {
      const key = `${element.name}:${type}`;
      listeners.set(key, listener);
    });
    return element;
  };
  const managedButton = addListener({ name: 'managedButton', focus: jest.fn() });
  const pill = addListener({
    name: 'pill',
    ariaExpanded: 'false',
    setAttribute: jest.fn((name, value) => {
      if (name === 'aria-expanded') pill.ariaExpanded = value;
    }),
    focus: jest.fn(),
  });
  const closeButton = addListener({ name: 'closeButton' });
  const dialog = addListener({
    name: 'dialog',
    open: false,
    showModal: jest.fn(() => {
      dialog.open = true;
    }),
    close: jest.fn(() => {
      dialog.open = false;
    }),
  });
  const status = { textContent: '', hidden: false };

  return {
    elements: {
      providerStatusButton: pill,
      providerSheet: dialog,
      providerSheetCloseButton: closeButton,
      providerStatusAnnouncement: status,
      providerModeButtons: [managedButton],
    },
    listeners,
    managedButton,
    pill,
    dialog,
    closeButton,
    status,
  };
}

describe('provider sheet controller', () => {
  test('opens a modal sheet and focuses the first route control', () => {
    const { elements, dialog, pill, managedButton } = createProviderSheetElements();

    openProviderSheet(elements);

    expect(dialog.showModal).toHaveBeenCalledTimes(1);
    expect(dialog.open).toBe(true);
    expect(pill.ariaExpanded).toBe('true');
    expect(managedButton.focus).toHaveBeenCalledTimes(1);
  });

  test('explicit close restores focus to the status pill', () => {
    const { elements, dialog, pill } = createProviderSheetElements();
    openProviderSheet(elements);

    closeProviderSheet(elements);

    expect(dialog.close).toHaveBeenCalledTimes(1);
    expect(dialog.open).toBe(false);
    expect(pill.ariaExpanded).toBe('false');
    expect(pill.focus).toHaveBeenCalledTimes(1);
  });

  test('cancel requests close the sheet and restore focus', () => {
    const { elements, listeners, dialog, pill } = createProviderSheetElements();
    setupProviderSheetListeners(elements);
    openProviderSheet(elements);
    const cancelEvent = { preventDefault: jest.fn() };

    listeners.get('dialog:cancel')(cancelEvent);

    expect(cancelEvent.preventDefault).toHaveBeenCalledTimes(1);
    expect(dialog.open).toBe(false);
    expect(pill.ariaExpanded).toBe('false');
    expect(pill.focus).toHaveBeenCalledTimes(1);
  });

  test('open and close are idempotent', () => {
    const { elements, dialog, pill } = createProviderSheetElements();

    closeProviderSheet(elements);
    expect(dialog.close).not.toHaveBeenCalled();
    expect(pill.focus).not.toHaveBeenCalled();

    openProviderSheet(elements);
    openProviderSheet(elements);
    expect(dialog.showModal).toHaveBeenCalledTimes(1);

    closeProviderSheet(elements);
    closeProviderSheet(elements);
    expect(dialog.close).toHaveBeenCalledTimes(1);
  });

  test('announces only the supplied safe provider status', () => {
    const { elements, status } = createProviderSheetElements();

    announceProviderStatus(elements, '個人 · example-model · 無法使用');

    expect(status.textContent).toBe('個人 · example-model · 無法使用');
    expect(status.hidden).toBe(false);
  });

  test('wires pill and sheet close controls without provider mutators', () => {
    const { elements, listeners, pill, closeButton, dialog } = createProviderSheetElements();

    setupProviderSheetListeners(elements);
    listeners.get('pill:click')();
    listeners.get('closeButton:click')();

    expect(dialog.showModal).toHaveBeenCalledTimes(1);
    expect(dialog.close).toHaveBeenCalledTimes(1);
    expect(pill.addEventListener).toHaveBeenCalledWith('click', expect.any(Function));
    expect(closeButton.addEventListener).toHaveBeenCalledWith('click', expect.any(Function));
    expect(global.chrome.storage.local.set).not.toHaveBeenCalled();
    expect(global.chrome.permissions.request).not.toHaveBeenCalled();
  });
});
