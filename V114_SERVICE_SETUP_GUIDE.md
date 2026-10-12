# GHM V114 — Third-Party Service Setup Guide

This guide is intentionally written for the current GHM production deployment. All keys belong in `backend/.env` on the server and must never be committed to GitHub.

## Recommended order

1. Geoapify — easiest, start free.
2. UPCDatabase — easy, inexpensive product fallback.
3. Serper — easy, official-store/web fallback.
4. AWS Textract — moderate, benchmark/fallback for receipts.
5. Instacart Developer Platform — code is already prepared, but production approval is the longest step.
6. Keep existing Tabscanner, Apify and DigitalOcean settings unless testing shows a reason to replace them.

---

## 1. Geoapify — Nearby Stores

### What GHM uses it for
- exact nearby supermarket discovery
- reverse geocoding to postal code/city
- store-location help for flyer results when Google Places is unavailable

### Get the key
1. Open `https://myprojects.geoapify.com/` and create an account.
2. Create a project such as `Grocery House Manager`.
3. Open the project's **API Keys** section.
4. Copy the generated API key.
5. Optionally restrict it where appropriate. GHM calls Geoapify only from the backend.

### Add to `backend/.env`

```env
GEOAPIFY_API_KEY=YOUR_KEY
GEOAPIFY_BASE_URL=https://api.geoapify.com
GEOAPIFY_RADIUS_METERS=8000
GEOAPIFY_MAX_RESULTS=12
GEOAPIFY_TIMEOUT_SECONDS=10
```

### Test

```bash
docker compose exec backend python -m app.scripts.provider_connectivity_check --live --postal-code L9C3M4
```

Expected: `[PASS] Geoapify returned ... nearby supermarket result(s).`

---

## 2. UPCDatabase — Product Lookup fallback

### What GHM uses it for
Open Food Facts remains first. UPCDatabase is used when the universal Open Food Facts lookup has no useful result.

### Get the key
1. Go to `https://upcdatabase.org/` and create an account.
2. In the account/dashboard, register an application/API key.
3. Copy the OAuth/API token from the API Keys area.
4. Free/Hobbyist can be used to test; Standard is the practical small-production tier if the free allowance is too small.

### Add to `backend/.env`

```env
UPCDATABASE_API_KEY=YOUR_TOKEN
UPCDATABASE_BASE_URL=https://api.upcdatabase.org
UPCDATABASE_TIMEOUT_SECONDS=12
```

### Test

```bash
docker compose exec backend python -m app.scripts.provider_connectivity_check --live
```

Expected: `[PASS] UPCDatabase account API connected (...)`.

Then test **Product Lookup** in GHM with a real UPC that Open Food Facts does not already know.

---

## 3. Serper.dev — Official retailer/web-search fallback

### What GHM uses it for
- finding official retailer product pages
- store item-number/name searches when a retailer does not expose an easy product API
- fallback evidence, clearly labelled as web/store-page evidence rather than guaranteed local shelf price

### Get the key
1. Go to `https://serper.dev/` and create an account.
2. Use the free trial queries first if available on your account.
3. Open the dashboard/API key area and copy the API key.
4. Buy credits only when needed; Serper uses a top-up model rather than forcing a monthly subscription.

### Add to `backend/.env`

```env
STORE_LOOKUP_WEB_SEARCH_ENABLED=true
SERPER_API_KEY=YOUR_KEY
```

You can leave these blank if Serper is your provider:

```env
GOOGLE_SEARCH_API_KEY=
GOOGLE_SEARCH_CX=
JINA_API_KEY=
BRAVE_SEARCH_API_KEY=
```

### Test

```bash
docker compose exec backend python -m app.scripts.provider_connectivity_check --live
```

The live test consumes one Serper query.

Then test Product Lookup with a store name such as Walmart/Costco and verify GHM links only to the intended official retailer domain.

---

## 4. AWS Textract AnalyzeExpense — Receipt OCR fallback/benchmark

### Recommended initial setup
Keep Tabscanner primary and use Textract only as a fallback while you benchmark real Canadian grocery receipts.

### Create AWS access
1. Create/sign in to an AWS account: `https://aws.amazon.com/`.
2. Open **IAM**.
3. Create a dedicated user for GHM programmatic access, e.g. `ghm-textract`.
4. Give it only the permission GHM needs for production receipt analysis. A minimal policy can be:

```json
{
  "Version": "2012-10-17",
  "Statement": [
    {
      "Effect": "Allow",
      "Action": ["textract:AnalyzeExpense"],
      "Resource": "*"
    }
  ]
}
```

5. Create an access key for the GHM backend and store the Access Key ID/Secret securely.
6. Use `ca-central-1` unless you intentionally choose another supported region.

### Add to `backend/.env`

```env
AWS_TEXTRACT_ENABLED=true
AWS_ACCESS_KEY_ID=YOUR_ACCESS_KEY_ID
AWS_SECRET_ACCESS_KEY=YOUR_SECRET_ACCESS_KEY
AWS_SESSION_TOKEN=
AWS_REGION=ca-central-1
AWS_TEXTRACT_TIMEOUT_SECONDS=30

# Keep Tabscanner primary initially:
RECEIPT_OCR_PROVIDER=tabscanner
RECEIPT_OCR_FALLBACK_PROVIDER=aws_textract
RECEIPT_OCR_FALLBACK_ON_EMPTY=true
```

### Test credentials without scanning

```bash
docker compose exec backend python -m app.scripts.provider_connectivity_check --live
```

The check validates AWS credentials without intentionally consuming an AnalyzeExpense call.

### Quality test before changing primary provider
Run the same 30–50 Canadian grocery receipts through Tabscanner and AWS Textract. Compare:
- merchant
- date
- subtotal/tax/total
- line-item detection
- quantity
- unit price
- discounts
- weighted products
- correction rate
- latency

Do not make AWS primary only because it is cheaper; make it primary only if accuracy is acceptable for GHM.

To make AWS primary later:

```env
RECEIPT_OCR_PROVIDER=aws_textract
RECEIPT_OCR_FALLBACK_PROVIDER=tabscanner
```

---

## 5. Instacart Developer Platform

### What V114 implements
- nearby Canadian retailer banners by postal code
- an **Open on Instacart** option for an existing GHM shopping list
- GHM sends name, quantity/measurement, UPC and brand hints when available
- Instacart hosts the shopping page; the user chooses a retailer and confirms actual availability/package/price there

This is intentionally not presented as an unrestricted raw local-price database.

### Development access
1. Go to the Instacart Developer Platform and apply/sign up: `https://docs.instacart.com/developer_platform_api/get_started/overview/`.
2. Open the Developer Dashboard.
3. Go to **API Keys**.
4. Create a **Development** API key.
5. Copy it immediately and keep it secret.

### Add development key to `backend/.env`

```env
INSTACART_API_KEY=keys.YOUR_DEVELOPMENT_KEY
INSTACART_ENVIRONMENT=development
INSTACART_TIMEOUT_SECONDS=15
INSTACART_COUNTRY_CODE=CA
```

Restart backend and test:

```bash
docker compose up -d --build backend

docker compose exec backend python -m app.scripts.provider_connectivity_check --live --postal-code L9C3M4
```

Then open an active GHM shopping list. If the integration is configured, GHM shows **Shop this list with Instacart**.

### Production approval
1. Build/test the integration with the Development endpoint.
2. Follow Instacart's pre-launch/integration messaging guidelines.
3. Request/create a Production API key in the Developer Dashboard.
4. Instacart reviews the integration; the Production key does not work until approved.
5. After approval, change only:

```env
INSTACART_API_KEY=keys.YOUR_PRODUCTION_KEY
INSTACART_ENVIRONMENT=production
```

No frontend code change is required.

---

## 6. Apify — existing GHM integration

If your current Apify setup already works, do not replace it during the V114 deployment.

GHM currently uses it for:
- Canadian grocery price comparison
- weekly flyer intelligence

Typical variables:

```env
APIFY_API_TOKEN=YOUR_TOKEN
APIFY_CANADA_PRICE_ACTOR_ID=sunny_eternity/canada-grocery-price-comparison
APIFY_FLYER_ACTOR_ID=scrapersdelight/flipp-flyer-digest
```

Get/check the token in Apify Console under **Settings -> API & Integrations**.

Test:

```bash
docker compose exec backend python -m app.scripts.provider_connectivity_check --live
```

Keep GHM caching enabled; do not call actors for every page view.

---

## 7. Tabscanner — existing primary receipt scanner

If already configured, keep it while benchmarking AWS.

1. Sign in at `https://dashboard.tabscanner.com/`.
2. Copy the API key from API details.
3. Keep the key backend-only.

```env
RECEIPT_OCR_PROVIDER=tabscanner
TABSCANNER_API_KEY=YOUR_KEY
TABSCANNER_REGION=ca
TABSCANNER_DOCUMENT_TYPE=receipt
```

Check remaining credits:

```bash
docker compose exec backend python -m app.scripts.provider_connectivity_check --live
```

---

## 8. DigitalOcean — keep your current infrastructure

V114 does not require a larger Droplet simply because these integrations were added. Most calls are outbound HTTPS requests.

### Database
Use your DigitalOcean Managed PostgreSQL **Connection Pool/PgBouncer URL**, not the direct database endpoint, in `DATABASE_URL`.

Keep the V111 WebSocket pool fix; do not increase SQLAlchemy pool size just to hide a connection leak.

### DigitalOcean AI / Kitchen Vision
Keep the existing backend-only settings:

```env
DIGITALOCEAN_AI_ENABLED=true
DIGITALOCEAN_INFERENCE_KEY=YOUR_KEY
DIGITALOCEAN_VISION_MODEL=nemotron-nano-12b-v2-vl
```

or your existing Agent Platform configuration if that is what you are currently using.

---

# Deploy V114 after adding keys

Do not commit `backend/.env`.

```bash
cd /var/www/grocery-house-manager

git pull origin main

docker compose down --remove-orphans

docker compose build --no-cache frontend backend

docker compose up -d --force-recreate

docker compose ps
```

Verify version:

```bash
docker compose exec frontend sh -lc 'cat dist/version.json'
```

Expected: `V114`.

Check configuration only:

```bash
docker compose exec backend python -m app.scripts.provider_connectivity_check
```

Then make the small live checks:

```bash
docker compose exec backend python -m app.scripts.provider_connectivity_check --live --postal-code L9C3M4
```

Finally run your V113/V112 QA suite again because external providers can change response quality even when the app code is correct.
