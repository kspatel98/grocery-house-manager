import { Link } from 'react-router-dom';

export default function AboutPage() {
  return (
    <main className="page shell wide">
      <header className="topbar">
        <div>
          <Link to="/houses" className="breadcrumb">← Houses</Link>
          <h1>About Grocery House Manager</h1>
          <p>A household productivity SaaS product developed and published by SupremDas Group.</p>
        </div>
      </header>

      <section className="about-hero panel branded-hero">
        <div>
          <p className="eyebrow">Grocery House Manager • SupremDas Group</p>
          <h2>Shared grocery inventory, shopping lists, and household collaboration in one professional platform.</h2>
          <p>
            Grocery House Manager helps families, roommates, and shared homes organize grocery inventory,
            plan shopping lists, invite household members, and track activity in one secure place.
            SupremDas Group is the parent business behind the product.
          </p>
          <div className="hero-actions">
            <Link to="/houses" className="primary center-link">Open houses</Link>
            <Link to="/pricing" className="secondary center-link">View plans</Link>
          </div>
        </div>
        <div className="about-logo-card">
          <img src="/brand/grocery-house-manager-logo.png" alt="Grocery House Manager" />
          <strong>Grocery House Manager</strong>
          <span>A SupremDas Group product</span>
        </div>
      </section>

      <section className="about-grid">
        <article className="panel company-card">
          <h2>Company and product</h2>
          <div className="profile-details">
            <div><strong>Company</strong><span>SupremDas Group</span></div>
            <div><strong>Product</strong><span>Grocery House Manager</span></div>
            <div><strong>Website</strong><span>grocery-house-manager.com</span></div>
            <div><strong>Category</strong><span>SaaS for household productivity and grocery management</span></div>
          </div>
          <p>
            SupremDas Group builds practical digital products that simplify daily life through clean design,
            reliable workflows, and user-friendly collaboration. Grocery House Manager is the company’s
            grocery inventory and shopping-list product for households.
          </p>
        </article>

        <article className="panel">
          <h2>Main features</h2>
          <ul className="feature-list roomy-list">
            <li>Google login and email/password account creation.</li>
            <li>Create houses and invite family members or roommates with a secure invite link.</li>
            <li>Accept-or-decline invite confirmation before a user joins a house.</li>
            <li>Editable grocery sections like fruits, snacks, dairy, frozen, household, and more.</li>
            <li>Add products with image/icon, quantity, unit, price, store name, brand, barcode, expiry date, and notes.</li>
            <li>Sort products by name, price, store name, quantity, expiry date, or newest.</li>
            <li>Create multiple active shopping lists without waiting for the current list to finish.</li>
            <li>Move products from “Products to buy” to “Added in cart,” then update inventory when shopping is done.</li>
            <li>Members and activity feed show who added, edited, removed, joined, or completed actions.</li>
            <li>Owner-plan based house limits, so members can use the features available to the house owner.</li>
            <li>Receipt price updates and multi-store product pricing, so one product can track prices from different stores.</li>
            <li>Subscription plans, Stripe Checkout, private coupon-code discounts, and non-stackable new-user offers.</li>
          </ul>
        </article>

        <article className="panel">
          <h2>How to use</h2>
          <ol className="howto-list">
            <li>Create an account or sign in with Google.</li>
            <li>Create your first house, for example “Patel Family Home.”</li>
            <li>Share the invite link with household members.</li>
            <li>Review the invite confirmation before joining a house.</li>
            <li>Add sections and products to build your grocery inventory.</li>
            <li>Create one or more shopping lists from existing products.</li>
            <li>While shopping, check items as they are added to the cart.</li>
            <li>Enter bought store/price during shopping or from a receipt to update store-specific prices.</li>
            <li>Tap “Shopping done” to update the real inventory automatically.</li>
          </ol>
        </article>

        <article className="panel">
          <h2>Best practices</h2>
          <ul className="feature-list roomy-list">
            <li>Use clear product names like “Milk bags,” “Apples,” or “Greek yogurt.”</li>
            <li>Add store names and receipt prices so each product can keep a useful store-price history.</li>
            <li>Use expiry dates for dairy, frozen food, fresh items, and household essentials.</li>
            <li>Use low-stock thresholds to quickly notice items that need refilling.</li>
            <li>Check the activity feed when multiple people are updating the same house.</li>
          </ul>
        </article>
      </section>
    </main>
  );
}
