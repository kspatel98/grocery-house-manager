import { useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { api, errorMessage } from '../api';
import type { UserProfile } from '../types';

export default function ProfilePage() {
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [fullName, setFullName] = useState('');
  const [avatarUrl, setAvatarUrl] = useState('');
  const [deleteConfirmName, setDeleteConfirmName] = useState('');
  const [showDelete, setShowDelete] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [busy, setBusy] = useState(false);
  const [deleteBusy, setDeleteBusy] = useState(false);
  const navigate = useNavigate();

  const expectedDeleteName = profile?.full_name || profile?.email || '';

  async function loadProfile() {
    try {
      const { data } = await api.get<UserProfile>('/auth/me');
      setProfile(data);
      setFullName(data.full_name || '');
      setAvatarUrl(data.avatar_url || '');
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
      setError('');
    } catch (err) {
      setError(errorMessage(err));
      setSuccess('');
    } finally {
      setBusy(false);
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
        <div className="profile-actions">
          <Link to="/about" className="secondary center-link">About</Link>
          <Link to="/pricing" className="secondary center-link">Plans</Link>
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

        <div className="profile-details">
          <div><strong>Email</strong><span>{profile?.email || '-'}</span></div>
          <div><strong>Login method</strong><span>{profile?.auth_provider || '-'}</span></div>
          <div><strong>User ID</strong><span>{profile?.id || '-'}</span></div>
          <div><strong>Account created</strong><span>{profile?.created_at ? new Date(profile.created_at).toLocaleString() : '-'}</span></div>
          <div><strong>Plan</strong><span>{profile?.plan_name || 'free'}</span></div>
          <div><strong>Subscription</strong><span>{profile?.subscription_status || 'free'}</span></div>
        </div>

        <div className="profile-actions profile-plan-actions">
          <Link to="/pricing" className="primary center-link">View plans</Link>
          {profile?.subscription_status && profile.subscription_status !== 'free' && <button className="secondary" onClick={manageBilling}>Manage billing</button>}
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
