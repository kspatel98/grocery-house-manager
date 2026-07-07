from __future__ import annotations

import sys
from app.utils.emailer import send_password_reset_code, smtp_status_details


if __name__ == "__main__":
    to_email = sys.argv[1] if len(sys.argv) > 1 else input("Send test email to: ").strip()
    print("Email status:", smtp_status_details())
    ok = send_password_reset_code(to_email, "Admin test", "123456")
    print("✅ Sent" if ok else "❌ Failed. Check backend logs for details.")
    raise SystemExit(0 if ok else 1)
