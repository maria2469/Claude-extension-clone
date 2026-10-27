import { create } from 'zustand';

interface TokenState {
  token: string | null;
  refreshToken: string | null;
  userEmail: string | null;
  userId: string | null;
  setTokens: (token: string, refreshToken?: string, email?: string, id?: string) => void;
  clearTokens: () => void;
  loadFromStorage: () => Promise<void>;
}

export const useTokenStore = create<TokenState>((set) => ({
  token: null,
  refreshToken: null,
  userEmail: null,
  userId: null,

  setTokens: (token, refreshToken, email, id) => {
    set({
      token,
      refreshToken: refreshToken ?? null,
      userEmail: email ?? null,
      userId: id ?? null,
    });
    if (typeof chrome !== 'undefined' && chrome.storage?.local) {
      chrome.storage.local.set({
        'auth.token': token,
        'auth.refreshToken': refreshToken ?? null,
        'auth.userEmail': email ?? null,
        'auth.userId': id ?? null,
      });
    }
  },

  clearTokens: () => {
    set({ token: null, refreshToken: null, userEmail: null, userId: null });
    if (typeof chrome !== 'undefined' && chrome.storage?.local) {
      chrome.storage.local.remove([
        'auth.token',
        'auth.refreshToken',
        'auth.userEmail',
        'auth.userId',
      ]);
    }
  },

  loadFromStorage: async () => {
    if (typeof chrome !== 'undefined' && chrome.storage?.local) {
      const data = await chrome.storage.local.get([
        'auth.token',
        'auth.refreshToken',
        'auth.userEmail',
        'auth.userId',
      ]);
      if (data['auth.token']) {
        set({
          token: data['auth.token'],
          refreshToken: data['auth.refreshToken'] ?? null,
          userEmail: data['auth.userEmail'] ?? null,
          userId: data['auth.userId'] ?? null,
        });
      }
    }
  },
}));
