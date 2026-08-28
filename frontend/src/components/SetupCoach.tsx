import { useEffect, useMemo, useRef, useState } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { api } from '../api';
import type { OnboardingStatus } from '../types';

export default function SetupCoach() {
  const location = useLocation();
  const [status, setStatus] = useState<OnboardingStatus | null>(null);
  const [minimized, setMinimized] = useState(false);
  const [advanced, setAdvanced] = useState(false);
  const previousCompleted = useRef<number | null>(null);

  async function refresh() {
    try {
      const { data } = await api.get<OnboardingStatus>('/insights/onboarding', { params: { t: Date.now() } });
      setStatus(data);
      if (previousCompleted.current !== null && data.completed_steps > previousCompleted.current) {
        setAdvanced(true);
        setMinimized(false);
        window.setTimeout(() => setAdvanced(false), 1600);
      }
      previousCompleted.current = data.completed_steps;
    } catch {
      // The setup coach is guidance only; never block the app if the insight request fails.
    }
  }

  useEffect(() => {
    refresh();
    window.addEventListener('account:refresh', refresh);
    window.addEventListener('focus', refresh);
    return () => {
      window.removeEventListener('account:refresh', refresh);
      window.removeEventListener('focus', refresh);
    };
  }, []);

  useEffect(() => {
    refresh();
  }, [location.pathname]);

  useEffect(() => {
    if (!status || status.complete) return;
    const timer = window.setInterval(refresh, 4500);
    return () => window.clearInterval(timer);
  }, [status?.complete]);

  const nextStep = useMemo(() => status?.steps.find((step) => !step.complete) || null, [status]);
  if (!status || status.complete || !nextStep || location.pathname === '/houses') return null;

  const stepNumber = status.steps.findIndex((step) => step.key === nextStep.key) + 1;
  const alreadyHere = nextStep.href ? location.pathname === nextStep.href.split('?')[0] : false;

  if (minimized) {
    return (
      <button type="button" className="setup-coach-minimized" onClick={() => setMinimized(false)} aria-label="Open guided setup">
        <span>✓</span><strong>Setup {status.percent}%</strong>
      </button>
    );
  }

  return (
    <aside className={`setup-coach ${advanced ? 'advanced' : ''}`} aria-live="polite" aria-label="Guided setup">
      <div className="setup-coach-progress"><span style={{ width: `${status.percent}%` }} /></div>
      <div className="setup-coach-head">
        <div><small>QUICK START • {stepNumber} OF {status.total_steps}</small><strong>{nextStep.title}</strong></div>
        <button type="button" onClick={() => setMinimized(true)} aria-label="Minimize setup guide">—</button>
      </div>
      <p>{nextStep.description}</p>
      {alreadyHere ? <span className="setup-coach-here">You’re in the right place — complete this action and the guide will advance automatically.</span> : nextStep.href ? <Link to={nextStep.href} className="primary center-link">Continue →</Link> : null}
    </aside>
  );
}
