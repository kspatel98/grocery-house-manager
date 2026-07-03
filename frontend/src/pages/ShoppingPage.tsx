import { useEffect, useMemo, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { api, errorMessage } from '../api';
import { useHouseLiveRefresh } from '../hooks';
import type { Activity, House, HouseMember, Plan, Product, ShoppingList, Subscription } from '../types';
import ShoppingListPanel from '../components/ShoppingListPanel';
import { ActivityFeed, MembersPanel } from '../components/HouseInfoPanels';

export default function ShoppingPage() {
  const { houseId } = useParams();
  const id = Number(houseId);
  const [house, setHouse] = useState<House | null>(null);
  const [products, setProducts] = useState<Product[]>([]);
  const [activeLists, setActiveLists] = useState<ShoppingList[]>([]);
  const [selectedListId, setSelectedListId] = useState<number | null>(null);
  const [creatingNew, setCreatingNew] = useState(false);
  const [members, setMembers] = useState<HouseMember[]>([]);
  const [activities, setActivities] = useState<Activity[]>([]);
  const [subscription, setSubscription] = useState<Subscription | null>(null);
  const [housePlan, setHousePlan] = useState<Plan | null>(null);
  const [sortBy, setSortBy] = useState('store_name');
  const [direction, setDirection] = useState('asc');
  const [error, setError] = useState('');

  async function loadAll() {
    try {
      const [houseRes, productsRes, listsRes, membersRes, activitiesRes, subscriptionRes, housePlanRes] = await Promise.all([
        api.get<House>(`/houses/${id}`),
        api.get<Product[]>(`/houses/${id}/products`, { params: { sort_by: sortBy, direction } }),
        api.get<ShoppingList[]>(`/houses/${id}/shopping-lists`),
        api.get<HouseMember[]>(`/houses/${id}/members`),
        api.get<Activity[]>(`/houses/${id}/activities`, { params: { limit: 40 } }),
        api.get<Subscription>('/billing/me'),
        api.get<Plan>(`/houses/${id}/plan`),
      ]);
      setHouse(houseRes.data);
      setProducts(productsRes.data);
      setActiveLists(listsRes.data);
      setMembers(membersRes.data);
      setActivities(activitiesRes.data);
      setSubscription(subscriptionRes.data);
      setHousePlan(housePlanRes.data);
      setError('');

      if (!listsRes.data.length) {
        setCreatingNew(true);
        setSelectedListId(null);
      } else if (!creatingNew && (!selectedListId || !listsRes.data.some((list) => list.id === selectedListId))) {
        setSelectedListId(listsRes.data[0].id);
      }
    } catch (err) {
      setError(errorMessage(err));
    }
  }

  useEffect(() => { loadAll(); }, [id, sortBy, direction]);
  useHouseLiveRefresh(id, loadAll);

  const selectedList = useMemo(
    () => activeLists.find((list) => list.id === selectedListId) || activeLists[0] || null,
    [activeLists, selectedListId]
  );
  const listLimit = housePlan?.limits.active_lists_per_house ?? subscription?.limits.active_lists_per_house ?? 0;
  const canCreateMore = !listLimit || activeLists.length < listLimit;
  const activeListForPanel = creatingNew ? null : selectedList;

  return (
    <main className="page shell wide">
      <header className="topbar">
        <div>
          <Link to={`/houses/${id}`} className="breadcrumb">← Back to inventory</Link>
          <h1>{house?.name || 'House'} grocery lists</h1>
          <p>Create multiple shopping lists, check products into cart, then finish shopping to update inventory.</p>
        </div>
        <div className="shopping-topbar-actions">
          <Link to="/pricing" className="secondary center-link">Plans</Link>
          <Link to="/profile" className="secondary center-link">Profile</Link>
          <div className="shopping-sort-controls">
            <select value={sortBy} onChange={(e) => setSortBy(e.target.value)}>
              <option value="store_name">Store name</option>
              <option value="name">Product name</option>
              <option value="price">Price</option>
              <option value="quantity">Quantity</option>
              <option value="expiry_date">Expiry date</option>
              <option value="created_at">Newest</option>
            </select>
            <select value={direction} onChange={(e) => setDirection(e.target.value)}>
              <option value="asc">Ascending</option>
              <option value="desc">Descending</option>
            </select>
          </div>
        </div>
      </header>

      {error && <div className="error">{error}</div>}

      <div className="shopping-page-layout">
        <section className="shopping-main-column">
          <section className="panel list-switcher-panel">
            <div className="panel-title-row">
              <div>
                <h2>Active shopping lists</h2>
                <p>
                  {activeLists.length} active list{activeLists.length === 1 ? '' : 's'}
                  {housePlan ? ` / ${housePlan.limits.active_lists_per_house} allowed by owner plan (${housePlan.name})` : ''}
                </p>
              </div>
              <button
                className="primary"
                disabled={!canCreateMore}
                onClick={() => { setCreatingNew(true); setSelectedListId(null); }}
              >
                New list
              </button>
            </div>
            {!canCreateMore && <div className="hint">This house reached the owner plan's active shopping-list limit. Finish/cancel one, or ask the owner to upgrade.</div>}
            <div className="list-tabs">
              {activeLists.map((list) => (
                <button
                  key={list.id}
                  className={!creatingNew && (selectedListId === list.id || (!selectedListId && selectedList?.id === list.id)) ? 'list-tab active' : 'list-tab'}
                  onClick={() => { setCreatingNew(false); setSelectedListId(list.id); }}
                >
                  <strong>{list.title}</strong>
                  <small>{list.items.length} item{list.items.length === 1 ? '' : 's'}</small>
                </button>
              ))}
              {creatingNew && <button className="list-tab active"><strong>New grocery list</strong><small>Select products below</small></button>}
            </div>
          </section>

          <ShoppingListPanel
            houseId={id}
            products={products}
            activeList={activeListForPanel}
            onChange={loadAll}
            onListCreated={(list) => {
              setCreatingNew(false);
              setSelectedListId(list.id);
            }}
          />
        </section>
        <aside className="shopping-side-column">
          <MembersPanel members={members} />
          <ActivityFeed activities={activities} onRefresh={loadAll} />
        </aside>
      </div>
    </main>
  );
}
