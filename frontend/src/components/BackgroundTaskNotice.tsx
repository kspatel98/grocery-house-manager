import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import OverlayPortal from './OverlayPortal';

type Notice = { id: string; title: string; message: string; href: string } | null;

export default function BackgroundTaskNotice({ houseId }: { houseId: number | null }) {
  const navigate = useNavigate();
  const [notice, setNotice] = useState<Notice>(null);

  useEffect(() => {
    const started = (event: Event) => {
      const detail = (event as CustomEvent<{ id?: string; title?: string; message?: string; href?: string }>).detail;
      if (!detail?.id) return;
      setNotice({ id: detail.id, title: detail.title || 'GHM is working', message: detail.message || 'This can take a little while.', href: detail.href || '' });
    };
    const settled = (event: Event) => {
      const id = (event as CustomEvent<{ id?: string }>).detail?.id;
      setNotice((current) => current?.id === id ? null : current);
    };
    window.addEventListener('ghm:background-task-started', started);
    window.addEventListener('ghm:background-task-ready', settled);
    window.addEventListener('ghm:background-task-failed', settled);
    return () => {
      window.removeEventListener('ghm:background-task-started', started);
      window.removeEventListener('ghm:background-task-ready', settled);
      window.removeEventListener('ghm:background-task-failed', settled);
    };
  }, []);

  if (!notice) return null;
  const explore = () => {
    setNotice(null);
    navigate(`/more${houseId ? `?house=${houseId}` : ''}`);
  };

  return <OverlayPortal>
    <div className="v121-background-notice-backdrop" role="presentation">
      <section className="v121-background-notice" role="dialog" aria-modal="true" aria-label="Background task started">
        <div className="v121-background-notice-icon" aria-hidden="true"><span>↻</span></div>
        <div>
          <p className="eyebrow">WORKING IN THE BACKGROUND</p>
          <h2>{notice.title}</h2>
          <p>{notice.message}</p>
          <strong>This may take longer than 45–50 seconds.</strong>
          <p>You can leave this section and continue using GHM. We’ll play a sound and keep a notification waiting when the result is ready.</p>
        </div>
        <div className="v121-background-notice-actions">
          <button type="button" className="secondary" onClick={() => setNotice(null)}>Stay here</button>
          <button type="button" className="primary" onClick={explore}>Explore GHM</button>
        </div>
      </section>
    </div>
  </OverlayPortal>;
}
