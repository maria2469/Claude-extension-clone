import { API_BASE_URL } from '../lib/env';
import { readSse } from './sse';
import { useTokenStore } from '../store/tokens';

export interface TextContentBlock {
  type: 'text';
  text: string;
}

export interface ToolUseContentBlock {
  type: 'tool_use';
  id: string;
  name: string;
  input: Record<string, any>;
}

export type ContentBlock = TextContentBlock | ToolUseContentBlock | { type: string; [key: string]: any };

export interface FinalTurnResponse {
  stop_reason: string;
  /** Full content array including text blocks and tool_use blocks */
  content: ContentBlock[];
  usage: {
    input_tokens: number;
    output_tokens: number;
    cache_read_tokens?: number;
  };
}

/**
 * Execute an authenticated fetch with:
 * - 401 refresh once
 * - 429 Retry-After handling
 * - 5xx up to 2 retries with exponential jitter backoff
 */
export async function apiFetch(
  path: string,
  options: RequestInit = {},
  retriesLeft = 2
): Promise<Response> {
  const token = useTokenStore.getState().token;
  const headers = new Headers(options.headers || {});

  if (token) {
    headers.set('Authorization', `Bearer ${token}`);
  }
  if (!headers.has('Content-Type') && options.body && typeof options.body === 'string') {
    headers.set('Content-Type', 'application/json');
  }

  const url = `${API_BASE_URL}${path}`;
  console.log(`[Malude API] -> ${options.method || 'GET'} ${url} (hasToken=${!!token})`);

  try {
    const response = await fetch(url, { ...options, headers });
    console.log(`[Malude API] <- ${url} responded status=${response.status}`);

    // Handle 429: wait Retry-After header
    if (response.status === 429 && retriesLeft > 0) {
      const retryAfterSeconds = parseInt(response.headers.get('Retry-After') || '5', 10);
      console.warn(`[Malude API] 429 Rate limited. Retrying after ${retryAfterSeconds}s...`);
      await new Promise((resolve) => setTimeout(resolve, retryAfterSeconds * 1000));
      return apiFetch(path, options, retriesLeft - 1);
    }

    // Handle 5xx: up to 2 retries with jitter
    if (response.status >= 500 && retriesLeft > 0) {
      const jitter = Math.random() * 500;
      const delay = (3 - retriesLeft) * 1000 + jitter;
      console.warn(`[Malude API] 5xx Server error (${response.status}). Retrying in ${delay.toFixed(0)}ms...`);
      await new Promise((resolve) => setTimeout(resolve, delay));
      return apiFetch(path, options, retriesLeft - 1);
    }

    return response;
  } catch (err: any) {
    console.error(`[Malude API] Network fetch error for ${url}:`, err);
    // If connection to localhost:8080 failed completely (server not started)
    if (err?.name === 'TypeError' || err?.message?.includes('fetch')) {
      throw new Error(
        `Cannot connect to API at ${API_BASE_URL}. Ensure the backend is running via: uvicorn app.main:app --port 8080`
      );
    }
    throw err;
  }
}

/**
 * Stream a turn from POST /v1/agent/step with seamless local fallback
 */
export async function streamStep(
  messages: Array<any>,
  tools: Array<any>,
  pageUrl: string | null,
  onDelta?: (delta: string) => void,
  runId?: string,
  pageTitle?: string | null,
  pageContent?: string | null
): Promise<FinalTurnResponse> {
  console.log('[Malude Step] Starting streamStep with messages:', messages.length, 'pageUrl:', pageUrl, 'hasContent:', !!pageContent);
  try {
    const response = await apiFetch('/v1/agent/step', {
      method: 'POST',
      body: JSON.stringify({
        messages,
        tools,
        page_url: pageUrl,
        page_title: pageTitle,
        page_content: pageContent,
        run_id: runId,
      }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error(`[Malude Step] API returned non-200: status=${response.status}`, errorText);
      throw new Error(`API step failed (${response.status}): ${errorText}`);
    }

    let finalTurn: FinalTurnResponse | null = null;
    let textChunksCount = 0;

    for await (const sse of readSse(response)) {
      if (sse.event === 'text' && sse.data?.delta) {
        textChunksCount++;
        onDelta?.(sse.data.delta);
      } else if (sse.event === 'final') {
        console.log('[Malude Step] Received final turn event:', sse.data);
        finalTurn = sse.data as FinalTurnResponse;
      } else if (sse.event === 'error') {
        console.error('[Malude Step] Received error event from stream:', sse.data);
        throw new Error(sse.data?.message || 'upstream_error');
      }
    }

    console.log(`[Malude Step] Stream finished successfully. Total chunks received: ${textChunksCount}`);
    if (!finalTurn) {
      throw new Error('Stream ended without final turn data');
    }

    return finalTurn;
  } catch (err: any) {
    // If backend is not running, provide an intelligent local preview response
    // so the user can test the UI and extension features immediately!
    const isConnRefused =
      err?.message?.includes('Cannot connect') ||
      err?.message?.includes('Failed to fetch');

    if (isConnRefused) {
      const lastUserMsg = [...messages].reverse().find((m) => m.role === 'user')?.content || '';
      
      const fallbackText =
        `**[Local Preview Mode - Backend API Offline]**\n\n` +
        `I received your request: "${lastUserMsg}"\n\n` +
        `**Page Context:** ${pageUrl || 'Active browser tab'}\n\n` +
        `**Key Takeaways:**\n` +
        `1. **Active Integration:** The extension is operating and interacting with this tab.\n` +
        `2. **Backend Connection:** To stream live answers from Claude Sonnet, start the API server with:\n` +
        `   \`\`\`powershell\n   cd apps/api\n   .venv\\Scripts\\uvicorn app.main:app --port 8080 --reload\n   \`\`\`\n` +
        `3. **Security Policy:** All tab actions and approvals remain active.`;

      // Simulate streaming deltas for natural UX
      const words = fallbackText.split(' ');
      for (const word of words) {
        onDelta?.(word + ' ');
        await new Promise((r) => setTimeout(r, 20));
      }

      return {
        stop_reason: 'end_turn',
        content: [{ type: 'text', text: fallbackText }],
        usage: { input_tokens: 10, output_tokens: words.length },
      };
    }

    throw err;
  }
}

/**
 * Safety review: POST /v1/agent/review
 */
export async function reviewAction(
  userGoal: string,
  action: Record<string, any>,
  pageUrl?: string | null
): Promise<{ allow: boolean; reason: string }> {
  try {
    const res = await apiFetch('/v1/agent/review', {
      method: 'POST',
      body: JSON.stringify({ user_goal: userGoal, action, page_url: pageUrl }),
    });
    if (!res.ok) return { allow: false, reason: 'review_unavailable' };
    return await res.json();
  } catch {
    return { allow: false, reason: 'review_unavailable' };
  }
}

/**
 * Content classifier: POST /v1/agent/classify
 */
export async function classifyText(
  text: string,
  sourceUrl: string
): Promise<{ injection_score: number; spans: Array<[number, number]>; reason: string }> {
  try {
    const res = await apiFetch('/v1/agent/classify', {
      method: 'POST',
      body: JSON.stringify({ text, source_url: sourceUrl }),
    });
    if (!res.ok) return { injection_score: 1.0, spans: [], reason: 'classifier_unavailable' };
    return await res.json();
  } catch {
    return { injection_score: 1.0, spans: [], reason: 'classifier_unavailable' };
  }
}
