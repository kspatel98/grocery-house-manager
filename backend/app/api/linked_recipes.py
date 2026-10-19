"""Curated source-linked vegetarian recipe discovery (no copyrighted content imported)."""
from __future__ import annotations

import json
from pathlib import Path
from urllib.parse import urlparse
from fastapi import APIRouter, Depends, Query
from sqlalchemy import or_, case, func
from sqlalchemy.orm import Session
from app.api.deps import get_current_user
from app.db.session import get_db
from app.models import LinkedRecipeSource, User

router = APIRouter(prefix="/recipes/linked", tags=["linked-recipes"])
SOURCE_HOST = "www.vegrecipesofindia.com"
SEED_FILE = Path(__file__).with_name("linked_recipe_seeds.json")


def is_allowed_source(url: str) -> bool:
    parsed = urlparse(url)
    return parsed.scheme == "https" and parsed.hostname in {SOURCE_HOST, "vegrecipesofindia.com"} and not parsed.username and not parsed.password


def seed_linked_recipes(db: Session) -> None:
    """Idempotent initial links. Never overwrite an existing edited/disabled record."""
    entries = json.loads(SEED_FILE.read_text(encoding="utf-8"))
    existing = set(row[0] for row in db.query(LinkedRecipeSource.slug).all())
    for entry in entries:
        if entry["slug"] in existing or not is_allowed_source(entry["source_url"]):
            continue
        db.add(LinkedRecipeSource(**entry))
    db.commit()


def as_out(row: LinkedRecipeSource) -> dict:
    return {
        "slug": row.slug, "title": row.title, "cuisine": row.cuisine,
        "meal_kind": row.meal_kind, "ghm_recipe_id": row.ghm_recipe_id,
        "source_name": row.source_name, "source_url": row.source_url,
        "video_on_source": row.video_on_source,
        "summary": row.summary,
    }


@router.get("/categories")
def source_categories(db: Session = Depends(get_db), _user: User = Depends(get_current_user)):
    categories = db.query(LinkedRecipeSource.cuisine).filter(LinkedRecipeSource.is_published.is_(True)).distinct().order_by(LinkedRecipeSource.cuisine).all()
    return {"items": [row[0] for row in categories]}


@router.get("")
def list_linked_recipes(
    q: str = Query(default="", max_length=100),
    cuisine: str = Query(default="", max_length=60),
    limit: int = Query(default=24, ge=1, le=72),
    offset: int = Query(default=0, ge=0),
    db: Session = Depends(get_db),
    _user: User = Depends(get_current_user),
):
    query = db.query(LinkedRecipeSource).filter(LinkedRecipeSource.is_published.is_(True))
    if q.strip():
        term = f"%{q.strip()}%"
        query = query.filter(or_(LinkedRecipeSource.title.ilike(term), LinkedRecipeSource.summary.ilike(term)))
    if cuisine.strip() and cuisine != "all":
        query = query.filter(LinkedRecipeSource.cuisine == cuisine.strip())
    total = query.count()
    # Show integrated GHM cooking cards first, then the rest of the source-linked index.
    rows = query.order_by(
        case((LinkedRecipeSource.ghm_recipe_id != "", 0), else_=1),
        LinkedRecipeSource.title,
    ).offset(offset).limit(limit).all()
    return {"items": [as_out(row) for row in rows], "count": len(rows), "total": total,
            "limit": limit, "offset": offset, "has_more": offset + len(rows) < total,
            "source": "Dassana's Veg Recipes"}
