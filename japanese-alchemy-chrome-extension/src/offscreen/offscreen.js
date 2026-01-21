// Offscreen document script for handling Firebase Authentication
// This script manages communication between the extension and the Firebase hosting iframe

console.log('[Offscreen] Offscreen document loaded');

// Get the iframe
const iframe = document.getElementById('authFrame');

// Listen for messages from the extension
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  console.log('[Offscreen] Received message:', message);

  if (message.type === 'signInWithGoogle') {
    // Forward the sign-in request to the iframe
    iframe.contentWindow.postMessage({
      type: 'signInWithGoogle'
    }, '*');
  } else if (message.type === 'signOut') {
    // Forward the sign-out request to the iframe
    iframe.contentWindow.postMessage({
      type: 'signOut'
    }, '*');
  }

  // Keep the message channel open for async responses
  return true;
});

// Listen for messages from the iframe (Firebase auth responses)
window.addEventListener('message', (event) => {
  // Only process messages from the iframe
  if (event.source !== iframe.contentWindow) {
    return;
  }

  console.log('[Offscreen] Received message from iframe:', event.data);

  try {
    // Check if event.data is a string before parsing
    if (typeof event.data !== 'string') {
      console.warn('[Offscreen] Message is not a string:', event.data);
      return;
    }

    var eventData = event.data;

    // Remove additional string if string starts with '!_'
    if (eventData.startsWith('!_')) {
      console.info('[Offscreen] Removing unexpected prefix from message');
      eventData = eventData.slice(2);
    }

    // Parse the message
    const response = JSON.parse(eventData);
    // Verify the response has the expected structure
    if (!response || typeof response !== 'object') {
      console.warn('[Offscreen] Invalid response structure:', response);
      return;
    }

    // Forward the response to the extension
    chrome.runtime.sendMessage(response);
  } catch (error) {
    console.error('[Offscreen] Error parsing message:', error, 'Data:', eventData);
  }
});

// Notify that offscreen document is ready
chrome.runtime.sendMessage({
  type: 'offscreenReady'
});
