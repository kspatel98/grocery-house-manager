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
