import { create } from 'zustand';
import { Mode } from '../bus/messages';

interface SettingsState {
  mode: Mode;
  hasCompletedOnboarding: boolean;
  activeSessionId: string | null;
  setMode: (mode: Mode) => void;
  setOnboardingCompleted: (completed: boolean) => void;
  setActiveSessionId: (id: string | null) => void;
  loadSettings: () => Promise<void>;
}

export const useSettingsStore = create<SettingsState>((set) => ({
  mode: 'manual', // Default is "Ask first" per SDD Section 5.2
  hasCompletedOnboarding: false,
  activeSessionId: null,

  setMode: (mode: Mode) => {
    set({ mode });
    if (typeof chrome !== 'undefined' && chrome.storage?.local) {
      chrome.storage.local.set({ 'settings.mode': mode });
    }
  },

  setOnboardingCompleted: (hasCompletedOnboarding: boolean) => {
    set({ hasCompletedOnboarding });
    if (typeof chrome !== 'undefined' && chrome.storage?.local) {
      chrome.storage.local.set({ 'settings.onboardingCompleted': hasCompletedOnboarding });
    }
  },

  setActiveSessionId: (activeSessionId: string | null) => {
    set({ activeSessionId });
  },

  loadSettings: async () => {
    if (typeof chrome !== 'undefined' && chrome.storage?.local) {
      const data = await chrome.storage.local.get([
        'settings.mode',
        'settings.onboardingCompleted',
      ]);
      set({
        mode: data['settings.mode'] || 'manual',
        hasCompletedOnboarding: Boolean(data['settings.onboardingCompleted']),
      });
    }
  },
}));
