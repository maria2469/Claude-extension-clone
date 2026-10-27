import { defineConfig } from 'wxt';

export default defineConfig({
  srcDir: 'src',
  entrypointsDir: '../entrypoints',
  modules: ['@wxt-dev/module-react'],
  manifest: ({ browser }) => ({
    name: 'Malude', // keep in sync with lib/brand.ts
    description: 'An AI assistant that works in your browser tabs when you ask.',
    minimum_chrome_version: '120',
    action: { default_title: 'Open Malude' },
    side_panel: { default_path: 'sidepanel.html' },
    permissions: [
      'sidePanel',
      'activeTab',
      'debugger',
      'tabs',
      'tabGroups',
      'storage',
      'unlimitedStorage',
      'scripting',
      'alarms',
      'notifications',
      'offscreen',
      'webNavigation',
    ],
    host_permissions: ['<all_urls>'],
    // nativeMessaging stays optional: only requested when the user enables the bridge (M7).
    optional_permissions: browser === 'chrome' ? ['nativeMessaging'] : [],
    commands: {
      'toggle-panel': {
        suggested_key: { default: 'Ctrl+Shift+Period' },
        description: 'Open or close the panel',
      },
    },
    // MV3 forbids remote code; this CSP also blocks eval and inline scripts.
    content_security_policy: { extension_pages: "script-src 'self'; object-src 'self'" },
  }),
});
