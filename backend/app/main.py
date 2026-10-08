from fastapi import FastAPI
from fastapi.staticfiles import StaticFiles
from pathlib import Path
from sqlalchemy.exc import TimeoutError as SQLAlchemyPoolTimeout
from fastapi.middleware.cors import CORSMiddleware
from app.api import auth, houses, products, sections, shopping, live, billing, account, admin, market, reviews, offers, insights, expenses, recipes_external, community_recipes, ai, templates, analytics, food
from app.core.config import settings
from app.db.session import Base, engine
from app.db.dev_migrations import ensure_dev_schema

# V98 stability: keep the HTTP process alive even when PostgreSQL is briefly
# unavailable during a deploy. Schema initialization is attempted during startup
# and retried in the background; /health/ready reports whether data APIs are ready.
import asyncio
import logging
from sqlalchemy import text
from sqlalchemy.exc import InterfaceError, OperationalError

logger = logging.getLogger(__name__)
app = FastAPI(title=settings.app_name)
app.state.db_ready = False
app.state.db_initialized_once = False
app.state.db_error = None
app.state.db_consecutive_failures = 0
app.state.schema_warnings = []
app.state.db_retry_task = None


def _probe_database() -> None:
    """Open a fresh pooled connection and verify PostgreSQL/PgBouncer."""
    with engine.connect() as connection:
        connection.execute(text("SELECT 1"))


def _initialize_database() -> list[str]:
    # Verify the managed database itself first. Schema maintenance should not hide
    # a healthy PostgreSQL connection behind an opaque 502/503.
    _probe_database()

    warnings: list[str] = []
    try:
        Base.metadata.create_all(bind=engine)
    except Exception as exc:
        warning = f"metadata create_all warning: {type(exc).__name__}: {exc}"
        warnings.append(warning[:700])
        logger.exception("GHM metadata create_all had a compatibility warning")

    try:
        warnings.extend(ensure_dev_schema(engine))
    except Exception as exc:
        warning = f"compatibility schema pass warning: {type(exc).__name__}: {exc}"
        warnings.append(warning[:700])
        logger.exception("GHM compatibility schema pass failed unexpectedly")
    return warnings


async def _database_retry_loop() -> None:
    """Recover database connectivity without globally freezing a healthy app.

    Schema compatibility work runs only until the first successful startup. After
    that, a PgBouncer/TCP interruption is recovered with a lightweight SELECT 1.
    This prevents one transient failed health probe from pushing every household
    request behind a global 503 gate.
    """
    delay = 2
    try:
        while not app.state.db_ready:
            try:
                if not app.state.db_initialized_once:
                    warnings = await asyncio.to_thread(_initialize_database)
                    app.state.schema_warnings = warnings
                    app.state.db_initialized_once = True
                else:
                    await asyncio.to_thread(_probe_database)
                    warnings = list(getattr(app.state, "schema_warnings", []) or [])

                app.state.db_ready = True
                app.state.db_error = None
                app.state.db_consecutive_failures = 0
                if warnings:
                    logger.warning("GHM database is ready with %s compatibility warning(s)", len(warnings))
                else:
                    logger.info("GHM database is ready")
                return
            except Exception as exc:
                app.state.db_ready = False
                app.state.db_error = str(exc)[:500]
                app.state.db_consecutive_failures = int(getattr(app.state, "db_consecutive_failures", 0) or 0) + 1
                # Drop local SQLAlchemy connections so the next attempt creates
                # fresh PgBouncer/TCP sessions.
                engine.dispose()
                logger.warning("GHM database reconnect attempt failed; retrying in %ss: %s", delay, exc)
                await asyncio.sleep(delay)
                delay = min(delay * 2, 20)
    finally:
        app.state.db_retry_task = None


def _ensure_database_retry_task() -> None:
    task = getattr(app.state, "db_retry_task", None)
    if task is None or task.done():
        app.state.db_retry_task = asyncio.create_task(_database_retry_loop())


def _mark_database_unready(exc: Exception) -> None:
    app.state.db_ready = False
    app.state.db_error = str(exc)[:500]
    app.state.db_consecutive_failures = int(getattr(app.state, "db_consecutive_failures", 0) or 0) + 1
    # Invalid/stale DBAPI connections must not remain in SQLAlchemy's pool.
    # Do NOT clear db_initialized_once: one dropped connection must not globally
    # gate every route after the application has successfully started once.
    engine.dispose()


@app.on_event("startup")
async def start_database_guard() -> None:
    _ensure_database_retry_task()

Path(settings.upload_dir).mkdir(parents=True, exist_ok=True)
app.mount("/uploads", StaticFiles(directory=settings.upload_dir), name="uploads")


@app.middleware("http")
async def database_readiness_gate(request, call_next):
    path = request.url.path
    allowed = path.startswith("/health") or path.startswith("/docs") or path == "/openapi.json" or path.startswith("/uploads")
    # Gate only the *initial* startup before schema compatibility has completed.
    # Once GHM has successfully initialized, a single transient PgBouncer failure
    # must not block every route globally; individual DB requests can retry/fail
    # independently while the background recovery task refreshes the pool.
    if not allowed and not app.state.db_initialized_once:
        from fastapi.responses import JSONResponse
        return JSONResponse(
            status_code=503,
            content={
                "detail": "GHM is finishing the household database connection. Please retry in a moment.",
                "code": "database_starting",
            },
            headers={"Retry-After": "2"},
        )
    return await call_next(request)

app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.cors_origins,
    allow_credentials=True,
    # Be explicit instead of using ["*"]. Some browsers can cache/compare
    # preflight methods strictly, and PATCH must be listed for product edits.
    allow_methods=["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS", "HEAD"],
    allow_headers=["Authorization", "Content-Type", "Accept", "Origin", "X-Requested-With"],
    expose_headers=["Content-Length"],
    max_age=0,
)

@app.exception_handler(SQLAlchemyPoolTimeout)
async def sqlalchemy_pool_timeout_handler(request, exc):
    """Return a recoverable 503 instead of an ASGI traceback when the local pool is busy."""
    from fastapi.responses import JSONResponse

    logger.error("Database connection pool exhausted on %s: %s | %s", request.url.path, exc, engine.pool.status())
    return JSONResponse(
        status_code=503,
        content={
            "detail": "GHM is briefly busy connecting to household data. Please retry in a moment.",
            "code": "database_pool_busy",
        },
        headers={"Retry-After": "2"},
    )


app.include_router(auth.router)
app.include_router(houses.router)
app.include_router(sections.router)
app.include_router(products.router)
app.include_router(shopping.router)
app.include_router(live.router)
app.include_router(billing.router)
app.include_router(account.router)
app.include_router(admin.router)
app.include_router(market.router)
app.include_router(reviews.router)
app.include_router(offers.router)
app.include_router(insights.router)
app.include_router(expenses.router)
app.include_router(recipes_external.router)
app.include_router(community_recipes.router)
app.include_router(ai.router)
app.include_router(templates.router)
app.include_router(analytics.router)
app.include_router(food.router)


@app.get("/health")
def health():
    return {"status": "ok", "app": settings.app_name, "database_ready": bool(app.state.db_ready)}


@app.get("/health/live")
def health_live():
    return {"status": "ok", "app": settings.app_name}


@app.get("/health/ready")
async def health_ready():
    from fastapi.responses import JSONResponse

    # Live readiness probe for monitoring. A failed probe starts recovery but no
    # longer turns the entire application into a global 503 after startup.
    try:
        await asyncio.to_thread(_probe_database)
        app.state.db_ready = True
        app.state.db_error = None
        app.state.db_consecutive_failures = 0
        return {
            "status": "ready",
            "database": "connected",
            "schema_warnings": len(getattr(app.state, "schema_warnings", []) or []),
        }
    except Exception as exc:
        _mark_database_unready(exc)
        _ensure_database_retry_task()
        return JSONResponse(
            status_code=503,
            content={
                "status": "reconnecting",
                "database": "not_ready",
                "detail": "Database connection is temporarily unavailable. GHM is reconnecting in the background.",
            },
            headers={"Retry-After": "5"},
        )


async def _database_connection_error_handler(request, exc):
    from fastapi.responses import JSONResponse

    _mark_database_unready(exc)
    _ensure_database_retry_task()
    logger.warning("Transient database connection error on %s: %s", request.url.path, exc)
    return JSONResponse(
        status_code=503,
        content={
            "detail": "GHM temporarily lost its database connection and is reconnecting. Your data has not been deleted. Please retry in a moment.",
            "code": "database_reconnecting",
        },
        headers={"Retry-After": "3"},
    )


# Turn transient PostgreSQL/PgBouncer disconnects into a retryable 503 instead
# of exposing a generic 500 to the frontend. The frontend already retries safe
# GET requests automatically.
app.add_exception_handler(OperationalError, _database_connection_error_handler)
app.add_exception_handler(InterfaceError, _database_connection_error_handler)
