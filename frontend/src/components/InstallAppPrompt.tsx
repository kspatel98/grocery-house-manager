import { useEffect, useState } from 'react';

type InstallPromptEvent = Event & {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed'; platform: string }>;
};

export default function InstallAppPrompt() {
  const [promptEvent, setPromptEvent] = useState<InstallPromptEvent | null>(null);
  const [installed, setInstalled] = useState(() => window.matchMedia?.('(display-mode: standalone)').matches || (navigator as Navigator & { standalone?: boolean }).standalone === true);
  const [showIosHelp, setShowIosHelp] = useState(false);
  const isiOS = /iphone|ipad|ipod/i.test(navigator.userAgent);

  useEffect(() => {
    const onPrompt = (event: Event) => {
      event.preventDefault();
      setPromptEvent(event as InstallPromptEvent);
    };
    const onInstalled = () => {
      setInstalled(true);
      setPromptEvent(null);
    };
    window.addEventListener('beforeinstallprompt', onPrompt);
    window.addEventListener('appinstalled', onInstalled);
    return () => {
      window.removeEventListener('beforeinstallprompt', onPrompt);
      window.removeEventListener('appinstalled', onInstalled);
    };
  }, []);

  if (installed) return null;

  async function install() {
    if (promptEvent) {
      await promptEvent.prompt();
      const choice = await promptEvent.userChoice;
      if (choice.outcome === 'accepted') setPromptEvent(null);
      return;
    }
    setShowIosHelp(true);
  }

  return (
    <section className="install-app-card">
      <div className="install-app-icon">📲</div>
      <div>
        <p className="eyebrow">Better on your phone</p>
        <h3>Install Grocery House Manager</h3>
        <p>Open it like an app from your Home Screen. Your latest shopping list is kept as an offline fallback after it has loaded once, and the Smart Assistant can offer device reminders when your household needs attention.</p>
        {showIosHelp && isiOS ? <div className="hint compact-message">On iPhone/iPad: open this site in Safari → tap Share → <strong>Add to Home Screen</strong>.</div> : null}
      </div>
      <button type="button" className="secondary" onClick={install}>{promptEvent ? 'Install app' : isiOS ? 'Show iPhone steps' : 'Install help'}</button>
    </section>
  );
}
