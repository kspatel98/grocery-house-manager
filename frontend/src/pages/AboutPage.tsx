import { Link } from 'react-router-dom';

export default function AboutPage() {
  return (
    <main className="page shell wide">
      <header className="topbar">
        <div>
          <Link to="/houses" className="breadcrumb">← Houses</Link>
          <h1>About Grocery House Manager</h1>
          <p>A professional household grocery management platform by SupremDas Group.</p>
        </div>
      </header>

      <section className="about-hero panel branded-hero">
        <div>
          <p className="eyebrow">SupremDas Group product</p>
          <h2>Manage groceries together with clarity, accountability, and real-time updates.</h2>
          <p>
            Grocery House Manager helps families, roommates, and shared homes organize grocery inventory,
            plan shopping lists, invite household members, and track activity in one secure place.
          </p>
          <div className="hero-actions">
            <Link to="/houses" className="primary center-link">Open houses</Link>
            <Link to="/pricing" className="secondary center-link">View plans</Link>
          </div>
        </div>
        <div className="about-logo-card">
          <img src="/brand/grocery-house-manager-logo.png" alt="Grocery House Manager" />
          <strong>Grocery House Manager</strong>
          <span>by SupremDas Group</span>
        </div>
      </section>

      <section className="about-grid">
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
          </ul>
        </article>

        <article className="panel">
          <h2>How to use</h2>
          <ol className="howto-list">
            <li>Create an account or sign in with Google.</li>
            <li>Create your first house, for example “Patel Family Home.”</li>
            <li>Share the invite link with household members.</li>
            <li>Add sections and products to build your grocery inventory.</li>
            <li>Create one or more shopping lists from existing products.</li>
            <li>While shopping, check items as they are added to the cart.</li>
            <li>Tap “Shopping done” to update the real inventory automatically.</li>
          </ol>
        </article>

        <article className="panel">
          <h2>Best practices</h2>
          <ul className="feature-list roomy-list">
            <li>Use clear product names like “Milk bags,” “Apples,” or “Greek yogurt.”</li>
            <li>Add store names so shopping lists are easier to plan by store.</li>
            <li>Use expiry dates for dairy, frozen food, fresh items, and household essentials.</li>
            <li>Use low-stock thresholds to quickly notice items that need refilling.</li>
            <li>Check the activity feed when multiple people are updating the same house.</li>
          </ul>
        </article>

        <article className="panel company-card">
          <h2>Company information</h2>
          <div className="profile-details">
            <div><strong>Company</strong><span>SupremDas Group</span></div>
            <div><strong>Product</strong><span>Grocery House Manager</span></div>
            <div><strong>Website</strong><span>grocery-house-manager.com</span></div>
            <div><strong>Category</strong><span>Household productivity and grocery management software</span></div>
          </div>
          <p>
            SupremDas Group builds practical digital tools that simplify daily life through clean design,
            reliable workflows, and user-friendly collaboration.
          </p>
        </article>
      </section>
    </main>
  );
}
