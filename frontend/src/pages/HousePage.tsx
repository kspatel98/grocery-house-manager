import { useEffect, useMemo, useRef, useState } from 'react';
import type { CSSProperties } from 'react';
import { Link, useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { api, errorMessage } from '../api';
import { money } from '../currency';
import { useHouseLiveRefresh } from '../hooks';
import type { Activity, AutopilotOverview, ExpenseSummary, House, HouseMember, Product, Receipt, ShoppingList, User } from '../types';
import { ActivityFeed, HouseMembersBar, MembersDrawer } from '../components/HouseInfoPanels';

const PRODUCT_PAGE_LIMIT = 240;
type HouseTab = 'today' | 'home' | 'money' | 'activity';

export default function HousePage() {
  const { houseId } = useParams();
  const [searchParams, setSearchParams] = useSearchParams();
  const navigate = useNavigate();
  const id = Number(houseId);
  const currentUser: User | null = JSON.parse(localStorage.getItem('user') || 'null');
  const [house, setHouse] = useState<House | null>(null);
  const [products, setProducts] = useState<Product[]>([]);
  const [activeList, setActiveList] = useState<ShoppingList | null>(null);
  const [members, setMembers] = useState<HouseMember[]>([]);
  const [activities, setActivities] = useState<Activity[]>([]);
  const [receipts, setReceipts] = useState<Receipt[]>([]);
  const [expenseSummary, setExpenseSummary] = useState<ExpenseSummary | null>(null);
  const [autopilot, setAutopilot] = useState<AutopilotOverview | null>(null);
  const [inviteUrl, setInviteUrl] = useState('');
  const [error, setError] = useState('');
  const [membersOpen, setMembersOpen] = useState(false);
  const [initialLoading, setInitialLoading] = useState(true);
  const inviteMessageRef = useRef<HTMLDivElement | null>(null);

  const requestedTab = searchParams.get('tab') as HouseTab | null;
  const tab: HouseTab = ['today', 'home', 'money', 'activity'].includes(requestedTab || '') ? (requestedTab as HouseTab) : 'today';
  function chooseTab(next: HouseTab) {
    const nextParams = new URLSearchParams(searchParams);
    if (next === 'today') nextParams.delete('tab');
    else nextParams.set('tab', next);
    setSearchParams(nextParams, { replace: true });
  }

  async function loadAll() {
    try {
      const [houseRes, productsRes, listRes, membersRes, activitiesRes, receiptsRes] = await Promise.all([
        api.get<House>(`/houses/${id}`),
        api.get<Product[]>(`/houses/${id}/products`, { params: { sort_by: 'name', direction: 'asc', limit: PRODUCT_PAGE_LIMIT } }),
        api.get<ShoppingList | null>(`/houses/${id}/shopping-lists/active`),
        api.get<HouseMember[]>(`/houses/${id}/members`),
        api.get<Activity[]>(`/houses/${id}/activities`, { params: { limit: 100 } }),
        api.get<Receipt[]>(`/houses/${id}/receipts`),
      ]);
      setHouse(houseRes.data);
      setProducts(productsRes.data);
      setActiveList(listRes.data);
      setMembers(membersRes.data);
      setActivities(activitiesRes.data);
      setReceipts(receiptsRes.data);
      setError('');
      void api.get<ExpenseSummary>(`/houses/${id}/expenses`).then(({ data }) => setExpenseSummary(data)).catch(() => setExpenseSummary(null));
      void api.get<AutopilotOverview>(`/insights/houses/${id}/autopilot`, { params: { t: Date.now() } }).then(({ data }) => setAutopilot(data)).catch(() => setAutopilot(null));
    } catch (err) {
      const message = errorMessage(err);
      setError(message);
      if (message.includes('not a member')) navigate('/houses');
    } finally {
      setInitialLoading(false);
    }
  }

  async function createInvite() {
    try {
      const { data } = await api.post(`/houses/${id}/invite`);
      setInviteUrl(data.join_url);
      await navigator.clipboard?.writeText(data.join_url);
      window.dispatchEvent(new Event('account:refresh'));
      await loadAll();
      requestAnimationFrame(() => {
        inviteMessageRef.current?.scrollIntoView({ behavior: 'smooth', block: 'center' });
        inviteMessageRef.current?.focus({ preventScroll: true });
      });
    } catch (err) {
      setError(errorMessage(err));
    }
  }

  async function leaveHouse() {
    if (!confirm('Leave this house? You will lose access until someone sends you a new invite link.')) return;
    try {
      await api.post(`/houses/${id}/leave`);
      navigate('/houses');
    } catch (err) {
      setError(errorMessage(err));
    }
  }

  async function deleteHouse() {
    if (!confirm('Delete this house permanently? This removes all sections, products, grocery lists, receipts, and activities.')) return;
    try {
      await api.delete(`/houses/${id}`);
      navigate('/houses');
    } catch (err) {
      setError(errorMessage(err));
    }
  }

  async function removeMember(member: HouseMember) {
    const label = member.full_name || 'this member';
    if (!confirm(`Kick ${label} out of this house? They will lose access immediately.`)) return;
    try {
      await api.delete(`/houses/${id}/members/${member.id}`);
      await loadAll();
    } catch (err) {
      setError(errorMessage(err));
    }
  }

  const stats = useMemo(() => {
    const activeListItems = activeList?.items.filter((item) => item.status === 'to_buy').length || 0;
    const activeListCart = activeList?.items.filter((item) => item.status === 'in_cart').length || 0;
    const expired = products.filter((p) => p.is_expired).length;
    const expiringSoon = products.filter((p) => p.is_expiring_soon && !p.is_expired).length;
    const outOfStock = products.filter((p) => p.is_out_of_stock || p.quantity <= 0).length;
    const lowStock = products.filter((p) => p.is_low_stock && !(p.is_out_of_stock || p.quantity <= 0)).length;
    const healthy = Math.max(products.length - expired - expiringSoon - outOfStock - lowStock, 0);
    return { totalProducts: products.length, healthy, lowStock, outOfStock, expired, expiringSoon, activeListItems, activeListCart, receiptCount: receipts.length };
  }, [products, receipts, activeList]);

  const expenseSnapshot = useMemo(() => {
    const monthKey = new Date().toISOString().slice(0, 7);
    const monthExpenses = (expenseSummary?.expenses || []).filter((expense) => String(expense.expense_date || expense.created_at).slice(0, 7) === monthKey);
    const houseTotal = monthExpenses.reduce((sum, expense) => sum + Number(expense.amount || 0), 0);
    const userId = Number(currentUser?.id || 0);
    const myShare = monthExpenses.reduce((sum, expense) => sum + Number(expense.shares.find((share) => share.user_id === userId)?.share_amount || 0), 0);
    const myPaid = monthExpenses.filter((expense) => expense.paid_by_user_id === userId).reduce((sum, expense) => sum + Number(expense.amount || 0), 0);
    const myBalance = Number(expenseSummary?.balances.find((balance) => balance.user_id === userId)?.balance || 0);
    return { houseTotal, myShare, myPaid, myBalance, count: monthExpenses.length };
  }, [expenseSummary, currentUser?.id]);

  const focus = useMemo(() => {
    if ((autopilot?.recall_matches || 0) > 0) return { icon: '🛡️', eyebrow: 'Safety first', title: 'A possible recall match needs verification', copy: 'Check the official notice and package details before using the product.', to: `/assistant?house=${id}&view=protect`, cta: 'Review safety' };
    if (stats.expired > 0) return { icon: '⚠️', eyebrow: 'Review, do not consume', title: `${stats.expired} expired item${stats.expired === 1 ? '' : 's'} need attention`, copy: 'Expired products are excluded from meal suggestions. Review them and discard when appropriate.', to: `/houses/${id}/inventory`, cta: 'Review expired items' };
    if ((autopilot?.receipt_issues || 0) > 0) return { icon: '🧾', eyebrow: 'Worth checking', title: `${autopilot?.receipt_issues} receipt item${autopilot?.receipt_issues === 1 ? '' : 's'} deserve a second look`, copy: 'These are review signals, not confirmed errors. GHM keeps the evidence attached.', to: `/assistant?house=${id}&view=protect`, cta: 'Open protection' };
    if (stats.expiringSoon > 0) return { icon: '⏳', eyebrow: 'Use before expiry', title: `${stats.expiringSoon} item${stats.expiringSoon === 1 ? '' : 's'} should be used soon`, copy: 'Plan meals around these items while they are still within their expiry date.', to: `/assistant?house=${id}&view=plan`, cta: 'Plan meals' };
    if (stats.lowStock + stats.outOfStock > 0) return { icon: '🛒', eyebrow: 'Next trip', title: `${stats.lowStock + stats.outOfStock} product${stats.lowStock + stats.outOfStock === 1 ? '' : 's'} may need restocking`, copy: 'Let GHM prepare the list, then choose the trip that fits your household—not just the cheapest one.', to: `/assistant?house=${id}&view=spend`, cta: 'Prepare trip' };
    if (stats.activeListItems > 0) return { icon: '✓', eyebrow: 'Ready to shop', title: `${stats.activeListItems} item${stats.activeListItems === 1 ? '' : 's'} are waiting on your list`, copy: 'Your shopping list is ready. Open it when you are heading to the store.', to: `/houses/${id}/shopping`, cta: 'Open shopping' };
    return { icon: '✦', eyebrow: 'All calm', title: 'Your household looks under control', copy: 'Nothing urgent stands out. GHM will keep watching stock, receipts, expiry, prices and household patterns.', to: `/assistant?house=${id}`, cta: 'Open Autopilot' };
  }, [autopilot, id, stats]);

  const controlScore = Math.max(0, 100 - (autopilot?.attention_score || Math.min(100, stats.expired * 25 + stats.expiringSoon * 8 + (stats.lowStock + stats.outOfStock) * 4)));
  const latestReceipt = receipts[0];
  const isOwner = house?.role === 'owner';
  const canDelete = isOwner && members.length === 1;

  useEffect(() => { void loadAll(); }, [id]);
  useHouseLiveRefresh(id, loadAll);

  return (
    <main className="page shell wide v95-house-page">
      <header className="v95-house-hero">
        <div className="v95-house-hero-copy">
          <Link to="/houses" className="breadcrumb">← Switch household</Link>
          <p className="eyebrow">{house?.name || 'YOUR HOME'} · HOUSEHOLD OS</p>
          <h1>{focus.title}</h1>
          <p>{focus.copy}</p>
          <div className="v95-hero-actions">
            <Link className="primary center-link" to={focus.to}>{focus.cta} →</Link>
            <Link className="secondary center-link" to={`/assistant?house=${id}`}>Ask GHM</Link>
          </div>
        </div>
        <div className="v95-control-orb" aria-label={`Household control ${controlScore} out of 100`}>
          <div className="v95-control-ring" style={{ '--control': `${controlScore}%` } as CSSProperties}><span><strong>{controlScore}</strong><small>/100</small></span></div>
          <div><small>HOUSEHOLD CONTROL</small><strong>{controlScore >= 85 ? 'Calm & ready' : controlScore >= 60 ? 'A few things to handle' : 'Needs attention'}</strong><span>{members.length} member{members.length === 1 ? '' : 's'} · {house?.role || 'member'}</span></div>
        </div>
      </header>

      {inviteUrl && <div className="success focus-result-card" ref={inviteMessageRef} tabIndex={-1}>Invite copied: {inviteUrl}</div>}
      {error && <div className="error">{error}</div>}
      {initialLoading && <section className="panel skeleton-panel">Preparing your household…</section>}

      <nav className="v95-house-tabs" aria-label="Household views">
        <button className={tab === 'today' ? 'active' : ''} onClick={() => chooseTab('today')}><span>✦</span><strong>Today</strong><small>What matters now</small></button>
        <button className={tab === 'home' ? 'active' : ''} onClick={() => chooseTab('home')}><span>⌂</span><strong>Home</strong><small>Stock & people</small></button>
        <button className={tab === 'money' ? 'active' : ''} onClick={() => chooseTab('money')}><span>$</span><strong>Money</strong><small>Spend & value</small></button>
        <button className={tab === 'activity' ? 'active' : ''} onClick={() => chooseTab('activity')}><span>↻</span><strong>Activity</strong><small>What changed</small></button>
      </nav>

      {tab === 'today' && <>
        <section className="v95-focus-card">
          <span className="v95-focus-icon">{focus.icon}</span>
          <div><p className="eyebrow">{focus.eyebrow}</p><h2>{focus.title}</h2><p>{focus.copy}</p></div>
          <Link to={focus.to} className="primary center-link">{focus.cta}</Link>
        </section>

        <section className="v95-signal-grid" aria-label="Today at a glance">
          <article><small>Next trip</small><strong>{stats.activeListItems}</strong><span>items to buy</span></article>
          <article className={stats.expiringSoon ? 'attention' : ''}><small>Use before expiry</small><strong>{stats.expiringSoon}</strong><span>still safe to plan</span></article>
          <article className={stats.expired ? 'danger' : ''}><small>Expired</small><strong>{stats.expired}</strong><span>review / discard</span></article>
          <article><small>Verified savings</small><strong>{money(autopilot?.verified_savings || 0, autopilot?.currency_code)}</strong><span>{autopilot?.savings_ledger.month_label || 'this month'}</span></article>
        </section>

        <section className="v95-next-grid">
          <Link to={`/assistant?house=${id}&view=plan`}><span>🍲</span><div><small>PLAN</small><strong>Plan the week</strong><p>Meals, servings, use-soon food and grocery gaps.</p></div><b>→</b></Link>
          <Link to={`/houses/${id}/shopping`}><span>🛒</span><div><small>SHOP</small><strong>Open the active trip</strong><p>{stats.activeListItems ? `${stats.activeListItems} items ready to buy.` : 'Build or start a simple shopping list.'}</p></div><b>→</b></Link>
          <Link to={`/houses/${id}/scan`}><span>🧾</span><div><small>CAPTURE</small><strong>Scan a receipt</strong><p>Update prices, inventory and expenses from one receipt.</p></div><b>→</b></Link>
        </section>

        <section className="v95-value-card">
          <div><p className="eyebrow">VALUE PROOF</p><h2>GHM should earn its place in your household.</h2><p>Only evidence-backed savings are counted as saved. Opportunities stay separate until your household actually takes them.</p></div>
          <div className="v95-value-numbers"><span><small>Verified</small><strong>{money(autopilot?.savings_ledger.verified_total || 0, autopilot?.currency_code)}</strong></span><span><small>Open opportunities</small><strong>{money(autopilot?.savings_ledger.potential_total || 0, autopilot?.currency_code)}</strong></span><span><small>Receipts learning prices</small><strong>{stats.receiptCount}</strong></span></div>
          <Link to="/reports" className="secondary center-link">See the evidence →</Link>
        </section>
      </>}

      {tab === 'home' && <>
        <HouseMembersBar members={members} currentUserId={currentUser?.id} onOpen={() => setMembersOpen(true)} />
        <section className="v95-home-grid">
          <article className="v95-home-card">
            <header><div><p className="eyebrow">INVENTORY HEALTH</p><h2>{stats.totalProducts} tracked products</h2></div><Link to={`/houses/${id}/inventory`}>Open →</Link></header>
            <div className="v95-stock-meter"><span className="healthy" style={{ flex: Math.max(stats.healthy, 1) }} /><span className="warn" style={{ flex: Math.max(stats.lowStock + stats.expiringSoon, .001) }} /><span className="danger" style={{ flex: Math.max(stats.outOfStock + stats.expired, .001) }} /></div>
            <div className="v95-stock-legend"><span><i className="healthy" />Healthy <b>{stats.healthy}</b></span><span><i className="warn" />Needs attention <b>{stats.lowStock + stats.expiringSoon}</b></span><span><i className="danger" />Out / expired <b>{stats.outOfStock + stats.expired}</b></span></div>
            <div className="v95-home-actions"><Link to={`/houses/${id}/inventory`} className="primary center-link">Manage inventory</Link><Link to={`/assistant?house=${id}&view=protect`} className="secondary center-link">Kitchen Vision</Link></div>
          </article>

          <article className="v95-home-card">
            <header><div><p className="eyebrow">HOUSEHOLD</p><h2>{members.length} connected member{members.length === 1 ? '' : 's'}</h2></div><button className="link-button" onClick={() => setMembersOpen(true)}>Manage →</button></header>
            <p>Everyone works from the same inventory, shopping list, receipts and expenses. Changes sync across the household.</p>
            <div className="v95-member-preview">{members.slice(0, 5).map((member) => <span key={member.id} title={member.full_name || member.email}>{(member.full_name || member.email || '?').slice(0, 1).toUpperCase()}</span>)}</div>
            <button className="secondary full" onClick={createInvite}>🔗 Invite someone</button>
          </article>

          <article className="v95-home-card">
            <header><div><p className="eyebrow">LATEST RECEIPT</p><h2>{latestReceipt?.store_name || 'No receipt yet'}</h2></div><Link to={`/houses/${id}/receipts`}>History →</Link></header>
            {latestReceipt ? <><strong className="v95-receipt-total">{latestReceipt.total_amount != null ? money(Number(latestReceipt.total_amount)) : 'Saved'}</strong><p>{latestReceipt.receipt_date || (latestReceipt.created_at ? new Date(latestReceipt.created_at).toLocaleDateString() : '')}</p></> : <p>Scan a receipt and GHM can update prices, inventory and expense context.</p>}
            <Link to={`/houses/${id}/scan`} className="secondary center-link full">Scan receipt</Link>
          </article>
        </section>

        <details className="v95-tools-drawer">
          <summary><span><strong>All household tools</strong><small>Open only when you need a specialist workspace.</small></span><b>＋</b></summary>
          <div className="v95-tool-grid">
            <Link to={`/houses/${id}/meals`}><span>🍲</span><strong>Meals</strong><small>Recipes & cook-from-home</small></Link>
            <Link to={`/houses/${id}/templates`}><span>▤</span><strong>Templates</strong><small>Reusable household lists</small></Link>
            <Link to="/market"><span>◉</span><strong>Prices & flyers</strong><small>Compare current options</small></Link>
            <Link to={`/houses/${id}/receipts`}><span>🗂️</span><strong>Receipts</strong><small>History & evidence</small></Link>
            <Link to={`/houses/${id}/expenses`}><span>$</span><strong>Expenses</strong><small>Split & settle</small></Link>
            <Link to="/reports"><span>📈</span><strong>Reports</strong><small>Savings & household insight</small></Link>
          </div>
        </details>

        <section className="v95-house-access">
          <div><p className="eyebrow">HOUSE ACCESS</p><h3>{isOwner ? 'You own this household' : 'You are a household member'}</h3><p>{isOwner ? 'Delete remains protected until you are the only member.' : 'You can leave at any time. Only the owner can delete the household.'}</p></div>
          {isOwner ? <button className="danger-button" onClick={deleteHouse} disabled={!canDelete}>Delete house</button> : <button className="danger-button" onClick={leaveHouse}>Leave house</button>}
        </section>
      </>}

      {tab === 'money' && <>
        <section className="v95-money-hero">
          <div><p className="eyebrow">THIS MONTH</p><h2>{money(expenseSnapshot.houseTotal)}</h2><p>{expenseSnapshot.count} household expense{expenseSnapshot.count === 1 ? '' : 's'} recorded.</p></div>
          <div className="v95-money-position"><small>YOUR POSITION</small><strong className={expenseSnapshot.myBalance >= 0 ? 'positive' : 'negative'}>{expenseSnapshot.myBalance >= 0 ? 'Owed ' : 'Owe '}{money(Math.abs(expenseSnapshot.myBalance))}</strong><span>You paid {money(expenseSnapshot.myPaid)} · Your share {money(expenseSnapshot.myShare)}</span></div>
        </section>
        <section className="v95-money-grid">
          <Link to={`/houses/${id}/expenses`}><span>$</span><div><strong>Expenses & reimbursements</strong><p>Track shared spending and see the simplest settlement path.</p></div><b>→</b></Link>
          <Link to="/reports"><span>✓</span><div><strong>Verified value</strong><p>{money(autopilot?.savings_ledger.verified_total || 0, autopilot?.currency_code)} evidence-backed savings this month.</p></div><b>→</b></Link>
          <Link to={`/assistant?house=${id}&view=spend`}><span>◇</span><div><strong>Shopping intelligence</strong><p>{money(autopilot?.savings_ledger.potential_total || 0, autopilot?.currency_code)} in current opportunities, kept separate from actual savings.</p></div><b>→</b></Link>
          <Link to="/market"><span>◉</span><div><strong>Prices & flyers</strong><p>Check supported prices and nearby deal information before a trip.</p></div><b>→</b></Link>
        </section>
      </>}

      {tab === 'activity' && <section className="v95-activity-layout">
        <div><p className="eyebrow">HOUSEHOLD ACTIVITY</p><h2>One shared source of truth.</h2><p>See what changed across shopping, inventory, receipts and household actions without hunting through each page.</p></div>
        <ActivityFeed activities={activities} onRefresh={loadAll} />
      </section>}

      <MembersDrawer open={membersOpen} onClose={() => setMembersOpen(false)} members={members} currentUserId={currentUser?.id} houseRole={house?.role} onRemoveMember={removeMember} onCreateInvite={createInvite} inviteUrl={inviteUrl} />
    </main>
  );
}
