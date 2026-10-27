import React, { useEffect, useState } from 'react';
import ReactDOM from 'react-dom/client';
import { useSettingsStore } from '../../src/store/settings';
import { useTokenStore } from '../../src/store/tokens';
import { Onboarding } from '../../src/app/onboarding/Onboarding';
import { ChatScreen } from '../../src/app/chat/ChatScreen';
import '../../src/styles/globals.css';

const App: React.FC = () => {
  const { hasCompletedOnboarding, setOnboardingCompleted, setMode, loadSettings } =
    useSettingsStore();
  const { token, loadFromStorage } = useTokenStore();
  const [initialStarterPrompt, setInitialStarterPrompt] = useState<string | undefined>();
  const [isReady, setIsReady] = useState(false);

  useEffect(() => {
    Promise.all([loadSettings(), loadFromStorage()]).then(() => {
      setIsReady(true);
    });
  }, [loadSettings, loadFromStorage]);

  if (!isReady) {
    return (
      <div className="h-screen w-full flex items-center justify-center bg-white dark:bg-zinc-900 text-gray-400">
        <div className="animate-pulse text-xs">Loading...</div>
      </div>
    );
  }

  // Show onboarding screen on first run
  if (!hasCompletedOnboarding) {
    return (
      <Onboarding
        isAuthenticated={Boolean(token)}
        onComplete={(mode, starterPrompt) => {
          setMode(mode);
          setOnboardingCompleted(true);
          if (starterPrompt) {
            setInitialStarterPrompt(starterPrompt);
          }
        }}
      />
    );
  }

  return <ChatScreen initialPrompt={initialStarterPrompt} />;
};

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);
