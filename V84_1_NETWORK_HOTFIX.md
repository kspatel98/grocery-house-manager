# v84.1 Production API Network Hotfix

The production frontend now defaults to the same-origin `/api` route instead of
`http://localhost:8000`. Caddy proxies `/api/*` to the backend container.

This prevents a deployed browser from trying to contact port 8000 on the user's
own device when `VITE_API_URL` is absent or an old local `.env` is reused.

Production `docker-compose.yml` explicitly sets `VITE_API_URL=/api`.
Local `docker-compose.local.yml` explicitly sets `VITE_API_URL=http://localhost:8000`.
WebSocket URLs are also resolved correctly for relative `/api` production URLs.
