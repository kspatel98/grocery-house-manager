from __future__ import annotations

from datetime import date
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import func
from sqlalchemy.orm import Session, joinedload

from app.api.activity_utils import display_name, log_activity
from app.api.deps import get_current_user, require_house_member
from app.db.session import get_db
from app.models import ExpenseCategory, ExpenseSettlement, ExpenseShare, HouseExpense, HouseMember, Receipt, User
from app.schemas import (
    ExpenseBalanceOut,
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


def _settlement_out(row: ExpenseSettlement) -> ExpenseSettlementOut:
    return ExpenseSettlementOut(
        id=row.id,
        from_user_id=row.from_user_id,
        from_user_name=_name(row.from_user),
        to_user_id=row.to_user_id,
        to_user_name=_name(row.to_user),
        amount=round(float(row.amount or 0), 2),
        currency=row.currency or "CAD",
        notes=row.notes,
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
    balances = {uid: 0.0 for uid in user_by_id}
    for expense in expenses:
        balances.setdefault(expense.paid_by_user_id, 0.0)
        balances[expense.paid_by_user_id] += float(expense.amount or 0)
        for share in expense.shares:
            balances.setdefault(share.user_id, 0.0)
            balances[share.user_id] -= float(share.share_amount or 0)
    for row in settlements:
        # A payment from debtor -> creditor moves both users toward zero.
        balances.setdefault(row.from_user_id, 0.0)
        balances.setdefault(row.to_user_id, 0.0)
        balances[row.from_user_id] += float(row.amount or 0)
        balances[row.to_user_id] -= float(row.amount or 0)

    rounded = {uid: round(value, 2) for uid, value in balances.items()}
    debtors = [[uid, -value] for uid, value in rounded.items() if value < -0.009]
    creditors = [[uid, value] for uid, value in rounded.items() if value > 0.009]
    suggestions = []
    di = ci = 0
    while di < len(debtors) and ci < len(creditors):
        debtor_id, debt = debtors[di]
        creditor_id, credit = creditors[ci]
        amount = round(min(debt, credit), 2)
        if amount > 0:
            suggestions.append(ExpenseSuggestedPaymentOut(
                from_user_id=int(debtor_id), from_user_name=_name(user_by_id.get(int(debtor_id))),
                to_user_id=int(creditor_id), to_user_name=_name(user_by_id.get(int(creditor_id))), amount=amount,
            ))
        debtors[di][1] = round(debt - amount, 2)
        creditors[ci][1] = round(credit - amount, 2)
        if debtors[di][1] <= 0.009: di += 1
        if creditors[ci][1] <= 0.009: ci += 1

    return ExpenseSummaryOut(
        expenses=[_expense_out(x) for x in expenses],
        settlements=[_settlement_out(x) for x in settlements],
        balances=[ExpenseBalanceOut(user_id=uid, user_name=_name(user_by_id.get(uid)), balance=value) for uid, value in rounded.items()],
        suggested_payments=suggestions,
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
    if abs(sum(float(s.share_amount) for s in shares) - float(payload.amount)) > 0.02:
        raise HTTPException(status_code=400, detail="Split amounts must add up to the total expense.")
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


def _record_reimbursement(house_id: int, payload: ExpenseSettlementIn, db: Session, user: User) -> ExpenseSummaryOut:
    require_house_member(house_id, user, db)
    member_ids = {m.user_id for m in _members(db, house_id)}
    if payload.from_user_id == payload.to_user_id or payload.from_user_id not in member_ids or payload.to_user_id not in member_ids:
        raise HTTPException(status_code=400, detail="Choose two different house members.")
    row = ExpenseSettlement(house_id=house_id, from_user_id=payload.from_user_id, to_user_id=payload.to_user_id, amount=float(payload.amount), currency=payload.currency.upper(), notes=payload.notes, created_by_user_id=user.id)
    db.add(row)
    log_activity(db, house_id=house_id, user=user, action="expense_reimbursed", message=f"{display_name(user)} recorded a reimbursement of ${row.amount:.2f}.", entity_type="expense_settlement")
    db.commit()
    return _summary(db, house_id)


@router.post("/reimbursements", response_model=ExpenseSummaryOut)
def add_reimbursement(house_id: int, payload: ExpenseSettlementIn, db: Session = Depends(get_db), user: User = Depends(get_current_user)):
    return _record_reimbursement(house_id, payload, db, user)


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
