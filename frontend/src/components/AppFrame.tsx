import type { ReactNode } from 'react';
import { useEffect, useState } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { api } from '../api';
import OfferCrownWidget from './OfferCrownWidget';
import type { AccountBootstrap, UserProfile } from '../types';

function EmailIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path d="M4.5 7.2A2.7 2.7 0 0 1 7.2 4.5h9.6a2.7 2.7 0 0 1 2.7 2.7v9.6a2.7 2.7 0 0 1-2.7 2.7H7.2a2.7 2.7 0 0 1-2.7-2.7V7.2Z" fill="#fff" />
      <path d="M5.7 7.4 12 12.2l6.3-4.8" stroke="#EA4335" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M5.5 8.2v8.1c0 .9.7 1.7 1.7 1.7h9.6c.9 0 1.7-.7 1.7-1.7V8.2" stroke="#34A853" strokeWidth="1.8" />
      <path d="M5.8 17.2 10 12.6" stroke="#4285F4" strokeWidth="1.8" strokeLinecap="round" />
      <path d="m18.2 17.2-4.2-4.6" stroke="#FBBC05" strokeWidth="1.8" strokeLinecap="round" />
    </svg>
  );
}

function InstagramIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <defs>
        <linearGradient id="igGradient" x1="3" y1="21" x2="21" y2="3" gradientUnits="userSpaceOnUse">
          <stop stopColor="#FEDA75" />
          <stop offset=".28" stopColor="#FA7E1E" />
          <stop offset=".5" stopColor="#D62976" />
          <stop offset=".72" stopColor="#962FBF" />
          <stop offset="1" stopColor="#4F5BD5" />
        </linearGradient>
      </defs>
      <rect x="3" y="3" width="18" height="18" rx="5" fill="url(#igGradient)" />
      <circle cx="12" cy="12" r="4" stroke="#fff" strokeWidth="1.8" />
      <circle cx="17.3" cy="6.7" r="1.25" fill="#fff" />
    </svg>
  );
}

const baseNavItems = [
  { to: '/houses', label: 'Houses' },
  { to: '/market', label: 'Prices' },
  { to: '/reports', label: 'Reports' },
  { to: '/pricing', label: 'Plans' },
  { to: '/support', label: 'Support' },
];

function cachedAdminFlag() {
  return localStorage.getItem('account_is_admin') === 'true';
}

function cachedProfile(): UserProfile | null {
  const raw = localStorage.getItem('account_profile_cache') || localStorage.getItem('user');
  if (!raw) return null;
  try {
    return JSON.parse(raw) as UserProfile;
  } catch {
    return null;
  }
}

function initialsFor(profile: UserProfile | null) {
  const name = profile?.full_name || profile?.email || 'AI';
  const parts = name.replace(/@.*/, '').split(/\s+/).filter(Boolean);
  if (parts.length >= 2) return `${parts[0][0]}${parts[1][0]}`.toUpperCase();
  return (parts[0]?.slice(0, 2) || 'AI').toUpperCase();
}

export default function AppFrame({ children }: { children: ReactNode }) {
  const location = useLocation();
  const [isAdmin, setIsAdmin] = useState(cachedAdminFlag);
  const [profile, setProfile] = useState<UserProfile | null>(cachedProfile);

  useEffect(() => {
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }, [location.pathname]);

  useEffect(() => {
    let cancelled = false;
    const token = localStorage.getItem('token');
    if (!token) return;

    api.get<AccountBootstrap>('/account/bootstrap', { params: { t: Date.now() } })
      .then(({ data }) => {
        if (cancelled) return;
        setIsAdmin(Boolean(data.is_admin));
        setProfile(data.user);
        localStorage.setItem('account_is_admin', data.is_admin ? 'true' : 'false');
        localStorage.setItem('account_profile_cache', JSON.stringify(data.user));
      })
      .catch(() => {
        // Keep navigation usable if bootstrap is temporarily unavailable.
        // Protected API calls still handle expired sessions globally.
      });

    return () => { cancelled = true; };
  }, []);

  const navItems = isAdmin ? [...baseNavItems, { to: '/admin', label: 'Admin' }] : baseNavItems;
  const profileName = profile?.full_name || profile?.email || 'Profile';

  return (
    <div className="app-frame">
      <header className="site-header">
        <div className="site-header-inner shell wide">
          <Link to="/" className="site-brand" aria-label="Go to Grocery House Manager homepage">
            <img src="/brand/grocery-house-manager-logo.png" alt="Grocery House Manager" />
            <span>
              <strong>Grocery House Manager</strong>
              <small>A SupremDas Group product</small>
            </span>
          </Link>
          <div className="site-nav-wrap">
            <nav className="site-nav" aria-label="Primary navigation">
              {navItems.map((item) => (
                <Link
                  key={item.to}
                  to={item.to}
                  className={location.pathname.startsWith(item.to) ? 'active' : ''}
                >
                  {item.label}
                </Link>
              ))}
            </nav>
            <Link
              to="/profile"
              className={`profile-orb-link ${location.pathname.startsWith('/profile') ? 'active' : ''}`}
              aria-label={`Open profile for ${profileName}`}
              title="Profile"
            >
              {profile?.avatar_url ? (
                <img src={profile.avatar_url} alt="" />
              ) : (
                <span className="ai-avatar" aria-hidden="true"><em>{initialsFor(profile)}</em></span>
              )}
            </Link>
          </div>
        </div>
      </header>

      <div className="app-main-content">{children}</div>
      <OfferCrownWidget />

      <section className="parent-company-royal" aria-label="SupremDas Group parent company">
        <div className="shell wide parent-company-inner">
          <span className="royal-crown" aria-hidden="true">♛</span>
          <div>
            <p>Built by</p>
            <h2>SupremDas Group</h2>
            <strong>Made for families, couples, and roommates</strong>
          </div>
        </div>
      </section>

      <footer className="site-footer">
        <div className="shell wide site-footer-inner">
          <div>
            <strong>Grocery House Manager</strong>
            <p>
              Smart grocery management for organized homes.
            </p>
          </div>
          <div className="footer-brand-stack" aria-label="Product details">
            <span>Product: <strong>Grocery House Manager</strong></span>
            <span>Website: <strong>grocery-house-manager.com</strong></span>
            <span>Support: <strong>Fast help for users</strong></span>
          </div>
          <div className="footer-links">
            <Link to="/about">About</Link>
            <Link to="/pricing">Plans</Link>
            <Link to="/privacy">Privacy</Link>
            <Link to="/terms">Terms</Link>
            <Link to="/refund-policy">Refunds</Link>
            <Link to="/support">Support</Link>
          </div>
          <div className="footer-contact-pills">
            <a className="contact-pill email-pill" href="mailto:support@grocery-house-manager.com"><span className="social-icon"><EmailIcon /></span><span>support@grocery-house-manager.com</span></a>
            <a className="contact-pill instagram-pill" href="https://instagram.com/groceryhousemanager" target="_blank" rel="noreferrer">
              <span className="social-icon"><InstagramIcon /></span>
              <span>@groceryhousemanager</span>
            </a>
          </div>
        </div>
      </footer>
    </div>
  );
}
