import { Link } from 'react-router-dom';

function InstagramIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <rect x="3" y="3" width="18" height="18" rx="5" />
      <circle cx="12" cy="12" r="4" />
      <circle cx="17.5" cy="6.5" r="1" fill="currentColor" stroke="none" />
    </svg>
  );
}

const supportItems = [
  {
    title: 'Account and login',
    text: 'Use Google sign-in or email/password. If login fails, confirm you are using the same email address you used for your account.',
  },
  {
    title: 'Plans and billing',
    text: 'Paid plans are processed by Stripe. Profile shows your current plan, billing status, cancellation status, and subscription sync option.',
  },
  {
    title: 'House access',
    text: 'Free users can join houses by invite. Creating a house requires Basic Home or higher. House features follow the owner’s plan.',
  },
  {
    title: 'Unlocked and locked features',
    text: 'The Plans page now shows which tools are included or locked for Free Starter, Basic Home, Family Plus, and Household Pro.',
  },
  {
    title: 'Market tools and price comparison',
    text: 'Basic Home unlocks product lookup. Family Plus unlocks supported Canadian price comparison. Household Pro adds nearby store suggestions.',
  },
  {
    title: 'Receipts and prices',
    text: 'Smart Receipt Scan accepts clear JPG or PNG receipt photos and can prepare store name, item rows, discounts, taxes, and totals for review before saving trusted prices to household history.',
  },
]

export default function SupportPage() {
  const loggedIn = Boolean(localStorage.getItem('token'));

  return (
    <main className="page shell wide support-page">
      <header className="topbar">
        <div>
          <Link to={loggedIn ? '/houses' : '/'} className="breadcrumb">← {loggedIn ? 'Houses' : 'Home'}</Link>
          <p className="eyebrow">Support</p>
          <h1>How can we help?</h1>
          <p>Find quick guidance for accounts, houses, billing, plans, market tools, receipts, and subscriptions.</p>
        </div>
      </header>

      <section className="support-hero panel">
        <div>
          <h2>Need help with Grocery House Manager?</h2>
          <p>
            For account, billing, privacy, or technical questions, contact SupremDas Group support or follow our product updates on Instagram.
          </p>
          <div className="support-contact-stack">
            <a className="support-email" href="mailto:support@grocery-house-manager.com">support@grocery-house-manager.com</a>
            <a className="support-social-link" href="https://instagram.com/groceryhousemanager" target="_blank" rel="noreferrer">
              <span className="social-icon"><InstagramIcon /></span>
              <span>@groceryhousemanager</span>
            </a>
          </div>
        </div>
        <div className="support-actions">
          <Link to={loggedIn ? '/profile' : '/login'} className="primary center-link">{loggedIn ? 'Open profile' : 'Login'}</Link>
          <Link to="/pricing" className="secondary center-link">View plans</Link>
        </div>
      </section>

      <section className="support-grid">
        {supportItems.map((item) => (
          <article className="panel support-card" key={item.title}>
            <h2>{item.title}</h2>
            <p>{item.text}</p>
          </article>
        ))}
      </section>

      <section className="panel legal-card">
        <h2>Before contacting support</h2>
        <ul>
          <li>For billing issues, include your account email and plan name.</li>
          <li>For house access issues, include the house name and whether you are owner or member.</li>
          <li>For receipt or price-comparison issues, include the store name, city/postal code, item name, and whether the uploaded file was a JPG or PNG image.</li>
          <li>Never send full card numbers, passwords, or sensitive payment details.</li>
        </ul>
      </section>
    </main>
  );
}
