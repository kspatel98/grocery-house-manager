from __future__ import annotations

import requests
from fastapi import APIRouter, Depends, HTTPException, Query
from app.api.deps import get_current_user
from app.core.config import settings
from app.models import User

router = APIRouter(prefix="/recipes/external", tags=["recipes"])


def _key() -> str:
    # The public test key is deliberately not used in production code. Configure a
    # TheMealDB supporter/production key to enable this feature on a deployed site.
    if not settings.themealdb_api_key:
        raise HTTPException(status_code=503, detail="External recipe discovery is not configured yet. Add THEMEALDB_API_KEY to the backend environment.")
    return settings.themealdb_api_key


def _meal(row: dict) -> dict:
    ingredients = []
    for i in range(1, 21):
        name = (row.get(f"strIngredient{i}") or "").strip()
        measure = (row.get(f"strMeasure{i}") or "").strip()
        if name:
            ingredients.append({"name": name, "measure": measure})
    instructions = [part.strip() for part in (row.get("strInstructions") or "").replace("\r", "\n").split("\n") if part.strip()]
    if len(instructions) <= 1 and instructions:
        import re
        instructions = [x.strip() for x in re.split(r"(?<=[.!?])\s+", instructions[0]) if x.strip()]
    return {
        "id": row.get("idMeal"), "name": row.get("strMeal"), "image": row.get("strMealThumb"),
        "category": row.get("strCategory"), "area": row.get("strArea"), "tags": row.get("strTags"),
        "ingredients": ingredients, "instructions": instructions, "source_url": row.get("strSource"),
        "youtube_url": row.get("strYoutube"), "provider": "TheMealDB",
    }


@router.get("/search")
def search_recipes(q: str = Query(min_length=2, max_length=80), user: User = Depends(get_current_user)):
    key = _key()
    try:
        response = requests.get(f"https://www.themealdb.com/api/json/v1/{key}/search.php", params={"s": q}, timeout=max(3, settings.themealdb_timeout_seconds))
        response.raise_for_status()
        rows = response.json().get("meals") or []
        return {"items": [_meal(row) for row in rows[:24]], "provider": "TheMealDB"}
    except requests.RequestException as exc:
        raise HTTPException(status_code=502, detail="Recipe provider is temporarily unavailable.") from exc
