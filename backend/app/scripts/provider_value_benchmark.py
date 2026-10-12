from __future__ import annotations

import argparse
import csv
import json
import re
import statistics
import sys
import time
from dataclasses import asdict, dataclass
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

from app.core.config import settings
from app.utils.external_providers import lookup_upcdatabase, upcdatabase_is_configured
from app.utils.market_data import (
    CANADIAN_STORE_LOOKUP_PROFILES,
    _profile_domains,
    _search_with_serper_api,
    _url_is_official_store_result,
    lookup_open_food_facts,
)


@dataclass(frozen=True)
class ProductCase:
    label: str
    query: str
    required_tokens: tuple[str, ...]
    expected_size: str | None
    store_key: str


@dataclass
class ProviderResult:
    case: str
    query: str
    store: str
    off_found: bool = False
    off_exact: bool = False
    off_best: str | None = None
    upc_found: bool = False
    upc_exact: bool = False
    upc_best: str | None = None
    combined_identity_exact: bool = False
    identity_size_match: bool = False
    serper_official_found: bool = False
    serper_product_match: bool = False
    serper_size_match: bool = False
    serper_price_found: bool = False
    serper_usable_price_evidence: bool = False
    serper_best_title: str | None = None
    serper_best_url: str | None = None
    serper_price: float | None = None
    serper_queries_used: int = 0
    identity_latency_ms: float = 0.0
    serper_latency_ms: float = 0.0
    notes: str = ""


# 48 products: national brands, Canadian brands, private labels, fresh/weighted items,
# different package types, and Costco multipacks. Each product is tested against one
# supported Canadian retailer so every retailer is represented several times.
CASES: tuple[ProductCase, ...] = (
    ProductCase("Coca-Cola Original 2 L", "Coca-Cola Original Taste 2L", ("coca", "cola"), "2l", "walmart"),
    ProductCase("Pepsi 2 L", "Pepsi 2L", ("pepsi",), "2l", "nofrills"),
    ProductCase("Cheerios 570 g", "Cheerios Original 570g", ("cheerios",), "570g", "superstore"),
    ProductCase("Kellogg's Corn Flakes 515 g", "Kellogg Corn Flakes 515g", ("kellogg", "corn", "flakes"), "515g", "walmart"),
    ProductCase("Oreo Original 270 g", "Oreo Original 270g", ("oreo",), "270g", "freshco"),
    ProductCase("Heinz Tomato Ketchup 1 L", "Heinz Tomato Ketchup 1L", ("heinz", "ketchup"), "1l", "metro"),
    ProductCase("Kraft Dinner Original 200 g", "Kraft Dinner Original 200g", ("kraft", "dinner"), "200g", "foodbasics"),
    ProductCase("Nutella 725 g", "Nutella Hazelnut Spread 725g", ("nutella",), "725g", "loblaws"),
    ProductCase("Kraft Peanut Butter 1 kg", "Kraft Smooth Peanut Butter 1kg", ("kraft", "peanut", "butter"), "1kg", "walmart"),
    ProductCase("Quaker Quick Oats 1 kg", "Quaker Quick Oats 1kg", ("quaker", "oats"), "1kg", "nofrills"),
    ProductCase("Wonder White Bread 675 g", "Wonder White Bread 675g", ("wonder", "bread"), "675g", "freshco"),
    ProductCase("Dempster's Whole Grains Bread 600 g", "Dempster's Whole Grains Bread 600g", ("dempster", "bread"), "600g", "superstore"),
    ProductCase("Neilson 2% Milk 4 L", "Neilson 2% Milk 4L", ("neilson", "milk"), "4l", "metro"),
    ProductCase("Natrel 2% Milk 4 L", "Natrel 2% Milk 4L", ("natrel", "milk"), "4l", "walmart"),
    ProductCase("Gay Lea Salted Butter 454 g", "Gay Lea Salted Butter 454g", ("gay", "lea", "butter"), "454g", "foodbasics"),
    ProductCase("Lactantia Salted Butter 454 g", "Lactantia Salted Butter 454g", ("lactantia", "butter"), "454g", "loblaws"),
    ProductCase("Burnbrae Large Eggs 12", "Burnbrae Large Eggs 12", ("burnbrae", "eggs"), None, "walmart"),
    ProductCase("Philadelphia Cream Cheese 227 g", "Philadelphia Original Cream Cheese 227g", ("philadelphia", "cream", "cheese"), "227g", "nofrills"),
    ProductCase("Oikos Greek Yogurt 650 g", "Oikos Greek Yogurt 650g", ("oikos", "yogurt"), "650g", "superstore"),
    ProductCase("Activia Yogurt 650 g", "Activia Yogurt 650g", ("activia", "yogurt"), "650g", "freshco"),
    ProductCase("Silk Unsweetened Almond Beverage 1.89 L", "Silk Unsweetened Almond Beverage 1.89L", ("silk", "almond"), "1.89l", "walmart"),
    ProductCase("Tropicana Orange Juice 2.63 L", "Tropicana Orange Juice 2.63L", ("tropicana", "orange"), "2.63l", "metro"),
    ProductCase("Becel Original Margarine 427 g", "Becel Original Margarine 427g", ("becel",), "427g", "foodbasics"),
    ProductCase("Hellmann's Mayonnaise 890 mL", "Hellmann's Real Mayonnaise 890mL", ("hellmann", "mayonnaise"), "890ml", "loblaws"),
    ProductCase("French's Yellow Mustard 400 mL", "French's Yellow Mustard 400mL", ("french", "mustard"), "400ml", "walmart"),
    ProductCase("Catelli Spaghetti 900 g", "Catelli Spaghetti 900g", ("catelli", "spaghetti"), "900g", "nofrills"),
    ProductCase("Classico Tomato Basil Sauce 650 mL", "Classico Tomato Basil Pasta Sauce 650mL", ("classico", "sauce"), "650ml", "superstore"),
    ProductCase("Robin Hood All Purpose Flour 2.5 kg", "Robin Hood All Purpose Flour 2.5kg", ("robin", "hood", "flour"), "2.5kg", "freshco"),
    ProductCase("Redpath Granulated Sugar 2 kg", "Redpath Granulated Sugar 2kg", ("redpath", "sugar"), "2kg", "metro"),
    ProductCase("Green Giant Corn 341 mL", "Green Giant Corn 341mL", ("green", "giant", "corn"), "341ml", "foodbasics"),
    ProductCase("Campbell's Tomato Soup 284 mL", "Campbell's Tomato Soup 284mL", ("campbell", "tomato", "soup"), "284ml", "loblaws"),
    ProductCase("Clover Leaf Chunk Light Tuna 170 g", "Clover Leaf Chunk Light Tuna 170g", ("clover", "leaf", "tuna"), "170g", "walmart"),
    ProductCase("Maple Leaf Bacon 375 g", "Maple Leaf Bacon 375g", ("maple", "leaf", "bacon"), "375g", "nofrills"),
    ProductCase("Schneiders Hot Dogs 450 g", "Schneiders Hot Dogs 450g", ("schneiders", "hot", "dogs"), "450g", "superstore"),
    ProductCase("Janes Chicken Strips 700 g", "Janes Pub Style Chicken Strips 700g", ("janes", "chicken", "strips"), "700g", "freshco"),
    ProductCase("Cavendish Frozen Fries 750 g", "Cavendish French Fries 750g", ("cavendish", "fries"), "750g", "metro"),
    ProductCase("Chapman's Vanilla Ice Cream 2 L", "Chapman's Vanilla Ice Cream 2L", ("chapman", "vanilla", "ice", "cream"), "2l", "foodbasics"),
    ProductCase("Häagen-Dazs Vanilla 450 mL", "Haagen-Dazs Vanilla Ice Cream 450mL", ("haagen", "dazs", "vanilla"), "450ml", "loblaws"),
    ProductCase("Great Value Peanut Butter 1 kg", "Great Value Smooth Peanut Butter 1kg", ("great", "value", "peanut", "butter"), "1kg", "walmart"),
    ProductCase("President's Choice Decadent Cookies 300 g", "President's Choice The Decadent Chocolate Chip Cookies 300g", ("president", "choice", "decadent"), "300g", "superstore"),
    ProductCase("No Name All Purpose Flour 2.5 kg", "No Name All Purpose Flour 2.5kg", ("no", "name", "flour"), "2.5kg", "nofrills"),
    ProductCase("Compliments Shredded Cheese 320 g", "Compliments Shredded Cheese 320g", ("compliments", "cheese"), "320g", "freshco"),
    ProductCase("Selection Diced Tomatoes 796 mL", "Selection Diced Tomatoes 796mL", ("selection", "tomatoes"), "796ml", "metro"),
    ProductCase("Kirkland Signature Extra Virgin Olive Oil 3 L", "Kirkland Signature Extra Virgin Olive Oil 3L", ("kirkland", "olive", "oil"), "3l", "costco"),
    ProductCase("Kirkland Signature Paper Towels 12 rolls", "Kirkland Signature Paper Towels 12 rolls", ("kirkland", "paper", "towels"), None, "costco"),
    ProductCase("Bananas", "bananas", ("banana",), None, "walmart"),
    ProductCase("Avocados 5 pack", "avocados 5 pack", ("avocado",), None, "costco"),
    ProductCase("Roma Tomatoes", "Roma tomatoes", ("roma", "tomato"), None, "nofrills"),
)


def norm(text: str | None) -> str:
    s = (text or "").lower()
    s = s.replace("é", "e").replace("ä", "a").replace("'", "")
    s = re.sub(r"[^a-z0-9.]+", " ", s)
    return re.sub(r"\s+", " ", s).strip()


def compact(text: str | None) -> str:
    return re.sub(r"[^a-z0-9]+", "", norm(text))


def token_present(token: str, text: str) -> bool:
    t = norm(token)
    if not t:
        return True
    # Allow simple singular/plural differences and punctuation differences.
    words = set(text.split())
    if t in words or t in text:
        return True
    if t.endswith("s") and t[:-1] in words:
        return True
    if (t + "s") in words:
        return True
    return False


def score_text(case: ProductCase, text: str) -> tuple[float, bool, bool]:
    ntext = norm(text)
    hits = sum(1 for token in case.required_tokens if token_present(token, ntext))
    coverage = hits / max(len(case.required_tokens), 1)
    product_match = coverage >= 0.75
    if case.expected_size:
        size_match = compact(case.expected_size) in compact(text)
    else:
        size_match = True
    score = coverage * 0.80 + (0.20 if size_match else 0.0)
    return score, product_match, size_match


def result_text(row: Any) -> str:
    bits = [
        getattr(row, "name", None),
        getattr(row, "brand", None),
        getattr(row, "quantity", None),
        getattr(row, "store_name", None),
    ]
    return " ".join(str(x) for x in bits if x)


def best_identity(case: ProductCase, rows: list[Any]) -> tuple[Any | None, bool, bool, float]:
    best = None
    best_score = -1.0
    best_product = False
    best_size = False
    for row in rows:
        score, product_match, size_match = score_text(case, result_text(row))
        if score > best_score:
            best, best_score, best_product, best_size = row, score, product_match, size_match
    exact = bool(best is not None and best_product and best_size)
    return best, exact, best_size, max(best_score, 0.0)


def find_price(text: str) -> float | None:
    # Price evidence only. This does not claim in-store availability.
    patterns = [
        r"(?:CA\$|C\$|CAD\s*\$?|\$)\s*([0-9]{1,4}(?:[.,][0-9]{2})?)",
        r"([0-9]{1,4}[.,][0-9]{2})\s*(?:CAD|Canadian dollars?)",
    ]
    for pattern in patterns:
        m = re.search(pattern, text, flags=re.I)
        if m:
            try:
                value = float(m.group(1).replace(",", "."))
                if 0.05 <= value <= 1000:
                    return value
            except Exception:
                pass
    return None


def serper_search_case(case: ProductCase, max_queries: int = 2) -> tuple[list[dict[str, str]], int, list[str]]:
    profile = CANADIAN_STORE_LOOKUP_PROFILES[case.store_key]
    display = str(profile["display"])
    domains = _profile_domains(profile)
    queries = [f'"{case.query}" {display} Canada']
    if domains:
        queries.append(f'site:{domains[0]} "{case.query}"')
    hits: list[dict[str, str]] = []
    seen: set[str] = set()
    errors: list[str] = []
    used = 0
    for q in queries[:max_queries]:
        used += 1
        try:
            rows = _search_with_serper_api(q, 8)
        except Exception as exc:
            errors.append(f"{type(exc).__name__}: {exc}")
            rows = []
        for row in rows:
            url = str(row.get("url") or "")
            if not url or url in seen:
                continue
            seen.add(url)
            if _url_is_official_store_result(url, profile):
                hits.append(row)
        if hits:
            break
    return hits, used, errors


def choose_best_serper(case: ProductCase, hits: list[dict[str, str]]) -> tuple[dict[str, str] | None, bool, bool, float | None, float]:
    best = None
    best_score = -1.0
    best_product = False
    best_size = False
    best_price = None
    for hit in hits:
        text = f"{hit.get('title', '')} {hit.get('snippet', '')}"
        score, product_match, size_match = score_text(case, text)
        price = find_price(text)
        # Prefer product/size evidence, then a hit that actually exposes a price.
        composite = score + (0.08 if price is not None else 0.0)
        if composite > best_score:
            best = hit
            best_score = composite
            best_product = product_match
            best_size = size_match
            best_price = price
    return best, best_product, best_size, best_price, max(best_score, 0.0)


def pct(n: int, d: int) -> float:
    return round((100.0 * n / d), 1) if d else 0.0


def percentile(values: list[float], p: float) -> float:
    if not values:
        return 0.0
    vals = sorted(values)
    if len(vals) == 1:
        return vals[0]
    idx = (len(vals) - 1) * p
    lo = int(idx)
    hi = min(lo + 1, len(vals) - 1)
    frac = idx - lo
    return vals[lo] * (1 - frac) + vals[hi] * frac


def verdict(summary: dict[str, Any], configured: dict[str, bool]) -> tuple[str, list[str]]:
    reasons: list[str] = []
    if not configured["serper"] or not configured["upcdatabase"]:
        missing = [name for name, ok in configured.items() if not ok]
        return "FIX_CONFIGURATION_FIRST", [f"Missing provider configuration: {', '.join(missing)}"]

    identity = float(summary["combined_identity_exact_pct"])
    official = float(summary["serper_official_found_pct"])
    product = float(summary["serper_product_match_pct"])
    price = float(summary["serper_price_found_pct"])
    usable = float(summary["serper_usable_price_evidence_pct"])
    size = float(summary["serper_size_match_pct"])
    error = float(summary["serper_error_case_pct"])

    if identity < 80:
        reasons.append(f"Product identity exact-match coverage is only {identity:.1f}%. DataForSEO is not primarily a product-identity fix; improve OFF/UPCDatabase first.")
        return "FIX_PRODUCT_IDENTITY_FIRST", reasons
    if error > 10:
        reasons.append(f"Serper had provider errors on {error:.1f}% of cases. Fix API/config/rate-limit reliability before buying another data source.")
        return "FIX_CONFIGURATION_FIRST", reasons

    # Keep the current stack only when it is genuinely good enough to support a premium claim.
    if identity >= 90 and official >= 85 and product >= 82 and price >= 78 and usable >= 72 and size >= 70:
        reasons.append(f"Identity {identity:.1f}% and official retailer coverage {official:.1f}% are strong.")
        reasons.append(f"Usable exact-product price evidence is {usable:.1f}%, with raw price visibility {price:.1f}%.")
        reasons.append("The current stack is strong enough for an early premium launch if GHM clearly labels these as current web/official-page evidence rather than guaranteed in-store shelf prices.")
        return "KEEP_CURRENT_STACK_NO_DATAFORSEO_YET", reasons

    # This is the signature DataForSEO is most likely to improve: identity is fine, links exist,
    # but structured price/package data is missing or too inconsistent.
    if identity >= 85 and official >= 75 and (price < 70 or usable < 65 or size < 65):
        reasons.append(f"Product identity is acceptable at {identity:.1f}% and official retailer links are {official:.1f}%.")
        reasons.append(f"But usable product+package+price evidence is only {usable:.1f}% (raw price visibility {price:.1f}%, size match {size:.1f}%).")
        reasons.append("That gap is exactly where a structured Google Shopping/Merchant source such as DataForSEO is worth a pilot.")
        return "ADD_DATAFORSEO_PILOT", reasons

    reasons.append(f"Results are mixed: identity {identity:.1f}%, official retailer {official:.1f}%, price {price:.1f}%, usable price evidence {usable:.1f}%.")
    reasons.append("Do not pay for DataForSEO yet. Re-run with 50-100 products from your real users/receipts; add DataForSEO only if usable current-price evidence remains below about 70%.")
    return "BORDERLINE_TEST_MORE_REAL_PRODUCTS", reasons


def main() -> int:
    parser = argparse.ArgumentParser(
        description="Benchmark GHM Open Food Facts + UPCDatabase + Serper against the threshold for adding DataForSEO. No GHM account or house data is required."
    )
    parser.add_argument("--quick", action="store_true", help="Run the first 20 products instead of all 48.")
    parser.add_argument("--limit", type=int, default=0, help="Optional number of products to test (1-48).")
    parser.add_argument("--max-serper-queries", type=int, default=2, choices=(1, 2), help="Maximum Serper requests per product. Default 2.")
    parser.add_argument("--output-dir", default="/tmp", help="Where to write JSON/CSV/Markdown reports inside the container.")
    args = parser.parse_args()

    web_enabled = bool(settings.store_lookup_web_search_enabled)
    configured = {
        "serper": bool((settings.serper_api_key or "").strip()),
        "upcdatabase": upcdatabase_is_configured(),
        "store_web_lookup": web_enabled,
    }

    print("\nGHM Provider Value Benchmark")
    print("=" * 72)
    print("Purpose: decide whether Serper + UPCDatabase are sufficient or DataForSEO is worth adding.")
    print("This test does NOT use your GHM account, house, inventory, receipts, or database.")
    print(f"Serper configured:      {'YES' if configured['serper'] else 'NO'}")
    print(f"UPCDatabase configured: {'YES' if configured['upcdatabase'] else 'NO'}")
    print(f"GHM store web lookup:   {'ON' if web_enabled else 'OFF'}")
    if not all(configured.values()):
        print("\nCannot produce a fair DataForSEO verdict until SERPER_API_KEY, UPCDATABASE_API_KEY, and STORE_LOOKUP_WEB_SEARCH_ENABLED=true are configured.")
        return 2

    cases = list(CASES)
    if args.quick:
        cases = cases[:20]
    if args.limit:
        cases = cases[: max(1, min(args.limit, len(cases)))]

    print(f"Products:               {len(cases)}")
    print(f"Max Serper requests:    {len(cases) * args.max_serper_queries} (normally fewer because it stops after an official hit)")
    print("-" * 72)

    results: list[ProviderResult] = []
    serper_error_cases = 0

    for idx, case in enumerate(cases, 1):
        profile = CANADIAN_STORE_LOOKUP_PROFILES[case.store_key]
        store = str(profile["display"])
        row = ProviderResult(case=case.label, query=case.query, store=store)
        notes: list[str] = []

        t0 = time.perf_counter()
        off_rows = lookup_open_food_facts(query=case.query, limit=8)
        upc_rows = lookup_upcdatabase(query=case.query, limit=8)
        row.identity_latency_ms = round((time.perf_counter() - t0) * 1000, 1)

        off_best, off_exact, off_size, _ = best_identity(case, off_rows)
        upc_best, upc_exact, upc_size, _ = best_identity(case, upc_rows)
        row.off_found = bool(off_rows)
        row.off_exact = off_exact
        row.off_best = getattr(off_best, "name", None) if off_best else None
        row.upc_found = bool(upc_rows)
        row.upc_exact = upc_exact
        row.upc_best = getattr(upc_best, "name", None) if upc_best else None

        all_rows = [*off_rows, *upc_rows]
        combined_best, combined_exact, combined_size, _ = best_identity(case, all_rows)
        row.combined_identity_exact = combined_exact
        row.identity_size_match = combined_size if combined_best else False

        t1 = time.perf_counter()
        serper_hits, queries_used, errors = serper_search_case(case, max_queries=args.max_serper_queries)
        row.serper_latency_ms = round((time.perf_counter() - t1) * 1000, 1)
        row.serper_queries_used = queries_used
        if errors:
            serper_error_cases += 1
            notes.extend(errors[:2])

        row.serper_official_found = bool(serper_hits)
        best_hit, product_match, size_match, price, _ = choose_best_serper(case, serper_hits)
        row.serper_product_match = product_match
        row.serper_size_match = size_match if best_hit else False
        row.serper_price_found = price is not None
        row.serper_price = price
        row.serper_usable_price_evidence = bool(best_hit and product_match and size_match and price is not None)
        if best_hit:
            row.serper_best_title = str(best_hit.get("title") or "")[:220] or None
            row.serper_best_url = str(best_hit.get("url") or "") or None
        row.notes = " | ".join(notes)
        results.append(row)

        identity_mark = "✓" if row.combined_identity_exact else "✗"
        official_mark = "✓" if row.serper_official_found else "✗"
        price_mark = "✓" if row.serper_usable_price_evidence else ("~" if row.serper_price_found else "✗")
        source_bits = []
        if row.off_exact:
            source_bits.append("OFF")
        if row.upc_exact:
            source_bits.append("UPC")
        source = "+".join(source_bits) or "none"
        print(f"[{idx:02d}/{len(cases):02d}] ID {identity_mark} ({source:<7})  STORE {official_mark}  PRICE {price_mark}  {store:<25} {case.label}")

    total = len(results)
    count = lambda field: sum(1 for r in results if bool(getattr(r, field)))
    identity_latencies = [r.identity_latency_ms for r in results]
    serper_latencies = [r.serper_latency_ms for r in results]

    by_store: dict[str, dict[str, Any]] = {}
    for r in results:
        bucket = by_store.setdefault(r.store, {"cases": 0, "official": 0, "product_match": 0, "price": 0, "usable": 0})
        bucket["cases"] += 1
        bucket["official"] += int(r.serper_official_found)
        bucket["product_match"] += int(r.serper_product_match)
        bucket["price"] += int(r.serper_price_found)
        bucket["usable"] += int(r.serper_usable_price_evidence)
    for bucket in by_store.values():
        n = bucket["cases"]
        bucket["official_pct"] = pct(bucket["official"], n)
        bucket["product_match_pct"] = pct(bucket["product_match"], n)
        bucket["price_pct"] = pct(bucket["price"], n)
        bucket["usable_pct"] = pct(bucket["usable"], n)

    summary = {
        "products_tested": total,
        "open_food_facts_exact_pct": pct(count("off_exact"), total),
        "upcdatabase_exact_pct": pct(count("upc_exact"), total),
        "combined_identity_exact_pct": pct(count("combined_identity_exact"), total),
        "identity_size_match_pct": pct(count("identity_size_match"), total),
        "serper_official_found_pct": pct(count("serper_official_found"), total),
        "serper_product_match_pct": pct(count("serper_product_match"), total),
        "serper_size_match_pct": pct(count("serper_size_match"), total),
        "serper_price_found_pct": pct(count("serper_price_found"), total),
        "serper_usable_price_evidence_pct": pct(count("serper_usable_price_evidence"), total),
        "serper_error_case_pct": pct(serper_error_cases, total),
        "serper_queries_used": sum(r.serper_queries_used for r in results),
        "identity_latency_p50_ms": round(statistics.median(identity_latencies), 1) if identity_latencies else 0.0,
        "identity_latency_p95_ms": round(percentile(identity_latencies, 0.95), 1),
        "serper_latency_p50_ms": round(statistics.median(serper_latencies), 1) if serper_latencies else 0.0,
        "serper_latency_p95_ms": round(percentile(serper_latencies, 0.95), 1),
    }

    decision, reasons = verdict(summary, configured)

    print("\n" + "=" * 72)
    print("SUMMARY")
    print("=" * 72)
    print(f"Products tested:                  {total}")
    print(f"Open Food Facts exact identity:   {summary['open_food_facts_exact_pct']:>6.1f}%")
    print(f"UPCDatabase exact identity:       {summary['upcdatabase_exact_pct']:>6.1f}%")
    print(f"Combined identity exact:          {summary['combined_identity_exact_pct']:>6.1f}%")
    print(f"Official retailer page found:     {summary['serper_official_found_pct']:>6.1f}%")
    print(f"Correct product in Serper result: {summary['serper_product_match_pct']:>6.1f}%")
    print(f"Package/size matched:             {summary['serper_size_match_pct']:>6.1f}%")
    print(f"Any price visible in result:      {summary['serper_price_found_pct']:>6.1f}%")
    print(f"Usable product+size+price:        {summary['serper_usable_price_evidence_pct']:>6.1f}%")
    print(f"Serper provider error cases:      {summary['serper_error_case_pct']:>6.1f}%")
    print(f"Serper queries consumed:          {summary['serper_queries_used']}")
    print(f"Serper latency p50 / p95:         {summary['serper_latency_p50_ms']:.0f} / {summary['serper_latency_p95_ms']:.0f} ms")

    print("\nBY RETAILER")
    for store in sorted(by_store):
        b = by_store[store]
        print(f"  {store:<26} official {b['official_pct']:>5.1f}% | price {b['price_pct']:>5.1f}% | usable {b['usable_pct']:>5.1f}% | n={b['cases']}")

    print("\nVERDICT")
    print(f"  {decision}")
    for reason in reasons:
        print(f"  - {reason}")

    print("\nINTERPRETATION")
    print("  KEEP_CURRENT_STACK_NO_DATAFORSEO_YET = Serper + UPCDatabase are good enough for early premium use.")
    print("  ADD_DATAFORSEO_PILOT                 = identity is good, but structured current-price/package data is too weak.")
    print("  FIX_PRODUCT_IDENTITY_FIRST           = improve OFF/UPCDatabase matching first; DataForSEO is not the main fix.")
    print("  FIX_CONFIGURATION_FIRST              = credentials/API reliability problem; do not judge providers yet.")
    print("  BORDERLINE_TEST_MORE_REAL_PRODUCTS   = rerun with your real household products before spending money.")

    timestamp = datetime.now(timezone.utc).strftime("%Y%m%d-%H%M%S")
    out_dir = Path(args.output_dir)
    out_dir.mkdir(parents=True, exist_ok=True)
    base = out_dir / f"ghm-provider-value-benchmark-{timestamp}"
    json_path = base.with_suffix(".json")
    csv_path = base.with_suffix(".csv")
    md_path = base.with_suffix(".md")

    payload = {
        "generated_at": datetime.now(timezone.utc).isoformat(),
        "decision": decision,
        "reasons": reasons,
        "configured": configured,
        "summary": summary,
        "by_store": by_store,
        "results": [asdict(r) for r in results],
        "notes": [
            "Serper price means a price was visible in the Google-style result title/snippet; it is not a guarantee of local shelf inventory.",
            "Usable price evidence requires an official retailer URL, matching product tokens, matching package size when one is specified, and a visible price.",
            "DataForSEO should be considered when identity is already strong but structured price/package evidence remains weak.",
        ],
    }
    json_path.write_text(json.dumps(payload, indent=2, ensure_ascii=False), encoding="utf-8")

    fieldnames = list(asdict(results[0]).keys()) if results else []
    with csv_path.open("w", newline="", encoding="utf-8") as f:
        writer = csv.DictWriter(f, fieldnames=fieldnames)
        writer.writeheader()
        for r in results:
            writer.writerow(asdict(r))

    md_lines = [
        "# GHM Provider Value Benchmark",
        "",
        f"**Verdict:** `{decision}`",
        "",
        *[f"- {reason}" for reason in reasons],
        "",
        "## Summary",
        "",
        "| Metric | Result |",
        "|---|---:|",
    ]
    for key, value in summary.items():
        md_lines.append(f"| {key} | {value} |")
    md_lines.extend(["", "## By retailer", "", "| Retailer | Tests | Official % | Price % | Usable % |", "|---|---:|---:|---:|---:|"])
    for store in sorted(by_store):
        b = by_store[store]
        md_lines.append(f"| {store} | {b['cases']} | {b['official_pct']} | {b['price_pct']} | {b['usable_pct']} |")
    md_lines.extend(["", "## Failed / weak cases", ""])
    weak = [r for r in results if not r.serper_usable_price_evidence or not r.combined_identity_exact]
    if not weak:
        md_lines.append("None.")
    else:
        for r in weak:
            md_lines.append(f"- **{r.case}** ({r.store}) — identity={'OK' if r.combined_identity_exact else 'MISS'}, official={'OK' if r.serper_official_found else 'MISS'}, price={'OK' if r.serper_price_found else 'MISS'}, size={'OK' if r.serper_size_match else 'MISS'}")
    md_path.write_text("\n".join(md_lines) + "\n", encoding="utf-8")

    print("\nREPORT FILES INSIDE CONTAINER")
    print(f"  JSON: {json_path}")
    print(f"  CSV:  {csv_path}")
    print(f"  MD:   {md_path}")
    print("\nTip: run with --output-dir /app/qa_reports if that directory is mounted/persistent, or use docker compose cp to copy /tmp reports out.")

    # Non-zero only for configuration/provider-health failures, not simply because DataForSEO is recommended.
    if decision in {"FIX_CONFIGURATION_FIRST"}:
        return 3
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
