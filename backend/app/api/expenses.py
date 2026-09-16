from __future__ import annotations

from datetime import date, datetime, timezone
from decimal import Decimal, ROUND_HALF_UP
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import func
from sqlalchemy.orm import Session, joinedload

from app.api.activity_utils import display_name, log_activity
from app.api.deps import get_current_user, require_house_member
from app.db.session import get_db
from app.models import ExpenseCategory, ExpenseSettlement, ExpenseShare, HouseExpense, HouseMember, Receipt, User
from app.services.expense_math import suggest_transfer_cents
from app.schemas import (
    ExpenseBalanceOut,
    ExpenseBalanceBreakdownOut,
    ExpenseCategoryIn,
    ExpenseCategoryOut,
    ExpenseCreateIn,
    ExpenseOut,
    ExpenseSettlementIn,
    ExpenseSettlementOut,
    ExpenseShareOut,
    ExpenseSuggestedPaymentOut,
    ExpenseSummaryOut,
)

router = APIRouter(prefix="/houses/{house_id}/expenses", tags=["expenses"])


def _members(db: Session, house_id: int):
    return (
        db.query(HouseMember)
        .options(joinedload(HouseMember.user))
        .filter(HouseMember.house_id == house_id)
        .all()
    )


def _name(user: User | None) -> str:
    return display_name(user) if user else "House member"


def _expense_out(expense: HouseExpense) -> ExpenseOut:
    return ExpenseOut(
        id=expense.id,
        house_id=expense.house_id,
        title=expense.title,
        amount=round(float(expense.amount or 0), 2),
        currency=expense.currency or "CAD",
        category=expense.category or "Groceries",
        paid_by_user_id=expense.paid_by_user_id,
        paid_by_name=_name(expense.paid_by),
        expense_date=expense.expense_date,
        notes=expense.notes,
        receipt_id=expense.receipt_id,
        created_at=expense.created_at,
        shares=[ExpenseShareOut(user_id=s.user_id, user_name=_name(s.user), share_amount=round(float(s.share_amount or 0), 2)) for s in expense.shares],
    )


def _cents(value: float | int | Decimal | None) -> int:
    """Convert stored money to integer cents deterministically.

    Expenses were historically stored as floats. Converting through Decimal(str(...))
    prevents binary floating-point drift from changing household balances.
    """
    amount = Decimal(str(value or 0)).quantize(Decimal("0.01"), rounding=ROUND_HALF_UP)
    return int(amount * 100)


def _dollars(value_cents: int) -> float:
    return float(Decimal(value_cents) / Decimal(100))


def _settlement_status(row: ExpenseSettlement) -> str:
    return (getattr(row, "status", None) or "confirmed").lower()


def _settlement_out(row: ExpenseSettlement) -> ExpenseSettlementOut:
    return ExpenseSettlementOut(
        id=row.id,
        from_user_id=row.from_user_id,
        from_user_name=_name(row.from_user),
        to_user_id=row.to_user_id,
        to_user_name=_name(row.to_user),
        amount=_dollars(_cents(row.amount)),
        currency=row.currency or "CAD",
        notes=row.notes,
        status=_settlement_status(row),
        confirmed_at=getattr(row, "confirmed_at", None),
        cancelled_at=getattr(row, "cancelled_at", None),
        created_at=row.created_at,
    )


def _summary(db: Session, house_id: int) -> ExpenseSummaryOut:
    members = _members(db, house_id)
    user_by_id = {m.user_id: m.user for m in members}
    expenses = (
        db.query(HouseExpense)
        .options(joinedload(HouseExpense.shares).joinedload(ExpenseShare.user), joinedload(HouseExpense.paid_by))
        .filter(HouseExpense.house_id == house_id)
        .order_by(HouseExpense.expense_date.desc(), HouseExpense.id.desc())
        .all()
    )
    settlements = (
        db.query(ExpenseSettlement)
        .options(joinedload(ExpenseSettlement.from_user), joinedload(ExpenseSettlement.to_user))
        .filter(ExpenseSettlement.house_id == house_id)
        .order_by(ExpenseSettlement.created_at.desc())
        .all()
    )

    # Every calculation below is performed in integer cents.
    # Positive balance = this member should receive money.
    # Negative balance = this member owes money.
    ledger = {uid: {
        "paid": 0, "share": 0, "sent": 0, "received": 0,
        "pending_sent": 0, "pending_received": 0,
    } for uid in user_by_id}

    source_data_valid = True
    for expense in expenses:
        ledger.setdefault(expense.paid_by_user_id, {"paid": 0, "share": 0, "sent": 0, "received": 0, "pending_sent": 0, "pending_received": 0})
        expense_cents = _cents(expense.amount)
        ledger[expense.paid_by_user_id]["paid"] += expense_cents

        # Canonicalize legacy float splits to cents. Older builds sometimes stored
        # repeating decimals (for example 10 / 3), which can be one cent short
        # after rounding each person's share. Fix only tiny rounding drift; flag
        # larger inconsistencies rather than hiding bad data.
        normalized_shares = [[share.user_id, _cents(share.share_amount)] for share in expense.shares]
        split_delta = expense_cents - sum(value for _, value in normalized_shares)
        if split_delta and normalized_shares:
            if abs(split_delta) <= max(2, len(normalized_shares)):
                target = next((i for i, (uid, _) in enumerate(normalized_shares) if uid == expense.paid_by_user_id), 0)
                normalized_shares[target][1] += split_delta
            else:
                source_data_valid = False
        elif split_delta:
            source_data_valid = False

        for uid, share_cents in normalized_shares:
            ledger.setdefault(uid, {"paid": 0, "share": 0, "sent": 0, "received": 0, "pending_sent": 0, "pending_received": 0})
            ledger[uid]["share"] += share_cents

    for row in settlements:
        status = _settlement_status(row)
        if status == "cancelled":
            continue
        ledger.setdefault(row.from_user_id, {"paid": 0, "share": 0, "sent": 0, "received": 0, "pending_sent": 0, "pending_received": 0})
        ledger.setdefault(row.to_user_id, {"paid": 0, "share": 0, "sent": 0, "received": 0, "pending_sent": 0, "pending_received": 0})
        amount = _cents(row.amount)
        if status == "pending":
            ledger[row.from_user_id]["pending_sent"] += amount
            ledger[row.to_user_id]["pending_received"] += amount
        else:
            # A confirmed debtor -> creditor reimbursement moves both balances toward zero.
            ledger[row.from_user_id]["sent"] += amount
            ledger[row.to_user_id]["received"] += amount

    actual_balances: dict[int, int] = {}
    plan_balances: dict[int, int] = {}
    for uid, item in ledger.items():
        actual = item["paid"] - item["share"] + item["sent"] - item["received"]
        actual_balances[uid] = actual
        # Pending transfers should not change the displayed/accounting balance yet,
        # but they must reduce new suggestions so nobody is told to pay twice.
        plan_balances[uid] = actual + item["pending_sent"] - item["pending_received"]

    balance_is_valid = source_data_valid and sum(actual_balances.values()) == 0

    # Suggestions use the pending-adjusted plan balances, not the raw actual balances.
    suggestions: list[ExpenseSuggestedPaymentOut] = []
    for debtor_id, creditor_id, amount in suggest_transfer_cents(plan_balances):
        suggestions.append(ExpenseSuggestedPaymentOut(
            from_user_id=debtor_id,
            from_user_name=_name(user_by_id.get(debtor_id)),
            to_user_id=creditor_id,
            to_user_name=_name(user_by_id.get(creditor_id)),
            amount=_dollars(amount),
        ))

    breakdown = []
    for uid in sorted(ledger):
        item = ledger[uid]
        breakdown.append(ExpenseBalanceBreakdownOut(
            user_id=uid,
            user_name=_name(user_by_id.get(uid)),
            paid=_dollars(item["paid"]),
            share=_dollars(item["share"]),
            reimbursements_sent=_dollars(item["sent"]),
            reimbursements_received=_dollars(item["received"]),
            pending_sent=_dollars(item["pending_sent"]),
            pending_received=_dollars(item["pending_received"]),
            balance=_dollars(actual_balances[uid]),
        ))

    return ExpenseSummaryOut(
        expenses=[_expense_out(x) for x in expenses],
        settlements=[_settlement_out(x) for x in settlements],
        balances=[ExpenseBalanceOut(user_id=uid, user_name=_name(user_by_id.get(uid)), balance=_dollars(value)) for uid, value in sorted(actual_balances.items())],
        balance_breakdown=breakdown,
        suggested_payments=suggestions,
        balance_is_valid=balance_is_valid,
    )


@router.get("", response_model=ExpenseSummaryOut)
def list_expenses(house_id: int, db: Session = Depends(get_db), user: User = Depends(get_current_user)):
    require_house_member(house_id, user, db)
    return _summary(db, house_id)


@router.post("", response_model=ExpenseSummaryOut)
def create_expense(house_id: int, payload: ExpenseCreateIn, db: Session = Depends(get_db), user: User = Depends(get_current_user)):
    require_house_member(house_id, user, db)
    members = _members(db, house_id)
    member_ids = {m.user_id for m in members}
    if payload.paid_by_user_id not in member_ids:
        raise HTTPException(status_code=400, detail="Payer must be a member of this house.")
    if payload.receipt_id is not None:
        receipt = db.query(Receipt).filter(Receipt.id == payload.receipt_id, Receipt.house_id == house_id).first()
        if not receipt:
            raise HTTPException(status_code=400, detail="Receipt does not belong to this house.")
        existing_receipt_expense = db.query(HouseExpense).filter(
            HouseExpense.house_id == house_id, HouseExpense.receipt_id == payload.receipt_id
        ).first()
        if existing_receipt_expense:
            raise HTTPException(status_code=409, detail="This receipt is already linked to a shared expense.")
    shares = payload.shares
    if not shares:
        each = round(float(payload.amount) / max(len(member_ids), 1), 2)
        shares = []
        ordered = sorted(member_ids)
        remaining = round(float(payload.amount), 2)
        from app.schemas import ExpenseShareIn
        for i, uid in enumerate(ordered):
            amount = remaining if i == len(ordered) - 1 else each
            shares.append(ExpenseShareIn(user_id=uid, share_amount=amount))
            remaining = round(remaining - amount, 2)
    if any(s.user_id not in member_ids for s in shares):
        raise HTTPException(status_code=400, detail="Every split participant must be a house member.")
    if len({s.user_id for s in shares}) != len(shares):
        raise HTTPException(status_code=400, detail="A member can appear only once in a split.")
    if sum(_cents(s.share_amount) for s in shares) != _cents(payload.amount):
        raise HTTPException(status_code=400, detail="Split amounts must add up exactly to the total expense.")
    row = HouseExpense(
        house_id=house_id, title=payload.title.strip(), amount=float(payload.amount), currency=payload.currency.upper(),
        category=payload.category.strip() or "Groceries", paid_by_user_id=payload.paid_by_user_id,
        created_by_user_id=user.id, receipt_id=payload.receipt_id, expense_date=payload.expense_date or date.today(), notes=payload.notes,
    )
    db.add(row); db.flush()
    for share in shares:
        db.add(ExpenseShare(expense_id=row.id, user_id=share.user_id, share_amount=float(share.share_amount)))
    log_activity(db, house_id=house_id, user=user, action="expense_added", message=f"{display_name(user)} added shared expense: {row.title} (${row.amount:.2f}).", entity_type="expense", entity_id=row.id)
    db.commit()
    return _summary(db, house_id)


@router.put("/{expense_id}", response_model=ExpenseSummaryOut)
def update_expense(house_id: int, expense_id: int, payload: ExpenseCreateIn, db: Session = Depends(get_db), user: User = Depends(get_current_user)):
    require_house_member(house_id, user, db)
    row = (
        db.query(HouseExpense)
        .options(joinedload(HouseExpense.shares))
        .filter(HouseExpense.id == expense_id, HouseExpense.house_id == house_id)
        .first()
    )
    if not row:
        raise HTTPException(status_code=404, detail="Expense not found.")

    members = _members(db, house_id)
    member_ids = {m.user_id for m in members}
    if payload.paid_by_user_id not in member_ids:
        raise HTTPException(status_code=400, detail="Payer must be a member of this house.")

    if payload.receipt_id is not None:
        receipt = db.query(Receipt).filter(Receipt.id == payload.receipt_id, Receipt.house_id == house_id).first()
        if not receipt:
            raise HTTPException(status_code=400, detail="Receipt does not belong to this house.")
        existing_receipt_expense = db.query(HouseExpense).filter(
            HouseExpense.house_id == house_id,
            HouseExpense.receipt_id == payload.receipt_id,
            HouseExpense.id != expense_id,
        ).first()
        if existing_receipt_expense:
            raise HTTPException(status_code=409, detail="This receipt is already linked to another shared expense.")

    shares = payload.shares
    if not shares:
        ordered = sorted(member_ids)
        if not ordered:
            raise HTTPException(status_code=400, detail="This house has no members.")
        total_cents = _cents(payload.amount)
        base, remainder = divmod(total_cents, len(ordered))
        from app.schemas import ExpenseShareIn
        shares = [ExpenseShareIn(user_id=uid, share_amount=_dollars(base + (1 if i < remainder else 0))) for i, uid in enumerate(ordered)]

    if any(s.user_id not in member_ids for s in shares):
        raise HTTPException(status_code=400, detail="Every split participant must be a house member.")
    if len({s.user_id for s in shares}) != len(shares):
        raise HTTPException(status_code=400, detail="A member can appear only once in a split.")
    if sum(_cents(s.share_amount) for s in shares) != _cents(payload.amount):
        raise HTTPException(status_code=400, detail="Split amounts must add up exactly to the total expense.")

    row.title = payload.title.strip()
    row.amount = float(payload.amount)
    row.currency = payload.currency.upper()
    row.category = payload.category.strip() or "Groceries"
    row.paid_by_user_id = payload.paid_by_user_id
    row.expense_date = payload.expense_date or date.today()
    row.notes = payload.notes
    row.receipt_id = payload.receipt_id

    for old_share in list(row.shares):
        db.delete(old_share)
    db.flush()
    for share in shares:
        db.add(ExpenseShare(expense_id=row.id, user_id=share.user_id, share_amount=float(share.share_amount)))

    log_activity(
        db, house_id=house_id, user=user, action="expense_updated",
        message=f"{display_name(user)} updated shared expense: {row.title} (${row.amount:.2f}).",
        entity_type="expense", entity_id=row.id,
    )
    db.commit()
    return _summary(db, house_id)


@router.get("/categories", response_model=list[ExpenseCategoryOut])
def list_expense_categories(house_id: int, db: Session = Depends(get_db), user: User = Depends(get_current_user)):
    require_house_member(house_id, user, db)
    return (
        db.query(ExpenseCategory)
        .filter(ExpenseCategory.house_id == house_id)
        .order_by(ExpenseCategory.name.asc())
        .all()
    )


@router.post("/categories", response_model=ExpenseCategoryOut)
def create_expense_category(house_id: int, payload: ExpenseCategoryIn, db: Session = Depends(get_db), user: User = Depends(get_current_user)):
    require_house_member(house_id, user, db)
    name = " ".join(payload.name.strip().split())[:80]
    if not name:
        raise HTTPException(status_code=400, detail="Enter a category name.")
    existing = db.query(ExpenseCategory).filter(
        ExpenseCategory.house_id == house_id,
        func.lower(ExpenseCategory.name) == name.lower(),
    ).first()
    if existing:
        return existing
    row = ExpenseCategory(
        house_id=house_id, name=name, icon=(payload.icon.strip() or "✨")[:16], created_by_user_id=user.id
    )
    db.add(row)
    db.commit()
    db.refresh(row)
    return row


def _current_suggestion(summary: ExpenseSummaryOut, from_user_id: int, to_user_id: int) -> ExpenseSuggestedPaymentOut | None:
    return next((x for x in summary.suggested_payments if x.from_user_id == from_user_id and x.to_user_id == to_user_id), None)


def _record_reimbursement(house_id: int, payload: ExpenseSettlementIn, db: Session, user: User) -> ExpenseSummaryOut:
    require_house_member(house_id, user, db)
    member_ids = {m.user_id for m in _members(db, house_id)}
    if payload.from_user_id == payload.to_user_id or payload.from_user_id not in member_ids or payload.to_user_id not in member_ids:
        raise HTTPException(status_code=400, detail="Choose two different house members.")
    if user.id != payload.from_user_id:
        raise HTTPException(status_code=403, detail="Only the person who owes can mark a reimbursement as sent.")

    before = _summary(db, house_id)
    suggestion = _current_suggestion(before, payload.from_user_id, payload.to_user_id)
    if not suggestion:
        raise HTTPException(status_code=409, detail="This reimbursement is no longer needed. Refresh the expense balances.")
    amount_cents = _cents(payload.amount)
    if amount_cents <= 0 or amount_cents > _cents(suggestion.amount):
        raise HTTPException(status_code=400, detail=f"Amount cannot exceed the current suggested reimbursement of ${suggestion.amount:.2f}.")

    row = ExpenseSettlement(
        house_id=house_id, from_user_id=payload.from_user_id, to_user_id=payload.to_user_id,
        amount=_dollars(amount_cents), currency=payload.currency.upper(), notes=payload.notes,
        status="pending", created_by_user_id=user.id,
    )
    db.add(row)
    log_activity(db, house_id=house_id, user=user, action="expense_reimbursement_sent", message=f"{display_name(user)} marked ${row.amount:.2f} as sent for reimbursement.", entity_type="expense_settlement")
    db.commit()
    return _summary(db, house_id)


@router.post("/reimbursements", response_model=ExpenseSummaryOut)
def add_reimbursement(house_id: int, payload: ExpenseSettlementIn, db: Session = Depends(get_db), user: User = Depends(get_current_user)):
    return _record_reimbursement(house_id, payload, db, user)


@router.post("/reimbursements/{settlement_id}/confirm", response_model=ExpenseSummaryOut)
def confirm_reimbursement(house_id: int, settlement_id: int, db: Session = Depends(get_db), user: User = Depends(get_current_user)):
    require_house_member(house_id, user, db)
    row = db.query(ExpenseSettlement).filter(ExpenseSettlement.id == settlement_id, ExpenseSettlement.house_id == house_id).first()
    if not row:
        raise HTTPException(status_code=404, detail="Reimbursement not found.")
    if _settlement_status(row) != "pending":
        raise HTTPException(status_code=409, detail="Only a pending reimbursement can be confirmed.")
    if user.id != row.to_user_id:
        raise HTTPException(status_code=403, detail="Only the person receiving the reimbursement can confirm it.")
    row.status = "confirmed"
    row.confirmed_by_user_id = user.id
    row.confirmed_at = datetime.now(timezone.utc)
    log_activity(db, house_id=house_id, user=user, action="expense_reimbursement_confirmed", message=f"{display_name(user)} confirmed a reimbursement of ${row.amount:.2f}.", entity_type="expense_settlement", entity_id=row.id)
    db.commit()
    return _summary(db, house_id)


@router.post("/reimbursements/{settlement_id}/cancel", response_model=ExpenseSummaryOut)
def cancel_reimbursement(house_id: int, settlement_id: int, db: Session = Depends(get_db), user: User = Depends(get_current_user)):
    membership = require_house_member(house_id, user, db)
    row = db.query(ExpenseSettlement).filter(ExpenseSettlement.id == settlement_id, ExpenseSettlement.house_id == house_id).first()
    if not row:
        raise HTTPException(status_code=404, detail="Reimbursement not found.")
    role = getattr(membership.role, "value", membership.role)
    if user.id not in {row.from_user_id, row.to_user_id} and role not in {"owner", "admin"}:
        raise HTTPException(status_code=403, detail="Only the people involved or a house owner/admin can correct this reimbursement.")
    if _settlement_status(row) == "cancelled":
        return _summary(db, house_id)
    row.status = "cancelled"
    row.cancelled_at = datetime.now(timezone.utc)
    log_activity(db, house_id=house_id, user=user, action="expense_reimbursement_cancelled", message=f"{display_name(user)} cancelled a reimbursement record of ${row.amount:.2f}.", entity_type="expense_settlement", entity_id=row.id)
    db.commit()
    return _summary(db, house_id)


# Backward-compatible endpoint used by older clients. It now follows the safer
# sent -> received confirmation workflow instead of changing balances immediately.
@router.post("/settlements", response_model=ExpenseSummaryOut)
def add_settlement(house_id: int, payload: ExpenseSettlementIn, db: Session = Depends(get_db), user: User = Depends(get_current_user)):
    return _record_reimbursement(house_id, payload, db, user)


@router.delete("/{expense_id}", response_model=ExpenseSummaryOut)
def delete_expense(house_id: int, expense_id: int, db: Session = Depends(get_db), user: User = Depends(get_current_user)):
    require_house_member(house_id, user, db)
    row = db.query(HouseExpense).filter(HouseExpense.id == expense_id, HouseExpense.house_id == house_id).first()
    if not row:
        raise HTTPException(status_code=404, detail="Expense not found.")
    db.delete(row); db.commit()
    return _summary(db, house_id)
