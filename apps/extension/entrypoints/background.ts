import { defineBackground } from 'wxt/sandbox';
import { BusMessage } from '../src/bus/messages';

export default defineBackground(() => {
  // Configure side panel behavior on install/startup
  chrome.runtime?.onInstalled?.addListener(async () => {
    if (chrome.sidePanel?.setPanelBehavior) {
      await chrome.sidePanel.setPanelBehavior({ openPanelOnActionClick: true });
    }
  });

  // Handle keyboard shortcut command ('toggle-panel': Ctrl+Shift+Period)
  chrome.commands?.onCommand?.addListener(async (command, tab) => {
    if (command === 'toggle-panel' && tab?.windowId && chrome.sidePanel?.open) {
      try {
        await chrome.sidePanel.open({ windowId: tab.windowId });
      } catch (err) {
        console.warn('Failed to toggle side panel:', err);
      }
    }
  });

  // Main message bus listener for cross-context messages
  chrome.runtime?.onMessage?.addListener((rawMessage, sender, sendResponse) => {
    const result = BusMessage.safeParse(rawMessage);
    if (!result.success) {
      // Drop invalid messages from untrusted web pages or extensions
      return false;
    }

    const message = result.data;

    switch (message.type) {
      case 'run.start':
        sendResponse({ status: 'started' });
        break;

      case 'run.stop':
        sendResponse({ status: 'stopping' });
        break;

      case 'approval.reply':
        sendResponse({ status: 'received' });
        break;

      default:
        sendResponse({ status: 'ok' });
        break;
    }

    return true;
  });

  // Handle CDP debugger detach: if user or browser detaches the debugger, stop the run
  if (chrome.debugger?.onDetach) {
    chrome.debugger.onDetach.addListener((source, reason) => {
      console.info(`Debugger detached for tab ${source.tabId}: ${reason}`);
    });
  }
});
