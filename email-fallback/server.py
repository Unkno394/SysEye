import json
import os
import random
import re
import smtplib
import ssl
import time
from email.message import EmailMessage
from http.server import BaseHTTPRequestHandler, HTTPServer
from pathlib import Path
from typing import Any
from urllib import error as urlerror
from urllib.request import Request, urlopen

import psycopg


def load_dotenv(path: Path):
    if not path.exists():
        return

    for raw_line in path.read_text(encoding="utf-8").splitlines():
        line = raw_line.strip()
        if not line or line.startswith("#") or "=" not in line:
            continue
        key, value = line.split("=", 1)
        key = key.strip()
        value = value.strip().strip("'").strip('"')
        if key and key not in os.environ:
            os.environ[key] = value


load_dotenv(Path(__file__).parent / ".env")

HOST = os.getenv("HOST", "0.0.0.0")
PORT = int(os.getenv("PORT", "8000"))
CODE_TTL_SECONDS = int(os.getenv("CODE_TTL_SECONDS", "300"))
CODE_LENGTH = int(os.getenv("CODE_LENGTH", "6"))
RESEND_COOLDOWN_SECONDS = int(os.getenv("RESEND_COOLDOWN_SECONDS", "60"))
SMTP_TIMEOUT_SECONDS = int(os.getenv("SMTP_TIMEOUT_SECONDS", "20"))
HTTP_TIMEOUT_SECONDS = int(os.getenv("HTTP_TIMEOUT_SECONDS", "20"))
EMAIL_TRANSPORT = os.getenv("EMAIL_TRANSPORT", "auto").lower()

SMTP_HOST = os.getenv("SMTP_HOST", "")
SMTP_PORT = int(os.getenv("SMTP_PORT", "465"))
SMTP_USER = os.getenv("SMTP_USER", "")
SMTP_PASS = os.getenv("SMTP_PASS", "")
SMTP_FROM = os.getenv("SMTP_FROM", SMTP_USER)
SMTP_USE_SSL = os.getenv("SMTP_USE_SSL", "true").lower() == "true"

RESEND_API_KEY = os.getenv("RESEND_API_KEY", "")
RESEND_FROM = os.getenv("RESEND_FROM", "")
RESEND_API_URL = os.getenv("RESEND_API_URL", "https://api.resend.com/emails")

DB_HOST = os.getenv("DB_HOST", "postgres")
DB_PORT = int(os.getenv("DB_PORT", "5432"))
DB_NAME = os.getenv("DB_NAME", "hackaton")
DB_USER = os.getenv("DB_USER", "postgres")
DB_PASSWORD = os.getenv("DB_PASSWORD", "")
DB_PASSWORD_FILE = os.getenv("DB_PASSWORD_FILE", "/run/secrets/db_password")

EMAIL_RE = re.compile(r"^[^\s@]+@[^\s@]+\.[^\s@]+$")

# In-memory email verification store:
# {"user@example.com": {"code": "123456", "expires": 1700000000.0, "last_sent": 1699999900.0}}
verification_store: dict[str, dict[str, Any]] = {}


def load_secret(path: str, fallback: str = "") -> str:
    secret_path = Path(path)
    if secret_path.exists():
        return secret_path.read_text(encoding="utf-8").strip()
    return fallback


def db_connection_string() -> str:
    password = load_secret(DB_PASSWORD_FILE, DB_PASSWORD)
    return (
        f"host={DB_HOST} port={DB_PORT} dbname={DB_NAME} "
        f"user={DB_USER} password={password}"
    )


def json_response(handler: BaseHTTPRequestHandler, status: int, payload: dict[str, Any]):
    body = json.dumps(payload).encode("utf-8")
    handler.send_response(status)
    handler.send_header("Content-Type", "application/json; charset=utf-8")
    handler.send_header("Content-Length", str(len(body)))
    handler.send_header("Access-Control-Allow-Origin", "*")
    handler.send_header("Access-Control-Allow-Headers", "Content-Type")
    handler.send_header("Access-Control-Allow-Methods", "GET,POST,OPTIONS")
    handler.end_headers()
    handler.wfile.write(body)


def read_json(handler: BaseHTTPRequestHandler):
    content_length = int(handler.headers.get("Content-Length", "0"))
    if content_length == 0:
        return {}
    raw = handler.rfile.read(content_length)
    try:
        return json.loads(raw.decode("utf-8"))
    except json.JSONDecodeError:
        return None


def generate_code(length: int = CODE_LENGTH) -> str:
    return "".join(random.choice("0123456789") for _ in range(length))


def validate_email(email: str) -> bool:
    return bool(EMAIL_RE.match(email or ""))


def email_exists(email: str) -> bool:
    with psycopg.connect(db_connection_string()) as conn:
        with conn.cursor() as cur:
            cur.execute('SELECT 1 FROM hackaton.users WHERE "Email" = %s LIMIT 1', (email,))
            return cur.fetchone() is not None


def mark_email_confirmed(email: str):
    with psycopg.connect(db_connection_string()) as conn:
        with conn.cursor() as cur:
            cur.execute(
                'UPDATE hackaton.users SET "IsEmailConfirmed" = TRUE WHERE "Email" = %s',
                (email,),
            )
        conn.commit()


def build_email_bodies(code: str):
    ttl_minutes = max(1, CODE_TTL_SECONDS // 60)
    text_body = (
        "Подтверждение почты SysEye\n\n"
        f"Ваш код подтверждения: {code}\n\n"
        f"Код действует {ttl_minutes} минут."
    )
    html_body = f"""\
<!doctype html>
<html lang="ru">
  <body style="margin:0;padding:0;background:#0b1117;font-family:Arial,Helvetica,sans-serif;color:#e8eef2;">
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#0b1117;padding:24px 12px;">
      <tr>
        <td align="center">
          <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:600px;background:#111a22;border:1px solid #1d2a33;border-radius:18px;">
            <tr>
              <td style="padding:24px 24px 16px;border-bottom:1px solid #1d2a33;">
                <div style="font-size:12px;line-height:18px;letter-spacing:.24em;text-transform:uppercase;color:#58ffb3;font-weight:700;">SysEye</div>
                <div style="margin-top:8px;font-size:28px;line-height:34px;font-weight:700;color:#fff;">Подтверждение почты</div>
                <div style="margin-top:6px;font-size:14px;line-height:20px;color:#8ea1b1;">Remote diagnostics and agent control</div>
              </td>
            </tr>
            <tr>
              <td style="padding:24px;">
                <div style="font-size:15px;line-height:24px;color:#d3dde5;">Введите этот код в интерфейсе SysEye, чтобы завершить регистрацию.</div>
                <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin-top:20px;background:#0d141a;border:1px solid #20303a;border-radius:14px;">
                  <tr>
                    <td style="padding:14px 16px 6px;font-size:11px;line-height:16px;letter-spacing:.24em;text-transform:uppercase;color:#7b8c99;">Код подтверждения</td>
                  </tr>
                  <tr>
                    <td style="padding:0 16px 16px;">
                      <div style="background:#0a1015;border:1px solid #2c5243;border-radius:12px;padding:18px 16px;text-align:center;font-family:'Courier New',monospace;font-size:30px;line-height:36px;font-weight:700;letter-spacing:.26em;color:#58ffb3;">{code}</div>
                    </td>
                  </tr>
                </table>
                <div style="margin-top:18px;font-size:14px;line-height:22px;color:#93a5b3;">Код действителен <span style="color:#58ffb3;font-weight:700;">{ttl_minutes} минут</span>.</div>
              </td>
            </tr>
          </table>
        </td>
      </tr>
    </table>
  </body>
</html>
"""
    return text_body, html_body


def send_email_via_smtp(email: str, code: str):
    if not (SMTP_HOST and SMTP_PORT and SMTP_USER and SMTP_PASS and SMTP_FROM):
        raise RuntimeError("SMTP is not configured")

    text_body, html_body = build_email_bodies(code)
    msg = EmailMessage()
    msg["Subject"] = "Подтверждение почты SysEye"
    msg["From"] = SMTP_FROM
    msg["To"] = email
    msg.set_content(text_body)
    msg.add_alternative(html_body, subtype="html")

    if SMTP_USE_SSL:
        context = ssl.create_default_context()
        with smtplib.SMTP_SSL(SMTP_HOST, SMTP_PORT, context=context, timeout=SMTP_TIMEOUT_SECONDS) as server:
            server.login(SMTP_USER, SMTP_PASS)
            server.send_message(msg)
    else:
        with smtplib.SMTP(SMTP_HOST, SMTP_PORT, timeout=SMTP_TIMEOUT_SECONDS) as server:
            server.starttls(context=ssl.create_default_context())
            server.login(SMTP_USER, SMTP_PASS)
            server.send_message(msg)


def send_email_via_resend(email: str, code: str):
    if not (RESEND_API_KEY and RESEND_FROM):
        raise RuntimeError("Resend is not configured")

    text_body, html_body = build_email_bodies(code)
    payload = {
        "from": RESEND_FROM,
        "to": [email],
        "subject": "Подтверждение почты SysEye",
        "text": text_body,
        "html": html_body,
    }
    data = json.dumps(payload).encode("utf-8")
    req = Request(
        RESEND_API_URL,
        data=data,
        method="POST",
        headers={
            "Authorization": f"Bearer {RESEND_API_KEY}",
            "Content-Type": "application/json",
            "Accept": "application/json",
            "User-Agent": "SysEyeEmailFallback/1.0",
        },
    )
    try:
        with urlopen(req, timeout=HTTP_TIMEOUT_SECONDS) as resp:
            body = resp.read().decode("utf-8", errors="replace")
            if resp.status >= 400:
                raise RuntimeError(f"Resend API error {resp.status}: {body}")
    except urlerror.HTTPError as exc:
        detail = exc.read().decode("utf-8", errors="replace")
        raise RuntimeError(f"Resend API error {exc.code}: {detail}") from exc
    except urlerror.URLError as exc:
        raise RuntimeError(f"Resend connection error: {exc.reason}") from exc


def send_email_code(email: str, code: str):
    if EMAIL_TRANSPORT == "resend":
        send_email_via_resend(email, code)
        return

    if EMAIL_TRANSPORT == "smtp":
        send_email_via_smtp(email, code)
        return

    if EMAIL_TRANSPORT == "auto":
        errors: list[str] = []
        try:
            send_email_via_resend(email, code)
            return
        except Exception as exc:
            errors.append(f"resend: {exc}")
        try:
            send_email_via_smtp(email, code)
            return
        except Exception as exc:
            errors.append(f"smtp: {exc}")
        raise RuntimeError("; ".join(errors))

    raise RuntimeError("EMAIL_TRANSPORT must be one of: resend, smtp, auto")


class AppHandler(BaseHTTPRequestHandler):
    def log_message(self, format, *args):
        return

    def do_OPTIONS(self):
        self.send_response(204)
        self.send_header("Access-Control-Allow-Origin", "*")
        self.send_header("Access-Control-Allow-Headers", "Content-Type")
        self.send_header("Access-Control-Allow-Methods", "GET,POST,OPTIONS")
        self.end_headers()

    def do_GET(self):
        if self.path == "/health":
            return json_response(self, 200, {"ok": True})

        return json_response(self, 404, {"ok": False, "error": "Not found"})

    def do_POST(self):
        try:
            if self.path == "/api/send-code":
                return self.handle_send_code()
            if self.path == "/api/verify-code":
                return self.handle_verify_code()
            return json_response(self, 404, {"ok": False, "error": "Not found"})
        except Exception as exc:
            return json_response(self, 500, {"ok": False, "error": f"Внутренняя ошибка сервера: {exc}"})

    def handle_send_code(self):
        data = read_json(self)
        if data is None:
            return json_response(self, 400, {"ok": False, "error": "Невалидный JSON"})

        email = (data.get("email") or "").strip().lower()
        if not validate_email(email):
            return json_response(self, 400, {"ok": False, "error": "Введите корректный email"})
        if not email_exists(email):
            return json_response(self, 404, {"ok": False, "error": "Пользователь с таким email не найден"})

        now = time.time()
        existing = verification_store.get(email)
        if existing and now - existing.get("last_sent", 0) < RESEND_COOLDOWN_SECONDS:
            wait = int(RESEND_COOLDOWN_SECONDS - (now - existing.get("last_sent", 0)))
            return json_response(self, 429, {"ok": False, "error": f"Подождите {wait} сек. перед повторной отправкой"})

        code = generate_code()
        send_email_code(email, code)
        verification_store[email] = {
            "code": code,
            "expires": now + CODE_TTL_SECONDS,
            "last_sent": now,
        }
        return json_response(self, 200, {"ok": True, "message": "Код отправлен на вашу почту", "expires_in": CODE_TTL_SECONDS})

    def handle_verify_code(self):
        data = read_json(self)
        if data is None:
            return json_response(self, 400, {"ok": False, "error": "Невалидный JSON"})

        email = (data.get("email") or "").strip().lower()
        code = (data.get("code") or "").strip()

        if not validate_email(email):
            return json_response(self, 400, {"ok": False, "error": "Введите корректный email"})
        if not code:
            return json_response(self, 400, {"ok": False, "error": "Введите код"})

        entry = verification_store.get(email)
        if not entry:
            return json_response(self, 400, {"ok": False, "error": "Сначала запросите код"})

        if time.time() > entry["expires"]:
            del verification_store[email]
            return json_response(self, 400, {"ok": False, "error": "Код истек"})

        if code != entry["code"]:
            return json_response(self, 400, {"ok": False, "error": "Неверный код"})

        mark_email_confirmed(email)
        del verification_store[email]
        return json_response(self, 200, {"ok": True, "message": "Email успешно подтвержден"})


if __name__ == "__main__":
    server = HTTPServer((HOST, PORT), AppHandler)
    print(f"Email fallback started on http://{HOST}:{PORT}")
    try:
        server.serve_forever()
    except KeyboardInterrupt:
        pass
    finally:
        server.server_close()
