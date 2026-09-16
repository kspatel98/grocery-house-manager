from app.services.expense_math import suggest_transfer_cents


def test_four_member_example_from_v83_bug_report():
    # Kartik +58.75, Devil +8.75, Nainesh -16.25, Jay -51.25
    balances = {1: 5875, 2: -1625, 3: 875, 4: -5125}
    transfers = suggest_transfer_cents(balances)
    assert sum(x[2] for x in transfers if x[0] == 4) == 5125
    assert sum(x[2] for x in transfers if x[0] == 2) == 1625
    assert sum(x[2] for x in transfers if x[1] == 1) == 5875
    assert sum(x[2] for x in transfers if x[1] == 3) == 875
    assert sum(x[2] for x in transfers) == 6750


def test_plan_never_loses_a_cent():
    balances = {1: 1001, 2: 999, 3: -667, 4: -666, 5: -667}
    transfers = suggest_transfer_cents(balances)
    assert sum(x[2] for x in transfers) == 2000


def test_invalid_nonzero_ledger_produces_no_suggestion():
    assert suggest_transfer_cents({1: 100, 2: -99}) == []
