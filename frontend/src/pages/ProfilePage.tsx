import { useEffect, useMemo, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { api, errorMessage } from '../api';
import type { PersonalInsights, Subscription, UserProfile } from '../types';

const PLAN_LABELS: Record<string, string> = {
  free: 'Free Starter',
  basic: 'Basic Home',
  family: 'Family Plus',
  pro: 'Household Pro',
};

function isPaidStatus(status?: string) {
  return ['active', 'trialing', 'past_due', 'cancel_at_period_end'].includes((status || '').toLowerCase());
}

function isCancelledAtPeriodEnd(status?: string) {
  return (status || '').toLowerCase() === 'cancel_at_period_end';
}

export default function ProfilePage() {
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [insights, setInsights] = useState<PersonalInsights | null>(null);
  const [fullName, setFullName] = useState('');
  const [avatarUrl, setAvatarUrl] = useState('');
  const [deleteConfirmName, setDeleteConfirmName] = useState('');
  const [showDelete, setShowDelete] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [busy, setBusy] = useState(false);
  const [deleteBusy, setDeleteBusy] = useState(false);
  const [cancelBusy, setCancelBusy] = useState(false);
  const [syncBusy, setSyncBusy] = useState(false);
  const navigate = useNavigate();

  const expectedDeleteName = profile?.full_name || profile?.email || '';
  const planName = profile?.plan_name || 'free';
  const planLabel = PLAN_LABELS[planName] || planName;
  const paid = isPaidStatus(profile?.subscription_status);
  const proActive = planName === 'pro' && paid;
  const familyActive = planName === 'family' && paid;
  const basicActive = planName === 'basic' && paid;

  const personalPlanAction = useMemo(() => {
    if (proActive) return { label: 'Household Pro active', kind: 'status' as const };
    if (familyActive) return { label: 'Upgrade to Household Pro', kind: 'link' as const };
    if (basicActive) return { label: 'Upgrade personal tools', kind: 'link' as const };
    return { label: 'Upgrade personal tools', kind: 'link' as const };
  }, [proActive, familyActive, basicActive]);

  async function loadProfile() {
    try {
      const [{ data }, billingRes] = await Promise.all([
        api.get<UserProfile>('/auth/me'),
        api.get<Subscription>('/billing/me').catch(() => null),
      ]);
      const mergedProfile = billingRes ? {
        ...data,
        plan_name: billingRes.data.plan_name,
        subscription_status: billingRes.data.subscription_status,
        subscription_current_period_end: billingRes.data.current_period_end,
      } : data;
      setProfile(mergedProfile);
      setFullName(mergedProfile.full_name || '');
      setAvatarUrl(mergedProfile.avatar_url || '');
      try {
        const insightsRes = await api.get<PersonalInsights>('/auth/me/insights');
        setInsights(insightsRes.data);
      } catch {
        setInsights(null);
      }
      setError('');
    } catch (err) {
      setError(errorMessage(err));
    }
  }

  async function saveProfile(event: React.FormEvent) {
    event.preventDefault();
    try {
      setBusy(true);
      const { data } = await api.post<UserProfile>('/auth/me/edit', {
        full_name: fullName.trim() || null,
        avatar_url: avatarUrl.trim() || null,
      });
      setProfile(data);
      localStorage.setItem('user', JSON.stringify({
        id: data.id,
        email: data.email,
        full_name: data.full_name,
        avatar_url: data.avatar_url,
      }));
      setSuccess('Profile updated.');
      try {
        const insightsRes = await api.get<PersonalInsights>('/auth/me/insights');
        setInsights(insightsRes.data);
      } catch {
        setInsights(null);
      }
      setError('');
    } catch (err) {
      setError(errorMessage(err));
      setSuccess('');
    } finally {
      setBusy(false);
    }
  }

  async function syncSubscription() {
    try {
      setSyncBusy(true);
      const { data } = await api.post<Subscription>('/billing/sync-subscription');
      await loadProfile();
      setSuccess(`Subscription synced. Current plan: ${PLAN_LABELS[data.plan_name] || data.plan_name}.`);
      setError('');
    } catch (err) {
      setError(errorMessage(err));
      setSuccess('');
    } finally {
      setSyncBusy(false);
    }
  }

  async function deleteAccount(event: React.FormEvent) {
    event.preventDefault();
    if (!expectedDeleteName || deleteConfirmName.trim() !== expectedDeleteName) {
      setError(`Type exactly: ${expectedDeleteName}`);
      return;
    }
    try {
      setDeleteBusy(true);
      await api.post('/auth/me/delete', { confirm_name: deleteConfirmName.trim() });
      localStorage.removeItem('token');
      localStorage.removeItem('user');
      navigate('/login', { replace: true });
    } catch (err) {
      setError(errorMessage(err));
      setDeleteBusy(false);
    }
  }

  async function cancelSubscription() {
    if (!confirm('Cancel your subscription at the end of the current billing period? You will keep paid features until the period ends.')) return;
    try {
      setCancelBusy(true);
      const { data } = await api.post<{ message: string; current_period_end?: string }>('/billing/cancel-subscription');
      setSuccess(data.message || 'Subscription cancellation scheduled.');
      await loadProfile();
      setError('');
    } catch (err) {
      setError(errorMessage(err));
      setSuccess('');
    } finally {
      setCancelBusy(false);
    }
  }

  async function manageBilling() {
    try {
      const { data } = await api.post<{ url: string }>('/billing/customer-portal');
      window.location.href = data.url;
    } catch (err) {
      setError(errorMessage(err));
    }
  }

  function logout() {
    localStorage.removeItem('token');
    localStorage.removeItem('user');
    navigate('/login');
  }

  useEffect(() => { loadProfile(); }, []);

  return (
    <main className="page shell">
      <header className="topbar">
        <div>
          <Link to="/houses" className="breadcrumb">← Houses</Link>
          <h1>Profile</h1>
          <p>Manage your account details, subscription, logout, and account deletion from here.</p>
        </div>
      </header>

      {error && <div className="error">{error}</div>}
      {success && <div className="success">{success}</div>}

      <section className="panel profile-panel">
        <div className="profile-header">
          <div className="profile-avatar">
            {avatarUrl ? <img src={avatarUrl} alt="" /> : (fullName || profile?.email || 'U').slice(0, 1).toUpperCase()}
          </div>
          <div>
            <h2>{profile?.full_name || 'Your profile'}</h2>
            <p>{profile?.email}</p>
          </div>
        </div>

        <div className="plan-summary-card">
          <div>
            <p className="eyebrow">Current plan</p>
            <h3>{planLabel}</h3>
            <p>
              {proActive
                ? 'Household Pro is active. Your personal premium tools and owned-house limits are unlocked.'
                : paid
                  ? `${planLabel} is active. You can manage billing or upgrade anytime.`
                  : 'You are currently on the Free Starter plan.'}
            </p>
            {isCancelledAtPeriodEnd(profile?.subscription_status) && profile?.subscription_current_period_end && (
              <p className="small-muted">Cancellation scheduled. Paid access remains until {new Date(profile.subscription_current_period_end).toLocaleDateString()}.</p>
            )}
          </div>
          <span className={`plan-status-badge ${proActive ? 'pro' : paid ? 'paid' : 'free'}`}>
            {proActive ? 'Pro active' : paid ? 'Paid active' : 'Free'}
          </span>
        </div>

        <div className="profile-details">
          <div><strong>Email</strong><span>{profile?.email || '-'}</span></div>
          <div><strong>Login method</strong><span>{profile?.auth_provider || '-'}</span></div>
          <div><strong>User ID</strong><span>{profile?.id || '-'}</span></div>
          <div><strong>Account created</strong><span>{profile?.created_at ? new Date(profile.created_at).toLocaleString() : '-'}</span></div>
          <div><strong>Plan</strong><span>{planLabel}</span></div>
          <div><strong>Subscription</strong><span>{profile?.subscription_status || 'free'}</span></div>
        </div>

        <div className="profile-actions profile-plan-actions">
          {paid ? (
            <>
              <button className="primary" onClick={manageBilling}>Manage billing</button>
              <button className="secondary" onClick={syncSubscription} disabled={syncBusy}>
                {syncBusy ? 'Syncing...' : 'Sync subscription'}
              </button>
              {!isCancelledAtPeriodEnd(profile?.subscription_status) && (
                <button className="secondary danger-button" onClick={cancelSubscription} disabled={cancelBusy}>
                  {cancelBusy ? 'Scheduling cancellation...' : 'Cancel subscription'}
                </button>
              )}
            </>
          ) : (
            <>
              <Link to="/pricing" className="primary center-link">View plans</Link>
              <button className="secondary" onClick={syncSubscription} disabled={syncBusy}>
                {syncBusy ? 'Syncing...' : 'I already paid — sync subscription'}
              </button>
            </>
          )}
        </div>

        <form onSubmit={saveProfile} className="profile-form">
          <label>Full name<input value={fullName} onChange={(e) => setFullName(e.target.value)} required /></label>
          <label>Profile image URL<input value={avatarUrl} onChange={(e) => setAvatarUrl(e.target.value)} placeholder="https://..." /></label>
          <div className="profile-actions">
            <button className="primary" disabled={busy}>{busy ? 'Saving...' : 'Save profile'}</button>
            <button type="button" className="secondary danger-button" onClick={logout}>Logout</button>
          </div>
        </form>
      </section>

      {insights && (
        <section className="panel profile-panel personal-insights-panel">
          <div className="panel-title-row insights-title-row">
            <div>
              <p className="eyebrow">Personal premium tools</p>
              <h2>Your personal insights</h2>
              <p>House features follow the house owner's plan. These tools belong to your own account and grow with your own subscription.</p>
            </div>
            <div className="insights-actions">
              {personalPlanAction.kind === 'status' ? (
                <span className="plan-status-badge pro">{personalPlanAction.label}</span>
              ) : (
                <Link to="/pricing" className="secondary center-link">{personalPlanAction.label}</Link>
              )}
              {paid && <button className="secondary" onClick={manageBilling}>Manage billing</button>}
            </div>
          </div>
          <div className="stats-grid four profile-insights-grid">
            <div className="stat-card"><strong>{insights.receipts_uploaded}</strong><span>Receipts uploaded</span></div>
            <div className="stat-card"><strong>{insights.prices_recorded}</strong><span>Prices recorded</span></div>
            <div className="stat-card"><strong>{insights.stores_tracked}</strong><span>Stores tracked</span></div>
            <div className="stat-card"><strong>${insights.estimated_personal_spend.toFixed(2)}</strong><span>Tracked spend</span></div>
          </div>
          <ul className="feature-list compact-feature-list">
            {insights.premium_tools.map((tool) => <li key={tool}>{tool}</li>)}
          </ul>
        </section>
      )}

      <section className="panel danger-zone">
        <div>
          <p className="eyebrow">Danger zone</p>
          <h2>Delete account</h2>
          <p>
            This permanently deletes your account. For safety, if you own shared houses with other members,
            delete will be blocked until you remove members or handle those houses first.
          </p>
        </div>

        {!showDelete ? (
          <button className="secondary danger-button" onClick={() => setShowDelete(true)}>Delete my account</button>
        ) : (
          <form onSubmit={deleteAccount} className="delete-account-form">
            <p>Type <strong>{expectedDeleteName}</strong> to confirm.</p>
            <input value={deleteConfirmName} onChange={(e) => setDeleteConfirmName(e.target.value)} placeholder={expectedDeleteName} />
            <div className="profile-actions">
              <button className="danger-primary" disabled={deleteBusy || deleteConfirmName.trim() !== expectedDeleteName}>
                {deleteBusy ? 'Deleting...' : 'Permanently delete account'}
              </button>
              <button type="button" className="secondary" onClick={() => { setShowDelete(false); setDeleteConfirmName(''); }}>Cancel</button>
            </div>
          </form>
        )}
      </section>
    </main>
  );
}
