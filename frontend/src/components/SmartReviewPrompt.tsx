import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../api';

const PROMPT_KEY = 'ghm_review_prompt_last_shown_v87';
const DISMISS_KEY = 'ghm_review_prompt_dismissed_v87';
const MIN_GAP_MS = 14 * 24 * 60 * 60 * 1000;

type SuccessDetail = { type?: 'receipt' | 'shopping' | 'savings'; message?: string };

export default function SmartReviewPrompt() {
  const [open, setOpen] = useState(false);
  const [detail, setDetail] = useState<SuccessDetail>({});

  useEffect(() => {
    const onSuccess = async (event: Event) => {
      if (localStorage.getItem(DISMISS_KEY) === '1') return;
      const lastShown = Number(localStorage.getItem(PROMPT_KEY) || 0);
      if (Date.now() - lastShown < MIN_GAP_MS) return;
      try {
        const { data } = await api.get('/reviews/mine');
        if (data) return;
      } catch {
        // If review status cannot be checked, keep the success flow non-blocking.
      }
      const nextDetail = (event as CustomEvent<SuccessDetail>).detail || {};
      setDetail(nextDetail);
      setOpen(true);
      localStorage.setItem(PROMPT_KEY, String(Date.now()));
    };
    window.addEventListener('ghm:success-moment', onSuccess);
    return () => window.removeEventListener('ghm:success-moment', onSuccess);
  }, []);

  if (!open) return null;

  const heading = detail.type === 'receipt'
    ? 'Receipt saved successfully ✨'
    : detail.type === 'shopping'
      ? 'Shopping trip completed 🎉'
      : 'Nice household win 🎉';

  return (
    <aside className="smart-review-prompt-v87" aria-live="polite">
      <button className="smart-review-close-v87" aria-label="Close review prompt" onClick={() => setOpen(false)}>×</button>
      <span className="smart-review-stars-v87" aria-hidden="true">★★★★★</span>
      <strong>{heading}</strong>
      <p>{detail.message || 'If Grocery House Manager made this task easier, would you share a quick review? It helps us improve and helps other households discover the app.'}</p>
      <div>
        <button className="secondary" onClick={() => setOpen(false)}>Maybe later</button>
        <Link className="primary center-link" to="/houses#reviews" onClick={() => setOpen(false)}>Write a review</Link>
      </div>
      <button className="smart-review-never-v87" onClick={() => { localStorage.setItem(DISMISS_KEY, '1'); setOpen(false); }}>Don’t ask again</button>
    </aside>
  );
}
