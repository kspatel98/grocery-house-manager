import type { ReactNode } from 'react';
import { Link, useLocation } from 'react-router-dom';

const navItems = [
  { to: '/houses', label: 'Houses' },
  { to: '/pricing', label: 'Plans' },
  { to: '/about', label: 'About' },
  { to: '/profile', label: 'Profile' },
];

export default function AppFrame({ children }: { children: ReactNode }) {
  const location = useLocation();

  return (
    <div className="app-frame">
      <header className="site-header">
        <div className="site-header-inner shell wide">
          <Link to="/houses" className="site-brand" aria-label="Grocery House Manager home">
            <img src="/brand/grocery-house-manager-logo.png" alt="Grocery House Manager" />
            <span>
              <strong>Grocery House Manager</strong>
              <small>by SupremDas Group</small>
            </span>
          </Link>
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
        </div>
      </header>

      <div className="app-main-content">{children}</div>

      <footer className="site-footer">
        <div className="shell wide site-footer-inner">
          <div>
            <strong>Grocery House Manager</strong>
            <p>A shared grocery inventory and shopping-list platform by SupremDas Group.</p>
          </div>
          <div className="footer-links">
            <Link to="/about">About</Link>
            <Link to="/pricing">Plans</Link>
            <Link to="/profile">Profile</Link>
            <a href="https://grocery-house-manager.com" target="_blank" rel="noreferrer">Website</a>
          </div>
        </div>
      </footer>
    </div>
  );
}
