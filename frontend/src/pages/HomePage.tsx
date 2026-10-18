import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../api';
import PageMeta from '../components/PageMeta';
import HouseholdWorld from '../components/HouseholdWorld';
import type { SiteReviewSummary } from '../types';

const outcomeCards = [
  {icon: '📝', title: 'Turn paper grocery lists into shared shopping.', text: 'Scan handwritten or printed grocery lists and review items before adding to Shopping Lists.', link:'/handwritten-grocery-list-scanner', cta:'See handwritten list scanning'},
  {
    icon: '🧾',
    title: 'Scan once. Reuse the information.',
    text: 'A reviewed receipt can feed inventory, household spending, price memory and future shopping decisions without re-entering the same trip.',
    link: '/receipt-scanner',
    cta: 'See receipt scanning',
  },
  {
    icon: '🍲',
    title: 'Know what you have—and what you can make.',
    text: 'GHM connects inventory with Cook from Home so meal ideas can reflect what is actually available and what is still missing.',
    link: '/meal-planning',
    cta: 'See meals & recipes',
  },
  {
    icon: '🛒',
    title: 'Know what to buy and what it may cost.',
    text: 'Shared lists, saved prices, receipts and supported live signals help prepare the next trip without making you compare everything manually.',
    link: '/grocery-price-intelligence',
    cta: 'See smarter shopping',
  },
];

const loop = [
  ['🧾', 'Receipts', 'What entered the home'],
  ['👁️', 'Kitchen scans', 'What appears to remain'],
  ['🍲', 'Meals', 'What is being used'],
  ['🛒', 'Shopping', 'What your household chooses'],
  ['✦', 'GHM intelligence', 'What deserves attention next'],
];

const scenarios = [
  {
    label: 'FAMILY',
    icon: '🏠',
    title: 'Less waste. Less remembering.',
    text: 'A receipt updates household context, use-before-expiry food shapes meals, likely shortages reach the shopping list, and everyone sees the same plan.',
    link: '/families',
  },
  {
    label: 'ROOMMATES',
    icon: '👥',
    title: 'Shared when it should be. Personal when it should not.',
    text: 'Coordinate staples and lists while keeping personal products, custom expense participation and reimbursements understandable.',
    link: '/roommates',
  },
  {
    label: 'COUPLES',
    icon: '♥',
    title: 'One household picture for two people.',
    text: 'Plan meals from what is already home, avoid duplicate shopping and choose between lower-cost and preferred-store options together.',
    link: '/couples',
  },
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
    <main className="marketing-page v96-public-home">
      <PageMeta
        title="Grocery House Manager | A smarter household grocery system"
        description="GHM connects inventory, receipts, Kitchen Vision, meals, shopping, prices and household spending so families, couples and roommates can review the decisions that matter instead of managing everything manually."
      />

      <section className="v96-public-hero shell wide">
        <div className="v96-public-hero-copy">
          <p className="eyebrow">YOUR HOUSEHOLD GROCERIES · ONE CONNECTED PLACE</p>
          <h1>Know what your home has, needs, buys, cooks and spends.</h1>
          <p className="v96-public-hero-lede">GHM connects receipts, inventory, shopping, meals and household spending so your normal grocery routine creates less manual work—not more.</p>
          <div className="v96-public-hero-actions">
            <Link className="primary center-link" to={loggedIn ? '/houses' : '/login'}>{loggedIn ? 'Open GHM' : 'Start your household'}</Link>
            <Link className="secondary center-link" to="/how-it-works">See how GHM works</Link>
          </div>
          {!loggedIn ? <small className="v96-no-card">Start on Free Starter · No card required</small> : null}
          <div className="v96-confidence-row" aria-label="GHM evidence language">
            <span><b>✓</b><small>Verified</small></span>
            <span><b>◇</b><small>Estimated</small></span>
            <span><b>✦</b><small>Prediction</small></span>
            <span><b>?</b><small>Needs review</small></span>
          </div>
          <div className="v128-simple-loop" aria-label="How GHM works">
            <span><b>1 · Scan or add</b><small>Give GHM a real household signal.</small></span>
            <span><b>2 · Know</b><small>See what the household already has.</small></span>
            <span><b>3 · Plan</b><small>Turn inventory into meals and a useful list.</small></span>
            <span><b>4 · Save time</b><small>Reuse receipts, prices and household history automatically.</small></span>
          </div>
        </div>

        <HouseholdWorld variant="public" />
      </section>

      <section className="v96-outcome-section shell wide">
        <header className="v96-section-intro"><p className="eyebrow">WHAT GHM DOES FOR THE HOUSEHOLD</p><h2>Do less grocery administration.</h2><p>Start with a real household action. GHM connects the useful parts behind it instead of making you learn every feature first.</p></header>
        <div className="v96-outcome-grid">
          {outcomeCards.map((card) => <article key={card.title}><span>{card.icon}</span><h3>{card.title}</h3><p>{card.text}</p><Link to={card.link}>{card.cta} <b>→</b></Link></article>)}
        </div>
      </section>

      <section className="v96-loop-section">
        <div className="shell wide v96-loop-inner">
          <div className="v96-loop-copy"><p className="eyebrow">THE CLOSED LOOP</p><h2>Your normal household activity makes GHM smarter.</h2><p>Receipts answer what entered the home. Kitchen Vision helps reconcile what is visible. Meals, shopping and household choices fill in the rest. No single signal has to pretend it is perfect.</p><Link className="secondary center-link" to="/how-it-works">Explore the full loop</Link></div>
          <div className="v96-loop-flow">
            {loop.map(([icon,title,text], index) => <div key={title} className="v96-loop-node"><span>{icon}</span><div><strong>{title}</strong><small>{text}</small></div>{index < loop.length - 1 ? <b>↓</b> : null}</div>)}
          </div>
        </div>
      </section>

      <section className="v96-scenarios shell wide">
        <header className="v96-section-intro"><p className="eyebrow">BUILT AROUND REAL HOUSEHOLDS</p><h2>Same system. Different priorities.</h2><p>GHM adapts the first experience without splitting families, roommates and couples into separate products.</p></header>
        <div className="v96-scenario-grid">{scenarios.map((item) => <article key={item.label}><div><span>{item.icon}</span><small>{item.label}</small></div><h3>{item.title}</h3><p>{item.text}</p><Link to={item.link}>See this household flow →</Link></article>)}</div>
      </section>

      <section className="v96-trust-value shell wide">
        <article className="v96-trust-card"><p className="eyebrow">TRUST & ACCURACY</p><h2>Useful without pretending to know everything.</h2><p>Expired food is never recommended for consumption. A hidden product is not treated as gone. Kitchen Vision keeps uncertain detections for review. Verified savings stay separate from estimates.</p><Link to="/trust">How GHM handles uncertainty →</Link></article>
        <article className="v96-value-card"><p className="eyebrow">WHY PAY MONTHLY?</p><h2>See what the system actually handled.</h2><div><span><small>Verified savings</small><strong>Evidence-backed</strong></span><span><small>Manual work</small><strong>Reduced</strong></span><span><small>Household decisions</small><strong>Prepared</strong></span></div><p>GHM's value proof is designed to show supported outcomes—not invented ROI.</p><Link to="/savings">See Savings & value proof →</Link></article>
      </section>

      {community && community.review_count > 0 ? <section className="v96-community-proof shell wide"><div><p className="eyebrow">HOUSEHOLD FEEDBACK</p><h2>{community.average_rating.toFixed(1)} / 5 from {community.review_count} review{community.review_count === 1 ? '' : 's'}</h2><Link to="/reviews">Read reviews →</Link></div>{community.best_positive_comment ? <blockquote>“{community.best_positive_comment}”{community.best_reviewer_name ? <cite>— {community.best_reviewer_name}</cite> : null}</blockquote> : null}</section> : null}

      <section className="v96-final-cta shell wide">
        <img src="/brand/grocery-house-manager-icon.png" alt="" />
        <div><p className="eyebrow">GROCERY HOUSE MANAGER</p><h2>One place for what your home has, needs, buys, cooks and spends.</h2><p>Start simple. Use the deeper intelligence only when it actually helps.</p></div>
        <Link className="primary center-link" to={loggedIn ? '/houses' : '/login'}>{loggedIn ? 'Open your household' : 'Start free'}</Link>
      </section>
    </main>
  );
}
