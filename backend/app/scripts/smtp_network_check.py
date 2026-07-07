from __future__ import annotations

import os
import socket
import smtplib
import ssl

HOST = os.getenv("SMTP_HOST", "smtp.gmail.com")
PORT = int(os.getenv("SMTP_PORT", "587"))
USER = os.getenv("SMTP_USERNAME")
PASSWORD = os.getenv("SMTP_PASSWORD")
FROM_EMAIL = os.getenv("SMTP_FROM_EMAIL")
TO_EMAIL = os.getenv("SMTP_TEST_TO") or USER or FROM_EMAIL

print(f"SMTP network check: host={HOST} port={PORT}")

print("\nDNS addresses:")
try:
    for item in socket.getaddrinfo(HOST, PORT, type=socket.SOCK_STREAM):
        family, _socktype, _proto, _canonname, sockaddr = item
        print(" -", "IPv6" if family == socket.AF_INET6 else "IPv4", sockaddr[0])
except Exception as exc:
    print("DNS failed:", repr(exc))
    raise SystemExit(1)

print("\nTesting raw IPv4 TCP connection...")
last_error = None
connected = False
for family, socktype, proto, _canonname, sockaddr in socket.getaddrinfo(HOST, PORT, socket.AF_INET, socket.SOCK_STREAM):
    sock = socket.socket(family, socktype, proto)
    sock.settimeout(15)
    try:
        sock.connect(sockaddr)
        print(f"OK: connected to {sockaddr[0]}:{PORT}")
        connected = True
        break
    except OSError as exc:
        print(f"Failed {sockaddr[0]}:{PORT}: {exc}")
        last_error = exc
    finally:
        sock.close()

if not connected:
    print("\nResult: backend container cannot reach Gmail SMTP over IPv4.")
    print("Fix server/Docker/hosting outbound networking before checking SMTP username/password.")
    if last_error:
        raise SystemExit(1)

if USER and PASSWORD and FROM_EMAIL and TO_EMAIL:
    print("\nTesting SMTP STARTTLS login and send...")
    try:
        with smtplib.SMTP(HOST, PORT, timeout=30) as smtp:
            smtp.ehlo()
            smtp.starttls(context=ssl.create_default_context())
            smtp.ehlo()
            smtp.login(USER, PASSWORD)
            smtp.sendmail(FROM_EMAIL, [TO_EMAIL], "Subject: Grocery House Manager SMTP test\n\nSMTP test succeeded.")
        print(f"OK: test email sent to {TO_EMAIL}")
    except Exception as exc:
        print("SMTP login/send failed:", repr(exc))
        raise SystemExit(1)
else:
    print("\nSkipping login/send test because SMTP_USERNAME, SMTP_PASSWORD, SMTP_FROM_EMAIL, or SMTP_TEST_TO is missing.")
