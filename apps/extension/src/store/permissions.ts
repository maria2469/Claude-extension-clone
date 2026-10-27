import { create } from 'zustand';

export type PermissionGrant = 'none' | 'session' | 'always' | 'blocked';

interface PermissionsState {
  alwaysAllowedOrigins: Set<string>;
  sessionAllowedOrigins: Set<string>;
  blockedOrigins: Set<string>;
  getGrant: (origin: string) => PermissionGrant;
  setGrant: (origin: string, grant: PermissionGrant) => void;
  loadPermissions: () => Promise<void>;
}

export const usePermissionsStore = create<PermissionsState>((set, get) => ({
  alwaysAllowedOrigins: new Set<string>(),
  sessionAllowedOrigins: new Set<string>(),
  blockedOrigins: new Set<string>(),

  getGrant: (origin: string): PermissionGrant => {
    const { blockedOrigins, alwaysAllowedOrigins, sessionAllowedOrigins } = get();
    if (blockedOrigins.has(origin)) return 'blocked';
    if (alwaysAllowedOrigins.has(origin)) return 'always';
    if (sessionAllowedOrigins.has(origin)) return 'session';
    return 'none';
  },

  setGrant: (origin: string, grant: PermissionGrant) => {
    set((state) => {
      const always = new Set(state.alwaysAllowedOrigins);
      const session = new Set(state.sessionAllowedOrigins);
      const blocked = new Set(state.blockedOrigins);

      always.delete(origin);
      session.delete(origin);
      blocked.delete(origin);

      if (grant === 'always') always.add(origin);
      if (grant === 'session') session.add(origin);
      if (grant === 'blocked') blocked.add(origin);

      if (typeof chrome !== 'undefined' && chrome.storage?.local) {
        chrome.storage.local.set({
          'perm.always': Array.from(always),
          'perm.blocked': Array.from(blocked),
        });
      }

      return {
        alwaysAllowedOrigins: always,
        sessionAllowedOrigins: session,
        blockedOrigins: blocked,
      };
    });
  },

  loadPermissions: async () => {
    if (typeof chrome !== 'undefined' && chrome.storage?.local) {
      const data = await chrome.storage.local.get(['perm.always', 'perm.blocked']);
      set({
        alwaysAllowedOrigins: new Set(data['perm.always'] || []),
        blockedOrigins: new Set(data['perm.blocked'] || []),
      });
    }
  },
}));
