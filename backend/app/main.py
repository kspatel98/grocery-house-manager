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
from sqlalchemy import text

logger = logging.getLogger(__name__)
app = FastAPI(title=settings.app_name)
app.state.db_ready = False
app.state.db_error = None
app.state.schema_warnings = []


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


async def _database_retry_loop() -> None:
    delay = 3
    while not app.state.db_ready:
        try:
            warnings = await asyncio.to_thread(_initialize_database)
            app.state.db_ready = True
            app.state.db_error = None
            app.state.schema_warnings = warnings
            if warnings:
                logger.warning("GHM database is ready with %s compatibility warning(s)", len(warnings))
            else:
                logger.info("GHM database is ready")
            return
        except Exception as exc:
            app.state.db_ready = False
            app.state.db_error = str(exc)[:500]
            logger.exception("GHM database initialization failed; retrying in %ss", delay)
            await asyncio.sleep(delay)
            delay = min(delay * 2, 30)


@app.on_event("startup")
async def start_database_guard() -> None:
    asyncio.create_task(_database_retry_loop())

Path(settings.upload_dir).mkdir(parents=True, exist_ok=True)
app.mount("/uploads", StaticFiles(directory=settings.upload_dir), name="uploads")


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
def health():
    return {"status": "ok", "app": settings.app_name, "database_ready": bool(app.state.db_ready)}


@app.get("/health/live")
def health_live():
    return {"status": "ok", "app": settings.app_name}


@app.get("/health/ready")
def health_ready():
    from fastapi.responses import JSONResponse
    if app.state.db_ready:
        return {"status": "ready", "database": "connected", "schema_warnings": len(getattr(app.state, "schema_warnings", []) or [])}
    return JSONResponse(
        status_code=503,
        content={"status": "starting", "database": "not_ready", "detail": app.state.db_error or "Database initialization is still in progress."},
    )
