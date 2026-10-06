from datetime import datetime, timezone
import os

os.environ.setdefault("DATABASE_URL", "sqlite:///./premium-try-test.db")
os.environ.setdefault("SECRET_KEY", "test-secret-key")

from app.api.plan_utils import PREMIUM_TRY_FEATURES, premium_try_status
from app.models import PlanName, User


def make_user(plan: PlanName = PlanName.free) -> User:
    return User(
        email="trial@example.com",
        full_name="Trial User",
        password_hash=None,
        plan_name=plan,
        subscription_status="free" if plan == PlanName.free else "active",
    )


def test_free_user_can_choose_one_premium_try():
    user = make_user()
    status = premium_try_status(user)
    assert status["eligible"] is True
    assert status["available"] is True
    assert status["selected_feature"] is None
    assert len(status["choices"]) == len(PREMIUM_TRY_FEATURES)


def test_selected_try_remains_available_until_success():
    user = make_user()
    user.premium_try_feature = "whole_list_compare"
    status = premium_try_status(user)
    assert status["available"] is True
    assert status["selected_feature"] == "whole_list_compare"
    assert status["selected_label"] == "Whole-List Comparison"


def test_used_try_cannot_be_reused():
    user = make_user()
    user.premium_try_feature = "smart_receipt_scan"
    user.premium_try_used_at = datetime.now(timezone.utc)
    status = premium_try_status(user)
    assert status["eligible"] is False
    assert status["available"] is False
    assert status["used_at"] is not None


def test_paid_user_does_not_need_free_try():
    user = make_user(PlanName.family)
    status = premium_try_status(user)
    assert status["eligible"] is False
    assert status["available"] is False
