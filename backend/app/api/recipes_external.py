from __future__ import annotations

import re
import requests
from fastapi import APIRouter, Depends, HTTPException, Query
from app.api.deps import get_current_user
from app.core.config import settings
from app.models import User

router = APIRouter(prefix="/recipes/external", tags=["recipes"])


def _steps(value: str | None) -> list[str]:
    text = (value or "").replace("\r", "\n").strip()
    if not text:
        return []

    # TheMealDB recipes are inconsistent: some use one line per step, some use a
    # numbered paragraph, and some are one long paragraph. Normalize those shapes
    # for the app's numbered step cards without changing the recipe wording.
    lines = [line.strip() for line in text.split("\n") if line.strip()]
    if len(lines) == 1:
        numbered = [x.strip() for x in re.split(r"(?=\b\d{1,2}[.)]?\s+)", lines[0]) if x.strip()]
        if len(numbered) > 1:
            lines = numbered
        else:
            lines = [x.strip() for x in re.split(r"(?<=[.!?])\s+(?=[A-Z0-9])", lines[0]) if x.strip()]

    cleaned: list[str] = []
    for line in lines:
        # The UI already supplies step numbers, so remove source-side prefixes such
        # as "1 ", "2. " or "3) " while preserving headings like "Pro Tips:".
        line = re.sub(r"^\s*\d{1,2}[.)]?\s+", "", line).strip()
        if line:
            cleaned.append(line)
    return cleaned


def _meal(row: dict) -> dict:
    ingredients = []
    for i in range(1, 21):
        name = (row.get(f"strIngredient{i}") or "").strip()
        measure = (row.get(f"strMeasure{i}") or "").strip()
        if name:
            ingredients.append({"name": name, "measure": measure})

    tags_raw = row.get("strTags") or ""
    tags = [x.strip() for x in str(tags_raw).split(",") if x.strip()]
    area = (row.get("strArea") or "").strip() or None
    country = (row.get("strCountry") or "").strip() or area

    return {
        "id": row.get("idMeal"),
        "name": row.get("strMeal"),
        "alternate_name": row.get("strMealAlternate"),
        "image": row.get("strMealThumb"),
        "category": row.get("strCategory"),
        "area": area,
        "country": country,
        "tags": tags,
        "ingredients": ingredients,
        "instructions": _steps(row.get("strInstructions")),
        "source_url": row.get("strSource"),
        "youtube_url": row.get("strYoutube"),
        "date_modified": row.get("dateModified"),
        "provider": "TheMealDB",
    }


@router.get("/search")
def search_recipes(
    q: str = Query(min_length=2, max_length=80),
    user: User = Depends(get_current_user),
):
    # This deliberately mirrors the endpoint supplied by TheMealDB:
    # https://www.themealdb.com/api/json/v1/1/search.php?s=<search>
    # requests.params safely URL-encodes the search string after `s=`.
    key = (settings.themealdb_api_key or "1").strip() or "1"
    url = f"https://www.themealdb.com/api/json/v1/{key}/search.php"
    try:
        response = requests.get(
            url,
            params={"s": q.strip()},
            timeout=max(3, settings.themealdb_timeout_seconds),
            headers={"User-Agent": "GroceryHouseManager/1.0"},
        )
        response.raise_for_status()
        payload = response.json()
        rows = payload.get("meals") or []
        return {
            "items": [_meal(row) for row in rows[:24]],
            "provider": "TheMealDB",
            "query": q.strip(),
            "count": min(len(rows), 24),
        }
    except (requests.RequestException, ValueError, TypeError) as exc:
        raise HTTPException(status_code=502, detail="Recipe service is temporarily unavailable.") from exc
