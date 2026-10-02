import { useEffect, useState } from 'react';
import { probeApiHealth } from '../api';

type Status = 'checking' | 'ready' | 'degraded' | 'offline';

export default function ServiceStatusBanner() {
  const [status, setStatus] = useState<Status>('checking');
  const [detail, setDetail] = useState('');

  async function check() {
    const result = await probeApiHealth();
    if (!result.live) {
      setStatus('offline');
      setDetail(result.detail || 'GHM cannot reach the server right now.');
      return;
    }
    if (!result.ready) {
      setStatus('degraded');
      setDetail(result.detail || 'GHM is reconnecting to your household data.');
      return;
    }
    setStatus('ready');
    setDetail('');
  }

  useEffect(() => {
    void check();
    const timer = window.setInterval(() => void check(), status === 'ready' ? 45000 : 5000);
    return () => window.clearInterval(timer);
  }, [status]);

  if (status === 'ready' || status === 'checking') return null;
  return (
    <div className={`ghm-service-status ${status}`} role="status" aria-live="polite">
      <span className="ghm-service-pulse" />
      <div>
        <strong>{status === 'offline' ? 'GHM is having trouble reaching the server' : 'Your household data is reconnecting'}</strong>
        <small>{detail} Existing data remains in the database; GHM will retry automatically.</small>
      </div>
      <button type="button" onClick={() => void check()}>Retry now</button>
    </div>
  );
}
