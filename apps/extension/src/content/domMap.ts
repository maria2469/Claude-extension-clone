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
  const title = document.title || '';
  const url = window.location.href;

  // 1. Extract clean page body text
  let pageText = '';
  if (document.body) {
    const clone = document.body.cloneNode(true) as HTMLElement;
    clone.querySelectorAll('script, style, noscript, svg, iframe').forEach((el) => el.remove());
    pageText = (clone.innerText || clone.textContent || '')
      .replace(/[ \t]+/g, ' ')
      .replace(/\n\s*\n+/g, '\n')
      .trim()
      .slice(0, 10000);
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
  const elements: InteractiveElementInfo[] = [];
  const lines: string[] = [];

  let refCounter = 1;

  for (const el of rawElements) {
    // Visibility check
    const rect = el.getBoundingClientRect();
    if (rect.width <= 0 || rect.height <= 0) continue;

    const style = window.getComputedStyle(el);
    if (style.display === 'none' || style.visibility === 'hidden' || style.opacity === '0') {
      continue;
    }

    // Determine element type and text
    const tag = el.tagName.toLowerCase();
    const role = el.getAttribute('role');
    const inputType = (el as HTMLInputElement).type?.toLowerCase();

    // Skip hidden inputs
    if (tag === 'input' && inputType === 'hidden') continue;

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

  return {
    elements,
    treeText,
    pageText,
    title,
    url,
  };
}
