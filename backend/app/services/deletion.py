"""Robust destructive cleanup helpers for houses and user accounts.

GHM has existed across many additive schema revisions. SQLAlchemy's current models
correctly describe ON DELETE CASCADE / SET NULL behavior, but PostgreSQL constraints
created by older releases are not automatically rewritten by ``create_all`` or the
additive compatibility helper. Relying only on database cascades therefore makes
house/account deletion fragile on long-lived production databases.

These helpers explicitly clean dependent rows in a safe order before deleting the
parent. They intentionally use bulk SQLAlchemy statements so ORM relationship state
cannot try to NULL non-nullable child foreign keys during a destructive operation.
"""
from __future__ import annotations

from sqlalchemy import delete, or_, select, update
from sqlalchemy.orm import Session

from app.models import (
    Activity,
    AdminUserOffer,
    AutopilotDecision,
    CommunityPriceObservation,
    CommunityRecipe,
    ExpenseCategory,
    ExpenseMonthLock,
    ExpenseMonthParticipant,
    ExpenseSettlement,
    ExpenseShare,
    House,
    HouseExpense,
    HouseMember,
    HouseMessageReaction,
    HouseholdTemplate,
    Invite,
    KitchenStorageZone,
    KitchenVisionObservation,
    KitchenVisionScan,
    PasswordHistory,
    PasswordResetCode,
    Product,
    ProductEvent,
    ProductStorePrice,
    Receipt,
    ReceiptLineItem,
    ReceiptScanPurchase,
    RegistrationVerificationCode,
    Section,
    ShoppingList,
    ShoppingListItem,
    SiteReview,
    User,
)


def _ids(db: Session, statement) -> list[int]:
    return [int(value) for value in db.scalars(statement).all()]




def _null_or_delete(db: Session, model, predicate, values: dict) -> None:
    """Prefer anonymizing nullable attribution, fall back to deleting legacy rows.

    Some very old GHM schemas predate the nullable/SET NULL definitions in the
    current models. A savepoint keeps one legacy NOT NULL constraint from
    aborting the entire account-deletion transaction.
    """
    try:
        with db.begin_nested():
            db.execute(update(model).where(predicate).values(**values))
    except Exception:
        db.execute(delete(model).where(predicate))


def purge_house(db: Session, house_id: int) -> None:
    """Delete a house and every row that is scoped to it.

    This is deliberately more explicit than the model relationships. It protects
    production databases that may still contain pre-CASCADE foreign-key constraints.
    The caller owns the surrounding transaction and commit/rollback.
    """

    activity_ids = _ids(db, select(Activity.id).where(Activity.house_id == house_id))
    expense_ids = _ids(db, select(HouseExpense.id).where(HouseExpense.house_id == house_id))
    month_ids = _ids(db, select(ExpenseMonthLock.id).where(ExpenseMonthLock.house_id == house_id))
    list_ids = _ids(db, select(ShoppingList.id).where(ShoppingList.house_id == house_id))
    product_ids = _ids(db, select(Product.id).where(Product.house_id == house_id))

    # Grandchildren first. This makes cleanup independent from historical FK actions.
    if activity_ids:
        db.execute(delete(HouseMessageReaction).where(HouseMessageReaction.activity_id.in_(activity_ids)))
    if expense_ids:
        db.execute(delete(ExpenseShare).where(ExpenseShare.expense_id.in_(expense_ids)))
    if month_ids:
        db.execute(delete(ExpenseMonthParticipant).where(ExpenseMonthParticipant.expense_month_id.in_(month_ids)))
    if list_ids or product_ids:
        predicates = []
        if list_ids:
            predicates.append(ShoppingListItem.shopping_list_id.in_(list_ids))
        if product_ids:
            predicates.append(ShoppingListItem.product_id.in_(product_ids))
        db.execute(delete(ShoppingListItem).where(or_(*predicates)))

    # House-scoped data with cross-links into receipts/products/users.
    db.execute(delete(KitchenVisionObservation).where(KitchenVisionObservation.house_id == house_id))
    db.execute(delete(KitchenVisionScan).where(KitchenVisionScan.house_id == house_id))
    db.execute(delete(KitchenStorageZone).where(KitchenStorageZone.house_id == house_id))

    db.execute(delete(ExpenseShare).where(ExpenseShare.expense_id.in_(
        select(HouseExpense.id).where(HouseExpense.house_id == house_id)
    )))
    db.execute(delete(HouseExpense).where(HouseExpense.house_id == house_id))
    db.execute(delete(ExpenseSettlement).where(ExpenseSettlement.house_id == house_id))
    db.execute(delete(ExpenseMonthParticipant).where(ExpenseMonthParticipant.expense_month_id.in_(
        select(ExpenseMonthLock.id).where(ExpenseMonthLock.house_id == house_id)
    )))
    db.execute(delete(ExpenseMonthLock).where(ExpenseMonthLock.house_id == house_id))
    db.execute(delete(ExpenseCategory).where(ExpenseCategory.house_id == house_id))

    db.execute(delete(ProductStorePrice).where(ProductStorePrice.house_id == house_id))
    db.execute(delete(ReceiptLineItem).where(ReceiptLineItem.house_id == house_id))
    db.execute(delete(Receipt).where(Receipt.house_id == house_id))

    if list_ids:
        db.execute(delete(ShoppingList).where(ShoppingList.id.in_(list_ids)))
    else:
        db.execute(delete(ShoppingList).where(ShoppingList.house_id == house_id))

    if product_ids:
        db.execute(delete(Product).where(Product.id.in_(product_ids)))
    else:
        db.execute(delete(Product).where(Product.house_id == house_id))
    db.execute(delete(Section).where(Section.house_id == house_id))

    db.execute(delete(CommunityPriceObservation).where(CommunityPriceObservation.source_house_id == house_id))
    db.execute(delete(ProductEvent).where(ProductEvent.house_id == house_id))
    db.execute(delete(AutopilotDecision).where(AutopilotDecision.house_id == house_id))
    db.execute(delete(Activity).where(Activity.house_id == house_id))
    db.execute(delete(Invite).where(Invite.house_id == house_id))
    db.execute(delete(HouseMember).where(HouseMember.house_id == house_id))

    # Use a bulk DELETE so SQLAlchemy does not attempt relationship cascades a second time.
    db.execute(delete(House).where(House.id == house_id))


def purge_user_account(db: Session, user_id: int, owned_solo_house_ids: list[int]) -> None:
    """Delete a user account after shared-house ownership has been validated.

    Solo houses are removed completely. For houses the user merely joined, records
    that can safely remain are anonymized; records that require the user as a
    non-null participant are removed with the account.
    """

    for house_id in owned_solo_house_ids:
        purge_house(db, house_id)

    # Remove direct membership/involvement rows in shared houses.
    db.execute(delete(HouseMember).where(HouseMember.user_id == user_id))
    db.execute(delete(HouseMessageReaction).where(HouseMessageReaction.user_id == user_id))
    db.execute(delete(ExpenseMonthParticipant).where(ExpenseMonthParticipant.user_id == user_id))
    db.execute(delete(ExpenseShare).where(ExpenseShare.user_id == user_id))
    db.execute(delete(ExpenseSettlement).where(or_(
        ExpenseSettlement.from_user_id == user_id,
        ExpenseSettlement.to_user_id == user_id,
    )))

    # paid_by_user_id is intentionally non-null. Account deletion removes expenses
    # paid by that account rather than leaving an invalid payer reference behind.
    paid_expense_ids = _ids(db, select(HouseExpense.id).where(HouseExpense.paid_by_user_id == user_id))
    if paid_expense_ids:
        db.execute(delete(ExpenseShare).where(ExpenseShare.expense_id.in_(paid_expense_ids)))
        db.execute(delete(HouseExpense).where(HouseExpense.id.in_(paid_expense_ids)))

    # Delete account-owned/personal records.
    db.execute(delete(Invite).where(Invite.created_by_id == user_id))
    db.execute(delete(ProductEvent).where(ProductEvent.user_id == user_id))
    db.execute(delete(ReceiptScanPurchase).where(ReceiptScanPurchase.user_id == user_id))
    db.execute(delete(CommunityRecipe).where(CommunityRecipe.user_id == user_id))
    db.execute(delete(HouseholdTemplate).where(HouseholdTemplate.user_id == user_id))
    db.execute(delete(AdminUserOffer).where(AdminUserOffer.user_id == user_id))
    db.execute(delete(PasswordHistory).where(PasswordHistory.user_id == user_id))
    db.execute(delete(PasswordResetCode).where(PasswordResetCode.user_id == user_id))
    db.execute(delete(RegistrationVerificationCode).where(RegistrationVerificationCode.existing_user_id == user_id))

    # Preserve shared-house history where the schema permits a nullable attribution.
    # If an older production table still has a NOT NULL constraint, the helper
    # falls back to deleting only those legacy rows instead of failing the account.
    _null_or_delete(db, Activity, Activity.user_id == user_id, {"user_id": None})
    _null_or_delete(db, Receipt, Receipt.uploaded_by_id == user_id, {"uploaded_by_id": None})
    _null_or_delete(db, ProductStorePrice, ProductStorePrice.recorded_by_id == user_id, {"recorded_by_id": None})
    _null_or_delete(db, ShoppingList, ShoppingList.created_by_id == user_id, {"created_by_id": None})
    _null_or_delete(db, ShoppingList, ShoppingList.completed_by_id == user_id, {"completed_by_id": None})
    _null_or_delete(db, ExpenseCategory, ExpenseCategory.created_by_user_id == user_id, {"created_by_user_id": None})
    _null_or_delete(db, ExpenseMonthLock, ExpenseMonthLock.locked_by_user_id == user_id, {"locked_by_user_id": None})
    _null_or_delete(db, ExpenseMonthParticipant, ExpenseMonthParticipant.added_by_user_id == user_id, {"added_by_user_id": None})
    _null_or_delete(db, HouseExpense, HouseExpense.created_by_user_id == user_id, {"created_by_user_id": None})
    _null_or_delete(db, ExpenseSettlement, ExpenseSettlement.created_by_user_id == user_id, {"created_by_user_id": None})
    _null_or_delete(db, ExpenseSettlement, ExpenseSettlement.confirmed_by_user_id == user_id, {"confirmed_by_user_id": None})
    _null_or_delete(db, KitchenVisionScan, KitchenVisionScan.user_id == user_id, {"user_id": None})
    _null_or_delete(db, AutopilotDecision, AutopilotDecision.user_id == user_id, {"user_id": None})
    _null_or_delete(db, SiteReview, SiteReview.user_id == user_id, {"user_id": None})
    _null_or_delete(db, SiteReview, SiteReview.admin_replied_by_id == user_id, {"admin_replied_by_id": None})
    _null_or_delete(db, AdminUserOffer, AdminUserOffer.created_by_id == user_id, {"created_by_id": None})

    # Any remaining owned house would mean the caller failed the shared-house guard.
    # Do not silently delete another member's home.
    remaining_owned_house = db.scalar(select(House.id).where(House.created_by_id == user_id).limit(1))
    if remaining_owned_house is not None:
        raise ValueError("Account still owns a house; shared-house ownership must be resolved first.")

    db.execute(delete(User).where(User.id == user_id))
