import React, { useRef, useEffect, useState } from 'react';
import { Sparkles } from 'lucide-react';
import { PRODUCT_NAME } from '../../lib/brand';
import { ApprovalCard, ApprovalRequest } from './ApprovalCard';

export interface ChatMessage {
  id: string;
  role: 'user' | 'assistant' | 'tool_action' | 'approval';
  content: string;
  /** For tool_action messages: the tool name */
  toolName?: string;
  /** For approval messages */
  approvalRequest?: ApprovalRequest;
  isStreaming?: boolean;
}

export interface MessageListProps {
  messages: ChatMessage[];
  streamingDelta?: string;
  onApprovalReply?: (
    approvalId: string,
    allow: boolean,
    remember: 'none' | 'session' | 'always'
  ) => void;
}

export const MessageList: React.FC<MessageListProps> = ({
  messages,
  streamingDelta = '',
  onApprovalReply,
}) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const [userHasScrolledUp, setUserHasScrolledUp] = useState(false);

  const handleScroll = () => {
    if (!containerRef.current) return;
    const { scrollTop, scrollHeight, clientHeight } = containerRef.current;
    const isAtBottom = scrollHeight - scrollTop - clientHeight < 40;
    setUserHasScrolledUp(!isAtBottom);
  };

  useEffect(() => {
    if (!userHasScrolledUp && containerRef.current) {
      containerRef.current.scrollTop = containerRef.current.scrollHeight;
    }
  }, [messages, streamingDelta, userHasScrolledUp]);

  return (
    <div
      ref={containerRef}
      onScroll={handleScroll}
      aria-live="polite"
      className="h-full overflow-y-auto px-4 py-5 space-y-5 bg-[#FAF9F5] dark:bg-[#141413]"
    >
      {messages.length === 0 && !streamingDelta && (
        <div className="flex flex-col items-center justify-center h-full text-center px-4 py-8 select-none">
          {/* Claude warm terracotta sparkle icon */}
          <div className="w-11 h-11 rounded-xl bg-[#D97757]/15 dark:bg-[#D97757]/20 border border-[#D97757]/30 flex items-center justify-center text-[#D97757] mb-3.5 shadow-sm">
            <Sparkles size={22} className="fill-[#D97757]" />
          </div>
          <h3 className="font-semibold text-[#1F1E1D] dark:text-[#F5F4F0] text-[15px] mb-1.5 tracking-tight">
            How can {PRODUCT_NAME} help you?
          </h3>
          <p className="text-xs text-[#7A766F] dark:text-[#969288] max-w-[260px] leading-relaxed mb-6">
            Summarize this page, draft replies, analyze contents, or navigate web apps.
          </p>

          <div className="w-full space-y-2 text-left max-w-[310px]">
            <div className="p-2.5 rounded-xl border border-[#E5E1D5] dark:border-[#2C2A26] bg-[#FFFFFF] dark:bg-[#1C1B18] text-xs text-[#4F4C45] dark:text-[#C5C2BA] shadow-xs hover:border-[#D97757] transition-colors cursor-default">
              💡 <span className="font-medium text-[#1F1E1D] dark:text-[#F5F4F0]">Ask questions</span> about what you see on the current page
            </div>
            <div className="p-2.5 rounded-xl border border-[#E5E1D5] dark:border-[#2C2A26] bg-[#FFFFFF] dark:bg-[#1C1B18] text-xs text-[#4F4C45] dark:text-[#C5C2BA] shadow-xs hover:border-[#D97757] transition-colors cursor-default">
              ⚡ <span className="font-medium text-[#1F1E1D] dark:text-[#F5F4F0]">Take action</span> with built-in safety approvals
            </div>
            <div className="p-2.5 rounded-xl border border-[#E5E1D5] dark:border-[#2C2A26] bg-[#FFFFFF] dark:bg-[#1C1B18] text-xs text-[#4F4C45] dark:text-[#C5C2BA] shadow-xs hover:border-[#D97757] transition-colors cursor-default">
              🌐 <span className="font-medium text-[#1F1E1D] dark:text-[#F5F4F0]">Browse autonomously</span> across multiple tabs
            </div>
          </div>
        </div>
      )}

      {messages.map((msg) => {
        // Approval card
        if (msg.role === 'approval' && msg.approvalRequest) {
          return (
            <ApprovalCard
              key={msg.id}
              request={msg.approvalRequest}
              onReply={onApprovalReply || (() => {})}
            />
          );
        }

        // Tool action status pill
        if (msg.role === 'tool_action') {
          return (
            <div
              key={msg.id}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '6px',
                padding: '5px 10px',
                margin: '2px 0',
                borderRadius: '6px',
                background: 'rgba(217,119,87,0.08)',
                border: '1px solid rgba(217,119,87,0.2)',
                fontSize: '11.5px',
                color: '#d97757',
                fontFamily: 'monospace',
              }}
            >
              <span style={{ animation: 'pulse 1.5s infinite' }}>⚙️</span>
              <span>{msg.content}</span>
            </div>
          );
        }

        return (
          <div
            key={msg.id}
            className={`flex flex-col ${
              msg.role === 'user' ? 'items-end' : 'items-start'
            }`}
          >
            {msg.role === 'user' ? (
              /* Claude user message bubble: sleek warm card */
              <div className="max-w-[85%] rounded-2xl rounded-tr-sm px-3.5 py-2.5 text-[13.5px] leading-relaxed bg-[#EFECE6] dark:bg-[#282622] text-[#1F1E1D] dark:text-[#F5F4F0] border border-[#E0DCD3] dark:border-[#383630] shadow-2xs">
                <div className="whitespace-pre-wrap break-words">{msg.content}</div>
              </div>
            ) : (
              /* Claude assistant message: signature avatar & warm typography */
              <div className="w-full flex items-start gap-3">
                <div className="w-6 h-6 rounded-md bg-[#D97757] flex items-center justify-center text-white flex-shrink-0 mt-0.5 shadow-2xs">
                  <Sparkles size={13} className="fill-white" />
                </div>
                <div className="flex-1 text-[13.5px] leading-relaxed text-[#1F1E1D] dark:text-[#F0EEE6]">
                  <div className="whitespace-pre-wrap break-words space-y-1.5">{msg.content}</div>
                </div>
              </div>
            )}
          </div>
        );
      })}

      {/* Real-time streaming assistant message */}
      {streamingDelta && (
        <div className="w-full flex items-start gap-3">
          <div className="w-6 h-6 rounded-md bg-[#D97757] flex items-center justify-center text-white flex-shrink-0 mt-0.5 shadow-2xs animate-pulse">
            <Sparkles size={13} className="fill-white" />
          </div>
          <div className="flex-1 text-[13.5px] leading-relaxed text-[#1F1E1D] dark:text-[#F0EEE6]">
            <div className="whitespace-pre-wrap break-words inline">{streamingDelta}</div>
            <span className="inline-block w-1.5 h-3.5 ml-1 bg-[#D97757] animate-pulse align-middle" />
          </div>
        </div>
      )}
    </div>
  );
};
