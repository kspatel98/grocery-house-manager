import { Link } from 'react-router-dom';

type HouseholdWorldProps = {
  houseId?: number;
  variant?: 'public' | 'app';
  itemsToBuy?: number;
  useSoon?: number;
  expired?: number;
  verifiedSavings?: string;
};

type IconName = 'sparkles' | 'home' | 'scan' | 'meal' | 'cart' | 'value';

function WorldIcon({ name, size = 21 }: { name: IconName; size?: number }) {
  const common = { width: size, height: size, viewBox: '0 0 24 24', fill: 'none', stroke: 'currentColor', strokeWidth: 1.9, strokeLinecap: 'round' as const, strokeLinejoin: 'round' as const, 'aria-hidden': true };
  if (name === 'sparkles') return <svg {...common}><path d="m12 3 1.4 3.6L17 8l-3.6 1.4L12 13l-1.4-3.6L7 8l3.6-1.4L12 3Z"/><path d="m19 14 .8 2.2L22 17l-2.2.8L19 20l-.8-2.2L16 17l2.2-.8L19 14Z"/><path d="M5 14.5 5.8 17 8 18l-2.2.8L5 21l-.8-2.2L2 18l2.2-1L5 14.5Z"/></svg>;
  if (name === 'home') return <svg {...common}><path d="m3.5 10 8.5-7 8.5 7"/><path d="M5.5 9.5V21h13V9.5"/><path d="M9.5 21v-7h5v7"/></svg>;
  if (name === 'scan') return <svg {...common}><path d="M4 8V5a1 1 0 0 1 1-1h3"/><path d="M16 4h3a1 1 0 0 1 1 1v3"/><path d="M20 16v3a1 1 0 0 1-1 1h-3"/><path d="M8 20H5a1 1 0 0 1-1-1v-3"/><path d="M7 12h10"/><path d="M9 9h6"/><path d="M9 15h6"/></svg>;
  if (name === 'meal') return <svg {...common}><path d="M5 3v7"/><path d="M8 3v7"/><path d="M5 7h3"/><path d="M6.5 10v11"/><path d="M15 3c2.8 2 3.2 7.2 0 9v9"/><path d="M15 3v9"/></svg>;
  if (name === 'cart') return <svg {...common}><circle cx="9" cy="20" r="1.5"/><circle cx="18" cy="20" r="1.5"/><path d="M3 4h2l2.2 10.2a2 2 0 0 0 2 1.6h7.9a2 2 0 0 0 1.9-1.4L21 8H7"/></svg>;
  return <svg {...common}><circle cx="12" cy="12" r="9"/><path d="M15.5 8.8c-.7-.7-1.8-1.1-3-1.1-1.8 0-3 .8-3 2s1.2 1.8 3.2 2.2c2 .4 3 1 3 2.2s-1.3 2.2-3.2 2.2c-1.3 0-2.6-.5-3.4-1.4"/><path d="M12.5 6v12"/></svg>;
}

export default function HouseholdWorld({
  houseId,
  variant = 'public',
  itemsToBuy = 0,
  useSoon = 0,
  expired = 0,
  verifiedSavings = '$0.00',
}: HouseholdWorldProps) {
  const isApp = variant === 'app' && Boolean(houseId);
  const links = {
    kitchen: isApp ? `/houses/${houseId}/kitchen` : '/kitchen-vision',
    plan: isApp ? `/assistant?house=${houseId}&view=plan` : '/meal-planning',
    shop: isApp ? `/houses/${houseId}/shopping` : '/grocery-price-intelligence',
    value: isApp ? '/reports' : '/savings',
  };

  return (
    <section className={`ghm-world-v97 ${isApp ? 'is-app' : 'is-public'}`} aria-label="Connected Grocery House Manager household system">
      <div className="ghm-world-copy-v97">
        <span className="ghm-world-kicker-v97"><WorldIcon name="sparkles" size={14} /> GHM HOUSEHOLD WORLD</span>
        <h2>{isApp ? 'Your household, connected.' : 'Different signals. One household system.'}</h2>
        <p>{isApp
          ? 'GHM connects the kitchen, weekly plan, shopping decisions and verified value without making you manage four separate systems.'
          : 'What comes home, what remains, what gets used and what you buy next all feed the same calm household picture.'}
        </p>
      </div>

      <div className="ghm-world-stage-v97">
        <svg className="ghm-world-network-v97" viewBox="0 0 800 520" role="presentation" aria-hidden="true">
          <defs>
            <linearGradient id="ghmWorldPlate" x1="0" x2="1" y1="0" y2="1">
              <stop offset="0" stopColor="var(--ghm-world-plate-start)" />
              <stop offset="1" stopColor="var(--ghm-world-plate-end)" />
            </linearGradient>
            <linearGradient id="ghmWorldHouse" x1="0" x2="1" y1="0" y2="1">
              <stop offset="0" stopColor="var(--ghm-primary)" />
              <stop offset="1" stopColor="var(--ghm-primary-deep)" />
            </linearGradient>
            <filter id="ghmWorldGlow" x="-80%" y="-80%" width="260%" height="260%">
              <feGaussianBlur stdDeviation="9" result="blur" />
              <feMerge><feMergeNode in="blur" /><feMergeNode in="SourceGraphic" /></feMerge>
            </filter>
          </defs>

          <ellipse cx="400" cy="302" rx="286" ry="142" fill="url(#ghmWorldPlate)" opacity=".92" />
          <ellipse cx="400" cy="324" rx="250" ry="105" fill="none" stroke="var(--ghm-world-ring)" strokeWidth="2" opacity=".72" />
          <path className="ghm-world-path-v97 path-one" d="M400 270 C315 240 250 195 191 148" />
          <path className="ghm-world-path-v97 path-two" d="M400 270 C492 232 555 193 616 147" />
          <path className="ghm-world-path-v97 path-three" d="M400 305 C503 328 576 363 628 411" />
          <path className="ghm-world-path-v97 path-four" d="M400 305 C304 337 242 370 180 414" />
          <circle cx="191" cy="148" r="7" fill="var(--ghm-accent)" filter="url(#ghmWorldGlow)" />
          <circle cx="616" cy="147" r="7" fill="var(--ghm-primary-bright)" filter="url(#ghmWorldGlow)" />
          <circle cx="628" cy="411" r="7" fill="var(--ghm-info)" filter="url(#ghmWorldGlow)" />
          <circle cx="180" cy="414" r="7" fill="var(--ghm-gold)" filter="url(#ghmWorldGlow)" />

          <g className="ghm-world-house-svg-v97" transform="translate(317 180)">
            <path d="M17 78 83 24l66 54v96H17Z" fill="url(#ghmWorldHouse)" />
            <path d="m5 82 78-66 78 66" fill="none" stroke="var(--ghm-gold)" strokeWidth="10" strokeLinecap="round" strokeLinejoin="round" />
            <rect x="70" y="107" width="28" height="67" rx="7" fill="var(--ghm-world-door)" />
            <rect x="34" y="96" width="25" height="27" rx="6" fill="var(--ghm-world-window)" />
            <rect x="108" y="96" width="25" height="27" rx="6" fill="var(--ghm-world-window)" />
            <path d="M31 191c21-19 42-26 55-16 13-18 45-12 57 16" fill="none" stroke="var(--ghm-primary-bright)" strokeWidth="8" strokeLinecap="round" opacity=".72" />
          </g>
        </svg>

        <div className="ghm-world-core-v97">
          <span><WorldIcon name="home" size={28} /></span>
          <small>ONE HOME</small>
          <strong>GHM</strong>
        </div>

        <Link className="ghm-world-node-v97 node-kitchen" to={links.kitchen}>
          <span><WorldIcon name="scan" /></span>
          <div><small>KITCHEN</small><strong>{isApp ? `${useSoon} use soon` : 'See what remains'}</strong>{isApp && expired > 0 ? <em>{expired} expired · review</em> : <em>Kitchen Map + inventory</em>}</div>
        </Link>

        <Link className="ghm-world-node-v97 node-plan" to={links.plan}>
          <span><WorldIcon name="meal" /></span>
          <div><small>PLAN</small><strong>{isApp ? 'Build the week' : 'Plan from real stock'}</strong><em>Meals + household forecast</em></div>
        </Link>

        <Link className="ghm-world-node-v97 node-shop" to={links.shop}>
          <span><WorldIcon name="cart" /></span>
          <div><small>SHOP</small><strong>{isApp ? `${itemsToBuy} item${itemsToBuy === 1 ? '' : 's'} to buy` : 'Prepare the smart trip'}</strong><em>Prices + preferences</em></div>
        </Link>

        <Link className="ghm-world-node-v97 node-value" to={links.value}>
          <span><WorldIcon name="value" /></span>
          <div><small>VALUE</small><strong>{isApp ? verifiedSavings : 'Prove the value'}</strong><em>{isApp ? 'verified this month' : 'Verified ≠ estimated'}</em></div>
        </Link>
      </div>

      <div className="ghm-world-foot-v97">
        <span><b>✓</b> Verified</span>
        <span><b>◇</b> Estimated</span>
        <span><b>✦</b> Prediction</span>
        <span><b>?</b> Needs review</span>
      </div>
    </section>
  );
}
