from __future__ import annotations

import os
import re
from dataclasses import dataclass
from pathlib import Path


@dataclass(frozen=True)
class FeatureCheck:
    key: str
    label: str
    min_plan: str
    route_method: str
    route_path: str
    provider_note: str


FEATURES: tuple[FeatureCheck, ...] = (
    FeatureCheck("smart_receipt_scan", "Smart Receipt Scan", "Basic Home", "POST", "/houses/{house_id}/receipts/upload", "Receipt OCR provider; JPG/JPEG/PNG supported"),
    FeatureCheck("product_lookup", "Product Lookup", "Basic Home", "GET", "/market/houses/{house_id}/product-lookup", "Universal lookup plus supported store-web search"),
    FeatureCheck("whole_list_compare", "Whole-List Comparison", "Family Plus", "GET", "/insights/houses/{house_id}/shopping-lists/{list_id}/basket-comparison", "Uses saved/current evidence; missing basket prices are not invented"),
    FeatureCheck("live_price_compare", "Live Grocery Price Compare", "Family Plus", "POST", "/market/houses/{house_id}/price-compare", "Live provider requires APIFY_API_TOKEN; saved-price fallback may remain available"),
    FeatureCheck("weekly_flyers", "Weekly Flyer Intelligence", "Family Plus", "GET", "/market/houses/{house_id}/flyers", "Requires APIFY_API_TOKEN and a valid Canadian postal code"),
    FeatureCheck("autopilot_planner", "GHM Autopilot Planner", "Family Plus", "POST", "/insights/houses/{house_id}/household-plan", "Uses household inventory/list/expiry inputs and optional budget"),
    FeatureCheck("smart_stock_up", "Smart Stock-Up", "Family Plus", "GET", "/insights/houses/{house_id}/stock-up", "Useful recommendations require actual household price/purchase history"),
    FeatureCheck("nearby_store_suggestions", "Smart Nearby Stores", "Household Pro", "GET", "/market/houses/{house_id}/shopping-lists/{list_id}/suggestions", "Exact nearby results use GOOGLE_PLACES_API_KEY; safe fallback chains may be shown"),
    FeatureCheck("kitchen_vision", "Kitchen Vision", "Household Pro", "POST", "/ai/houses/{house_id}/kitchen-vision", "Full AI analysis requires a configured AI provider; uncertain changes remain review-first"),
)


def app_root() -> Path:
    return Path(__file__).resolve().parents[1]


def discover_routes() -> set[tuple[str, str]]:
    api_dir = app_root() / "api"
    routes: set[tuple[str, str]] = set()
    prefix_re = re.compile(r"router\s*=\s*APIRouter\(prefix=[\"']([^\"']*)[\"']")
    route_re = re.compile(r"@router\.(get|post|put|patch|delete)\(\s*[\"']([^\"']*)[\"']")
    for path in api_dir.glob("*.py"):
        text = path.read_text(encoding="utf-8")
        prefix_match = prefix_re.search(text)
        prefix = prefix_match.group(1) if prefix_match else ""
        for method, suffix in route_re.findall(text):
            routes.add((method.upper(), prefix + suffix))
    return routes


def premium_metadata_ok(key: str, label: str) -> bool:
    text = (app_root() / "api" / "plan_utils.py").read_text(encoding="utf-8")
    start = text.find(f'"{key}": {{')
    if start < 0:
        return False
    block = text[start:start + 900]
    return f'"upgrade_label": "{label}"' in block


def env_present(name: str) -> bool:
    return bool((os.getenv(name) or "").strip())


def provider_status(key: str) -> str:
    if key == "smart_receipt_scan":
        provider = (os.getenv("RECEIPT_OCR_PROVIDER") or "tabscanner").strip().lower()
        if provider == "tabscanner":
            return "configured" if env_present("TABSCANNER_API_KEY") else "NOT CONFIGURED (TABSCANNER_API_KEY missing)"
        if provider == "veryfi":
            ok = all(env_present(name) for name in ("VERYFI_CLIENT_ID", "VERYFI_USERNAME", "VERYFI_API_KEY"))
            return "configured" if ok else "NOT CONFIGURED (Veryfi credentials missing)"
        return "local provider"
    if key in {"live_price_compare", "weekly_flyers"}:
        return "configured" if env_present("APIFY_API_TOKEN") else "NOT CONFIGURED (APIFY_API_TOKEN missing)"
    if key == "nearby_store_suggestions":
        return "configured" if env_present("GOOGLE_PLACES_API_KEY") else "fallback-only (GOOGLE_PLACES_API_KEY missing)"
    if key == "kitchen_vision":
        enabled = (os.getenv("DIGITALOCEAN_AGENT_ENABLED") or "").lower() in {"1", "true", "yes", "on"}
        ok = enabled and env_present("DIGITALOCEAN_AGENT_URL") and env_present("DIGITALOCEAN_AGENT_ACCESS_KEY")
        return "configured" if ok else "NOT CONFIGURED (DigitalOcean AI agent settings incomplete)"
    return "no external provider required"


def main() -> int:
    routes = discover_routes()
    failures = 0
    print("GHM feature truth audit")
    print("=" * 76)
    for check in FEATURES:
        route_ok = (check.route_method, check.route_path) in routes
        metadata_ok = premium_metadata_ok(check.key, check.min_plan)
        if not route_ok or not metadata_ok:
            failures += 1
        print(f"[{'PASS' if route_ok and metadata_ok else 'FAIL'}] {check.label}")
        print(f"  plan: {check.min_plan} ({'metadata present' if metadata_ok else 'PREMIUM METADATA MISMATCH'})")
        print(f"  route: {check.route_method} {check.route_path} ({'present' if route_ok else 'MISSING'})")
        print(f"  runtime: {provider_status(check.key)}")
        print(f"  truth note: {check.provider_note}")

    print("\nInterpretation")
    print("- PASS = the advertised premium workflow has both registered route code and matching premium metadata.")
    print("- NOT CONFIGURED = feature exists in code but the deployment cannot promise full third-party results until that secret/provider is connected.")
    print("- Run scripts/ghm_full_smoke_test.py for real-account runtime behavior.")
    return 1 if failures else 0


if __name__ == "__main__":
    raise SystemExit(main())
