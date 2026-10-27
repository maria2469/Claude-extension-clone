import { z } from 'zod';

// One discriminated union for every cross-context message. Always validate at the receiver:
// content scripts run next to untrusted pages, so a malformed message must never reach the loop.
export const Mode = z.enum(['manual', 'auto']);
export type Mode = z.infer<typeof Mode>;

export const BusMessage = z.discriminatedUnion('type', [
  z.object({
    type: z.literal('run.start'),
    task: z.string().max(8000),
    tabIds: z.array(z.number()),
    mode: Mode,
  }),
  z.object({
    type: z.literal('run.stop'),
    runId: z.string(),
  }),
  z.object({
    type: z.literal('approval.reply'),
    approvalId: z.string(),
    allow: z.boolean(),
    remember: z.enum(['none', 'session', 'always']),
  }),
  z.object({
    type: z.literal('run.event'),
    runId: z.string(),
    event: z.record(z.unknown()),
  }),
  z.object({
    type: z.literal('approval.request'),
    approvalId: z.string(),
    summary: z.string(),
    risk: z.enum(['low', 'sensitive']),
    verdict: z.string().optional(),
    origin: z.string(),
  }),
  z.object({
    type: z.literal('page.highlight'),
    ref: z.string(),
    label: z.string(),
  }),
  z.object({
    type: z.literal('page.clearHighlight'),
  }),
  z.object({
    type: z.literal('dom.extract'),
  }),
  z.object({
    type: z.literal('page.click'),
    ref: z.string(),
  }),
  z.object({
    type: z.literal('page.type'),
    ref: z.string(),
    text: z.string(),
    pressEnter: z.boolean().optional(),
  }),
  z.object({
    type: z.literal('page.scroll'),
    direction: z.enum(['up', 'down']),
    amount: z.number().optional(),
  }),
  z.object({
    type: z.literal('recorder.step'),
    step: z.record(z.unknown()),
  }),
]);

export type BusMessage = z.infer<typeof BusMessage>;

/**
 * Send a type-safe message via chrome.runtime.sendMessage with validation
 */
export async function sendBusMessage<T = unknown>(message: BusMessage): Promise<T> {
  // Validate outbound message against schema
  const validated = BusMessage.parse(message);
  return chrome.runtime.sendMessage(validated);
}

/**
 * Dispatch message to a specific tab's content script
 */
export async function sendTabBusMessage<T = unknown>(
  tabId: number,
  message: BusMessage
): Promise<T> {
  const validated = BusMessage.parse(message);
  return chrome.tabs.sendMessage(tabId, validated);
}
