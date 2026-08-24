import type { ReactNode } from 'react';
import { useEffect, useRef, useState } from 'react';
import { Link, useLocation } from 'react-router-dom';

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

const publicNavItems = [
  { to: '/', label: 'Home' },
  { to: '/pricing', label: 'Plans' },
  { to: '/about', label: 'About' },
  { to: '/support', label: 'Support' },
];

export default function PublicFrame({ children }: { children: ReactNode }) {
  const location = useLocation();
  const loggedIn = Boolean(localStorage.getItem('token'));
  const siteHeaderRef = useRef<HTMLElement>(null);
  const [siteHeaderHeight, setSiteHeaderHeight] = useState(0);

  useEffect(() => {
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }, [location.pathname]);

  useEffect(() => {
    const header = siteHeaderRef.current;
    if (!header) return;

    const syncHeaderHeight = () => {
      setSiteHeaderHeight(Math.ceil(header.getBoundingClientRect().height));
    };

    syncHeaderHeight();
    const observer = typeof ResizeObserver !== 'undefined' ? new ResizeObserver(syncHeaderHeight) : null;
    observer?.observe(header);
    window.addEventListener('resize', syncHeaderHeight);
    window.addEventListener('orientationchange', syncHeaderHeight);

    return () => {
      observer?.disconnect();
      window.removeEventListener('resize', syncHeaderHeight);
      window.removeEventListener('orientationchange', syncHeaderHeight);
    };
  }, []);

  return (
    <div className="app-frame public-frame">
      <header ref={siteHeaderRef} className="site-header public-site-header">
        <div className="site-header-inner shell wide">
          <Link to="/" className="site-brand" aria-label="Go to Grocery House Manager homepage">
            <img src="/brand/grocery-house-manager-logo.png" alt="Grocery House Manager" />
            <span>
              <strong>Grocery House Manager</strong>
              <small>A SupremDas Group product</small>
            </span>
          </Link>
          <nav className="site-nav" aria-label="Public navigation">
            {publicNavItems.map((item) => (
              <Link
                key={item.to}
                to={item.to}
                className={location.pathname === item.to ? 'active' : ''}
              >
                {item.label}
              </Link>
            ))}
            <Link to={loggedIn ? '/houses' : '/login'} className="nav-cta">
              {loggedIn ? 'Open app' : 'Login'}
            </Link>
          </nav>
        </div>
      </header>
      <div
        className="site-header-mobile-spacer"
        style={siteHeaderHeight ? { height: `${siteHeaderHeight}px` } : undefined}
        aria-hidden="true"
      />

      <div className="app-main-content">{children}</div>

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

      <footer className="site-footer public-footer">
        <div className="shell wide site-footer-inner">
          <div>
            <strong>Grocery House Manager</strong>
            <p>Smart grocery management for organized homes.</p>
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
