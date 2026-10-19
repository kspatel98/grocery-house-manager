import { useEffect, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { api } from '../api';
import type { AccountBootstrap, PlanName } from '../types';
import { useLanguage } from '../i18n';

type ToolCard = {
  to: string;
  icon: string;
  title: string;
  description: string;
  badge?: string;
  minPlan?: PlanName;
  premiumTryFeature?: string;
};

const PLAN_RANK: Record<PlanName, number> = { free: 0, basic: 1, family: 2, pro: 3 };
const PLAN_LABEL: Record<PlanName, string> = { free: 'Free Starter', basic: 'Basic Home', family: 'Family Plus', pro: 'Household Pro' };

type ToolSection = {
  key: string;
  eyebrow: string;
  title: string;
  subtitle: string;
  cards: ToolCard[];
};

export default function MorePage() {
  const [searchParams] = useSearchParams();
  const { tr } = useLanguage();
  const queryHouse = Number(searchParams.get('house') || 0);
  const savedHouse = Number(localStorage.getItem('ghm_active_house_id') || 0);
  const isAdmin = localStorage.getItem('account_is_admin') === 'true';
  const houseId = Number.isFinite(queryHouse) && queryHouse > 0
    ? queryHouse
    : Number.isFinite(savedHouse) && savedHouse > 0
      ? savedHouse
      : null;
  const [housePlan, setHousePlan] = useState<PlanName>('free');
  const [premiumTryAvailable, setPremiumTryAvailable] = useState(false);

  useEffect(() => {
    let active = true;
    api.get<AccountBootstrap>('/account/bootstrap', { params: { t: Date.now() } })
      .then(({ data }) => {
        if (!active) return;
        const house = data.houses?.find((row) => row.id === houseId);
        setHousePlan(house?.owner_plan_name || 'free');
        setPremiumTryAvailable(Boolean(data.subscription.premium_try?.available));
      })
      .catch(() => undefined);
    return () => { active = false; };
  }, [houseId]);

  const sections: ToolSection[] = [
    ...(houseId ? [{
      key: 'household',
      eyebrow: 'HOUSEHOLD',
      title: 'Home, food & routines',
      subtitle: 'Everything that helps the household know what it owns, what to cook, and how to stay coordinated.',
      cards: [
        { to: `/houses/${houseId}/inventory`, icon: '▣', title: 'Inventory', description: 'Track what you own, quantities, sections, low stock and expiry.' },
        { to: `/houses/${houseId}/kitchen`, icon: '👁️', title: 'Kitchen Vision', description: 'Check fridge, pantry and freezer with visual household intelligence.', minPlan: 'pro', premiumTryFeature: 'kitchen_vision' },
        { to: `/houses/${houseId}/meals`, icon: '🍲', title: 'Meals & Recipes', description: 'Cook from what you own, adjust servings and add shortages to shopping.' },
        { to: `/houses/${houseId}/food`, icon: '🍽️', title: 'Food tonight', description: 'Find nearby meal ideas when cooking at home is not the best option.' },
        { to: `/houses/${houseId}/templates`, icon: '▤', title: 'Templates', description: 'Reuse household shopping lists, routines and repeatable plans.' },
        { to: `/houses/${houseId}/chat`, icon: '💬', title: 'House Chat', description: 'Coordinate groceries, meals, expenses and household updates.' },
      ],
    }, {
      key: 'money',
      eyebrow: 'RECEIPTS & MONEY',
      title: 'Capture once. Reuse everywhere.',
      subtitle: 'Receipts, prices and shared expenses stay connected instead of being re-entered.',
      cards: [
        { to: `/wallet?house=${houseId}`, icon: '◈', title: 'GHM Wallet', description: 'Buy GHM Tokens, contribute to a house and exchange for services.' },
        { to: `/houses/${houseId}/scan`, icon: '🧾', title: 'Scan receipt', description: 'Read a receipt, review it, update inventory and optionally create an expense.', badge: 'OCR', minPlan: 'basic', premiumTryFeature: 'smart_receipt_scan' },
        { to: `/houses/${houseId}/receipts`, icon: '🗂️', title: 'Receipt history', description: 'Review saved receipts, images, totals and product history.' },
        { to: `/houses/${houseId}/expenses`, icon: '$', title: 'Money', description: 'Track shared expenses, monthly books, balances and reimbursements.', minPlan: 'family' },
      ],
    }, {
      key: 'intelligence',
      eyebrow: 'GHM INTELLIGENCE',
      title: 'Understand and decide',
      subtitle: 'Use GHM for deeper questions, planning, comparisons and household decisions.',
      cards: [
        { to: `/assistant?house=${houseId}&view=intelligence`, icon: '✦', title: 'Household Intelligence', description: 'Ask why something changed, what to buy, what to use first, or what choice is better.', badge: 'AI', minPlan: 'family', premiumTryFeature: 'household_intelligence' },
        { to: `/assistant?house=${houseId}&view=plan`, icon: '◫', title: 'Plan', description: 'Build a practical household plan around meals, shopping and what is already at home.', minPlan: 'family', premiumTryFeature: 'autopilot_planner' },
        { to: '/market', icon: '◉', title: 'Prices & flyers', description: 'Compare grocery prices, weekly flyers and shopping opportunities.', minPlan: 'family', premiumTryFeature: 'live_price_compare' },
        { to: '/reports', icon: '📈', title: 'Reports', description: 'See spending, savings and household patterns over time.' },
      ],
    }] as ToolSection[] : []),
    {
      key: 'account',
      eyebrow: 'ACCOUNT & APP',
      title: 'GHM settings & support',
      subtitle: 'Plans, preferences, help, learning and account controls.',
      cards: [
        { to: '/profile', icon: '👤', title: 'Profile', description: 'Manage your account, household preferences and subscription details.' },
        { to: '/appearance', icon: '⚙', title: 'Settings & appearance', description: 'Choose light/dark mode, visual style and turn GHM sounds on or off.' },
        { to: '/premium-try', icon: '✨', title: 'Try Premium Free', description: 'Choose one premium feature and use the real workflow once without a card.' },
        { to: '/pricing', icon: '♛', title: 'Plans', description: 'Compare plans, premium features and GHM Wallet tokens.' },
        { to: '/learn', icon: '✦', title: 'How GHM helps', description: 'Learn what each smart feature is for and when it is useful.' },
        { to: '/reviews', icon: '★', title: 'Reviews & feedback', description: 'Rate GHM, edit your review and see household feedback.' },
        { to: '/support', icon: '?', title: 'Support', description: 'Get help with your GHM account, workflows and service.' },
        { to: '/privacy', icon: '◌', title: 'Privacy', description: 'Read how GHM handles privacy and your data.' },
        { to: '/terms', icon: '§', title: 'Terms', description: 'Review the terms that apply when using GHM.' },
        ...(isAdmin ? [{ to: '/admin', icon: '🛡️', title: 'Admin', description: 'Manage GHM admin controls, offers and operational tools.' }] : []),
      ],
    },
  ];

  return (
    <main className="page shell wide more-page-v119">
      <section className="more-hero-v119">
        <div>
          <p className="eyebrow">{tr('MORE')}</p>
          <h1>{tr('Everything else in GHM')}</h1>
          <p>{tr('Main navigation stays simple. Open any detailed tool from this organized workspace.')}</p>
        </div>
        <div className="more-hero-art-v119" aria-hidden="true">
          <span>🏡</span><span>🧾</span><span>🍲</span><span>📈</span>
        </div>
      </section>

      {!houseId && (
        <section className="panel more-house-needed-v119">
          <div><strong>{tr('Choose a Grocery Home for household tools')}</strong><p>{tr('Once a home is active, inventory, meals, receipts, money and household intelligence appear here.')}</p></div>
          <Link className="primary center-link" to="/houses">{tr('Choose a Grocery Home')}</Link>
        </section>
      )}

      <div className="more-sections-v119">
        {sections.map((section) => (
          <section className={`more-section-v119 section-${section.key}`} key={section.key}>
            <header>
              <div><p className="eyebrow">{tr(section.eyebrow)}</p><h2>{tr(section.title)}</h2><p>{tr(section.subtitle)}</p></div>
            </header>
            <div className="more-card-grid-v119">
              {section.cards.map((card) => {
                const locked = Boolean(card.minPlan && PLAN_RANK[housePlan] < PLAN_RANK[card.minPlan]);
                const canTry = locked && housePlan === 'free' && premiumTryAvailable && Boolean(card.premiumTryFeature) && Boolean(houseId);
                const target = locked
                  ? (canTry ? `/premium-try?feature=${encodeURIComponent(card.premiumTryFeature || '')}&house=${houseId}` : '/pricing')
                  : card.to;
                return (
                  <Link className={`more-tool-card-v119 ${locked ? 'v129-plan-locked' : ''}`} to={target} key={`${section.key}-${card.to}-${card.title}`}>
                    <span className="more-tool-icon-v119" aria-hidden="true">{card.icon}</span>
                    <div><strong>{tr(card.title)}</strong><small>{tr(card.description)}</small>{locked ? <span className="v129-plan-lock-copy">{canTry ? 'Try once free' : `Requires ${PLAN_LABEL[card.minPlan || 'free']}`}</span> : null}</div>
                    {locked ? <em>🔒</em> : card.badge ? <em>{card.badge}</em> : <b aria-hidden="true">›</b>}
                  </Link>
                );
              })}
            </div>
          </section>
        ))}
      </div>
    </main>
  );
}
