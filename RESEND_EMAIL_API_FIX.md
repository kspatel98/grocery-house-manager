# Password reset email fix: SMTP blocked, use Resend HTTPS API

Your backend log showed:

```text
TimeoutError: timed out
hint=SMTP connection timed out. The server/provider may be blocking outbound SMTP port 587.
```

This means Gmail SMTP is not reachable from the backend container. It is not a Gmail app-password problem.

## Recommended production fix

Use Resend's HTTPS Email API. It sends through `https://api.resend.com/emails` on port 443, avoiding SMTP ports 587/465.

## Steps

1. Create a Resend account.
2. Verify the domain `grocery-house-manager.com` in Resend.
3. Add the DNS records that Resend gives you.
4. Create an API key in Resend.
5. Put this in `backend/.env`:

```env
EMAIL_PROVIDER=resend
RESEND_API_KEY=re_your_resend_api_key_here
RESEND_FROM_EMAIL=support@grocery-house-manager.com
RESEND_FROM_NAME=Grocery House Manager
```

You can leave the SMTP variables in `.env`; they will not be used when `EMAIL_PROVIDER=resend`.

6. Rebuild and restart:

```bash
docker compose down
docker compose up -d --build
```

7. Test HTTPS access from the backend container:

```bash
docker compose exec backend python -m app.scripts.email_api_network_check
```

8. Send a real test email:

```bash
docker compose exec backend python -m app.scripts.test_resend your@email.com
```

## If Resend also fails

If `api.resend.com:443` fails, your backend container has a broader outbound HTTPS/DNS problem. Fix Docker/server networking first.

## SMTP fallback

If you later move to a host that allows SMTP 587, you can switch back:

```env
EMAIL_PROVIDER=smtp
SMTP_HOST=smtp.gmail.com
SMTP_PORT=587
SMTP_USERNAME=kartik_patel_98@grocery-house-manager.com
SMTP_PASSWORD=your_16_digit_app_password
SMTP_FROM_EMAIL=kartik_patel_98@grocery-house-manager.com
SMTP_FROM_NAME=Grocery House Manager
SMTP_USE_TLS=true
SMTP_FORCE_IPV4=true
```
