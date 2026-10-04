from fastapi import FastAPI
from fastapi.staticfiles import StaticFiles
from pathlib import Path
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
import time
from sqlalchemy import text
from sqlalchemy.exc import OperationalError, TimeoutError as SQLAlchemyTimeoutError

logger = logging.getLogger(__name__)
app = FastAPI(title=settings.app_name)
app.state.db_ready = False
app.state.db_error = None
app.state.schema_warnings = []
app.state.db_initialized = False


def _initialize_database() -> list[str]:
    # Verify the managed database itself first. Schema maintenance should not hide
    # a healthy PostgreSQL connection behind an opaque 502/503.
    with engine.connect() as connection:
        connection.execute(text("SELECT 1"))

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


def _ping_database() -> None:
    with engine.connect() as connection:
        connection.execute(text("SELECT 1"))


async def _database_monitor_loop() -> None:
    # Stay alive for the lifetime of the process. V99 stopped monitoring after
    # the first successful startup, so a later DB/network interruption could
    # leave /health/ready stale while user requests failed.
    delay = 3
    while True:
        try:
            if not app.state.db_initialized:
                warnings = await asyncio.to_thread(_initialize_database)
                app.state.schema_warnings = warnings
                app.state.db_initialized = True
                if warnings:
                    logger.warning("GHM database initialized with %s compatibility warning(s)", len(warnings))
                else:
                    logger.info("GHM database initialized")
            else:
                await asyncio.to_thread(_ping_database)

            recovered = not app.state.db_ready
            app.state.db_ready = True
            app.state.db_error = None
            delay = 3
            if recovered:
                logger.info("GHM database connection is ready")
            await asyncio.sleep(30)
        except Exception as exc:
            app.state.db_ready = False
            app.state.db_error = str(exc)[:500]
            # Throw away pooled connections that may refer to a dead network path.
            try:
                engine.dispose()
            except Exception:
                pass
            logger.exception("GHM database health check failed; retrying in %ss", delay)
            await asyncio.sleep(delay)
            delay = min(delay * 2, 30)


@app.on_event("startup")
async def start_database_guard() -> None:
    asyncio.create_task(_database_monitor_loop())

@app.exception_handler(OperationalError)
async def database_operational_error_handler(request, exc):
    from fastapi.responses import JSONResponse
    app.state.db_ready = False
    app.state.db_error = "The database connection was interrupted and GHM is reconnecting."
    try:
        engine.dispose()
    except Exception:
        pass
    logger.exception("GHM database connection interrupted path=%s", request.url.path)
    return JSONResponse(
        status_code=503,
        content={
            "detail": "GHM briefly lost its database connection and is reconnecting. Your saved data has not been deleted.",
            "code": "database_reconnecting",
        },
        headers={"Retry-After": "3"},
    )


@app.exception_handler(SQLAlchemyTimeoutError)
async def database_pool_timeout_handler(request, exc):
    from fastapi.responses import JSONResponse
    logger.exception("GHM database pool wait timed out path=%s %s", request.url.path, _pool_snapshot())
    return JSONResponse(
        status_code=503,
        content={
            "detail": "GHM is temporarily busy reaching household data. Please retry in a moment.",
            "code": "database_busy",
        },
        headers={"Retry-After": "2"},
    )


Path(settings.upload_dir).mkdir(parents=True, exist_ok=True)
app.mount("/uploads", StaticFiles(directory=settings.upload_dir), name="uploads")


def _pool_snapshot() -> str:
    pool = engine.pool
    parts = []
    for label, name in (("size", "size"), ("checked_out", "checkedout"), ("overflow", "overflow")):
        value = getattr(pool, name, None)
        if callable(value):
            try:
                parts.append(f"{label}={value()}")
            except Exception:
                pass
    return " ".join(parts) or "pool=unknown"


@app.middleware("http")
async def request_timing(request, call_next):
    started = time.perf_counter()
    try:
        response = await call_next(request)
    except Exception:
        elapsed_ms = (time.perf_counter() - started) * 1000
        logger.exception("GHM request failed path=%s duration_ms=%.0f %s", request.url.path, elapsed_ms, _pool_snapshot())
        raise

    elapsed_ms = (time.perf_counter() - started) * 1000
    response.headers["X-GHM-Request-MS"] = str(int(elapsed_ms))
    if elapsed_ms >= max(250, int(settings.slow_request_log_ms)):
        logger.warning(
            "GHM slow request method=%s path=%s status=%s duration_ms=%.0f %s",
            request.method,
            request.url.path,
            response.status_code,
            elapsed_ms,
            _pool_snapshot(),
        )
    return response


@app.middleware("http")
async def database_readiness_gate(request, call_next):
    path = request.url.path
    allowed = path.startswith("/health") or path.startswith("/docs") or path == "/openapi.json" or path.startswith("/uploads")
    if not allowed and not app.state.db_ready:
        from fastapi.responses import JSONResponse
        return JSONResponse(
            status_code=503,
            content={
                "detail": "GHM is reconnecting to the household database. Your data has not been deleted. Please retry in a moment.",
                "code": "database_starting",
            },
            headers={"Retry-After": "3"},
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
async def health():
    return {"status": "ok", "app": settings.app_name, "database_ready": bool(app.state.db_ready)}


@app.get("/health/live")
async def health_live():
    return {"status": "ok", "app": settings.app_name}


@app.get("/health/ready")
async def health_ready():
    from fastapi.responses import JSONResponse
    if app.state.db_ready:
        return {"status": "ready", "database": "connected", "schema_warnings": len(getattr(app.state, "schema_warnings", []) or [])}
    return JSONResponse(
        status_code=503,
        content={"status": "starting", "database": "not_ready", "detail": app.state.db_error or "Database initialization is still in progress."},
    )
