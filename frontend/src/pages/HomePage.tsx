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
    text: 'Create shared lists, mark cart items, and update stock after shopping.',
  },
  {
    icon: '🧾',
    title: 'Smart Receipt Scan',
    text: 'Upload a clear JPG or PNG receipt, review extracted items, then save trusted prices.',
  },
  {
    icon: '🏷️',
    title: 'Store price history',
    text: 'Compare saved product prices by store so your household knows where items are usually cheaper.',
  },
];

const dailyMoments = [
  { icon: '🥛', title: 'Prevent duplicate buying', text: 'Check what is already in stock before buying milk, eggs, bread, snacks, or household essentials.' },
  { icon: '👨‍👩‍👧‍👦', title: 'Everyone stays updated', text: 'House members can see shopping progress, inventory changes, members, and activity in one place.' },
  { icon: '🧾', title: 'Turn receipts into history', text: 'Save reviewed receipt items, discounts, tax, and totals to build useful store-price and spending records.' },
  { icon: '📉', title: 'Spend with clarity', text: 'Premium tools help households understand prices, stores, receipts, and monthly grocery spending.' },
];

const workflow = [
  'Create your account or sign in with Google.',
  'Join a house for free by invite, or upgrade to create your own house.',
  'Add products using built-in icons, preset product images, or your own photo.',
  'Build shared shopping lists and update inventory after checkout.',
  'Scan JPG/PNG receipts, review extracted rows, and save trusted prices.',
];

const planHighlights = [
  {
    key: 'free',
    name: 'Free Starter',
    price: '$0',
    tag: 'Join invited houses',
    features: ['Join houses by invite', 'Use owner-plan house features', 'Activity and shared lists'],
    locked: ['Create own house', 'Receipt scanning', 'Price comparison'],
  },
  {
    key: 'basic',
    name: 'Basic Home',
    price: '$1.99',
    tag: 'For couples and small homes',
    features: ['Create houses', 'Product lookup', '5 receipt scans/month'],
    locked: ['Canadian price comparison', 'Nearby store suggestions'],
  },
  {
    key: 'family',
    name: 'Family Plus',
    price: '$4.99',
    tag: 'Best value for families',
    features: ['More houses and members', '20 receipt scans/month', 'Canadian price comparison'],
    locked: ['Advanced nearby-store tools'],
  },
  {
    key: 'pro',
    name: 'Household Pro',
    price: '$6.99',
    tag: 'For large or serious tracking',
    features: ['50 receipt scans/month', 'Nearby store suggestions', 'Advanced price history'],
    locked: [],
  },
];

const receiptRows = [
  ['Milk 2%', '$5.49', '—', '$10.98'],
  ['Chicken breast', '$13.50', '-$2.00', '$11.50'],
  ['Greek yogurt', '$4.99', '-$2.50', '$7.48'],
];

export default function HomePage() {
  const loggedIn = Boolean(localStorage.getItem('token'));

  return (
    <main className="marketing-page warm-marketing-page">
      <section className="landing-hero shell wide">
        <div className="landing-copy">
          <p className="eyebrow warm-eyebrow">Inventory • shopping • smart receipts • price history</p>
          <h1>Your household grocery system.</h1>
          <p className="hero-lede">
            Grocery House Manager helps families, couples, and roommates manage groceries together —
            from what is already at home to what was bought, where prices were saved, and who updated what.
          </p>
          <div className="hero-actions big-hero-actions">
            <Link to={loggedIn ? '/houses' : '/login'} className="primary orange-cta center-link">
              {loggedIn ? 'Open your dashboard' : 'Start free today'}
            </Link>
            <Link to="/pricing" className="secondary warm-secondary center-link">Compare plans</Link>
          </div>
          <div className="trust-row warm-trust-row" aria-label="Product highlights">
            <span>✓ Free invite joining</span>
            <span>✓ Shared shopping</span>
            <span>✓ JPG/PNG receipt scanning</span>
            <span>✓ Price tools by plan</span>
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
          <h2>Everything is placed where everyday users expect it.</h2>
          <p>Houses, inventory, shopping, receipts, members, activity, and plan access are easy to reach without technical confusion.</p>
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

      <section className="shell wide marketing-split panel warm-split-panel home-receipt-split">
        <div>
          <p className="eyebrow warm-eyebrow">Smart Receipt Scan</p>
          <h2>Scan the receipt, review the details, then save trusted prices.</h2>
          <p>
            Upload a clear JPG or PNG receipt photo. The app prepares store, item, discount, tax, subtotal,
            and total fields for review before anything updates inventory or price history.
          </p>
          <ul className="home-check-list">
            <li>JPG and PNG receipt photos only</li>
            <li>Review required before saving</li>
            <li>Discounts and totals stay visible</li>
            <li>Saved rows build household price history</li>
          </ul>
        </div>
        <div className="receipt-preview-panel" aria-label="Example receipt review card">
          <div className="receipt-preview-header">
            <div>
              <span className="mini-label">Store</span>
              <strong>Walmart Supercentre</strong>
            </div>
            <span className="receipt-status-chip">Review ready</span>
          </div>
          <div className="receipt-preview-meta">
            <span><small>Date</small> Jul 23, 2026</span>
            <span><small>Discounts</small> -$4.50</span>
            <span><small>Total</small> $50.83</span>
          </div>
          <div className="receipt-preview-table">
            <div className="receipt-preview-row head"><span>Item</span><span>Price</span><span>Discount</span><span>Line</span></div>
            {receiptRows.map(([item, price, discount, line]) => (
              <div className="receipt-preview-row" key={item}>
                <span>{item}</span>
                <span>{price}</span>
                <span className={discount === '—' ? 'muted-cell' : 'discount-cell'}>{discount}</span>
                <span>{line}</span>
              </div>
            ))}
          </div>
          <div className="receipt-preview-actions">
            <span>✓ Save after review</span>
            <span>✎ Edit wrong rows</span>
          </div>
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
          <h2>Small features that make the app useful every day.</h2>
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
            update the cart, review receipt prices, and keep everyone in the loop.
          </p>
          <Link to={loggedIn ? '/houses' : '/login'} className="primary orange-cta center-link split-cta">
            {loggedIn ? 'Go to dashboard' : 'Create your account'}
          </Link>
        </div>
        <ol className="workflow-list warm-workflow-list">
          {workflow.map((step) => <li key={step}>{step}</li>)}
        </ol>
      </section>

      <section className="shell wide marketing-section home-plan-section">
        <div className="section-heading centered">
          <p className="eyebrow warm-eyebrow">Clear plan access</p>
          <h2>Users can see what is unlocked and what needs an upgrade.</h2>
          <p>Free users can join by invite. Paid plans unlock owned houses, Smart Receipt Scan, product lookup, Canadian price comparison, and advanced price tools.</p>
        </div>
        <div className="home-plan-grid">
          {planHighlights.map((plan) => (
            <article className={`home-plan-card home-plan-${plan.key}`} key={plan.name}>
              <div className="home-plan-header">
                <span>{plan.name}</span>
                <strong>{plan.price}</strong>
              </div>
              <p>{plan.tag}</p>
              <div className="home-plan-feature-list">
                {plan.features.map((feature) => <span className="unlocked-feature" key={feature}>✓ {feature}</span>)}
                {plan.locked.map((feature) => <span className="locked-feature" key={feature}>🔒 {feature}</span>)}
              </div>
            </article>
          ))}
        </div>
        <div className="centered plan-section-actions">
          <Link to="/pricing" className="primary orange-cta center-link">See full plan comparison</Link>
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
