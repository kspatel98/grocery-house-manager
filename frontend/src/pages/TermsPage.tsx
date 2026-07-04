import { Link } from 'react-router-dom';

export default function TermsPage() {
  return (
    <main className="page shell legal-page">
      <header className="topbar legal-header">
        <div>
          <Link to="/" className="breadcrumb">← Home</Link>
          <p className="eyebrow">SupremDas Group</p>
          <h1>Terms of Service</h1>
          <p>Last updated: July 2026</p>
        </div>
      </header>

      <section className="panel legal-card">
        <p>
          These Terms apply to Grocery House Manager, a household grocery management SaaS product from SupremDas Group. By creating an account, joining a house, or using paid features, you agree to use the service responsibly and according to these Terms.
        </p>

        <h2>Service purpose</h2>
        <p>
          Grocery House Manager helps households manage grocery inventory, shopping lists, receipts, store prices, members, and activity. It is intended for personal and household productivity use.
        </p>

        <h2>Accounts and security</h2>
        <ul>
          <li>You are responsible for keeping your account secure.</li>
          <li>Use accurate account information and do not impersonate another person.</li>
          <li>Only invite people you trust into a house because house members can view shared house data.</li>
        </ul>

        <h2>Subscriptions and plan limits</h2>
        <p>
          Paid plans are billed through Stripe. House features are based on the house owner’s plan. A member’s own plan controls their own account benefits, owned-house capacity, and personal premium tools. Plan limits, features, and prices may change in the future, but active users will be informed when material changes affect them.
        </p>

        <h2>Coupons and offers</h2>
        <p>
          Coupons, new-user offers, and promotional discounts are not stackable unless explicitly stated. A coupon must be active, valid, and eligible at the time of checkout. SupremDas Group may limit, expire, or revoke promotions if misuse or technical errors occur.
        </p>

        <h2>Receipt scanning and product data</h2>
        <p>
          Receipt scanning, OCR, price matching, and product suggestions are provided for convenience. Results may be incomplete or inaccurate. Users should review receipt details, product quantities, prices, and inventory updates before relying on them.
        </p>

        <h2>Acceptable use</h2>
        <ul>
          <li>Do not upload illegal, harmful, abusive, or unrelated content.</li>
          <li>Do not attempt to break, reverse engineer, overload, or misuse the service.</li>
          <li>Do not use the service to violate privacy, payment, or intellectual-property rights.</li>
        </ul>

        <h2>Availability</h2>
        <p>
          SupremDas Group aims to provide a reliable service, but the app may sometimes be unavailable due to maintenance, hosting issues, third-party outages, or unexpected technical problems.
        </p>

        <h2>Cancellation</h2>
        <p>
          Users can manage or cancel subscriptions from the Profile page. Cancellation normally takes effect at the end of the current billing period, and paid access may continue until that period ends.
        </p>

        <h2>Contact</h2>
        <p>
          For support or billing questions, contact <strong>support@grocery-house-manager.com</strong>.
        </p>
      </section>
    </main>
  );
}
