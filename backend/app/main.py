from fastapi import FastAPI
from fastapi.staticfiles import StaticFiles
from pathlib import Path
from fastapi.middleware.cors import CORSMiddleware
from app.api import auth, houses, products, sections, shopping, live, billing
from app.core.config import settings
from app.db.session import Base, engine
from app.db.dev_migrations import ensure_dev_schema

# For starter development. Use Alembic migrations in production.
Base.metadata.create_all(bind=engine)
ensure_dev_schema(engine)

app = FastAPI(title=settings.app_name)

Path(settings.upload_dir).mkdir(parents=True, exist_ok=True)
app.mount("/uploads", StaticFiles(directory=settings.upload_dir), name="uploads")

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


@app.get("/health")
def health():
    return {"status": "ok", "app": settings.app_name}
