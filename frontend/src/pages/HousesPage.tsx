import { useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { api, errorMessage } from '../api';
import type { House } from '../types';

export default function HousesPage() {
  const [houses, setHouses] = useState<House[]>([]);
  const [name, setName] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);
  const navigate = useNavigate();

  async function load() {
    try {
      setLoading(true);
      setError('');
      const { data } = await api.get<House[]>('/houses', { params: { t: Date.now() } });
      setHouses(Array.isArray(data) ? data : []);
    } catch (err) {
      setError(errorMessage(err));
      setHouses([]);
    } finally {
      setLoading(false);
    }
  }

  async function createHouse(event: React.FormEvent) {
    event.preventDefault();
    if (!name.trim()) return;
    try {
      setError('');
      const { data } = await api.post<House>('/houses', { name: name.trim() });
      setName('');
      navigate(`/houses/${data.id}`);
    } catch (err) {
      setError(errorMessage(err));
    }
  }

  useEffect(() => { load(); }, []);

  return (
    <main className="page shell">
      <header className="topbar">
        <div>
          <h1>Your houses</h1>
          <p>Create one house for your family or roommates and invite them with a link.</p>
        </div>
        <div className="topbar-actions">
          <button className="secondary" onClick={load}>Refresh</button>
          <Link to="/pricing" className="secondary center-link">Plans</Link>
          <Link to="/profile" className="secondary center-link">Profile</Link>
        </div>
      </header>

      <section className="panel">
        <h2>Create a house</h2>
        <form onSubmit={createHouse} className="inline-form">
          <input placeholder="Example: Patel Family Home" value={name} onChange={(e) => setName(e.target.value)} />
          <button className="primary">Create</button>
        </form>
      </section>

      {error && <div className="error">{error}</div>}
      {loading && <div className="panel muted-panel">Loading your houses...</div>}
      {!loading && !error && houses.length === 0 && (
        <section className="panel empty-state">
          <h2>No houses found for this account</h2>
          <p>
            If you already created a house, make sure you are logged in with the same email/account and using
            <strong> grocery-house-manager.com</strong>, not a different www/non-www address.
          </p>
          <button className="secondary" onClick={load}>Check again</button>
        </section>
      )}
      <div className="grid houses-grid">
        {houses.map((house) => (
          <Link to={`/houses/${house.id}`} key={house.id} className="house-card">
            <span className="house-icon">🏠</span>
            <strong>{house.name}</strong>
            <small>{house.role}</small>
          </Link>
        ))}
      </div>
    </main>
  );
}
