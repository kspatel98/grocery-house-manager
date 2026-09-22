import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../api';
import type { SiteReviewSummary } from '../types';

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
    title: 'GHM Autopilot',
    text: 'Connect inventory, meals, receipts, expiry, price history and shopping into one household action plan.',
  },
];

const dailyMoments = [
  { icon: '🥛', title: 'Prevent duplicate buying', text: 'Check what is already in stock before buying milk, eggs, bread, snacks, or household essentials.' },
  { icon: '👨‍👩‍👧‍👦', title: 'Everyone stays updated', text: 'House members can see shopping progress, inventory changes, members, and activity in one place.' },
  { icon: '🧾', title: 'Turn receipts into history', text: 'Save reviewed receipt items, discounts, tax, and totals to build useful store-price and spending records.' },
  { icon: '📉', title: 'Know if the app pays for itself', text: 'The Savings Ledger separates evidence-backed savings from opportunities so you can see exactly what the app has proven.' },
];

const workflow = [
  'Create your account or sign in with Google.',
  'Create one starter house for free, or join another house by invite.',
  'Add products using built-in icons, preset product images, or your own photo.',
  'Build shared shopping lists and update inventory after checkout.',
  'Scan JPG/PNG receipts, review extracted rows, and save trusted prices.',
];

const planHighlights = [
  {
    key: 'free',
    name: 'Free Starter',
    price: '$0 CAD',
    annual: 'No card required',
    tag: 'Start a real house for free',
    features: ['Create 1 house', '40 products', 'Food Recall Guardian', 'Savings Ledger'],
    locked: ['Receipt Guardian', 'Autopilot weekly planning', 'Automatic Trip Check'],
  },
  {
    key: 'basic',
    name: 'Basic Home',
    price: '$1.99/mo CAD',
    annual: '$17.99/year CAD',
    tag: 'For couples and small homes',
    features: ['2 receipt scans/month', 'Receipt Guardian', 'Private price memory'],
    locked: ['Weekly Planner + Budget Rescue', 'Automatic Trip Check', 'Kitchen Check'],
  },
  {
    key: 'family',
    name: 'Family Plus',
    price: '$4.99/mo CAD',
    annual: '$39.99/year CAD',
    tag: 'MOST POPULAR • best value',
    features: ['Autopilot Weekly Planner + Budget Rescue', 'Automatic Trip Check', 'Smart stock-up intelligence', '5 receipt scans/month'],
    locked: ['Kitchen Check Beta'],
  },
  {
    key: 'pro',
    name: 'Household Pro',
    price: '$6.99/mo CAD',
    annual: '$59.99/year CAD',
    tag: 'For large or serious tracking',
    features: ['Everything in Family Plus', 'Kitchen Check Beta', '15 receipt scans/month', 'Nearby store + deep household intelligence'],
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
  const [community, setCommunity] = useState<SiteReviewSummary | null>(null);

  useEffect(() => {
    api.get<SiteReviewSummary>('/reviews/summary', { params: { t: Date.now() } })
      .then(({ data }) => setCommunity(data))
      .catch(() => setCommunity(null));
  }, []);

  return (
    <main className="marketing-page warm-marketing-page">
      <section className="landing-hero shell wide premium-home-hero">
        <div className="landing-copy premium-hero-copy">
          <div className="hero-topline-row">
            <p className="eyebrow warm-eyebrow">Inventory • Autopilot • money protection • meals</p>
            <span className="hero-parent-pill">A SupremDas Group product</span>
          </div>
          <h1>What if your home already knew what it needed?</h1>
          <p className="hero-lede">
            Grocery House Manager connects what you own, what is expiring, what your household usually buys, what stores charge, and what your receipts prove. GHM Autopilot turns that data into the next useful decision — before you spend money.
          </p>
          <div className="hero-actions big-hero-actions premium-hero-actions">
            <Link to={loggedIn ? '/houses' : '/login'} className="primary orange-cta center-link premium-cta-main">
              {loggedIn ? 'Open your dashboard' : 'Start free today'}
            </Link>
            <Link to="/pricing" className="secondary warm-secondary center-link">Compare plans</Link>
          </div>
          {!loggedIn && <p className="hero-free-proof">No card required • 1 starter house • 40 products • 1 shared list</p>}
          <div className="premium-proof-grid" aria-label="Product highlights">
            <article className="premium-proof-card">
              <strong>GHM Autopilot</strong>
              <span>One intelligence across inventory, meals, trips and receipts</span>
            </article>
            <article className="premium-proof-card">
              <strong>Money protection</strong>
              <span>Trip decisions, Receipt Guardian and evidence-backed savings</span>
            </article>
            <article className="premium-proof-card">
              <strong>Safety stays useful</strong>
              <span>Food Recall Guardian remains available on Free Starter</span>
            </article>
          </div>
          <div className="hero-mini-stats">
            <div><strong>1 free house</strong><span>build a real routine first</span></div>
            <div><strong>Installable</strong><span>phone-first PWA experience</span></div>
            <div><strong>CAD</strong><span>clear Canadian plan pricing</span></div>
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
            <div className="premium-visual-main premium-app-showcase">
              <div className="premium-phone-shell" aria-label="Grocery House Manager app preview">
                <div className="phone-status-row"><span>9:41</span><span>● ● ●</span></div>
                <div className="phone-app-header">
                  <img src="/brand/grocery-house-manager-icon.png" alt="" />
                  <div><strong>Grocery House</strong><small>Manager</small></div>
                </div>
                <div className="phone-stat-grid">
                  <span><strong>32</strong><small>items</small></span>
                  <span><strong>8</strong><small>low stock</small></span>
                  <span><strong>5</strong><small>lists</small></span>
                </div>
                <div className="phone-list-card polished-shopping-preview">
                  <div className="phone-shopping-heading">
                    <div><strong>Saturday shopping</strong><small>4 items • 1 in cart</small></div>
                    <span className="phone-list-progress">25%</span>
                  </div>
                  <div className="phone-shopping-progress"><span /></div>
                  <div className="phone-shopping-row in-cart">
                    <span className="phone-item-icon">🥛</span>
                    <span className="phone-item-copy"><strong>Milk 2%</strong><small>2 × 2 L</small></span>
                    <span className="phone-item-state">In cart</span>
                  </div>
                  <div className="phone-shopping-row">
                    <span className="phone-item-icon">🥚</span>
                    <span className="phone-item-copy"><strong>Large eggs</strong><small>1 dozen</small></span>
                    <span className="phone-item-add">+</span>
                  </div>
                  <div className="phone-shopping-row">
                    <span className="phone-item-icon">🍚</span>
                    <span className="phone-item-copy"><strong>Basmati rice</strong><small>1 bag</small></span>
                    <span className="phone-item-add">+</span>
                  </div>
                </div>
                <div className="phone-receipt-card">
                  <span>Receipt scan</span>
                  <strong>Review ready</strong>
                </div>
              </div>
              <div className="premium-grocery-orbit">
                <img src="/product-icons/milk.svg" alt="Milk" />
                <img src="/product-icons/vegetables.svg" alt="Vegetables" />
                <img src="/product-icons/bread.svg" alt="Bread" />
                <img src="/product-icons/eggs.svg" alt="Eggs" />
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
            <span>Latest prices remembered</span>
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
            and total fields for review before anything updates inventory or saves the prices you paid.
          </p>
          <ul className="home-check-list">
            <li>JPG and PNG receipt photos only</li>
            <li>Review required before saving</li>
            <li>Discounts and totals stay visible</li>
            <li>Reviewed rows remember what your household paid</li>
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

      <section className="shell wide marketing-section smart-assistant-marketing">
        <div className="smart-assistant-marketing-copy">
          <p className="eyebrow warm-eyebrow">GHM AUTOPILOT · HOUSEHOLD GROCERY CFO</p>
          <h2>Don't manage groceries. Review the decisions that matter.</h2>
          <p>Autopilot connects low stock, expiry dates, meal possibilities, days at home, your active list, receipt review signals, saved prices and verified savings. It prepares the week, protects the checkout, and shows the evidence instead of burying users in dashboards.</p>
          <div className="assistant-marketing-flow">
            <span><strong>1</strong> Use what should be used soon</span>
            <span><strong>2</strong> Plan only the days you eat at home</span>
            <span><strong>3</strong> Optimize the trip before spending</span>
            <span><strong>4</strong> Verify the value after checkout</span>
          </div>
          <Link to={loggedIn ? '/assistant' : '/login'} className="primary center-link">{loggedIn ? 'Open GHM Autopilot' : 'Start building your household'}</Link>
        </div>
        <div className="smart-assistant-demo">
          <span className="assistant-demo-kicker">YOUR WEEK IS READY</span>
          <h3>5 dinners · 3 use-soon ingredients · 8 groceries needed</h3>
          <div className="assistant-demo-items"><span>⏳ Use spinach tonight</span><span>🍛 4 meals from home</span><span>🛒 8 missing items</span><span>🧾 1 receipt to review</span></div>
          <div className="assistant-demo-store"><div><small>Known grocery cost</small><strong>Current plan</strong></div><strong>$42.60</strong></div>
          <div className="assistant-demo-saving"><span>Open savings opportunity</span><strong>$9.20</strong></div>
          <small>Illustrative preview. Real Autopilot totals use your saved data; unknown prices stay visibly unpriced rather than being guessed.</small>
        </div>
      </section>

      <section className="shell wide marketing-section home-plan-section">
        <div className="section-heading centered">
          <p className="eyebrow warm-eyebrow">Clear plan access</p>
          <h2>Pay for work the app removes — not a longer feature list.</h2>
          <p>Free Starter stays genuinely useful. Basic adds receipt intelligence. Family Plus unlocks the core Autopilot planning, trip and stock-up automation. Household Pro adds the most advanced camera and nearby-store tools.</p>
        </div>
        <div className="home-plan-grid">
          {planHighlights.map((plan) => (
            <article className={`home-plan-card home-plan-${plan.key}`} key={plan.name}>
              <div className="home-plan-header">
                <span>{plan.name}</span>
                <strong>{plan.price}</strong>
              </div>
              <small className="home-plan-annual">{plan.annual}</small>
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

      <section className="shell wide marketing-section trust-conversion-section">
        <div className="section-heading centered">
          <p className="eyebrow warm-eyebrow">Trust before flash</p>
          <h2>Your household data should feel useful, understandable, and under control.</h2>
          <p>Premium celebrations can be fun, but the product itself stays grounded in reviewable data, transparent savings estimates, and clear billing.</p>
        </div>
        {community && community.total_users > 0 ? (
          <div className="public-live-trust" aria-label="Live Grocery House Manager community snapshot">
            <span><strong>{community.total_users}</strong><small>registered users</small></span>
            {community.review_count > 0 ? <span><strong>{community.average_rating.toFixed(1)} ★</strong><small>{community.review_count} public review{community.review_count === 1 ? '' : 's'}</small></span> : null}
            <span><strong>{community.new_users_this_month}</strong><small>new this month</small></span>
            {community.best_positive_comment ? <blockquote>“{community.best_positive_comment}”{community.best_reviewer_name ? <cite>— {community.best_reviewer_name}</cite> : null}</blockquote> : null}
          </div>
        ) : null}
        <div className="trust-conversion-grid">
          <article><img src="/brand/grocery-house-manager-stripe-logo.png" alt="Stripe secured payments" /><strong>Stripe billing</strong><p>Subscription checkout and billing management use Stripe. Renewal dates and amounts are shown in Profile when available.</p></article>
          <article><span>🧾</span><strong>Review before saving</strong><p>Receipt extraction is never treated as unquestionable. Store, items, discounts, taxes, and totals remain reviewable before inventory changes.</p></article>
          <article><span>📉</span><strong>No invented savings</strong><p>The savings report only counts recorded discounts and supported lower-price choices. If there is not enough data, it says so.</p></article>
          <article><span>📲</span><strong>Phone-first</strong><p>Install the web app from your Home Screen. After a shopping list loads once, the latest snapshot remains available as an offline fallback.</p></article>
        </div>
      </section>

      <section className="shell wide marketing-cta panel warm-marketing-cta">
        <div>
          <h2>Start free. Pay when Autopilot is doing real work for your household.</h2>
          <p>Free Starter keeps the core household useful. Upgrade when Receipt Guardian, weekly planning, Budget Rescue, Automatic Trip Check, smart stock-up or Kitchen Check begin saving enough time and money to justify it.</p>
        </div>
        <div className="hero-actions">
          <Link to="/pricing" className="primary orange-cta center-link">Compare plans</Link>
          <Link to="/about" className="secondary center-link">Learn more</Link>
        </div>
      </section>
    </main>
  );
}
