import { useEffect, useMemo, useRef, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { api, errorMessage } from '../api';
import { useHouseLiveRefresh } from '../hooks';
import type { Activity, House, HouseMember, Product, Receipt, ShoppingList, User } from '../types';
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
  const [inviteUrl, setInviteUrl] = useState('');
  const [error, setError] = useState('');
  const [membersOpen, setMembersOpen] = useState(false);
  const [initialLoading, setInitialLoading] = useState(true);
  const topRef = useRef<HTMLDivElement | null>(null);
  const inviteMessageRef = useRef<HTMLDivElement | null>(null);

  function focusTop() {
    requestAnimationFrame(() => {
      topRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    });
  }

  function openMembersPanel() {
    setMembersOpen(true);
    focusTop();
  }

  async function loadAll() {
    try {
      const [houseRes, productsRes, listRes, membersRes, activitiesRes, receiptsRes] = await Promise.all([
        api.get<House>(`/houses/${id}`),
        api.get<Product[]>(`/houses/${id}/products`, { params: { sort_by: 'name', direction: 'asc', limit: PRODUCT_PAGE_LIMIT } }),
        api.get<ShoppingList | null>(`/houses/${id}/shopping-lists/active`),
        api.get<HouseMember[]>(`/houses/${id}/members`),
        api.get<Activity[]>(`/houses/${id}/activities`, { params: { limit: 10 } }),
        api.get<Receipt[]>(`/houses/${id}/receipts`),
      ]);
      setHouse(houseRes.data);
      setProducts(productsRes.data);
      setActiveList(listRes.data);
      setMembers(membersRes.data);
      setReceipts(receiptsRes.data);
      setActivities(activitiesRes.data);
      setError('');
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

  const latestReceipt = receipts[0];
  const latestReceiptDate = latestReceipt?.receipt_date || (latestReceipt?.created_at ? new Date(latestReceipt.created_at).toLocaleDateString() : 'No saved receipts yet');
  const isOwner = house?.role === 'owner';
  const canDelete = isOwner && members.length === 1;

  useEffect(() => { loadAll(); }, [id]);
  useHouseLiveRefresh(id, loadAll);

  return (
    <main className="page shell wide house-dashboard-page cinematic-page">
      <div ref={topRef} tabIndex={-1} className="sr-focus-target" aria-hidden="true" />
      <header className="page-hero creative-hero house-main-hero">
        <div>
          <Link to="/houses" className="breadcrumb">← Home</Link>
          <p className="eyebrow">Your Grocery Home</p>
          <h1>{house?.name || 'House dashboard'}</h1>
          <p>Start with Inventory, Shopping, or Scan Receipt. Receipt history, prices, and reports stay available when you need the extra detail.</p>
          {house?.owner_name && <small className="small-muted">Owner: {house.owner_name}{house.owner_plan_name ? ` • Owner plan: ${house.owner_plan_name}` : ''}</small>}
        </div>
        <div className="hero-orb-card home-orb" aria-hidden="true">
          <span>🏡</span>
          <strong>{members.length} members</strong>
          <small>{house?.role || 'member'} access</small>
        </div>
      </header>

      {inviteUrl && <div className="success focus-result-card" ref={inviteMessageRef} tabIndex={-1}>Invite copied: {inviteUrl}</div>}
      {error && <div className="error">{error}</div>}
      {initialLoading && <section className="panel skeleton-panel">Loading house dashboard...</section>}

      <HouseMembersBar members={members} currentUserId={currentUser?.id} onOpen={openMembersPanel} />

      <section className="stats-grid four stats-ribbon">
        <div className="stat-card"><strong>{stats.totalProducts}</strong><span>Inventory products</span></div>
        <div className="stat-card warning"><strong>{stats.lowStock}</strong><span>Low stock</span></div>
        <div className="stat-card danger"><strong>{stats.outOfStock}</strong><span>Out of stock</span></div>
        <div className="stat-card"><strong>{stats.receiptCount}</strong><span>Saved receipts</span></div>
      </section>

      <section className="house-module-grid" aria-label="House sections">
        <Link to={`/houses/${id}/inventory`} className="module-card inventory-module">
          <span className="module-icon">📦</span>
          <small>Everyday</small>
          <strong>Inventory</strong>
          <p>Manage products, sections, expiry dates, low stock, out-of-stock items, and store-specific prices.</p>
          <em>{stats.totalProducts} products • {stats.expired} expired</em>
        </Link>

        <Link to={`/houses/${id}/shopping`} className="module-card shopping-module">
          <span className="module-icon">🛒</span>
          <small>Everyday</small>
          <strong>Shopping</strong>
          <p>Create shopping lists, add new products directly, group items by category, and compare live prices in a popup.</p>
          <em>{stats.activeListItems} to buy • {stats.activeListCart} in cart</em>
        </Link>

        <Link to={`/houses/${id}/scan`} className="module-card receipt-module featured-module">
          <span className="module-icon">🧾</span>
          <small>After shopping</small>
          <strong>Scan receipt</strong>
          <p>Upload JPG or PNG receipts, review extracted rows, then save trusted prices and inventory updates.</p>
          <em>Review before saving</em>
        </Link>

        <Link to={`/houses/${id}/receipts`} className="module-card history-module">
          <span className="module-icon">🗂️</span>
          <small>When needed</small>
          <strong>Receipt history</strong>
          <p>View uploaded receipt photos, extracted content, totals, payment labels, and delete receipts safely.</p>
          <em>Latest: {latestReceiptDate}</em>
        </Link>

        <Link to="/market" className="module-card prices-module">
          <span className="module-icon">🏷️</span>
          <small>Advanced</small>
          <strong>Prices</strong>
          <p>Look up products and compare latest available Canadian grocery prices when your plan allows it.</p>
          <em>Receipt + live price signals</em>
        </Link>

        <Link to="/reports" className="module-card reports-module">
          <span className="module-icon">📈</span>
          <small>Advanced</small>
          <strong>Reports</strong>
          <p>Review spending, store history, receipt totals, price insights, and export your household data.</p>
          <em>{stats.receiptCount} receipt records</em>
        </Link>
      </section>

      <div className="house-dashboard-bottom-grid">
        <ActivityFeed activities={activities} onRefresh={loadAll} />

        <section className="panel danger-zone creative-danger-zone">
          <h2>House access</h2>
          {isOwner ? (
            <>
              <p>You are the owner. Keep the delete action here on the main dashboard so it is easy to find but still protected.</p>
              <button className="danger full" onClick={deleteHouse} disabled={!canDelete}>Delete house</button>
              {!canDelete && <small className="small-muted">Remove all other members first. Current members: {members.length}</small>}
            </>
          ) : (
            <>
              <p>You are a member. You can leave this house, but only the owner can delete it.</p>
              <button className="danger full" onClick={leaveHouse}>Leave house</button>
            </>
          )}
        </section>
      </div>

      <div className="floating-house-actions" aria-label="Quick house actions">
        <button onClick={openMembersPanel} className="secondary">👥 Members</button>
        <button onClick={createInvite} className="secondary">🔗 Invite</button>
      </div>

      <MembersDrawer
        open={membersOpen}
        onClose={() => setMembersOpen(false)}
        members={members}
        currentUserId={currentUser?.id}
        houseRole={house?.role}
        onRemoveMember={removeMember}
        onCreateInvite={createInvite}
        inviteUrl={inviteUrl}
      />
    </main>
  );
}
