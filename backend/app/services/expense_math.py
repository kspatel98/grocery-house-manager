from __future__ import annotations


def suggest_transfer_cents(plan_balances: dict[int, int]) -> list[tuple[int, int, int]]:
    """Return a deterministic zero-sum settlement plan in integer cents.

    Positive balance = should receive. Negative balance = owes.
    No transfer is returned if the ledger itself is not zero-sum.
    """
    if sum(plan_balances.values()) != 0:
        return []
    debtors = [[uid, -value] for uid, value in plan_balances.items() if value < 0]
    creditors = [[uid, value] for uid, value in plan_balances.items() if value > 0]
    # Smaller debts first keeps small debtors to one payment whenever possible,
    # while the largest creditor is settled first. This is easier for households
    # to follow than arbitrarily splitting a small debt across recipients.
    debtors.sort(key=lambda x: (x[1], x[0]))
    creditors.sort(key=lambda x: (-x[1], x[0]))
    out: list[tuple[int, int, int]] = []
    di = ci = 0
    while di < len(debtors) and ci < len(creditors):
        debtor_id, debt = debtors[di]
        creditor_id, credit = creditors[ci]
        amount = min(debt, credit)
        if amount > 0:
            out.append((int(debtor_id), int(creditor_id), int(amount)))
        debtors[di][1] -= amount
        creditors[ci][1] -= amount
        if debtors[di][1] == 0:
            di += 1
        if creditors[ci][1] == 0:
            ci += 1
    return out


def allocate_equal_split_cents(total_cents: int, user_ids: list[int] | set[int]) -> list[tuple[int, int]]:
    """Split integer cents deterministically with no rounding loss.

    Remainder cents are assigned by ascending user id so the same expense always
    produces the same shares on every client/server run.
    """
    ordered = sorted({int(uid) for uid in user_ids})
    if total_cents < 0:
        raise ValueError("total_cents cannot be negative")
    if not ordered:
        return []
    base, remainder = divmod(int(total_cents), len(ordered))
    return [(uid, base + (1 if index < remainder else 0)) for index, uid in enumerate(ordered)]


def settlement_plan_is_valid(plan_balances: dict[int, int], transfers: list[tuple[int, int, int]]) -> bool:
    """Verify a proposed reimbursement plan settles a zero-sum ledger exactly."""
    if sum(plan_balances.values()) != 0:
        return False
    remaining = {int(uid): int(value) for uid, value in plan_balances.items()}
    for from_uid, to_uid, amount in transfers:
        if amount <= 0 or from_uid == to_uid:
            return False
        if from_uid not in remaining or to_uid not in remaining:
            return False
        # Debtor sends money: their negative balance moves toward zero.
        remaining[from_uid] += amount
        # Creditor receives money: their positive balance moves toward zero.
        remaining[to_uid] -= amount
    return all(value == 0 for value in remaining.values())
