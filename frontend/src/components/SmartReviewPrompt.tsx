import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { api, errorMessage } from '../api';

const LAST_SHOWN_KEY = 'ghm_review_prompt_last_shown_v112';
const SNOOZE_KEY = 'ghm_review_prompt_snooze_until_v112';
const MIN_GAP_MS = 7 * 24 * 60 * 60 * 1000;
const SNOOZE_MS = 14 * 24 * 60 * 60 * 1000;

type SuccessDetail = { type?: 'receipt' | 'shopping' | 'meal_plan' | 'inventory_check' | 'savings'; message?: string };
type ExistingReview = { id: number; rating: number; comment: string; is_public?: boolean };

export default function SmartReviewPrompt() {
  const [open, setOpen] = useState(false);
  const [detail, setDetail] = useState<SuccessDetail>({});
  const [rating, setRating] = useState(0);
  const [comment, setComment] = useState('');
  const [existing, setExisting] = useState<ExistingReview | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [submitted, setSubmitted] = useState(false);
  const [quickSentiment, setQuickSentiment] = useState<'positive' | 'negative' | ''>('');

  useEffect(() => {
    const onSuccess = async (event: Event) => {
      if (!localStorage.getItem('token')) return;
      const snoozeUntil = Number(localStorage.getItem(SNOOZE_KEY) || 0);
      if (Date.now() < snoozeUntil) return;
      const lastShown = Number(localStorage.getItem(LAST_SHOWN_KEY) || 0);
      if (Date.now() - lastShown < MIN_GAP_MS) return;

      let mine: ExistingReview | null = null;
      try {
        const { data } = await api.get<ExistingReview | null>('/reviews/mine');
        mine = data || null;
      } catch {
        // Feedback must never interrupt the successful workflow that triggered it.
      }
      const nextDetail = (event as CustomEvent<SuccessDetail>).detail || {};
      setDetail(nextDetail);
      setExisting(mine);
      setRating(mine?.rating || 0);
      setComment(mine?.comment || '');
      setSubmitted(false);
      setQuickSentiment('');
      setError('');
      setOpen(true);
      localStorage.setItem(LAST_SHOWN_KEY, String(Date.now()));
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

  async function sendQuick(sentiment: 'positive' | 'negative') {
    setQuickSentiment(sentiment);
    if (!rating) setRating(sentiment === 'positive' ? 5 : 2);
    void api.post('/analytics/event', {
      event_name: sentiment === 'positive' ? 'quick_feedback_positive' : 'quick_feedback_negative',
      event_context: `${detail.type || 'success'}:${window.location.pathname}`.slice(0, 255),
    }).catch(() => undefined);
  }

  async function submitReview() {
    if (!rating) {
      setError('Choose 1–5 stars first.');
      return;
    }
    const cleaned = comment.trim();
    if (cleaned.length < 3) {
      setError('Add a short note (at least 3 characters) before publishing a review.');
      return;
    }
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
      void api.post('/analytics/event', { event_name: 'review_submitted', event_context: `success_prompt:${detail.type || 'generic'}` }).catch(() => undefined);
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setBusy(false);
    }
  }

  function snooze() {
    localStorage.setItem(SNOOZE_KEY, String(Date.now() + SNOOZE_MS));
    setOpen(false);
  }

  if (!open) return null;

  return (
    <aside className="smart-review-prompt-v94 smart-review-prompt-v112" aria-live="polite" role="dialog" aria-label="Quick experience rating">
      <button className="smart-review-close-v87" aria-label="Close review prompt" onClick={snooze}>×</button>
      {!submitted ? <>
        <span className="smart-review-kicker-v94">QUICK FEEDBACK · STAYS IN GHM</span>
        <strong>{heading}</strong>
        <p>{detail.message || 'How did that feel? One tap helps us understand whether this workflow is doing its job.'}</p>

        <div className="smart-review-thumbs-v112" aria-label="Quick feedback">
          <button type="button" className={quickSentiment === 'positive' ? 'active positive' : ''} onClick={() => sendQuick('positive')}><span>👍</span><strong>Worked well</strong></button>
          <button type="button" className={quickSentiment === 'negative' ? 'active negative' : ''} onClick={() => sendQuick('negative')}><span>👎</span><strong>Needs work</strong></button>
        </div>
        {quickSentiment ? <small className="smart-review-private-note-v112">Thanks — that quick tap is private product feedback. A public star review is optional.</small> : null}

        <div className="smart-review-public-v112">
          <div><strong>{existing ? 'Update your public rating' : 'Leave a public rating (optional)'}</strong><small>Only ratings you submit below appear in GHM reviews.</small></div>
          <div className="smart-review-stars-picker-v94" aria-label="Choose a rating from one to five stars">
            {[1, 2, 3, 4, 5].map((value) => (
              <button key={value} type="button" className={value <= rating ? 'active' : ''} onClick={() => setRating(value)} aria-label={`${value} star${value === 1 ? '' : 's'}`}>★</button>
            ))}
          </div>
          {rating > 0 ? <label className="smart-review-comment-v94"><span>{rating <= 3 ? 'What should we fix?' : 'What worked well?'}</span><textarea value={comment} onChange={(event) => setComment(event.target.value)} placeholder={rating <= 3 ? 'Tell us the one thing that would make this better.' : 'A short note helps other households understand the value.'} /></label> : null}
        </div>

        {error ? <div className="error compact-message">{error}</div> : null}
        <div className="smart-review-actions-v94">
          <button className="secondary" onClick={snooze}>Maybe later</button>
          <button className="primary" disabled={!rating || comment.trim().length < 3 || busy} onClick={submitReview}>{busy ? 'Saving…' : existing ? 'Update review' : 'Publish review'}</button>
        </div>
        <Link className="smart-review-all-v112" to="/reviews" onClick={() => setOpen(false)}>Open Reviews & feedback →</Link>
      </> : <div className="smart-review-thanks-v94">
        <span>✓</span>
        <strong>Thank you for the honest review.</strong>
        <p>Your feedback is saved inside GHM and can be updated any time from Reviews & feedback.</p>
        <div className="smart-review-actions-v94"><button className="primary" type="button" onClick={() => setOpen(false)}>Done</button><Link className="secondary center-link" to="/reviews" onClick={() => setOpen(false)}>View reviews</Link></div>
      </div>}
    </aside>
  );
}
