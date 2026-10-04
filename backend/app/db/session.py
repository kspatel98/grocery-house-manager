from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker, DeclarativeBase
from app.core.config import settings


def _engine_options() -> dict:
    options: dict = {
        "pool_pre_ping": True,
        "pool_recycle": max(60, int(settings.database_pool_recycle_seconds)),
    }

    # The production database is PostgreSQL/psycopg2. Keep connection creation
    # bounded and use TCP keepalives so broken/stale network paths fail fast
    # instead of making user requests hang. Do not apply QueuePool-only options
    # to SQLite if a developer points DATABASE_URL there.
    if settings.database_url.lower().startswith("postgresql"):
        options.update(
            pool_size=max(1, int(settings.database_pool_size)),
            max_overflow=max(0, int(settings.database_max_overflow)),
            pool_timeout=max(1, int(settings.database_pool_timeout_seconds)),
            pool_use_lifo=True,
            connect_args={
                "connect_timeout": max(1, int(settings.database_connect_timeout_seconds)),
                "keepalives": 1,
                "keepalives_idle": max(10, int(settings.database_keepalive_idle_seconds)),
                "keepalives_interval": max(5, int(settings.database_keepalive_interval_seconds)),
                "keepalives_count": max(1, int(settings.database_keepalive_count)),
                "application_name": "grocery-house-manager",
            },
        )
    return options


engine = create_engine(settings.database_url, **_engine_options())
SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)


class Base(DeclarativeBase):
    pass


def get_db():
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()
