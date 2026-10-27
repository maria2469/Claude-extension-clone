/**
 * DOM Reference Map Extractor
 * Identifies visible interactive elements on the page, assigns stable reference IDs,
 * and formats a compact interactive reference tree for the AI agent.
 */

export interface InteractiveElementInfo {
  ref: string;
  tag: string;
  type?: string;
  text: string;
  placeholder?: string;
  href?: string;
  disabled: boolean;
  value?: string;
  checked?: boolean;
}

export function extractInteractiveDom(): {
  elements: InteractiveElementInfo[];
  treeText: string;
  pageText: string;
  title: string;
  url: string;
} {
  console.log('[DOM-MAP] Starting DOM extraction...');
  const title = document.title || '';
  const url = window.location.href;
  console.log('[DOM-MAP] Page URL:', url);
  console.log('[DOM-MAP] Page Title:', title);

  // 1. Extract clean page body text
  let pageText = '';
  if (document.body) {
    // Special handling for Word Online and Google Docs
    const isWordOnline = url.includes('word.new') || url.includes('word.cloud.microsoft') || url.includes('docs.live.net');
    const isGoogleDocs = url.includes('docs.google.com');

    if (isWordOnline || isGoogleDocs) {
      console.log('[DOM-MAP] Word Online/Google Docs detected - using specialized extraction');

      // For Word Online, the document might be empty (new document), so we should indicate it's a document editor
      pageText = '[Word Online Document Editor - Ready for content]';
      console.log('[DOM-MAP] Word Online: Set editor indicator');

      // Try to find the actual document content area if it exists
      const contentSelectors = [
        '[contenteditable="true"]',
        '.WACViewPanel_EditingElement',
        '#WACViewPanel_EditingElement',
        '[data-automation-id="CanvasZone"]',
        '[data-automation-id="Canvas"]',
        '.kix-appview-editor',
        '.docs-texteventtarget-iframe',
      ];

      for (const selector of contentSelectors) {
        const el = document.querySelector(selector) as HTMLElement;
        if (el) {
          console.log('[DOM-MAP] Found content area:', selector);
          const text = (el.innerText || el.textContent || '').trim();
          if (text.length > 0) {
            pageText = text
              .replace(/[ \t]+/g, ' ')
              .replace(/\n\s*\n+/g, '\n')
              .trim()
              .slice(0, 10000);
            console.log('[DOM-MAP] Extracted content length:', pageText.length);
            break;
          }
        }
      }
    } else {
      // Standard extraction for other pages
      const clone = document.body.cloneNode(true) as HTMLElement;
      clone.querySelectorAll('script, style, noscript, svg, iframe').forEach((el) => el.remove());
      pageText = (clone.innerText || clone.textContent || '')
        .replace(/[ \t]+/g, ' ')
        .replace(/\n\s*\n+/g, '\n')
        .trim()
        .slice(0, 10000);
    }
  }

  // 2. Query all potentially interactive elements
  const selector = [
    'a[href]',
    'button',
    'input',
    'textarea',
    'select',
    '[role="button"]',
    '[role="link"]',
    '[role="checkbox"]',
    '[role="tab"]',
    '[role="menuitem"]',
    '[contenteditable="true"]',
    '[tabindex="0"]',
  ].join(', ');

  const rawElements = Array.from(document.querySelectorAll<HTMLElement>(selector));
  console.log('[DOM-MAP] Found', rawElements.length, 'potential interactive elements');
  const elements: InteractiveElementInfo[] = [];
  const lines: string[] = [];

  let refCounter = 1;
  let skippedHidden = 0;
  let skippedNoLabel = 0;
  let skippedTitle = 0;

  for (const el of rawElements) {
    // Visibility check
    const rect = el.getBoundingClientRect();
    if (rect.width <= 0 || rect.height <= 0) {
      skippedHidden++;
      continue;
    }

    const style = window.getComputedStyle(el);
    if (style.display === 'none' || style.visibility === 'hidden' || style.opacity === '0') {
      skippedHidden++;
      continue;
    }

    // Determine element type and text
    const tag = el.tagName.toLowerCase();
    const role = el.getAttribute('role');
    const inputType = (el as HTMLInputElement).type?.toLowerCase();

    // Skip hidden inputs
    if (tag === 'input' && inputType === 'hidden') continue;

    // Skip document title fields in Word Online and Google Docs to prevent typing into titles
    const ariaLabel = el.getAttribute('aria-label') || '';
    const dataAutomationId = el.getAttribute('data-automation-id') || '';
    const id = el.id || '';
    const className = el.className || '';
    if (
      ariaLabel.toLowerCase().includes('document name') ||
      ariaLabel.toLowerCase().includes('document title') ||
      ariaLabel.toLowerCase().includes('filename') ||
      dataAutomationId.toLowerCase().includes('documenttitle') ||
      dataAutomationId.toLowerCase().includes('documentname') ||
      id.toLowerCase().includes('documenttitle') ||
      id.toLowerCase().includes('documentname') ||
      (tag === 'input' && el.closest('[data-automation-id="WACMenuBar"]'))
    ) {
      skippedTitle++;
      console.log('[DOM-MAP] Skipping title field:', tag, ariaLabel || id || className);
      continue;
    }

    // Determine label / readable description
    let label = (
      el.getAttribute('aria-label') ||
      el.getAttribute('title') ||
      (el as HTMLInputElement).placeholder ||
      el.innerText ||
      (el as HTMLInputElement).value ||
      ''
    )
      .replace(/\s+/g, ' ')
      .trim();

    if (label.length > 80) {
      label = label.slice(0, 77) + '...';
    }

    // If an element has no text, check image alt or parent text
    if (!label) {
      const img = el.querySelector('img');
      if (img?.alt) label = img.alt.trim();
    }

    // Skip elements with zero discernible purpose or content
    if (!label && tag !== 'input' && tag !== 'textarea' && tag !== 'select') {
      skippedNoLabel++;
      continue;
    }

    const ref = `ref_${refCounter++}`;
    el.setAttribute('data-malude-ref', ref);

    const info: InteractiveElementInfo = {
      ref,
      tag,
      type: inputType || role || undefined,
      text: label,
      disabled: (el as HTMLButtonElement).disabled || false,
      value: (el as HTMLInputElement).value || undefined,
      checked: (el as HTMLInputElement).checked || undefined,
      href: (el as HTMLAnchorElement).getAttribute('href') || undefined,
      placeholder: (el as HTMLInputElement).placeholder || undefined,
    };

    elements.push(info);
    console.log('[DOM-MAP] Added element:', ref, tag, '-', label.slice(0, 30));

    // Build human/LLM-friendly text line
    let desc = `[${ref}] `;
    if (tag === 'button' || role === 'button') {
      desc += `Button: "${label || 'Button'}"`;
    } else if (tag === 'a' || role === 'link') {
      const target = info.href ? ` -> ${info.href.slice(0, 40)}` : '';
      desc += `Link: "${label || 'Link'}"${target}`;
    } else if (tag === 'input') {
      const val = info.value ? ` (value: "${info.value}")` : '';
      const ph = info.placeholder ? ` (placeholder: "${info.placeholder}")` : '';
      desc += `Input [${inputType || 'text'}]: "${label}"${ph}${val}`;
    } else if (tag === 'textarea') {
      desc += `Textarea: "${label || info.placeholder || ''}"`;
    } else if (tag === 'select') {
      desc += `Select: "${label}"`;
    } else {
      desc += `${tag.toUpperCase()}: "${label}"`;
    }

    if (info.disabled) desc += ' (disabled)';
    lines.push(desc);

    // Limit to top 60 interactive elements to stay token-compact
    if (lines.length >= 60) break;
  }

  const treeText = lines.join('\n');

  console.log('[DOM-MAP] Extraction complete:');
  console.log('[DOM-MAP] - Total elements found:', rawElements.length);
  console.log('[DOM-MAP] - Skipped (hidden):', skippedHidden);
  console.log('[DOM-MAP] - Skipped (no label):', skippedNoLabel);
  console.log('[DOM-MAP] - Skipped (title fields):', skippedTitle);
  console.log('[DOM-MAP] - Final interactive elements:', elements.length);
  console.log('[DOM-MAP] - Page text length:', pageText.length);
  console.log('[DOM-MAP] Tree preview:', treeText.slice(0, 200));

  return {
    elements,
    treeText,
    pageText,
    title,
    url,
  };
}
