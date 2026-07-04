import { Link } from 'react-router-dom';

const supportItems = [
  {
    title: 'Account and login',
    text: 'Use Google sign-in or email/password. If login fails, confirm you are using the same email address you used for your account.',
  },
  {
    title: 'Plans and billing',
    text: 'Manage billing, sync subscription, or cancel from Profile. Paid plans are processed by Stripe.',
  },
  {
    title: 'House access',
    text: 'Free users can join houses by invite. Creating a house requires Basic Home or higher. House features follow the owner’s plan.',
  },
  {
    title: 'Receipts and prices',
    text: 'Receipt scanning helps extract prices, but always review OCR results before updating inventory or relying on store-price history.',
  },
];

export default function SupportPage() {
  const loggedIn = Boolean(localStorage.getItem('token'));

  return (
    <main className="page shell wide support-page">
      <header className="topbar">
        <div>
          <Link to={loggedIn ? '/houses' : '/'} className="breadcrumb">← {loggedIn ? 'Houses' : 'Home'}</Link>
          <p className="eyebrow">Support</p>
          <h1>How can we help?</h1>
          <p>Find quick guidance for accounts, houses, billing, receipts, and subscriptions.</p>
        </div>
      </header>

      <section className="support-hero panel">
        <div>
          <h2>Need help with Grocery House Manager?</h2>
          <p>
            For account, billing, privacy, or technical questions, contact SupremDas Group support.
          </p>
          <p className="support-email">support@grocery-house-manager.com</p>
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
          <li>For receipt issues, include the store name and whether the uploaded file was an image or PDF.</li>
          <li>Never send full card numbers, passwords, or sensitive payment details.</li>
        </ul>
      </section>
    </main>
  );
}
