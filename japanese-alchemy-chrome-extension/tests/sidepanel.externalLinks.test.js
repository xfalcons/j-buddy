import {
  FAQ_URL,
  WEBSITE_URL,
  openExternalPage,
  setSidepanelElementsForTesting,
  setupEventListeners,
} from '../src/sidepanel/sidepanel.js';

describe('sidepanel external links', () => {
  beforeEach(() => {
    global.chrome.tabs = { create: jest.fn(async () => undefined) };
  });

  test.each([
    ['website', WEBSITE_URL, 'https://japanese-alchemy-webapp.web.app/'],
    ['FAQ', FAQ_URL, 'https://japanese-alchemy-webapp.web.app/faq'],
  ])('opens the %s destination in an active new tab', async (_name, destination, expectedUrl) => {
    await openExternalPage(destination);

    expect(global.chrome.tabs.create).toHaveBeenCalledWith({
      url: expectedUrl,
      active: true,
    });
  });

  test('wires each toolbar button to its destination', async () => {
    const websiteButton = { addEventListener: jest.fn() };
    const faqButton = { addEventListener: jest.fn() };
    setSidepanelElementsForTesting({ websiteButton, faqButton });

    await setupEventListeners();

    const websiteListener = websiteButton.addEventListener.mock.calls[0][1];
    const faqListener = faqButton.addEventListener.mock.calls[0][1];
    websiteListener();
    faqListener();

    expect(global.chrome.tabs.create).toHaveBeenNthCalledWith(1, { url: WEBSITE_URL, active: true });
    expect(global.chrome.tabs.create).toHaveBeenNthCalledWith(2, { url: FAQ_URL, active: true });
  });
});
