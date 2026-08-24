import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../api';
import type { OnboardingStatus } from '../types';

export default function FirstRunSetup() {
  const [status, setStatus] = useState<OnboardingStatus | null>(null);
  const [collapsed, setCollapsed] = useState(false);

  async function load() {
    try {
      const { data } = await api.get<OnboardingStatus>('/insights/onboarding', { params: { t: Date.now() } });
      setStatus(data);
      if (data.complete) setCollapsed(true);
    } catch {
      setStatus(null);
    }
  }

  useEffect(() => {
    load();
    window.addEventListener('account:refresh', load);
    return () => window.removeEventListener('account:refresh', load);
  }, []);

  if (!status) return null;

  return (
    <section className={`first-run-setup ${status.complete ? 'complete' : ''}`} aria-label="First-time setup">
      <div className="first-run-head">
        <div>
          <p className="eyebrow">Quick start • about 3 minutes</p>
          <h2>{status.complete ? 'Your household setup is ready' : 'Set up your first grocery house'}</h2>
          <p>{status.complete ? 'You finished the core setup. Your assistant can now use your household data to make useful suggestions.' : 'Complete these real actions once. The app becomes much more useful as soon as your inventory and shared list are alive.'}</p>
        </div>
        <div className="first-run-progress-orb" style={{ background: `conic-gradient(#38a65c ${status.percent}%, #e7efe9 0)` }} aria-label={`${status.percent}% complete`}>
          <strong>{status.percent}%</strong>
          <span>{status.completed_steps}/{status.total_steps}</span>
        </div>
      </div>
      <div className="first-run-progress-track" aria-hidden="true"><span style={{ width: `${status.percent}%` }} /></div>
      {!collapsed && (
        <div className="first-run-steps">
          {status.steps.map((step, index) => (
            <article key={step.key} className={`first-run-step ${step.complete ? 'done' : ''}`}>
              <span className="first-run-step-number">{step.complete ? '✓' : index + 1}</span>
              <div>
                <strong>{step.title}</strong>
                <p>{step.description}</p>
              </div>
              {step.href && !step.complete ? <Link to={step.href} className="secondary center-link">Do this</Link> : null}
            </article>
          ))}
        </div>
      )}
      <div className="first-run-actions">
        {status.primary_house_id ? <Link to={`/assistant?house=${status.primary_house_id}`} className="primary center-link">Open smart assistant</Link> : null}
        <button className="ghost-button" type="button" onClick={() => setCollapsed((value) => !value)}>{collapsed ? 'Show setup' : 'Hide steps'}</button>
      </div>
    </section>
  );
}
