from __future__ import annotations

from datetime import datetime, timezone

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import desc, func
from sqlalchemy.orm import Session

from app.api.admin import require_admin
from app.api.deps import get_current_user
from app.db.session import get_db
from app.models import SiteReview, User
from app.schemas import SiteReviewCreateIn, SiteReviewOut, SiteReviewSummaryOut

router = APIRouter(prefix="/reviews", tags=["reviews"])


def display_user_name(user: User | None) -> str | None:
    if not user:
        return None
    return user.full_name or (user.email.split("@")[0] if user.email else None)


def review_out(review: SiteReview, viewer: User | None = None) -> SiteReviewOut:
    user = review.user
    return SiteReviewOut(
        id=review.id,
        user_id=review.user_id,
        rating=int(review.rating or 0),
        comment=review.comment,
        is_public=bool(review.is_public),
        created_at=review.created_at,
        updated_at=review.updated_at,
        user_name=display_user_name(user),
        user_avatar_url=user.avatar_url if user else None,
        can_edit=bool(viewer and viewer.id and review.user_id == viewer.id),
    )


def current_review_for_user(db: Session, user: User) -> SiteReview | None:
    return (
        db.query(SiteReview)
        .filter(SiteReview.user_id == user.id)
        .order_by(desc(SiteReview.created_at))
        .first()
    )


@router.get("", response_model=list[SiteReviewOut])
def list_reviews(db: Session = Depends(get_db), user: User = Depends(get_current_user)):
    reviews = (
        db.query(SiteReview)
        .filter(SiteReview.is_public == True)  # noqa: E712
        .order_by(desc(SiteReview.rating), desc(SiteReview.created_at))
        .limit(12)
        .all()
    )
    return [review_out(review, viewer=user) for review in reviews]


@router.get("/mine", response_model=SiteReviewOut | None)
def my_review(db: Session = Depends(get_db), user: User = Depends(get_current_user)):
    review = current_review_for_user(db, user)
    return review_out(review, viewer=user) if review else None


@router.get("/summary", response_model=SiteReviewSummaryOut)
def review_summary(db: Session = Depends(get_db)):
    now = datetime.now(timezone.utc)
    month_start = datetime(now.year, now.month, 1, tzinfo=timezone.utc)
    total_users = db.query(User).count()
    new_users_this_month = db.query(User).filter(User.created_at >= month_start).count()
    stats = (
        db.query(func.count(SiteReview.id), func.avg(SiteReview.rating))
        .filter(SiteReview.is_public == True)  # noqa: E712
        .one()
    )
    review_count = int(stats[0] or 0)
    average_rating = round(float(stats[1] or 0), 1) if review_count else 0
    best_review = (
        db.query(SiteReview)
        .filter(SiteReview.is_public == True)  # noqa: E712
        .filter(SiteReview.rating >= 4)
        .order_by(desc(SiteReview.rating), desc(SiteReview.created_at))
        .first()
    )
    return SiteReviewSummaryOut(
        total_users=total_users,
        new_users_this_month=new_users_this_month,
        average_rating=average_rating,
        review_count=review_count,
        best_positive_comment=best_review.comment if best_review else None,
        best_reviewer_name=display_user_name(best_review.user) if best_review else None,
        best_rating=int(best_review.rating) if best_review else None,
    )


@router.post("", response_model=SiteReviewOut, status_code=status.HTTP_201_CREATED)
def create_review(payload: SiteReviewCreateIn, db: Session = Depends(get_db), user: User = Depends(get_current_user)):
    comment = payload.comment.strip()
    if len(comment) < 8:
        raise HTTPException(status_code=400, detail="Please write a short review before submitting.")

    review = current_review_for_user(db, user)
    if review:
        review.rating = payload.rating
        review.comment = comment
        review.is_public = payload.is_public
        review.updated_at = datetime.now(timezone.utc)
    else:
        review = SiteReview(
            user_id=user.id,
            rating=payload.rating,
            comment=comment,
            is_public=payload.is_public,
        )
        db.add(review)
    db.commit()
    db.refresh(review)
    return review_out(review, viewer=user)


@router.put("/{review_id}", response_model=SiteReviewOut)
def update_review(review_id: int, payload: SiteReviewCreateIn, db: Session = Depends(get_db), user: User = Depends(get_current_user)):
    review = db.get(SiteReview, review_id)
    if not review or review.user_id != user.id:
        raise HTTPException(status_code=404, detail="Review not found")
    comment = payload.comment.strip()
    if len(comment) < 8:
        raise HTTPException(status_code=400, detail="Please write a short review before saving.")
    review.rating = payload.rating
    review.comment = comment
    review.is_public = payload.is_public
    review.updated_at = datetime.now(timezone.utc)
    db.commit()
    db.refresh(review)
    return review_out(review, viewer=user)


@router.delete("/{review_id}")
def delete_review(review_id: int, db: Session = Depends(get_db), user: User = Depends(get_current_user)):
    review = db.get(SiteReview, review_id)
    if not review or review.user_id != user.id:
        raise HTTPException(status_code=404, detail="Review not found")
    db.delete(review)
    db.commit()
    return {"ok": True, "message": "Review deleted."}


@router.get("/admin/all", response_model=list[SiteReviewOut])
def admin_reviews(db: Session = Depends(get_db), _admin: User = Depends(require_admin)):
    reviews = db.query(SiteReview).order_by(desc(SiteReview.created_at)).limit(100).all()
    return [review_out(review) for review in reviews]


@router.delete("/admin/{review_id}")
def admin_delete_review(review_id: int, db: Session = Depends(get_db), _admin: User = Depends(require_admin)):
    review = db.get(SiteReview, review_id)
    if not review:
        raise HTTPException(status_code=404, detail="Review not found")
    db.delete(review)
    db.commit()
    return {"ok": True, "message": "Review removed by admin."}
