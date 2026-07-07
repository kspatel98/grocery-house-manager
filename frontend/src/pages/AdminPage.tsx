import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { api, errorMessage } from '../api';
import type { AdminAction, AdminEmailStatus, AdminSummary, AdminUser, PlanName } from '../types';

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
      const [summaryRes, usersRes, emailStatusRes] = await Promise.all([
        api.get<AdminSummary>('/admin/summary'),
        api.get<AdminUser[]>('/admin/users', { params: { search: search || undefined, limit: 100 } }),
        api.get<AdminEmailStatus>('/admin/email/status'),
      ]);
      setSummary(summaryRes.data);
      setUsers(usersRes.data);
      setEmailStatus(emailStatusRes.data);
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
          <span className={`plan-status-badge ${emailStatus?.smtp_configured ? 'paid' : 'free'}`}>
            {emailStatus?.smtp_configured ? 'SMTP configured' : 'SMTP missing'}
          </span>
        </div>
        {emailStatus && (
          <div className="email-status-grid">
            <div><strong>Host</strong><span>{emailStatus.smtp_host || '-'}</span></div>
            <div><strong>From</strong><span>{emailStatus.smtp_from_email || '-'}</span></div>
            <div><strong>Username</strong><span>{emailStatus.smtp_username || '-'}</span></div>
            <div><strong>TLS</strong><span>{emailStatus.smtp_use_tls ? 'true' : 'false'}</span></div>
          </div>
        )}
        <p className="small-muted">{emailStatus?.message || 'Checking email status...'}</p>
        <form className="inline-form admin-email-test-form" onSubmit={sendTestEmail}>
          <label>Send test password-reset email<input type="email" value={testEmail} onChange={(e) => setTestEmail(e.target.value)} placeholder="your inbox email" required /></label>
          <button className="primary" disabled={emailBusy}>{emailBusy ? 'Sending...' : 'Send test'}</button>
        </form>
        {emailBusy && <div className="hint form-message">Sending a real test email through SMTP. This can take up to 30 seconds.</div>}
        {emailError && <div className="error form-message">{emailError}</div>}
        {emailSuccess && <div className="success form-message">{emailSuccess}</div>}
        <p className="small-muted">If the test fails, check server logs: <code>docker compose logs backend --tail=100</code></p>
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
