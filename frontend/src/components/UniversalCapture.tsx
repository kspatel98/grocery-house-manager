import { useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { api, errorMessage } from '../api';
import type { HouseholdAgentResponse } from '../types';
import OverlayPortal from './OverlayPortal';

declare global {
  interface Window {
    webkitSpeechRecognition?: any;
    SpeechRecognition?: any;
  }
}

export default function UniversalCapture({ houseId }: { houseId: number | null }) {
  const navigate = useNavigate();
  const [open, setOpen] = useState(false);
  const [text, setText] = useState('');
  const [answer, setAnswer] = useState('');
  const [busy, setBusy] = useState(false);
  const [listening, setListening] = useState(false);
  const [error, setError] = useState('');
  const recognitionRef = useRef<any>(null);

  function routeKnownIntent(value: string) {
    if (!houseId) return false;
    const q = value.toLowerCase();
    if (/restaurant|takeout|take out|eat out|order food|food tonight|dinner out/.test(q)) {
      navigate(`/houses/${houseId}/food?mode=restaurant&q=${encodeURIComponent(value)}`);
      setOpen(false);
      return true;
    }
    if (/grocery store|food store|supermarket|where.*buy groceries/.test(q)) {
      navigate(`/houses/${houseId}/food?mode=grocery&q=${encodeURIComponent(value)}`);
      setOpen(false);
      return true;
    }
    if (/scan.*receipt|receipt.*scan/.test(q)) {
      navigate(`/houses/${houseId}/scan`);
      setOpen(false);
      return true;
    }
    if (/scan.*kitchen|check.*fridge|check.*pantry|kitchen vision/.test(q)) {
      navigate(`/houses/${houseId}/kitchen`);
      setOpen(false);
      return true;
    }
    return false;
  }

  async function submit() {
    const clean = text.trim();
    if (!clean || !houseId) return;
    setError('');
    setAnswer('');
    if (routeKnownIntent(clean)) return;
    try {
      setBusy(true);
      const { data } = await api.post<HouseholdAgentResponse>(`/ai/houses/${houseId}/household-agent`, { prompt: clean });
      setAnswer(data.answer || data.message);
    } catch (err) {
      setError(errorMessage(err));
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
      recognition.lang = 'en-CA';
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
      <button className="ghm-capture-fab" type="button" onClick={() => setOpen(true)} aria-label="Tell GHM"><span>✦</span><strong>Tell GHM</strong></button>
      {open && <OverlayPortal>
        <div className="overlay-backdrop ghm-capture-backdrop" onMouseDown={(event) => { if (event.target === event.currentTarget) setOpen(false); }}>
          <section className="ghm-capture-sheet" role="dialog" aria-modal="true" aria-label="Tell GHM">
            <header><div><p className="eyebrow">UNIVERSAL CAPTURE</p><h2>Tell GHM once.</h2><p>Say it, type it or scan it. GHM will take you to the right household workflow.</p></div><button className="icon-button" onClick={() => setOpen(false)} aria-label="Close">×</button></header>
            <div className="ghm-capture-shortcuts">
              <button type="button" onClick={startVoice}><span>{listening ? '◉' : '🎙️'}</span><strong>{listening ? 'Listening…' : 'Say it'}</strong><small>“We want Indian food tonight.”</small></button>
              <button type="button" onClick={() => navigate(`/houses/${houseId}/scan`)}><span>🧾</span><strong>Scan receipt</strong><small>One scan can update multiple systems.</small></button>
              <button type="button" onClick={() => navigate(`/houses/${houseId}/kitchen`)}><span>👁️</span><strong>Scan kitchen</strong><small>Quick-check a fridge, pantry or cupboard.</small></button>
            </div>
            <label className="ghm-capture-input"><span>What changed or what do you need?</span><textarea value={text} onChange={(event) => setText(event.target.value)} placeholder="Try: We have guests Friday, find Swaminarayan food tonight, or what should we buy this week?" rows={4} /></label>
            {error && <div className="error">{error}</div>}
            {answer && <div className="ghm-capture-answer"><small>GHM HOUSEHOLD INTELLIGENCE</small><p>{answer}</p></div>}
            <div className="ghm-capture-actions"><button className="primary" type="button" onClick={() => void submit()} disabled={!text.trim() || busy}>{busy ? 'Thinking with your household…' : 'Continue'}</button><button className="secondary" type="button" onClick={() => { setText(''); setAnswer(''); setError(''); }}>Clear</button></div>
          </section>
        </div>
      </OverlayPortal>}
    </>
  );
}
