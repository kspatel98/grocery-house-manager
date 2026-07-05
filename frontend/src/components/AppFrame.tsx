import type { ReactNode } from 'react';
import { Link, useLocation } from 'react-router-dom';

const navItems = [
  { to: '/houses', label: 'Houses' },
  { to: '/pricing', label: 'Plans' },
  { to: '/about', label: 'About' },
  { to: '/support', label: 'Support' },
  { to: '/profile', label: 'Profile' },
];

export default function AppFrame({ children }: { children: ReactNode }) {
  const location = useLocation();

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
            <p>
              A household grocery inventory and shopping-list SaaS product from SupremDas Group.
            </p>
          </div>
          <div className="footer-brand-stack" aria-label="Company and product">
            <span>Company: <strong>SupremDas Group</strong></span>
            <span>Product: <strong>Grocery House Manager</strong></span>
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
