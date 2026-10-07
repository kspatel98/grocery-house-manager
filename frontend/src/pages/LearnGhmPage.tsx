import { Link } from 'react-router-dom';
import { featureEducation, type FeatureEducationKey } from '../featureEducation';
import { FeatureWhyButton } from '../components/FeaturePurpose';

const sections: { title: string; subtitle: string; features: FeatureEducationKey[] }[] = [
  { title: 'Know what is happening at home', subtitle: 'Inventory and household context reduce remembering and duplicate work.', features: ['inventory', 'household'] },
  { title: 'Capture once, reuse the information', subtitle: 'Receipts become useful household evidence instead of a one-time upload.', features: ['receipt_scan', 'receipt_history'] },
  { title: 'Buy and cook with less waste', subtitle: 'Connect what you own, what you need and what is actually worth buying.', features: ['meals', 'shopping', 'flyers', 'price_compare'] },
  { title: 'Keep shared money understandable', subtitle: 'Household books, splits and reimbursements stay explainable over time.', features: ['expenses', 'expense_months', 'reimbursements'] },
];

function destination(feature: FeatureEducationKey, houseId: number | null) {
  if (!houseId) return '/houses';
  if (feature === 'inventory') return `/houses/${houseId}/inventory`;
  if (feature === 'shopping') return `/houses/${houseId}/shopping`;
  if (feature === 'receipt_scan') return `/houses/${houseId}/scan`;
  if (feature === 'receipt_history') return `/houses/${houseId}/receipts`;
  if (feature === 'meals') return `/houses/${houseId}/meals`;
  if (feature === 'expenses' || feature === 'expense_months' || feature === 'reimbursements') return `/houses/${houseId}/expenses`;
  if (feature === 'flyers' || feature === 'price_compare') return '/market';
  if (feature === 'household') return `/houses/${houseId}`;
  return '/houses';
}

export default function LearnGhmPage() {
  const rawHouse = Number(localStorage.getItem('ghm_active_house_id') || 0);
  const houseId = Number.isFinite(rawHouse) && rawHouse > 0 ? rawHouse : null;
  return <main className="page shell wide learn-ghm-page-v101">
    <section className="learn-ghm-hero-v101">
      <div><p className="eyebrow">HOW GHM HELPS</p><h1>Start with the household problem—not the feature name.</h1><p>GHM has a lot of capability, but you should never have to memorize a toolbox. This guide explains what each smart feature is trying to solve, when it becomes useful and where to use it.</p><div className="learn-ghm-hero-actions-v101"><Link className="primary center-link" to={houseId ? `/houses/${houseId}` : '/houses'}>Back to my household</Link><Link className="secondary center-link" to="/support">Need help?</Link></div></div>
      <div className="learn-ghm-hero-art-v101" aria-hidden="true"><span>🏡</span><div><i>▣</i><i>🧾</i><i>🍲</i><i>💸</i></div></div>
    </section>

    <section className="premium-try-invite-v102 learn-premium-try-v102">
      <div className="premium-try-invite-icon-v102" aria-hidden="true">✨</div>
      <div className="premium-try-invite-copy-v102">
        <p className="eyebrow">FEEL THE DIFFERENCE YOURSELF</p>
        <h2>Free Starter includes one real Premium Try.</h2>
        <p>Choose one eligible premium workflow and use the full experience once—free, with no card and no automatic subscription. You can change your choice until a successful try is used.</p>
      </div>
      <Link className="primary center-link" to="/premium-try">Choose my free Premium Try</Link>
    </section>

    {sections.map((section) => <section className="learn-ghm-section-v101" key={section.title}>
      <header><p className="eyebrow">REAL HOUSEHOLD PROBLEMS</p><h2>{section.title}</h2><p>{section.subtitle}</p></header>
      <div className="learn-ghm-grid-v101">
        {section.features.map((key) => { const item = featureEducation[key]; return <article className={`learn-ghm-card-v101 feature-${key}`} key={key}>
          <div className="learn-ghm-card-icon-v101" aria-hidden="true">{item.icon}</div>
          <div className="learn-ghm-card-copy-v101"><small>“{item.problem}”</small><h3>{item.title}</h3><p>{item.benefit}</p></div>
          <footer><FeatureWhyButton feature={key} label="Why this helps"/><Link to={destination(key, houseId)}>Open feature <b>→</b></Link></footer>
        </article>; })}
      </div>
    </section>)}

    <section className="learn-ghm-loop-v101"><div><p className="eyebrow">WHY THE FEATURES CONNECT</p><h2>One household action can make the next one easier.</h2><p>A receipt can improve inventory and price history. Inventory can improve meal suggestions. A meal shortage can become a shopping item. Shopping can connect to flyer and whole-list price intelligence.</p></div><div className="learn-ghm-loop-flow-v101"><span>🧾 Receipt</span><b>→</b><span>▣ Inventory</span><b>→</b><span>🍲 Meals</span><b>→</b><span>🛒 Shopping</span><b>→</b><span>🏷️ Prices</span></div></section>
  </main>;
}
