from __future__ import annotations

from email.message import EmailMessage
import smtplib
from app.core.config import settings


def smtp_configured() -> bool:
    return bool(settings.smtp_host and settings.smtp_from_email)


def send_password_reset_code(to_email: str, full_name: str | None, code: str) -> bool:
    """Send a password reset verification code.

    Returns False when SMTP is not configured so the caller can still return a
    safe generic response. The app never exposes whether an email exists.
    """
    if not smtp_configured():
        return False

    message = EmailMessage()
    from_name = settings.smtp_from_name or "Grocery House Manager"
    message["From"] = f"{from_name} <{settings.smtp_from_email}>"
    message["To"] = to_email
    message["Subject"] = "Your Grocery House Manager password reset code"

    greeting = full_name.strip() if full_name else "there"
    body = f"""Hi {greeting},

Your Grocery House Manager password reset verification code is:

{code}

This code expires in 15 minutes. If you did not request a password reset, you can ignore this email.

SupremDas Group
Grocery House Manager
"""
    message.set_content(body)

    if settings.smtp_use_tls:
        with smtplib.SMTP(settings.smtp_host, settings.smtp_port, timeout=15) as smtp:
            smtp.starttls()
            if settings.smtp_username:
                smtp.login(settings.smtp_username, settings.smtp_password or "")
            smtp.send_message(message)
    else:
        with smtplib.SMTP_SSL(settings.smtp_host, settings.smtp_port, timeout=15) as smtp:
            if settings.smtp_username:
                smtp.login(settings.smtp_username, settings.smtp_password or "")
            smtp.send_message(message)
    return True
