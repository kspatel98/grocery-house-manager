import { Link } from 'react-router-dom';

export default function RefundPolicyPage() {
  return (
    <main className="page shell legal-page">
      <header className="topbar legal-header">
        <div>
          <Link to="/" className="breadcrumb">← Home</Link>
          <p className="eyebrow">SupremDas Group</p>
          <h1>Refund and Cancellation Policy</h1>
          <p>Last updated: July 2026</p>
        </div>
      </header>

      <section className="panel legal-card">
        <h2>Monthly subscriptions</h2>
        <p>
          Grocery House Manager subscriptions are billed monthly through Stripe. Users can manage billing or cancel from the Profile page.
        </p>

        <h2>Cancellation</h2>
        <p>
          When a subscription is cancelled, cancellation is normally scheduled for the end of the current billing period. You may continue using paid features until that billing period ends. After the period ends, your account returns to the appropriate free access level.
        </p>

        <h2>Refunds</h2>
        <p>
          Because plans are monthly and low-cost, payments are generally non-refundable after a billing period begins, except where required by law or where SupremDas Group determines that a billing or technical issue justifies a refund.
        </p>

        <h2>Billing issues</h2>
        <p>
          If you believe you were charged incorrectly, contact support within 7 days of the charge and include your account email, plan name, and a short explanation. Do not include full card numbers or sensitive payment details in support messages.
        </p>

        <h2>Promotions and coupons</h2>
        <p>
          Discounts, coupons, and new-user offers apply only when they are valid at checkout. Promotions cannot be stacked unless clearly stated. If a discount expires, future renewals may charge the regular plan price.
        </p>

        <h2>Contact</h2>
        <p>
          For billing help, contact <strong>support@grocery-house-manager.com</strong>.
        </p>
      </section>
    </main>
  );
}
