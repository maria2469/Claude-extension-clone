import React from 'react';
import { Layers, CheckCircle2, Loader2, AlertCircle, ShieldAlert } from 'lucide-react';
import { Mode } from '../../bus/messages';
import { RunStatus } from '../../store/runState';

export interface StatusStripProps {
  tabCount: number;
  mode: Mode;
  runStatus: RunStatus;
  onModeChange: (mode: Mode) => void;
}

export const StatusStrip: React.FC<StatusStripProps> = ({
  tabCount,
  mode,
  runStatus,
  onModeChange,
}) => {
  const getStatusDisplay = () => {
    switch (runStatus) {
      case 'working':
        return {
          icon: <Loader2 size={12} className="animate-spin text-[#D97757]" />,
          label: 'Thinking...',
          color: 'text-[#D97757]',
        };
      case 'waiting':
        return {
          icon: <ShieldAlert size={12} className="text-[#E39C3D]" />,
          label: 'Needs approval',
          color: 'text-[#E39C3D]',
        };
      case 'error':
        return {
          icon: <AlertCircle size={12} className="text-[#F85149]" />,
          label: 'Error',
          color: 'text-[#F85149]',
        };
      case 'idle':
      default:
        return {
          icon: <CheckCircle2 size={12} className="text-[#3FB950]" />,
          label: 'Ready',
          color: 'text-[#3FB950]',
        };
    }
  };

  const status = getStatusDisplay();

  return (
    <div className="h-7 border-b border-[#E8E5DC] dark:border-[#262420] px-3.5 bg-[#F4F2EB]/60 dark:bg-[#1A1917] flex items-center justify-between text-[11px] text-[#7A766F] dark:text-[#969288] select-none">
      <div className="flex items-center gap-3">
        {/* Active tab badge */}
        <div className="flex items-center gap-1.5" title={`${tabCount} tab(s) connected`}>
          <Layers size={12} className="text-[#969288]" />
          <span>{tabCount} tab{tabCount !== 1 ? 's' : ''}</span>
        </div>

        {/* Run status (always icon + text) */}
        <div className={`flex items-center gap-1 font-medium ${status.color}`}>
          {status.icon}
          <span>{status.label}</span>
        </div>
      </div>

      {/* Mode selection dropdown */}
      <div className="flex items-center gap-1">
        <select
          value={mode}
          onChange={(e) => onModeChange(e.target.value as Mode)}
          aria-label="Agent mode"
          className="bg-transparent text-[11px] font-medium text-[#1F1E1D] dark:text-[#E6E4DE] rounded px-1.5 py-0.5 border border-[#E0DCD3] dark:border-[#383630] hover:border-[#D97757] dark:hover:border-[#D97757] focus:outline-none focus:ring-1 focus:ring-[#D97757] cursor-pointer transition-colors"
        >
          <option value="manual" className="bg-[#FAF9F5] dark:bg-[#1F1E1B] text-[#1F1E1D] dark:text-[#F5F4F0]">
            Ask first
          </option>
          <option value="auto" className="bg-[#FAF9F5] dark:bg-[#1F1E1B] text-[#1F1E1D] dark:text-[#F5F4F0]">
            Act with safety check
          </option>
        </select>
      </div>
    </div>
  );
};
