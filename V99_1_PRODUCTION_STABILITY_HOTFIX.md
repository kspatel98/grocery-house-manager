# Grocery House Manager V99.1 — Production Stability Hotfix

This hotfix keeps all V99 blue/cream/orange design and feature work, and focuses on the recurring login/data-access outage.

## Root causes confirmed

### 1. Backend import crash
`backend/app/api/houses.py` defined the house PATCH route with `payload: HouseUpdate` but did not import `HouseUpdate` from `app.schemas`. Python evaluates that annotation while importing the module, so FastAPI/Uvicorn can fail before the API starts. When the backend container restarts, Caddy returns 502/connection-refused/Docker-DNS errors and the whole app looks as though household data disappeared.

V99.1 imports `HouseUpdate` correctly.

### 2. Login was incorrectly blocked by a 5-second health probe
V99 called health endpoints with a hard 5000 ms Axios timeout and ran that probe before login. A brief proxy/CPU/network delay could prevent the real login request from even being attempted.

V99.1:
- removes the health preflight gate from login/registration;
- uses the real auth request as the authoritative check;
- replaces two sequential health requests with one `/health/ready` request;
- raises the advisory health timeout to 10 seconds;
- never shows raw `timeout of 5000ms exceeded` text;
- requires two consecutive failed health probes before showing the offline banner.

### 3. Runtime DB readiness could become stale
V99 stopped DB monitoring after startup succeeded. V99.1 keeps monitoring PostgreSQL every 30 seconds. A runtime SQLAlchemy connection loss now:
- marks data readiness unavailable;
- disposes stale pooled connections;
- returns retryable HTTP 503 instead of an opaque 500;
- automatically reconnects in the background.

Pool wait exhaustion also returns a controlled 503.

## PostgreSQL connection resilience

The app-side SQLAlchemy pool is now deliberately bounded and configurable:
- base pool: 5
- overflow: 3
- pool wait: 8 seconds
- recycle: 5 minutes
- connect timeout: 8 seconds
- TCP keepalives enabled
- `pool_pre_ping` retained

Do not increase these values until DigitalOcean PostgreSQL connection metrics show the current pool is actually too small.

## Production frontend hardening

The production frontend no longer runs Vite Preview and no longer recompiles the app whenever the container starts.

It now uses:
1. Node only in the Docker build stage;
2. `npm ci` with the committed lockfile;
3. static Nginx at runtime;
4. long cache for fingerprinted assets and no-cache for the SPA shell.

`package-lock.json` is no longer incorrectly excluded from the Docker build context.

This materially reduces steady-state Node memory/CPU usage on the Droplet.

## Public shell no longer depends on backend health

Frontend and Caddy can start even when the API/database is recovering. Users can still reach the GHM shell and receive a clear recovery message instead of the entire site disappearing.

## Slow-request diagnostics

Every API response now receives `X-GHM-Request-MS` and non-health requests taking >=2 seconds are logged with safe SQLAlchemy pool information.

A safe server diagnostic script is included:

```bash
bash scripts/diagnose_production.sh
```

It reports uptime/load, memory, disk, Docker container state/restart counts, public/local health timing, recent backend/Caddy errors, OOM evidence and reboot history. It does **not** print environment variables, API keys, passwords, tokens or `DATABASE_URL`.

## Build guard against another import crash

The backend Docker image now runs an import smoke test during image build. An undefined route type/import like the V99 `HouseUpdate` failure will make `docker compose build` fail before deployment rather than entering a production restart loop.

## DigitalOcean upgrade decision

Do not resize only because V99 showed 502/5-second timeout errors. At least one outage path was an application crash, and the 5-second login gate was an application UX defect.

Before deciding on resizing, collect:
- Droplet Insights (24h and 7d): CPU, load, memory, disk I/O/utilization, bandwidth;
- Managed PostgreSQL Insights (24h and 7d): CPU, memory, disk, connections, cache hit ratio, throughput, deadlocks;
- DB plan size/node count/region;
- `bash scripts/diagnose_production.sh` output during/after an incident.

## Deployment

Preserve the production `backend/.env` and `frontend/.env`. Do not replace either with `.env.example`.

```bash
docker compose down
docker compose build --no-cache backend frontend
docker compose up -d
docker compose ps -a
```

Then verify:

```bash
curl -i https://grocery-house-manager.com/api/health/live
curl -i https://grocery-house-manager.com/api/health/ready
```

Both should normally return HTTP 200.

Immediately inspect restart counts:

```bash
docker inspect -f 'backend restarts={{.RestartCount}} status={{.State.Status}} oom={{.State.OOMKilled}}' "$(docker compose ps -q backend)"
```

If anything is still unstable, run:

```bash
bash scripts/diagnose_production.sh
```

and share that output plus the DigitalOcean Insights screenshots. Do not share `.env` or credentials.
