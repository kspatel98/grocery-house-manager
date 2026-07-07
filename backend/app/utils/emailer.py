from __future__ import annotations

from email.message import EmailMessage
import logging
import smtplib
import socket
import ssl
from typing import Any

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


def smtp_configured() -> bool:
    return bool(
        settings.smtp_host
        and settings.smtp_port
        and settings.smtp_username
        and settings.smtp_password
        and settings.smtp_from_email
    )


def smtp_status_details() -> dict[str, Any]:
    missing = []
    if not settings.smtp_host:
        missing.append("SMTP_HOST")
    if not settings.smtp_port:
        missing.append("SMTP_PORT")
    if not settings.smtp_username:
        missing.append("SMTP_USERNAME")
    if not settings.smtp_password:
        missing.append("SMTP_PASSWORD")
    if not settings.smtp_from_email:
        missing.append("SMTP_FROM_EMAIL")

    return {
        "configured": not missing,
        "missing": missing,
        "host": settings.smtp_host,
        "port": settings.smtp_port,
        "username": settings.smtp_username,
        "from_email": settings.smtp_from_email,
        "use_tls": settings.smtp_use_tls,
        "force_ipv4": settings.smtp_force_ipv4,
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
        return "SMTP connection timed out. The server/provider may be blocking outbound SMTP port 587."
    if "authentication" in text or "username and password" in text or "535" in text:
        return "SMTP login failed. Check the Google Workspace email and 16-digit app password."
    if "sender" in text or "from" in text or "550" in text:
        return "SMTP sender was rejected. Use SMTP_FROM_EMAIL equal to SMTP_USERNAME first, then configure support@ as send-as/alias."
    return "Check the full backend traceback above for the exact SMTP failure."


def send_password_reset_code(to_email: str, full_name: str | None, code: str) -> bool:
    """Send a password reset verification code.

    Returns False when SMTP is not configured or sending fails. Failures are
    logged on the backend so the site owner can see the exact SMTP issue in
    Docker logs without exposing sensitive details to users.
    """
    if not smtp_configured():
        logger.warning("SMTP is not fully configured. Missing: %s", ", ".join(smtp_status_details()["missing"]))
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

    logger.info("Password reset email sent to %s", to_email)
    return True
