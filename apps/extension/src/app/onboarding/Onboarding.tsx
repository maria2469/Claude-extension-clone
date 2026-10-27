import React, { useState } from 'react';
import { Shield, Lock, Sparkles, AlertTriangle, ArrowRight, Key } from 'lucide-react';
import { PRODUCT_NAME } from '../../lib/brand';
import { COPY } from '../../content/copy';
import { Mode } from '../../bus/messages';
import { Button } from '../../components/ui/Button';
import { useTokenStore } from '../../store/tokens';

export interface OnboardingProps {
  onComplete: (mode: Mode, starterPrompt?: string) => void;
  isAuthenticated: boolean;
}

export const Onboarding: React.FC<OnboardingProps> = ({
  onComplete,
  isAuthenticated,
}) => {
  const [selectedMode, setSelectedMode] = useState<Mode>('manual');
  const [showTokenInput, setShowTokenInput] = useState(false);
  const [manualToken, setManualToken] = useState('');
  const { setTokens } = useTokenStore();

  const starterPrompts = [
    'Summarize this page in three key takeaways',
    'Find all pricing and plans on this website',
    'Extract the contact info and social links',
  ];

  const handleDevSignIn = () => {
    const simulatedJwt =
      'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiJkZXYtdXNlciIsImVtYWlsIjoiZGV2QGV4YW1wbGUuY29tIiwiYXVkIjoiYXV0aGVudGljYXRlZCIsImV4cCI6MTgyNDIxMTI1N30.8hojEJKPqE3BmU4ybix0csamPoQVKAX9Vjn0u5imat0';
    setTokens(simulatedJwt, undefined, 'dev@example.com', 'dev-user');
    onComplete(selectedMode);
  };

  const handleManualTokenSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!manualToken.trim()) return;
    setTokens(manualToken.trim(), undefined, 'user@custom.com', 'custom-user');
    onComplete(selectedMode);
  };

  return (
    <div className="flex flex-col h-full overflow-y-auto p-5 bg-[#FAF9F5] dark:bg-[#141413] text-[#1F1E1D] dark:text-[#F5F4F0]">
      {/* Brand Header */}
      <div className="flex items-center gap-3 mb-5">
        <div className="w-10 h-10 rounded-xl bg-[#D97757] flex items-center justify-center text-white shadow-sm flex-shrink-0">
          <Sparkles size={20} className="fill-white" />
        </div>
        <div>
          <h1 className="text-base font-bold tracking-tight text-[#1F1E1D] dark:text-[#F5F4F0]">
            {COPY.onboarding.welcome}
          </h1>
          <p className="text-xs text-[#7A766F] dark:text-[#969288]">{COPY.tagline}</p>
        </div>
      </div>

      {/* Feature Explanations */}
      <div className="space-y-3 mb-5">
        <div className="flex gap-2.5 p-3 rounded-xl bg-[#FFFFFF] dark:bg-[#1E1D1A] border border-[#E8E5DC] dark:border-[#2C2A26] shadow-2xs">
          <Shield size={16} className="text-[#D97757] flex-shrink-0 mt-0.5" />
          <div className="text-xs space-y-0.5">
            <span className="font-semibold block text-[#1F1E1D] dark:text-[#F5F4F0]">Browser Awareness</span>
            <p className="text-[#7A766F] dark:text-[#969288] leading-relaxed">{COPY.onboarding.explainer}</p>
          </div>
        </div>

        <div className="flex gap-2.5 p-3 rounded-xl bg-[#FFFFFF] dark:bg-[#1E1D1A] border border-[#E8E5DC] dark:border-[#2C2A26] shadow-2xs">
          <Lock size={16} className="text-[#2D8A4E] dark:text-[#3FB950] flex-shrink-0 mt-0.5" />
          <div className="text-xs space-y-0.5">
            <span className="font-semibold block text-[#1F1E1D] dark:text-[#F5F4F0]">Privacy First</span>
            <p className="text-[#7A766F] dark:text-[#969288] leading-relaxed">{COPY.onboarding.privacyNote}</p>
          </div>
        </div>

        <div className="flex gap-2.5 p-3 rounded-xl bg-[#FFFBF2] dark:bg-[#201D17] border border-[#F2E5C7] dark:border-[#3E382A] shadow-2xs">
          <AlertTriangle size={16} className="text-[#D97706] dark:text-[#E39C3D] flex-shrink-0 mt-0.5" />
          <div className="text-xs space-y-0.5">
            <span className="font-semibold block text-[#92540D] dark:text-[#E39C3D]">Safety Guardrails</span>
            <p className="text-[#875517] dark:text-[#C5A574] leading-relaxed">{COPY.onboarding.injectionWarning}</p>
          </div>
        </div>
      </div>

      {/* Mode selection */}
      <div className="mb-5">
        <label className="text-xs font-semibold text-[#1F1E1D] dark:text-[#F5F4F0] block mb-2">
          {COPY.onboarding.chooseMode}
        </label>
        <div className="grid grid-cols-2 gap-2">
          <button
            type="button"
            onClick={() => setSelectedMode('manual')}
            className={`p-2.5 text-left rounded-xl border text-xs transition-all ${
              selectedMode === 'manual'
                ? 'border-[#D97757] bg-[#D97757]/10 dark:bg-[#D97757]/15 text-[#1F1E1D] dark:text-[#F5F4F0] ring-1 ring-[#D97757]'
                : 'border-[#E8E5DC] dark:border-[#2C2A26] bg-[#FFFFFF] dark:bg-[#1E1D1A] text-[#7A766F] dark:text-[#969288] hover:border-[#D97757]'
            }`}
          >
            <span className="font-semibold block mb-0.5 text-[#1F1E1D] dark:text-[#F5F4F0]">Ask first</span>
            <span className="text-[11px] opacity-80 leading-tight block">
              Approves actions before execution.
            </span>
          </button>

          <button
            type="button"
            onClick={() => setSelectedMode('auto')}
            className={`p-2.5 text-left rounded-xl border text-xs transition-all ${
              selectedMode === 'auto'
                ? 'border-[#D97757] bg-[#D97757]/10 dark:bg-[#D97757]/15 text-[#1F1E1D] dark:text-[#F5F4F0] ring-1 ring-[#D97757]'
                : 'border-[#E8E5DC] dark:border-[#2C2A26] bg-[#FFFFFF] dark:bg-[#1E1D1A] text-[#7A766F] dark:text-[#969288] hover:border-[#D97757]'
            }`}
          >
            <span className="font-semibold block mb-0.5 text-[#1F1E1D] dark:text-[#F5F4F0]">Act with check</span>
            <span className="text-[11px] opacity-80 leading-tight block">
              Automated actions with AI safety reviewer.
            </span>
          </button>
        </div>
      </div>

      {/* Starter Prompts */}
      <div className="mb-5">
        <label className="text-xs font-semibold text-[#1F1E1D] dark:text-[#F5F4F0] block mb-2 flex items-center gap-1.5">
          <Sparkles size={12} className="text-[#D97757]" />
          Starter prompts
        </label>
        <div className="space-y-1.5">
          {starterPrompts.map((prompt, idx) => (
            <button
              key={idx}
              onClick={() => {
                if (!isAuthenticated) {
                  handleDevSignIn();
                }
                onComplete(selectedMode, prompt);
              }}
              className="w-full text-left p-2.5 rounded-xl border border-[#E8E5DC] dark:border-[#2C2A26] bg-[#FFFFFF] dark:bg-[#1E1D1A] hover:border-[#D97757] text-xs text-[#1F1E1D] dark:text-[#F0EEE6] transition-colors flex items-center justify-between group shadow-2xs"
            >
              <span>{prompt}</span>
              <ArrowRight size={12} className="opacity-0 group-hover:opacity-100 transition-opacity text-[#D97757]" />
            </button>
          ))}
        </div>
      </div>

      <div className="mt-auto pt-3 border-t border-[#E8E5DC] dark:border-[#262420] space-y-2">
        {showTokenInput ? (
          <form onSubmit={handleManualTokenSubmit} className="space-y-2">
            <input
              type="text"
              value={manualToken}
              onChange={(e) => setManualToken(e.target.value)}
              placeholder="Paste Bearer JWT Token..."
              className="w-full px-3 py-2 text-xs rounded-xl border border-[#DED9CE] dark:border-[#383630] bg-[#FFFFFF] dark:bg-[#1E1D1A] text-[#1F1E1D] dark:text-[#F5F4F0] focus:outline-none focus:ring-1 focus:ring-[#D97757]"
            />
            <div className="flex gap-2">
              <button
                type="submit"
                className="flex-1 py-2 px-3 rounded-xl bg-[#D97757] text-white text-xs font-medium hover:bg-[#C15F3E] transition shadow-sm"
              >
                Save & Continue
              </button>
              <button
                type="button"
                onClick={() => setShowTokenInput(false)}
                className="py-2 px-3 rounded-xl bg-transparent text-[#7A766F] dark:text-[#969288] text-xs hover:bg-[#EAE7DF] dark:hover:bg-[#252420] transition"
              >
                Cancel
              </button>
            </div>
          </form>
        ) : (
          <>
            <button
              className="w-full py-2.5 px-4 rounded-xl bg-[#D97757] text-white font-medium text-xs hover:bg-[#C15F3E] transition shadow-sm flex items-center justify-center gap-1.5"
              onClick={() => {
                if (!isAuthenticated) {
                  handleDevSignIn();
                } else {
                  onComplete(selectedMode);
                }
              }}
            >
              {isAuthenticated ? COPY.onboarding.startBtn : 'Get Started (Connect)'}
            </button>
            <button
              type="button"
              onClick={() => setShowTokenInput(true)}
              className="w-full text-center text-[11px] text-[#969288] hover:text-[#1F1E1D] dark:hover:text-[#F5F4F0] flex items-center justify-center gap-1 pt-1"
            >
              <Key size={11} /> Enter custom API token
            </button>
          </>
        )}
      </div>
    </div>
  );
};
