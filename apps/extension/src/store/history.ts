/**
 * Session History Store — M7: Session History & Database Persistence
 *
 * Persists chat session summaries to chrome.storage.local.
 * Each session stores: id, title, messages, createdAt, updatedAt.
 */

import { create } from 'zustand';

export interface HistoryMessage {
  role: 'user' | 'assistant';
  content: string;
}

export interface SessionEntry {
  id: string;
  title: string;
  messages: HistoryMessage[];
  createdAt: number; // unix ms
  updatedAt: number;
}

interface HistoryState {
  sessions: SessionEntry[];
  /** Load sessions from chrome.storage.local */
  loadSessions: () => Promise<void>;
  /** Save or update a session */
  saveSession: (session: SessionEntry) => Promise<void>;
  /** Delete a session by ID */
  deleteSession: (id: string) => Promise<void>;
  /** Rename a session */
  renameSession: (id: string, title: string) => Promise<void>;
}

const STORAGE_KEY = 'malude_history_v1';

async function readStorage(): Promise<SessionEntry[]> {
  if (typeof chrome === 'undefined' || !chrome.storage?.local) return [];
  const result = await chrome.storage.local.get(STORAGE_KEY);
  return (result[STORAGE_KEY] as SessionEntry[]) || [];
}

async function writeStorage(sessions: SessionEntry[]): Promise<void> {
  if (typeof chrome === 'undefined' || !chrome.storage?.local) return;
  await chrome.storage.local.set({ [STORAGE_KEY]: sessions });
}

export const useHistoryStore = create<HistoryState>((set, get) => ({
  sessions: [],

  loadSessions: async () => {
    const sessions = await readStorage();
    // Sort by updatedAt descending (most recent first)
    sessions.sort((a, b) => b.updatedAt - a.updatedAt);
    set({ sessions });
  },

  saveSession: async (session: SessionEntry) => {
    const existing = await readStorage();
    const idx = existing.findIndex((s) => s.id === session.id);
    if (idx >= 0) {
      existing[idx] = { ...session, updatedAt: Date.now() };
    } else {
      existing.unshift(session);
    }
    // Keep only last 100 sessions to avoid storage bloat
    const trimmed = existing.slice(0, 100);
    await writeStorage(trimmed);
    trimmed.sort((a, b) => b.updatedAt - a.updatedAt);
    set({ sessions: trimmed });
  },

  deleteSession: async (id: string) => {
    const existing = await readStorage();
    const updated = existing.filter((s) => s.id !== id);
    await writeStorage(updated);
    set({ sessions: updated });
  },

  renameSession: async (id: string, title: string) => {
    const existing = await readStorage();
    const updated = existing.map((s) =>
      s.id === id ? { ...s, title, updatedAt: Date.now() } : s
    );
    await writeStorage(updated);
    set({ sessions: updated });
  },
}));
