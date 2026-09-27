import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../api';
import PageMeta from '../components/PageMeta';
import type { SiteReviewSummary } from '../types';

const outcomeCards = [
  {
    icon: '⌂',
    title: 'Know what you have',
    text: 'Receipts, shopping, barcode scans and Kitchen Vision help GHM maintain a useful picture of what is actually at home.',
    link: '/kitchen-vision',
    cta: 'See Kitchen Vision',
  },
  {
    icon: '✦',
    title: 'Know what comes next',
    text: 'Household Forecast combines stock, purchase cadence, expiry and real household choices to surface the next useful action.',
    link: '/household-intelligence',
    cta: 'See household intelligence',
  },
  {
    icon: '◇',
    title: 'Spend smarter together',
    text: 'Plan meals, prepare shared trips, compare supported prices and understand household spending without forcing the cheapest choice.',
    link: '/grocery-price-intelligence',
    cta: 'See shopping intelligence',
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
          <p className="eyebrow">ONE HOUSEHOLD SYSTEM · LESS MANUAL WORK</p>
          <h1>Your home already knows what it needs.</h1>
          <p className="v96-public-hero-lede">GHM connects what comes home, what appears to remain, what your household uses, what you plan to cook and how you prefer to shop—then turns those signals into the next useful decision.</p>
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
        </div>

        <div className="v96-today-preview" aria-label="GHM Today preview">
          <div className="v96-preview-top"><span>GHM · TODAY</span><b>Friday</b></div>
          <h2>2 things deserve attention.</h2>
          <article className="v96-preview-action primary-action"><span>🥛</span><div><small>PREDICTION</small><strong>Milk likely needed tomorrow</strong><p>Based on recent household purchase cadence.</p></div><b>→</b></article>
          <article className="v96-preview-action"><span>🥬</span><div><small>USE BEFORE EXPIRY</small><strong>Spinach should be used by Sunday</strong><p>Still within its recorded expiry date.</p></div><b>→</b></article>
          <div className="v96-preview-proof"><span><small>Verified this month</small><strong>$18.40</strong></span><span><small>Open opportunities</small><strong>$7.25</strong></span></div>
          <p className="v96-preview-note">The complex systems stay underneath. You review the decisions that matter.</p>
        </div>
      </section>

      <section className="v96-outcome-section shell wide">
        <header className="v96-section-intro"><p className="eyebrow">WHAT GHM DOES FOR THE HOUSEHOLD</p><h2>Three outcomes. One connected system.</h2><p>You should not need to learn a collection of grocery tools before the product becomes useful.</p></header>
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

      {community && community.review_count > 0 ? <section className="v96-community-proof shell wide"><div><p className="eyebrow">HOUSEHOLD FEEDBACK</p><h2>{community.average_rating.toFixed(1)} / 5 from {community.review_count} review{community.review_count === 1 ? '' : 's'}</h2></div>{community.best_positive_comment ? <blockquote>“{community.best_positive_comment}”{community.best_reviewer_name ? <cite>— {community.best_reviewer_name}</cite> : null}</blockquote> : null}</section> : null}

      <section className="v96-final-cta shell wide">
        <img src="/brand/grocery-house-manager-icon.png" alt="" />
        <div><p className="eyebrow">GROCERY HOUSE MANAGER</p><h2>Stop managing groceries. Review what matters.</h2><p>Start simple. GHM reveals deeper intelligence only when your household needs it.</p></div>
        <Link className="primary center-link" to={loggedIn ? '/houses' : '/login'}>{loggedIn ? 'Open your household' : 'Start free'}</Link>
      </section>
    </main>
  );
}
