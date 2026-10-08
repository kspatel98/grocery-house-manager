import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { api, errorMessage } from '../api';
import type { SiteReview, SiteReviewSummary } from '../types';

function Stars({ value }: { value: number }) {
  const rounded = Math.max(0, Math.min(5, Math.round(value || 0)));
  return <span className="reviews-stars-v112" aria-label={`${rounded} out of 5 stars`}>{'★'.repeat(rounded)}{'☆'.repeat(5 - rounded)}</span>;
}

export default function ReviewsPage() {
  const loggedIn = Boolean(localStorage.getItem('token'));
  const [summary, setSummary] = useState<SiteReviewSummary | null>(null);
  const [reviews, setReviews] = useState<SiteReview[]>([]);
  const [mine, setMine] = useState<SiteReview | null>(null);
  const [rating, setRating] = useState(5);
  const [comment, setComment] = useState('');
  const [isPublic, setIsPublic] = useState(true);
  const [busy, setBusy] = useState(false);
  const [loading, setLoading] = useState(true);
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');

  const ratingLabel = useMemo(() => {
    if (rating >= 5) return 'Excellent';
    if (rating === 4) return 'Very good';
    if (rating === 3) return 'Okay';
    if (rating === 2) return 'Needs improvement';
    return 'Poor';
  }, [rating]);

  async function load() {
    setLoading(true);
    setError('');
    try {
      const [summaryRes, publicRes] = await Promise.all([
        api.get<SiteReviewSummary>('/reviews/summary', { params: { t: Date.now() } }),
        api.get<SiteReview[]>('/reviews/public', { params: { t: Date.now() } }),
      ]);
      setSummary(summaryRes.data);
      setReviews(publicRes.data);
      if (loggedIn) {
        try {
          const mineRes = await api.get<SiteReview | null>('/reviews/mine', { params: { t: Date.now() } });
          const current = mineRes.data || null;
          setMine(current);
          if (current) {
            setRating(current.rating || 5);
            setComment(current.comment || '');
            setIsPublic(Boolean(current.is_public));
          }
        } catch {
          setMine(null);
        }
      }
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { void load(); }, []);

  async function saveReview(event: React.FormEvent) {
    event.preventDefault();
    const cleaned = comment.trim();
    if (cleaned.length < 3) {
      setError('Add a short note (at least 3 characters) so the rating has useful context.');
      return;
    }
    try {
      setBusy(true);
      setError('');
      setMessage('');
      if (mine?.id) {
        await api.put(`/reviews/${mine.id}`, { rating, comment: cleaned, is_public: isPublic });
      } else {
        await api.post('/reviews', { rating, comment: cleaned, is_public: isPublic });
      }
      void api.post('/analytics/event', { event_name: 'review_submitted', event_context: 'reviews_page' }).catch(() => undefined);
      setMessage('Thank you. Your review was saved inside GHM.');
      await load();
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setBusy(false);
    }
  }

  async function deleteMine() {
    if (!mine?.id || !window.confirm('Delete your review?')) return;
    try {
      setBusy(true);
      setError('');
      await api.delete(`/reviews/${mine.id}`);
      setMine(null);
      setComment('');
      setRating(5);
      setMessage('Your review was deleted.');
      await load();
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setBusy(false);
    }
  }

  return (
    <main className="page shell wide reviews-page-v112">
      <header className="topbar reviews-hero-v112">
        <div>
          <Link to={loggedIn ? '/houses' : '/'} className="breadcrumb">← {loggedIn ? 'Houses' : 'Home'}</Link>
          <p className="eyebrow">REVIEWS & FEEDBACK</p>
          <h1>Tell us how GHM is working for your household.</h1>
          <p>Ratings stay inside Grocery House Manager. Honest feedback helps us improve the workflows people actually use.</p>
        </div>
        <div className="reviews-summary-v112">
          <strong>{summary?.review_count ? summary.average_rating.toFixed(1) : '—'}</strong>
          <Stars value={summary?.average_rating || 0} />
          <small>{summary?.review_count || 0} public review{summary?.review_count === 1 ? '' : 's'}</small>
        </div>
      </header>

      {error ? <div className="error form-message">{error}</div> : null}
      {message ? <div className="success form-message">{message}</div> : null}

      <section className="reviews-layout-v112">
        <article className="panel reviews-compose-v112">
          <p className="eyebrow">{mine ? 'YOUR REVIEW' : 'RATE GHM'}</p>
          <h2>{mine ? 'Update your experience' : 'How would you rate GHM?'}</h2>
          {loggedIn ? <form onSubmit={saveReview}>
            <div className="reviews-star-picker-v112" aria-label="Choose a rating from one to five stars">
              {[1, 2, 3, 4, 5].map((value) => <button key={value} type="button" className={value <= rating ? 'active' : ''} onClick={() => setRating(value)} aria-label={`${value} star${value === 1 ? '' : 's'}`}>★</button>)}
            </div>
            <strong className="reviews-rating-label-v112">{ratingLabel}</strong>
            <label><span>Short review</span><textarea value={comment} onChange={(event) => setComment(event.target.value)} maxLength={700} placeholder={rating <= 3 ? 'What should we improve?' : 'What has been useful for your household?'} /></label>
            <label className="reviews-public-toggle-v112"><input type="checkbox" checked={isPublic} onChange={(event) => setIsPublic(event.target.checked)} /><span>Show this review publicly inside GHM</span></label>
            <div className="reviews-actions-v112">
              {mine ? <button type="button" className="secondary danger" disabled={busy} onClick={deleteMine}>Delete review</button> : <span />}
              <button className="primary" disabled={busy}>{busy ? 'Saving…' : mine ? 'Update review' : 'Submit review'}</button>
            </div>
          </form> : <div className="reviews-login-v112"><p>Sign in to rate GHM or write a review.</p><Link className="primary center-link" to="/login?next=%2Freviews">Sign in to review</Link></div>}
        </article>

        <section className="reviews-public-v112">
          <header><div><p className="eyebrow">FROM GHM HOUSEHOLDS</p><h2>Recent public reviews</h2></div><small>Reviews are shown as submitted by users. Admin replies are labelled separately.</small></header>
          {loading ? <div className="panel">Loading reviews…</div> : reviews.length ? <div className="reviews-grid-v112">{reviews.map((review) => <article className="panel review-card-v112" key={review.id}>
            <div className="review-card-head-v112"><div className="review-avatar-v112">{review.user_avatar_url ? <img src={review.user_avatar_url} alt="" /> : <span>{(review.user_name || 'G').slice(0, 1).toUpperCase()}</span>}</div><div><strong>{review.user_name || 'GHM user'}</strong><small>{new Date(review.updated_at || review.created_at).toLocaleDateString()}</small></div><Stars value={review.rating} /></div>
            <p>{review.comment}</p>
            {review.admin_reply ? <div className="review-admin-reply-v112"><strong>GHM reply</strong><p>{review.admin_reply}</p></div> : null}
          </article>)}</div> : <div className="panel reviews-empty-v112"><span>☆</span><div><strong>No public reviews yet.</strong><p>Be the first household to share an honest experience.</p></div></div>}
        </section>
      </section>
    </main>
  );
}
