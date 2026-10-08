from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker, DeclarativeBase

from app.core.config import settings


# Keep the application-side pool deliberately small. Production connects to the
# DigitalOcean PgBouncer transaction pool, which performs the server-side
# pooling. These limits prevent a single GHM backend process from opening a
# large burst of client connections while still allowing normal concurrency.
engine = create_engine(
    settings.database_url,
    pool_pre_ping=True,
    pool_size=max(1, settings.db_pool_size),
    max_overflow=max(0, settings.db_max_overflow),
    pool_timeout=max(1, settings.db_pool_timeout_seconds),
    pool_recycle=max(30, settings.db_pool_recycle_seconds),
    pool_use_lifo=True,
    pool_reset_on_return="rollback",
    connect_args={
        "connect_timeout": max(1, settings.db_connect_timeout_seconds),
        "keepalives": 1,
        "keepalives_idle": max(10, settings.db_keepalives_idle_seconds),
        "keepalives_interval": max(5, settings.db_keepalives_interval_seconds),
        "keepalives_count": max(1, settings.db_keepalives_count),
        "application_name": "grocery-house-manager",
    },
)

SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)


class Base(DeclarativeBase):
    pass


def get_db():
    db = SessionLocal()
    try:
        yield db
    except Exception:
        # Make sure a failed request never leaves an open transaction attached
        # to a pooled connection.
        db.rollback()
        raise
    finally:
        db.close()
