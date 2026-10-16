import datetime as dt

import bcrypt
import httpx
import jwt
from google.auth.transport import requests as google_requests
from google.oauth2 import id_token as google_id_token
from fastapi import Depends, HTTPException
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer

from . import config
from .db import pool

bearer = HTTPBearer(auto_error=False)


def hash_password(password: str) -> str:
    return bcrypt.hashpw(password.encode(), bcrypt.gensalt()).decode()


_DUMMY_HASH = bcrypt.hashpw(b"timing-equalizer", bcrypt.gensalt()).decode()


def verify_password(password: str, hashed: str | None) -> bool:
    # Always run bcrypt, so the response time doesn't reveal whether an account exists
    # or whether it is Google-only (no password set).
    ok = bcrypt.checkpw(password.encode(), (hashed or _DUMMY_HASH).encode())
    return bool(hashed) and ok


def verify_captcha(token: str | None, ip: str) -> None:
    """Cloudflare Turnstile human check for sign-up. Skipped when TURNSTILE_SECRET_KEY is not set."""
    if not config.TURNSTILE_SECRET_KEY:
        return
    if not token:
        raise HTTPException(400, "Please complete the human check.")
    try:
        r = httpx.post(
            "https://challenges.cloudflare.com/turnstile/v0/siteverify",
            data={"secret": config.TURNSTILE_SECRET_KEY, "response": token, "remoteip": ip},
            timeout=5,
        )
        ok = r.json().get("success") is True
    except Exception:
        raise HTTPException(503, "Couldn't run the human check. Please try again.")
    if not ok:
        raise HTTPException(400, "Human check failed. Please try again.")


def verify_google_token(credential: str) -> dict:
    """Check the ID token Google gave the browser: signature, expiry, audience (our client id)."""
    if not config.GOOGLE_CLIENT_ID:
        raise HTTPException(503, "Google sign-in is not configured on the server")
    try:
        info = google_id_token.verify_oauth2_token(
            credential, google_requests.Request(), config.GOOGLE_CLIENT_ID
        )
    except ValueError:
        raise HTTPException(401, "Invalid Google sign-in. Please try again.")
    if not info.get("email") or not info.get("email_verified"):
        raise HTTPException(401, "Your Google email address is not verified")
    return info


def make_token(user_id) -> str:
    exp = dt.datetime.now(dt.timezone.utc) + dt.timedelta(days=7)
    return jwt.encode({"sub": str(user_id), "exp": exp}, config.JWT_SECRET, algorithm="HS256")


def current_user(creds: HTTPAuthorizationCredentials | None = Depends(bearer)):
    if not creds:
        raise HTTPException(401, "Not authenticated")
    try:
        data = jwt.decode(creds.credentials, config.JWT_SECRET, algorithms=["HS256"])
    except jwt.PyJWTError:
        raise HTTPException(401, "Invalid or expired token")
    with pool.connection() as conn:
        row = conn.execute("SELECT id, email, plan FROM users WHERE id = %s", (data["sub"],)).fetchone()
    if not row:
        raise HTTPException(401, "User not found")
    return row