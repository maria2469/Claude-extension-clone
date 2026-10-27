import React from 'react';
import { Plus, History, Settings, Sparkles } from 'lucide-react';
import { PRODUCT_NAME } from '../../lib/brand';

export interface HeaderProps {
  sessionTitle?: string;
  onNewSession?: () => void;
  onOpenHistory?: () => void;
  onOpenSettings?: () => void;
}

export const Header: React.FC<HeaderProps> = ({
  sessionTitle,
  onNewSession,
  onOpenHistory,
  onOpenSettings,
}) => {
  return (
    <header className="h-13 border-b border-[#E8E5DC] dark:border-[#2C2A26] px-3.5 flex items-center justify-between bg-[#FAF9F5] dark:bg-[#141413] select-none transition-colors">
      <div className="flex items-center gap-2.5 min-w-0">
        {/* Claude signature terracotta warm badge */}
        <div className="w-6 h-6 rounded-md bg-[#D97757] flex items-center justify-center text-white flex-shrink-0 shadow-sm">
          <Sparkles size={13} className="text-white fill-white" />
        </div>
        <div className="flex flex-col min-w-0">
          <span className="font-semibold text-[13px] text-[#1F1E1D] dark:text-[#F5F4F0] truncate tracking-tight">
            {sessionTitle || PRODUCT_NAME}
          </span>
        </div>
      </div>

      <div className="flex items-center gap-1">
        <button
          onClick={onNewSession}
          title="Start new conversation"
          aria-label="New session"
          className="p-1.5 text-[#7A766F] hover:text-[#1F1E1D] dark:text-[#969288] dark:hover:text-[#F5F4F0] rounded-md hover:bg-[#EFECE6] dark:hover:bg-[#23221F] transition-colors"
        >
          <Plus size={16} />
        </button>
        <button
          onClick={onOpenHistory}
          title="Conversation history"
          aria-label="History"
          className="p-1.5 text-[#7A766F] hover:text-[#1F1E1D] dark:text-[#969288] dark:hover:text-[#F5F4F0] rounded-md hover:bg-[#EFECE6] dark:hover:bg-[#23221F] transition-colors"
        >
          <History size={16} />
        </button>
        <button
          onClick={onOpenSettings}
          title="Settings"
          aria-label="Settings"
          className="p-1.5 text-[#7A766F] hover:text-[#1F1E1D] dark:text-[#969288] dark:hover:text-[#F5F4F0] rounded-md hover:bg-[#EFECE6] dark:hover:bg-[#23221F] transition-colors"
        >
          <Settings size={16} />
        </button>
      </div>
    </header>
  );
};
