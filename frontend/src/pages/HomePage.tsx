import { Link } from 'react-router-dom';

const featureCards = [
  {
    icon: '🏠',
    title: 'Shared household inventory',
    text: 'Create a house, invite family members or roommates, and keep grocery products organized by custom sections.',
  },
  {
    icon: '🛒',
    title: 'Multiple shopping lists',
    text: 'Build lists from inventory, set shopping-only quantities, add notes, check items into cart, and update inventory when shopping is done.',
  },
  {
    icon: '🧾',
    title: 'Receipts and price history',
    text: 'Attach receipt photos or PDFs, record store prices, and keep one product with prices from different stores.',
  },
  {
    icon: '⚡',
    title: 'Real-time collaboration',
    text: 'Members see changes, activity, shopping progress, and owner-controlled house features without needing manual refreshes.',
  },
];

const workflow = [
  'Create your account or sign in with Google.',
  'Join a house by invite, or upgrade to create your own household workspace.',
  'Add products, sections, stores, prices, expiry dates, and low-stock thresholds.',
  'Create one or more shopping lists and shop together in real time.',
  'Upload receipts or enter bought prices to update inventory and compare stores.',
];

const premiumTools = [
  'Receipt uploads and OCR-assisted scanning',
  'Store-specific price history for every product',
  'Personal receipt tracker and spending summary',
  'Best-store comparison for smarter shopping',
  'Owner-plan based house features for shared homes',
  'Private coupons and transparent subscription billing',
];

export default function HomePage() {
  const loggedIn = Boolean(localStorage.getItem('token'));

  return (
    <main className="marketing-page">
      <section className="marketing-hero shell wide">
        <div className="marketing-hero-copy">
          <p className="eyebrow">Household grocery management, simplified</p>
          <h1>Manage groceries together instead of using scattered notes, messages, and forgotten lists.</h1>
          <p className="hero-lede">
            Grocery House Manager helps households organize inventory, plan shopping, upload receipts,
            track store prices, and collaborate in real time from one clean dashboard.
          </p>
          <div className="hero-actions">
            <Link to={loggedIn ? '/houses' : '/login'} className="primary center-link">
              {loggedIn ? 'Open your houses' : 'Get started free'}
            </Link>
            <Link to="/pricing" className="secondary center-link">View plans</Link>
          </div>
          <div className="trust-row" aria-label="Product highlights">
            <span>Free invite joining</span>
            <span>Stripe subscriptions</span>
            <span>Google login</span>
            <span>Real-time updates</span>
          </div>
        </div>
        <div className="hero-product-card" aria-label="Grocery House Manager preview">
          <img src="/brand/grocery-house-manager-logo.png" alt="Grocery House Manager" />
          <div className="mini-dashboard">
            <div><strong>Milk bags</strong><span>Walmart • $5.49</span></div>
            <div><strong>Apples</strong><span>No Frills • $3.99</span></div>
            <div><strong>Greek yogurt</strong><span>Costco • $7.99</span></div>
          </div>
          <p>Inventory, shopping lists, receipts, members, and activity in one household workspace.</p>
        </div>
      </section>

      <section className="shell wide marketing-section">
        <div className="section-heading centered">
          <p className="eyebrow">What it does</p>
          <h2>Everything your household needs before, during, and after grocery shopping.</h2>
        </div>
        <div className="marketing-feature-grid">
          {featureCards.map((feature) => (
            <article className="panel marketing-feature-card" key={feature.title}>
              <span className="feature-icon">{feature.icon}</span>
              <h3>{feature.title}</h3>
              <p>{feature.text}</p>
            </article>
          ))}
        </div>
      </section>

      <section className="shell wide marketing-split panel">
        <div>
          <p className="eyebrow">Simple workflow</p>
          <h2>Designed so every household member can understand it quickly.</h2>
          <p>
            The app keeps common actions close together: houses, inventory, shopping, receipts,
            members, and activities are arranged around the way people actually shop.
          </p>
          <Link to={loggedIn ? '/houses' : '/login'} className="primary center-link split-cta">
            {loggedIn ? 'Go to dashboard' : 'Create your account'}
          </Link>
        </div>
        <ol className="workflow-list">
          {workflow.map((step) => <li key={step}>{step}</li>)}
        </ol>
      </section>

      <section className="shell wide marketing-section">
        <div className="section-heading centered">
          <p className="eyebrow">Premium value</p>
          <h2>Paid plans unlock more than just higher limits.</h2>
          <p>Members can use house features based on the owner’s plan, while their own plan unlocks personal tools and insights.</p>
        </div>
        <div className="premium-tools-grid">
          {premiumTools.map((tool) => <div className="premium-tool" key={tool}>✓ {tool}</div>)}
        </div>
      </section>

      <section className="shell wide marketing-cta panel">
        <div>
          <h2>Start with invite joining for free. Upgrade when you are ready to create your own house.</h2>
          <p>Basic Home, Family Plus, and Household Pro are designed to be affordable for real households.</p>
        </div>
        <div className="hero-actions">
          <Link to="/pricing" className="primary center-link">Compare plans</Link>
          <Link to="/about" className="secondary center-link">Learn more</Link>
        </div>
      </section>
    </main>
  );
}
