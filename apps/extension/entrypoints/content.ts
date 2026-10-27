import { defineContentScript } from 'wxt/sandbox';
import { BusMessage } from '../src/bus/messages';
import { extractInteractiveDom } from '../src/content/domMap';

export default defineContentScript({
  matches: ['<all_urls>'],
  main() {
    let activeOverlay: HTMLDivElement | null = null;
    let fadeTimeout: any = null;

    function findElement(target: string): HTMLElement | null {
      // 1. Check data-malude-ref attribute (e.g. "ref_1" or "[data-malude-ref='ref_1']")
      const cleanRef = target.replace(/[\[\]]/g, '').replace('data-malude-ref=', '').replace(/['"]/g, '');
      const byRef = document.querySelector<HTMLElement>(`[data-malude-ref="${cleanRef}"]`);
      if (byRef) return byRef;

      // 2. Direct selector query
      try {
        const bySel = document.querySelector<HTMLElement>(target);
        if (bySel) return bySel;
      } catch {}

      // 3. Fallback: match by ID
      try {
        const byId = document.getElementById(cleanRef);
        if (byId) return byId;
      } catch {}

      return null;
    }

    function highlightElement(refOrSelector: string, label: string) {
      removeHighlight();

      const el = findElement(refOrSelector);
      if (!el) return;

      // Scroll smoothly into view if offscreen
      el.scrollIntoView({ behavior: 'smooth', block: 'center', inline: 'nearest' });

      const rect = el.getBoundingClientRect();
      const overlay = document.createElement('div');
      overlay.id = '__malude_highlight_overlay';
      overlay.style.position = 'fixed';
      overlay.style.left = `${Math.max(0, rect.left - 2)}px`;
      overlay.style.top = `${Math.max(0, rect.top - 2)}px`;
      overlay.style.width = `${rect.width + 4}px`;
      overlay.style.height = `${rect.height + 4}px`;
      overlay.style.border = '2px solid #D97757';
      overlay.style.borderRadius = '6px';
      overlay.style.backgroundColor = 'rgba(217, 119, 87, 0.18)';
      overlay.style.boxShadow = '0 0 12px rgba(217, 119, 87, 0.45)';
      overlay.style.zIndex = '2147483647';
      overlay.style.pointerEvents = 'none';
      overlay.style.transition = 'all 0.2s cubic-bezier(0.16, 1, 0.3, 1)';

      if (label) {
        const badge = document.createElement('span');
        badge.innerText = label;
        badge.style.position = 'absolute';
        badge.style.top = '-22px';
        badge.style.left = '0';
        badge.style.backgroundColor = '#D97757';
        badge.style.color = '#ffffff';
        badge.style.fontSize = '11px';
        badge.style.fontWeight = '600';
        badge.style.padding = '2px 8px';
        badge.style.borderRadius = '4px';
        badge.style.fontFamily = 'system-ui, -apple-system, sans-serif';
        badge.style.boxShadow = '0 2px 4px rgba(0,0,0,0.15)';
        overlay.appendChild(badge);
      }

      document.body.appendChild(overlay);
      activeOverlay = overlay;

      // Auto-clear highlight after 5 seconds
      if (fadeTimeout) clearTimeout(fadeTimeout);
      fadeTimeout = setTimeout(removeHighlight, 5000);
    }

    function removeHighlight() {
      if (activeOverlay) {
        activeOverlay.remove();
        activeOverlay = null;
      }
      if (fadeTimeout) {
        clearTimeout(fadeTimeout);
        fadeTimeout = null;
      }
    }

    chrome.runtime?.onMessage?.addListener((rawMessage, sender, sendResponse) => {
      const result = BusMessage.safeParse(rawMessage);
      if (!result.success) return false;

      const msg = result.data;
      if (msg.type === 'page.highlight') {
        highlightElement(msg.ref, msg.label);
        sendResponse({ ok: true });
        return true;
      }

      if (msg.type === 'page.clearHighlight') {
        removeHighlight();
        sendResponse({ ok: true });
        return true;
      }

      if (msg.type === 'dom.extract') {
        const data = extractInteractiveDom();
        sendResponse({ ok: true, data });
        return true;
      }

      return false;
    });
  },
});
