import { useEffect, useMemo, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../api';
import type { AdminUserOffer, PremiumTryStatus } from '../types';
import { backgroundTasks } from '../backgroundTasks';

type NotificationItem = {
  key: string;
  title: string;
  message: string;
  href: string;
  eyebrow: string;
};

function seenKeys(): Set<string> {
  try {
    const value = JSON.parse(localStorage.getItem('ghm_notification_seen_v115') || '[]');
    return new Set(Array.isArray(value) ? value.map(String) : []);
  } catch {
    return new Set();
  }
}

export default function NotificationCenter({ premiumTry, houseId, compact = false }: { premiumTry: PremiumTryStatus | null; houseId: number | null; compact?: boolean }) {
  const [offers, setOffers] = useState<AdminUserOffer[]>([]);
  const [open, setOpen] = useState(false);
  const [seen, setSeen] = useState<Set<string>>(() => seenKeys());
  const [taskVersion, setTaskVersion] = useState(0);
  const rootRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    let active = true;
    const load = () => {
      void Promise.all([
        api.get<AdminUserOffer[]>('/offers/general', { params: { t: Date.now() } }),
        api.get<AdminUserOffer[]>('/offers/mine', { params: { t: Date.now() } }),
      ])
        .then(([general, mine]) => {
          if (!active) return;
          const rows = [...(Array.isArray(general.data) ? general.data : []), ...(Array.isArray(mine.data) ? mine.data : [])];
          setOffers(rows);
        })
        .catch(() => { if (active) setOffers([]); });
    };
    load();
    window.addEventListener('account:refresh', load);
    return () => { active = false; window.removeEventListener('account:refresh', load); };
  }, []);


  useEffect(() => {
    const refresh = () => setTaskVersion((value) => value + 1);
    window.addEventListener('ghm:background-tasks-changed', refresh);
    window.addEventListener('ghm:background-task-ready', refresh);
    window.addEventListener('ghm:background-task-failed', refresh);
    return () => {
      window.removeEventListener('ghm:background-tasks-changed', refresh);
      window.removeEventListener('ghm:background-task-ready', refresh);
      window.removeEventListener('ghm:background-task-failed', refresh);
    };
  }, []);

  const items = useMemo<NotificationItem[]>(() => {
    const next: NotificationItem[] = offers
      .filter((offer) => ['pending', 'checkout_started', 'active'].includes(offer.status) || offer.can_accept)
      .map((offer) => ({
        key: `offer:${offer.is_general ? 'general' : 'personal'}:${offer.id}`,
        title: offer.title || 'GHM offer',
        message: offer.message || offer.summary || 'A Grocery House Manager offer is available for your account.',
        href: '/pricing',
        eyebrow: offer.occasion || 'OFFER',
      }));

    if (premiumTry?.available && !premiumTry.used_at) {
      next.unshift({
        key: `premium-try:${premiumTry.selected_feature || 'available'}`,
        title: premiumTry.selected_label ? `${premiumTry.selected_label} is ready to try` : 'Your free Premium Try is available',
        message: premiumTry.message || 'Try one premium GHM feature before deciding whether to upgrade.',
        href: `/premium-try${houseId ? `?house=${houseId}` : ''}`,
        eyebrow: 'PREMIUM TRY',
      });
    }
    const taskItems = backgroundTasks().filter((task) => task.status === 'ready' || task.status === 'failed').slice(0, 5).map((task) => ({
      key: `background:${task.id}:${task.status}`,
      title: task.status === 'ready' ? `${task.title} is ready` : `${task.title} needs attention`,
      message: task.status === 'ready' ? 'Your result finished in the background. Open it from anywhere in GHM.' : task.message,
      href: task.href,
      eyebrow: task.status === 'ready' ? 'RESULT READY' : 'BACKGROUND TASK',
    }));
    return [...taskItems, ...next].slice(0, 10);
  }, [offers, premiumTry, houseId, taskVersion]);

  const unread = items.filter((item) => !seen.has(item.key)).length;

  function markVisibleSeen() {
    const next = new Set(seen);
    items.forEach((item) => next.add(item.key));
    setSeen(next);
    localStorage.setItem('ghm_notification_seen_v115', JSON.stringify(Array.from(next).slice(-80)));
  }

  function toggle() {
    setOpen((value) => {
      const next = !value;
      if (next) window.setTimeout(markVisibleSeen, 150);
      return next;
    });
  }

  useEffect(() => {
    if (!open) return;
    const closeOnOutside = (event: MouseEvent) => {
      if (!rootRef.current?.contains(event.target as Node)) setOpen(false);
    };
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setOpen(false);
    };
    document.addEventListener('mousedown', closeOnOutside);
    document.addEventListener('keydown', closeOnEscape);
    return () => {
      document.removeEventListener('mousedown', closeOnOutside);
      document.removeEventListener('keydown', closeOnEscape);
    };
  }, [open]);

  return (
    <div ref={rootRef} className={`ghm-notification-center-v115 ${compact ? 'compact' : ''}`}>
      <button type="button" className="ghm-notification-trigger-v115" onClick={toggle} aria-label={unread ? `Notifications, ${unread} unread` : 'Notifications'} aria-expanded={open} title="Notifications">
        <svg viewBox="0 0 24 24" fill="none" aria-hidden="true">
          <path d="M18 9.8a6 6 0 0 0-12 0c0 6-2.5 6.5-2.5 6.5h17S18 15.8 18 9.8Z" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
          <path d="M9.8 19a2.4 2.4 0 0 0 4.4 0" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
        </svg>
        {unread > 0 ? <span className="ghm-notification-count-v115">{unread > 9 ? '9+' : unread}</span> : null}
      </button>

      {open ? (
        <section className="ghm-notification-popover-v115" role="dialog" aria-label="Notifications">
          <header><div><small>GHM UPDATES</small><h3>Notifications</h3></div><span>{items.length ? `${items.length} current` : 'All clear'}</span></header>
          <div className="ghm-notification-list-v115">
            {items.length ? items.map((item) => (
              <Link key={item.key} to={item.href} onClick={() => setOpen(false)} className="ghm-notification-item-v115">
                <small>{item.eyebrow}</small>
                <strong>{item.title}</strong>
                <p>{item.message}</p>
                <span>Open →</span>
              </Link>
            )) : (
              <div className="ghm-notification-empty-v115"><span aria-hidden="true">✓</span><strong>You’re all caught up.</strong><p>Important household updates and offers will appear here.</p></div>
            )}
          </div>
        </section>
      ) : null}
    </div>
  );
}
