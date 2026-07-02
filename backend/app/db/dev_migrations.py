from sqlalchemy import text
from sqlalchemy.engine import Engine


def ensure_dev_schema(engine: Engine) -> None:
    """Tiny development-only schema helper.

    The starter project uses Base.metadata.create_all(), which creates missing tables but
    does not alter existing tables. This helper keeps local Docker volumes from older ZIPs
    working after new starter columns are added. Use Alembic in production.
    """
    statements = [
        # Existing local Docker volumes from earlier starter ZIPs may be missing
        # columns that newer UI screens read/write. Keep these additive only.
        "DO $$ BEGIN CREATE TYPE shoppingitemstatus AS ENUM ('to_buy', 'in_cart', 'skipped'); EXCEPTION WHEN duplicate_object THEN NULL; END $$",
        "DO $$ BEGIN CREATE TYPE planname AS ENUM ('free', 'family', 'pro'); EXCEPTION WHEN duplicate_object THEN NULL; END $$",

        "ALTER TABLE users ADD COLUMN IF NOT EXISTS avatar_url TEXT",
        "ALTER TABLE users ADD COLUMN IF NOT EXISTS plan_name planname DEFAULT 'free'",
        "ALTER TABLE users ADD COLUMN IF NOT EXISTS subscription_status VARCHAR(60) DEFAULT 'free'",
        "ALTER TABLE users ADD COLUMN IF NOT EXISTS stripe_customer_id VARCHAR(255)",
        "ALTER TABLE users ADD COLUMN IF NOT EXISTS stripe_subscription_id VARCHAR(255)",
        "ALTER TABLE users ADD COLUMN IF NOT EXISTS subscription_current_period_end TIMESTAMP WITH TIME ZONE",
        "ALTER TABLE users ADD COLUMN IF NOT EXISTS created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()",

        "ALTER TABLE sections ADD COLUMN IF NOT EXISTS icon VARCHAR(64)",
        "ALTER TABLE sections ADD COLUMN IF NOT EXISTS sort_order INTEGER DEFAULT 0",
        "ALTER TABLE sections ADD COLUMN IF NOT EXISTS created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()",

        "ALTER TABLE products ADD COLUMN IF NOT EXISTS image_url TEXT",
        "ALTER TABLE products ADD COLUMN IF NOT EXISTS icon VARCHAR(64)",
        "ALTER TABLE products ADD COLUMN IF NOT EXISTS quantity DOUBLE PRECISION DEFAULT 0",
        "ALTER TABLE products ADD COLUMN IF NOT EXISTS unit VARCHAR(32) DEFAULT 'pcs'",
        "ALTER TABLE products ADD COLUMN IF NOT EXISTS price DOUBLE PRECISION",
        "ALTER TABLE products ADD COLUMN IF NOT EXISTS store_name VARCHAR(150)",
        "ALTER TABLE products ADD COLUMN IF NOT EXISTS brand VARCHAR(120)",
        "ALTER TABLE products ADD COLUMN IF NOT EXISTS barcode VARCHAR(120)",
        "ALTER TABLE products ADD COLUMN IF NOT EXISTS expiry_date DATE",
        "ALTER TABLE products ADD COLUMN IF NOT EXISTS low_stock_threshold DOUBLE PRECISION",
        "ALTER TABLE products ADD COLUMN IF NOT EXISTS notes TEXT",
        "ALTER TABLE products ADD COLUMN IF NOT EXISTS last_bought_at TIMESTAMP WITH TIME ZONE",
        "ALTER TABLE products ADD COLUMN IF NOT EXISTS created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()",
        "ALTER TABLE products ADD COLUMN IF NOT EXISTS updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()",

        "ALTER TABLE shopping_lists ADD COLUMN IF NOT EXISTS is_done BOOLEAN DEFAULT FALSE",
        "ALTER TABLE shopping_lists ADD COLUMN IF NOT EXISTS created_by_id INTEGER REFERENCES users(id) ON DELETE SET NULL",
        "ALTER TABLE shopping_lists ADD COLUMN IF NOT EXISTS completed_by_id INTEGER REFERENCES users(id) ON DELETE SET NULL",
        "ALTER TABLE shopping_lists ADD COLUMN IF NOT EXISTS created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()",
        "ALTER TABLE shopping_lists ADD COLUMN IF NOT EXISTS completed_at TIMESTAMP WITH TIME ZONE",

        "ALTER TABLE shopping_list_items ADD COLUMN IF NOT EXISTS requested_quantity DOUBLE PRECISION DEFAULT 1",
        "ALTER TABLE shopping_list_items ADD COLUMN IF NOT EXISTS bought_quantity DOUBLE PRECISION DEFAULT 1",
        "ALTER TABLE shopping_list_items ADD COLUMN IF NOT EXISTS message TEXT",
        "ALTER TABLE shopping_list_items ADD COLUMN IF NOT EXISTS status shoppingitemstatus DEFAULT 'to_buy'",
        "ALTER TABLE shopping_list_items ADD COLUMN IF NOT EXISTS created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()",
    ]
    with engine.begin() as connection:
        for statement in statements:
            connection.execute(text(statement))
