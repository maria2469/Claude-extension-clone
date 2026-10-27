// Environment configuration for the extension
export const API_BASE_URL =
  (import.meta.env.VITE_API_URL as string) || 'http://localhost:8080';

export function getExtensionId(): string {
  return typeof chrome !== 'undefined' && chrome.runtime?.id
    ? chrome.runtime.id
    : 'dev-extension-id';
}
