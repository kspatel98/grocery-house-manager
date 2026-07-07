from __future__ import annotations

from email.message import EmailMessage
import logging
import smtplib
import socket
import ssl
from typing import Any

import requests

from app.core.config import settings

logger = logging.getLogger("app.emailer")


def _create_ipv4_connection(host: str, port: int, timeout: float | None, source_address=None):
    last_error: OSError | None = None
    addresses = socket.getaddrinfo(host, port, socket.AF_INET, socket.SOCK_STREAM)
    for family, socktype, proto, _canonname, sockaddr in addresses:
        sock = socket.socket(family, socktype, proto)
        try:
            if timeout is not None:
                sock.settimeout(timeout)
            if source_address:
                sock.bind(source_address)
            sock.connect(sockaddr)
            return sock
        except OSError as exc:
            last_error = exc
            sock.close()
    if last_error:
        raise last_error
    raise OSError(f"No IPv4 address found for {host}:{port}")


class IPv4SMTP(smtplib.SMTP):
    """SMTP client that forces IPv4.

    Some Docker hosts resolve smtp.gmail.com to IPv6 first even when the
    container has no IPv6 route. That can produce: OSError [Errno 101]
    Network is unreachable. Forcing AF_INET avoids that false failure while
    still keeping the logical SMTP host as smtp.gmail.com.
    """

    def _get_socket(self, host: str, port: int, timeout: float | None):  # type: ignore[override]
        if self.debuglevel > 0:
            self._print_debug("connect:", (host, port))
        return _create_ipv4_connection(host, port, timeout, source_address=self.source_address)


class IPv4SMTPSSL(smtplib.SMTP_SSL):
    """SMTP_SSL client that forces IPv4 for the same Docker IPv6 issue."""

    def _get_socket(self, host: str, port: int, timeout: float | None):  # type: ignore[override]
        if self.debuglevel > 0:
            self._print_debug("connect:", (host, port))
        raw_socket = _create_ipv4_connection(host, port, timeout, source_address=self.source_address)
        return self.context.wrap_socket(raw_socket, server_hostname=host)


def email_provider() -> str:
    """Return the active email provider.

    EMAIL_PROVIDER can be:
      - resend: use HTTPS API on port 443. Recommended when SMTP 587 is blocked.
      - smtp: use SMTP settings.
      - auto: use Resend when RESEND_API_KEY is present, otherwise SMTP.
    """
    provider = (settings.email_provider or "auto").strip().lower()
    if provider == "auto":
        return "resend" if settings.resend_api_key else "smtp"
    return provider


def resend_configured() -> bool:
    return bool(settings.resend_api_key and (settings.resend_from_email or settings.smtp_from_email))


def smtp_configured() -> bool:
    return bool(
        settings.smtp_host
        and settings.smtp_port
        and settings.smtp_username
        and settings.smtp_password
        and settings.smtp_from_email
    )


def email_configured() -> bool:
    provider = email_provider()
    if provider == "resend":
        return resend_configured()
    if provider == "smtp":
        return smtp_configured()
    return resend_configured() or smtp_configured()


def smtp_status_details() -> dict[str, Any]:
    smtp_missing = []
    if not settings.smtp_host:
        smtp_missing.append("SMTP_HOST")
    if not settings.smtp_port:
        smtp_missing.append("SMTP_PORT")
    if not settings.smtp_username:
        smtp_missing.append("SMTP_USERNAME")
    if not settings.smtp_password:
        smtp_missing.append("SMTP_PASSWORD")
    if not settings.smtp_from_email:
        smtp_missing.append("SMTP_FROM_EMAIL")

    resend_missing = []
    if not settings.resend_api_key:
        resend_missing.append("RESEND_API_KEY")
    if not (settings.resend_from_email or settings.smtp_from_email):
        resend_missing.append("RESEND_FROM_EMAIL or SMTP_FROM_EMAIL")

    provider = email_provider()
    configured = resend_configured() if provider == "resend" else smtp_configured()

    return {
        "configured": configured,
        "provider": provider,
        "missing": resend_missing if provider == "resend" else smtp_missing,
        "smtp_configured": smtp_configured(),
        "smtp_missing": smtp_missing,
        "smtp_host": settings.smtp_host,
        "smtp_port": settings.smtp_port,
        "smtp_username": settings.smtp_username,
        "smtp_from_email": settings.smtp_from_email,
        "smtp_use_tls": settings.smtp_use_tls,
        "smtp_force_ipv4": settings.smtp_force_ipv4,
        "resend_configured": resend_configured(),
        "resend_missing": resend_missing,
        "resend_from_email": settings.resend_from_email or settings.smtp_from_email,
        "resend_from_name": settings.resend_from_name or settings.smtp_from_name,
    }


def _smtp_client_class():
    if settings.smtp_use_tls:
        return IPv4SMTP if settings.smtp_force_ipv4 else smtplib.SMTP
    return IPv4SMTPSSL if settings.smtp_force_ipv4 else smtplib.SMTP_SSL


def _network_hint(exc: Exception) -> str:
    text = str(exc).lower()
    if "network is unreachable" in text or "errno 101" in text:
        return (
            "The backend container cannot reach the SMTP server network. "
            "Check Docker/server outbound internet access, firewall rules, hosting provider SMTP restrictions, "
            "and IPv6 routing. SMTP_FORCE_IPV4=true is enabled by default to avoid IPv6-only route failures."
        )
    if "name or service not known" in text or "temporary failure in name resolution" in text:
        return "DNS failed inside the backend container. Check Docker DNS or add DNS servers in docker-compose.yml."
    if "timed out" in text:
        return "SMTP connection timed out. The server/provider may be blocking outbound SMTP port 587. Use EMAIL_PROVIDER=resend to send over HTTPS port 443."
    if "authentication" in text or "username and password" in text or "535" in text:
        return "SMTP login failed. Check the Google Workspace email and 16-digit app password."
    if "sender" in text or "from" in text or "550" in text:
        return "SMTP sender was rejected. Use SMTP_FROM_EMAIL equal to SMTP_USERNAME first, then configure support@ as send-as/alias."
    return "Check the full backend traceback above for the exact email failure."


def _password_reset_subject() -> str:
    return "Your Grocery House Manager password reset code"


def _password_reset_text(full_name: str | None, code: str) -> str:
    greeting = full_name.strip() if full_name else "there"
    return f"""Hi {greeting},

Your Grocery House Manager password reset verification code is:

{code}

This code expires in 15 minutes. If you did not request a password reset, you can ignore this email.

SupremDas Group
Grocery House Manager
"""


def _password_reset_html(full_name: str | None, code: str) -> str:
    greeting = full_name.strip() if full_name else "there"
    return f"""
<div style=\"font-family: Arial, sans-serif; color: #111827; line-height: 1.5;\">
  <p>Hi {greeting},</p>
  <p>Your Grocery House Manager password reset verification code is:</p>
  <div style=\"font-size: 28px; font-weight: 700; letter-spacing: 6px; background: #f3f4f6; padding: 14px 18px; border-radius: 10px; display: inline-block;\">{code}</div>
  <p>This code expires in 15 minutes.</p>
  <p>If you did not request a password reset, you can ignore this email.</p>
  <p>SupremDas Group<br/>Grocery House Manager</p>
</div>
"""


def _from_header(from_name: str | None, from_email: str) -> str:
    clean_name = (from_name or "Grocery House Manager").strip()
    return f"{clean_name} <{from_email}>" if clean_name else from_email


def _send_password_reset_via_resend(to_email: str, full_name: str | None, code: str) -> bool:
    if not resend_configured():
        logger.warning("Resend email is not fully configured. Missing: %s", ", ".join(smtp_status_details()["resend_missing"]))
        return False

    from_email = settings.resend_from_email or settings.smtp_from_email
    from_name = settings.resend_from_name or settings.smtp_from_name or "Grocery House Manager"
    payload = {
        "from": _from_header(from_name, from_email),
        "to": [to_email],
        "subject": _password_reset_subject(),
        "html": _password_reset_html(full_name, code),
        "text": _password_reset_text(full_name, code),
    }
    headers = {
        "Authorization": f"Bearer {settings.resend_api_key}",
        "Content-Type": "application/json",
    }

    try:
        response = requests.post(
            "https://api.resend.com/emails",
            json=payload,
            headers=headers,
            timeout=20,
        )
        if 200 <= response.status_code < 300:
            logger.info("Password reset email sent to %s using Resend API", to_email)
            return True
        logger.error(
            "Resend password reset email failed for %s: status=%s body=%s from=%s",
            to_email,
            response.status_code,
            response.text[:1000],
            from_email,
        )
        return False
    except requests.RequestException as exc:
        logger.exception(
            "Resend password reset email failed for %s: %s | hint=HTTPS API connection failed. Check outbound HTTPS 443, DNS, and RESEND_API_KEY.",
            to_email,
            exc,
        )
        return False


def _send_password_reset_via_smtp(to_email: str, full_name: str | None, code: str) -> bool:
    if not smtp_configured():
        logger.warning("SMTP is not fully configured. Missing: %s", ", ".join(smtp_status_details()["smtp_missing"]))
        return False

    message = EmailMessage()
    message["From"] = _from_header(settings.smtp_from_name, settings.smtp_from_email or "")
    message["To"] = to_email
    message["Subject"] = _password_reset_subject()
    message.set_content(_password_reset_text(full_name, code))
    message.add_alternative(_password_reset_html(full_name, code), subtype="html")

    smtp_class = _smtp_client_class()
    context = ssl.create_default_context()

    try:
        if settings.smtp_use_tls:
            with smtp_class(settings.smtp_host, settings.smtp_port, timeout=30) as smtp:
                smtp.ehlo()
                smtp.starttls(context=context)
                smtp.ehlo()
                smtp.login(settings.smtp_username, settings.smtp_password or "")
                smtp.send_message(message)
        else:
            with smtp_class(settings.smtp_host, settings.smtp_port, timeout=30, context=context) as smtp:
                smtp.login(settings.smtp_username, settings.smtp_password or "")
                smtp.send_message(message)
    except Exception as exc:
        logger.exception(
            "SMTP password reset email failed for %s: %s | host=%s port=%s tls=%s force_ipv4=%s from=%s username=%s | hint=%s",
            to_email,
            exc,
            settings.smtp_host,
            settings.smtp_port,
            settings.smtp_use_tls,
            settings.smtp_force_ipv4,
            settings.smtp_from_email,
            settings.smtp_username,
            _network_hint(exc),
        )
        return False

    logger.info("Password reset email sent to %s using SMTP", to_email)
    return True


def send_password_reset_code(to_email: str, full_name: str | None, code: str) -> bool:
    """Send a password reset verification code.

    Prefer EMAIL_PROVIDER=resend in production when the server/hosting blocks SMTP
    ports 587/465. Resend uses HTTPS port 443, which is much less commonly blocked.
    """
    provider = email_provider()
    if provider == "resend":
        return _send_password_reset_via_resend(to_email, full_name, code)
    if provider == "smtp":
        return _send_password_reset_via_smtp(to_email, full_name, code)

    logger.error("Unsupported EMAIL_PROVIDER=%s. Use auto, resend, or smtp.", settings.email_provider)
    return False
