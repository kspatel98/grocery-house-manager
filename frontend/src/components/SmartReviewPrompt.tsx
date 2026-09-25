import { useEffect, useMemo, useState } from 'react';
import { api, errorMessage } from '../api';

const PROMPT_KEY = 'ghm_review_prompt_last_shown_v94';
const DISMISS_KEY = 'ghm_review_prompt_dismissed_v94';
const MIN_GAP_MS = 10 * 24 * 60 * 60 * 1000;

type SuccessDetail = { type?: 'receipt' | 'shopping' | 'meal_plan' | 'inventory_check' | 'savings'; message?: string };

type ExistingReview = { id: number; rating: number; comment: string };

export default function SmartReviewPrompt() {
  const [open, setOpen] = useState(false);
  const [detail, setDetail] = useState<SuccessDetail>({});
  const [rating, setRating] = useState(0);
  const [comment, setComment] = useState('');
  const [existing, setExisting] = useState<ExistingReview | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [submitted, setSubmitted] = useState(false);

  useEffect(() => {
    const onSuccess = async (event: Event) => {
      if (localStorage.getItem(DISMISS_KEY) === '1') return;
      const lastShown = Number(localStorage.getItem(PROMPT_KEY) || 0);
      if (Date.now() - lastShown < MIN_GAP_MS) return;
      let mine: ExistingReview | null = null;
      try {
        const { data } = await api.get<ExistingReview | null>('/reviews/mine');
        mine = data || null;
      } catch {
        // Review prompting must never interrupt the success flow.
      }
      const nextDetail = (event as CustomEvent<SuccessDetail>).detail || {};
      setDetail(nextDetail);
      setExisting(mine);
      setRating(mine?.rating || 0);
      setComment(mine?.comment || '');
      setSubmitted(false);
      setError('');
      setOpen(true);
      localStorage.setItem(PROMPT_KEY, String(Date.now()));
    };
    window.addEventListener('ghm:success-moment', onSuccess);
    return () => window.removeEventListener('ghm:success-moment', onSuccess);
  }, []);

  const heading = useMemo(() => {
    if (detail.type === 'receipt') return 'Receipt saved successfully ✨';
    if (detail.type === 'shopping') return 'Shopping trip completed 🎉';
    if (detail.type === 'meal_plan') return 'Your meal plan is ready 🍲';
    if (detail.type === 'inventory_check') return 'Kitchen check completed 📦';
    return 'Nice household win 🎉';
  }, [detail.type]);

  async function submitReview() {
    if (!rating) {
      setError('Choose 1–5 stars first.');
      return;
    }
    const cleaned = comment.trim() || (rating >= 4 ? 'Helpful and easy to use.' : 'I would like this experience improved.');
    try {
      setBusy(true);
      setError('');
      if (existing?.id) {
        await api.put(`/reviews/${existing.id}`, { rating, comment: cleaned, is_public: true });
      } else {
        const { data } = await api.post<ExistingReview>('/reviews', { rating, comment: cleaned, is_public: true });
        setExisting(data);
      }
      setSubmitted(true);
      window.dispatchEvent(new Event('account:refresh'));
      void api.post('/analytics/event', { event_name: 'review_submitted', event_context: 'smart_review_prompt' }).catch(() => undefined);
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setBusy(false);
    }
  }

  if (!open) return null;

  return (
    <aside className="smart-review-prompt-v94" aria-live="polite" role="dialog" aria-label="Quick experience rating">
      <button className="smart-review-close-v87" aria-label="Close review prompt" onClick={() => setOpen(false)}>×</button>
      {!submitted ? <>
        <span className="smart-review-kicker-v94">QUICK FEEDBACK · STAYS IN THE APP</span>
        <strong>{heading}</strong>
        <p>{detail.message || 'How did that feel? Your rating helps us improve the parts households actually use.'}</p>
        <div className="smart-review-stars-picker-v94" aria-label="Choose a rating from one to five stars">
          {[1, 2, 3, 4, 5].map((value) => (
            <button key={value} type="button" className={value <= rating ? 'active' : ''} onClick={() => setRating(value)} aria-label={`${value} star${value === 1 ? '' : 's'}`}>★</button>
          ))}
        </div>
        {rating > 0 ? <>
          <label className="smart-review-comment-v94">
            <span>{rating <= 3 ? 'What should we fix? (optional)' : 'What worked well? (optional)'}</span>
            <textarea value={comment} onChange={(event) => setComment(event.target.value)} placeholder={rating <= 3 ? 'Tell us the one thing that would make this better.' : 'A short note helps other households understand the value.'} />
          </label>
          <div className="smart-review-honesty-note-v94">🎁 Any honest rating unlocks the same household optimization tips—there is no reward for rating higher.</div>
        </> : null}
        {error ? <div className="error compact-message">{error}</div> : null}
        <div className="smart-review-actions-v94">
          <button className="secondary" onClick={() => setOpen(false)}>Maybe later</button>
          <button className="primary" disabled={!rating || busy} onClick={submitReview}>{busy ? 'Saving…' : existing ? 'Update rating' : 'Submit rating'}</button>
        </div>
        <button className="smart-review-never-v87" onClick={() => { localStorage.setItem(DISMISS_KEY, '1'); setOpen(false); }}>Don’t ask again</button>
      </> : <div className="smart-review-thanks-v94">
        <span>✓</span>
        <strong>Thank you for the honest feedback.</strong>
        <p>Your household tip pack is unlocked:</p>
        <div><small>1. Set low-stock thresholds only for staples you truly replace automatically.</small><small>2. Scan receipts after shopping so prices and the Digital Twin stay useful.</small><small>3. Use Kitchen Vision before a big trip to avoid buying duplicates.</small></div>
        <button className="primary" type="button" onClick={() => setOpen(false)}>Done</button>
      </div>}
    </aside>
  );
}
