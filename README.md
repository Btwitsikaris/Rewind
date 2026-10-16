# RAG SaaS: chat with your documents

Users sign up, upload PDFs/DOCX/TXT/MD, and ask questions. Answers stream in with numbered citations that open the exact source passage.

## Architecture

```
Next.js (React) ──HTTP + SSE──▶ FastAPI ──▶ Postgres + pgvector
                                   │            users, documents, chunks (vector + tsvector),
                                   │            conversations, messages, usage
                                   ├─▶ background task: extract → chunk → embed (fastembed, local) → store
                                   └─▶ Claude API: answer from retrieved chunks, streamed
```

**Question flow:** embed the question → vector search and Postgres full-text search (both filtered by `user_id`) → merge with reciprocal rank fusion → send the top chunks to Claude with instructions to answer only from them and cite `[n]` → stream tokens and sources to the browser → save the messages and usage.

## Run it

1. `cp .env.example .env` and add your `ANTHROPIC_API_KEY` and a random `JWT_SECRET`.
2. `docker compose up --build` (starts Postgres with pgvector and the API on :8000; the first start downloads the embedding model).
3. In `frontend/`: `cp .env.local.example .env.local && npm install && npm run dev`, then open http://localhost:3000.

API docs are at http://localhost:8000/docs.

## What's in it

- JWT auth with bcrypt-hashed passwords
- Upload with type and size limits, background ingestion, status tracking (processing / ready / failed)
- Hybrid retrieval (vector + keyword, RRF) with per-user isolation enforced in every query
- Streaming chat with citations, conversation history, optional per-document scoping
- Plan limits (questions per day, documents) and per-user token usage tracking
- Eval script: `python backend/eval/run_eval.py --email … --password … --questions backend/eval/questions.json` reports retrieval hit rate and answer hit rate

## Roadmap (not built yet)

- Stripe checkout and webhook to switch users to the `pro` plan
- OCR for scanned PDFs
- A reranker on top of hybrid search, then measure the gain with the eval script
- Real job queue (e.g. RQ or Celery) instead of FastAPI background tasks
- Tests, CI, rate limiting by IP, a deployed demo, and an architecture diagram image
