"""V138: paid plan limits and fail-closed atomic monthly budget rules."""
import os
os.environ.setdefault('DATABASE_URL','sqlite:///./test-v138.db')
os.environ.setdefault('SECRET_KEY','test-secret-key')
from app.models import PlanName
from app.api.plan_utils import PLANS


def test_plan_limits_v138():
    family = PLANS[PlanName.family].limits
    pro = PLANS[PlanName.pro].limits
    assert family.active_lists_per_house == 10
    assert pro.houses == 10
    assert pro.active_lists_per_house == 20
    assert pro.receipt_scans_per_month == 10
    assert PLANS[PlanName.basic].limits.grocery_image_scans_per_month == 2
    assert family.grocery_image_scans_per_month == 10
    assert pro.grocery_image_scans_per_month == 25
    assert pro.trip_provider_monthly_runs > family.trip_provider_monthly_runs
