// Offscreen document to sustain persistent streams when the service worker sleeps.
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message?.type === 'offscreen.ping') {
    sendResponse({ status: 'alive' });
  }
  return false;
});
