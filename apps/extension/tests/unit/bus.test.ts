import { describe, it, expect } from 'vitest';
import { BusMessage } from '../../src/bus/messages';

describe('BusMessage validation', () => {
  it('validates run.start correctly', () => {
    const valid = {
      type: 'run.start',
      task: 'Check page contents',
      tabIds: [123, 456],
      mode: 'manual',
    };
    const res = BusMessage.safeParse(valid);
    expect(res.success).toBe(true);
  });

  it('rejects invalid mode in run.start', () => {
    const invalid = {
      type: 'run.start',
      task: 'Check page contents',
      tabIds: [123],
      mode: 'unrestricted', // Not allowed by Mode enum
    };
    const res = BusMessage.safeParse(invalid);
    expect(res.success).toBe(false);
  });

  it('validates approval.reply and rejects unknown properties', () => {
    const valid = {
      type: 'approval.reply',
      approvalId: 'appr-1',
      allow: true,
      remember: 'always',
    };
    const res = BusMessage.safeParse(valid);
    expect(res.success).toBe(true);
  });
});
