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
  console.log('[EXECUTOR] actionType called:', { ref, textLength: text.length, pressEnter });
  const tabId = await getActiveTabId();
  if (!tabId) return { ok: false, error: 'No active tab' };

  // Check if we're on Word Online - if so, redirect to write_document
  const tabs = await chrome.tabs.query({ active: true, lastFocusedWindow: true });
  const currentUrl = tabs[0]?.url || '';
  console.log('[EXECUTOR] Current URL:', currentUrl);
  if (currentUrl.includes('word.new') || currentUrl.includes('word.cloud.microsoft') || currentUrl.includes('docs.live.net')) {
    console.log('[EXECUTOR] Word Online detected - blocking type action');
    return {
      ok: false,
      error: 'For Word Online and Google Docs, use the write_document tool instead of type. The type tool cannot reliably interact with canvas-based editors.',
    };
  }

  const result = await chrome.scripting.executeScript({
    target: { tabId },
    func: (refAttr: string, text: string, pressEnter: boolean) => {
      const cleanRef = refAttr.replace(/[\[\]]/g, '').replace("data-malude-ref=", '').replace(/['"]/g, '');
      let el =
        (document.querySelector(`[data-malude-ref="${cleanRef}"]`) as HTMLElement) ||
        (() => { try { return document.querySelector(refAttr) as HTMLElement; } catch { return null; } })() ||
        (document.getElementById(cleanRef) as HTMLElement);

      // Fallback for body, editor, or generic document containers
      if (!el && (refAttr.toLowerCase().includes('body') || refAttr.toLowerCase().includes('editor') || refAttr.toLowerCase().includes('doc') || refAttr.toLowerCase().includes('canvas'))) {
        // For Word Online, prioritize the editing canvas over title fields
        el = (document.querySelector('.WACViewPanel_EditingElement') as HTMLElement) ||
             (document.querySelector('#WACViewPanel_EditingElement') as HTMLElement) ||
             (document.querySelector('[contenteditable="true"]') as HTMLElement) ||
             (document.querySelector('[role="textbox"]') as HTMLElement) ||
             document.body;
      }

      if (!el) return { ok: false, error: `Element not found: ${refAttr}` };

      console.log('[EXECUTOR] Found element:', {
        tagName: el.tagName,
        id: el.id,
        className: el.className,
        ariaLabel: el.getAttribute('aria-label'),
        isContentEditable: el.isContentEditable,
      });

      el.focus();
      const isInput = el.tagName === 'INPUT' || el.tagName === 'TEXTAREA';

      if (isInput) {
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
      } else {
        // Rich-text editor, contenteditable, or Word Online editing surface
        let inserted = false;
        try {
          if (document.queryCommandSupported && document.queryCommandSupported('insertText')) {
            inserted = document.execCommand('insertText', false, text);
          }
        } catch {}

        if (!inserted) {
          try {
            const dt = new DataTransfer();
            dt.setData('text/plain', text);
            el.dispatchEvent(new ClipboardEvent('paste', { bubbles: true, cancelable: true, clipboardData: dt }));
            inserted = true;
          } catch {}
        }

        if (!inserted && (el.isContentEditable || el.getAttribute('contenteditable') === 'true')) {
          el.innerText = text;
          el.dispatchEvent(new Event('input', { bubbles: true }));
        }
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

// ── Autonomous Document Writing ──────────────────────────────────────────

async function writeViaCdp(
  tabId: number,
  text: string,
  coord?: { x: number; y: number }
): Promise<boolean> {
  if (!chrome.debugger?.attach) return false;
  const target = { tabId };
  try {
    await chrome.debugger.attach(target, '1.3');
    console.log('[EXECUTOR-CDP] Attached debugger to tab', tabId);
    try {
      if (coord && coord.x > 0 && coord.y > 0) {
        await chrome.debugger.sendCommand(target, 'Input.dispatchMouseEvent', {
          type: 'mousePressed',
          x: Math.round(coord.x),
          y: Math.round(coord.y),
          button: 'left',
          clickCount: 1,
        });
        await chrome.debugger.sendCommand(target, 'Input.dispatchMouseEvent', {
          type: 'mouseReleased',
          x: Math.round(coord.x),
          y: Math.round(coord.y),
          button: 'left',
          clickCount: 1,
        });
        await new Promise((r) => setTimeout(r, 120));
      }
      await chrome.debugger.sendCommand(target, 'Input.insertText', { text });
      console.log('[EXECUTOR-CDP] Successfully inserted text via Input.insertText');
      return true;
    } finally {
      await chrome.debugger.detach(target).catch(() => {});
    }
  } catch (cdpErr) {
    console.warn('[EXECUTOR-CDP] CDP insertText note:', cdpErr);
    return false;
  }
}

export async function actionWriteDocument(
  content: string,
  title?: string
): Promise<ActionResult> {
  console.log('[EXECUTOR] actionWriteDocument called:', { contentLength: content.length, title });

  // 1. Locate the proper editor tab
  let targetTabId: number | null = await getActiveTabId();
  const tabs = await chrome.tabs.query({ currentWindow: true });
  const activeTab = tabs.find((t) => t.id === targetTabId) || tabs.find((t) => t.active);
  let currentUrl = activeTab?.url || '';

  const isEditorUrl = (u: string) =>
    u.includes('word.cloud.microsoft') ||
    u.includes('word.new') ||
    u.includes('office.com') ||
    u.includes('docs.live.net') ||
    u.includes('docs.google.com/document');

  // If current tab is a restricted internal browser tab, switch or open Word
  if (currentUrl.startsWith('chrome://') || currentUrl.startsWith('chrome-extension://') || currentUrl.startsWith('about:')) {
    const existingEditorTab = tabs.find((t) => t.url && isEditorUrl(t.url));
    if (existingEditorTab && existingEditorTab.id) {
      console.log('[EXECUTOR] Switching from chrome:// to existing Word/Docs tab:', existingEditorTab.id);
      await chrome.tabs.update(existingEditorTab.id, { active: true });
      await new Promise((r) => setTimeout(r, 800));
      targetTabId = existingEditorTab.id;
      currentUrl = existingEditorTab.url || '';
    } else {
      console.log('[EXECUTOR] Opening https://word.new for writing...');
      const openRes = await actionOpenTab('https://word.new');
      if (!openRes.ok) return openRes;
      const updated = await chrome.tabs.query({ active: true, currentWindow: true });
      targetTabId = updated[0]?.id || targetTabId;
      currentUrl = updated[0]?.url || 'https://word.new';
      await new Promise((r) => setTimeout(r, 2000));
    }
  } else if (!isEditorUrl(currentUrl)) {
    // If on a regular webpage (e.g. kidodev.com), switch to existing Word tab if one is open
    const existingEditorTab = tabs.find((t) => t.url && isEditorUrl(t.url));
    if (existingEditorTab && existingEditorTab.id) {
      console.log('[EXECUTOR] Switching to existing Word/Docs tab:', existingEditorTab.id, existingEditorTab.url);
      await chrome.tabs.update(existingEditorTab.id, { active: true });
      await new Promise((r) => setTimeout(r, 800));
      targetTabId = existingEditorTab.id;
      currentUrl = existingEditorTab.url || '';
    }
  }

  if (!targetTabId) return { ok: false, error: 'No active tab' };

  // Check for Microsoft sign-in page
  if (currentUrl.includes('login.microsoftonline.com') || currentUrl.includes('account.microsoft.com')) {
    console.log('[EXECUTOR] Microsoft sign-in page detected');
    return {
      ok: false,
      error: 'Word Online requires Microsoft sign-in on this tab (login.microsoftonline.com). Please sign in first, or switch to an open document tab.',
    };
  }

  // Copy document content to system clipboard so it is immediately available for paste
  try {
    if (typeof navigator !== 'undefined' && navigator.clipboard?.writeText) {
      await navigator.clipboard.writeText(content);
      console.log('[EXECUTOR] Copied document content to system clipboard');
    }
  } catch (clipErr) {
    console.warn('[EXECUTOR] Clipboard write warning:', clipErr);
  }

  try {
    const results = await chrome.scripting.executeScript({
      target: { tabId: targetTabId, allFrames: true },
      func: async (docText: string, docTitle?: string) => {
        console.log('[EXECUTOR-SCRIPT] write_document starting in frame:', window.location.href);

        function mdToHtml(md: string): string {
          return md
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/^### (.*$)/gim, '<h3>$1</h3>')
            .replace(/^## (.*$)/gim, '<h2>$1</h2>')
            .replace(/^# (.*$)/gim, '<h1>$1</h1>')
            .replace(/\*\*(.*?)\*\*/gim, '<strong>$1</strong>')
            .replace(/\*(.*?)\*/gim, '<em>$1</em>')
            .replace(/^\s*[-*]\s+(.*$)/gim, '<li>$1</li>')
            .replace(/\n\n+/gim, '<br/><br/>')
            .replace(/\n/gim, '<br/>');
        }

        const html = mdToHtml(docText);

        function getByXPath(xpath: string): HTMLElement | null {
          try {
            const res = document.evaluate(
              xpath,
              document,
              null,
              XPathResult.FIRST_ORDERED_NODE_TYPE,
              null
            );
            return res.singleNodeValue as HTMLElement | null;
          } catch {
            return null;
          }
        }

        // Candidates: 1. User-provided exact XPath, 2. Form relative XPath, 3. Standard Word/Docs selectors
        const userXPath =
          '/html/body/div[5]/form/div/div/div/div[1]/div[1]/div/div[11]/div/div[10]/div/div/div[1]/div[4]/div/div/div/div[3]/div/div[1]';
        const formRelativeXPath =
          '//form/div/div/div/div[1]/div[1]/div/div[11]/div/div[10]/div/div/div[1]/div[4]/div/div/div/div[3]/div/div[1]';
        const formCanvasXPath =
          '//form//div[contains(@class, "Canvas") or contains(@class, "Editing") or @role="textbox" or @role="document" or @contenteditable="true"]';

        const candidates: HTMLElement[] = [];

        const elUser = getByXPath(userXPath);
        if (elUser) candidates.push(elUser);

        const elFormRel = getByXPath(formRelativeXPath);
        if (elFormRel && !candidates.includes(elFormRel)) candidates.push(elFormRel);

        const elFormCanvas = getByXPath(formCanvasXPath);
        if (elFormCanvas && !candidates.includes(elFormCanvas)) candidates.push(elFormCanvas);

        const selectorList = [
          '.WACViewPanel_EditingElement',
          '#WACViewPanel_EditingElement',
          '[data-automation-id="CanvasZone"]',
          '[data-automation-id="Canvas"]',
          '[data-automation-id="documentCanvas"]',
          '.WordDocumentCanvas',
          '[role="textbox"]',
          '[contenteditable="true"]',
          '[role="document"]',
          '.kix-appview-editor',
          '.docs-texteventtarget-iframe',
          '.editor-content',
        ];

        for (const sel of selectorList) {
          const found = document.querySelector<HTMLElement>(sel);
          if (found && !candidates.includes(found)) candidates.push(found);
        }

        // Add any contenteditables on page
        document.querySelectorAll<HTMLElement>('[contenteditable="true"]').forEach((el) => {
          if (!candidates.includes(el)) candidates.push(el);
        });

        if (document.activeElement && document.activeElement !== document.body) {
          candidates.push(document.activeElement as HTMLElement);
        }

        // Filter and choose primary target
        let target: HTMLElement | null = candidates.find(
          (c) => c && c !== document.body && c.tagName !== 'HTML'
        ) || null;

        if (!target) return { ok: false, error: 'No target candidate found in frame' };

        console.log('[EXECUTOR-SCRIPT] Targeting element:', target.tagName, target.id, target.className);

        let clickCoord = { x: 0, y: 0 };

        // 1. Scroll into view and click center to activate Word Online cursor
        try {
          target.scrollIntoView({ behavior: 'instant', block: 'center' });
          const rect = target.getBoundingClientRect();
          clickCoord = {
            x: rect.left + Math.max(10, rect.width / 2),
            y: rect.top + Math.max(10, rect.height / 2),
          };

          target.dispatchEvent(
            new MouseEvent('mousedown', { bubbles: true, cancelable: true, view: window, clientX: clickCoord.x, clientY: clickCoord.y })
          );
          target.dispatchEvent(
            new MouseEvent('mouseup', { bubbles: true, cancelable: true, view: window, clientX: clickCoord.x, clientY: clickCoord.y })
          );
          target.dispatchEvent(
            new MouseEvent('click', { bubbles: true, cancelable: true, view: window, clientX: clickCoord.x, clientY: clickCoord.y })
          );
        } catch {}

        await new Promise((r) => setTimeout(r, 100));

        // If clicking caused Word Online to focus its internal helper, use document.activeElement
        const writeTarget = (document.activeElement && document.activeElement !== document.body)
          ? (document.activeElement as HTMLElement)
          : target;

        try { writeTarget.focus(); } catch {}

        let success = false;

        // Method A: ClipboardEvent paste with HTML and plain text
        try {
          const dt = new DataTransfer();
          dt.setData('text/plain', docText);
          dt.setData('text/html', html);

          const pasteEv = new ClipboardEvent('paste', {
            bubbles: true,
            cancelable: true,
            clipboardData: dt,
          });

          writeTarget.dispatchEvent(pasteEv);
          target.dispatchEvent(pasteEv);
          document.dispatchEvent(pasteEv);
          window.dispatchEvent(pasteEv);
          success = true;
          console.log('[EXECUTOR-SCRIPT] Method A (paste event) dispatched');
        } catch (e) {
          console.log('[EXECUTOR-SCRIPT] Method A error:', e);
        }

        // Method B: InputEvent (beforeinput + input)
        try {
          writeTarget.dispatchEvent(
            new InputEvent('beforeinput', {
              bubbles: true,
              cancelable: true,
              data: docText,
              inputType: 'insertText',
            })
          );
          writeTarget.dispatchEvent(
            new InputEvent('input', {
              bubbles: true,
              data: docText,
              inputType: 'insertText',
            })
          );
          success = true;
          console.log('[EXECUTOR-SCRIPT] Method B (InputEvent) dispatched');
        } catch (e) {
          console.log('[EXECUTOR-SCRIPT] Method B error:', e);
        }

        // Method C: execCommand insertHTML or insertText
        try {
          if (document.queryCommandSupported && document.queryCommandSupported('insertHTML')) {
            document.execCommand('insertHTML', false, html);
            success = true;
          } else if (document.queryCommandSupported && document.queryCommandSupported('insertText')) {
            document.execCommand('insertText', false, docText);
            success = true;
          }
        } catch (e) {}

        // Method D: If contenteditable element or child exists, set innerHTML/innerText directly
        try {
          const editable = writeTarget.isContentEditable
            ? writeTarget
            : target.isContentEditable
            ? target
            : target.querySelector<HTMLElement>('[contenteditable="true"]');
          if (editable) {
            editable.innerHTML = html;
            editable.dispatchEvent(new Event('input', { bubbles: true }));
            editable.dispatchEvent(new Event('change', { bubbles: true }));
            success = true;
            console.log('[EXECUTOR-SCRIPT] Method D (direct editable insertion) succeeded');
          }
        } catch (e) {}

        // Optional title set
        if (docTitle) {
          try {
            const titleEl = document.querySelector<HTMLInputElement>(
              '[data-automation-id="documentTitle"], #documentTitle, input[aria-label*="Document Name"]'
            );
            if (titleEl) {
              titleEl.value = docTitle;
              titleEl.dispatchEvent(new Event('input', { bubbles: true }));
              titleEl.dispatchEvent(new Event('change', { bubbles: true }));
            }
          } catch {}
        }

        return { ok: success, coord: clickCoord, tag: writeTarget.tagName, url: window.location.href };
      },
      args: [content, title || ''],
    });

    // Check if any frame returned coordinates and try native CDP insertion
    const frameWithCoord = results.find((r) => (r.result as any)?.coord?.x > 0);
    const coord = (frameWithCoord?.result as any)?.coord;

    if (targetTabId && coord) {
      console.log('[EXECUTOR] Attempting native CDP text insertion at', coord);
      const cdpOk = await writeViaCdp(targetTabId, content, coord);
      if (cdpOk) {
        return {
          ok: true,
          output: `Successfully written ${content.length} characters into the Word Online document editor via native browser pipeline.`,
        };
      }
    }

    const anySuccess = results.some((r) => (r.result as any)?.ok);
    if (anySuccess) {
      return {
        ok: true,
        output: `Successfully written ${content.length} characters into the Word Online document editor.`,
      };
    }

    return {
      ok: true,
      output: `Document content (${content.length} characters) dispatched to Word Online editor and copied to system clipboard.`,
    };
  } catch (err: any) {
    return { ok: false, error: `write_document failed: ${err?.message || err}` };
  }
}

// ── Multi-tab tools ────────────────────────────────────────────────────────

export async function actionListTabs(): Promise<ActionResult> {
  try {
    const tabs = await chrome.tabs.query({ currentWindow: true });
    if (!tabs || tabs.length === 0) {
      return { ok: true, output: 'No tabs found in current window.' };
    }
    const lines = tabs.map(
      (t) => `• [Tab ${t.id}] "${t.title || 'Untitled'}" — URL: ${t.url || 'about:blank'}${t.active ? ' (active)' : ''}`
    );
    return {
      ok: true,
      output: `Found ${tabs.length} tabs in current window:\n${lines.join('\n')}`,
    };
  } catch (e: any) {
    return { ok: false, error: e?.message || 'list_tabs failed' };
  }
}

export async function actionOpenTab(url: string): Promise<ActionResult> {
  try {
    // Open and activate the tab immediately so the user and agent focus on it
    const tab = await chrome.tabs.create({ url, active: true });
    if ((chrome as any).tabGroups && tab.id) {
      try {
        const groupId = await chrome.tabs.group({ tabIds: [tab.id] });
        await (chrome as any).tabGroups.update(groupId, { title: 'Malude Agent', color: 'orange' });
      } catch {}
    }
    // Give the new tab a short moment to initialize navigation
    await new Promise((r) => setTimeout(r, 1500));
    return { ok: true, output: `Opened and activated tab ${tab.id} -> ${url}` };
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
  console.log('[DISPATCH] Tool use received:', { name: block.name, id: block.id, input: block.input });
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
      case 'write_document':
        result = await actionWriteDocument(
          block.input.content as string,
          block.input.title as string | undefined
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
      case 'list_tabs':
        result = await actionListTabs();
        break;
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
    console.log('[DISPATCH] Exception in tool dispatch:', e);
    result = { ok: false, error: e?.message || 'Action threw an exception' };
  }

  const toolResult = {
    type: 'tool_result',
    tool_use_id: block.id,
    content: result.ok
      ? (result.output || 'Action completed successfully')
      : `ERROR: ${result.error}`,
  };
  console.log('[DISPATCH] Tool result:', toolResult);
  return toolResult;
}
