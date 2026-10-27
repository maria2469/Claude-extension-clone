import React, { useState, useRef, useEffect } from 'react';
import { ArrowUp, Square } from 'lucide-react';
import { COPY } from '../../content/copy';

export interface ComposerProps {
  onSend: (text: string) => void;
  onStop: () => void;
  isRunning: boolean;
  disabled?: boolean;
}

export const Composer: React.FC<ComposerProps> = ({
  onSend,
  onStop,
  isRunning,
  disabled = false,
}) => {
  const [input, setInput] = useState('');
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  // Auto-resize textarea to fit content up to 160px
  useEffect(() => {
    if (textareaRef.current) {
      textareaRef.current.style.height = 'auto';
      textareaRef.current.style.height = `${Math.min(textareaRef.current.scrollHeight, 160)}px`;
    }
  }, [input]);

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Escape' && isRunning) {
      e.preventDefault();
      onStop();
      return;
    }

    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      if (!isRunning && input.trim() && !disabled) {
        onSend(input.trim());
        setInput('');
      }
    }
  };

  const handleButtonClick = () => {
    if (isRunning) {
      onStop();
    } else if (input.trim() && !disabled) {
      onSend(input.trim());
      setInput('');
    }
  };

  const canSend = Boolean(input.trim()) && !disabled;

  return (
    <div className="p-3 bg-[#FAF9F5] dark:bg-[#141413] border-t border-[#E8E5DC] dark:border-[#262420]">
      {/* Official Claude-style rounded-2xl composer card */}
      <div className="relative flex flex-col rounded-2xl border border-[#DED9CE] dark:border-[#383630] bg-[#FFFFFF] dark:bg-[#1E1D1A] focus-within:border-[#D97757] focus-within:ring-1 focus-within:ring-[#D97757] shadow-sm transition-all p-3">
        <textarea
          ref={textareaRef}
          value={input}
          disabled={disabled}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder={COPY.composer.placeholder}
          rows={1}
          aria-label="Prompt composer"
          className="w-full resize-none bg-transparent text-[13.5px] text-[#1F1E1D] dark:text-[#F5F4F0] placeholder-[#969288] dark:placeholder-[#6E6B63] focus:outline-none min-h-[26px] max-h-[160px] leading-relaxed"
        />

        <div className="flex items-center justify-between pt-2 mt-1 border-t border-[#F2EFE9] dark:border-[#2C2A26]">
          <span className="text-[11px] text-[#969288] dark:text-[#6E6B63] select-none font-sans">
            {isRunning ? 'Press Esc to cancel' : 'Shift + Enter for new line'}
          </span>

          {/* Official Claude terracotta circular action button */}
          <button
            onClick={handleButtonClick}
            disabled={!isRunning && !canSend}
            aria-label={isRunning ? 'Stop generating' : 'Send message'}
            title={isRunning ? 'Stop' : 'Send'}
            className={`w-7 h-7 rounded-full flex items-center justify-center transition-all ${
              isRunning
                ? 'bg-[#E05244] text-white hover:bg-[#C93B2E] shadow-sm'
                : canSend
                ? 'bg-[#D97757] text-white hover:bg-[#C15F3E] shadow-sm scale-100 hover:scale-105 active:scale-95'
                : 'bg-[#EAE7DF] dark:bg-[#2B2925] text-[#A8A49B] dark:text-[#5E5B54] cursor-not-allowed'
            }`}
          >
            {isRunning ? (
              <Square size={11} fill="currentColor" />
            ) : (
              <ArrowUp size={14} strokeWidth={2.5} />
            )}
          </button>
        </div>
      </div>
    </div>
  );
};
