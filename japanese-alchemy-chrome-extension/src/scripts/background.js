// Background service worker

// Track panel states
const panelStates = new Map();

chrome.runtime.onInstalled.addListener(() => {
  console.log("Extension installed");
});

// Handle extension icon click
chrome.action.onClicked.addListener((tab) => {
  console.log("[Background] Current panel states:", panelStates);
  try {
    const isOpen = panelStates.get(tab.windowId) || false;
    if (isOpen) {
      chrome.sidePanel.setOptions({
        tabId: tab.id,
        enabled: false,
      });
      panelStates.set(tab.windowId, false);
      console.log("[Background] Side panel closed");
    } else {
      chrome.sidePanel.setOptions({
        tabId: tab.id,
        enabled: true,
      });
      chrome.sidePanel.open({
        windowId: tab.windowId,
      });
      panelStates.set(tab.windowId, true);
      console.log("[Background] Side panel opened");
    }
  } catch (error) {
    console.error("[Background] Error handling icon click:", error);
  }
});

// Handle messages from content scripts
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  console.log('[Background] request.action: ', request.action);
  console.log('[Background] request.data: ', request.data);
  if (request.action === 'textSelected') {
    // Store selected text temporarily
    chrome.storage.local.set({ 
      selectedText: request.data
    });
  }
  sendResponse({ status: 'success' });
});