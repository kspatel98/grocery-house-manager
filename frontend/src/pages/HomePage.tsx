import { Link } from 'react-router-dom';

const featureCards = [
  {
    icon: '🏠',
    title: 'Shared inventory',
    text: 'Know what is already at home before anyone goes shopping.',
  },
  {
    icon: '🛒',
    title: 'Shopping lists',
    text: 'Create multiple lists, check items into cart, and update stock after shopping.',
  },
  {
    icon: '🧾',
    title: 'Receipts & spend',
    text: 'Upload receipts, track spending, and keep grocery records in one place.',
  },
  {
    icon: '🏷️',
    title: 'Store prices',
    text: 'Save different prices for the same product at different stores.',
  },
];

const dailyMoments = [
  { icon: '🥛', title: 'Never buy duplicates', text: 'Check inventory before buying milk, eggs, bread, snacks, or household essentials.' },
  { icon: '👨‍👩‍👧‍👦', title: 'Everyone stays updated', text: 'House members can see changes, shopping progress, and activity in real time.' },
  { icon: '📸', title: 'Smarter receipts', text: 'Attach receipt photos/PDFs and keep price history connected to products.' },
  { icon: '📉', title: 'Spend with clarity', text: 'Personal insights help premium members understand receipts, prices, stores, and spend.' },
];

const workflow = [
  'Create your account or sign in with Google.',
  'Join a house for free by invite, or upgrade to create your own house.',
  'Add products using built-in icons, preset product images, or your own resized image.',
  'Plan shopping together and update inventory after checkout.',
  'Upload receipts and compare store prices over time.',
];

const premiumTools = [
  'Receipt photo/PDF upload and OCR-assisted scanning',
  'Store-specific price history for every product',
  'Personal receipt tracker and spending summary',
  'Best-store comparison for smarter shopping',
  'Low-stock and expiry reminders for household planning',
  'Private coupons, launch offers, and transparent billing',
];

export default function HomePage() {
  const loggedIn = Boolean(localStorage.getItem('token'));

  return (
    <main className="marketing-page warm-marketing-page">
      <section className="landing-hero shell wide">
        <div className="landing-copy">
          <p className="eyebrow warm-eyebrow">Inventory • lists • receipts • store prices</p>
          <h1>Your household grocery system.</h1>
          <p className="hero-lede">
            Grocery House Manager helps families, couples, and roommates manage groceries together —
            from what is already at home to what was bought, where it was cheaper, and who updated what.
          </p>
          <div className="hero-actions big-hero-actions">
            <Link to={loggedIn ? '/houses' : '/login'} className="primary orange-cta center-link">
              {loggedIn ? 'Open your dashboard' : 'Start free today'}
            </Link>
            <Link to="/pricing" className="secondary warm-secondary center-link">View plans</Link>
          </div>
          <div className="trust-row warm-trust-row" aria-label="Product highlights">
            <span>✓ Free invite joining</span>
            <span>✓ Shared shopping</span>
            <span>✓ Receipt tracking</span>
            <span>✓ Real-time updates</span>
          </div>
        </div>

        <div className="landing-visual" aria-label="Grocery House Manager app preview">
          <img src="/brand/homepage-grocery-ad.webp" alt="Family using Grocery House Manager on a phone" />
          <div className="visual-floating-card top-card">
            <strong>32</strong>
            <span>Items in stock</span>
          </div>
          <div className="visual-floating-card bottom-card">
            <strong>$87.64</strong>
            <span>Receipt tracked</span>
          </div>
        </div>
      </section>

      <section className="shell wide marketing-section quick-benefits-section">
        <div className="section-heading centered">
          <p className="eyebrow warm-eyebrow">Built for real grocery habits</p>
          <h2>Everything is placed where normal users expect it.</h2>
          <p>Houses, inventory, shopping, receipts, members, and activity are easy to reach without technical confusion.</p>
        </div>
        <div className="marketing-feature-grid visual-feature-grid">
          {featureCards.map((feature) => (
            <article className="panel marketing-feature-card warm-feature-card" key={feature.title}>
              <span className="feature-icon round-icon">{feature.icon}</span>
              <h3>{feature.title}</h3>
              <p>{feature.text}</p>
            </article>
          ))}
        </div>
      </section>

      <section className="shell wide app-preview-strip panel">
        <div>
          <p className="eyebrow warm-eyebrow">Easy product setup</p>
          <h2>Add products faster with built-in icons, preset product images, or your own photo.</h2>
          <p>
            Product images automatically resize and fit inside cards, so inventory stays clean even when images come from different sources.
          </p>
        </div>
        <div className="product-icon-preview" aria-label="Built-in product image examples">
          {['milk', 'apple', 'bread', 'vegetables', 'eggs', 'snacks'].map((name) => (
            <img key={name} src={`/product-icons/${name}.svg`} alt={`${name} icon`} />
          ))}
        </div>
      </section>

      <section className="shell wide marketing-section">
        <div className="section-heading centered">
          <p className="eyebrow warm-eyebrow">Daily value</p>
          <h2>Small features that make the app feel useful every day.</h2>
        </div>
        <div className="daily-moments-grid">
          {dailyMoments.map((item) => (
            <article className="daily-moment-card" key={item.title}>
              <span>{item.icon}</span>
              <h3>{item.title}</h3>
              <p>{item.text}</p>
            </article>
          ))}
        </div>
      </section>

      <section className="shell wide marketing-split panel warm-split-panel">
        <div>
          <p className="eyebrow warm-eyebrow">Simple workflow</p>
          <h2>Designed so every household member can understand it quickly.</h2>
          <p>
            The app follows the way people shop: check inventory, build a list, shop together,
            update the cart, save receipt prices, and keep everyone in the loop.
          </p>
          <Link to={loggedIn ? '/houses' : '/login'} className="primary orange-cta center-link split-cta">
            {loggedIn ? 'Go to dashboard' : 'Create your account'}
          </Link>
        </div>
        <ol className="workflow-list warm-workflow-list">
          {workflow.map((step) => <li key={step}>{step}</li>)}
        </ol>
      </section>

      <section className="shell wide marketing-section">
        <div className="section-heading centered">
          <p className="eyebrow warm-eyebrow">Premium value</p>
          <h2>Paid plans unlock more than higher limits.</h2>
          <p>House members share the owner’s house features, while their own plan unlocks personal tools and insights.</p>
        </div>
        <div className="premium-tools-grid premium-warm-grid">
          {premiumTools.map((tool) => <div className="premium-tool" key={tool}>✓ {tool}</div>)}
        </div>
      </section>

      <section className="shell wide marketing-cta panel warm-marketing-cta">
        <div>
          <h2>Start free. Upgrade when your household is ready.</h2>
          <p>Free users can join by invite. Paid plans help you create and manage your own household grocery system.</p>
        </div>
        <div className="hero-actions">
          <Link to="/pricing" className="primary orange-cta center-link">Compare plans</Link>
          <Link to="/about" className="secondary center-link">Learn more</Link>
        </div>
      </section>
    </main>
  );
}
