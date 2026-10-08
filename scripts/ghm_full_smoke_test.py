#!/usr/bin/env python3
"""One-login GHM production smoke test.

Safe by default: it does not create/delete inventory, expenses, receipts, reviews,
or subscriptions. It verifies auth, core household reads, premium route responses,
provider capability states, and a short concurrent-read reliability check.

Usage:
  python scripts/ghm_full_smoke_test.py
  python scripts/ghm_full_smoke_test.py --base-url https://grocery-house-manager.com/api --house-id 2
  python scripts/ghm_full_smoke_test.py --external --postal-code L9C3M4

The password is read with getpass and is never written to the report.
"""
from __future__ import annotations

import argparse
import getpass
import json
import ssl
import sys
import time
from concurrent.futures import ThreadPoolExecutor, as_completed
from dataclasses import dataclass, asdict
from datetime import datetime, timezone
from pathlib import Path
from typing import Any
from urllib.error import HTTPError, URLError
from urllib.parse import urlencode
from urllib.request import Request, urlopen


@dataclass
class Result:
    area: str
    name: str
    status: str
    http: int | None
    latency_ms: float
    detail: str = ""


class Client:
    def __init__(self, base_url: str):
        self.base = base_url.rstrip("/")
        self.token = ""
        self.ctx = ssl.create_default_context()

    def request(self, method: str, path: str, *, params: dict[str, Any] | None = None, body: Any = None, timeout: float = 20.0, headers: dict[str, str] | None = None):
        url = self.base + path
        if params:
            clean = {k: v for k, v in params.items() if v is not None and v != ""}
            if clean:
                url += ("&" if "?" in url else "?") + urlencode(clean, doseq=True)
        payload = None
        req_headers = {"Accept": "application/json", "Cache-Control": "no-cache"}
        if body is not None:
            payload = json.dumps(body).encode("utf-8")
            req_headers["Content-Type"] = "application/json"
        if self.token:
            req_headers["Authorization"] = f"Bearer {self.token}"
        if headers:
            req_headers.update(headers)
        req = Request(url, data=payload, headers=req_headers, method=method.upper())
        started = time.perf_counter()
        try:
            with urlopen(req, timeout=timeout, context=self.ctx) as response:
                raw = response.read().decode("utf-8", "replace")
                elapsed = (time.perf_counter() - started) * 1000
                try:
                    data = json.loads(raw) if raw else None
                except json.JSONDecodeError:
                    data = raw
                return response.status, data, elapsed
        except HTTPError as exc:
            raw = exc.read().decode("utf-8", "replace")
            elapsed = (time.perf_counter() - started) * 1000
            try:
                data = json.loads(raw) if raw else None
            except json.JSONDecodeError:
                data = raw
            return exc.code, data, elapsed
        except (URLError, TimeoutError, OSError) as exc:
            elapsed = (time.perf_counter() - started) * 1000
            return None, {"detail": str(exc)}, elapsed


def summarize(data: Any, max_len: int = 180) -> str:
    if data is None:
        return ""
    if isinstance(data, dict):
        if data.get("premium_required"):
            return "premium_required=true"
        for key in ("message", "detail", "status", "connection_status"):
            if data.get(key):
                text = str(data[key])
                return text[:max_len]
        return ", ".join(list(data.keys())[:8])
    if isinstance(data, list):
        return f"{len(data)} item(s)"
    return str(data)[:max_len]


def classify(code: int | None, data: Any, allowed_locked: bool = True) -> str:
    if code is None:
        return "FAIL"
    if 200 <= code < 300:
        if isinstance(data, dict) and data.get("premium_required"):
            return "LOCKED"
        return "PASS"
    if allowed_locked and code in {402, 403}:
        return "LOCKED"
    if code == 404:
        return "FAIL"
    return "FAIL"


def add(results: list[Result], client: Client, area: str, name: str, method: str, path: str, **kwargs) -> Any:
    code, data, ms = client.request(method, path, **kwargs)
    status = classify(code, data)
    results.append(Result(area, name, status, code, round(ms, 1), summarize(data)))
    icon = {"PASS": "✓", "LOCKED": "🔒", "SKIP": "-", "FAIL": "✗"}.get(status, "?")
    print(f"{icon} {area:12} {name:34} HTTP={code or '-':>3} {ms:7.1f} ms  {summarize(data)}")
    return data


def main() -> int:
    parser = argparse.ArgumentParser(description="One-login Grocery House Manager smoke test")
    parser.add_argument("--base-url", default="https://grocery-house-manager.com/api")
    parser.add_argument("--email")
    parser.add_argument("--password")
    parser.add_argument("--house-id", type=int)
    parser.add_argument("--postal-code", default="")
    parser.add_argument("--external", action="store_true", help="Also call live provider-backed read/search features. May consume provider quota but never starts checkout.")
    parser.add_argument("--concurrency", type=int, default=8, help="Concurrent authenticated read requests for pool/reliability check (default 8).")
    args = parser.parse_args()

    email = args.email or input("GHM email: ").strip()
    password = args.password or getpass.getpass("GHM password: ")
    client = Client(args.base_url)
    results: list[Result] = []

    print(f"\nTesting {client.base}")
    add(results, client, "Core", "API live", "GET", "/health/live")
    login_code, login_data, login_ms = client.request("POST", "/auth/login", body={"email": email, "password": password})
    if not (login_code and 200 <= login_code < 300 and isinstance(login_data, dict) and login_data.get("access_token")):
        results.append(Result("Auth", "Login", "FAIL", login_code, round(login_ms, 1), summarize(login_data)))
        print(f"✗ Auth         Login                              HTTP={login_code or '-'} {login_ms:.1f} ms {summarize(login_data)}")
        return 2
    client.token = login_data["access_token"]
    results.append(Result("Auth", "Login", "PASS", login_code, round(login_ms, 1), "token issued"))
    print(f"✓ Auth         Login                              HTTP={login_code} {login_ms:.1f} ms token issued")

    bootstrap = add(results, client, "Core", "Account bootstrap", "GET", "/account/bootstrap")
    houses = add(results, client, "House", "House list", "GET", "/houses")
    add(results, client, "Billing", "Plans", "GET", "/billing/plans")
    add(results, client, "Billing", "Subscription", "GET", "/billing/me")
    add(results, client, "Billing", "Premium Try", "GET", "/billing/premium-try")
    add(results, client, "Billing", "Receipt scan packs", "GET", "/billing/receipt-scan-packs")
    add(results, client, "Reviews", "Review summary", "GET", "/reviews/summary")
    add(results, client, "Reviews", "Public reviews", "GET", "/reviews/public")
    add(results, client, "Reviews", "My review", "GET", "/reviews/mine")
    market_caps = add(results, client, "Market", "Market capabilities", "GET", "/market/capabilities")
    food_caps = add(results, client, "Food", "Food capabilities", "GET", "/food/capabilities")
    add(results, client, "Recipes", "Community recipes", "GET", "/recipes/community")
    add(results, client, "Templates", "Household templates", "GET", "/templates")

    if not isinstance(houses, list) or not houses:
        print("\nNo house is available on this account, so house-scoped tests were skipped.")
        house_id = None
    else:
        ids = [int(row.get("id")) for row in houses if isinstance(row, dict) and row.get("id")]
        house_id = args.house_id if args.house_id in ids else None
        if house_id is None:
            if len(ids) == 1:
                house_id = ids[0]
            else:
                print("\nAvailable houses:")
                for index, row in enumerate(houses, 1):
                    print(f"  {index}. {row.get('name')} (id={row.get('id')}, role={row.get('role')})")
                choice = input(f"Choose house [1-{len(houses)}] (default 1): ").strip() or "1"
                try:
                    house_id = ids[max(0, min(len(ids)-1, int(choice)-1))]
                except Exception:
                    house_id = ids[0]

    active_list_id = None
    if house_id:
        H = f"/houses/{house_id}"
        add(results, client, "House", "House details", "GET", H)
        add(results, client, "House", "Owner plan", "GET", H + "/plan")
        add(results, client, "House", "Members", "GET", H + "/members")
        add(results, client, "House", "Activity", "GET", H + "/activities")
        add(results, client, "House", "House Chat", "GET", H + "/chat")
        add(results, client, "Inventory", "Sections", "GET", H + "/sections")
        add(results, client, "Inventory", "Products", "GET", H + "/products", params={"limit": 25})
        shopping = add(results, client, "Shopping", "Shopping lists", "GET", H + "/shopping-lists")
        active = add(results, client, "Shopping", "Active shopping list", "GET", H + "/shopping-lists/active")
        if isinstance(active, dict) and active.get("id"):
            active_list_id = int(active["id"])
        elif isinstance(shopping, list):
            row = next((x for x in shopping if isinstance(x, dict) and not x.get("is_done") and x.get("id")), None)
            active_list_id = int(row["id"]) if row else None
        add(results, client, "Receipts", "Receipt history", "GET", H + "/receipts")
        add(results, client, "Receipts", "Scan usage", "GET", H + "/receipts/scan-usage")
        expenses = add(results, client, "Money", "Money overview", "GET", H + "/expenses")
        add(results, client, "Money", "Expense categories", "GET", H + "/expenses/categories")
        if isinstance(expenses, dict):
            months = expenses.get("months") or expenses.get("month_states") or []
            if isinstance(months, list) and months:
                month_key = months[0].get("month_key") or months[0].get("key")
                if month_key:
                    add(results, client, "Money", "Account/month summary", "GET", H + f"/expenses/months/{month_key}/summary")

        # Read-only household intelligence. Locked responses are reported rather than treated as failures.
        for name, path in [
            ("Savings summary", f"/insights/houses/{house_id}/savings"),
            ("Weekly assistant", f"/insights/houses/{house_id}/weekly-assistant"),
            ("Savings ledger", f"/insights/houses/{house_id}/savings-ledger"),
            ("Recall Guardian", f"/insights/houses/{house_id}/recall-guardian"),
            ("Receipt Guardian", f"/insights/houses/{house_id}/receipt-guardian"),
            ("Smart Stock-Up", f"/insights/houses/{house_id}/stock-up"),
            ("Autopilot overview", f"/insights/houses/{house_id}/autopilot"),
            ("Autopilot controls", f"/insights/houses/{house_id}/autopilot-controls"),
            ("Community price pulse", f"/insights/houses/{house_id}/community-price-pulse"),
            ("Kitchen zones", f"/ai/houses/{house_id}/kitchen-zones"),
            ("Kitchen digital twin", f"/ai/houses/{house_id}/digital-twin"),
        ]:
            add(results, client, "Smart", name, "GET", path)

        if active_list_id:
            add(results, client, "Smart", "Whole-list comparison", "GET", f"/insights/houses/{house_id}/shopping-lists/{active_list_id}/basket-comparison")
            add(results, client, "Smart", "Nearby store suggestions", "GET", f"/market/houses/{house_id}/shopping-lists/{active_list_id}/suggestions")
        else:
            results.append(Result("Smart", "Whole-list comparison", "SKIP", None, 0, "No active shopping list"))
            results.append(Result("Smart", "Nearby store suggestions", "SKIP", None, 0, "No active shopping list"))
            print("- Smart        Whole-list comparison              SKIP no active shopping list")
            print("- Smart        Nearby store suggestions           SKIP no active shopping list")

        # Product lookup with no query validates entitlement/route without external search spend.
        add(results, client, "Market", "Product Lookup route", "GET", f"/market/houses/{house_id}/product-lookup")

        if args.external:
            print("\nExternal provider checks enabled (these may consume configured provider quota).")
            add(results, client, "External", "Product lookup live", "GET", f"/market/houses/{house_id}/product-lookup", params={"query": "milk"}, timeout=35)
            add(results, client, "External", "Live price compare", "POST", f"/market/houses/{house_id}/price-compare", body={"items": ["milk", "eggs"], "postal_code": args.postal_code or None}, timeout=110)
            if args.postal_code:
                add(results, client, "External", "Flyer merchants", "GET", f"/market/houses/{house_id}/flyer-merchants", params={"postal_code": args.postal_code}, timeout=110)
                add(results, client, "External", "Weekly flyers", "GET", f"/market/houses/{house_id}/flyers", params={"postal_code": args.postal_code, "query": "milk"}, timeout=110)
                add(results, client, "External", "Food Tonight", "GET", f"/food/houses/{house_id}/suggestions", params={"postal_code": args.postal_code, "mode": "restaurant"}, timeout=35)
            else:
                print("- External     Flyers / Food Tonight               SKIP add --postal-code to test localized providers")

        # Short authenticated concurrency test for the pool regression that caused V110 failures.
        concurrency = max(1, min(args.concurrency, 16))
        print(f"\nReliability: {concurrency} concurrent authenticated household reads")
        def one_read(_: int):
            return client.request("GET", H + "/members", timeout=15)
        started = time.perf_counter()
        outcomes = []
        with ThreadPoolExecutor(max_workers=concurrency) as executor:
            futures = [executor.submit(one_read, i) for i in range(concurrency)]
            for future in as_completed(futures):
                outcomes.append(future.result())
        total_ms = (time.perf_counter() - started) * 1000
        ok = sum(1 for code, _, _ in outcomes if code and 200 <= code < 300)
        max_ms = max((ms for _, _, ms in outcomes), default=0)
        status = "PASS" if ok == len(outcomes) else "FAIL"
        results.append(Result("Reliability", f"Concurrent reads x{concurrency}", status, 200 if status == "PASS" else None, round(max_ms, 1), f"{ok}/{len(outcomes)} passed; wall={total_ms:.1f}ms"))
        print(f"{'✓' if status == 'PASS' else '✗'} Reliability  Concurrent reads x{concurrency:<15} {ok}/{len(outcomes)} passed; max={max_ms:.1f} ms")

    failures = [r for r in results if r.status == "FAIL"]
    locked = [r for r in results if r.status == "LOCKED"]
    skipped = [r for r in results if r.status == "SKIP"]
    passed = [r for r in results if r.status == "PASS"]
    report = {
        "generated_at": datetime.now(timezone.utc).isoformat(),
        "base_url": client.base,
        "email": email,
        "house_id": house_id,
        "summary": {"pass": len(passed), "locked": len(locked), "skip": len(skipped), "fail": len(failures)},
        "capabilities": {"market": market_caps, "food": food_caps},
        "results": [asdict(row) for row in results],
    }
    output = Path(f"ghm-smoke-report-{datetime.now().strftime('%Y%m%d-%H%M%S')}.json")
    output.write_text(json.dumps(report, indent=2, default=str), encoding="utf-8")
    print("\nSummary")
    print(f"PASS={len(passed)} LOCKED={len(locked)} SKIP={len(skipped)} FAIL={len(failures)}")
    print(f"Report: {output.resolve()}")
    if failures:
        print("\nFailures:")
        for row in failures:
            print(f"- {row.area} / {row.name}: HTTP={row.http} {row.detail}")
        return 1
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
