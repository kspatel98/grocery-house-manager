from __future__ import annotations

import json
from io import BytesIO
from pathlib import Path
from uuid import uuid4

from PIL import Image, UnidentifiedImageError

from fastapi import APIRouter, Depends, File, HTTPException, Query, UploadFile, status
from sqlalchemy import or_
from sqlalchemy.orm import Session, joinedload

from app.api.deps import get_current_user
from app.core.config import settings
from app.db.session import get_db
from app.models import CommunityRecipe, User, utc_now
from app.schemas import CommunityRecipeCreateIn, CommunityRecipeOut, CommunityRecipeUpdateIn

router = APIRouter(prefix="/recipes/community", tags=["community-recipes"])

_ALLOWED_IMAGE_TYPES = {
    "image/jpeg": ".jpg",
    "image/jpg": ".jpg",
    "image/png": ".png",
    "image/webp": ".webp",
}
_MAX_IMAGE_BYTES = 6 * 1024 * 1024


def _loads_list(value: str | None) -> list:
    try:
        parsed = json.loads(value or "[]")
        return parsed if isinstance(parsed, list) else []
    except (TypeError, ValueError, json.JSONDecodeError):
        return []


def _clean_categories(values: list[str]) -> list[str]:
    cleaned: list[str] = []
    seen: set[str] = set()
    for raw in values:
        value = " ".join(str(raw).strip().split())[:60]
        key = value.casefold()
        if value and key not in seen:
            seen.add(key)
            cleaned.append(value)
        if len(cleaned) >= 16:
            break
    return cleaned


def _clean_steps(values: list[str]) -> list[str]:
    cleaned = [" ".join(str(value).strip().split())[:1200] for value in values]
    return [value for value in cleaned if value]


def _serialize(recipe: CommunityRecipe, current_user_id: int) -> CommunityRecipeOut:
    owner = recipe.owner
    ingredients = _loads_list(recipe.ingredients_json)
    return CommunityRecipeOut(
        id=recipe.id,
        user_id=recipe.user_id,
        uploader_name=(owner.full_name or "Community cook") if owner else "Community cook",
        uploader_avatar_url=owner.avatar_url if owner else None,
        name=recipe.name,
        base_servings=recipe.base_servings,
        meal_kind=recipe.meal_kind,
        cuisine=recipe.cuisine,
        categories=_loads_list(recipe.categories_json),
        diets=_loads_list(recipe.diets_json),
        ingredients=ingredients,
        steps=_loads_list(recipe.steps_json),
        image_url=recipe.image_url,
        is_shared=recipe.is_shared,
        can_edit=recipe.user_id == current_user_id,
        created_at=recipe.created_at,
        updated_at=recipe.updated_at,
    )


def _owned_recipe(recipe_id: int, user: User, db: Session) -> CommunityRecipe:
    recipe = (
        db.query(CommunityRecipe)
        .options(joinedload(CommunityRecipe.owner))
        .filter(CommunityRecipe.id == recipe_id)
        .first()
    )
    if not recipe:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Recipe not found")
    if recipe.user_id != user.id:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="You can edit only recipes you created")
    return recipe


def _delete_local_image(image_url: str | None) -> None:
    if not image_url or not image_url.startswith("/uploads/community-recipes/"):
        return
    relative = image_url.replace("/uploads/", "", 1).lstrip("/")
    base = Path(settings.upload_dir).resolve()
    candidate = (base / relative).resolve()
    try:
        candidate.relative_to(base)
    except ValueError:
        return
    if candidate.is_file():
        try:
            candidate.unlink()
        except OSError:
            pass


@router.get("", response_model=list[CommunityRecipeOut])
def list_shared_recipes(
    q: str | None = Query(default=None, max_length=120),
    category: str | None = Query(default=None, max_length=60),
    limit: int = Query(default=24, ge=1, le=60),
    offset: int = Query(default=0, ge=0),
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
):
    query = db.query(CommunityRecipe).options(joinedload(CommunityRecipe.owner)).filter(CommunityRecipe.is_shared.is_(True))
    if q and q.strip():
        term = f"%{q.strip()}%"
        query = query.filter(or_(CommunityRecipe.name.ilike(term), CommunityRecipe.cuisine.ilike(term), CommunityRecipe.categories_json.ilike(term)))
    if category and category.strip():
        query = query.filter(CommunityRecipe.categories_json.ilike(f"%{category.strip()}%"))
    recipes = query.order_by(CommunityRecipe.updated_at.desc(), CommunityRecipe.id.desc()).offset(offset).limit(limit).all()
    return [_serialize(recipe, user.id) for recipe in recipes]


@router.get("/mine", response_model=list[CommunityRecipeOut])
def list_my_recipes(
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
):
    recipes = (
        db.query(CommunityRecipe)
        .options(joinedload(CommunityRecipe.owner))
        .filter(CommunityRecipe.user_id == user.id)
        .order_by(CommunityRecipe.updated_at.desc(), CommunityRecipe.id.desc())
        .all()
    )
    return [_serialize(recipe, user.id) for recipe in recipes]


@router.post("", response_model=CommunityRecipeOut, status_code=status.HTTP_201_CREATED)
def create_recipe(
    payload: CommunityRecipeCreateIn,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
):
    steps = _clean_steps(payload.steps)
    if not steps:
        raise HTTPException(status_code=400, detail="Add at least one cooking step")
    recipe = CommunityRecipe(
        user_id=user.id,
        name=" ".join(payload.name.strip().split()),
        base_servings=payload.base_servings,
        meal_kind=payload.meal_kind,
        cuisine=" ".join(payload.cuisine.strip().split()),
        categories_json=json.dumps(_clean_categories(payload.categories), ensure_ascii=False),
        diets_json=json.dumps(payload.diets, ensure_ascii=False),
        ingredients_json=json.dumps([item.model_dump() for item in payload.ingredients], ensure_ascii=False),
        steps_json=json.dumps(steps, ensure_ascii=False),
        is_shared=payload.is_shared,
    )
    db.add(recipe)
    db.commit()
    db.refresh(recipe)
    recipe.owner = user
    return _serialize(recipe, user.id)


@router.patch("/{recipe_id}", response_model=CommunityRecipeOut)
def update_recipe(
    recipe_id: int,
    payload: CommunityRecipeUpdateIn,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
):
    recipe = _owned_recipe(recipe_id, user, db)
    changes = payload.model_dump(exclude_unset=True)
    if "name" in changes:
        recipe.name = " ".join(str(changes["name"]).strip().split())
    if "base_servings" in changes:
        recipe.base_servings = changes["base_servings"]
    if "meal_kind" in changes:
        recipe.meal_kind = changes["meal_kind"]
    if "cuisine" in changes:
        recipe.cuisine = " ".join(str(changes["cuisine"]).strip().split())
    if "categories" in changes:
        recipe.categories_json = json.dumps(_clean_categories(changes["categories"]), ensure_ascii=False)
    if "diets" in changes:
        recipe.diets_json = json.dumps(changes["diets"], ensure_ascii=False)
    if "ingredients" in changes:
        recipe.ingredients_json = json.dumps([item.model_dump() for item in payload.ingredients or []], ensure_ascii=False)
    if "steps" in changes:
        steps = _clean_steps(changes["steps"])
        if not steps:
            raise HTTPException(status_code=400, detail="Add at least one cooking step")
        recipe.steps_json = json.dumps(steps, ensure_ascii=False)
    if "is_shared" in changes:
        recipe.is_shared = bool(changes["is_shared"])
    recipe.updated_at = utc_now()
    db.commit()
    db.refresh(recipe)
    recipe.owner = user
    return _serialize(recipe, user.id)


@router.post("/{recipe_id}/image", response_model=CommunityRecipeOut)
async def upload_recipe_image(
    recipe_id: int,
    file: UploadFile = File(...),
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
):
    recipe = _owned_recipe(recipe_id, user, db)
    content_type = (file.content_type or "").lower()
    suffix = _ALLOWED_IMAGE_TYPES.get(content_type)
    if not suffix:
        guessed = Path(file.filename or "").suffix.lower()
        if guessed in {".jpg", ".jpeg"}:
            suffix = ".jpg"
        elif guessed in {".png", ".webp"}:
            suffix = guessed
        else:
            raise HTTPException(status_code=400, detail="Please upload a JPG, PNG or WebP recipe image")
    content = await file.read(_MAX_IMAGE_BYTES + 1)
    if len(content) > _MAX_IMAGE_BYTES:
        raise HTTPException(status_code=413, detail="Recipe image must be 6 MB or smaller")
    if not content:
        raise HTTPException(status_code=400, detail="The selected image is empty")
    try:
        with Image.open(BytesIO(content)) as image:
            image.verify()
            actual_format = (image.format or "").upper()
    except (UnidentifiedImageError, OSError, ValueError):
        raise HTTPException(status_code=400, detail="The selected file is not a valid recipe image")
    if actual_format not in {"JPEG", "PNG", "WEBP"}:
        raise HTTPException(status_code=400, detail="Please upload a JPG, PNG or WebP recipe image")
    verified_suffix = {"JPEG": ".jpg", "PNG": ".png", "WEBP": ".webp"}[actual_format]
    suffix = verified_suffix

    uploads_dir = Path(settings.upload_dir) / "community-recipes" / f"user-{user.id}"
    uploads_dir.mkdir(parents=True, exist_ok=True)
    filename = f"recipe-{recipe.id}-{uuid4().hex}{suffix}"
    target = uploads_dir / filename
    target.write_bytes(content)

    old_image = recipe.image_url
    recipe.image_url = f"/uploads/community-recipes/user-{user.id}/{filename}"
    recipe.updated_at = utc_now()
    db.commit()
    db.refresh(recipe)
    _delete_local_image(old_image)
    recipe.owner = user
    return _serialize(recipe, user.id)


@router.delete("/{recipe_id}/image", response_model=CommunityRecipeOut)
def remove_recipe_image(
    recipe_id: int,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
):
    recipe = _owned_recipe(recipe_id, user, db)
    old_image = recipe.image_url
    recipe.image_url = None
    recipe.updated_at = utc_now()
    db.commit()
    db.refresh(recipe)
    _delete_local_image(old_image)
    recipe.owner = user
    return _serialize(recipe, user.id)


@router.delete("/{recipe_id}")
def delete_recipe(
    recipe_id: int,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
):
    recipe = _owned_recipe(recipe_id, user, db)
    image_url = recipe.image_url
    db.delete(recipe)
    db.commit()
    _delete_local_image(image_url)
    return {"ok": True, "message": "Recipe deleted"}
