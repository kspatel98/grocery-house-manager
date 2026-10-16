import { useEffect, useRef, useState } from 'react';
import OverlayPortal from './OverlayPortal';

type Notice = { id: string; title: string; message: string; href: string } | null;

export default function BackgroundTaskNotice({ houseId: _houseId }: { houseId: number | null }) {
  const [notice, setNotice] = useState<Notice>(null);
  const [compact, setCompact] = useState(false);
  const collapseTimer = useRef<number | null>(null);

  useEffect(() => {
    const clearTimer = () => { if (collapseTimer.current !== null) window.clearTimeout(collapseTimer.current); collapseTimer.current = null; };
    const started = (event: Event) => {
      const detail = (event as CustomEvent<{ id?: string; title?: string; message?: string; href?: string }>).detail;
      if (!detail?.id) return;
      clearTimer();
      setNotice({ id: detail.id, title: detail.title || 'GHM is working', message: detail.message || 'This may take a little while.', href: detail.href || '' });
      setCompact(false);
      collapseTimer.current = window.setTimeout(() => setCompact(true), 2600);
    };
    const settled = (event: Event) => {
      const id = (event as CustomEvent<{ id?: string }>).detail?.id;
      setNotice((current) => current?.id === id ? null : current);
      clearTimer();
    };
    window.addEventListener('ghm:background-task-started', started);
    window.addEventListener('ghm:background-task-ready', settled);
    window.addEventListener('ghm:background-task-completed', settled);
    window.addEventListener('ghm:background-task-failed', settled);
    return () => {
      clearTimer();
      window.removeEventListener('ghm:background-task-started', started);
      window.removeEventListener('ghm:background-task-ready', settled);
      window.removeEventListener('ghm:background-task-completed', settled);
      window.removeEventListener('ghm:background-task-failed', settled);
    };
  }, []);

  if (!notice) return null;
  return <OverlayPortal>
    {compact ? (
      <div className="v134-background-task-stripe" role="status" aria-live="polite">
        <span className="v134-background-task-spinner" aria-hidden="true">↻</span>
        <div><strong>{notice.title}</strong><small>Working in the background. You can keep using GHM — we’ll notify you when it’s ready.</small></div>
      </div>
    ) : (
      <div className="v134-background-start-backdrop" role="presentation">
        <section className="v134-background-start" role="status" aria-live="polite">
          <span className="v134-background-task-spinner" aria-hidden="true">↻</span>
          <div><p className="eyebrow">WORKING IN THE BACKGROUND</p><h2>{notice.title}</h2><p>{notice.message}</p><small>You can leave this page. GHM will notify you when the result is ready.</small></div>
        </section>
      </div>
    )}
  </OverlayPortal>;
}
