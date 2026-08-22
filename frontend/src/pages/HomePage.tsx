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
    features: ['Create houses', 'Product lookup', '2 receipt scans/month'],
    locked: ['Canadian price comparison', 'Nearby store suggestions'],
  },
  {
    key: 'family',
    name: 'Family Plus',
    price: '$4.99',
    tag: 'Best value for families',
    features: ['More houses and members', '5 receipt scans/month', 'Canadian price comparison'],
    locked: ['Advanced nearby-store tools'],
  },
  {
    key: 'pro',
    name: 'Household Pro',
    price: '$6.99',
    tag: 'For large or serious tracking',
    features: ['15 receipt scans/month', 'Nearby store suggestions', 'Advanced price history'],
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
      <section className="landing-hero shell wide premium-home-hero">
        <div className="landing-copy premium-hero-copy">
          <div className="hero-topline-row">
            <p className="eyebrow warm-eyebrow">Inventory • shopping • smart receipts • price history</p>
            <span className="hero-parent-pill">A SupremDas Group product</span>
          </div>
          <h1>Stop buying groceries you already have.</h1>
          <p className="hero-lede">
            Grocery House Manager gives your household one clean system for inventory, shopping lists,
            receipt tracking, and price awareness — so families, couples, and roommates stay organized together.
          </p>
          <div className="hero-actions big-hero-actions premium-hero-actions">
            <Link to={loggedIn ? '/houses' : '/login'} className="primary orange-cta center-link premium-cta-main">
              {loggedIn ? 'Open your dashboard' : 'Start free today'}
            </Link>
            <Link to="/pricing" className="secondary warm-secondary center-link">Compare plans</Link>
          </div>
          <div className="premium-proof-grid" aria-label="Product highlights">
            <article className="premium-proof-card">
              <strong>Shared grocery house</strong>
              <span>Inventory, receipts, and lists in one place</span>
            </article>
            <article className="premium-proof-card">
              <strong>Smart Receipt Scan</strong>
              <span>Review details before saving trusted prices</span>
            </article>
            <article className="premium-proof-card">
              <strong>Made for real households</strong>
              <span>Families, couples, roommates, and busy homes</span>
            </article>
          </div>
          <div className="hero-mini-stats">
            <div><strong>Real-time</strong><span>shared updates</span></div>
            <div><strong>JPG / PNG</strong><span>receipt upload</span></div>
            <div><strong>2 / 5 / 15</strong><span>monthly receipt scans by plan</span></div>
          </div>
        </div>

        <div className="landing-visual premium-landing-visual" aria-label="Grocery House Manager app preview">
          <div className="premium-visual-shell">
            <div className="premium-brand-ribbon">
              <img src="/brand/grocery-house-manager-icon.png" alt="Grocery House Manager icon" />
              <div>
                <strong>Grocery House Manager</strong>
                <span>Clean grocery management for organized homes</span>
              </div>
            </div>
            <div className="premium-visual-main brand-app-showcase" aria-label="Modern app preview using new Grocery House Manager branding">
              <div className="showcase-grocery-card">
                <span className="showcase-badge">Shared home</span>
                <div className="showcase-grocery-illustration">
                  <span>🥦</span><span>🥛</span><span>🍎</span><span>🍞</span>
                </div>
                <strong>Inventory ready before shopping</strong>
                <p>Everyone sees what is already at home.</p>
              </div>
              <div className="phone-preview-v65">
                <div className="phone-speaker" />
                <div className="phone-screen-v65">
                  <header>
                    <img src="/brand/grocery-house-manager-icon.png" alt="" />
                    <div><strong>Grocery House</strong><span>Manager</span></div>
                  </header>
                  <section className="phone-stat-grid-v65">
                    <div><strong>32</strong><span>Items</span></div>
                    <div><strong>12</strong><span>Low stock</span></div>
                    <div><strong>5</strong><span>Receipts</span></div>
                  </section>
                  <section className="phone-list-v65">
                    <p>Recently added</p>
                    <span><b>Milk 2%</b><em>1 L</em></span>
                    <span><b>Eggs</b><em>12 pcs</em></span>
                    <span><b>Rice</b><em>2 kg</em></span>
                  </section>
                  <footer>
                    <span>Home</span><span>List</span><span>Scan</span>
                  </footer>
                </div>
              </div>
            </div>
            <div className="premium-visual-insights">
              <article className="visual-insight-card green-card">
                <span className="mini-label">Smart receipt scan</span>
                <strong>Review before saving</strong>
                <p>Store, items, totals, and discounts stay clear before inventory updates.</p>
              </article>
              <article className="visual-insight-card navy-card">
                <span className="mini-label">Household status</span>
                <strong>32 items in stock</strong>
                <p>Low-stock reminders and shared list progress help everyone stay synced.</p>
              </article>
            </div>
          </div>
          <div className="visual-floating-card top-card premium-float-card">
            <strong>$87.64</strong>
            <span>Recent receipt total</span>
          </div>
          <div className="visual-floating-card bottom-card premium-float-card">
            <strong>Walmart</strong>
            <span>Latest price history saved</span>
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
