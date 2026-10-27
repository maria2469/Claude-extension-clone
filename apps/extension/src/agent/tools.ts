/**
 * Browser Tool Definitions — M2
 *
 * These Anthropic-compatible tool schemas are sent with every /step request
 * when the agent is in "auto" mode. The LLM can call them to interact with the page.
 */

export const BROWSER_TOOLS = [
  {
    name: 'click',
    description:
      'Click an interactive element on the current page by its ref ID (e.g. "ref_1") or CSS selector. ' +
      'Always prefer ref IDs from the DOM tree provided in the system prompt.',
    input_schema: {
      type: 'object',
      properties: {
        ref: {
          type: 'string',
          description: 'ref ID (e.g. "ref_3") or CSS selector of the element to click',
        },
      },
      required: ['ref'],
    },
  },
  {
    name: 'type',
    description:
      'Type text into a standard input field, search box, textarea, or contenteditable editor. Use press_enter=true for search queries.',
    input_schema: {
      type: 'object',
      properties: {
        ref: { type: 'string', description: 'ref ID or CSS selector of the input element' },
        text: { type: 'string', description: 'Text to type into the element' },
        press_enter: {
          type: 'boolean',
          description: 'Whether to press Enter after typing (default false)',
          default: false,
        },
      },
      required: ['ref', 'text'],
    },
  },
  {
    name: 'write_document',
    description:
      'Autonomously write and insert formatted document content directly into the active document editor (Word Online, Google Docs, OneNote, Notion, or rich-text web editors). ' +
      'Automatically finds the editing canvas/surface and writes the formatted document directly into the page.',
    input_schema: {
      type: 'object',
      properties: {
        content: {
          type: 'string',
          description: 'The complete document content to write, formatted with headings, bullet points, sections, and tables',
        },
        title: {
          type: 'string',
          description: 'Optional document title to set in the document header',
        },
      },
      required: ['content'],
    },
  },
  {
    name: 'scroll',
    description: 'Scroll the page viewport up or down to reveal more content.',
    input_schema: {
      type: 'object',
      properties: {
        direction: {
          type: 'string',
          enum: ['up', 'down'],
          description: 'Scroll direction',
        },
        amount: {
          type: 'number',
          description: 'Pixels to scroll (default 400)',
          default: 400,
        },
      },
      required: ['direction'],
    },
  },
  {
    name: 'navigate',
    description:
      'Navigate the current tab to a new URL. Wait for page load before returning. ' +
      'Prefer clicking links over navigate unless you have a direct URL.',
    input_schema: {
      type: 'object',
      properties: {
        url: { type: 'string', description: 'Full URL to navigate to (include https://)' },
      },
      required: ['url'],
    },
  },
  {
    name: 'wait',
    description:
      'Wait for dynamic content to load after a click or navigation. Use between 1-5 seconds.',
    input_schema: {
      type: 'object',
      properties: {
        seconds: {
          type: 'number',
          description: 'Seconds to wait (max 10)',
          default: 2,
        },
      },
      required: ['seconds'],
    },
  },
  {
    name: 'screenshot',
    description:
      'Capture a screenshot of the current visible tab viewport. ' +
      'Use this when you need to visually verify page state or understand a chart/graph.',
    input_schema: {
      type: 'object',
      properties: {},
      required: [],
    },
  },
  {
    name: 'open_tab',
    description:
      'Open a new browser tab with the given URL. The tab will be added to the Malude Agent tab group.',
    input_schema: {
      type: 'object',
      properties: {
        url: { type: 'string', description: 'Full URL to open in the new tab' },
      },
      required: ['url'],
    },
  },
  {
    name: 'switch_tab',
    description: 'Switch the active focus to a different browser tab by its numeric tab ID.',
    input_schema: {
      type: 'object',
      properties: {
        tab_id: { type: 'number', description: 'Chrome tab ID to switch to' },
      },
      required: ['tab_id'],
    },
  },
  {
    name: 'close_tab',
    description: 'Close a browser tab by its numeric tab ID.',
    input_schema: {
      type: 'object',
      properties: {
        tab_id: { type: 'number', description: 'Chrome tab ID to close' },
      },
      required: ['tab_id'],
    },
  },
  {
    name: 'finish',
    description:
      'Mark the task as complete when the user goal has been fully achieved. ' +
      'Provide a clear summary of what was accomplished.',
    input_schema: {
      type: 'object',
      properties: {
        summary: {
          type: 'string',
          description: 'Clear description of what was accomplished',
        },
      },
      required: ['summary'],
    },
  },
] as const;

/** Tool names that require human approval before execution */
export const SENSITIVE_TOOLS = new Set([
  'navigate',
  'open_tab',
]);

/** Patterns in button text that trigger safety review before clicking */
export const SENSITIVE_BUTTON_PATTERNS = [
  /\b(buy|purchase|order|pay|checkout|submit|confirm|delete|remove|unsubscribe|transfer|send)\b/i,
];

export function isSensitiveAction(toolName: string, input: Record<string, any>): boolean {
  if (SENSITIVE_TOOLS.has(toolName)) return false; // navigate/open_tab need pre-approval only for financial actions
  if (toolName === 'click') {
    // Will be checked by content at runtime with full label context
    return false;
  }
  return false;
}
