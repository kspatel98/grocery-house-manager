# SMTP Network Fix

The backend log showed:

```text
OSError: [Errno 101] Network is unreachable
```

This means the backend container could not open a TCP connection to Gmail SMTP. The app did not reach the Gmail login step yet, so this is not primarily an app-password problem.

## What changed in this version

1. `backend/app/utils/emailer.py`
   - Added stronger SMTP configuration checks.
   - Added clearer backend log hints.
   - Added IPv4-forced SMTP client to avoid Docker IPv6 route failures.

2. `backend/app/core/config.py`
   - Added `SMTP_FORCE_IPV4=true` setting.

3. `docker-compose.yml` and `docker-compose.local.yml`
   - Added explicit DNS servers for the backend container.

4. `backend/app/scripts/smtp_network_check.py`
   - Added a container-side diagnostic script.

5. Admin dashboard
   - Email status now shows port, missing settings, and IPv4 forcing status.

## Required `.env` values

Start with this exact From email first:

```env
SMTP_HOST=smtp.gmail.com
SMTP_PORT=587
SMTP_USERNAME=kartik_patel_98@grocery-house-manager.com
SMTP_PASSWORD=your_16_digit_google_app_password
SMTP_FROM_EMAIL=kartik_patel_98@grocery-house-manager.com
SMTP_FROM_NAME=Grocery House Manager
SMTP_USE_TLS=true
SMTP_FORCE_IPV4=true
```

After this works, you can switch `SMTP_FROM_EMAIL` to `support@grocery-house-manager.com` only if that address is properly configured as a Gmail alias/send-as address.

## Test from inside Docker

After deploying/restarting, run:

```bash
docker compose exec backend python -m app.scripts.smtp_network_check
```

Or run only the TCP check without sending:

```bash
docker compose exec backend python - <<'PY'
import socket
host='smtp.gmail.com'; port=587
print(socket.getaddrinfo(host, port, socket.AF_INET, socket.SOCK_STREAM))
s=socket.create_connection((host, port), timeout=15)
print('connected:', s.getpeername())
s.close()
PY
```

## If it still says Network is unreachable

The problem is outside the app code. Check:

- Your VPS/firewall outbound rules.
- Docker daemon networking.
- Hosting provider SMTP restrictions.
- Whether outbound TCP port `587` is blocked.
- Whether the host itself can reach the internet.

Run on the server host:

```bash
curl -I https://www.google.com
nc -vz smtp.gmail.com 587
```

If `nc` is missing:

```bash
python3 - <<'PY'
import socket
socket.create_connection(('smtp.gmail.com', 587), timeout=15)
print('host can reach Gmail SMTP')
PY
```

If the host fails too, fix server firewall/provider networking. If the host works but Docker fails, fix Docker networking.
