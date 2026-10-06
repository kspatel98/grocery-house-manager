# GHM v103 — Backend Startup & DNS Hotfix

## What changed

- Fixed the production-blocking `NameError: HouseUpdate is not defined` in `backend/app/api/houses.py` by importing the existing `HouseUpdate` schema.
- Removed hard-coded `8.8.8.8` / `1.1.1.1` DNS overrides from Docker Compose so production containers inherit the Droplet/Docker resolver. This is safer for DigitalOcean private managed-service hostnames that may require the VPC-local resolver.
- Removed the same unnecessary DNS override from local Compose so Docker service discovery uses the native Docker resolver path.
- Strengthened `scripts_validate_release.sh` with a FastAPI import smoke test. This catches import-time crashes that Python bytecode compilation alone does not detect.

## Deployment

```bash
cd /var/www/grocery-house-manager

docker compose down
docker compose build --no-cache backend frontend
docker compose up -d

docker compose ps
docker compose logs backend --tail=150
```

Expected backend state after startup: `Up ... (healthy)`.

## Important production note

This package intentionally does not include real `.env` files or production credentials. Keep the existing server-side `backend/.env` and `frontend/.env` when deploying unless you explicitly intend to replace them.
