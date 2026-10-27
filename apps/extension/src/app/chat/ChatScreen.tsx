import React, { useState, useEffect, useRef, useCallback } from 'react';
import { PanelShell } from '../../components/layout/PanelShell';
import { Header } from '../../components/layout/Header';
import { StatusStrip } from '../../components/layout/StatusStrip';
import { Composer } from '../../components/layout/Composer';
import { HistoryDrawer } from '../../components/layout/HistoryDrawer';
import { MessageList, ChatMessage } from '../../components/sections/MessageList';
import { ApprovalRequest } from '../../components/sections/ApprovalCard';
import { useSettingsStore } from '../../store/settings';
import { useRunStore } from '../../store/runState';
import { useHistoryStore, SessionEntry } from '../../store/history';
import { streamStep } from '../../api/client';
import { BROWSER_TOOLS, SENSITIVE_BUTTON_PATTERNS } from '../../agent/tools';
import { dispatchToolUse, ToolUseBlock, actionScreenshot } from '../../agent/executor';

export interface ChatScreenProps {
  initialPrompt?: string;
  onOpenSettings?: () => void;
}

// ── DOM extraction helper ─────────────────────────────────────────────────

async function getActiveTabDetails(): Promise<{
  tabId: number | null;
  url: string | null;
  title: string | null;
  content: string | null;
}> {
  if (typeof chrome === 'undefined' || !chrome.tabs?.query) {
    return { tabId: null, url: null, title: null, content: null };
  }
  try {
    const tabs = await chrome.tabs.query({ active: true, lastFocusedWindow: true });
    const tab = tabs[0] || (await chrome.tabs.query({ active: true, currentWindow: true }))[0];
    if (!tab?.id || !tab.url) {
      return { tabId: null, url: null, title: null, content: null };
    }

    const { id: tabId, title, url } = tab;

    if (url.startsWith('chrome://') || url.startsWith('chrome-extension://') || url.startsWith('edge://')) {
      return { tabId, url, title: title || null, content: null };
    }

    // Try content script first (structured DOM map)
    try {
      const response = await chrome.tabs.sendMessage(tabId, { type: 'dom.extract' });
      if (response?.ok && response?.data) {
        const { treeText, pageText, elements } = response.data;
        const combined = [
          treeText ? `=== Interactive Elements (${elements?.length || 0} items) ===\n${treeText}\n` : '',
          pageText ? `=== Page Text ===\n${pageText}` : '',
        ].filter(Boolean).join('\n');
        return { tabId, url, title: title || null, content: combined || null };
      }
    } catch { /* content script not injected yet */ }

    // Fallback: raw text extraction
    try {
      if (chrome.scripting?.executeScript) {
        const results = await chrome.scripting.executeScript({
          target: { tabId },
          func: () => {
            if (!document.body) return '';
            const clone = document.body.cloneNode(true) as HTMLElement;
            clone.querySelectorAll('script, style, noscript, svg, iframe').forEach((el) => el.remove());
            return (clone.innerText || clone.textContent || '')
              .replace(/[ \t]+/g, ' ')
              .replace(/\n\s*\n+/g, '\n')
              .trim()
              .slice(0, 30000);
          },
        });
        return { tabId, url, title: title || null, content: results?.[0]?.result || null };
      }
    } catch { /* scripting not allowed */ }

    return { tabId, url, title: title || null, content: null };
  } catch (err) {
    console.warn('[Malude Tab] Error querying active tab:', err);
    return { tabId: null, url: null, title: null, content: null };
  }
}

// ── Safety check for click targets ────────────────────────────────────────

function isSensitiveClickTarget(label: string): boolean {
  return SENSITIVE_BUTTON_PATTERNS.some((re) => re.test(label));
}

// ── ChatScreen ─────────────────────────────────────────────────────────────

export const ChatScreen: React.FC<ChatScreenProps> = ({
  initialPrompt,
  onOpenSettings,
}) => {
  const { mode, setMode } = useSettingsStore();
  const { status, setStatus, streamingDelta, appendDelta, clearDelta } = useRunStore();
  const { saveSession, loadSessions } = useHistoryStore();

  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [tabCount, setTabCount] = useState<number>(1);
  const [sessionTitle, setSessionTitle] = useState<string>('');
  const [currentTabUrl, setCurrentTabUrl] = useState<string | null>(null);
  const [isHistoryOpen, setIsHistoryOpen] = useState(false);
  const [sessionId] = useState(() => `session-${Date.now()}`);

  // Pending approval gate: maps approvalId -> resolve(allow)
  const pendingApprovals = useRef<Map<string, (allow: boolean) => void>>(new Map());

  // Abort controller for stopping the agent loop
  const abortRef = useRef<boolean>(false);

  // Load tab metadata
  useEffect(() => {
    if (typeof chrome !== 'undefined' && chrome.tabs?.query) {
      chrome.tabs.query({}, (tabs) => { if (tabs) setTabCount(tabs.length); });
      chrome.tabs.query({ active: true, lastFocusedWindow: true }, (tabs) => {
        if (tabs[0]?.url) setCurrentTabUrl(tabs[0].url);
      });
    }
  }, []);

  // Handle initial prompt from onboarding
  useEffect(() => {
    if (initialPrompt) handleSendMessage(initialPrompt);
  }, [initialPrompt]);

  // ── Auto-save session to history ─────────────────────────────────────────
  const saveCurrentSession = useCallback(
    async (msgs: ChatMessage[], title: string) => {
      if (msgs.length === 0) return;
      const entry: SessionEntry = {
        id: sessionId,
        title: title || 'Untitled',
        messages: msgs
          .filter((m) => m.role === 'user' || m.role === 'assistant')
          .map((m) => ({ role: m.role as 'user' | 'assistant', content: m.content })),
        createdAt: Date.now(),
        updatedAt: Date.now(),
      };
      await saveSession(entry);
    },
    [sessionId, saveSession]
  );

  // ── Approval request gate ─────────────────────────────────────────────────
  const requestApproval = useCallback(
    (approvalId: string, summary: string, origin: string): Promise<boolean> => {
      return new Promise((resolve) => {
        pendingApprovals.current.set(approvalId, resolve);
        const approvalMsg: ChatMessage = {
          id: `approval-${approvalId}`,
          role: 'approval',
          content: '',
          approvalRequest: {
            approvalId,
            summary,
            risk: 'sensitive',
            origin,
          },
        };
        setMessages((prev) => [...prev, approvalMsg]);
      });
    },
    []
  );

  const handleApprovalReply = useCallback(
    (approvalId: string, allow: boolean, _remember: 'none' | 'session' | 'always') => {
      const resolve = pendingApprovals.current.get(approvalId);
      if (resolve) {
        resolve(allow);
        pendingApprovals.current.delete(approvalId);
      }
      // Update approval card verdict
      setMessages((prev) =>
        prev.map((m) =>
          m.approvalRequest?.approvalId === approvalId
            ? {
                ...m,
                approvalRequest: {
                  ...m.approvalRequest!,
                  verdict: allow ? 'allowed' : 'denied',
                },
              }
            : m
        )
      );
    },
    []
  );

  // ── Agentic tool execution loop ───────────────────────────────────────────
  const runAgentLoop = async (
    initialMessages: Array<{ role: string; content: any }>,
    tabUrl: string | null,
    tabTitle: string | null,
    tabContent: string | null
  ) => {
    let conversationMessages = [...initialMessages];
    let stepCount = 0;
    const MAX_STEPS = 10;

    abortRef.current = false;

    while (stepCount < MAX_STEPS && !abortRef.current) {
      stepCount++;
      console.log(`[Malude Agent] Step ${stepCount}/${MAX_STEPS}`);

      // Re-extract DOM on each step (page may have changed)
      if (stepCount > 1) {
        const freshTab = await getActiveTabDetails();
        if (freshTab.content) tabContent = freshTab.content;
        if (freshTab.url) tabUrl = freshTab.url;
      }

      clearDelta();

      let accumulated = '';
      let finalTurn: any = null;

      try {
        const toolsToSend = mode === 'auto' ? BROWSER_TOOLS : [];
        finalTurn = await streamStep(
          conversationMessages,
          toolsToSend as any,
          tabUrl,
          (delta) => {
            accumulated += delta;
            appendDelta(delta);
          },
          sessionId,
          tabTitle,
          tabContent
        );
      } catch (err: any) {
        console.error('[Malude Agent] Step error:', err);
        setMessages((prev) => [
          ...prev,
          {
            id: `err-${Date.now()}`,
            role: 'assistant',
            content: `Error: ${err?.message || 'Step failed'}`,
          },
        ]);
        break;
      }

      if (abortRef.current) break;

      // Extract text and tool_use blocks from the final turn
      const textContent = finalTurn.content.find((c: any) => c.type === 'text')?.text || accumulated;
      const toolUseBlocks: ToolUseBlock[] = finalTurn.content.filter(
        (c: any) => c.type === 'tool_use'
      );

      // Append assistant's text response if any
      if (textContent.trim()) {
        const assistantMsg: ChatMessage = {
          id: `msg-${Date.now()}`,
          role: 'assistant',
          content: textContent,
        };
        setMessages((prev) => [...prev, assistantMsg]);
        clearDelta();
      }

      // If no tool_use, the agent is done
      if (toolUseBlocks.length === 0 || finalTurn.stop_reason === 'end_turn') {
        console.log('[Malude Agent] No more tool calls. Loop finished.');
        break;
      }

      // Process tool_use blocks
      const toolResults: Array<{ type: 'tool_result'; tool_use_id: string; content: string }> = [];

      for (const block of toolUseBlocks) {
        if (abortRef.current) break;

        // Show action status in chat
        const actionLabel = formatToolLabel(block.name, block.input);
        const actionMsg: ChatMessage = {
          id: `action-${Date.now()}-${block.id}`,
          role: 'tool_action',
          content: actionLabel,
          toolName: block.name,
        };
        setMessages((prev) => [...prev, actionMsg]);

        // Check if this is a sensitive action requiring approval
        const needsApproval = block.name === 'click' && isSensitiveClickTarget(block.input.ref || '');
        if (needsApproval) {
          const origin = tabUrl ? new URL(tabUrl).hostname : 'this page';
          const approvalId = `appr-${Date.now()}`;
          const summary = `${formatToolLabel(block.name, block.input)} on ${origin}`;
          const allowed = await requestApproval(approvalId, summary, origin);
          if (!allowed) {
            toolResults.push({
              type: 'tool_result',
              tool_use_id: block.id,
              content: 'Action denied by user. Propose an alternative.',
            });
            continue;
          }
        }

        // Execute the action
        const result = await dispatchToolUse(block);
        toolResults.push(result);

        // If "finish" tool was called, stop the loop
        if (block.name === 'finish') {
          abortRef.current = true;
          break;
        }

        // Small pause between actions for stability
        await new Promise((r) => setTimeout(r, 300));
      }

      if (abortRef.current) break;

      // Feed tool results back into conversation for next step
      conversationMessages = [
        ...conversationMessages,
        {
          role: 'assistant',
          content: [
            ...(textContent ? [{ type: 'text', text: textContent }] : []),
            ...toolUseBlocks,
          ],
        },
        {
          role: 'user',
          content: toolResults,
        },
      ];
    }

    if (stepCount >= MAX_STEPS) {
      setMessages((prev) => [
        ...prev,
        {
          id: `limit-${Date.now()}`,
          role: 'assistant',
          content: `⚠️ Reached maximum steps (${MAX_STEPS}). Task may be incomplete.`,
        },
      ]);
    }
  };

  // ── Main send handler ─────────────────────────────────────────────────────
  const handleSendMessage = async (text: string) => {
    console.log('[Malude UI] handleSendMessage:', text);

    const userMsg: ChatMessage = {
      id: `msg-${Date.now()}`,
      role: 'user',
      content: text,
    };

    const newMessages = [...messages, userMsg];
    setMessages(newMessages);

    if (!sessionTitle) {
      setSessionTitle(text.slice(0, 40) + (text.length > 40 ? '...' : ''));
    }

    setStatus('working');
    clearDelta();

    try {
      const tabDetails = await getActiveTabDetails();
      if (tabDetails.url) setCurrentTabUrl(tabDetails.url);

      // Build API messages (only user/assistant, no tool_action or approval rows)
      const apiMessages = newMessages
        .filter((m) => m.role === 'user' || m.role === 'assistant')
        .map((m) => ({ role: m.role, content: m.content }));

      await runAgentLoop(apiMessages, tabDetails.url, tabDetails.title, tabDetails.content);

      // Save session after each exchange
      await saveCurrentSession(
        [...newMessages, ...messages.filter((m) => m.role === 'assistant')],
        sessionTitle || text.slice(0, 40)
      );
    } catch (err: any) {
      console.error('[Malude UI] handleSendMessage error:', err);
      clearDelta();
      setMessages((prev) => [
        ...prev,
        {
          id: `err-${Date.now()}`,
          role: 'assistant',
          content: `Error: ${err?.message || 'Something went wrong.'}`,
        },
      ]);
    } finally {
      clearDelta();
      setStatus('idle');
    }
  };

  const handleStop = () => {
    abortRef.current = true;
    clearDelta();
    setStatus('idle');
  };

  const handleNewSession = () => {
    setMessages([]);
    setSessionTitle('');
    clearDelta();
    setStatus('idle');
    abortRef.current = true;
  };

  const handleRestoreSession = (session: SessionEntry) => {
    setIsHistoryOpen(false);
    const restored: ChatMessage[] = session.messages.map((m, i) => ({
      id: `restored-${i}`,
      role: m.role,
      content: m.content,
    }));
    setMessages(restored);
    setSessionTitle(session.title);
  };

  return (
    <>
      <HistoryDrawer
        isOpen={isHistoryOpen}
        onClose={() => setIsHistoryOpen(false)}
        onRestoreSession={handleRestoreSession}
      />

      <PanelShell
        header={
          <Header
            sessionTitle={sessionTitle}
            onNewSession={handleNewSession}
            onOpenHistory={() => {
              loadSessions();
              setIsHistoryOpen(true);
            }}
            onOpenSettings={onOpenSettings}
          />
        }
        statusStrip={
          <StatusStrip
            tabCount={tabCount}
            mode={mode}
            runStatus={status}
            onModeChange={setMode}
          />
        }
        composer={
          <Composer
            onSend={handleSendMessage}
            onStop={handleStop}
            isRunning={status === 'working'}
          />
        }
      >
        <MessageList
          messages={messages}
          streamingDelta={streamingDelta}
          onApprovalReply={handleApprovalReply}
        />
      </PanelShell>
    </>
  );
};

// ── Utilities ─────────────────────────────────────────────────────────────

function formatToolLabel(name: string, input: Record<string, any>): string {
  switch (name) {
    case 'click':
      return `Clicking ${input.ref}`;
    case 'type':
      return `Typing "${(input.text as string)?.slice(0, 30)}" into ${input.ref}`;
    case 'scroll':
      return `Scrolling ${input.direction} ${input.amount || 400}px`;
    case 'navigate':
      return `Navigating to ${(input.url as string)?.slice(0, 50)}`;
    case 'wait':
      return `Waiting ${input.seconds}s`;
    case 'screenshot':
      return 'Capturing screenshot';
    case 'open_tab':
      return `Opening tab: ${(input.url as string)?.slice(0, 40)}`;
    case 'switch_tab':
      return `Switching to tab ${input.tab_id}`;
    case 'close_tab':
      return `Closing tab ${input.tab_id}`;
    case 'finish':
      return `✅ Done: ${(input.summary as string)?.slice(0, 60)}`;
    default:
      return `${name}(${JSON.stringify(input).slice(0, 40)})`;
  }
}
