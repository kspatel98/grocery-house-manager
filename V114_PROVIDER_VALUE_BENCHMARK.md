# GHM Product Data Provider Benchmark

This benchmark answers one question:

> Are GHM's existing Open Food Facts + UPCDatabase + retailer-site + Serper results good enough, or should we trial DataForSEO?

It is designed for **V114+** and assumes the user's GHM account may be completely empty.

## Why no account is required

The benchmark runs directly against the same provider adapters used by GHM. It does not create a house, inventory, shopping list, receipt, expense, review, or any other database record. This avoids plan gates and makes the result independent of the test account's state.

## Install the script into V114

From the project root on the server:

```bash
cp /path/to/ghm_provider_value_benchmark.py backend/app/scripts/provider_value_benchmark.py
```

If the file is already committed in Git, just deploy normally.

## Check keys

In `backend/.env`:

```env
UPCDATABASE_API_KEY=...
SERPER_API_KEY=...
STORE_LOOKUP_WEB_SEARCH_ENABLED=true
```

Do not commit `.env`.

## Quick run

About 15 identity searches + at most 20 Serper queries:

```bash
docker compose exec backend \
  python -m app.scripts.provider_value_benchmark --quick --output-dir /tmp
```

## Full run

30 identity cases + at most 40 Serper queries:

```bash
docker compose exec backend \
  python -m app.scripts.provider_value_benchmark --output-dir /tmp
```

The script prints every test and a final verdict:

- `CURRENT_STACK_SUFFICIENT` — do not add DataForSEO yet.
- `BORDERLINE_IMPROVE_FIRST` — improve weak store parsers/caching and re-run once.
- `DATAFORSEO_TRIAL_RECOMMENDED` — current stack is not reliable enough; use DataForSEO's trial/test credit on the failed cases before paying for it.

## Copy the report out of Docker

Find the backend container name:

```bash
docker compose ps
```

Then either read the Markdown report directly:

```bash
docker compose exec backend sh -lc 'cat /tmp/ghm-provider-benchmark-*.md'
```

or copy it to the host:

```bash
CID=$(docker compose ps -q backend)
docker cp "$CID":/tmp/ghm-provider-benchmark-YYYYMMDD-HHMMSS.json ./
docker cp "$CID":/tmp/ghm-provider-benchmark-YYYYMMDD-HHMMSS.md ./
```

## What is tested

### Product identity

30 branded, Canadian/store-brand, and hard/generic products are tested against:

1. Open Food Facts
2. UPCDatabase
3. their combined coverage

The report also shows **UPCDatabase incremental wins** — products that UPCDatabase correctly finds when Open Food Facts does not. This tells you whether the $10/month UPCDatabase subscription is actually adding useful coverage.

### Retailer / current web-price evidence

40 product/store cases are tested across:

- Walmart Canada
- No Frills
- Real Canadian Superstore
- Loblaws
- Metro
- Food Basics
- FreshCo
- Costco Canada

GHM first tries its direct retailer-page parser. If that is insufficient, the benchmark spends exactly **one Serper query** for that case, filters to the retailer's official domain, and runs the result through GHM's current page parser.

The final metrics include:

- official retailer page found
- relevant product match
- numeric web price found
- package-size evidence
- comparison-ready result
- direct-store wins vs Serper wins
- per-retailer success rate
- median/p95 latency
- exact number of Serper queries consumed

## Recommendation thresholds

To avoid adding another paid dependency unnecessarily, the standard is deliberately high.

The current stack is considered strong enough without DataForSEO when it reaches roughly:

- combined product identity: **>= 90%**
- official retailer page coverage: **>= 90%**
- relevant product matching: **>= 90%**
- numeric web-price coverage: **>= 85%**
- comparison-ready results: **>= 85%**

A result below these thresholds does not prove DataForSEO is better. It means the current stack is not strong enough by itself and **DataForSEO should be trialed against the exact failed cases**.

## Important limitation

Serper/retailer web prices are **web evidence**, not guaranteed local shelf inventory for a specific physical store. GHM should continue to display the source and freshness of every price instead of presenting all web prices as verified local prices.
