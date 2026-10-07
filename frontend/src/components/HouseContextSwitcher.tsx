import { useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { api, errorMessage } from '../api';
import type { AccountBootstrap, House } from '../types';

type HouseContextSwitcherProps = {
  currentHouseId: number;
  currentHouseName?: string;
  section: 'inventory' | 'shopping' | 'meals' | 'expenses' | 'templates';
};

export default function HouseContextSwitcher({ currentHouseId, currentHouseName, section }: HouseContextSwitcherProps) {
  const navigate = useNavigate();
  const [houses, setHouses] = useState<House[]>(() => {
    try { const cached = JSON.parse(localStorage.getItem('account_bootstrap_cache_v106') || 'null') as AccountBootstrap | null; return Array.isArray(cached?.houses) ? cached!.houses : []; } catch { return []; }
  });
  const [loading, setLoading] = useState(() => houses.length === 0);
  const [error, setError] = useState('');

  useEffect(() => {
    let cancelled = false;
    api.get<AccountBootstrap>('/account/bootstrap', { params: { t: Date.now() } })
      .then(({ data }) => {
        if (cancelled) return;
        setHouses(data.houses || []);
        localStorage.setItem('account_bootstrap_cache_v106', JSON.stringify(data));
        setError('');
      })
      .catch((err) => {
        if (cancelled) return;
        if (!houses.length) setError(errorMessage(err));
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => { cancelled = true; };
  }, [currentHouseId]);

  function switchHouse(nextId: number) {
    if (!nextId || nextId === currentHouseId) return;
    localStorage.setItem('ghm_active_house_id', String(nextId));
    window.dispatchEvent(new CustomEvent('house:active', { detail: { houseId: nextId } }));
    navigate(`/houses/${nextId}/${section}`);
  }

  const current = houses.find((house) => house.id === currentHouseId);
  const displayName = current?.name || currentHouseName || 'Current Home';
  const roleLabel = (role?: House['role']) => role ? `${role.charAt(0).toUpperCase()}${role.slice(1)}` : '';

  return (
    <section className="house-context-switcher" aria-label="Current Grocery Home">
      <div className="house-context-copy">
        <span className="house-context-icon" aria-hidden="true">⌂</span>
        <div>
          <small>WORKING IN</small>
          <strong>{displayName}</strong>
        </div>
      </div>
      <div className="house-context-actions">
        {loading ? (
          <span className="house-context-loading">Loading Homes…</span>
        ) : houses.length > 1 ? (
          <label className="house-context-select-wrap">
            <span className="sr-only">Switch Grocery Home</span>
            <select
              value={currentHouseId}
              onChange={(event) => switchHouse(Number(event.target.value))}
              aria-label="Switch Grocery Home"
            >
              {houses.map((house) => (
                <option key={house.id} value={house.id}>{house.name}{house.role ? ` · ${roleLabel(house.role)}` : ''}</option>
              ))}
            </select>
            <span aria-hidden="true">⌄</span>
          </label>
        ) : (
          <span className="house-context-only">Your Home</span>
        )}
        <Link to="/houses" className="house-context-manage">Manage Homes</Link>
      </div>
      {error ? <small className="house-context-error" title={error}>We couldn’t refresh your Homes right now. Your current Home is still available.</small> : null}
    </section>
  );
}
