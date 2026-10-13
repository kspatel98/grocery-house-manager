import { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { api, errorMessage } from '../api';
import type { HouseholdAgentResponse } from '../types';
import OverlayPortal from './OverlayPortal';
import { useLanguage } from '../i18n';

declare global {
  interface Window {
    webkitSpeechRecognition?: any;
    SpeechRecognition?: any;
  }
}

type SuggestedAction = { label: string; path: string } | null;

export default function UniversalCapture({ houseId }: { houseId: number | null }) {
  const navigate = useNavigate();
  const { language } = useLanguage();
  const [open, setOpen] = useState(false);
  const [text, setText] = useState('');
  const [answer, setAnswer] = useState('');
  const [busy, setBusy] = useState(false);
  const [listening, setListening] = useState(false);
  const [error, setError] = useState('');
  const [suggestedAction, setSuggestedAction] = useState<SuggestedAction>(null);
  const recognitionRef = useRef<any>(null);

  useEffect(() => {
    const openCapture = () => { setOpen(true); setError(''); };
    window.addEventListener('ghm:capture-open', openCapture);
    return () => window.removeEventListener('ghm:capture-open', openCapture);
  }, []);

  function close() {
    recognitionRef.current?.stop?.();
    setListening(false);
    setOpen(false);
  }

  function go(path: string) {
    close();
    navigate(path);
  }

  function routeKnownIntent(value: string) {
    if (!houseId) return false;
    const q = value.toLowerCase();

    if (/restaurant|takeout|take out|eat out|order food|food tonight|dinner out|swaminarayan food|jain food/.test(q)) {
      go(`/houses/${houseId}/food?mode=restaurant&q=${encodeURIComponent(value)}`);
      return true;
    }
    if (/grocery store|food store|supermarket|where.*buy groceries|nearby store/.test(q)) {
      go(`/houses/${houseId}/food?mode=grocery&q=${encodeURIComponent(value)}`);
      return true;
    }
    if (/scan.*receipt|receipt.*scan|upload.*receipt/.test(q)) {
      go(`/houses/${houseId}/scan`);
      return true;
    }
    if (/scan.*kitchen|check.*fridge|check.*pantry|check.*freezer|kitchen vision|kitchen map/.test(q)) {
      go(`/houses/${houseId}/kitchen`);
      return true;
    }
    if (/out of |almost out|running low|add .*shopping|add .*list|need to buy|grocery list|shopping list/.test(q)) {
      go(`/houses/${houseId}/shopping`);
      return true;
    }
    if (/guest|meal plan|plan.*week|what.*cook|dinner.*home|busy week|going away|vacation/.test(q)) {
      go(`/assistant?house=${houseId}&view=plan&q=${encodeURIComponent(value)}`);
      return true;
    }
    if (/expense|reimburse|owe|owed|split.*bill|split.*expense/.test(q)) {
      go(`/houses/${houseId}/expenses`);
      return true;
    }
    if (/why\b|analy[sz]e|explain|forecast|what should we buy|what should i buy|should we|use first|spending.*(up|increase|higher)|usual store|household intelligence/.test(q)) {
      go(`/assistant?house=${houseId}&view=intelligence&q=${encodeURIComponent(value)}`);
      return true;
    }
    if (/inventory|what.*have|what.*home|stock at home/.test(q)) {
      go(`/houses/${houseId}?tab=home`);
      return true;
    }
    if (/price|flyer|deal|cheapest|compare.*trip/.test(q)) {
      go('/market');
      return true;
    }
    return false;
  }

  function fallbackAction(value: string): SuggestedAction {
    if (!houseId) return null;
    const q = value.toLowerCase();
    if (/meal|cook|dinner|week|guest/.test(q)) return { label: 'Open Plan', path: `/assistant?house=${houseId}&view=plan` };
    if (/buy|shop|grocery|milk|bread|egg|list/.test(q)) return { label: 'Open Shopping', path: `/houses/${houseId}/shopping` };
    return { label: 'Open Today', path: `/houses/${houseId}` };
  }

  async function submit() {
    const clean = text.trim();
    if (!clean || !houseId) return;
    setError('');
    setAnswer('');
    setSuggestedAction(null);
    if (routeKnownIntent(clean)) return;
    try {
      setBusy(true);
      const { data } = await api.post<HouseholdAgentResponse>(`/ai/houses/${houseId}/household-agent`, { prompt: clean, language });
      setAnswer(data.answer || data.message);
      if (!data.configured) setSuggestedAction(fallbackAction(clean));
    } catch (err) {
      setError(errorMessage(err));
      setSuggestedAction(fallbackAction(clean));
    } finally {
      setBusy(false);
    }
  }

  function startVoice() {
    const Recognition = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!Recognition) {
      setError('Voice capture is not available in this browser. Type the same request instead.');
      return;
    }
    try {
      recognitionRef.current?.stop?.();
      const recognition = new Recognition();
      recognition.lang = ({ en: 'en-CA', gu: 'gu-IN', hi: 'hi-IN', fr: 'fr-CA' } as const)[language] || 'en-CA';
      recognition.interimResults = false;
      recognition.continuous = false;
      recognition.onstart = () => setListening(true);
      recognition.onend = () => setListening(false);
      recognition.onerror = () => {
        setListening(false);
        setError('Voice capture could not hear that clearly. Try again or type it.');
      };
      recognition.onresult = (event: any) => {
        const spoken = String(event.results?.[0]?.[0]?.transcript || '').trim();
        if (spoken) setText(spoken);
      };
      recognition.start();
      recognitionRef.current = recognition;
    } catch {
      setListening(false);
      setError('Voice capture could not start. Try typing your request.');
    }
  }

  if (!houseId) return null;

  return (
    <>
      <button
        className="ghm-capture-fab"
        type="button"
        onClick={() => { setOpen(true); setError(''); }}
        aria-label="Tell GHM"
        aria-expanded={open}
      >
        <span>✦</span><strong>Tell GHM</strong>
      </button>

      {open && <OverlayPortal>
        <div className="overlay-backdrop ghm-capture-backdrop" onMouseDown={(event) => { if (event.target === event.currentTarget) close(); }}>
          <section className="ghm-capture-sheet" role="dialog" aria-modal="true" aria-label="Tell GHM">
            <header>
              <div>
                <p className="eyebrow">QUICK CAPTURE</p>
                <h2>Tell GHM what changed.</h2>
                <p>Use this for quick actions and updates. For deeper questions, GHM opens Household Intelligence with your request ready.</p>
              </div>
              <button className="icon-button" onClick={close} aria-label="Close" data-dialog-close="true">×</button>
            </header>

            <div className="ghm-capture-shortcuts v105-quick-capture-grid">
              <button type="button" onClick={() => go(`/houses/${houseId}/inventory`)}><span>📦</span><strong>Inventory</strong><small>Add or update what you own.</small></button>
              <button type="button" onClick={() => go(`/houses/${houseId}/shopping`)}><span>🛒</span><strong>Shopping</strong><small>Add what the house needs.</small></button>
              <button type="button" onClick={() => go(`/houses/${houseId}/scan`)}><span>🧾</span><strong>Scan receipt</strong><small>Inventory, prices and expenses.</small></button>
              <button type="button" onClick={() => go(`/houses/${houseId}/expenses`)}><span>💸</span><strong>Expense</strong><small>Split a household cost.</small></button>
              <button type="button" onClick={() => go(`/houses/${houseId}/meals`)}><span>🍲</span><strong>Meal</strong><small>Cook from what you own.</small></button>
            </div>

            <label className="ghm-capture-input">
              <span>What changed or what do you need?</span>
              <div className={`ghm-capture-message-box-v115 ${listening ? 'is-listening' : ''}`}>
                <textarea
                  value={text}
                  onChange={(event) => setText(event.target.value)}
                  onKeyDown={(event) => {
                    if ((event.metaKey || event.ctrlKey) && event.key === 'Enter') void submit();
                  }}
                  placeholder="Try: We have guests Friday, find Swaminarayan food tonight, or we’re almost out of milk."
                  rows={4}
                  autoFocus
                />
                <button
                  className="ghm-capture-mic-v115"
                  type="button"
                  onClick={startVoice}
                  aria-label={listening ? 'Listening for your voice' : 'Speak to GHM'}
                  title={listening ? 'Listening…' : 'Speak to GHM'}
                >
                  {listening ? <span className="ghm-capture-mic-live-v117" aria-hidden="true">◉</span> : <img src="/brand/mic-symbol.png" alt="" className="ghm-capture-mic-image-v117" aria-hidden="true" />}
                </button>
              </div>
              <small className="ghm-capture-voice-hint-v115">{listening ? 'Listening… speak naturally.' : 'Tap the mic to speak instead of typing.'}</small>
            </label>

            {error && <div className="error">{error}</div>}
            {answer && <div className="ghm-capture-answer"><small>GHM QUICK GUIDANCE</small><p>{answer}</p><button className="secondary" type="button" onClick={() => go(`/assistant?house=${houseId}&view=intelligence&q=${encodeURIComponent(text)}`)}>Open Household Intelligence →</button></div>}
            {suggestedAction && <div className="ghm-capture-fallback"><span>GHM can still take you somewhere useful.</span><button className="secondary" type="button" onClick={() => go(suggestedAction.path)}>{suggestedAction.label} →</button></div>}

            <div className="ghm-capture-actions">
              <button className="primary" type="button" onClick={() => void submit()} disabled={!text.trim() || busy}>{busy ? 'Thinking with your household…' : 'Continue'}</button>
              <button className="secondary" type="button" onClick={() => { setText(''); setAnswer(''); setError(''); setSuggestedAction(null); }}>Clear</button>
            </div>
          </section>
        </div>
      </OverlayPortal>}
    </>
  );
}
