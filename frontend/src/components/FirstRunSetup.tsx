import { useEffect, useMemo, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../api';
import type { OnboardingStatus } from '../types';

type FirstRunSetupProps = {
  onStatus?: (status: OnboardingStatus) => void;
};

export default function FirstRunSetup({ onStatus }: FirstRunSetupProps) {
  const [status, setStatus] = useState<OnboardingStatus | null>(null);
  const [collapsed, setCollapsed] = useState(false);
  const previousCompletedRef = useRef<number | null>(null);
  const [advanced, setAdvanced] = useState(false);

  async function load() {
    try {
      const { data } = await api.get<OnboardingStatus>('/insights/onboarding', { params: { t: Date.now() } });
      setStatus(data);
      onStatus?.(data);
      if (previousCompletedRef.current !== null && data.completed_steps > previousCompletedRef.current && !data.complete) {
        setAdvanced(true);
        window.setTimeout(() => setAdvanced(false), 1600);
      }
      previousCompletedRef.current = data.completed_steps;
      if (data.complete) setCollapsed(true);
    } catch {
      setStatus(null);
    }
  }

  useEffect(() => {
    load();
    window.addEventListener('account:refresh', load);
    window.addEventListener('focus', load);
    return () => {
      window.removeEventListener('account:refresh', load);
      window.removeEventListener('focus', load);
    };
  }, []);

  useEffect(() => {
    if (!status || status.complete) return;
    const timer = window.setInterval(load, 4500);
    return () => window.clearInterval(timer);
  }, [status?.complete]);

  const nextStep = useMemo(() => status?.steps.find((step) => !step.complete) || null, [status]);
  const nextIndex = nextStep && status ? status.steps.findIndex((step) => step.key === nextStep.key) + 1 : status?.total_steps || 4;

  if (!status) return null;

  return (
    <section className={`first-run-setup first-run-setup-v71 ${status.complete ? 'complete' : ''} ${advanced ? 'advanced' : ''}`} aria-label="First-time setup">
      <div className="first-run-head">
        <div>
          <p className="eyebrow">{status.complete ? 'Quick start complete' : `Guided setup • step ${nextIndex} of ${status.total_steps}`}</p>
          <h2>{status.complete ? 'Your Grocery Home is ready' : 'Let’s get your Grocery Home ready'}</h2>
          <p>
            {status.complete
              ? 'You have the essentials in place. From here, Grocery House Manager can organize your inventory, shopping, receipts, and weekly suggestions automatically.'
              : 'You only need four real actions. We’ll show one next step at a time and advance the guide automatically as you use the app.'}
          </p>
          {!status.complete && nextStep?.key === 'house' ? (
            <div className="house-definition-callout">
              <span aria-hidden="true">🏡</span>
              <div><strong>What is a “House”?</strong><small>It is simply your private Grocery Home — the shared space for the people you shop with.</small></div>
            </div>
          ) : null}
        </div>
        <div className="first-run-progress-orb" style={{ background: `conic-gradient(#38a65c ${status.percent}%, #e7efe9 0)` }} aria-label={`${status.percent}% complete`}>
          <strong>{status.percent}%</strong>
          <span>{status.completed_steps}/{status.total_steps}</span>
        </div>
      </div>

      <div className="first-run-progress-track" aria-hidden="true"><span style={{ width: `${status.percent}%` }} /></div>

      {!status.complete && nextStep ? (
        <div className="first-run-current-step" aria-live="polite">
          <span className="first-run-current-number">{nextIndex}</span>
          <div>
            <small>DO THIS NOW</small>
            <strong>{nextStep.title}</strong>
            <p>{nextStep.description}</p>
          </div>
          {nextStep.href ? <Link to={nextStep.href} className="primary center-link">Continue setup →</Link> : null}
        </div>
      ) : null}

      {!collapsed && (
        <div className="first-run-steps first-run-steps-v71">
          {status.steps.map((step, index) => (
            <article key={step.key} className={`first-run-step ${step.complete ? 'done' : ''} ${nextStep?.key === step.key ? 'current' : ''}`}>
              <span className="first-run-step-number">{step.complete ? '✓' : index + 1}</span>
              <div>
                <strong>{step.title}</strong>
                <p>{step.complete ? 'Completed' : step.description}</p>
              </div>
            </article>
          ))}
        </div>
      )}

      <div className="first-run-actions">
        {status.complete && status.primary_house_id ? <Link to={`/assistant?house=${status.primary_house_id}`} className="primary center-link">See what needs attention today</Link> : null}
        <button className="ghost-button" type="button" onClick={() => setCollapsed((value) => !value)}>{collapsed ? 'Show setup details' : 'Hide overview'}</button>
      </div>
    </section>
  );
}
