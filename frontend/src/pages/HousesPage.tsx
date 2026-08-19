import type { FormEvent, ReactNode } from 'react';
import { useEffect, useMemo, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { api, errorMessage } from '../api';
import type { AccountBootstrap, House, SiteReview, SiteReviewSummary, Subscription } from '../types';

function isPaidStatus(status?: string) {
  return ['active', 'trialing', 'past_due', 'cancel_at_period_end', 'admin_granted'].includes((status || '').toLowerCase());
}

function timeLeftParts(dateValue?: string | null) {
  if (!dateValue) return { expired: true, days: 0, hours: 0, minutes: 0, seconds: 0 };
  const diff = new Date(dateValue).getTime() - Date.now();
  if (diff <= 0) return { expired: true, days: 0, hours: 0, minutes: 0, seconds: 0 };
  const totalSeconds = Math.floor(diff / 1000);
  const days = Math.floor(totalSeconds / 86400);
  const hours = Math.floor((totalSeconds % 86400) / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;
  return { expired: false, days, hours, minutes, seconds };
}

function starText(value?: number | null) {
  const rating = Math.max(0, Math.min(5, Math.round(value || 0)));
  return '★'.repeat(rating) + '☆'.repeat(5 - rating);
}

type NotificationSlide = {
  key: string;
  content: ReactNode;
};

function CountdownBadge({ until }: { until?: string | null }) {
  const [tick, setTick] = useState(() => timeLeftParts(until));

  useEffect(() => {
    setTick(timeLeftParts(until));
    if (!until) return;
    const timer = window.setInterval(() => setTick(timeLeftParts(until)), 1000);
    return () => window.clearInterval(timer);
  }, [until]);

  if (tick.expired) return <div className="countdown-alert">Offer ended</div>;
  return (
    <div className="countdown-alert" aria-live="polite">
      <strong>{tick.days}D</strong>
      <span>{String(tick.hours).padStart(2, '0')}h</span>
      <span>{String(tick.minutes).padStart(2, '0')}m</span>
      <span>{String(tick.seconds).padStart(2, '0')}s</span>
      <em>left</em>
    </div>
  );
}

function NotificationSlider({ slides }: { slides: NotificationSlide[] }) {
  const [active, setActive] = useState(0);

  useEffect(() => {
    if (slides.length <= 1) return;
    const timer = window.setInterval(() => {
      setActive((current) => (current + 1) % slides.length);
    }, 5000);
    return () => window.clearInterval(timer);
  }, [slides.length]);

  useEffect(() => {
    if (active >= slides.length) setActive(0);
  }, [active, slides.length]);

  if (!slides.length) return null;

  return (
    <section className="notification-showcase" aria-label="Important updates">
      <div className="notification-window">
        {slides.length > 1 && (
          <>
            <button type="button" className="notification-arrow prev" aria-label="Previous notification" onClick={() => setActive((current) => (current - 1 + slides.length) % slides.length)}>‹</button>
            <button type="button" className="notification-arrow next" aria-label="Next notification" onClick={() => setActive((current) => (current + 1) % slides.length)}>›</button>
          </>
        )}
        <div className="notification-track" style={{ transform: `translateX(-${active * 100}%)` }}>
          {slides.map((slide) => (
            <div className="notification-slide" key={slide.key}>{slide.content}</div>
          ))}
        </div>
      </div>
      {slides.length > 1 && (
        <div className="notification-dots" aria-label="Notification controls">
          {slides.map((slide, index) => (
            <button
              key={slide.key}
              className={index === active ? 'active' : ''}
              aria-label={`Show notification ${index + 1}`}
              onClick={() => setActive(index)}
            />
          ))}
        </div>
      )}
    </section>
  );
}

export default function HousesPage() {
  const [houses, setHouses] = useState<House[]>([]);
  const [name, setName] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);
  const [subscription, setSubscription] = useState<Subscription | null>(null);
  const [stats, setStats] = useState<SiteReviewSummary | null>(null);
  const [reviews, setReviews] = useState<SiteReview[]>([]);
  const [myReview, setMyReview] = useState<SiteReview | null>(null);
  const [reviewRating, setReviewRating] = useState(5);
  const [reviewComment, setReviewComment] = useState('');
  const [reviewBusy, setReviewBusy] = useState(false);
  const [reviewMessage, setReviewMessage] = useState('');
  const [reviewError, setReviewError] = useState('');
  const navigate = useNavigate();

  async function loadReviews() {
    try {
      const [summaryRes, reviewsRes, myReviewRes] = await Promise.all([
        api.get<SiteReviewSummary>('/reviews/summary'),
        api.get<SiteReview[]>('/reviews'),
        api.get<SiteReview | null>('/reviews/mine'),
      ]);
      setStats(summaryRes.data);
      setReviews(Array.isArray(reviewsRes.data) ? reviewsRes.data : []);
      setMyReview(myReviewRes.data || null);
      if (myReviewRes.data) {
        setReviewRating(myReviewRes.data.rating || 5);
        setReviewComment(myReviewRes.data.comment || '');
      } else {
        setReviewRating(5);
        setReviewComment('');
      }
    } catch {
      setStats(null);
      setReviews([]);
      setMyReview(null);
    }
  }

  async function load() {
    try {
      setLoading(true);
      setError('');
      const { data } = await api.get<AccountBootstrap>('/account/bootstrap', { params: { t: Date.now() } });
      setHouses(Array.isArray(data.houses) ? data.houses : []);
      setSubscription(data.subscription);
      localStorage.setItem('account_profile_cache', JSON.stringify(data.user));
      localStorage.setItem('account_is_admin', data.is_admin ? 'true' : 'false');
      await loadReviews();
    } catch (err) {
      setError(errorMessage(err));
      setHouses([]);
    } finally {
      setLoading(false);
    }
  }

  async function createHouse(event: FormEvent) {
    event.preventDefault();
    if (!name.trim()) return;
    try {
      setError('');
      const { data } = await api.post<House>('/houses', { name: name.trim() });
      setName('');
      navigate(`/houses/${data.id}`);
    } catch (err) {
      setError(errorMessage(err));
    }
  }

  async function submitReview(event: FormEvent) {
    event.preventDefault();
    setReviewError('');
    setReviewMessage('');
    if (reviewComment.trim().length < 8) {
      setReviewError('Please write a short review before submitting.');
      return;
    }
    try {
      setReviewBusy(true);
      if (myReview) {
        await api.put(`/reviews/${myReview.id}`, {
          rating: reviewRating,
          comment: reviewComment.trim(),
          is_public: true,
        });
        setReviewMessage('Your review was updated.');
      } else {
        await api.post('/reviews', {
          rating: reviewRating,
          comment: reviewComment.trim(),
          is_public: true,
        });
        setReviewMessage('Thank you. Your review is saved.');
      }
      await loadReviews();
    } catch (err) {
      setReviewError(errorMessage(err));
    } finally {
      setReviewBusy(false);
    }
  }

  async function deleteMyReview() {
    if (!myReview) return;
    if (!window.confirm('Delete your review?')) return;
    try {
      setReviewBusy(true);
      await api.delete(`/reviews/${myReview.id}`);
      setReviewMessage('Your review was deleted.');
      setReviewComment('');
      setReviewRating(5);
      await loadReviews();
    } catch (err) {
      setReviewError(errorMessage(err));
    } finally {
      setReviewBusy(false);
    }
  }

  useEffect(() => { load(); }, []);

  const ownedHouseCount = Number(subscription?.usage?.houses || 0);
  const canCreateHouse = !!subscription && subscription.limits.houses > ownedHouseCount;
  const isFreePlan = subscription?.plan_name === 'free';
  const offer = subscription?.new_user_offer;
  const shouldShowOffer = Boolean(offer?.active && !isPaidStatus(subscription?.subscription_status) && !timeLeftParts(offer?.eligible_until).expired);

  const slides: NotificationSlide[] = useMemo(() => {
    const items: NotificationSlide[] = [];
    if (shouldShowOffer) {
      items.push({
        key: 'basic-offer',
        content: (
          <div className="notification-picture offer-picture">
            <div className="notification-glow" aria-hidden="true" />
            <div className="notification-copy">
              <span className="notification-label">Limited new-user offer</span>
              <CountdownBadge until={offer?.eligible_until} />
              <h2>65% off Basic Home</h2>
              <p>Start Basic for the first 2 billing months and unlock house creation, smart receipt tools, and a cleaner grocery routine.</p>
            </div>
            <div className="notification-side-stack">
              <div className="offer-countdown-card compact-offer-card">
                <strong>2 months</strong>
                <span>discounted billing</span>
              </div>
              <Link to="/pricing" className="notification-action">Claim offer</Link>
            </div>
          </div>
        ),
      });
    }
    items.push({
      key: 'extra-scans',
      content: (
        <Link to="/pricing#extra-scans" className="notification-image-link" aria-label="Open extra receipt scans section">
          <div className="notification-image-card notification-image-fill" style={{ backgroundImage: 'url(/brand/extra_receipt_scans_available.png)' }}>
            <div className="notification-image-overlay">
              <span className="notification-image-chip">New convenient option</span>
              <strong>Buy extra receipt scans anytime</strong>
              <span>Open scan packs</span>
            </div>
          </div>
        </Link>
      ),
    });
    items.push({
      key: 'community-stats',
      content: (
        <div className="notification-picture stats-picture">
          <div className="notification-glow" aria-hidden="true" />
          <div className="notification-copy">
            <span className="notification-label">Community snapshot</span>
            <h2>{stats?.total_users ?? 0}+ users organizing groceries</h2>
            <p>Live trust snapshot from your Grocery House Manager community.</p>
            <div className="stats-picture-grid">
              <div><strong>{stats?.new_users_this_month ?? 0}</strong><span>new this month</span></div>
              <div><strong>{stats?.average_rating ? stats.average_rating.toFixed(1) : '0.0'}</strong><span>{starText(stats?.average_rating)}</span></div>
              <div><strong>{stats?.review_count ?? 0}</strong><span>reviews saved</span></div>
            </div>
            <blockquote>
              “{stats?.best_positive_comment || 'Be one of the first users to share how Grocery House Manager helps your home.'}”
              {stats?.best_reviewer_name && <cite>— {stats.best_reviewer_name}</cite>}
            </blockquote>
          </div>
        </div>
      ),
    });
    return items;
  }, [offer?.eligible_until, shouldShowOffer, stats]);

  return (
    <main className="page shell houses-page-v54 cinematic-page">
      <header className="topbar houses-hero-v54">
        <div>
          <p className="eyebrow">House dashboard</p>
          <h1>Your houses</h1>
          <p>Create a shared space for your family, roommates, or couple grocery routine. Everything starts from one clean home dashboard.</p>
        </div>
        <div className="topbar-actions">
          <button className="secondary" onClick={load}>Refresh</button>
        </div>
      </header>

      <NotificationSlider slides={slides} />

      <section className="panel create-house-panel creative-create-house">
        <div className="panel-title-row">
          <div>
            <p className="eyebrow">Start a household</p>
            <h2>Create a house</h2>
            <p>{isFreePlan ? 'Free Starter can join invited houses. Upgrade to create and manage your own house.' : 'Create one house for a household you own or manage.'}</p>
          </div>
          {subscription && <span className="plan-pill">{subscription.plan_name} • {ownedHouseCount}/{subscription.limits.houses} owned houses</span>}
        </div>
        {isFreePlan ? (
          <div className="upgrade-callout graphical-callout">
            <strong>Upgrade to create a house.</strong>
            <span>Members can still join houses for free by invitation. The house features follow the owner’s plan.</span>
            <Link to="/pricing" className="primary center-link">View plans</Link>
          </div>
        ) : (
          <form onSubmit={createHouse} className="inline-form">
            <input placeholder="Example: Patel Family Home" value={name} onChange={(e) => setName(e.target.value)} />
            <button className="primary" disabled={!canCreateHouse}>Create</button>
          </form>
        )}
      </section>

      {error && <div className="error">{error}</div>}
      {loading && <div className="panel muted-panel">Loading your houses...</div>}
      {!loading && !error && houses.length === 0 && (
        <section className="panel empty-state creative-empty-state">
          <span className="empty-state-icon">🏡</span>
          <h2>No houses found for this account</h2>
          <p>If you already created a house, make sure you are logged in with the same email/account and using grocery-house-manager.com.</p>
          <button className="secondary" onClick={load}>Check again</button>
        </section>
      )}

      <div className="grid houses-grid creative-houses-grid">
        {houses.map((house) => (
          <Link to={`/houses/${house.id}`} key={house.id} className="house-card creative-house-card">
            <span className="house-card-aura" aria-hidden="true" />
            <span className="house-icon">🏠</span>
            <strong>{house.name}</strong>
            <small>{house.role} access • open control center</small>
          </Link>
        ))}
      </div>

      <section className="panel review-hub-panel">
        <div className="panel-title-row review-hub-title">
          <div>
            <p className="eyebrow">User reviews</p>
            <h2>Share your Grocery House Manager experience</h2>
            <p>Reviews help new users trust the app and help us improve what matters most.</p>
          </div>
          <span className="review-rating-pill">{stats?.average_rating ? stats.average_rating.toFixed(1) : '0.0'} ★ average</span>
        </div>

        <div className="review-hub-grid">
          <form onSubmit={submitReview} className="review-form-card">
            <label>
              Rating
              <select value={reviewRating} onChange={(event) => setReviewRating(Number(event.target.value))}>
                <option value={5}>★★★★★ Excellent</option>
                <option value={4}>★★★★ Good</option>
                <option value={3}>★★★ Okay</option>
                <option value={2}>★★ Needs work</option>
                <option value={1}>★ Poor</option>
              </select>
            </label>
            <label>
              Your review
              <textarea
                value={reviewComment}
                onChange={(event) => setReviewComment(event.target.value)}
                placeholder="Example: This helped my family stop buying duplicate groceries."
              />
            </label>
            {reviewError && <div className="error form-message">{reviewError}</div>}
            {reviewMessage && <div className="success form-message">{reviewMessage}</div>}
            <div className="review-form-actions">
              <button className="primary" disabled={reviewBusy}>{reviewBusy ? 'Saving...' : myReview ? 'Update review' : 'Save review'}</button>
              {myReview && <button type="button" className="secondary danger-button" onClick={deleteMyReview} disabled={reviewBusy}>Delete</button>}
            </div>
          </form>

          <div className="review-cards-stack">
            {reviews.length === 0 ? (
              <div className="review-card-v54 empty-review-card">
                <strong>No reviews yet</strong>
                <p>Be the first person to share your experience.</p>
              </div>
            ) : reviews.slice(0, 3).map((review) => (
              <article className="review-card-v54" key={review.id}>
                <div className="review-card-top">
                  <span className="review-avatar-v54">
                    {review.user_avatar_url ? <img src={review.user_avatar_url} alt="" /> : (review.user_name || 'AI').slice(0, 2).toUpperCase()}
                  </span>
                  <div>
                    <strong>{review.user_name || 'Grocery House Manager user'}</strong>
                    <small>{starText(review.rating)} • {new Date(review.created_at).toLocaleDateString()}</small>
                  </div>
                </div>
                <p>“{review.comment}”</p>
              </article>
            ))}
          </div>
        </div>
      </section>
    </main>
  );
}
