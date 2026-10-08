import { useEffect, useRef, useState } from 'react';
import { probeApiHealth } from '../api';

type Status = 'checking' | 'ready' | 'degraded' | 'offline';

/**
 * Quiet service health indicator. A single failed probe is not user-facing: it
 * takes repeated failures before GHM interrupts the interface. This avoids a
 * large warning banner every time PgBouncer has a brief connection reset.
 */
export default function ServiceStatusBanner() {
  const [status, setStatus] = useState<Status>('checking');
  const [detail, setDetail] = useState('');
  const consecutiveFailures = useRef(0);
  const mounted = useRef(true);

  async function check(forceVisible = false) {
    if (document.hidden && !forceVisible) return;
    const result = await probeApiHealth();
    if (!mounted.current) return;

    if (result.live && result.ready) {
      consecutiveFailures.current = 0;
      setStatus('ready');
      setDetail('');
      return;
    }

    consecutiveFailures.current += 1;
    const sustained = consecutiveFailures.current >= 3;
    if (!sustained && !forceVisible) {
      // Keep the UI calm while GHM silently retries short-lived network/DB blips.
      if (status !== 'checking') setStatus('ready');
      return;
    }

    // A live API process never triggers a global banner. Database/PgBouncer
    // issues are handled by the affected request, while cached screens remain usable.
    if (result.live) {
      setStatus('ready');
      setDetail('');
      return;
    }
    setStatus('offline');
    setDetail(result.detail || 'The server is temporarily unreachable.');
  }

  useEffect(() => {
    mounted.current = true;
    void check();
    const timer = window.setInterval(() => void check(), status === 'checking' ? 8000 : status === 'ready' ? 60000 : 15000);
    const onOnline = () => void check(true);
    window.addEventListener('online', onOnline);
    return () => {
      mounted.current = false;
      window.clearInterval(timer);
      window.removeEventListener('online', onOnline);
    };
  }, [status]);

  if (status === 'ready' || status === 'checking') return null;
  return (
    <div className={`ghm-service-status ${status}`} role="status" aria-live="polite">
      <span className="ghm-service-pulse" />
      <div>
        <strong>Connection unavailable</strong>
        <small>{detail}</small>
      </div>
      <button type="button" onClick={() => void check(true)}>Retry</button>
    </div>
  );
}
