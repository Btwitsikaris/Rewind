import json
import uuid
from contextlib import asynccontextmanager
from pathlib import Path

import psycopg
from fastapi import BackgroundTasks, Depends, FastAPI, File, HTTPException, Request, UploadFile
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import StreamingResponse
from psycopg.types.json import Jsonb
from pydantic import BaseModel, EmailStr, Field

from . import config, ratelimit
from .auth import current_user, hash_password, make_token, verify_captcha, verify_google_token, verify_password
from .db import init_db, pool
from .ingest import process_document
from .llm import stream_answer
from .retrieval import search

ALLOWED_EXT = {".pdf", ".docx", ".txt", ".md"}


@asynccontextmanager
async def lifespan(app: FastAPI):
    Path(config.STORAGE_DIR).mkdir(parents=True, exist_ok=True)
    init_db()
    yield
    pool.close()


# In production the interactive API docs are switched off so the endpoint list isn't public.
_docs = {"docs_url": None, "redoc_url": None, "openapi_url": None} if config.IS_PROD else {}
app = FastAPI(title="RAG SaaS API", lifespan=lifespan, **_docs)
app.add_middleware(
    CORSMiddleware,
    allow_origins=config.CORS_ORIGINS,
    allow_methods=["GET", "POST", "DELETE", "OPTIONS"],
    allow_headers=["Authorization", "Content-Type"],
)


# ---------- auth ----------
class Credentials(BaseModel):
    email: EmailStr
    password: str = Field(min_length=8, max_length=72)


def check_signups_open(conn) -> None:
    """Cost guard: stop creating new accounts once the daily site-wide cap is reached."""
    n = conn.execute("SELECT count(*) AS n FROM users WHERE created_at >= current_date").fetchone()["n"]
    if n >= config.MAX_SIGNUPS_PER_DAY:
        raise HTTPException(503, "New sign-ups are paused for today. Please try again tomorrow.")


class RegisterBody(Credentials):
    captcha_token: str | None = Field(default=None, max_length=4096)


@app.post("/auth/register")
def register(body: RegisterBody, request: Request):
    ip = ratelimit.client_ip(request)
    ratelimit.hit(f"register:{ip}", 5, 3600)
    verify_captcha(body.captcha_token, ip)
    with pool.connection() as conn:
        check_signups_open(conn)
        try:
            row = conn.execute(
                "INSERT INTO users (email, password_hash) VALUES (%s, %s) RETURNING id",
                (body.email.lower(), hash_password(body.password)),
            ).fetchone()
        except psycopg.errors.UniqueViolation:
            raise HTTPException(409, "Email already registered")
    return {"token": make_token(row["id"])}


@app.post("/auth/login")
def login(body: Credentials, request: Request):
    ratelimit.hit(f"login-ip:{ratelimit.client_ip(request)}", 20, 900)
    email = body.email.lower()
    ratelimit.check(f"login-fail:{email}", 8, 900)  # only wrong passwords count against an account
    with pool.connection() as conn:
        row = conn.execute("SELECT id, password_hash FROM users WHERE email = %s", (email,)).fetchone()
    if not verify_password(body.password, row["password_hash"] if row else None) or not row:
        ratelimit.add(f"login-fail:{email}")
        raise HTTPException(401, "Wrong email or password")
    return {"token": make_token(row["id"])}


class GoogleBody(BaseModel):
    credential: str = Field(min_length=20, max_length=4096)


@app.post("/auth/google")
def google_login(body: GoogleBody, request: Request):
    ratelimit.hit(f"google:{ratelimit.client_ip(request)}", 30, 900)
    info = verify_google_token(body.credential)
    sub, email = info["sub"], info["email"].lower()
    with pool.connection() as conn:
        row = conn.execute("SELECT id FROM users WHERE google_sub = %s", (sub,)).fetchone()
        if not row:
            # Same email already registered: link the Google identity to it. Email/password signup does not
            # verify the address, so the existing password may have been set by someone else (account
            # pre-hijacking). Google has proven who owns the email, so drop the old password.
            row = conn.execute(
                "UPDATE users SET google_sub = %s, password_hash = NULL WHERE email = %s RETURNING id", (sub, email)
            ).fetchone()
        if not row:
            check_signups_open(conn)
            row = conn.execute(
                "INSERT INTO users (email, google_sub) VALUES (%s, %s) RETURNING id", (email, sub)
            ).fetchone()
    return {"token": make_token(row["id"])}


@app.get("/me")
def me(user=Depends(current_user)):
    with pool.connection() as conn:
        used = conn.execute(
            "SELECT questions FROM usage WHERE user_id = %s AND day = current_date", (user["id"],)
        ).fetchone()
    plan = config.PLANS[user["plan"]]
    return {
        "email": user["email"],
        "plan": user["plan"],
        "questions_today": used["questions"] if used else 0,
        "questions_per_day": plan["questions_per_day"],
        "max_documents": plan["max_documents"],
    }


# ---------- documents ----------
@app.post("/documents")
async def upload(background: BackgroundTasks, file: UploadFile = File(...), user=Depends(current_user)):
    ratelimit.hit(f"upload:{user['id']}", 20, 3600)
    ext = Path(file.filename or "").suffix.lower()
    if ext not in ALLOWED_EXT:
        raise HTTPException(400, f"Unsupported file type. Allowed: {', '.join(sorted(ALLOWED_EXT))}")

    limit = config.MAX_UPLOAD_MB * 1024 * 1024
    data = await file.read(limit + 1)
    if len(data) > limit:
        raise HTTPException(413, f"File too large (max {config.MAX_UPLOAD_MB} MB)")

    with pool.connection() as conn:
        n = conn.execute("SELECT count(*) AS n FROM documents WHERE user_id = %s", (user["id"],)).fetchone()["n"]
        if n >= config.PLANS[user["plan"]]["max_documents"]:
            raise HTTPException(402, "Document limit reached for your plan")
        doc_id = uuid.uuid4()
        conn.execute(
            "INSERT INTO documents (id, user_id, filename) VALUES (%s, %s, %s)",
            (doc_id, user["id"], file.filename),
        )

    dest = Path(config.STORAGE_DIR) / f"{doc_id}{ext}"
    dest.write_bytes(data)
    background.add_task(process_document, doc_id, dest)
    return {"id": str(doc_id), "filename": file.filename, "status": "processing"}


@app.get("/documents")
def list_documents(user=Depends(current_user)):
    with pool.connection() as conn:
        rows = conn.execute(
            "SELECT id, filename, status, error, n_chunks, created_at FROM documents "
            "WHERE user_id = %s ORDER BY created_at DESC",
            (user["id"],),
        ).fetchall()
    return [{**r, "id": str(r["id"])} for r in rows]


@app.delete("/documents/{doc_id}")
def delete_document(doc_id: uuid.UUID, user=Depends(current_user)):
    with pool.connection() as conn:
        row = conn.execute(
            "DELETE FROM documents WHERE id = %s AND user_id = %s RETURNING id", (doc_id, user["id"])
        ).fetchone()
    if not row:
        raise HTTPException(404, "Document not found")
    for f in Path(config.STORAGE_DIR).glob(f"{doc_id}.*"):
        f.unlink(missing_ok=True)
    return {"ok": True}


# ---------- search (also used by the eval script) ----------
class SearchBody(BaseModel):
    query: str = Field(min_length=1, max_length=2000)
    k: int = Field(6, ge=1, le=20)


@app.post("/search")
def search_endpoint(body: SearchBody, user=Depends(current_user)):
    ratelimit.hit(f"search:{user['id']}", 60, 60)
    return search(user["id"], body.query, k=body.k)


# ---------- chat ----------
class ChatBody(BaseModel):
    question: str = Field(min_length=1, max_length=2000)
    conversation_id: uuid.UUID | None = None
    document_ids: list[uuid.UUID] | None = None


def sse(event: str, data: dict) -> str:
    return f"event: {event}\ndata: {json.dumps(data)}\n\n"


@app.post("/chat")
def chat(body: ChatBody, user=Depends(current_user)):
    ratelimit.hit(f"chat:{user['id']}", 15, 60)
    plan = config.PLANS[user["plan"]]
    with pool.connection() as conn:
        used = conn.execute(
            "SELECT questions FROM usage WHERE user_id = %s AND day = current_date", (user["id"],)
        ).fetchone()
    if used and used["questions"] >= plan["questions_per_day"]:
        raise HTTPException(429, "Daily question limit reached. Upgrade for more.")

    sources = search(user["id"], body.question, document_ids=body.document_ids)
    public_sources = [
        {"n": i + 1, "document_id": s["document_id"], "filename": s["filename"], "page": s["page"], "content": s["content"]}
        for i, s in enumerate(sources)
    ]

    conv_id = body.conversation_id
    with pool.connection() as conn:
        if conv_id:
            owned = conn.execute(
                "SELECT 1 FROM conversations WHERE id = %s AND user_id = %s", (conv_id, user["id"])
            ).fetchone()
            if not owned:
                raise HTTPException(404, "Conversation not found")
        else:
            conv_id = conn.execute(
                "INSERT INTO conversations (user_id, title) VALUES (%s, %s) RETURNING id",
                (user["id"], body.question[:60]),
            ).fetchone()["id"]
        rows = conn.execute(
            "SELECT role, content FROM messages WHERE conversation_id = %s ORDER BY id DESC LIMIT 6", (conv_id,)
        ).fetchall()
    history = list(reversed(rows))
    while history and history[0]["role"] != "user":  # the API expects the first message to be from the user
        history.pop(0)

    def generate():
        yield sse("meta", {"conversation_id": str(conv_id), "sources": public_sources})
        parts: list[str] = []
        usage = {"input": 0, "output": 0}
        if not sources:
            msg = "I couldn't find anything relevant in your documents."
            parts.append(msg)
            yield sse("token", {"text": msg})
        else:
            try:
                for kind, val in stream_answer(history, body.question, sources):
                    if kind == "token":
                        parts.append(val)
                        yield sse("token", {"text": val})
                    else:
                        usage = val
            except Exception:
                yield sse("error", {"message": "The model request failed. Please try again."})
                return

        with pool.connection() as conn:
            conn.execute(
                "INSERT INTO messages (conversation_id, role, content) VALUES (%s, 'user', %s)",
                (conv_id, body.question),
            )
            conn.execute(
                "INSERT INTO messages (conversation_id, role, content, sources) VALUES (%s, 'assistant', %s, %s)",
                (conv_id, "".join(parts), Jsonb(public_sources)),
            )
            conn.execute(
                """INSERT INTO usage (user_id, day, questions, input_tokens, output_tokens)
                   VALUES (%s, current_date, 1, %s, %s)
                   ON CONFLICT (user_id, day) DO UPDATE SET
                     questions = usage.questions + 1,
                     input_tokens = usage.input_tokens + EXCLUDED.input_tokens,
                     output_tokens = usage.output_tokens + EXCLUDED.output_tokens""",
                (user["id"], usage["input"], usage["output"]),
            )
        yield sse("done", {})

    return StreamingResponse(
        generate(), media_type="text/event-stream", headers={"Cache-Control": "no-cache", "X-Accel-Buffering": "no"}
    )


@app.get("/conversations")
def conversations(user=Depends(current_user)):
    with pool.connection() as conn:
        rows = conn.execute(
            "SELECT id, title, created_at FROM conversations WHERE user_id = %s ORDER BY created_at DESC LIMIT 50",
            (user["id"],),
        ).fetchall()
    return [{**r, "id": str(r["id"])} for r in rows]


@app.get("/conversations/{conv_id}/messages")
def conversation_messages(conv_id: uuid.UUID, user=Depends(current_user)):
    with pool.connection() as conn:
        owned = conn.execute(
            "SELECT 1 FROM conversations WHERE id = %s AND user_id = %s", (conv_id, user["id"])
        ).fetchone()
        if not owned:
            raise HTTPException(404, "Conversation not found")
        return conn.execute(
            "SELECT role, content, sources FROM messages WHERE conversation_id = %s ORDER BY id", (conv_id,)
        ).fetchall()