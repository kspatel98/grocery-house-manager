import { Link } from 'react-router-dom';

export default function PrivacyPolicyPage() {
  return (
    <main className="page shell legal-page">
      <header className="topbar legal-header">
        <div>
          <Link to="/" className="breadcrumb">← Home</Link>
          <p className="eyebrow">SupremDas Group</p>
          <h1>Privacy Policy</h1>
          <p>Last updated: September 2026</p>
        </div>
      </header>

      <section className="panel legal-card">
        <p>
          Grocery House Manager is a household grocery management product from SupremDas Group. This Privacy Policy explains what information the service may collect, how it is used, and how users can manage their information.
        </p>

        <h2>Information we collect</h2>
        <ul>
          <li>Account information, such as name, email address, login method, and profile image.</li>
          <li>Household workspace information, such as house names, members, grocery sections, products, store names, prices, quantities, shopping lists, messages, and activity records.</li>
          <li>Receipt information uploaded by users, including receipt JPG/PNG images, extracted text, store names, item rows, discounts, taxes, totals, prices, and dates.</li>
          <li>Subscription and billing status from Stripe. Card numbers and full payment details are handled by Stripe and are not stored by Grocery House Manager.</li>
          <li>Basic technical information required to keep the app secure and working, such as authentication tokens, request metadata, and local browser storage.</li>
          <li>Privacy-light product usage events, such as page views and successful actions (for example, completing a shopping trip or meal plan). These events are used for product activation and retention metrics and do not store message contents, receipt contents, or the contents of a household list.</li>
        </ul>

        <h2>How we use information</h2>
        <ul>
          <li>To provide shared grocery inventory, shopping lists, receipt tracking, and real-time household collaboration.</li>
          <li>To show who performed actions inside a house, such as adding products or completing shopping lists.</li>
          <li>To process subscriptions, validate coupon codes, manage plan limits, and keep account access accurate.</li>
          <li>To improve reliability, security, product quality, and user experience.</li>
          <li>To respond to support, billing, cancellation, and account requests.</li>
        </ul>

        <h2>Payment processing</h2>
        <p>
          Payments and subscriptions are processed through Stripe. Stripe may collect payment details, billing information, tax information, and fraud-prevention information according to Stripe’s own privacy and security practices. Grocery House Manager stores only the subscription identifiers and status needed to provide paid features.
        </p>

        <h2>Google sign-in</h2>
        <p>
          If you sign in with Google, the app uses the information Google provides for authentication, such as your email, name, and profile image. The app does not request access to your Gmail, Google Drive, or other Google data.
        </p>

        <h2>Smart Receipt Scan</h2>
        <p>
          Receipt uploads may be processed to extract store names, receipt dates, product rows, quantities, prices, discounts, taxes, totals, payment-related labels, and raw extracted text. Scan results can be imperfect, so users should review details before saving them to inventory or price tracking.
        </p>


        <h2>Kitchen Vision and AI-assisted features</h2>
        <p>
          When Kitchen Vision is enabled, photos or short videos may be processed to identify visible household products and suggest inventory changes. The default deployment is designed for ephemeral media processing: the original scan media is not intentionally retained by Grocery House Manager after analysis unless a deployment explicitly enables private media retention. Suggested inventory changes require review before they are applied.
        </p>

        <h2>Product analytics</h2>
        <p>
          Grocery House Manager records limited product-usage events to understand whether users successfully activate the service and return over time. Examples include opening a workspace or completing a shopping trip, receipt flow, meal plan, Kitchen Vision review, review submission, or template use. These events are used for aggregate product metrics such as active users and retention. They are not used to record the text of household messages, AI conversations, grocery lists, or receipt line items.
        </p>

        <h2>Sharing inside a house</h2>
        <p>
          House members can see shared house data, including products, shopping lists, activity, and receipt-related information connected to that house. Only join houses with people you trust.
        </p>

        <h2>Data retention and deletion</h2>
        <p>
          Account data is kept while the account is active and as needed to provide the service. Users can request deletion through the Profile page. Deletion may be blocked temporarily when the user owns shared houses with other members, so shared household data is not removed unexpectedly for others.
        </p>

        <h2>Contact</h2>
        <p>
          For privacy or account questions, contact SupremDas Group support at <strong>support@grocery-house-manager.com</strong>.
        </p>
      </section>
    </main>
  );
}
