import random

from app.services.expense_math import allocate_equal_split_cents, settlement_plan_is_valid, suggest_transfer_cents


def test_four_member_example_from_v83_bug_report():
    # Kartik +58.75, Devil +8.75, Nainesh -16.25, Jay -51.25
    balances = {1: 5875, 2: -1625, 3: 875, 4: -5125}
    transfers = suggest_transfer_cents(balances)
    assert sum(x[2] for x in transfers if x[0] == 4) == 5125
    assert sum(x[2] for x in transfers if x[0] == 2) == 1625
    assert sum(x[2] for x in transfers if x[1] == 1) == 5875
    assert sum(x[2] for x in transfers if x[1] == 3) == 875
    assert sum(x[2] for x in transfers) == 6750
    assert settlement_plan_is_valid(balances, transfers)


def test_plan_never_loses_a_cent():
    balances = {1: 1001, 2: 999, 3: -667, 4: -666, 5: -667}
    transfers = suggest_transfer_cents(balances)
    assert sum(x[2] for x in transfers) == 2000
    assert settlement_plan_is_valid(balances, transfers)


def test_invalid_nonzero_ledger_produces_no_suggestion():
    balances = {1: 100, 2: -99}
    assert suggest_transfer_cents(balances) == []
    assert not settlement_plan_is_valid(balances, [])


def test_equal_split_is_exact_and_deterministic():
    assert allocate_equal_split_cents(1000, [4, 2, 3]) == [(2, 334), (3, 333), (4, 333)]
    assert sum(value for _, value in allocate_equal_split_cents(1, [9, 2, 7])) == 1
    assert allocate_equal_split_cents(100, []) == []


def test_random_zero_sum_ledgers_always_settle_exactly():
    rng = random.Random(832026)
    for _ in range(500):
        count = rng.randint(2, 12)
        values = [rng.randint(-250_000, 250_000) for _ in range(count - 1)]
        values.append(-sum(values))
        balances = {index + 1: value for index, value in enumerate(values)}
        transfers = suggest_transfer_cents(balances)
        assert settlement_plan_is_valid(balances, transfers)
        assert all(amount > 0 and debtor != creditor for debtor, creditor, amount in transfers)


def test_random_equal_splits_never_lose_or_create_money():
    rng = random.Random(113)
    for _ in range(500):
        total = rng.randint(1, 2_000_000)
        users = list(range(1, rng.randint(2, 20)))
        shares = allocate_equal_split_cents(total, users)
        assert sum(value for _, value in shares) == total
        values = [value for _, value in shares]
        assert max(values) - min(values) <= 1
