import { describe, it, expect } from 'vitest';
import { readSse } from '../../src/api/sse';

describe('readSse parser', () => {
  it('parses text deltas and final event from stream', async () => {
    const stream = new ReadableStream({
      start(controller) {
        controller.enqueue(
          new TextEncoder().encode(
            'event: text\ndata: {"delta":"Hello "}\n\nevent: text\ndata: {"delta":"world!"}\n\nevent: final\ndata: {"stop_reason":"end_turn","content":[],"usage":{"input_tokens":10,"output_tokens":5}}\n\n'
          )
        );
        controller.close();
      },
    });

    const response = new Response(stream);
    const events: any[] = [];

    for await (const ev of readSse(response)) {
      events.push(ev);
    }

    expect(events).toHaveLength(3);
    expect(events[0]).toEqual({ event: 'text', data: { delta: 'Hello ' } });
    expect(events[1]).toEqual({ event: 'text', data: { delta: 'world!' } });
    expect(events[2].event).toBe('final');
    expect(events[2].data.stop_reason).toBe('end_turn');
  });

  it('parses error events correctly', async () => {
    const stream = new ReadableStream({
      start(controller) {
        controller.enqueue(
          new TextEncoder().encode('event: error\ndata: {"status":502,"message":"upstream_error"}\n\n')
        );
        controller.close();
      },
    });

    const response = new Response(stream);
    const events: any[] = [];

    for await (const ev of readSse(response)) {
      events.push(ev);
    }

    expect(events).toHaveLength(1);
    expect(events[0]).toEqual({ event: 'error', data: { status: 502, message: 'upstream_error' } });
  });
});
