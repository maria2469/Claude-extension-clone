export interface SseEvent<T = any> {
  event: string;
  data: T;
}

/**
 * Parses a streaming Response body into typed Server-Sent Events.
 * EventSource cannot pass custom headers (e.g. Authorization: Bearer <token>),
 * so fetch + body stream reader is required.
 */
export async function* readSse<T = any>(
  response: Response
): AsyncGenerator<SseEvent<T>, void, unknown> {
  if (!response.body) {
    throw new Error('Response body is null');
  }

  const reader = response.body.getReader();
  const decoder = new TextDecoder('utf-8');
  let buffer = '';

  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;

      buffer += decoder.decode(value, { stream: true });

      // Split into distinct SSE message blocks separated by double newline
      const parts = buffer.split('\n\n');
      buffer = parts.pop() ?? '';

      for (const part of parts) {
        if (!part.trim()) continue;

        let eventName = 'message';
        let dataString = '';

        const lines = part.split('\n');
        for (const line of lines) {
          if (line.startsWith('event:')) {
            eventName = line.slice(6).trim();
          } else if (line.startsWith('data:')) {
            dataString = line.slice(5).trim();
          }
        }

        if (dataString) {
          try {
            const parsedData = JSON.parse(dataString);
            yield { event: eventName, data: parsedData };
          } catch {
            yield { event: eventName, data: dataString as unknown as T };
          }
        }
      }
    }
  } finally {
    reader.releaseLock();
  }
}
