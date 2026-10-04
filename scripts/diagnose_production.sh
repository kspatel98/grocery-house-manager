#!/usr/bin/env sh
set +e

printf '\n=== GHM production diagnostics ===\n'
date -Is 2>/dev/null || date
printf '\n=== Host uptime / load ===\n'
uptime
printf '\n=== Memory ===\n'
free -h 2>/dev/null || true
printf '\n=== Disk ===\n'
df -h / 2>/dev/null || df -h
printf '\n=== Docker services ===\n'
docker compose ps -a 2>/dev/null || docker ps -a
printf '\n=== Container resource snapshot ===\n'
docker stats --no-stream 2>/dev/null || true
printf '\n=== Container restart counts ===\n'
for svc in backend frontend caddy; do
  cid=$(docker compose ps -q "$svc" 2>/dev/null)
  if [ -n "$cid" ]; then
    printf '%s: ' "$svc"
    docker inspect -f 'restart_count={{.RestartCount}} started={{.State.StartedAt}} status={{.State.Status}} oom_killed={{.State.OOMKilled}}' "$cid" 2>/dev/null
  fi
done
printf '\n=== Public health timing ===\n'
for path in live ready; do
  curl -sS -o /tmp/ghm_health_${path}.txt -w "$path http=%{http_code} total=%{time_total}s connect=%{time_connect}s ttfb=%{time_starttransfer}s\n" --max-time 15 "https://grocery-house-manager.com/api/health/$path" 2>&1
  cat /tmp/ghm_health_${path}.txt 2>/dev/null
  printf '\n'
done
printf '\n=== Local backend health timing ===\n'
for path in live ready; do
  docker compose exec -T backend python - "$path" <<'PY' 2>/dev/null
import sys, time, urllib.request
path=sys.argv[1]
start=time.perf_counter()
try:
    with urllib.request.urlopen(f'http://127.0.0.1:8000/health/{path}', timeout=10) as r:
        body=r.read().decode('utf-8','replace')
        print(f'{path} http={r.status} total={time.perf_counter()-start:.3f}s body={body[:500]}')
except Exception as exc:
    print(f'{path} FAILED after {time.perf_counter()-start:.3f}s: {type(exc).__name__}: {exc}')
PY
done
printf '\n=== Recent backend warnings/errors/slow requests ===\n'
docker compose logs --since=2h backend 2>&1 | grep -Ei 'slow request|database|operationalerror|timeout|too many clients|connection|pool|oom|killed|traceback|error' | tail -n 180
printf '\n=== Recent Caddy proxy errors ===\n'
docker compose logs --since=2h caddy 2>&1 | grep -Ei 'error|timeout|upstream|dial|reset|refused|502|503|504' | tail -n 120
printf '\n=== Kernel OOM evidence ===\n'
(dmesg -T 2>/dev/null || true) | grep -Ei 'out of memory|oom-killer|killed process' | tail -n 80
printf '\n=== Recent reboot/shutdown history ===\n'
last -x 2>/dev/null | head -n 20
printf '\n=== Done ===\n'
printf 'This script intentionally does not print environment variables, passwords, API keys, or DATABASE_URL.\n'
