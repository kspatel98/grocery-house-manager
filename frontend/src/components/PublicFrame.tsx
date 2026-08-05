import type { ReactNode } from 'react';
import { useEffect } from 'react';
import { Link, useLocation } from 'react-router-dom';

const publicNavItems = [
  { to: '/', label: 'Home' },
  { to: '/pricing', label: 'Plans' },
  { to: '/about', label: 'About' },
  { to: '/support', label: 'Support' },
];

export default function PublicFrame({ children }: { children: ReactNode }) {
  const location = useLocation();
  const loggedIn = Boolean(localStorage.getItem('token'));

  useEffect(() => {
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }, [location.pathname]);

  return (
    <div className="app-frame public-frame">
      <header className="site-header public-site-header">
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

      <div className="app-main-content">{children}</div>

      <footer className="site-footer public-footer">
        <div className="shell wide site-footer-inner">
          <div>
            <strong>Grocery House Manager</strong>
            <p>Smart grocery management for organized homes.</p>
          </div>
          <div className="footer-brand-stack" aria-label="Company and product">
            <span>Built by <strong>SupremDas Group</strong></span>
            <span>Made for <strong>families, couples, and roommates</strong></span>
            <span>Website: <strong>grocery-house-manager.com</strong></span>
          </div>
          <div className="footer-links">
            <Link to="/about">About</Link>
            <Link to="/pricing">Plans</Link>
            <Link to="/privacy">Privacy</Link>
            <Link to="/terms">Terms</Link>
            <Link to="/refund-policy">Refunds</Link>
            <Link to="/support">Support</Link>
          </div>
        </div>
      </footer>
    </div>
  );
}
