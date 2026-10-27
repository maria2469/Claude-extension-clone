import { PRODUCT_NAME } from '../lib/brand';

export const COPY = {
  appName: PRODUCT_NAME,
  tagline: 'An AI assistant that works in your browser tabs when you ask.',
  onboarding: {
    welcome: `Welcome to ${PRODUCT_NAME}`,
    explainer:
      'Malude acts in your browser tabs to complete tasks. It reads page structure and accessibility trees to understand web pages and take actions on your behalf.',
    privacyNote:
      'Content of the tabs in the agent group is sent to the model to answer you. Passwords, payment cards, and sensitive fields are never extracted.',
    injectionWarning:
      'Untrusted web content is treated as data, not instructions. Consequential actions will always prompt for your explicit approval.',
    chooseMode: 'Choose operating mode',
    manualModeDesc: 'Ask first (Manual): Approves every action before execution.',
    autoModeDesc: 'Act with safety check (Auto): Automated actions with AI safety reviewer.',
    startBtn: 'Get Started',
    signInBtn: 'Sign In to Continue',
  },
  composer: {
    placeholder: `Ask ${PRODUCT_NAME} anything about this page or type / for shortcuts...`,
    send: 'Send',
    stop: 'Stop',
  },
  status: {
    idle: 'Ready',
    working: 'Working...',
    waiting: 'Waiting for approval',
    error: 'Error',
    askFirst: 'Ask first',
    auto: 'Act with safety check',
  },
  approval: {
    title: (action: string, site: string) =>
      `Allow ${PRODUCT_NAME} to ${action} on ${site}?`,
    allowOnce: 'Allow once',
    alwaysOnSite: 'Always on this site',
    deny: 'Deny',
  },
  sitePermission: {
    title: (site: string) => `Let ${PRODUCT_NAME} work on ${site}?`,
    allowSession: 'Allow for this session',
    alwaysAllow: 'Always allow',
    deny: 'Deny',
  },
  run: {
    stopped: 'Stopped. Nothing further was changed.',
    failed: 'An error occurred during execution.',
    completed: 'Task completed.',
  },
  killSwitch: {
    title: 'Service Temporarily Paused',
    message: 'Automated actions have been disabled by system policy.',
  },
};
