import { Link } from 'react-router-dom';

export default function AboutPage() {
  return (
    <main className="page shell wide">
      <header className="topbar">
        <div>
          <Link to="/houses" className="breadcrumb">← Houses</Link>
          <h1>About Grocery House Manager</h1>
          <p>A shared grocery inventory and shopping-list app for families, roommates, and busy homes.</p>
        </div>
        <div className="profile-actions">
          <Link to="/pricing" className="secondary center-link">Plans</Link>
          <Link to="/profile" className="secondary center-link">Profile</Link>
        </div>
      </header>

      <section className="about-hero panel">
        <div>
          <p className="eyebrow">Project purpose</p>
          <h2>Know what you have, what you need, and who changed it.</h2>
          <p>
            Grocery House Manager helps a household manage grocery inventory together. Each house can invite members,
            organize products by section, create multiple shopping lists, and update inventory after shopping is done.
          </p>
        </div>
        <div className="about-stat-card">
          <strong>Built for shared homes</strong>
          <span>Live updates, activity history, invite links, and shopping checkout built into one simple workflow.</span>
        </div>
      </section>

      <section className="about-grid">
        <article className="panel">
          <h2>Main features</h2>
          <ul className="feature-list roomy-list">
            <li>Google login and email/password account creation.</li>
            <li>Create houses and invite family members or roommates with a secure link.</li>
            <li>Editable grocery sections like fruits, snacks, dairy, frozen, household, and more.</li>
            <li>Add products with image/icon, quantity, unit, price, store name, brand, barcode, expiry date, and notes.</li>
            <li>Sort products by name, price, store name, quantity, expiry date, or newest.</li>
            <li>Create multiple active shopping lists without finishing the current one first.</li>
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
            <li>Add store names so the shopping list is easier to plan by store.</li>
            <li>Use expiry dates for dairy, frozen food, and fresh items.</li>
            <li>Use low-stock thresholds to quickly notice items that need refilling.</li>
            <li>Check the activity feed when multiple people are updating the same house.</li>
          </ul>
        </article>

        <article className="panel owner-card">
          <h2>Owner information</h2>
          <div className="profile-details">
            <div><strong>Owner</strong><span>Kartik Patel</span></div>
            <div><strong>Project</strong><span>Grocery House Manager</span></div>
            <div><strong>Website</strong><span>grocery-house-manager.com</span></div>
            <div><strong>Contact</strong><span>kp3813294@gmail.com</span></div>
          </div>
          <p className="hint">You can edit this owner section later if you want to use a business support email instead of a personal email.</p>
        </article>
      </section>
    </main>
  );
}
