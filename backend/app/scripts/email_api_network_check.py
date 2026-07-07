from __future__ import annotations

import socket
import requests


def check_socket(host: str, port: int, label: str):
    try:
        socket.create_connection((host, port), timeout=10).close()
        print(f"✅ {label}: {host}:{port} reachable")
    except Exception as exc:
        print(f"❌ {label}: {host}:{port} failed -> {exc}")


if __name__ == "__main__":
    check_socket("1.1.1.1", 443, "raw internet HTTPS")
    check_socket("api.resend.com", 443, "Resend HTTPS API")
    check_socket("smtp.gmail.com", 587, "Gmail SMTP 587")
    try:
        response = requests.get("https://api.resend.com", timeout=10)
        print(f"✅ HTTPS request to api.resend.com returned HTTP {response.status_code}")
    except Exception as exc:
        print(f"❌ HTTPS request to api.resend.com failed -> {exc}")
