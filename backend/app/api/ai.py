from __future__ import annotations

from collections import defaultdict
from datetime import date, datetime, timedelta, timezone
from io import BytesIO
import json
from pathlib import Path
import statistics
import subprocess
import tempfile
import uuid

from fastapi import APIRouter, Depends, File, Form, HTTPException, UploadFile
from PIL import Image
import pytesseract
from sqlalchemy.orm import Session, joinedload

from app.api.activity_utils import log_activity
from app.api.admin import require_admin
from app.api.deps import get_current_user, require_house_member
from app.api.plan_utils import ensure_product_limit, house_plan_has_kitchen_check
from app.core.config import settings
from app.db.session import get_db
from app.models import (
    AutopilotDecision,
    House,
    KitchenStorageZone,
    KitchenVisionObservation,
    KitchenVisionScan,
    Product,
    Receipt,
    ReceiptLineItem,
    Section,
    ShoppingItemStatus,
    ShoppingList,
    ShoppingListItem,
    User,
)
from app.schemas import (
    AISystemComponentOut,
    AISystemStatusOut,
    DigitalTwinProductOut,
    HouseholdAgentIn,
    HouseholdAgentOut,
    HouseholdDigitalTwinOut,
    KitchenVisionApplyIn,
    KitchenVisionApplyOut,
    KitchenVisionNotConfirmedOut,
    KitchenZoneCreateIn,
    KitchenZoneOut,
    KitchenZoneUpdateIn,
    KitchenVisionDetectionOut,
    KitchenVisionOut,
)
from app.services.kitchen_vision_logic import physical_observation_key
from app.utils.digitalocean_ai import (
    DigitalOceanAIError,
    agent_configured,
    agent_healthcheck,
    analyze_kitchen_frames,
    ask_household_agent,
    inference_healthcheck,
    vision_configured,
)

router = APIRouter(prefix="/ai", tags=["ai"])


def _confidence_label(value: float) -> str:
    if value >= 0.85:
        return "high"
    if value >= 0.60:
        return "medium"
    return "low"


def _product_inventory(db: Session, house_id: int) -> list[Product]:
    return db.query(Product).filter(Product.house_id == house_id).order_by(Product.name.asc()).all()


def _extract_video_frames(content: bytes, filename: str) -> list[tuple[bytes, str, str]]:
    if not settings.kitchen_vision_allow_video:
        raise HTTPException(status_code=400, detail="Kitchen Vision video analysis is disabled for this deployment.")
    with tempfile.TemporaryDirectory(prefix="ghm-kitchen-video-") as temp_dir:
        temp = Path(temp_dir)
        suffix = Path(filename or "scan.mp4").suffix or ".mp4"
        source = temp / f"source{suffix}"
        source.write_bytes(content)
        try:
            probe = subprocess.run(
                ["ffprobe", "-v", "error", "-show_entries", "format=duration", "-of", "default=noprint_wrappers=1:nokey=1", str(source)],
                capture_output=True,
                text=True,
                check=True,
                timeout=12,
            )
            duration = float((probe.stdout or "0").strip() or 0)
        except Exception as exc:
            raise HTTPException(status_code=400, detail="The uploaded video could not be inspected. Try MP4/MOV/WEBM.") from exc
        if duration <= 0:
            raise HTTPException(status_code=400, detail="The uploaded video does not have a readable duration.")
        if duration > settings.kitchen_vision_max_video_seconds:
            raise HTTPException(status_code=400, detail=f"Kitchen Vision videos are limited to {settings.kitchen_vision_max_video_seconds} seconds.")

        frame_count = max(3, min(settings.kitchen_vision_max_frames, int(duration / 3) + 2))
        fps = frame_count / max(duration, 1)
        output = temp / "frame-%03d.jpg"
        try:
            subprocess.run(
                [
                    "ffmpeg", "-hide_banner", "-loglevel", "error", "-i", str(source),
                    "-vf", f"fps={fps:.4f},scale='min(1280,iw)':-2",
                    "-frames:v", str(frame_count), "-q:v", "3", str(output),
                ],
                capture_output=True,
                check=True,
                timeout=35,
            )
        except Exception as exc:
            raise HTTPException(status_code=400, detail="Kitchen Vision could not sample frames from this video.") from exc
        frames: list[tuple[bytes, str, str]] = []
        for path in sorted(temp.glob("frame-*.jpg"))[: settings.kitchen_vision_max_frames]:
            frames.append((path.read_bytes(), path.name, "image/jpeg"))
        if not frames:
            raise HTTPException(status_code=400, detail="No usable frames could be extracted from the video.")
        return frames


def _ocr_fallback(frames: list[tuple[bytes, str, str]], inventory: list[Product]) -> dict:
    combined = ""
    for raw, _, _ in frames:
        try:
            image = Image.open(BytesIO(raw)).convert("RGB")
            combined += "\n" + pytesseract.image_to_string(image, config="--psm 6")
        except Exception:
            continue
    normalized = " ".join(combined.lower().split())
    detections = []
    for product in inventory:
        name = " ".join(product.name.lower().split())
        brand = " ".join((product.brand or "").lower().split())
        if (len(name) >= 4 and name in normalized) or (brand and len(brand) >= 4 and brand in normalized):
            detections.append({
                "detected_name": product.name,
                "category": "other",
                "matched_product_id": product.id,
                "matched_product_name": product.name,
                "visible_instance_count": None,
                "seen_in_frames": [],
                "estimated_quantity": None,
                "quantity_min": None,
                "quantity_max": None,
                "unit": product.unit,
                "remaining_percent": None,
                "confidence": 0.72,
                "evidence": "label",
                "exact_identity": False,
                "visibility_state": "seen",
                "notes": "OCR fallback found readable text matching this inventory product; physical quantity was not inferred.",
            })
    return {
        "scene_summary": "GHM Vision is not configured, so the label-reading fallback checked readable package text only.",
        "coverage_percent": min(40, max(15, len(frames) * 8)),
        "coverage_label": "limited",
        "scan_quality": "low",
        "unseen_areas": ["Physical coverage cannot be measured reliably in OCR fallback mode."],
        "targeted_rechecks": [],
        "detections": detections,
        "warnings": ["Advanced physical-object recognition is unavailable until the GHM Vision provider is configured."],
    }


def _safe_float(value, *, minimum: float | None = None, maximum: float | None = None) -> float | None:
    try:
        number = float(value)
    except (TypeError, ValueError):
        return None
    if minimum is not None:
        number = max(minimum, number)
    if maximum is not None:
        number = min(maximum, number)
    return number


def _safe_int(value, *, minimum: int | None = None, maximum: int | None = None) -> int | None:
    try:
        number = int(round(float(value)))
    except (TypeError, ValueError):
        return None
    if minimum is not None:
        number = max(minimum, number)
    if maximum is not None:
        number = min(maximum, number)
    return number


def _coverage_label(percent: int) -> str:
    if percent >= 85:
        return "strong"
    if percent >= 65:
        return "good"
    if percent >= 35:
        return "partial"
    return "limited"


def _ensure_default_kitchen_zones(db: Session, house_id: int) -> list[KitchenStorageZone]:
    zones = (
        db.query(KitchenStorageZone)
        .filter(KitchenStorageZone.house_id == house_id, KitchenStorageZone.is_active.is_(True))
        .order_by(KitchenStorageZone.sort_order.asc(), KitchenStorageZone.id.asc())
        .all()
    )
    if zones:
        return zones
    defaults = [
        ("Fridge", "fridge"),
        ("Freezer", "freezer"),
        ("Pantry / cupboard", "pantry"),
        ("Counter / rack", "rack"),
    ]
    zones = []
    for index, (name, zone_type) in enumerate(defaults):
        zone = KitchenStorageZone(house_id=house_id, name=name, zone_type=zone_type, sort_order=index)
        db.add(zone)
        zones.append(zone)
    db.commit()
    for zone in zones:
        db.refresh(zone)
    return zones


def _zone_recognition_memory(db: Session, house_id: int, zone_id: int | None) -> list[dict]:
    if not zone_id:
        return []
    since = datetime.now(timezone.utc) - timedelta(days=120)
    rows = (
        db.query(KitchenVisionObservation)
        .filter(
            KitchenVisionObservation.house_id == house_id,
            KitchenVisionObservation.zone_id == zone_id,
            KitchenVisionObservation.visibility_state.in_(["seen", "partially_obscured"]),
            KitchenVisionObservation.created_at >= since,
        )
        .order_by(KitchenVisionObservation.created_at.desc())
        .limit(220)
        .all()
    )
    grouped: dict[str, dict] = {}
    for row in rows:
        key = str(row.product_id or row.detected_name.lower())
        if key in grouped:
            grouped[key]["observations"] += 1
            continue
        product = db.get(Product, row.product_id) if row.product_id else None
        grouped[key] = {
            "product_id": row.product_id,
            "product_name": product.name if product else row.detected_name,
            "brand": product.brand if product else None,
            "barcode": product.barcode if product else None,
            "usual_visible_instances": row.visible_instance_count,
            "last_confidence": round(float(row.confidence or 0), 3),
            "observations": 1,
        }
    return list(grouped.values())[:120]


def _expected_zone_products(db: Session, house_id: int, zone_id: int | None) -> list[Product]:
    if not zone_id:
        return []
    since = datetime.now(timezone.utc) - timedelta(days=120)
    product_ids = [
        row[0]
        for row in (
            db.query(KitchenVisionObservation.product_id)
            .filter(
                KitchenVisionObservation.house_id == house_id,
                KitchenVisionObservation.zone_id == zone_id,
                KitchenVisionObservation.product_id.is_not(None),
                KitchenVisionObservation.visibility_state.in_(["seen", "partially_obscured"]),
                KitchenVisionObservation.created_at >= since,
            )
            .distinct()
            .all()
        )
        if row[0] is not None
    ]
    if not product_ids:
        return []
    return db.query(Product).filter(Product.house_id == house_id, Product.id.in_(product_ids)).all()


def _prior_zone_misses(db: Session, house_id: int, zone_id: int | None, product_id: int) -> int:
    if not zone_id:
        return 0
    since = datetime.now(timezone.utc) - timedelta(days=120)
    return (
        db.query(KitchenVisionObservation)
        .join(KitchenVisionScan, KitchenVisionScan.id == KitchenVisionObservation.scan_id)
        .filter(
            KitchenVisionObservation.house_id == house_id,
            KitchenVisionObservation.zone_id == zone_id,
            KitchenVisionObservation.product_id == product_id,
            KitchenVisionObservation.visibility_state == "not_confirmed",
            KitchenVisionObservation.created_at >= since,
            KitchenVisionScan.coverage_percent >= 65,
        )
        .count()
    )


def _zone_out(db: Session, zone: KitchenStorageZone) -> KitchenZoneOut:
    since = datetime.now(timezone.utc) - timedelta(days=120)
    expected = (
        db.query(KitchenVisionObservation.product_id)
        .filter(
            KitchenVisionObservation.zone_id == zone.id,
            KitchenVisionObservation.product_id.is_not(None),
            KitchenVisionObservation.visibility_state.in_(["seen", "partially_obscured"]),
            KitchenVisionObservation.created_at >= since,
        )
        .distinct()
        .count()
    )
    recent_since = datetime.now(timezone.utc) - timedelta(days=14)
    recent_seen = (
        db.query(KitchenVisionObservation)
        .filter(
            KitchenVisionObservation.zone_id == zone.id,
            KitchenVisionObservation.visibility_state.in_(["seen", "partially_obscured"]),
            KitchenVisionObservation.created_at >= recent_since,
        )
        .count()
    )
    return KitchenZoneOut(
        id=zone.id,
        house_id=zone.house_id,
        name=zone.name,
        zone_type=zone.zone_type,
        sort_order=zone.sort_order,
        is_active=zone.is_active,
        last_scanned_at=zone.last_scanned_at,
        last_coverage_percent=zone.last_coverage_percent,
        last_confidence_label=zone.last_confidence_label,
        expected_product_count=expected,
        recent_seen_count=recent_seen,
    )


def _normalize_vision_result(
    raw: dict,
    inventory: list[Product],
    media_checked: int,
    frames_analyzed: int,
    mode: str,
    *,
    scan_mode: str,
    zone: KitchenStorageZone | None,
    db: Session,
    house_id: int,
    user_id: int,
) -> KitchenVisionOut:
    by_id = {product.id: product for product in inventory}
    detections: list[KitchenVisionDetectionOut] = []
    seen_products: set[int] = set()
    seen_keys: set[str] = set()
    coverage = _safe_int(raw.get("coverage_percent"), minimum=0, maximum=100)
    if coverage is None:
        coverage = min(90, max(20, frames_analyzed * (12 if scan_mode == "full" else 8)))
    coverage_label = str(raw.get("coverage_label") or _coverage_label(coverage)).lower()
    if coverage_label not in {"limited", "partial", "good", "strong"}:
        coverage_label = _coverage_label(coverage)
    scan_quality = str(raw.get("scan_quality") or ("high" if coverage >= 80 else "medium" if coverage >= 45 else "low")).lower()
    if scan_quality not in {"low", "medium", "high"}:
        scan_quality = "medium"

    for index, row in enumerate(raw.get("detections") or []):
        if not isinstance(row, dict):
            continue
        confidence = _safe_float(row.get("confidence"), minimum=0, maximum=1) or 0.0
        matched_id = _safe_int(row.get("matched_product_id"), minimum=1)
        product = by_id.get(matched_id) if matched_id else None
        if matched_id and product is None:
            matched_id = None
        detected_name = str(row.get("detected_name") or row.get("matched_product_name") or "Unknown item").strip()[:180]
        visible_instances = _safe_int(row.get("visible_instance_count"), minimum=0, maximum=500)
        frame_values: list[int] = []
        for value in row.get("seen_in_frames") or []:
            parsed = _safe_int(value, minimum=1, maximum=max(frames_analyzed, 1))
            if parsed is not None and parsed not in frame_values:
                frame_values.append(parsed)
        # The model should already group the same physical object across frames. This key only protects
        # against accidental duplicate groups with identical evidence; legitimate multiple identical
        # units stay represented by visible_instance_count rather than being collapsed here.
        merge_key = physical_observation_key(matched_id, detected_name, visible_instances, frame_values)
        if merge_key in seen_keys:
            continue
        seen_keys.add(merge_key)
        if product:
            seen_products.add(product.id)
        est_qty = _safe_float(row.get("estimated_quantity"), minimum=0)
        qty_min = _safe_float(row.get("quantity_min"), minimum=0)
        qty_max = _safe_float(row.get("quantity_max"), minimum=0)
        if qty_min is not None and qty_max is not None and qty_min > qty_max:
            qty_min, qty_max = qty_max, qty_min
        remaining = _safe_float(row.get("remaining_percent"), minimum=0, maximum=100)
        exact = bool(row.get("exact_identity"))
        label = _confidence_label(confidence)
        visibility_state = str(row.get("visibility_state") or "seen")[:32]
        if visibility_state not in {"seen", "partially_obscured"}:
            visibility_state = "seen"
        current_quantity = float(product.quantity) if product else None
        # Conservative suggestion rule: a high-confidence positive observation can support an update,
        # but a lower visible count must not silently imply the missing units are gone unless the scan
        # was strong/full. Even then the user must approve it.
        suggested_action = "review"
        if product and est_qty is not None and confidence >= 0.88:
            if current_quantity is None or est_qty >= current_quantity:
                suggested_action = "update"
            elif scan_mode == "full" and coverage >= 85 and visibility_state == "seen":
                suggested_action = "review"
        elif not product and confidence >= 0.90 and detected_name.lower() != "unknown item":
            suggested_action = "add"
        detections.append(KitchenVisionDetectionOut(
            detection_id=f"kv-{index}-{uuid.uuid4().hex[:8]}",
            detected_name=detected_name,
            category=str(row.get("category") or "other")[:40],
            matched_product_id=product.id if product else None,
            matched_product_name=product.name if product else None,
            current_quantity=current_quantity,
            current_unit=product.unit if product else None,
            estimated_quantity=est_qty,
            quantity_min=qty_min,
            quantity_max=qty_max,
            unit=str(row.get("unit") or (product.unit if product else "unknown"))[:32],
            visible_instance_count=visible_instances,
            seen_in_frames=frame_values,
            remaining_percent=remaining,
            confidence=round(confidence, 3),
            confidence_label=label,
            evidence=str(row.get("evidence") or "visual")[:40],
            exact_identity=exact,
            visibility_state=visibility_state,
            suggested_action=suggested_action,
            notes=str(row.get("notes") or "")[:600],
        ))

    expected_products = _expected_zone_products(db, house_id, zone.id if zone else None)
    not_confirmed: list[KitchenVisionNotConfirmedOut] = []
    for product in expected_products:
        if product.id in seen_products or float(product.quantity or 0) <= 0:
            continue
        misses = _prior_zone_misses(db, house_id, zone.id if zone else None, product.id)
        reason = "Not visible in this scan. GHM keeps the recorded quantity unchanged because hidden or blocked products may still be present."
        if scan_mode == "full" and coverage >= 85 and misses >= 1:
            reason = "Not confirmed in another strong scan. This may be depleted, but GHM will not reduce inventory until you explicitly confirm it."
        not_confirmed.append(KitchenVisionNotConfirmedOut(
            product_id=product.id,
            product_name=product.name,
            current_quantity=float(product.quantity or 0),
            unit=product.unit,
            prior_missed_scans=misses,
            status="possible_depletion" if scan_mode == "full" and coverage >= 85 and misses >= 1 else "not_confirmed",
            reason=reason,
        ))

    targeted = [str(item).strip()[:180] for item in (raw.get("targeted_rechecks") or []) if str(item).strip()][:5]
    # If the model did not produce useful rechecks, make conservative, context-aware prompts.
    if not targeted:
        for detection in detections:
            if detection.confidence_label != "high" and len(targeted) < 3:
                targeted.append(f"Show {detection.detected_name} more clearly from one close angle.")
        for row in not_confirmed[: max(0, 5 - len(targeted))]:
            targeted.append(f"If convenient, show where {row.product_name} is usually stored.")
    unseen_areas = [str(item).strip()[:180] for item in (raw.get("unseen_areas") or []) if str(item).strip()][:8]
    warnings = [str(item)[:400] for item in (raw.get("warnings") or []) if str(item).strip()][:8]

    high = sum(1 for row in detections if row.confidence_label == "high")
    new = sum(1 for row in detections if row.matched_product_id is None)
    review = sum(1 for row in detections if row.suggested_action == "review")
    scene_summary = str(raw.get("scene_summary") or "Kitchen scan analyzed.")[:1000]

    scan = KitchenVisionScan(
        house_id=house_id,
        zone_id=zone.id if zone else None,
        user_id=user_id,
        scan_mode=scan_mode,
        coverage_percent=coverage,
        coverage_label=coverage_label,
        frames_analyzed=frames_analyzed,
        detections_count=len(detections),
        uncertain_count=review + len(not_confirmed),
        scene_summary=scene_summary,
    )
    db.add(scan)
    db.flush()
    for detection in detections:
        db.add(KitchenVisionObservation(
            scan_id=scan.id,
            house_id=house_id,
            zone_id=zone.id if zone else None,
            product_id=detection.matched_product_id,
            detected_name=detection.detected_name,
            visibility_state=detection.visibility_state,
            visible_instance_count=detection.visible_instance_count,
            quantity_min=detection.quantity_min,
            quantity_max=detection.quantity_max,
            confidence=detection.confidence,
            evidence=detection.evidence,
            notes=detection.notes,
        ))
    for row in not_confirmed:
        db.add(KitchenVisionObservation(
            scan_id=scan.id,
            house_id=house_id,
            zone_id=zone.id if zone else None,
            product_id=row.product_id,
            detected_name=row.product_name,
            visibility_state="not_confirmed",
            confidence=0,
            evidence="coverage",
            notes=row.reason,
        ))
    if zone:
        zone.last_scanned_at = datetime.now(timezone.utc)
        zone.last_coverage_percent = coverage
        zone.last_confidence_label = "high" if coverage >= 85 and high >= max(1, len(detections) // 2) else "medium" if coverage >= 50 else "low"
        db.add(zone)
    db.commit()

    return KitchenVisionOut(
        scan_id=scan.id,
        mode=mode,
        scan_mode=scan_mode,
        zone_id=zone.id if zone else None,
        zone_name=zone.name if zone else None,
        media_checked=media_checked,
        frames_analyzed=frames_analyzed,
        coverage_percent=coverage,
        coverage_label=coverage_label,
        scan_quality=scan_quality,
        scene_summary=scene_summary,
        detections=detections[:80],
        not_confirmed=not_confirmed[:80],
        targeted_rechecks=targeted,
        unseen_areas=unseen_areas,
        warnings=warnings,
        high_confidence_count=high,
        review_count=review,
        possible_new_count=new,
        message=(
            "GHM Kitchen Vision counted visible physical instances without collapsing legitimate multiple units. Hidden products are treated as not confirmed, never automatically gone. Review only the suggested changes before applying them."
            if mode == "ghm_vision"
            else "Label-reading fallback is active. GHM did not infer missing physical products or destructive quantity changes."
        ),
    )


@router.get("/houses/{house_id}/kitchen-zones", response_model=list[KitchenZoneOut])
def list_kitchen_zones(house_id: int, db: Session = Depends(get_db), user: User = Depends(get_current_user)):
    require_house_member(house_id, user, db)
    zones = _ensure_default_kitchen_zones(db, house_id)
    return [_zone_out(db, zone) for zone in zones if zone.is_active]


@router.post("/houses/{house_id}/kitchen-zones", response_model=KitchenZoneOut)
def create_kitchen_zone(house_id: int, payload: KitchenZoneCreateIn, db: Session = Depends(get_db), user: User = Depends(get_current_user)):
    require_house_member(house_id, user, db)
    existing = db.query(KitchenStorageZone).filter(KitchenStorageZone.house_id == house_id, KitchenStorageZone.name.ilike(payload.name.strip())).first()
    if existing:
        if not existing.is_active:
            existing.is_active = True
            existing.zone_type = payload.zone_type
            db.commit()
            db.refresh(existing)
            return _zone_out(db, existing)
        raise HTTPException(status_code=409, detail="A kitchen area with this name already exists.")
    max_sort = max([row.sort_order for row in db.query(KitchenStorageZone).filter(KitchenStorageZone.house_id == house_id).all()] or [-1])
    zone = KitchenStorageZone(house_id=house_id, name=payload.name.strip(), zone_type=payload.zone_type, sort_order=max_sort + 1)
    db.add(zone)
    db.commit()
    db.refresh(zone)
    return _zone_out(db, zone)


@router.patch("/houses/{house_id}/kitchen-zones/{zone_id}", response_model=KitchenZoneOut)
def update_kitchen_zone(house_id: int, zone_id: int, payload: KitchenZoneUpdateIn, db: Session = Depends(get_db), user: User = Depends(get_current_user)):
    require_house_member(house_id, user, db)
    zone = db.query(KitchenStorageZone).filter(KitchenStorageZone.id == zone_id, KitchenStorageZone.house_id == house_id).first()
    if not zone:
        raise HTTPException(status_code=404, detail="Kitchen area not found.")
    for key, value in payload.model_dump(exclude_unset=True).items():
        setattr(zone, key, value)
    db.commit()
    db.refresh(zone)
    return _zone_out(db, zone)


@router.delete("/houses/{house_id}/kitchen-zones/{zone_id}")
def archive_kitchen_zone(house_id: int, zone_id: int, db: Session = Depends(get_db), user: User = Depends(get_current_user)):
    require_house_member(house_id, user, db)
    zone = db.query(KitchenStorageZone).filter(KitchenStorageZone.id == zone_id, KitchenStorageZone.house_id == house_id).first()
    if not zone:
        raise HTTPException(status_code=404, detail="Kitchen area not found.")
    zone.is_active = False
    db.commit()
    return {"ok": True}


@router.post("/houses/{house_id}/kitchen-vision", response_model=KitchenVisionOut)
async def kitchen_vision(
    house_id: int,
    media: list[UploadFile] = File(...),
    zone_id: int | None = Form(default=None),
    scan_mode: str = Form(default="quick"),
    target_product_ids_json: str | None = Form(default=None),
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
):
    require_house_member(house_id, user, db)
    if not settings.kitchen_vision_enabled:
        raise HTTPException(status_code=503, detail="Kitchen Vision is disabled for this deployment.")
    if not house_plan_has_kitchen_check(db, house_id):
        raise HTTPException(status_code=402, detail="Kitchen Vision requires Household Pro.")
    if scan_mode not in {"quick", "full", "targeted"}:
        raise HTTPException(status_code=400, detail="Kitchen Vision scan mode must be quick, full, or targeted.")
    if not media:
        raise HTTPException(status_code=400, detail="Add at least one kitchen photo or short video.")
    if len(media) > settings.kitchen_vision_max_files:
        raise HTTPException(status_code=400, detail=f"Kitchen Vision accepts up to {settings.kitchen_vision_max_files} files per scan.")

    zone: KitchenStorageZone | None = None
    if zone_id:
        zone = db.query(KitchenStorageZone).filter(
            KitchenStorageZone.id == zone_id,
            KitchenStorageZone.house_id == house_id,
            KitchenStorageZone.is_active.is_(True),
        ).first()
        if not zone:
            raise HTTPException(status_code=404, detail="Kitchen area not found.")
    else:
        zones = _ensure_default_kitchen_zones(db, house_id)
        zone = zones[0] if zones else None

    target_ids: list[int] = []
    if target_product_ids_json:
        try:
            parsed = json.loads(target_product_ids_json)
            if isinstance(parsed, list):
                target_ids = [int(value) for value in parsed[:30] if str(value).isdigit()]
        except Exception:
            raise HTTPException(status_code=400, detail="Target product ids were not valid JSON.")

    frames: list[tuple[bytes, str, str]] = []
    media_checked = 0
    max_bytes = settings.kitchen_vision_upload_max_mb * 1024 * 1024
    for upload in media:
        raw = await upload.read()
        if not raw:
            continue
        if len(raw) > max_bytes:
            raise HTTPException(status_code=400, detail=f"{upload.filename or 'Media'} exceeds the {settings.kitchen_vision_upload_max_mb} MB limit.")
        content_type = (upload.content_type or "").lower()
        name = upload.filename or "kitchen-media"
        if content_type.startswith("video/") or Path(name).suffix.lower() in {".mp4", ".mov", ".webm", ".m4v"}:
            frames.extend(_extract_video_frames(raw, name))
        elif content_type.startswith("image/") or Path(name).suffix.lower() in {".jpg", ".jpeg", ".png", ".webp"}:
            try:
                image = Image.open(BytesIO(raw)).convert("RGB")
                if max(image.size) > 1600:
                    image.thumbnail((1600, 1600))
                out = BytesIO()
                image.save(out, format="JPEG", quality=88, optimize=True)
                frames.append((out.getvalue(), Path(name).stem + ".jpg", "image/jpeg"))
            except Exception as exc:
                raise HTTPException(status_code=400, detail=f"{name} is not a readable kitchen image.") from exc
        else:
            raise HTTPException(status_code=400, detail=f"Unsupported media type for {name}. Use JPG, PNG, WEBP, MP4, MOV, or WEBM.")
        media_checked += 1
    frames = frames[: settings.kitchen_vision_max_frames]
    if not frames:
        raise HTTPException(status_code=400, detail="No usable kitchen frames were found.")

    inventory = _product_inventory(db, house_id)
    inventory_payload = [
        {
            "id": p.id,
            "name": p.name,
            "brand": p.brand,
            "barcode": p.barcode,
            "quantity": p.quantity,
            "unit": p.unit,
            "usage_scope": p.usage_scope or "shared",
        }
        for p in inventory
    ]
    zone_payload = {"id": zone.id, "name": zone.name, "zone_type": zone.zone_type} if zone else None
    recognition_memory = _zone_recognition_memory(db, house_id, zone.id if zone else None)
    target_products = [
        {"id": p.id, "name": p.name, "brand": p.brand, "barcode": p.barcode, "quantity": p.quantity, "unit": p.unit}
        for p in inventory
        if p.id in target_ids
    ]
    if vision_configured():
        try:
            raw_result = analyze_kitchen_frames(
                images=frames,
                inventory=inventory_payload,
                zone=zone_payload,
                scan_mode=scan_mode,
                recognition_memory=recognition_memory,
                target_products=target_products,
            )
            mode = "ghm_vision"
        except DigitalOceanAIError as exc:
            raw_result = _ocr_fallback(frames, inventory)
            raw_result.setdefault("warnings", []).append(f"GHM Vision was unavailable for this scan: {exc}")
            mode = "ocr_fallback"
    else:
        raw_result = _ocr_fallback(frames, inventory)
        mode = "ocr_fallback"
    return _normalize_vision_result(
        raw_result,
        inventory,
        media_checked,
        len(frames),
        mode,
        scan_mode=scan_mode,
        zone=zone,
        db=db,
        house_id=house_id,
        user_id=user.id,
    )


def _get_or_create_vision_section(db: Session, house_id: int) -> Section:
    section = db.query(Section).filter(Section.house_id == house_id, Section.name == "Kitchen Vision").first()
    if section:
        return section
    section = Section(house_id=house_id, name="Kitchen Vision", icon="👁️", sort_order=999)
    db.add(section)
    db.flush()
    return section


def _active_list(db: Session, house_id: int, user_id: int) -> ShoppingList:
    shopping_list = (
        db.query(ShoppingList)
        .filter(ShoppingList.house_id == house_id, ShoppingList.is_done.is_(False))
        .order_by(ShoppingList.created_at.desc())
        .first()
    )
    if shopping_list:
        return shopping_list
    shopping_list = ShoppingList(house_id=house_id, title="Autopilot grocery list", created_by_id=user_id)
    db.add(shopping_list)
    db.flush()
    return shopping_list


@router.post("/houses/{house_id}/kitchen-vision/apply", response_model=KitchenVisionApplyOut)
def apply_kitchen_vision(
    house_id: int,
    payload: KitchenVisionApplyIn,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
):
    require_house_member(house_id, user, db)
    if not house_plan_has_kitchen_check(db, house_id):
        raise HTTPException(status_code=402, detail="Kitchen Vision requires Household Pro.")
    updated: list[str] = []
    added: list[str] = []
    added_to_list: list[str] = []
    ignored = 0
    restock_candidates: list[Product] = []
    section: Section | None = None

    for item in payload.items:
        if item.action == "ignore":
            ignored += 1
            continue
        if item.action == "update":
            if not item.product_id:
                raise HTTPException(status_code=400, detail="An inventory product is required for update actions.")
            product = db.get(Product, item.product_id)
            if not product or product.house_id != house_id:
                raise HTTPException(status_code=404, detail="A Kitchen Vision inventory product was not found.")
            if item.quantity is not None:
                product.quantity = float(item.quantity)
            if item.unit:
                product.unit = item.unit[:32]
            db.add(product)
            updated.append(product.name)
            threshold = float(product.low_stock_threshold) if product.low_stock_threshold is not None else 0
            if float(product.quantity or 0) <= threshold:
                restock_candidates.append(product)
        elif item.action == "add":
            name = (item.name or "").strip()
            if not name:
                raise HTTPException(status_code=400, detail="A product name is required before adding a new Kitchen Vision item.")
            ensure_product_limit(db, house_id, user)
            existing = db.query(Product).filter(Product.house_id == house_id, Product.name.ilike(name)).first()
            if existing:
                if item.quantity is not None:
                    existing.quantity = float(item.quantity)
                db.add(existing)
                updated.append(existing.name)
                continue
            if section is None:
                section = _get_or_create_vision_section(db, house_id)
            product = Product(
                house_id=house_id,
                section_id=section.id,
                name=name[:180],
                quantity=float(item.quantity or 1),
                unit=(item.unit or "pcs")[:32],
                notes="Added after user-approved Kitchen Vision scan.",
            )
            db.add(product)
            db.flush()
            added.append(product.name)

    if payload.add_depleted_staples_to_list and restock_candidates:
        shopping_list = _active_list(db, house_id, user.id)
        for product in restock_candidates:
            exists = db.query(ShoppingListItem).filter(
                ShoppingListItem.shopping_list_id == shopping_list.id,
                ShoppingListItem.product_id == product.id,
                ShoppingListItem.status != ShoppingItemStatus.skipped,
            ).first()
            if exists:
                continue
            shopping_item = ShoppingListItem(
                shopping_list_id=shopping_list.id,
                product_id=product.id,
                requested_quantity=max(float(product.low_stock_threshold or 1), 1),
                bought_quantity=max(float(product.low_stock_threshold or 1), 1),
                message="Kitchen Vision · user-approved low/depleted inventory update",
                status=ShoppingItemStatus.to_buy,
            )
            db.add(shopping_item)
            added_to_list.append(product.name)

    log_activity(db, house_id=house_id, user=user, action="kitchen_vision_applied", message=f"Applied Kitchen Vision review: {len(updated)} updated, {len(added)} added")
    db.commit()
    return KitchenVisionApplyOut(
        updated_products=updated,
        added_products=added,
        added_to_list=added_to_list,
        ignored=ignored,
        message=f"Kitchen Vision applied {len(updated) + len(added)} approved inventory change(s). Autopilot will use the updated inventory immediately.",
    )


def _decision_pattern(db: Session, house_id: int) -> tuple[str, list[str]]:
    recent = db.query(AutopilotDecision).filter(AutopilotDecision.house_id == house_id).order_by(AutopilotDecision.created_at.desc()).limit(30).all()
    if not recent:
        return "learning", ["Not enough household decision history yet."]
    counts: dict[str, int] = defaultdict(int)
    deltas: list[float] = []
    for row in recent:
        counts[row.selected_option] += 1
        if row.delta_cost and row.delta_cost > 0:
            deltas.append(float(row.delta_cost))
    mode = max(counts.items(), key=lambda pair: pair[1])[0]
    notes = [f"Most common recent trip choice: {mode.replace('_', ' ')} ({counts[mode]}/{len(recent)} decisions)."]
    if deltas:
        notes.append(f"When choosing above the cheapest option, the household accepted about ${statistics.mean(deltas):.2f} extra on average.")
    return mode, notes


def _digital_twin(db: Session, house: House) -> HouseholdDigitalTwinOut:
    since = datetime.now(timezone.utc) - timedelta(days=120)
    products = db.query(Product).filter(Product.house_id == house.id).order_by(Product.name.asc()).all()
    lines = (
        db.query(ReceiptLineItem)
        .join(Receipt, Receipt.id == ReceiptLineItem.receipt_id)
        .filter(
            ReceiptLineItem.house_id == house.id,
            ReceiptLineItem.matched_product_id.is_not(None),
            Receipt.created_at >= since,
        )
        .order_by(Receipt.created_at.asc())
        .all()
    )
    events: dict[int, list[tuple[date, float]]] = defaultdict(list)
    receipt_cache: dict[int, Receipt] = {}
    for line in lines:
        receipt = line.receipt
        if not receipt:
            receipt = receipt_cache.get(line.receipt_id)
        if not receipt:
            continue
        observed = receipt.receipt_date or receipt.created_at.date()
        qty = float(line.quantity or line.inventory_quantity_applied or 1)
        if qty > 0 and line.matched_product_id:
            events[int(line.matched_product_id)].append((observed, qty))

    modeled: list[DigitalTwinProductOut] = []
    likely = 0
    today = date.today()
    for product in products:
        # Expired inventory is never treated as usable stock or a depletion forecast input.
        # It belongs in the review/discard workflow, not meal/restock reasoning.
        if product.expiry_date and product.expiry_date < today:
            continue
        history = events.get(product.id, [])
        intervals: list[float] = []
        quantities = [qty for _, qty in history]
        for (a, _), (b, _) in zip(history, history[1:]):
            diff = (b - a).days
            if diff > 0:
                intervals.append(float(diff))
        avg_interval = statistics.mean(intervals) if intervals else None
        avg_qty = statistics.mean(quantities) if quantities else None
        daily_use = (avg_qty / avg_interval) if avg_qty and avg_interval and avg_interval > 0 else None
        days_remaining = (float(product.quantity or 0) / daily_use) if daily_use and daily_use > 0 else None
        threshold = float(product.low_stock_threshold) if product.low_stock_threshold is not None else 0
        needed_soon = bool((days_remaining is not None and days_remaining <= 7) or float(product.quantity or 0) <= threshold)
        if needed_soon:
            likely += 1
        confidence = "high" if len(history) >= 4 and len(intervals) >= 3 else "medium" if len(history) >= 2 else "low"
        if days_remaining is not None:
            reason = f"Based on {len(history)} purchase observations, current stock may last about {days_remaining:.1f} days if recent cadence continues."
        elif needed_soon:
            reason = "Current quantity is at or below the household's low-stock threshold."
        else:
            reason = "More completed purchase/consumption history is needed before predicting depletion."
        if history or needed_soon:
            modeled.append(DigitalTwinProductOut(
                product_id=product.id,
                product_name=product.name,
                current_quantity=float(product.quantity or 0),
                unit=product.unit,
                average_days_between_purchases=round(avg_interval, 1) if avg_interval is not None else None,
                average_purchase_quantity=round(avg_qty, 2) if avg_qty is not None else None,
                estimated_daily_use=round(daily_use, 3) if daily_use is not None else None,
                predicted_days_remaining=round(days_remaining, 1) if days_remaining is not None else None,
                likely_needed_within_7_days=needed_soon,
                confidence=confidence,
                reason=reason,
            ))
    modeled.sort(key=lambda row: (not row.likely_needed_within_7_days, row.predicted_days_remaining if row.predicted_days_remaining is not None else 9999, row.product_name))
    pattern, notes = _decision_pattern(db, house.id)
    return HouseholdDigitalTwinOut(
        house_id=house.id,
        house_name=house.name,
        generated_at=datetime.now(timezone.utc),
        products_modeled=len(modeled),
        products_likely_needed_7d=likely,
        decision_pattern=pattern,
        decision_notes=notes,
        products=modeled[:60],
        message="The Digital Twin is deterministic: it models purchase cadence, current inventory and your recorded choices. Predictions become stronger as the household completes more real shopping/receipt cycles.",
    )


@router.get("/houses/{house_id}/digital-twin", response_model=HouseholdDigitalTwinOut)
def household_digital_twin(house_id: int, db: Session = Depends(get_db), user: User = Depends(get_current_user)):
    require_house_member(house_id, user, db)
    house = db.get(House, house_id)
    if not house:
        raise HTTPException(status_code=404, detail="House not found")
    return _digital_twin(db, house)


@router.post("/houses/{house_id}/household-agent", response_model=HouseholdAgentOut)
def household_agent(house_id: int, payload: HouseholdAgentIn, db: Session = Depends(get_db), user: User = Depends(get_current_user)):
    require_house_member(house_id, user, db)
    house = db.get(House, house_id)
    if not house:
        raise HTTPException(status_code=404, detail="House not found")
    twin = _digital_twin(db, house)
    inventory = _product_inventory(db, house_id)
    active_list = db.query(ShoppingList).options(joinedload(ShoppingList.items).joinedload(ShoppingListItem.product)).filter(ShoppingList.house_id == house_id, ShoppingList.is_done.is_(False)).order_by(ShoppingList.created_at.desc()).first()
    today = date.today()
    safe_inventory = [p for p in inventory if not p.expiry_date or p.expiry_date >= today]
    expired_inventory = [p for p in inventory if p.expiry_date and p.expiry_date < today]
    context = {
        "house": {"id": house.id, "name": house.name, "autopilot_strategy": house.autopilot_strategy, "preferred_stores": house.autopilot_preferred_stores},
        "food_safety_rule": "Never recommend eating, cooking with, or using an item whose expiry_date is before today. Expired items are review/discard items only. Items expiring today or soon may be prioritized only before they expire.",
        "inventory": [{"name": p.name, "quantity": p.quantity, "unit": p.unit, "expiry_date": str(p.expiry_date) if p.expiry_date else None} for p in safe_inventory[:120]],
        "expired_inventory_do_not_consume": [{"name": p.name, "quantity": p.quantity, "unit": p.unit, "expiry_date": str(p.expiry_date)} for p in expired_inventory[:40]],
        "digital_twin": {
            "products_likely_needed_7d": twin.products_likely_needed_7d,
            "decision_pattern": twin.decision_pattern,
            "decision_notes": twin.decision_notes,
            "priority_products": [row.model_dump() for row in twin.products[:20]],
        },
        "active_list": {
            "title": active_list.title,
            "items": [item.product.name for item in active_list.items if item.product and item.status != ShoppingItemStatus.skipped],
        } if active_list else None,
    }
    if not agent_configured():
        return HouseholdAgentOut(
            configured=False,
            used_live_agent=False,
            answer="GHM Household Intelligence is not configured yet. Kitchen Vision and the deterministic Digital Twin can still operate, but conversational household reasoning needs the configured AI agent provider credentials.",
            message="GHM Household Intelligence connector is ready; add the AI agent provider credentials in backend/.env.",
        )
    try:
        result = ask_household_agent(prompt=payload.prompt, context=context)
    except DigitalOceanAIError as exc:
        raise HTTPException(status_code=503, detail=str(exc)) from exc
    return HouseholdAgentOut(configured=True, used_live_agent=True, answer=str(result.get("answer") or ""), message="Response generated by GHM Household Intelligence using current household context.")


def _status(run_health: bool = False) -> AISystemStatusOut:
    inf_configured = vision_configured()
    ag_configured = agent_configured()
    if run_health and inf_configured:
        inf_health, inf_detail = inference_healthcheck()
    else:
        inf_health, inf_detail = (None, "Configured; run the system test to verify connectivity.") if inf_configured else (False, "Add the GHM Vision provider key and enable the AI integration.")
    if run_health and ag_configured:
        ag_health, ag_detail = agent_healthcheck()
    else:
        ag_health, ag_detail = (None, "Configured; run the system test to verify the agent endpoint.") if ag_configured else (False, "Add the agent endpoint URL and endpoint access key.")
    spaces_configured = bool(settings.do_spaces_enabled and settings.do_spaces_key and settings.do_spaces_secret and settings.do_spaces_bucket)
    return AISystemStatusOut(
        ai_enabled=settings.digitalocean_ai_enabled,
        vision_model=settings.digitalocean_vision_model if settings.digitalocean_ai_enabled else None,
        kitchen_vision_enabled=settings.kitchen_vision_enabled,
        video_enabled=settings.kitchen_vision_allow_video,
        approval_required=settings.kitchen_vision_require_approval,
        media_delete_after_analysis=settings.kitchen_media_delete_after_analysis,
        components=[
            AISystemComponentOut(key="vision", label="GHM Vision Engine", configured=inf_configured, healthy=inf_health, detail=inf_detail),
            AISystemComponentOut(key="agent", label="GHM Household Agent", configured=ag_configured, healthy=ag_health, detail=ag_detail),
            AISystemComponentOut(key="video", label="Kitchen video frame pipeline", configured=settings.kitchen_vision_allow_video, healthy=True, detail=f"FFmpeg frame sampling supports videos up to {settings.kitchen_vision_max_video_seconds}s."),
            AISystemComponentOut(key="privacy", label="Kitchen media privacy", configured=True, healthy=True, detail="Kitchen media is processed ephemerally by default and is not written to the GHM database."),
            AISystemComponentOut(key="spaces", label="Private scan storage", configured=spaces_configured, healthy=None, detail=("Optional private scan storage is configured. Kitchen Vision still processes media ephemerally unless a retention workflow is enabled." if spaces_configured else "Optional — not required. Leave private scan storage disabled unless you intentionally want to retain scan media; Kitchen Vision works normally with ephemeral processing.")),
        ],
    )


@router.get("/admin/status", response_model=AISystemStatusOut)
def ai_admin_status(_: User = Depends(require_admin)):
    return _status(run_health=False)


@router.post("/admin/test", response_model=AISystemStatusOut)
def ai_admin_test(_: User = Depends(require_admin)):
    return _status(run_health=True)
