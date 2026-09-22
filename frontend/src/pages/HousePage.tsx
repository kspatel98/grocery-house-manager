import { useEffect, useMemo, useRef, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { api, errorMessage } from '../api';
import { money } from '../currency';
import { useHouseLiveRefresh } from '../hooks';
import { recipes, type Recipe } from '../recipes';
import type { Activity, ExpenseSummary, House, HouseMember, Product, Receipt, ShoppingList, User } from '../types';
import { ActivityFeed, HouseMembersBar, MembersDrawer } from '../components/HouseInfoPanels';

const PRODUCT_PAGE_LIMIT = 240;

type DashboardStats = {
  totalProducts: number;
  lowStock: number;
  outOfStock: number;
  expired: number;
  expiringSoon: number;
  receiptCount: number;
  activeListItems: number;
  activeListCart: number;
};

const normalizeIngredient = (value: string) => value.toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
const cuisinePreviewIds: Record<string, string> = {
  Gujarati: 'khaman',
  Punjabi: 'paneer-bhurji',
  'South Indian': 'masala-dosa',
  'North Indian': 'chole',
};

export default function HousePage() {
  const { houseId } = useParams();
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
  const [inviteUrl, setInviteUrl] = useState('');
  const [error, setError] = useState('');
  const [membersOpen, setMembersOpen] = useState(false);
  const [initialLoading, setInitialLoading] = useState(true);
  const [shareMessage, setShareMessage] = useState('');
  const inviteMessageRef = useRef<HTMLDivElement | null>(null);

  function openMembersPanel() { setMembersOpen(true); }

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
      setReceipts(receiptsRes.data);
      setActivities(activitiesRes.data);
      setError('');
      api.get<ExpenseSummary>(`/houses/${id}/expenses`).then(({ data }) => setExpenseSummary(data)).catch(() => setExpenseSummary(null));
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
    } catch (err) { setError(errorMessage(err)); }
  }

  async function leaveHouse() {
    if (!confirm('Leave this house? You will lose access until someone sends you a new invite link.')) return;
    try { await api.post(`/houses/${id}/leave`); navigate('/houses'); } catch (err) { setError(errorMessage(err)); }
  }

  async function deleteHouse() {
    if (!confirm('Delete this house permanently? This removes all sections, products, grocery lists, receipts, and activities.')) return;
    try { await api.delete(`/houses/${id}`); navigate('/houses'); } catch (err) { setError(errorMessage(err)); }
  }

  async function removeMember(member: HouseMember) {
    const label = member.full_name || 'this member';
    if (!confirm(`Kick ${label} out of this house? They will lose access immediately.`)) return;
    try { await api.delete(`/houses/${id}/members/${member.id}`); await loadAll(); } catch (err) { setError(errorMessage(err)); }
  }

  const stats: DashboardStats = useMemo(() => {
    const activeListItems = activeList?.items.filter((item) => item.status === 'to_buy').length || 0;
    const activeListCart = activeList?.items.filter((item) => item.status === 'in_cart').length || 0;
    return {
      totalProducts: products.length,
      lowStock: products.filter((p) => p.is_low_stock && !(p.is_out_of_stock || p.quantity <= 0)).length,
      outOfStock: products.filter((p) => p.is_out_of_stock || p.quantity <= 0).length,
      expired: products.filter((p) => p.is_expired).length,
      expiringSoon: products.filter((p) => p.is_expiring_soon && !p.is_expired).length,
      receiptCount: receipts.length,
      activeListItems,
      activeListCart,
    };
  }, [products, receipts, activeList]);

  const expenseSnapshot = useMemo(() => {
    const monthKey = new Date().toISOString().slice(0, 7);
    const monthExpenses = (expenseSummary?.expenses || []).filter((expense) => String(expense.expense_date || expense.created_at).slice(0, 7) === monthKey);
    const houseTotal = monthExpenses.reduce((sum, expense) => sum + Number(expense.amount || 0), 0);
    const userId = Number(currentUser?.id || 0);
    const myShare = monthExpenses.reduce((sum, expense) => sum + Number(expense.shares.find((share) => share.user_id === userId)?.share_amount || 0), 0);
    const myPaid = monthExpenses.filter((expense) => expense.paid_by_user_id === userId).reduce((sum, expense) => sum + Number(expense.amount || 0), 0);
    const myBalance = Number(expenseSummary?.balances.find((balance) => balance.user_id === userId)?.balance || 0);
    const categories = new Map<string, number>();
    monthExpenses.forEach((expense) => categories.set(expense.category || 'Other', (categories.get(expense.category || 'Other') || 0) + Number(expense.amount || 0)));
    const categoryRows = [...categories.entries()].sort((a, b) => b[1] - a[1]).slice(0, 5);
    return { houseTotal, myShare, myPaid, myBalance, categoryRows, monthExpenses };
  }, [expenseSummary, currentUser?.id]);

  const mealSuggestions = useMemo(() => {
    const pantry = products.filter((p) => Number(p.quantity || 0) > 0).map((p) => normalizeIngredient(p.name));
    const realPhotoRecipes = recipes.filter((recipe) => recipe.image?.includes('/recipe-images-real/'));
    const scoreRecipe = (recipe: Recipe) => {
      const required = recipe.ingredients.filter((item) => !item.optional && !normalizeIngredient(item.name).includes('water'));
      const matched = required.filter((item) => {
        const key = normalizeIngredient(item.name);
        return pantry.some((name) => name === key || name.includes(key) || key.includes(name));
      }).length;
      return required.length ? matched / required.length : 0;
    };
    return realPhotoRecipes.map((recipe) => ({ recipe, score: scoreRecipe(recipe) })).sort((a, b) => b.score - a.score).slice(0, 4);
  }, [products]);

  const householdMomentum = useMemo(() => {
    const cutoff = Date.now() - 7 * 24 * 60 * 60 * 1000;
    const map = new Map<number, { userId: number; name: string; count: number; receipts: number; shopping: number; inventory: number }>();
    activities.forEach((activity) => {
      const created = new Date(activity.created_at).getTime();
      const userId = Number(activity.user?.id || 0);
      if (!userId || Number.isNaN(created) || created < cutoff) return;
      const current = map.get(userId) || {
        userId,
        name: activity.user?.full_name || activity.user?.email?.split('@')[0] || 'House member',
        count: 0,
        receipts: 0,
        shopping: 0,
        inventory: 0,
      };
      current.count += 1;
      const action = activity.action.toLowerCase();
      if (action.includes('receipt')) current.receipts += 1;
      if (action.includes('shopping')) current.shopping += 1;
      if (action.includes('product') || action.includes('inventory')) current.inventory += 1;
      map.set(userId, current);
    });
    return [...map.values()].sort((a, b) => b.count - a.count).slice(0, 4);
  }, [activities]);

  async function buildHouseWinImage() {
    const canvas = document.createElement('canvas');
    canvas.width = 1080;
    canvas.height = 1350;
    const ctx = canvas.getContext('2d');
    if (!ctx) return null;
    const gradient = ctx.createLinearGradient(0, 0, 1080, 1350);
    gradient.addColorStop(0, '#f8fff9');
    gradient.addColorStop(.5, '#e9f8ef');
    gradient.addColorStop(1, '#fff8e9');
    ctx.fillStyle = gradient;
    ctx.fillRect(0, 0, 1080, 1350);
    ctx.fillStyle = '#0b553a';
    ctx.font = '800 68px system-ui, sans-serif';
    ctx.fillText('Grocery House Manager', 90, 150);
    ctx.fillStyle = '#5d7268';
    ctx.font = '600 34px system-ui, sans-serif';
    ctx.fillText('A household win worth sharing', 90, 205);
    ctx.fillStyle = '#123d2e';
    ctx.font = '800 58px system-ui, sans-serif';
    const houseTitle = (house?.name || 'Our household').slice(0, 28);
    ctx.fillText(houseTitle, 90, 340);
    const cards = [
      ['Inventory items', String(stats.totalProducts)],
      ['Receipts logged', String(stats.receiptCount)],
      ['Still to buy', String(stats.activeListItems)],
    ];
    cards.forEach(([label, value], index) => {
      const x = 90 + index * 305;
      ctx.fillStyle = '#ffffff';
      ctx.beginPath();
      ctx.roundRect(x, 430, 270, 240, 28);
      ctx.fill();
      ctx.fillStyle = '#118052';
      ctx.font = '900 72px system-ui, sans-serif';
      ctx.fillText(value, x + 28, 540);
      ctx.fillStyle = '#50665c';
      ctx.font = '700 28px system-ui, sans-serif';
      ctx.fillText(label, x + 28, 605);
    });
    if (latestReceipt?.total_amount != null) {
      ctx.fillStyle = '#ffffff';
      ctx.beginPath();
      ctx.roundRect(90, 730, 880, 210, 32);
      ctx.fill();
      ctx.fillStyle = '#ef7a2d';
      ctx.font = '800 30px system-ui, sans-serif';
      ctx.fillText('LATEST RECEIPT', 125, 795);
      ctx.fillStyle = '#173f31';
      ctx.font = '900 58px system-ui, sans-serif';
      ctx.fillText(money(Number(latestReceipt.total_amount)), 125, 875);
      ctx.fillStyle = '#687b72';
      ctx.font = '600 27px system-ui, sans-serif';
      ctx.fillText((latestReceipt.store_name || 'Grocery trip').slice(0, 38), 360, 872);
    }
    ctx.fillStyle = '#0f6f49';
    ctx.font = '800 42px system-ui, sans-serif';
    ctx.fillText('Plan smarter. Shop smarter. Live better.', 90, 1080);
    ctx.fillStyle = '#60766b';
    ctx.font = '600 28px system-ui, sans-serif';
    ctx.fillText('grocery-house-manager.com', 90, 1140);
    ctx.fillStyle = '#dff5e7';
    ctx.beginPath();
    ctx.arc(925, 1125, 72, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = '#0f6f49';
    ctx.font = '900 64px system-ui, sans-serif';
    ctx.fillText('✓', 900, 1148);
    return new Promise<File | null>((resolve) => canvas.toBlob((blob) => resolve(blob ? new File([blob], 'grocery-house-manager-win.png', { type: 'image/png' }) : null), 'image/png'));
  }

  async function shareHouseWin() {
    const latestTotal = latestReceipt?.total_amount != null ? ` Our latest receipt was ${money(Number(latestReceipt.total_amount))}.` : '';
    const text = `${house?.name || 'Our household'} is getting organized with Grocery House Manager: ${stats.totalProducts} inventory items tracked, ${stats.receiptCount} receipts logged, and ${stats.activeListItems} grocery-list items waiting.${latestTotal}`;
    try {
      const file = await buildHouseWinImage();
      if (file && navigator.share && navigator.canShare?.({ files: [file] })) {
        await navigator.share({ title: 'Our Grocery House Manager win', text, files: [file] });
        setShareMessage('Shared your household win.');
        return;
      }
      if (file) {
        const url = URL.createObjectURL(file);
        const link = document.createElement('a');
        link.href = url;
        link.download = file.name;
        link.click();
        window.setTimeout(() => URL.revokeObjectURL(url), 5000);
        await navigator.clipboard?.writeText(`${text} ${window.location.origin}`);
        setShareMessage('Share card downloaded and caption copied.');
        return;
      }
      if (navigator.share) await navigator.share({ title: 'Our Grocery House Manager win', text, url: window.location.origin });
      else {
        await navigator.clipboard?.writeText(`${text} ${window.location.origin}`);
        setShareMessage('Household win copied — ready to share.');
      }
    } catch {
      // Native share can be cancelled without showing an error.
    }
  }

  const latestReceipt = receipts[0];
  const latestReceiptDate = latestReceipt?.receipt_date || (latestReceipt?.created_at ? new Date(latestReceipt.created_at).toLocaleDateString() : 'No saved receipts yet');
  const isOwner = house?.role === 'owner';
  const canDelete = isOwner && members.length === 1;

  useEffect(() => { loadAll(); }, [id]);
  useHouseLiveRefresh(id, loadAll);

  return (
    <main className="page shell wide house-dashboard-page cinematic-page v85-house-dashboard">
      <section className="v85-dashboard-hero">
        <div>
          <Link to="/houses" className="breadcrumb">← All houses</Link>
          <p className="eyebrow">YOUR CONNECTED HOME</p>
          <h1>A smarter home. A happier life.</h1>
          <p>Manage groceries, meals, receipts, shared spending and savings from one calm workspace for <strong>{house?.name || 'your house'}</strong>.</p>
        </div>
        <div className="v85-house-identity">
          <span>🏡</span><div><strong>{house?.name || 'House'}</strong><small>{members.length} members · {house?.role || 'member'} access</small></div>
        </div>
      </section>

      {inviteUrl && <div className="success focus-result-card" ref={inviteMessageRef} tabIndex={-1}>Invite copied: {inviteUrl}</div>}
      {error && <div className="error">{error}</div>}
      {initialLoading && <section className="panel skeleton-panel">Loading your connected home…</section>}

      <HouseMembersBar members={members} currentUserId={currentUser?.id} onOpen={openMembersPanel} />

      <section className="v91-autopilot-home-card" aria-label="GHM Autopilot">
        <div className="v91-autopilot-home-icon" aria-hidden="true">✦</div>
        <div className="v91-autopilot-home-copy">
          <p className="eyebrow">GHM AUTOPILOT · HOUSEHOLD GROCERY CFO</p>
          <h2>Stop managing every grocery decision yourself.</h2>
          <p>Autopilot connects inventory, meals, shopping, receipts, price history and safety checks to tell your household what needs attention next.</p>
          <div className="v91-autopilot-home-signals">
            <span className={stats.expiringSoon + stats.expired ? 'attention' : ''}><strong>{stats.expiringSoon + stats.expired}</strong><small>use/review soon</small></span>
            <span className={stats.lowStock + stats.outOfStock ? 'attention' : ''}><strong>{stats.lowStock + stats.outOfStock}</strong><small>restock signals</small></span>
            <span><strong>{stats.activeListItems}</strong><small>next-trip items</small></span>
            <span><strong>{stats.receiptCount}</strong><small>receipts learning prices</small></span>
          </div>
        </div>
        <div className="v91-autopilot-home-actions">
          <Link className="primary center-link" to={`/assistant?house=${id}`}>Open Autopilot →</Link>
          <small>Weekly plan · Budget Rescue · Receipt Guardian · Smart stock-up · Savings Ledger · Recall screening</small>
        </div>
      </section>

      <section className="v85-dashboard-grid" aria-label="Household overview">
        <div className="v85-dashboard-column v85-expense-column">
          <section className="v85-workspace-card v85-expense-overview">
            <header><div><p className="eyebrow">SMART EXPENSES</p><h2>Track. Split. Settle.</h2></div><Link to={`/houses/${id}/expenses`}>View all →</Link></header>
            <div className="v85-metric-grid">
              <div><small>House this month</small><strong>{money(expenseSnapshot.houseTotal)}</strong></div>
              <div><small>My share</small><strong>{money(expenseSnapshot.myShare)}</strong></div>
              <div><small>I paid</small><strong>{money(expenseSnapshot.myPaid)}</strong></div>
              <div className={expenseSnapshot.myBalance >= 0 ? 'positive' : 'negative'}><small>My position</small><strong>{expenseSnapshot.myBalance >= 0 ? 'Owed ' : 'Owe '}{money(Math.abs(expenseSnapshot.myBalance))}</strong></div>
            </div>
            <div className="v85-section-title"><strong>Suggested reimbursements</strong><Link to={`/houses/${id}/expenses`}>View all</Link></div>
            <div className="v85-reimbursement-list">
              {(expenseSummary?.suggested_payments || []).slice(0, 3).map((payment) => (
                <div key={`${payment.from_user_id}-${payment.to_user_id}`}><span className="avatar-dot">{payment.from_user_name.slice(0, 1).toUpperCase()}</span><p><small>{payment.from_user_name} → {payment.to_user_name}</small><strong>{money(payment.amount)}</strong></p></div>
              ))}
              {!expenseSummary?.suggested_payments?.length && <div className="v85-empty-mini">✓ No reimbursements needed right now.</div>}
            </div>
            <div className="v85-section-title"><strong>Monthly spending</strong><span>{expenseSnapshot.monthExpenses.length} expenses</span></div>
            <div className="v85-expense-chart">
              <div className="v85-donut" style={{ background: expenseSnapshot.categoryRows.length ? `conic-gradient(#38b87c 0 32%, #4aa4e8 32% 54%, #f4a93f 54% 72%, #926de8 72% 88%, #ef6f7c 88% 100%)` : '#edf3ef' }}><span><strong>{money(expenseSnapshot.houseTotal)}</strong><small>Total</small></span></div>
              <div className="v85-chart-legend">
                {expenseSnapshot.categoryRows.map(([category, amount], index) => <span key={category}><i className={`dot d${index}`} />{category}<b>{expenseSnapshot.houseTotal ? Math.round((amount / expenseSnapshot.houseTotal) * 100) : 0}%</b></span>)}
                {!expenseSnapshot.categoryRows.length && <small>No expenses recorded this month.</small>}
              </div>
            </div>
          </section>

          <Link to="/market" className="v85-workspace-card v85-flyer-card">
            <div><span className="v85-big-icon">%</span><p className="eyebrow">WEEKLY FLYERS & PRICES</p><h3>Find the best deals near you</h3><small>Compare your shopping list with active flyer prices and store deals.</small></div>
            <div className="v85-flyer-stack"><span>Walmart</span><span>Costco</span><span>Metro</span></div>
          </Link>
        </div>

        <div className="v85-dashboard-column v85-meals-column">
          <section className="v85-workspace-card v85-meals-overview">
            <header><div><p className="eyebrow">MEALS & RECIPES</p><h2>Cook from what you have</h2></div><Link to={`/houses/${id}/meals`}>View all →</Link></header>
            <Link to={`/houses/${id}/meals`} className="v85-recipe-search">⌕ Search recipes, cuisines and ingredients…</Link>
            <div className="v85-section-title"><strong>Cook from home</strong><span>Inventory-aware</span></div>
            <div className="v85-meal-cards">
              {mealSuggestions.map(({ recipe, score }) => <Link key={recipe.id} to={`/houses/${id}/meals`} className="v85-meal-card"><img src={recipe.image} alt={recipe.names.en}/><div><strong>{recipe.names.en}</strong><small>{recipe.cuisine} · {Math.round(score * 100)}% ready</small><em>{score >= .8 ? '✓ Ready' : score >= .5 ? 'Almost ready' : 'See missing items'}</em></div></Link>)}
            </div>
            <div className="v85-section-title"><strong>Browse Indian cuisine</strong><span>Regional favourites</span></div>
            <div className="v85-cuisine-grid">
              {Object.entries(cuisinePreviewIds).map(([cuisine, recipeId]) => { const recipe = recipes.find((item) => item.id === recipeId); return <Link key={cuisine} to={`/houses/${id}/meals`}><img src={recipe?.image || '/recipe-images/khichdi.svg'} alt=""/><span><strong>{cuisine}</strong><small>{cuisine === 'Gujarati' ? 'Taste of home' : cuisine === 'Punjabi' ? 'Rich & flavourful' : cuisine === 'South Indian' ? 'Comfort & tradition' : 'Classic favourites'}</small></span></Link>; })}
            </div>
            <div className="v85-meal-footer"><span><b>{stats.totalProducts}</b><small>inventory items</small></span><span><b>{stats.lowStock}</b><small>running low</small></span><span><b>{recipes.length}</b><small>built-in recipes</small></span></div>
          </section>

          <section className="v85-workspace-card v85-insight-strip">
            <div><span>📊</span><p><strong>Personal & household insights</strong><small>Know what you spend, buy and use most.</small></p></div>
            <Link to="/reports">Open reports →</Link>
          </section>
        </div>

        <div className="v85-dashboard-column v85-receipt-column">
          <section className="v85-workspace-card v85-receipt-overview">
            <header><div><p className="eyebrow">RECEIPTS THAT DO MORE</p><h2>Scan once. Organize everything.</h2></div><span className="badge">BETA</span></header>
            <div className="v85-receipt-visual"><div className="receipt-paper-mini"><b>{latestReceipt?.store_name || 'Your grocery store'}</b><i>────────────</i>{latestReceipt?.line_items?.filter((line) => line.line_type === 'product').slice(0,4).map((line) => <span key={line.id}>{line.description}<b>{line.line_total != null ? money(line.line_total) : line.unit_price != null ? money(line.unit_price) : '✓'}</b></span>)}{!latestReceipt?.line_items?.length && <><span>Items detected <b>✓</b></span><span>Prices saved <b>✓</b></span><span>Inventory updated <b>✓</b></span></>}<i>────────────</i><strong>{latestReceipt?.total_amount != null ? `TOTAL ${money(latestReceipt.total_amount)}` : 'Ready to scan'}</strong></div></div>
            <div className="v85-receipt-benefits"><span>✓ Compare with your shopping list</span><span>✓ Confirm missing or extra items</span><span>✓ Update inventory accurately</span><span>✓ Add the receipt to shared expenses</span></div>
            <Link className="primary full center-link v85-scan-cta" to={`/houses/${id}/scan`}>🧾 Upload & scan receipt</Link>
            <div className="v85-receipt-meta"><span><strong>{stats.receiptCount}</strong><small>saved receipts</small></span><span><strong>{latestReceiptDate}</strong><small>latest receipt</small></span></div>
          </section>

          <section className="v85-workspace-card v85-inventory-snapshot">
            <header><div><p className="eyebrow">INVENTORY</p><h3>Know what you have</h3></div><Link to={`/houses/${id}/inventory`}>Open →</Link></header>
            <div className="v85-stock-bars"><span><i style={{ width: `${Math.min(100, stats.totalProducts ? ((stats.totalProducts - stats.lowStock - stats.outOfStock) / stats.totalProducts) * 100 : 0)}%` }} />Healthy stock <b>{Math.max(0, stats.totalProducts - stats.lowStock - stats.outOfStock)}</b></span><span className="warn"><i style={{ width: `${Math.min(100, stats.totalProducts ? (stats.lowStock / stats.totalProducts) * 100 : 0)}%` }} />Low stock <b>{stats.lowStock}</b></span><span className="danger"><i style={{ width: `${Math.min(100, stats.totalProducts ? (stats.outOfStock / stats.totalProducts) * 100 : 0)}%` }} />Out of stock <b>{stats.outOfStock}</b></span></div>
          </section>
        </div>
      </section>

      <section className="v85-connected-flow" aria-label="Connected household workflow">
        <div><p className="eyebrow">EVERYTHING WORKS TOGETHER</p><h2>One connected system for your home</h2></div>
        <nav>
          <Link to={`/houses/${id}/inventory`}><span>📦</span><strong>Inventory</strong><small>Know what you have</small></Link><i>→</i>
          <Link to={`/houses/${id}/shopping`}><span>🛒</span><strong>Shopping</strong><small>Plan & buy smarter</small></Link><i>→</i>
          <Link to={`/houses/${id}/meals`}><span>🍲</span><strong>Meals</strong><small>Cook at home</small></Link><i>→</i>
          <Link to={`/houses/${id}/scan`}><span>🧾</span><strong>Receipts</strong><small>Scan & record</small></Link><i>→</i>
          <Link to={`/houses/${id}/expenses`}><span>💸</span><strong>Expenses</strong><small>Track & split</small></Link><i>→</i>
          <Link to="/reports"><span>📈</span><strong>Savings</strong><small>See progress</small></Link>
        </nav>
      </section>

      <section className="v85-utility-row">
        <div className="v85-shopping-mini"><div><p className="eyebrow">SHOPPING</p><h3>Your active list</h3></div><strong>{stats.activeListItems} to buy · {stats.activeListCart} in cart</strong><Link to={`/houses/${id}/shopping`}>Open list →</Link></div>
        <div className="v85-house-actions-inline"><button onClick={openMembersPanel} className="secondary">👥 Members</button><button onClick={createInvite} className="secondary">🔗 Invite</button></div>
      </section>

      <div className="house-dashboard-bottom-grid v85-management-zone">
        <ActivityFeed activities={activities} onRefresh={loadAll} />
        <section className="panel danger-zone creative-danger-zone"><h2>House access</h2>{isOwner ? <><p>You are the owner. Delete stays protected and only becomes available when you are the sole member.</p><button className="danger full" onClick={deleteHouse} disabled={!canDelete}>Delete house</button>{!canDelete && <small className="small-muted">Remove all other members first. Current members: {members.length}</small>}</> : <><p>You are a member. You can leave this house, but only the owner can delete it.</p><button className="danger full" onClick={leaveHouse}>Leave house</button></>}</section>
      </div>

      <MembersDrawer open={membersOpen} onClose={() => setMembersOpen(false)} members={members} currentUserId={currentUser?.id} houseRole={house?.role} onRemoveMember={removeMember} onCreateInvite={createInvite} inviteUrl={inviteUrl} />
    </main>
  );
}
