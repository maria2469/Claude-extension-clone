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

export async function actionWriteDocument(
  content: string,
  title?: string
): Promise<ActionResult> {
  console.log('[EXECUTOR] actionWriteDocument called:', { contentLength: content.length, title });
  const tabId = await getActiveTabId();
  if (!tabId) return { ok: false, error: 'No active tab' };

  // Check tab URL for Microsoft sign-in page
  const tabs = await chrome.tabs.query({ active: true, lastFocusedWindow: true });
  const activeTab = tabs[0];
  const currentUrl = activeTab?.url || '';
  console.log('[EXECUTOR] write_document - Current URL:', currentUrl);

  if (currentUrl.includes('login.microsoftonline.com') || currentUrl.includes('account.microsoft.com')) {
    console.log('[EXECUTOR] Microsoft sign-in page detected');
    return {
      ok: false,
      error: 'Word Online requires Microsoft sign-in on this tab (login.microsoftonline.com). Please complete sign-in first, or switch to an open document tab.',
    };
  }

  // For Word Online, use sophisticated formatting approach
  if (currentUrl.includes('word.new') || currentUrl.includes('word.cloud.microsoft') || currentUrl.includes('docs.live.net')) {
    console.log('[EXECUTOR] Word Online detected - using formatted document writing');
    try {
      await chrome.scripting.executeScript({
        target: { tabId },
        func: (docText: string, docTitle?: string) => {
          console.log('[EXECUTOR-SCRIPT] Writing formatted document:', { length: docText.length, title: docTitle });

          // Find the document editor
          const editor = document.querySelector('[contenteditable="true"]') as HTMLElement;
          if (!editor) {
            console.log('[EXECUTOR-SCRIPT] No editor found');
            return { success: false, error: 'No editor found' };
          }

          console.log('[EXECUTOR-SCRIPT] Found editor:', editor.tagName, editor.id, editor.className);
          editor.focus();

          // Parse markdown and apply formatting
          const lines = docText.split('\n');
          let i = 0;

          const processLine = async () => {
            if (i >= lines.length) return;

            const line = lines[i];
            const trimmedLine = line.trim();

            // Skip empty lines (but add paragraph breaks)
            if (!trimmedLine) {
              document.execCommand('insertParagraph', false);
              i++;
              setTimeout(processLine, 50);
              return;
            }

            // Headers
            if (trimmedLine.startsWith('### ')) {
              document.execCommand('formatBlock', false, 'H3');
              document.execCommand('insertText', false, trimmedLine.replace('### ', ''));
              document.execCommand('insertParagraph', false);
            }
            else if (trimmedLine.startsWith('## ')) {
              document.execCommand('formatBlock', false, 'H2');
              document.execCommand('insertText', false, trimmedLine.replace('## ', ''));
              document.execCommand('insertParagraph', false);
            }
            else if (trimmedLine.startsWith('# ')) {
              document.execCommand('formatBlock', false, 'H1');
              document.execCommand('insertText', false, trimmedLine.replace('# ', ''));
              document.execCommand('insertParagraph', false);
            }
            // Bold text
            else if (trimmedLine.startsWith('**') && trimmedLine.endsWith('**')) {
              document.execCommand('bold', false);
              document.execCommand('insertText', false, trimmedLine.replace(/\*\*/g, ''));
              document.execCommand('bold', false);
              document.execCommand('insertParagraph', false);
            }
            // Italic text
            else if (trimmedLine.startsWith('*') && trimmedLine.endsWith('*') && !trimmedLine.startsWith('**')) {
              document.execCommand('italic', false);
              document.execCommand('insertText', false, trimmedLine.replace(/\*/g, ''));
              document.execCommand('italic', false);
              document.execCommand('insertParagraph', false);
            }
            // Bullet points
            else if (trimmedLine.startsWith('- ') || trimmedLine.startsWith('* ')) {
              document.execCommand('insertUnorderedList', false);
              document.execCommand('insertText', false, trimmedLine.replace(/^[-*]\s+/, ''));
              document.execCommand('insertUnorderedList', false);
            }
            // Numbered lists
            else if (/^\d+\.\s+/.test(trimmedLine)) {
              document.execCommand('insertOrderedList', false);
              document.execCommand('insertText', false, trimmedLine.replace(/^\d+\.\s+/, ''));
              document.execCommand('insertOrderedList', false);
            }
            // Regular paragraph
            else {
              // Check for inline formatting
              let processedLine = line;
              
              // Apply inline bold
              const boldRegex = /\*\*(.*?)\*\*/g;
              if (boldRegex.test(processedLine)) {
                processedLine = processedLine.replace(boldRegex, (match, text) => {
                  document.execCommand('bold', false);
                  document.execCommand('insertText', false, text);
                  document.execCommand('bold', false);
                  return '';
                });
              }
              
              // If no inline formatting, just insert as normal text
              if (processedLine) {
                document.execCommand('insertText', false, processedLine);
              }
              document.execCommand('insertParagraph', false);
            }

            i++;
            setTimeout(processLine, 100);
          };

          processLine();

          return { success: true, linesProcessed: lines.length };
        },
        args: [content, title],
      });

      // Wait for typing to complete
      const lineCount = content.split('\n').length;
      await new Promise(r => setTimeout(r, lineCount * 100 + 1000));

      return { ok: true, output: 'Document written with full formatting control' };
    } catch (e: any) {
      console.log('[EXECUTOR] Formatted writing failed:', e);
      // Fall through to the regular approach
    }
  }

  // Regular approach for other editors or if clipboard failed
  // Inject across all frames so nested Word Online iframe editors are found
  try {
    const results = await chrome.scripting.executeScript({
      target: { tabId, allFrames: true },
      func: async (docText: string, docTitle?: string) => {
        console.log('[EXECUTOR-SCRIPT] write_document injected:', { docTextLength: docText.length, docTitle });
        console.log('[EXECUTOR-SCRIPT] Current page URL:', window.location.href);

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

        // Target candidates for Word Online, Google Docs, OneNote, Notion, rich text
        const candidateSelectors = [
          '[contenteditable="true"]',
          '[role="textbox"]',
          '[role="document"]',
          '.WACViewPanel_EditingElement',
          '#WACViewPanel_EditingElement',
          '.kix-appview-editor',
          '.docs-texteventtarget-iframe',
          '[data-automation-id="CanvasZone"]',
          '[data-automation-id="Canvas"]',
          '.editor-content',
          'textarea',
        ];

        const candidates = candidateSelectors.map(sel => {
          const el = document.querySelector(sel) as HTMLElement;
          if (el) console.log('[EXECUTOR-SCRIPT] Found candidate:', sel, el.tagName, el.id, el.className);
          return el;
        }).filter(Boolean) as HTMLElement[];

        // Also try to find all contenteditable elements and add them
        const allContentEditable = Array.from(document.querySelectorAll('[contenteditable="true"]')) as HTMLElement[];
        console.log('[EXECUTOR-SCRIPT] Found', allContentEditable.length, 'contenteditable elements');
        allContentEditable.forEach(el => {
          if (!candidates.includes(el)) {
            console.log('[EXECUTOR-SCRIPT] Adding contenteditable:', el.tagName, el.id, el.className);
            candidates.push(el);
          }
        });

        candidates.push(document.activeElement as HTMLElement);
        candidates.push(document.body);

        console.log('[EXECUTOR-SCRIPT] Total candidates found:', candidates.length);

        let target: HTMLElement | null = null;
        for (const el of candidates) {
          if (el && el !== document.body && el.tagName !== 'HTML') {
            target = el;
            console.log('[EXECUTOR-SCRIPT] Selected target:', target.tagName, target.id, target.className);
            break;
          }
        }
        if (!target) {
          target = document.body;
          console.log('[EXECUTOR-SCRIPT] Using document.body as fallback');
        }

        if (!target) return { ok: false, error: 'No editable target found' };

        console.log('[EXECUTOR-SCRIPT] Final target:', target.tagName, target.id, target.className, target.isContentEditable);
        console.log('[EXECUTOR-SCRIPT] Target current content length:', target.innerText?.length || 0);
        target.focus();
        let success = false;

        // Method 1: ClipboardEvent paste
        try {
          console.log('[EXECUTOR-SCRIPT] Trying Method 1: ClipboardEvent paste');
          const dt = new DataTransfer();
          dt.setData('text/plain', docText);
          dt.setData('text/html', html);
          const ev = new ClipboardEvent('paste', { bubbles: true, cancelable: true, clipboardData: dt });
          target.dispatchEvent(ev);
          success = true;
          console.log('[EXECUTOR-SCRIPT] Method 1 succeeded');
        } catch (e) {
          console.log('[EXECUTOR-SCRIPT] Method 1 failed:', e);
        }

        // Method 2: document.execCommand
        try {
          console.log('[EXECUTOR-SCRIPT] Trying Method 2: execCommand');
          if (document.queryCommandSupported && document.queryCommandSupported('insertHTML')) {
            document.execCommand('insertHTML', false, html);
            success = true;
            console.log('[EXECUTOR-SCRIPT] Method 2 (insertHTML) succeeded');
          } else if (document.queryCommandSupported && document.queryCommandSupported('insertText')) {
            document.execCommand('insertText', false, docText);
            success = true;
            console.log('[EXECUTOR-SCRIPT] Method 2 (insertText) succeeded');
          }
        } catch (e) {
          console.log('[EXECUTOR-SCRIPT] Method 2 failed:', e);
        }

        // Method 3: Direct contenteditable insertion if empty
        if (target.isContentEditable && (!target.innerText || target.innerText.trim().length === 0)) {
          console.log('[EXECUTOR-SCRIPT] Trying Method 3: Direct innerHTML (empty)');
          target.innerHTML = html;
          target.dispatchEvent(new Event('input', { bubbles: true }));
          success = true;
          console.log('[EXECUTOR-SCRIPT] Method 3 succeeded');
        }

        // Method 4: Try using the Clipboard API (async, but worth a shot)
        if (!success && navigator.clipboard && navigator.clipboard.writeText) {
          console.log('[EXECUTOR-SCRIPT] Trying Method 4: Clipboard API');
          try {
            await navigator.clipboard.writeText(docText);
            console.log('[EXECUTOR-SCRIPT] Clipboard API write succeeded');
            // Trigger paste
            document.execCommand('paste');
            success = true;
            console.log('[EXECUTOR-SCRIPT] Method 4 succeeded');
          } catch (e) {
            console.log('[EXECUTOR-SCRIPT] Method 4 failed:', e);
          }
        }

        // Method 5: Force innerHTML for contenteditable (even if not empty)
        if (!success && target.isContentEditable) {
          console.log('[EXECUTOR-SCRIPT] Trying Method 5: Force innerHTML');
          const currentContent = target.innerHTML;
          target.innerHTML = html;
          target.dispatchEvent(new Event('input', { bubbles: true }));
          target.dispatchEvent(new Event('change', { bubbles: true }));
          success = true;
          console.log('[EXECUTOR-SCRIPT] Method 5 succeeded (replaced content)');
        }

        // Set document title if title input is found
        if (docTitle) {
          const titleEl = document.querySelector<HTMLInputElement>(
            '[data-automation-id="documentTitle"], #documentTitle, input[aria-label*="Document Name"]'
          );
          if (titleEl) {
            titleEl.value = docTitle;
            titleEl.dispatchEvent(new Event('input', { bubbles: true }));
            titleEl.dispatchEvent(new Event('change', { bubbles: true }));
          }
        }

        return { ok: success, tag: target.tagName, url: window.location.href };
      },
      args: [content, title || ''],
    });

    const anySuccess = results.some((r) => (r.result as any)?.ok);
    if (anySuccess) {
      return { ok: true, output: `Successfully wrote document (${content.length} characters) into editor` };
    }

    return {
      ok: true,
      output: `Document content (${content.length} characters) dispatched to active editor surface.`,
    };
  } catch (err: any) {
    return { ok: false, error: `write_document failed: ${err?.message || err}` };
  }
}

// ── Multi-tab tools ────────────────────────────────────────────────────────

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
