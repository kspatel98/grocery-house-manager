from __future__ import annotations

from email.message import EmailMessage
import logging
import smtplib
from app.core.config import settings

logger = logging.getLogger("app.emailer")


def smtp_configured() -> bool:
    return bool(settings.smtp_host and settings.smtp_from_email)


def send_password_reset_code(to_email: str, full_name: str | None, code: str) -> bool:
    """Send a password reset verification code.

    Returns False when SMTP is not configured or sending fails. Failures are
    logged on the backend so the site owner can see the exact SMTP issue in
    Docker logs without exposing sensitive details to users.
    """
    if not smtp_configured():
        logger.warning("SMTP is not configured. Password reset email was not sent.")
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

    try:
        if settings.smtp_use_tls:
            with smtplib.SMTP(settings.smtp_host, settings.smtp_port, timeout=30) as smtp:
                smtp.ehlo()
                smtp.starttls()
                smtp.ehlo()
                if settings.smtp_username:
                    smtp.login(settings.smtp_username, settings.smtp_password or "")
                smtp.send_message(message)
        else:
            with smtplib.SMTP_SSL(settings.smtp_host, settings.smtp_port, timeout=30) as smtp:
                if settings.smtp_username:
                    smtp.login(settings.smtp_username, settings.smtp_password or "")
                smtp.send_message(message)
    except Exception as exc:
        logger.exception("SMTP password reset email failed for %s: %s", to_email, exc)
        return False

    logger.info("Password reset email sent to %s", to_email)
    return True
