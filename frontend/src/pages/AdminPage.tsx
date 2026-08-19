import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { api, errorMessage } from '../api';
import type { AdminAction, AdminEmailStatus, AdminSummary, AdminUser, AdminUserOffer, PlanName, SiteReview } from '../types';

function starText(value?: number | null) {
  const rating = Math.max(0, Math.min(5, Math.round(value || 0)));
  return '★'.repeat(rating) + '☆'.repeat(5 - rating);
}

const PLAN_LABELS: Record<PlanName, string> = {
  free: 'Free Starter',
  basic: 'Basic Home',
  family: 'Family Plus',
  pro: 'Household Pro',
};

export default function AdminPage() {
  const [summary, setSummary] = useState<AdminSummary | null>(null);
  const [users, setUsers] = useState<AdminUser[]>([]);
  const [emailStatus, setEmailStatus] = useState<AdminEmailStatus | null>(null);
  const [reviews, setReviews] = useState<SiteReview[]>([]);
  const [offers, setOffers] = useState<AdminUserOffer[]>([]);
  const [offerUserId, setOfferUserId] = useState('');
  const [offerKind, setOfferKind] = useState<'discount' | 'free_plan_access'>('discount');
  const [offerPlan, setOfferPlan] = useState<PlanName | 'universal'>('universal');
  const [offerPercent, setOfferPercent] = useState(25);
  const [offerDuration, setOfferDuration] = useState<'once' | 'repeating' | 'forever'>('once');
  const [offerDurationMonths, setOfferDurationMonths] = useState(1);
  const [offerAccessDays, setOfferAccessDays] = useState(10);
  const [offerAccessLifetime, setOfferAccessLifetime] = useState(false);
  const [offerUseLimit, setOfferUseLimit] = useState('1');
  const [offerExpiresInDays, setOfferExpiresInDays] = useState(7);
  const [offerTitle, setOfferTitle] = useState('');
  const [offerNote, setOfferNote] = useState('');
  const [testEmail, setTestEmail] = useState('');
  const [search, setSearch] = useState('');
  const [busy, setBusy] = useState(false);
  const [emailBusy, setEmailBusy] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [emailError, setEmailError] = useState('');
  const [emailSuccess, setEmailSuccess] = useState('');

  async function loadEmailStatus() {
    try {
      const { data } = await api.get<AdminEmailStatus>('/admin/email/status');
      setEmailStatus(data);
      setEmailError('');
    } catch (err) {
      setEmailError(errorMessage(err));
    }
  }

  async function loadAll() {
    try {
      setBusy(true);
      const [summaryRes, usersRes, emailStatusRes, reviewsRes, offersRes] = await Promise.all([
        api.get<AdminSummary>('/admin/summary'),
        api.get<AdminUser[]>('/admin/users', { params: { search: search || undefined, limit: 100 } }),
        api.get<AdminEmailStatus>('/admin/email/status'),
        api.get<SiteReview[]>('/reviews/admin/all'),
        api.get<AdminUserOffer[]>('/offers/admin'),
      ]);
      setSummary(summaryRes.data);
      setUsers(usersRes.data);
      setEmailStatus(emailStatusRes.data);
      setReviews(reviewsRes.data);
      setOffers(offersRes.data);
      setError('');
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setBusy(false);
    }
  }

  async function sendTestEmail(event: React.FormEvent) {
    event.preventDefault();
    setEmailError('');
    setEmailSuccess('');
    try {
      setEmailBusy(true);
      const { data } = await api.post<AdminAction>('/admin/email/test', { email: testEmail });
      setEmailSuccess(data.message);
      await loadEmailStatus();
    } catch (err) {
      setEmailError(errorMessage(err));
    } finally {
      setEmailBusy(false);
    }
  }

  async function assignPlan(user: AdminUser, planName: PlanName) {
    const label = PLAN_LABELS[planName];
    if (!confirm(`Assign ${label} to ${user.email}? Paid Stripe status will not be changed unless you also manage/cancel it.`)) return;
    try {
      setBusy(true);
      const { data } = await api.post<AdminAction>(`/admin/users/${user.id}/plan`, {
        plan_name: planName,
        reason: `Admin dashboard assignment to ${label}`,
      });
      setSuccess(data.message);
      setError('');
      await loadAll();
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setBusy(false);
    }
  }

  async function cancelSubscription(user: AdminUser) {
    if (!confirm(`Schedule Stripe cancellation / reset access for ${user.email}?`)) return;
    try {
      setBusy(true);
      const { data } = await api.post<AdminAction>(`/admin/users/${user.id}/cancel-subscription`);
      setSuccess(data.message);
      setError('');
      await loadAll();
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setBusy(false);
    }
  }

  async function refundLatest(user: AdminUser) {
    const amount = prompt('Refund amount in cents. Leave blank for full latest paid invoice. Example: 199 for $1.99');
    if (amount === null) return;
    const parsed = amount.trim() ? Number(amount.trim()) : null;
    if (parsed !== null && (!Number.isFinite(parsed) || parsed <= 0)) {
      setError('Enter a valid amount in cents, or leave blank for full refund.');
      return;
    }
    if (!confirm(`Create Stripe refund for ${user.email}? This is a real Stripe action when live keys are configured.`)) return;
    try {
      setBusy(true);
      const { data } = await api.post<AdminAction>(`/admin/users/${user.id}/refund-latest`, {
        confirm: true,
        amount_cents: parsed,
        reason: 'Support/admin refund from app dashboard',
      });
      setSuccess(data.message);
      setError('');
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setBusy(false);
    }
  }


  async function createAdminOffer(event: React.FormEvent) {
    event.preventDefault();
    if (!offerUserId) {
      setError('Choose a user for the offer.');
      return;
    }
    const selectedUser = users.find((user) => String(user.id) === String(offerUserId));
    const effectiveOfferPlan = offerKind === 'free_plan_access' && offerPlan === 'universal' ? 'basic' : offerPlan;
    const planLabel = effectiveOfferPlan === 'universal' ? 'any paid plan' : PLAN_LABELS[effectiveOfferPlan];
    const defaultTitle = offerKind === 'discount'
      ? `${offerPercent}% off ${planLabel}`
      : `Free ${planLabel} access`;
    const payload = {
      user_id: Number(offerUserId),
      offer_kind: offerKind,
      plan_name: offerKind === 'discount' && effectiveOfferPlan === 'universal' ? null : effectiveOfferPlan,
      title: (offerTitle || defaultTitle).trim(),
      message: offerNote.trim() || null,
      discount_percent: offerKind === 'discount' ? Number(offerPercent) : null,
      stripe_duration: offerKind === 'discount' ? offerDuration : null,
      duration_months: offerKind === 'discount' && offerDuration === 'repeating' ? Number(offerDurationMonths) : null,
      access_duration_days: offerKind === 'free_plan_access' && !offerAccessLifetime ? Number(offerAccessDays) : null,
      access_lifetime: offerKind === 'free_plan_access' ? offerAccessLifetime : false,
      use_limit: offerKind === 'discount' && offerUseLimit !== 'unlimited' ? Number(offerUseLimit) : null,
      expires_in_days: Number(offerExpiresInDays),
    };
    if (!confirm(`Create this offer for ${selectedUser?.email || 'selected user'}?`)) return;
    try {
      setBusy(true);
      await api.post<AdminUserOffer>('/offers/admin', payload);
      setSuccess('Offer created. The user will see it in their Houses notification slider.');
      setOfferTitle('');
      setOfferNote('');
      await loadAll();
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setBusy(false);
    }
  }

  async function cancelOffer(offer: AdminUserOffer) {
    if (!confirm(`Cancel offer: ${offer.title}?`)) return;
    try {
      setBusy(true);
      const { data } = await api.post<AdminAction>(`/offers/admin/${offer.id}/cancel`);
      setSuccess(data.message);
      await loadAll();
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setBusy(false);
    }
  }

  async function deleteReview(review: SiteReview) {
    if (!confirm(`Delete this review from ${review.user_name || 'user'}?`)) return;
    try {
      setBusy(true);
      const { data } = await api.delete<AdminAction>(`/reviews/admin/${review.id}`);
      setSuccess(data.message);
      await loadAll();
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setBusy(false);
    }
  }

  useEffect(() => { loadAll(); }, []);

  const planCounts = useMemo(() => summary?.users_by_plan || {}, [summary]);

  return (
    <main className="page shell wide admin-page">
      <header className="topbar">
        <div>
          <Link to="/houses" className="breadcrumb">← Houses</Link>
          <h1>Admin dashboard</h1>
          <p>Private owner tools for users, plans, houses, refunds, support queries, and password reset email checks.</p>
        </div>
        <button className="secondary" onClick={loadAll} disabled={busy}>{busy ? 'Refreshing...' : 'Refresh'}</button>
      </header>

      {error && <div className="error">{error}</div>}
      {success && <div className="success">{success}</div>}

      {summary && (
        <section className="stats-grid admin-stats-grid">
          <div className="stat-card"><strong>{summary.total_users}</strong><span>Total users</span></div>
          <div className="stat-card"><strong>{summary.paid_or_granted_users}</strong><span>Paid/granted users</span></div>
          <div className="stat-card"><strong>{summary.total_houses}</strong><span>Houses</span></div>
          <div className="stat-card"><strong>{summary.total_products}</strong><span>Products</span></div>
          <div className="stat-card"><strong>{summary.total_receipts}</strong><span>Receipts</span></div>
        </section>
      )}

      <section className="panel admin-email-panel">
        <div className="panel-title-row">
          <div>
            <h2>Password reset email health</h2>
            <p>Use this when a user says they requested a forgot-password code but did not receive the email.</p>
          </div>
          <span className={`plan-status-badge ${emailStatus?.email_configured ? 'paid' : 'free'}`}>
            {emailStatus?.email_configured ? `${emailStatus.provider.toUpperCase()} configured` : `${emailStatus?.provider?.toUpperCase() || 'EMAIL'} missing`}
          </span>
        </div>
        {emailStatus && (
          <div className="email-status-grid">
            <div><strong>Active provider</strong><span>{emailStatus.provider || '-'}</span></div>
            <div><strong>Email configured</strong><span>{emailStatus.email_configured ? 'true' : 'false'}</span></div>
            <div><strong>Resend from</strong><span>{emailStatus.resend_from_email || '-'}</span></div>
            <div><strong>SMTP host</strong><span>{emailStatus.smtp_host || '-'}</span></div>
            <div><strong>SMTP port</strong><span>{emailStatus.smtp_port || '-'}</span></div>
            <div><strong>SMTP from</strong><span>{emailStatus.smtp_from_email || '-'}</span></div>
            <div><strong>SMTP username</strong><span>{emailStatus.smtp_username || '-'}</span></div>
            <div><strong>TLS</strong><span>{emailStatus.smtp_use_tls ? 'true' : 'false'}</span></div>
            <div><strong>Force IPv4</strong><span>{emailStatus.smtp_force_ipv4 ? 'true' : 'false'}</span></div>
            <div><strong>Missing</strong><span>{emailStatus.missing_settings?.length ? emailStatus.missing_settings.join(', ') : '-'}</span></div>
          </div>
        )}
        <p className="small-muted">{emailStatus?.message || 'Checking email status...'}</p>
        <form className="inline-form admin-email-test-form" onSubmit={sendTestEmail}>
          <label>Send test password-reset email<input type="email" value={testEmail} onChange={(e) => setTestEmail(e.target.value)} placeholder="your inbox email" required /></label>
          <button className="primary" disabled={emailBusy}>{emailBusy ? 'Sending...' : 'Send test'}</button>
        </form>
        {emailBusy && <div className="hint form-message">Sending a real test email through the active provider. SMTP may take up to 30 seconds; Resend usually returns faster.</div>}
        {emailError && <div className="error form-message">{emailError}</div>}
        {emailSuccess && <div className="success form-message">{emailSuccess}</div>}
        <p className="small-muted">If the test fails, check server logs: <code>docker compose logs backend --tail=100</code>. If SMTP times out, use EMAIL_PROVIDER=resend.</p>
      </section>

      <section className="panel admin-plan-counts">
        <div className="panel-title-row">
          <div>
            <h2>Plan overview</h2>
            <p>Quick view of how many accounts are on each plan.</p>
          </div>
        </div>
        <div className="chips">
          {(['free', 'basic', 'family', 'pro'] as PlanName[]).map((plan) => (
            <span className="chip" key={plan}>{PLAN_LABELS[plan]}: <strong>{planCounts[plan] || 0}</strong></span>
          ))}
        </div>
      </section>

      <section className="panel admin-offer-panel">
        <div className="panel-title-row">
          <div>
            <h2>Personal offers</h2>
            <p>Create a user-specific discount or free plan access. Discount can be for one plan or universal for any paid plan.</p>
          </div>
        </div>
        <form className="admin-offer-form" onSubmit={createAdminOffer}>
          <label>User
            <select value={offerUserId} onChange={(event) => setOfferUserId(event.target.value)} required>
              <option value="">Choose user</option>
              {users.map((user) => <option key={user.id} value={user.id}>{user.email} • {PLAN_LABELS[user.plan_name]}</option>)}
            </select>
          </label>
          <label>Offer type
            <select value={offerKind} onChange={(event) => { const next = event.target.value as 'discount' | 'free_plan_access'; setOfferKind(next); if (next === 'free_plan_access' && offerPlan === 'universal') setOfferPlan('basic'); }}>
              <option value="discount">Discount coupon</option>
              <option value="free_plan_access">Free plan access</option>
            </select>
          </label>
          <label>Plan
            <select value={offerPlan} onChange={(event) => setOfferPlan(event.target.value as PlanName | 'universal')}>
              {offerKind === 'discount' && <option value="universal">Universal discount</option>}
              <option value="basic">Basic Home</option>
              <option value="family">Family Plus</option>
              <option value="pro">Household Pro</option>
            </select>
          </label>
          {offerKind === 'discount' ? (
            <>
              <label>Discount %<input type="number" min="1" max="100" value={offerPercent} onChange={(event) => setOfferPercent(Number(event.target.value))} /></label>
              <label>Discount duration
                <select value={offerDuration} onChange={(event) => setOfferDuration(event.target.value as 'once' | 'repeating' | 'forever')}>
                  <option value="once">First bill only</option>
                  <option value="repeating">For selected months</option>
                  <option value="forever">Lifetime</option>
                </select>
              </label>
              {offerDuration === 'repeating' && <label>Months<input type="number" min="1" max="36" value={offerDurationMonths} onChange={(event) => setOfferDurationMonths(Number(event.target.value))} /></label>}
              <label>Use limit
                <select value={offerUseLimit} onChange={(event) => setOfferUseLimit(event.target.value)}>
                  <option value="1">Once</option>
                  <option value="2">Twice</option>
                  <option value="3">Thrice</option>
                  <option value="unlimited">Unlimited</option>
                </select>
              </label>
            </>
          ) : (
            <>
              <label className="inline-check admin-offer-check"><input type="checkbox" checked={offerAccessLifetime} onChange={(event) => setOfferAccessLifetime(event.target.checked)} /> Lifetime access</label>
              {!offerAccessLifetime && <label>Free access days<input type="number" min="1" max="3650" value={offerAccessDays} onChange={(event) => setOfferAccessDays(Number(event.target.value))} /></label>}
            </>
          )}
          <label>Offer disappears after days<input type="number" min="1" max="365" value={offerExpiresInDays} onChange={(event) => setOfferExpiresInDays(Number(event.target.value))} /></label>
          <label>Title, optional<input value={offerTitle} onChange={(event) => setOfferTitle(event.target.value)} placeholder="Example: 50% off Family Plus" /></label>
          <label className="admin-offer-note">User message, optional<textarea value={offerNote} onChange={(event) => setOfferNote(event.target.value)} placeholder="Short friendly message shown in the notification card" /></label>
          <button className="primary full" disabled={busy}>Create offer</button>
        </form>
        <div className="admin-offer-list">
          {offers.length === 0 ? <p className="small-muted">No offers created yet.</p> : offers.slice(0, 10).map((offer) => (
            <article className={`admin-offer-row offer-status-${offer.status}`} key={offer.id}>
              <div>
                <strong>{offer.title}</strong>
                <small>{offer.user_email} • {offer.summary}</small>
                <small>Status: {offer.status} • Expires {new Date(offer.expires_at).toLocaleString()}</small>
              </div>
              {['pending', 'checkout_started'].includes(offer.status) && <button className="secondary small-button danger-button" type="button" onClick={() => cancelOffer(offer)}>Cancel offer</button>}
            </article>
          ))}
        </div>
      </section>

      <section className="panel admin-plan-counts">
        <div className="panel-title-row">
          <div>
            <h2>User reviews moderation</h2>
            <p>Admins can review submitted feedback and remove inappropriate content.</p>
          </div>
        </div>
        <div className="review-cards-stack">
          {reviews.length === 0 ? (
            <div className="small-muted">No reviews found.</div>
          ) : reviews.slice(0, 8).map((review) => (
            <article className="review-card-v54" key={review.id}>
              <div className="review-card-top">
                <div>
                  <strong>{review.user_name || 'Unknown user'}</strong>
                  <small>{starText(review.rating)} • {new Date(review.created_at).toLocaleDateString()}</small>
                </div>
                <button className="secondary small-button danger-button" type="button" onClick={() => deleteReview(review)}>Delete</button>
              </div>
              <p>“{review.comment}”</p>
            </article>
          ))}
        </div>
      </section>

      <section className="panel admin-users-panel">
        <div className="panel-title-row">
          <div>
            <h2>Users and support controls</h2>
            <p>Search a user, grant plan access, schedule cancellation, or refund the latest Stripe payment.</p>
          </div>
        </div>
        <form className="inline-form" onSubmit={(event) => { event.preventDefault(); loadAll(); }}>
          <label>Search user<input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="email, name, city, country" /></label>
          <button className="primary" disabled={busy}>Search</button>
        </form>

        <div className="admin-table-wrap">
          <table className="admin-table">
            <thead>
              <tr>
                <th>User</th>
                <th>Location</th>
                <th>Plan</th>
                <th>Usage</th>
                <th>Stripe</th>
                <th>Controls</th>
              </tr>
            </thead>
            <tbody>
              {users.map((user) => (
                <tr key={user.id}>
                  <td><strong>{user.full_name || 'No name'}</strong><small>{user.email}</small><small>Joined {new Date(user.created_at).toLocaleDateString()}</small></td>
                  <td><span>{[user.city, user.country].filter(Boolean).join(', ') || '-'}</span><small>{user.currency_code}</small></td>
                  <td><span className="badge">{PLAN_LABELS[user.plan_name]}</span><small>{user.subscription_status}</small></td>
                  <td><span>{user.houses_owned} owned</span><small>{user.memberships} memberships</small></td>
                  <td><small>{user.stripe_customer_id || 'No customer'}</small><small>{user.stripe_subscription_id || 'No subscription'}</small></td>
                  <td>
                    <div className="admin-control-grid">
                      {(['free', 'basic', 'family', 'pro'] as PlanName[]).map((plan) => (
                        <button key={plan} className="secondary small-button" type="button" onClick={() => assignPlan(user, plan)}>{plan}</button>
                      ))}
                      <button className="secondary small-button danger-button" type="button" onClick={() => cancelSubscription(user)}>Cancel/reset</button>
                      <button className="secondary small-button" type="button" onClick={() => refundLatest(user)}>Refund</button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
    </main>
  );
}
