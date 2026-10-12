from __future__ import annotations

"""GHM Provider Value Benchmark (V114+)

Purpose
-------
Measure whether GHM's existing product-data stack (Open Food Facts + UPCDatabase
+ direct retailer pages + Serper) is good enough for Canadian grocery product
identity and current web-price evidence, or whether a DataForSEO trial is justified.

Run INSIDE the backend container so this tests the exact provider adapters shipped
with GHM and uses the keys already present in backend/.env:

    docker compose exec backend python -m app.scripts.provider_value_benchmark

This script does NOT need a GHM user account, does NOT create houses/products,
and does NOT write to the database. It is safe for an empty GHM account.

Default full benchmark uses about 40 Serper queries at most plus 30 UPCDatabase
searches. --quick cuts that roughly in half.
"""

import argparse
import json
import math
import re
import statistics
import sys
import time
from dataclasses import asdict, dataclass
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

try:
    from app.core.config import settings
    from app.utils.external_providers import lookup_upcdatabase, upcdatabase_is_configured
    from app.utils.market_data import (
        CANADIAN_STORE_LOOKUP_PROFILES,
        _lookup_public_store_pages,
        _page_result_from_url,
        _result_from_search_hit,
        _search_with_serper_api,
        _url_is_official_store_result,
        lookup_open_food_facts,
        lookup_walmart_canada_product,
    )
except Exception as exc:  # pragma: no cover - only for operator guidance
    print("ERROR: Run this inside the GHM backend container so the app package is available.")
    print("Example: docker compose exec backend python -m app.scripts.provider_value_benchmark")
    print(f"Import error: {exc}")
    raise SystemExit(2)


@dataclass(frozen=True)
class IdentityCase:
    query: str
    expected: tuple[str, ...]
    size_terms: tuple[str, ...] = ()
    hard: bool = False


@dataclass(frozen=True)
class StoreCase:
    store: str
    query: str
    expected: tuple[str, ...]
    size_terms: tuple[str, ...] = ()
    category: str = "branded"


IDENTITY_CASES: list[IdentityCase] = [
    IdentityCase("Coca-Cola Original Taste 2 L", ("coca", "cola"), ("2", "l")),
    IdentityCase("Cheerios Original 570 g", ("cheerios", "original"), ("570", "g")),
    IdentityCase("Heinz Tomato Ketchup 1 L", ("heinz", "ketchup"), ("1", "l")),
    IdentityCase("Oreo Original cookies 270 g", ("oreo",), ("270", "g")),
    IdentityCase("Tide Original liquid laundry detergent", ("tide", "detergent")),
    IdentityCase("Neilson 2% milk 4 L", ("neilson", "milk"), ("4", "l")),
    IdentityCase("Wonder white bread 675 g", ("wonder", "bread"), ("675", "g")),
    IdentityCase("Gay Lea salted butter 454 g", ("gay", "lea", "butter"), ("454", "g")),
    IdentityCase("Burnbrae Farms large eggs 12", ("burnbrae", "eggs"), ("12",)),
    IdentityCase("Kraft Dinner Original 200 g", ("kraft", "dinner"), ("200", "g")),
    IdentityCase("Barilla spaghetti 410 g", ("barilla", "spaghetti"), ("410", "g")),
    IdentityCase("Classico tomato basil pasta sauce 650 mL", ("classico", "tomato"), ("650", "ml")),
    IdentityCase("Lay's Classic potato chips", ("lay", "classic")),
    IdentityCase("Quaker quick oats", ("quaker", "oats")),
    IdentityCase("Tetley orange pekoe tea", ("tetley", "orange", "pekoe")),
    IdentityCase("Nescafe Rich instant coffee", ("nescafe", "rich")),
    IdentityCase("Silk unsweetened almond beverage", ("silk", "almond")),
    IdentityCase("Astro Original Balkan yogurt", ("astro", "yogurt")),
    IdentityCase("Dempster's 100% whole wheat bread", ("dempster", "whole", "wheat")),
    IdentityCase("Chapman's vanilla ice cream", ("chapman", "vanilla")),
    IdentityCase("President's Choice The Decadent chocolate chip cookies", ("president", "choice", "decadent"), hard=True),
    IdentityCase("No Name ketchup", ("no", "name", "ketchup"), hard=True),
    IdentityCase("Compliments old cheddar cheese", ("compliments", "cheddar"), hard=True),
    IdentityCase("Great Value creamy peanut butter", ("great", "value", "peanut"), hard=True),
    IdentityCase("Kirkland Signature extra virgin olive oil", ("kirkland", "olive", "oil"), hard=True),
    IdentityCase("Selection white eggs large", ("selection", "eggs"), hard=True),
    IdentityCase("Irresistibles maple syrup", ("irresistibles", "maple"), hard=True),
    IdentityCase("bananas", ("banana",), hard=True),
    IdentityCase("Hass avocados", ("avocado",), hard=True),
    IdentityCase("Roma tomatoes", ("tomato",), hard=True),
]


STORE_CASES: list[StoreCase] = [
    StoreCase("walmart", "Coca-Cola Original Taste 2 L", ("coca", "cola"), ("2", "l")),
    StoreCase("walmart", "Cheerios Original 570 g", ("cheerios",), ("570", "g")),
    StoreCase("walmart", "Tide liquid laundry detergent", ("tide", "detergent")),
    StoreCase("walmart", "Great Value creamy peanut butter", ("great", "value", "peanut"), category="store-brand"),
    StoreCase("walmart", "large eggs 12", ("egg",), ("12",), category="commodity"),
    StoreCase("walmart", "bananas", ("banana",), category="produce"),

    StoreCase("nofrills", "No Name ketchup", ("no", "name", "ketchup"), category="store-brand"),
    StoreCase("nofrills", "President's Choice Decadent cookies", ("president", "choice", "decadent"), category="store-brand"),
    StoreCase("nofrills", "Neilson 2% milk 4 L", ("neilson", "milk"), ("4", "l")),
    StoreCase("nofrills", "Gay Lea butter 454 g", ("gay", "lea", "butter"), ("454", "g")),
    StoreCase("nofrills", "large eggs 12", ("egg",), ("12",), category="commodity"),

    StoreCase("superstore", "President's Choice Decadent cookies", ("president", "choice", "decadent"), category="store-brand"),
    StoreCase("superstore", "No Name ketchup", ("no", "name", "ketchup"), category="store-brand"),
    StoreCase("superstore", "Coca-Cola 2 L", ("coca", "cola"), ("2", "l")),
    StoreCase("superstore", "Cheerios 570 g", ("cheerios",), ("570", "g")),
    StoreCase("superstore", "bananas", ("banana",), category="produce"),

    StoreCase("loblaws", "President's Choice Decadent cookies", ("president", "choice", "decadent"), category="store-brand"),
    StoreCase("loblaws", "No Name ketchup", ("no", "name", "ketchup"), category="store-brand"),
    StoreCase("loblaws", "Gay Lea butter 454 g", ("gay", "lea", "butter"), ("454", "g")),

    StoreCase("metro", "Selection large eggs 12", ("selection", "egg"), ("12",), category="store-brand"),
    StoreCase("metro", "Irresistibles maple syrup", ("irresistibles", "maple"), category="store-brand"),
    StoreCase("metro", "Coca-Cola 2 L", ("coca", "cola"), ("2", "l")),
    StoreCase("metro", "Neilson 2% milk 4 L", ("neilson", "milk"), ("4", "l")),
    StoreCase("metro", "bananas", ("banana",), category="produce"),

    StoreCase("foodbasics", "Selection large eggs 12", ("selection", "egg"), ("12",), category="store-brand"),
    StoreCase("foodbasics", "Irresistibles maple syrup", ("irresistibles", "maple"), category="store-brand"),
    StoreCase("foodbasics", "Wonder white bread 675 g", ("wonder", "bread"), ("675", "g")),
    StoreCase("foodbasics", "Coca-Cola 2 L", ("coca", "cola"), ("2", "l")),
    StoreCase("foodbasics", "bananas", ("banana",), category="produce"),

    StoreCase("freshco", "Compliments old cheddar cheese", ("compliments", "cheddar"), category="store-brand"),
    StoreCase("freshco", "Coca-Cola 2 L", ("coca", "cola"), ("2", "l")),
    StoreCase("freshco", "Wonder white bread 675 g", ("wonder", "bread"), ("675", "g")),
    StoreCase("freshco", "Gay Lea butter 454 g", ("gay", "lea", "butter"), ("454", "g")),
    StoreCase("freshco", "bananas", ("banana",), category="produce"),

    StoreCase("costco", "Kirkland Signature extra virgin olive oil", ("kirkland", "olive", "oil"), category="store-brand"),
    StoreCase("costco", "Tide liquid laundry detergent", ("tide", "detergent")),
    StoreCase("costco", "Cheerios", ("cheerios",)),
    StoreCase("costco", "large eggs", ("egg",), category="commodity"),
    StoreCase("costco", "Kirkland paper towels", ("kirkland", "paper", "towel"), category="store-brand"),
    StoreCase("costco", "Kirkland toilet paper", ("kirkland", "toilet", "paper"), category="store-brand"),
]


STOP = {
    "the", "and", "for", "with", "original", "taste", "large", "white", "old",
    "liquid", "100", "canada", "canadian", "pack", "size", "fresh",
}


def norm(text: Any) -> str:
    return re.sub(r"[^a-z0-9]+", " ", str(text or "").lower()).strip()


def all_text(result: Any) -> str:
    if result is None:
        return ""
    bits = [
        getattr(result, "name", None),
        getattr(result, "brand", None),
        getattr(result, "quantity", None),
        getattr(result, "store_name", None),
        getattr(result, "product_url", None),
        getattr(result, "lookup_note", None),
    ]
    return norm(" ".join(str(x) for x in bits if x))


def token_coverage(text: str, expected: tuple[str, ...]) -> float:
    if not expected:
        return 1.0
    hay = norm(text)
    tokens = [norm(x) for x in expected if norm(x) and norm(x) not in STOP]
    if not tokens:
        return 1.0
    matched = 0
    for token in tokens:
        # crude plural/stemming tolerance, useful for eggs/egg, tomatoes/tomato etc.
        stem = token[:-1] if token.endswith("s") and len(token) > 4 else token
        if token in hay or stem in hay:
            matched += 1
    return matched / len(tokens)


def size_coverage(text: str, size_terms: tuple[str, ...]) -> float | None:
    if not size_terms:
        return None
    hay = norm(text)
    matched = sum(1 for token in size_terms if norm(token) in hay)
    return matched / len(size_terms)


def good_identity(result: Any, case: IdentityCase) -> tuple[bool, float, float | None]:
    text = all_text(result)
    cov = token_coverage(text, case.expected)
    size = size_coverage(text, case.size_terms)
    # Product identity is useful when core product/brand tokens are present. Size is tracked
    # separately because many barcode databases omit package metadata for otherwise-correct items.
    return cov >= 0.67, cov, size


def good_store_match(result: Any, hit: dict[str, str] | None, case: StoreCase) -> tuple[bool, float, float | None]:
    text = all_text(result)
    if hit:
        text += " " + norm(hit.get("title")) + " " + norm(hit.get("snippet"))
    cov = token_coverage(text, case.expected)
    size = size_coverage(text, case.size_terms)
    return cov >= 0.67, cov, size


def pct(n: int, d: int) -> float:
    return round((100.0 * n / d), 1) if d else 0.0


def result_summary(r: Any) -> dict[str, Any] | None:
    if r is None:
        return None
    return {
        "source": getattr(r, "source", None),
        "name": getattr(r, "name", None),
        "brand": getattr(r, "brand", None),
        "quantity": getattr(r, "quantity", None),
        "store": getattr(r, "store_name", None),
        "price": getattr(r, "price", None),
        "url": getattr(r, "product_url", None),
    }


def benchmark_identity(cases: list[IdentityCase]) -> tuple[list[dict[str, Any]], dict[str, Any]]:
    rows: list[dict[str, Any]] = []
    latencies: list[float] = []
    off_good = upc_good = combined_good = upc_incremental = 0
    size_evidence = 0

    for idx, case in enumerate(cases, 1):
        started = time.perf_counter()
        off = []
        upc = []
        off_error = upc_error = None
        try:
            off = lookup_open_food_facts(query=case.query, limit=5)
        except Exception as exc:
            off_error = str(exc)
        if upcdatabase_is_configured():
            try:
                upc = lookup_upcdatabase(query=case.query, limit=5)
            except Exception as exc:
                upc_error = str(exc)

        def best(results: list[Any]) -> tuple[Any | None, bool, float, float | None]:
            scored = []
            for r in results:
                ok, cov, size = good_identity(r, case)
                scored.append((cov + ((size or 0) * 0.15), r, ok, cov, size))
            if not scored:
                return None, False, 0.0, None
            _, r, ok, cov, size = max(scored, key=lambda x: x[0])
            return r, ok, cov, size

        off_best, off_ok, off_cov, off_size = best(off)
        upc_best, upc_ok, upc_cov, upc_size = best(upc)
        elapsed = round(time.perf_counter() - started, 2)
        latencies.append(elapsed)

        off_good += int(off_ok)
        upc_good += int(upc_ok)
        combo = off_ok or upc_ok
        combined_good += int(combo)
        upc_incremental += int(upc_ok and not off_ok)
        if (off_size is not None and off_size >= 0.5) or (upc_size is not None and upc_size >= 0.5):
            size_evidence += 1

        rows.append({
            "case": idx,
            "query": case.query,
            "hard": case.hard,
            "off_good": off_ok,
            "upc_good": upc_ok,
            "combined_good": combo,
            "upc_incremental": bool(upc_ok and not off_ok),
            "off_token_coverage": round(off_cov, 2),
            "upc_token_coverage": round(upc_cov, 2),
            "off_size_coverage": off_size,
            "upc_size_coverage": upc_size,
            "open_food_facts": result_summary(off_best),
            "upcdatabase": result_summary(upc_best),
            "off_error": off_error,
            "upc_error": upc_error,
            "latency_seconds": elapsed,
        })
        print(f"[IDENTITY {idx:02d}/{len(cases)}] {'PASS' if combo else 'MISS':4} | OFF={'Y' if off_ok else 'N'} UPC={'Y' if upc_ok else 'N'} | {case.query}")

    metrics = {
        "cases": len(cases),
        "open_food_facts_good": off_good,
        "open_food_facts_good_pct": pct(off_good, len(cases)),
        "upcdatabase_good": upc_good,
        "upcdatabase_good_pct": pct(upc_good, len(cases)),
        "combined_good": combined_good,
        "combined_good_pct": pct(combined_good, len(cases)),
        "upcdatabase_incremental_wins": upc_incremental,
        "upcdatabase_incremental_pct": pct(upc_incremental, len(cases)),
        "size_evidence_cases": size_evidence,
        "size_evidence_pct": pct(size_evidence, len(cases)),
        "latency_median_seconds": round(statistics.median(latencies), 2) if latencies else None,
        "latency_p95_seconds": round(sorted(latencies)[max(0, math.ceil(len(latencies) * 0.95) - 1)], 2) if latencies else None,
    }
    return rows, metrics


def serper_one_query(profile: dict[str, Any], case: StoreCase) -> tuple[list[dict[str, str]], str]:
    # Intentionally exactly one Serper query per benchmark store-case to make the cost predictable.
    # Use a site-restricted query when we have an official domain.
    domains = []
    for template in profile.get("search_urls") or []:
        m = re.match(r"https?://(?:www\.)?([^/]+)", str(template))
        if m and m.group(1) not in domains:
            domains.append(m.group(1))
    domain = domains[0] if domains else ""
    query = f'site:{domain} "{case.query}"' if domain else f'"{case.query}" {profile.get("display")}'
    return _search_with_serper_api(query, 5), query


def benchmark_store(cases: list[StoreCase]) -> tuple[list[dict[str, Any]], dict[str, Any]]:
    rows: list[dict[str, Any]] = []
    latencies: list[float] = []
    official = relevant = price = size_good = comparison_ready = direct_wins = serper_wins = 0
    by_store: dict[str, dict[str, int]] = {}

    for idx, case in enumerate(cases, 1):
        started = time.perf_counter()
        profile = CANADIAN_STORE_LOOKUP_PROFILES.get(case.store)
        if not profile:
            print(f"[STORE {idx:02d}/{len(cases)}] ERROR unknown store {case.store}")
            continue

        path = "none"
        chosen = None
        chosen_hit: dict[str, str] | None = None
        search_query = None
        serper_count = 0
        error = None

        # 1) Test GHM's no-paid-search direct retailer parsing first.
        try:
            direct: list[Any] = []
            if case.store == "walmart":
                direct = lookup_walmart_canada_product(query=case.query, limit=5)
            if not direct:
                direct = _lookup_public_store_pages(profile=profile, term=case.query, limit=5)
            for candidate in direct:
                ok, _, _ = good_store_match(candidate, None, case)
                if ok:
                    chosen = candidate
                    path = "direct-store-page"
                    direct_wins += 1
                    break
        except Exception as exc:
            error = f"direct: {exc}"

        # 2) If direct store parsing is not sufficient, spend exactly one Serper query.
        if chosen is None and getattr(settings, "serper_api_key", None):
            try:
                hits, search_query = serper_one_query(profile, case)
                serper_count = 1
                for hit in hits:
                    url = hit.get("url") or ""
                    if not _url_is_official_store_result(url, profile):
                        continue
                    candidate = _page_result_from_url(url=url, profile=profile, term=case.query)
                    if candidate is None:
                        candidate = _result_from_search_hit(hit, profile=profile, term=case.query)
                    if candidate is None:
                        continue
                    ok, _, _ = good_store_match(candidate, hit, case)
                    if ok:
                        chosen = candidate
                        chosen_hit = hit
                        path = "serper-official-page"
                        serper_wins += 1
                        break
            except Exception as exc:
                error = f"{error}; " if error else ""
                error += f"serper: {exc}"

        elapsed = round(time.perf_counter() - started, 2)
        latencies.append(elapsed)
        is_official = bool(chosen and getattr(chosen, "product_url", None) and _url_is_official_store_result(getattr(chosen, "product_url"), profile))
        good, cov, size_cov = good_store_match(chosen, chosen_hit, case) if chosen else (False, 0.0, None)
        has_price = bool(chosen is not None and getattr(chosen, "price", None) is not None and float(getattr(chosen, "price")) > 0)
        has_size = bool(size_cov is not None and size_cov >= 0.5)
        ready = bool(is_official and good and has_price)

        official += int(is_official)
        relevant += int(good)
        price += int(has_price)
        size_good += int(has_size)
        comparison_ready += int(ready)

        store_stats = by_store.setdefault(case.store, {"cases": 0, "official": 0, "relevant": 0, "price": 0, "ready": 0})
        store_stats["cases"] += 1
        store_stats["official"] += int(is_official)
        store_stats["relevant"] += int(good)
        store_stats["price"] += int(has_price)
        store_stats["ready"] += int(ready)

        rows.append({
            "case": idx,
            "store_key": case.store,
            "store": profile.get("display"),
            "query": case.query,
            "category": case.category,
            "path": path,
            "serper_queries_used": serper_count,
            "serper_query": search_query,
            "official_url": is_official,
            "relevant_match": good,
            "token_coverage": round(cov, 2),
            "size_coverage": size_cov,
            "numeric_price_found": has_price,
            "comparison_ready": ready,
            "result": result_summary(chosen),
            "error": error,
            "latency_seconds": elapsed,
        })
        state = "READY" if ready else ("FOUND" if chosen else "MISS")
        p = f"${getattr(chosen, 'price', None):.2f}" if has_price else "no-price"
        print(f"[STORE {idx:02d}/{len(cases)}] {state:5} | {profile.get('display'):<24} | {p:<10} | {path:<20} | {case.query}")

    n = len(cases)
    for stats in by_store.values():
        c = stats["cases"]
        stats["official_pct"] = pct(stats["official"], c)
        stats["price_pct"] = pct(stats["price"], c)
        stats["ready_pct"] = pct(stats["ready"], c)

    metrics = {
        "cases": n,
        "official_product_page": official,
        "official_product_page_pct": pct(official, n),
        "relevant_match": relevant,
        "relevant_match_pct": pct(relevant, n),
        "numeric_price": price,
        "numeric_price_pct": pct(price, n),
        "package_size_evidence": size_good,
        "package_size_evidence_pct": pct(size_good, n),
        "comparison_ready": comparison_ready,
        "comparison_ready_pct": pct(comparison_ready, n),
        "direct_store_page_wins": direct_wins,
        "serper_wins": serper_wins,
        "serper_queries_used": sum(r["serper_queries_used"] for r in rows),
        "latency_median_seconds": round(statistics.median(latencies), 2) if latencies else None,
        "latency_p95_seconds": round(sorted(latencies)[max(0, math.ceil(len(latencies) * 0.95) - 1)], 2) if latencies else None,
        "by_store": by_store,
    }
    return rows, metrics


def recommendation(identity: dict[str, Any], store: dict[str, Any]) -> dict[str, Any]:
    identity_pct = float(identity.get("combined_good_pct") or 0)
    official_pct = float(store.get("official_product_page_pct") or 0)
    relevant_pct = float(store.get("relevant_match_pct") or 0)
    price_pct = float(store.get("numeric_price_pct") or 0)
    ready_pct = float(store.get("comparison_ready_pct") or 0)

    # These thresholds are intentionally demanding because GHM wants to charge monthly for
    # dependable premium intelligence, not merely show occasional search results.
    if identity_pct >= 90 and official_pct >= 90 and relevant_pct >= 90 and price_pct >= 85 and ready_pct >= 85:
        verdict = "CURRENT_STACK_SUFFICIENT"
        headline = "Do NOT add DataForSEO yet. Your current stack is strong enough for an early premium launch."
        reason = (
            "The current stack cleared the premium-readiness thresholds for product identity, official retailer discovery, "
            "numeric web-price coverage, and comparison-ready results. Keep DataForSEO as a future fallback only."
        )
    elif identity_pct >= 85 and official_pct >= 80 and relevant_pct >= 85 and price_pct >= 70 and ready_pct >= 70:
        verdict = "BORDERLINE_IMPROVE_FIRST"
        headline = "Do not buy DataForSEO yet; improve parsing/caching and re-run this benchmark once."
        reason = (
            "The stack is close, but current-price/package coverage is not yet strong enough to call every result premium-grade. "
            "Fix the weak retailers shown in the report, then re-test. If it remains below 85% comparison-ready, trial DataForSEO."
        )
    else:
        verdict = "DATAFORSEO_TRIAL_RECOMMENDED"
        headline = "Your current stack is not consistent enough by itself. A DataForSEO trial is worth testing."
        reason = (
            "Current product identity and/or official current-price coverage missed the reliability threshold. "
            "This does not prove DataForSEO will solve every gap; use its free/test credit on the exact failed cases and compare results before paying broadly."
        )

    return {
        "verdict": verdict,
        "headline": headline,
        "reason": reason,
        "thresholds": {
            "strong_identity_pct": 90,
            "official_product_page_pct": 90,
            "relevant_match_pct": 90,
            "numeric_price_pct": 85,
            "comparison_ready_pct": 85,
        },
        "observed": {
            "identity_pct": identity_pct,
            "official_product_page_pct": official_pct,
            "relevant_match_pct": relevant_pct,
            "numeric_price_pct": price_pct,
            "comparison_ready_pct": ready_pct,
        },
    }


def write_markdown(path: Path, report: dict[str, Any]) -> None:
    i = report["identity_metrics"]
    s = report["store_metrics"]
    rec = report["recommendation"]
    lines = [
        "# GHM Product Data Provider Benchmark",
        "",
        f"Run: {report['run_at_utc']}",
        "",
        "## Recommendation",
        "",
        f"**{rec['verdict']}**",
        "",
        rec["headline"],
        "",
        rec["reason"],
        "",
        "## Scorecard",
        "",
        "| Metric | Result |",
        "|---|---:|",
        f"| Product identity - Open Food Facts | {i['open_food_facts_good_pct']}% |",
        f"| Product identity - UPCDatabase | {i['upcdatabase_good_pct']}% |",
        f"| Product identity - combined | **{i['combined_good_pct']}%** |",
        f"| UPCDatabase incremental wins | {i['upcdatabase_incremental_wins']} ({i['upcdatabase_incremental_pct']}%) |",
        f"| Official retailer page found | {s['official_product_page_pct']}% |",
        f"| Relevant retailer/product match | {s['relevant_match_pct']}% |",
        f"| Numeric current web price found | **{s['numeric_price_pct']}%** |",
        f"| Comparison-ready result | **{s['comparison_ready_pct']}%** |",
        f"| Serper queries used | {s['serper_queries_used']} |",
        "",
        "## Retailer breakdown",
        "",
        "| Retailer | Cases | Official | Price | Comparison-ready |",
        "|---|---:|---:|---:|---:|",
    ]
    for key, row in sorted((s.get("by_store") or {}).items()):
        lines.append(f"| {key} | {row['cases']} | {row['official_pct']}% | {row['price_pct']}% | {row['ready_pct']}% |")

    lines += [
        "",
        "## Failed / weak store cases to inspect",
        "",
    ]
    weak = [r for r in report["store_cases"] if not r["comparison_ready"]]
    if not weak:
        lines.append("None — every tested store case was comparison-ready.")
    else:
        for r in weak:
            res = r.get("result") or {}
            lines.append(
                f"- **{r['store']} — {r['query']}**: path={r['path']}, official={r['official_url']}, "
                f"relevant={r['relevant_match']}, price={res.get('price')}, url={res.get('url') or 'none'}"
            )

    lines += [
        "",
        "## Interpretation",
        "",
        "- UPCDatabase is judged as a **product identity** source, not a live-price provider.",
        "- Serper is judged on whether GHM can find an **official retailer result** and recover a numeric web price.",
        "- A web price is not automatically a verified in-store/local-shelf price; GHM should continue showing source and freshness labels.",
        "- If DataForSEO is recommended, use its trial/test credit on the failed cases above before deciding to keep it.",
        "- This benchmark does not modify the GHM database or consume receipt-scan quota.",
    ]
    path.write_text("\n".join(lines) + "\n", encoding="utf-8")


def main() -> int:
    parser = argparse.ArgumentParser(description="Benchmark GHM's current Canadian product-data stack before adding DataForSEO.")
    parser.add_argument("--quick", action="store_true", help="Run roughly half the cases (about 20 Serper queries and 15 UPC searches).")
    parser.add_argument("--output-dir", default="/tmp", help="Directory for JSON and Markdown reports (default: /tmp).")
    args = parser.parse_args()

    print("GHM Product Data Provider Benchmark")
    print("===================================")
    print("No GHM account or house is required. No database records will be created.")
    print(f"Open Food Facts: enabled")
    print(f"UPCDatabase:     {'configured' if upcdatabase_is_configured() else 'NOT CONFIGURED'}")
    print(f"Serper:          {'configured' if bool(getattr(settings, 'serper_api_key', None)) else 'NOT CONFIGURED'}")
    print("")

    if not upcdatabase_is_configured():
        print("WARNING: UPCDatabase is not configured, so its value cannot be measured.")
    if not getattr(settings, "serper_api_key", None):
        print("WARNING: Serper is not configured, so official retailer search/price coverage will be understated.")
    print("")

    identity_cases = IDENTITY_CASES[:15] if args.quick else IDENTITY_CASES
    store_cases = STORE_CASES[:20] if args.quick else STORE_CASES

    print(f"Running {len(identity_cases)} identity cases...")
    identity_rows, identity_metrics = benchmark_identity(identity_cases)
    print("")
    print(f"Running {len(store_cases)} retailer/price cases...")
    store_rows, store_metrics = benchmark_store(store_cases)
    print("")

    rec = recommendation(identity_metrics, store_metrics)
    run_at = datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")
    report = {
        "benchmark": "GHM V114 Provider Value Benchmark",
        "run_at_utc": run_at,
        "mode": "quick" if args.quick else "full",
        "configured": {
            "upcdatabase": upcdatabase_is_configured(),
            "serper": bool(getattr(settings, "serper_api_key", None)),
        },
        "identity_metrics": identity_metrics,
        "store_metrics": store_metrics,
        "recommendation": rec,
        "identity_cases": identity_rows,
        "store_cases": store_rows,
    }

    out_dir = Path(args.output_dir)
    out_dir.mkdir(parents=True, exist_ok=True)
    stamp = datetime.now().strftime("%Y%m%d-%H%M%S")
    json_path = out_dir / f"ghm-provider-benchmark-{stamp}.json"
    md_path = out_dir / f"ghm-provider-benchmark-{stamp}.md"
    json_path.write_text(json.dumps(report, indent=2, ensure_ascii=False, default=str), encoding="utf-8")
    write_markdown(md_path, report)

    print("================ FINAL SCORECARD ================")
    print(f"Identity: OFF                    {identity_metrics['open_food_facts_good_pct']:>6.1f}%")
    print(f"Identity: UPCDatabase            {identity_metrics['upcdatabase_good_pct']:>6.1f}%")
    print(f"Identity: combined               {identity_metrics['combined_good_pct']:>6.1f}%")
    print(f"UPC incremental wins             {identity_metrics['upcdatabase_incremental_wins']:>6}")
    print(f"Official retailer page           {store_metrics['official_product_page_pct']:>6.1f}%")
    print(f"Relevant product match           {store_metrics['relevant_match_pct']:>6.1f}%")
    print(f"Numeric web price                {store_metrics['numeric_price_pct']:>6.1f}%")
    print(f"Comparison-ready                 {store_metrics['comparison_ready_pct']:>6.1f}%")
    print(f"Serper queries consumed          {store_metrics['serper_queries_used']:>6}")
    print("")
    print(f"VERDICT: {rec['verdict']}")
    print(rec["headline"])
    print("")
    print(f"JSON report: {json_path}")
    print(f"Markdown report: {md_path}")
    print("")
    print("Important: this validates current web/official retailer evidence, not guaranteed local shelf inventory.")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
