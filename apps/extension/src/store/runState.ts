import { create } from 'zustand';

export type RunStatus = 'idle' | 'working' | 'waiting' | 'error';

export interface RunStateData {
  runId: string;
  step: number;
  startedAt: number;
  messages: Array<any>;
  status: RunStatus;
  pageUrl?: string;
  tabIds: number[];
}

interface RunStoreState {
  currentRun: RunStateData | null;
  status: RunStatus;
  streamingDelta: string;
  setStatus: (status: RunStatus) => void;
  appendDelta: (delta: string) => void;
  clearDelta: () => void;
  setCurrentRun: (run: RunStateData | null) => void;
  updateMessages: (messages: Array<any>) => void;
}

export const useRunStore = create<RunStoreState>((set) => ({
  currentRun: null,
  status: 'idle',
  streamingDelta: '',

  setStatus: (status) => set({ status }),
  appendDelta: (delta) => set((s) => ({ streamingDelta: s.streamingDelta + delta })),
  clearDelta: () => set({ streamingDelta: '' }),
  setCurrentRun: (currentRun) => set({ currentRun, status: currentRun ? currentRun.status : 'idle' }),
  updateMessages: (messages) =>
    set((s) => (s.currentRun ? { currentRun: { ...s.currentRun, messages } } : {})),
}));

/**
 * Persist run state to chrome.storage.local after EVERY step so worker restarts can resume
 */
export async function saveRunState(runId: string, state: RunStateData): Promise<void> {
  if (typeof chrome !== 'undefined' && chrome.storage?.local) {
    await chrome.storage.local.set({ [`run:${runId}`]: state });
  }
}

/**
 * Load persisted run state from chrome.storage.local
 */
export async function loadRunState(runId: string): Promise<RunStateData | null> {
  if (typeof chrome !== 'undefined' && chrome.storage?.local) {
    const data = await chrome.storage.local.get(`run:${runId}`);
    return data[`run:${runId}`] ?? null;
  }
  return null;
}

/**
 * Clean up finished run state
 */
export async function clearRunState(runId: string): Promise<void> {
  if (typeof chrome !== 'undefined' && chrome.storage?.local) {
    await chrome.storage.local.remove(`run:${runId}`);
  }
}
