/**
 * Action Executor — M2: Autonomous In-Page Actions
 *
 * Translates tool_use blocks emitted by the LLM into real browser actions:
 *   click, type, scroll, navigate, wait, screenshot, open_tab, switch_tab, close_tab
 *
 * Uses chrome.scripting.executeScript for DOM interactions and
 * chrome.tabs.sendMessage for content-script–based actions.
 */

export interface ActionResult {
  ok: boolean;
  output?: string;
  error?: string;
}

// ── Helpers ────────────────────────────────────────────────────────────────

async function getActiveTabId(): Promise<number | null> {
  if (typeof chrome === 'undefined' || !chrome.tabs?.query) return null;
  const tabs = await chrome.tabs.query({ active: true, lastFocusedWindow: true });
  return tabs[0]?.id ?? null;
}

// ── Individual actions ─────────────────────────────────────────────────────

export async function actionClick(ref: string): Promise<ActionResult> {
  const tabId = await getActiveTabId();
  if (!tabId) return { ok: false, error: 'No active tab' };

  // Highlight element first for visual feedback
  try {
    await chrome.tabs.sendMessage(tabId, {
      type: 'page.highlight',
      ref,
      label: `clicking ${ref}`,
    });
  } catch { /* content script may not be injected on all pages */ }

  const result = await chrome.scripting.executeScript({
    target: { tabId },
    func: (refAttr: string) => {
      const cleanRef = refAttr.replace(/[\[\]]/g, '').replace("data-malude-ref=", '').replace(/['"]/g, '');
      const el =
        (document.querySelector(`[data-malude-ref="${cleanRef}"]`) as HTMLElement) ||
        (() => { try { return document.querySelector(refAttr) as HTMLElement; } catch { return null; } })() ||
        (document.getElementById(cleanRef) as HTMLElement);

      if (!el) return { ok: false, error: `Element not found: ${refAttr}` };

      el.scrollIntoView({ behavior: 'smooth', block: 'center' });
      (el as HTMLElement).click();
      return { ok: true, output: `Clicked: ${el.tagName} "${(el as HTMLElement).innerText?.slice(0, 40) || ''}"` };
    },
    args: [ref],
  });

  return (result?.[0]?.result as ActionResult) ?? { ok: false, error: 'executeScript failed' };
}

export async function actionType(
  ref: string,
  text: string,
  pressEnter = false
): Promise<ActionResult> {
  const tabId = await getActiveTabId();
  if (!tabId) return { ok: false, error: 'No active tab' };

  const result = await chrome.scripting.executeScript({
    target: { tabId },
    func: (refAttr: string, text: string, pressEnter: boolean) => {
      const cleanRef = refAttr.replace(/[\[\]]/g, '').replace("data-malude-ref=", '').replace(/['"]/g, '');
      const el =
        (document.querySelector(`[data-malude-ref="${cleanRef}"]`) as HTMLInputElement) ||
        (() => { try { return document.querySelector(refAttr) as HTMLInputElement; } catch { return null; } })() ||
        (document.getElementById(cleanRef) as HTMLInputElement);

      if (!el) return { ok: false, error: `Element not found: ${refAttr}` };

      el.focus();
      // Set native input value (works with React-controlled inputs)
      const nativeInputValueSetter = Object.getOwnPropertyDescriptor(
        window.HTMLInputElement.prototype, 'value'
      )?.set || Object.getOwnPropertyDescriptor(window.HTMLTextAreaElement.prototype, 'value')?.set;

      if (nativeInputValueSetter) {
        nativeInputValueSetter.call(el, text);
        el.dispatchEvent(new Event('input', { bubbles: true }));
        el.dispatchEvent(new Event('change', { bubbles: true }));
      } else {
        (el as any).value = text;
      }

      if (pressEnter) {
        el.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', code: 'Enter', bubbles: true }));
        el.dispatchEvent(new KeyboardEvent('keyup', { key: 'Enter', code: 'Enter', bubbles: true }));
      }

      return { ok: true, output: `Typed "${text.slice(0, 40)}" into ${el.tagName}${pressEnter ? ' + Enter' : ''}` };
    },
    args: [ref, text, pressEnter],
  });

  return (result?.[0]?.result as ActionResult) ?? { ok: false, error: 'executeScript failed' };
}

export async function actionScroll(
  direction: 'up' | 'down',
  amount = 400
): Promise<ActionResult> {
  const tabId = await getActiveTabId();
  if (!tabId) return { ok: false, error: 'No active tab' };

  await chrome.scripting.executeScript({
    target: { tabId },
    func: (dir: string, amt: number) => {
      window.scrollBy({ top: dir === 'down' ? amt : -amt, behavior: 'smooth' });
    },
    args: [direction, amount],
  });

  return { ok: true, output: `Scrolled ${direction} by ${amount}px` };
}

export async function actionNavigate(url: string): Promise<ActionResult> {
  const tabId = await getActiveTabId();
  if (!tabId) return { ok: false, error: 'No active tab' };

  await chrome.tabs.update(tabId, { url });
  // Wait for page load with timeout
  await new Promise<void>((resolve) => {
    const listener = (updatedTabId: number, info: chrome.tabs.TabChangeInfo) => {
      if (updatedTabId === tabId && info.status === 'complete') {
        chrome.tabs.onUpdated.removeListener(listener);
        resolve();
      }
    };
    chrome.tabs.onUpdated.addListener(listener);
    setTimeout(resolve, 8000); // fallback timeout
  });

  return { ok: true, output: `Navigated to ${url}` };
}

export async function actionWait(seconds: number): Promise<ActionResult> {
  await new Promise((r) => setTimeout(r, Math.min(seconds, 10) * 1000));
  return { ok: true, output: `Waited ${seconds}s` };
}

export async function actionScreenshot(): Promise<{ ok: boolean; dataUrl?: string; error?: string }> {
  if (!chrome.tabs?.captureVisibleTab) {
    return { ok: false, error: 'captureVisibleTab not available' };
  }
  try {
    const dataUrl = await chrome.tabs.captureVisibleTab(undefined, { format: 'jpeg', quality: 80 });
    return { ok: true, dataUrl };
  } catch (e: any) {
    return { ok: false, error: e?.message || 'screenshot failed' };
  }
}

// ── Multi-tab tools ────────────────────────────────────────────────────────

export async function actionOpenTab(url: string): Promise<ActionResult> {
  try {
    const tab = await chrome.tabs.create({ url, active: false });
    if ((chrome as any).tabGroups && tab.id) {
      const groupId = await chrome.tabs.group({ tabIds: [tab.id] });
      await (chrome as any).tabGroups.update(groupId, { title: 'Malude Agent', color: 'orange' });
    }
    return { ok: true, output: `Opened tab ${tab.id} -> ${url}` };
  } catch (e: any) {
    return { ok: false, error: e?.message || 'open_tab failed' };
  }
}

export async function actionSwitchTab(tabId: number): Promise<ActionResult> {
  try {
    await chrome.tabs.update(tabId, { active: true });
    return { ok: true, output: `Switched to tab ${tabId}` };
  } catch (e: any) {
    return { ok: false, error: e?.message || 'switch_tab failed' };
  }
}

export async function actionCloseTab(tabId: number): Promise<ActionResult> {
  try {
    await chrome.tabs.remove(tabId);
    return { ok: true, output: `Closed tab ${tabId}` };
  } catch (e: any) {
    return { ok: false, error: e?.message || 'close_tab failed' };
  }
}

// ── Dispatcher ────────────────────────────────────────────────────────────

export interface ToolUseBlock {
  type: 'tool_use';
  id: string;
  name: string;
  input: Record<string, any>;
}

/**
 * Dispatch a single tool_use block to the appropriate action.
 * Returns a tool_result payload for inclusion in the next API message.
 */
export async function dispatchToolUse(block: ToolUseBlock): Promise<{
  type: 'tool_result';
  tool_use_id: string;
  content: string;
}> {
  let result: ActionResult;

  try {
    switch (block.name) {
      case 'click':
        result = await actionClick(block.input.ref as string);
        break;
      case 'type':
        result = await actionType(
          block.input.ref as string,
          block.input.text as string,
          block.input.press_enter as boolean
        );
        break;
      case 'scroll':
        result = await actionScroll(
          block.input.direction as 'up' | 'down',
          block.input.amount as number
        );
        break;
      case 'navigate':
        result = await actionNavigate(block.input.url as string);
        break;
      case 'wait':
        result = await actionWait(block.input.seconds as number);
        break;
      case 'screenshot': {
        const ss = await actionScreenshot();
        result = { ok: ss.ok, output: ss.dataUrl ? '[screenshot captured]' : undefined, error: ss.error };
        break;
      }
      case 'open_tab':
        result = await actionOpenTab(block.input.url as string);
        break;
      case 'switch_tab':
        result = await actionSwitchTab(block.input.tab_id as number);
        break;
      case 'close_tab':
        result = await actionCloseTab(block.input.tab_id as number);
        break;
      case 'finish':
        result = { ok: true, output: block.input.summary as string };
        break;
      default:
        result = { ok: false, error: `Unknown tool: ${block.name}` };
    }
  } catch (e: any) {
    result = { ok: false, error: e?.message || 'Action threw an exception' };
  }

  return {
    type: 'tool_result',
    tool_use_id: block.id,
    content: result.ok
      ? (result.output || 'Action completed successfully')
      : `ERROR: ${result.error}`,
  };
}
