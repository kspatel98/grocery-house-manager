import { useEffect, useRef, useState } from 'react';
import { probeApiHealth } from '../api';

type Status = 'checking' | 'ready' | 'degraded' | 'offline';

export default function ServiceStatusBanner() {
  const [status, setStatus] = useState<Status>('checking');
  const [detail, setDetail] = useState('');
  const failedChecks = useRef(0);
  const previousStatus = useRef<Status>('checking');

  async function check() {
    const result = await probeApiHealth();
    let nextStatus: Status = 'ready';
    let nextDetail = '';

    if (!result.live) {
      failedChecks.current += 1;
      // A single delayed health probe should never scare the user or make a
      // healthy household look offline. Require two consecutive failures.
      if (failedChecks.current < 2 && status !== 'offline') return;
      nextStatus = 'offline';
      nextDetail = result.detail || 'GHM cannot reach the server right now.';
    } else if (!result.ready) {
      failedChecks.current = 0;
      nextStatus = 'degraded';
      nextDetail = result.detail || 'GHM is reconnecting to your household data.';
    } else {
      failedChecks.current = 0;
    }

    const wasUnavailable = previousStatus.current === 'offline' || previousStatus.current === 'degraded';
    previousStatus.current = nextStatus;
    setStatus(nextStatus);
    setDetail(nextDetail);

    // When the API recovers, refresh the signed-in household shell automatically.
    if (nextStatus === 'ready' && wasUnavailable) {
      window.dispatchEvent(new Event('account:refresh'));
    }
  }

  useEffect(() => {
    void check();
    const timer = window.setInterval(() => void check(), status === 'ready' ? 60000 : 12000);
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
