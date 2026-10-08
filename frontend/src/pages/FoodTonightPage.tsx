import { useEffect, useMemo, useState } from 'react';
import { Link, useParams, useSearchParams } from 'react-router-dom';
import { api, errorMessage } from '../api';
import type { FoodMenuGuide, FoodPlace, FoodSuggestions } from '../types';
import OverlayPortal from '../components/OverlayPortal';

type Mode = 'restaurant' | 'grocery';
type Dietary = 'none' | 'vegetarian' | 'vegan' | 'jain' | 'swaminarayan';

const DIET_LABELS: Record<Dietary, string> = {
  none: 'No special restriction',
  vegetarian: 'Vegetarian',
  vegan: 'Vegan',
  jain: 'Jain',
  swaminarayan: 'Swaminarayan · no onion / no garlic',
};

function localFallbackGuide(place: FoodPlace, dietary: Dietary): FoodMenuGuide {
  const scripts: Record<Dietary, string> = {
    none: 'Could you please confirm the ingredients and preparation for this dish before I order?',
    vegetarian: 'I am vegetarian. Can you please confirm this dish and its sauce or stock contain no meat, poultry, fish or other non-vegetarian ingredients?',
    vegan: 'I am vegan. Can you please confirm this dish contains no dairy, egg, ghee, honey or other animal-derived ingredients, including the sauce and garnish?',
    jain: 'I follow a Jain diet. Could you please confirm which dishes can be prepared according to Jain restrictions, including the ingredients in sauces, gravies and shared preparations?',
    swaminarayan: 'I follow a Swaminarayan diet. I cannot have onion or garlic, including in sauces, gravies, chutneys, marinades, spice mixes, stocks, toppings or garnishes. Can this dish be prepared without onion and garlic, and can you please confirm those ingredients are not already in the base sauce?',
  };
  const steps = [
    'Open the restaurant’s official menu or ordering page.',
    'Choose a dish only when its ingredients look compatible with your restriction.',
    dietary === 'swaminarayan' ? 'Request no onion and no garlic, including sauces, gravies, chutneys, marinades, spice mixes, stocks, toppings and garnishes.' : `Add your ${DIET_LABELS[dietary].toLowerCase()} requirement in the special-instructions box when available.`,
    'If a base sauce or preparation is unclear, call the restaurant before submitting the order.',
  ];
  return {
    place_id: place.place_id,
    place_name: place.name,
    dietary_mode: dietary,
    verified_items: [],
    possible_with_changes: [],
    avoid_or_uncertain: [],
    online_order_steps: steps,
    in_person_script: scripts[dietary],
    phone_script: scripts[dietary],
    official_menu_url: place.website_uri || null,
    official_website_url: place.website_uri || null,
    evidence_note: 'GHM could not read enough official menu evidence right now, so it is not making dish-level claims. Use this preparation guide and confirm the exact ingredients with the restaurant.',
    message: 'Safe ordering guidance is available even when the official menu cannot be analyzed. GHM will not guess that a dish meets your dietary restriction.',
  };
}

function serviceText(place: FoodPlace) {
  const rows: string[] = [];
  if (place.dine_in) rows.push('Dine-in');
  if (place.takeout) rows.push('Takeout');
  if (place.delivery) rows.push('Delivery');
  return rows.length ? rows.join(' · ') : 'Check service options';
}

export default function FoodTonightPage() {
  const { houseId } = useParams();
  const id = Number(houseId);
  const [params, setParams] = useSearchParams();
  const initialMode = params.get('mode') === 'grocery' ? 'grocery' : 'restaurant';
  const initialDiet = (params.get('diet') || 'none') as Dietary;
  const [mode, setMode] = useState<Mode>(initialMode);
  const [dietary, setDietary] = useState<Dietary>(Object.keys(DIET_LABELS).includes(initialDiet) ? initialDiet : 'none');
  const [query, setQuery] = useState(params.get('q') || '');
  const [openNow, setOpenNow] = useState(false);
  const [results, setResults] = useState<FoodSuggestions | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [shareNotice, setShareNotice] = useState('');
  const [location, setLocation] = useState<{ latitude: number; longitude: number } | null>(null);
  const [locationState, setLocationState] = useState<'idle' | 'requesting' | 'ready' | 'denied'>('idle');
  const [guide, setGuide] = useState<FoodMenuGuide | null>(null);
  const [guideBusy, setGuideBusy] = useState('');

  const subtitle = mode === 'restaurant'
    ? 'A small household-aware shortlist for tonight. GHM helps you prepare before you arrive or order.'
    : 'Nearby grocery and food stores when you need a quick top-up. Shopping intelligence stays in Shop.';

  function requestLocation() {
    if (!navigator.geolocation) {
      setLocationState('denied');
      return;
    }
    setLocationState('requesting');
    navigator.geolocation.getCurrentPosition(
      (position) => {
        setLocation({ latitude: position.coords.latitude, longitude: position.coords.longitude });
        setLocationState('ready');
      },
      () => setLocationState('denied'),
      { enableHighAccuracy: false, timeout: 8000, maximumAge: 10 * 60 * 1000 },
    );
  }

  async function search(nextMode: Mode = mode) {
    try {
      setBusy(true);
      setError('');
      setGuide(null);
      const nextParams = new URLSearchParams(params);
      nextParams.set('mode', nextMode);
      if (dietary !== 'none') nextParams.set('diet', dietary); else nextParams.delete('diet');
      if (query.trim()) nextParams.set('q', query.trim()); else nextParams.delete('q');
      setParams(nextParams, { replace: true });
      const { data } = await api.get<FoodSuggestions>(`/food/houses/${id}/suggestions`, {
        params: {
          mode: nextMode,
          dietary_mode: nextMode === 'restaurant' ? dietary : 'none',
          query: query.trim() || undefined,
          latitude: location?.latitude,
          longitude: location?.longitude,
          open_now: openNow,
          t: Date.now(),
        },
      });
      setResults(data);
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setBusy(false);
    }
  }

  async function sharePlace(place: FoodPlace) {
    try {
      const details = [place.address, place.rating ? `★ ${place.rating.toFixed(1)}` : '', place.open_now == null ? '' : (place.open_now ? 'Open now' : 'Closed now')].filter(Boolean).join(' · ');
      await api.post(`/houses/${id}/chat`, {
        message: '',
        attachment_type: 'restaurant',
        attachment_title: place.name,
        attachment_subtitle: details || 'Nearby place from Food tonight',
        attachment_url: `/houses/${id}/food?mode=${mode}&q=${encodeURIComponent(query || place.name)}`,
      });
      setError('');
      setShareNotice(`${place.name} shared to House Chat.`);
      window.setTimeout(() => setShareNotice(''), 3200);
    } catch (err) {
      setError(errorMessage(err));
    }
  }

  async function loadGuide(place: FoodPlace) {
    try {
      setGuideBusy(place.place_id);
      setError('');
      const { data } = await api.post<FoodMenuGuide>(`/food/houses/${id}/menu-guide`, {
        place_id: place.place_id,
        dietary_mode: dietary,
        place_name: place.name,
        website_uri: place.website_uri || undefined,
        maps_uri: place.maps_uri || undefined,
      });
      setGuide(data);
    } catch (err) {
      // The order-prep action should never feel dead. If rich menu analysis is
      // temporarily unavailable, open a conservative local guide instead of
      // leaving the user with a button that appears to do nothing.
      setError(`${errorMessage(err)} Showing a safe preparation guide instead.`);
      setGuide(localFallbackGuide(place, dietary));
    } finally {
      setGuideBusy('');
    }
  }

  useEffect(() => { void search(mode); }, [location?.latitude, location?.longitude]);

  const visiblePlaces = useMemo(() => results?.places.slice(0, 5) || [], [results]);

  return (
    <main className="page shell wide food-tonight-page-v98">
      <header className="food-tonight-hero-v98">
        <div><Link className="breadcrumb" to={`/assistant?house=${id}&view=plan`}>← Back to Plan</Link><p className="eyebrow">FOOD TONIGHT</p><h1>Decide dinner without opening five different apps.</h1><p>{subtitle}</p></div>
        <div className="food-tonight-hero-actions-v98">
          <button className={mode === 'restaurant' ? 'primary' : 'secondary'} onClick={() => { setMode('restaurant'); void search('restaurant'); }}>🍽️ Restaurants</button>
          <button className={mode === 'grocery' ? 'primary' : 'secondary'} onClick={() => { setMode('grocery'); void search('grocery'); }}>🛍️ Food stores</button>
        </div>
      </header>

      <section className="food-tonight-control-v98">
        {mode === 'restaurant' && <label><span>Dietary preference</span><select value={dietary} onChange={(event) => setDietary(event.target.value as Dietary)}>{(Object.keys(DIET_LABELS) as Dietary[]).map((key) => <option key={key} value={key}>{DIET_LABELS[key]}</option>)}</select></label>}
        <label className="food-query-v98"><span>{mode === 'restaurant' ? 'What are you in the mood for? · optional' : 'What kind of store? · optional'}</span><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder={mode === 'restaurant' ? 'Indian, pizza, Gujarati, Thai…' : 'Indian grocery, supermarket, bakery…'} /></label>
        <label className="food-open-toggle-v98"><input type="checkbox" checked={openNow} onChange={(event) => setOpenNow(event.target.checked)} /><span>Open now</span></label>
        <button className="primary" onClick={() => void search()} disabled={busy}>{busy ? 'Checking nearby…' : 'Find nearby'}</button>
      </section>

      <section className="food-location-strip-v98">
        <div><strong>{locationState === 'ready' ? 'Using your current area' : 'Using your saved city/country'}</strong><small>{locationState === 'denied' ? 'Precise location was not shared; GHM can still use the location saved in your profile.' : 'Your exact coordinates are sent only for this nearby search when you allow them.'}</small></div>
        {locationState !== 'ready' && <button className="secondary" onClick={requestLocation} disabled={locationState === 'requesting'}>{locationState === 'requesting' ? 'Checking…' : 'Use current location'}</button>}
      </section>

      {error && <div className="error">{error}</div>}
      {shareNotice && <div className="success compact-message">{shareNotice}</div>}
      {results?.caution && <div className="food-safety-note-v98"><strong>Important dietary note</strong><p>{results.caution}</p></div>}

      {!busy && results && !results.configured && <section className="panel"><h2>Nearby suggestions need one connection</h2><p>{results.message}</p><p className="muted">GHM does not need Instacart, Uber Eats or DoorDash for this suggestion-only experience.</p></section>}

      <section className="food-result-grid-v98">
        {visiblePlaces.map((place, index) => <article key={place.place_id} className="food-place-card-v98">
          <div className="food-place-rank-v98"><span>{index === 0 ? 'Top nearby' : `Option ${index + 1}`}</span>{place.open_now != null && <b className={place.open_now ? 'open' : 'closed'}>{place.open_now ? 'Open' : 'Closed'}</b>}</div>
          <h2>{place.name}</h2>
          <p>{place.address || 'Open Maps for address'}</p>
          <div className="food-place-meta-v98"><span>★ {place.rating?.toFixed(1) || '—'}{place.user_rating_count ? ` · ${place.user_rating_count.toLocaleString()} ratings` : ''}</span><span>{place.price_level || 'Price not listed'}</span><span>{serviceText(place)}</span></div>
          {mode === 'restaurant' && dietary !== 'none' && <div className={`food-dietary-status-v98 ${place.dietary_status}`}><strong>{place.dietary_status === 'promising' ? 'Dietary signal found' : place.dietary_status === 'modification_may_be_possible' ? 'Modification may be possible' : 'Needs confirmation'}</strong><p>{place.dietary_note}</p></div>}
          <div className="food-place-actions-v98">
            {place.maps_uri && <a className="secondary center-link" href={place.maps_uri} target="_blank" rel="noreferrer">Maps</a>}
            {place.website_uri && <a className="secondary center-link" href={place.website_uri} target="_blank" rel="noreferrer">Official site</a>}
            <button className="secondary" type="button" onClick={() => void sharePlace(place)}>💬 Share</button>
            {mode === 'restaurant' && dietary !== 'none' && <button className="primary" onClick={() => void loadGuide(place)} disabled={guideBusy === place.place_id}>{guideBusy === place.place_id ? 'Reading official menu…' : 'Prepare my order'}</button>}
          </div>
          {mode === 'restaurant' && dietary === 'none' && <small className="food-card-note-v98">GHM keeps ordering outside the app for now so Food Tonight stays focused on the decision, not checkout complexity.</small>}
        </article>)}
      </section>

      {results && results.places.length > 5 && <div className="food-more-note-v98">GHM found {results.places.length} options but shows only the strongest five first to keep the decision calm.</div>}

      <section className="food-context-card-v98"><span>🍳</span><div><small>STILL WANT TO COOK?</small><strong>Compare eating out with what is already at home.</strong><p>GHM can plan a meal around inventory and use-soon food instead of turning restaurants into another permanent module.</p></div><Link className="secondary center-link" to={`/assistant?house=${id}&view=plan`}>Plan from home →</Link></section>

      {guide && <OverlayPortal><div className="overlay-backdrop food-guide-backdrop-v98" onMouseDown={(event) => { if (event.target === event.currentTarget) setGuide(null); }}><section className="food-menu-guide-v98" role="dialog" aria-modal="true" aria-label={`Ordering guide for ${guide.place_name}`}>
        <header><div><p className="eyebrow">ORDER PREP</p><h2>{guide.place_name}</h2><p>{guide.message}</p></div><button className="icon-button" onClick={() => setGuide(null)} data-dialog-close="true" aria-label="Close order preparation">×</button></header>
        <div className="food-evidence-note-v98"><strong>What GHM knows</strong><p>{guide.evidence_note}</p></div>
        {guide.verified_items.length > 0 && <section><h3>✓ Explicitly supported by menu evidence</h3>{guide.verified_items.map((item) => <article key={item.item_name}><strong>{item.item_name}</strong><p>{item.reason}</p></article>)}</section>}
        {guide.possible_with_changes.length > 0 && <section><h3>◇ May work with modifications</h3>{guide.possible_with_changes.map((item) => <article key={item.item_name}><strong>{item.item_name}</strong><p>{item.reason}</p>{item.modifications.length > 0 && <ul>{item.modifications.map((row) => <li key={row}>{row}</li>)}</ul>}</article>)}</section>}
        {guide.avoid_or_uncertain.length > 0 && <section><h3>? Avoid or confirm carefully</h3>{guide.avoid_or_uncertain.map((item) => <article key={item.item_name}><strong>{item.item_name}</strong><p>{item.reason}</p></article>)}</section>}
        <section className="food-script-v98"><h3>What to say in person</h3><p>{guide.in_person_script}</p><button className="secondary" onClick={() => navigator.clipboard?.writeText(guide.in_person_script)}>Copy wording</button></section>
        <section><h3>Ordering online</h3><ol>{guide.online_order_steps.map((step) => <li key={step}>{step}</li>)}</ol></section>
        <footer>{guide.official_menu_url && <a className="primary center-link" href={guide.official_menu_url} target="_blank" rel="noreferrer">Open official menu</a>}{guide.official_website_url && <a className="secondary center-link" href={guide.official_website_url} target="_blank" rel="noreferrer">Restaurant website</a>}</footer>
      </section></div></OverlayPortal>}
    </main>
  );
}
