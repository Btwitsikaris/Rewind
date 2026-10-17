<div align="center">

<img src="frontend/public/logo.png" alt="Rewind logo" width="110" />

<hr/>

### Ask a question. **Rewind to the source.**

Chat with your own documents. Every answer streams in with numbered citations,
and one click jumps you back to the exact passage it came from.

<br/>

![Next.js](https://img.shields.io/badge/Next.js-000000?style=for-the-badge&logo=nextdotjs&logoColor=white)
![React](https://img.shields.io/badge/React-20232A?style=for-the-badge&logo=react&logoColor=61DAFB)
![TypeScript](https://img.shields.io/badge/TypeScript-3178C6?style=for-the-badge&logo=typescript&logoColor=white)
![FastAPI](https://img.shields.io/badge/FastAPI-009688?style=for-the-badge&logo=fastapi&logoColor=white)
![PostgreSQL](https://img.shields.io/badge/Postgres%20%2B%20pgvector-4169E1?style=for-the-badge&logo=postgresql&logoColor=white)
![Docker](https://img.shields.io/badge/Docker-2496ED?style=for-the-badge&logo=docker&logoColor=white)
![Claude](https://img.shields.io/badge/Claude-D97757?style=for-the-badge&logo=anthropic&logoColor=white)

</div>

---

## 🎬 The idea in one breath

> Most "chat with your PDF" tools sound confident even when they're guessing.
> **Rewind refuses to guess.** It answers *only* from passages it retrieved, shows you
> those passages as `[1]` `[2]` `[3]` chips, and says *"I couldn't find that in your documents"*
> when the answer isn't there.

| 🔍 Trustworthy | ⚡ Fast | 🔒 Private |
|---|---|---|
| Source-grounded answers with clickable citations | Token-by-token streaming over SSE | Every query is filtered by `user_id`, so users never see each other's chunks |

---

## ✨ Features

- 📄 **Upload PDF, DOCX, TXT, MD** with type and size limits (15 MB) and live status: `processing → ready / failed`
- 🧠 **Hybrid retrieval**: pgvector semantic search + Postgres full-text search, merged with Reciprocal Rank Fusion
- 💬 **Streaming chat** with inline citations, conversation history, and optional per-document scoping
- 🔁 **Click a citation to "rewind"** to the page and passage behind it
- 🔐 **Auth**: email + password (bcrypt, JWT) and **Sign in with Google**
- 🛡️ **Abuse protection**: Cloudflare Turnstile on sign-up, sliding-window rate limiter, daily signup cap, zip-bomb and page-count guards
- 📊 **Plans and usage tracking**: questions per day, document caps, per-user token accounting
- 🔀 **Provider failover**: Anthropic → Gemini → Groq, with retry and model fallback
- 🧪 **Eval harness** that reports retrieval hit rate and answer hit rate

---

## 🏗️ System architecture

```mermaid
flowchart LR
    U([👤 User]) --> FE

    subgraph FE_BOX [" 🖥️ Frontend "]
        FE["Next.js 16 + React<br/>Landing · Auth · Docs panel · Chat panel"]
    end

    subgraph BE_BOX [" ⚙️ Backend · FastAPI "]
        API["REST + SSE API"]
        AUTH["🔐 Auth<br/>JWT · bcrypt · Google · Turnstile"]
        RL["🚦 Rate limiter"]
        ING["📥 Ingestion worker<br/>extract → chunk → embed"]
        RET["🔎 Hybrid retrieval<br/>vector + keyword + RRF"]
        LLM["🤖 LLM router"]
    end

    subgraph DB_BOX [" 🗄️ PostgreSQL 16 + pgvector "]
        DB[("users · documents<br/>chunks (vector + tsvector)<br/>conversations · messages · usage")]
    end

    EMB["🧬 fastembed<br/>bge-small-en-v1.5 · local · 384-d"]

    subgraph AI [" ☁️ LLM providers "]
        A1["Anthropic Claude"]
        A2["Gemini"]
        A3["Groq"]
    end

    FE <-->|"HTTP + SSE"| API
    API --- AUTH
    API --- RL
    API -->|"background task"| ING
    ING --> EMB
    ING --> DB
    API --> RET
    RET --> EMB
    RET --> DB
    API --> LLM
    LLM --> A1
    LLM -.->|"fallback"| A2
    LLM -.->|"fallback"| A3
    API --> DB

    style FE_BOX fill:#1e1b4b,stroke:#818cf8,color:#e0e7ff
    style BE_BOX fill:#052e16,stroke:#4ade80,color:#dcfce7
    style DB_BOX fill:#172554,stroke:#60a5fa,color:#dbeafe
    style AI fill:#431407,stroke:#fb923c,color:#ffedd5
```

---

## 🔄 What happens when you ask a question

```mermaid
flowchart TD
    Q["💬 You ask a question"] --> RLC{"🚦 Under daily<br/>plan limit?"}
    RLC -- "No" --> E429["⛔ 429: limit reached"]
    RLC -- "Yes" --> EMBQ["🧬 Embed the question"]

    EMBQ --> V["📐 Vector search<br/>top 20 by cosine distance"]
    EMBQ --> K["🔤 Keyword search<br/>top 20 by ts_rank_cd"]

    V --> F1["🔒 WHERE user_id = you"]
    K --> F2["🔒 WHERE user_id = you"]

    F1 --> RRF["🧮 Reciprocal Rank Fusion<br/>score = Σ 1 / (60 + rank)"]
    F2 --> RRF

    RRF --> TOP["🏆 Keep top 6 chunks"]
    TOP --> PROMPT["📝 Build prompt:<br/>numbered sources + question"]
    PROMPT --> LLMQ["🤖 Stream from LLM<br/>'answer ONLY from sources, cite [n]'"]
    LLMQ --> SSE["📡 SSE: tokens + sources → browser"]
    SSE --> CLICK["🖱️ Click [n] → rewind to the source passage"]
    SSE --> SAVE[("💾 Save messages + token usage")]

    style Q fill:#7c3aed,stroke:#a78bfa,color:#fff
    style E429 fill:#7f1d1d,stroke:#f87171,color:#fff
    style RRF fill:#0f766e,stroke:#5eead4,color:#fff
    style CLICK fill:#b45309,stroke:#fcd34d,color:#fff
```

### The same flow as a conversation

```mermaid
sequenceDiagram
    autonumber
    actor You
    participant UI as Next.js
    participant API as FastAPI
    participant PG as Postgres + pgvector
    participant AI as Claude

    You->>UI: "What is the refund policy?"
    UI->>API: POST /chat (JWT)
    API->>API: rate-limit and plan check
    API->>PG: vector search + full-text search (user-scoped)
    PG-->>API: 2 x 20 candidate chunks
    API->>API: RRF merge → top 6
    API->>AI: system rules + numbered sources + question
    loop streaming
        AI-->>API: token
        API-->>UI: SSE event: token
        UI-->>You: text appears live
    end
    API-->>UI: SSE event: sources
    API->>PG: save messages + usage
    You->>UI: click [2]
    UI-->>You: ⏪ jumps to the cited passage and page
```

---

## 📥 What happens when you upload

```mermaid
flowchart LR
    UP["📤 Upload file"] --> CHK{"Valid type,<br/>≤ 15 MB,<br/>under doc limit?"}
    CHK -- "No" --> REJ["❌ Rejected"]
    CHK -- "Yes" --> ROW[("documents row<br/>status = processing")]
    ROW --> BG["⚙️ Background task<br/>(max 2 in parallel)"]
    BG --> EX["📖 Extract text<br/>PDF per page · DOCX · TXT/MD"]
    EX --> GUARD{"≤ 500 pages<br/>≤ 6000 chunks<br/>not a zip bomb?"}
    GUARD -- "No" --> FAIL["🔴 status = failed<br/>+ friendly error"]
    GUARD -- "Yes" --> CH["✂️ Chunk<br/>~1000 chars · 150 overlap"]
    CH --> EM["🧬 Embed in batches of 64"]
    EM --> ST[("💾 chunks table<br/>vector(384) + tsvector")]
    ST --> OK["🟢 status = ready"]

    style OK fill:#166534,stroke:#4ade80,color:#fff
    style FAIL fill:#7f1d1d,stroke:#f87171,color:#fff
    style REJ fill:#7f1d1d,stroke:#f87171,color:#fff
```

---

## 🗃️ Data model

```mermaid
erDiagram
    USERS ||--o{ DOCUMENTS : owns
    USERS ||--o{ CHUNKS : "owns (denormalised for fast filtering)"
    USERS ||--o{ CONVERSATIONS : starts
    USERS ||--o{ USAGE : "tracked daily"
    DOCUMENTS ||--o{ CHUNKS : "split into"
    CONVERSATIONS ||--o{ MESSAGES : contains

    USERS {
        uuid id PK
        text email UK
        text password_hash "NULL for Google-only"
        text google_sub UK
        text plan "free | pro"
    }
    DOCUMENTS {
        uuid id PK
        text filename
        text status "processing | ready | failed"
        int n_chunks
    }
    CHUNKS {
        bigint id PK
        int page
        text content
        vector384 embedding "HNSW cosine index"
        tsvector tsv "GIN index"
    }
    CONVERSATIONS {
        uuid id PK
        text title
    }
    MESSAGES {
        bigint id PK
        text role
        text content
        jsonb sources
    }
    USAGE {
        date day PK
        int questions
        bigint input_tokens
        bigint output_tokens
    }
```

---

## 📈 By the numbers

### Plan limits

```mermaid
xychart-beta
    title "Free vs Pro: documents allowed"
    x-axis ["Free", "Pro"]
    y-axis "Max documents" 0 --> 120
    bar [5, 100]
```

```mermaid
xychart-beta
    title "Free vs Pro: questions per day"
    x-axis ["Free", "Pro"]
    y-axis "Questions / day" 0 --> 550
    bar [20, 500]
```

### Where the backend code lives (lines of Python)

```mermaid
pie showData
    title Backend modules by size
    "main.py (routes + chat stream)" : 308
    "llm.py (provider routing)" : 114
    "auth.py" : 80
    "ratelimit.py" : 62
    "chunking.py" : 51
    "config.py" : 49
    "ingest.py" : 49
    "retrieval.py" : 45
    "db.py" : 38
```

> The whole backend is under 800 lines, small enough to read in one sitting.

---

## 🧩 Why hybrid search?

Neither method wins alone, so Rewind uses both and lets them vote.

```mermaid
quadrantChart
    title What each retriever is good at
    x-axis "Exact wording" --> "Meaning / paraphrase"
    y-axis "Weak on rare terms" --> "Strong on rare terms"
    quadrant-1 "Keyword (tsvector)"
    quadrant-2 "Hybrid RRF target"
    quadrant-3 "Weak spot"
    quadrant-4 "Vector (pgvector)"
    "Keyword search": [0.2, 0.85]
    "Vector search": [0.85, 0.3]
    "Rewind (RRF)": [0.75, 0.8]
```

*(Illustrative positioning, not a measured benchmark. Use the eval script below to measure your own data.)*

---

## 🚀 Quick start

**1. Configure**
```bash
cp .env.example .env
# add ANTHROPIC_API_KEY and a long random JWT_SECRET
```

**2. Start the backend and database**
```bash
docker compose up --build
```
Postgres + pgvector and the API come up on **:8000**. The first start downloads the embedding model.

**3. Start the frontend**
```bash
cd frontend
cp .env.local.example .env.local
npm install
npm run dev
```

Open **http://localhost:3000** · API docs at **http://localhost:8000/docs**

> 💡 **No API key?** Rewind still works: it falls back to showing the most relevant passages from your documents.

---

## ⚙️ Configuration

| Variable | Purpose | Default |
|---|---|---|
| `ANTHROPIC_API_KEY` | Primary LLM provider | none |
| `ANTHROPIC_MODEL` | Claude model to use | `claude-sonnet-5-5` |
| `GEMINI_API_KEY` / `GROQ_API_KEY` | Free fallback providers | none |
| `JWT_SECRET` | Signs login tokens (**required in production**) | dev-only value |
| `GOOGLE_CLIENT_ID` | Enables Google sign-in | none |
| `TURNSTILE_SECRET_KEY` | Cloudflare human check on sign-up | off |
| `EMBED_MODEL` | Local embedding model | `BAAI/bge-small-en-v1.5` |
| `MAX_SIGNUPS_PER_DAY` | Site-wide signup cap | `500` |
| `MAX_PARALLEL_INGEST` | Documents processed at once | `2` |
| `APP_ENV` | `production` hides `/docs`, trusts proxy IP, enforces real secret | `development` |
| `CORS_ORIGINS` | Allowed frontend origins | `http://localhost:3000` |

### Provider selection

```mermaid
flowchart LR
    S(["Question arrives"]) --> A{"ANTHROPIC_API_KEY<br/>starts with sk-ant?"}
    A -- "Yes" --> C["🟠 Claude"]
    A -- "No" --> G{"GEMINI_API_KEY set?"}
    G -- "Yes" --> GM["🔵 Gemini<br/>(retries + fallback model)"]
    G -- "No" --> R{"GROQ_API_KEY set?"}
    R -- "Yes" --> GQ["🟣 Groq · Llama 3.3 70B"]
    R -- "No" --> FB["📄 Show top passages only"]
```

---

## 🔌 API at a glance

| Method | Endpoint | What it does |
|---|---|---|
| `POST` | `/auth/register` · `/auth/login` · `/auth/google` | Sign up and sign in |
| `GET` | `/me` | Current user, plan, and usage |
| `POST` | `/documents` | Upload a file (ingests in the background) |
| `GET` | `/documents` | List documents and their status |
| `DELETE` | `/documents/{id}` | Delete a document and its chunks |
| `POST` | `/search` | Raw hybrid search (60 req/min per user) |
| `POST` | `/chat` | Ask a question; streams `token` and `sources` events |
| `GET` | `/conversations` | List past conversations |
| `GET` | `/conversations/{id}/messages` | Load a conversation |

---

## 🧪 Evaluate retrieval quality

Put your own questions in `backend/eval/questions.json`:

```json
[
  { "question": "What is the notice period?", "expect": ["30 days"] }
]
```

```bash
python backend/eval/run_eval.py --email you@example.com --password •••••• \
  --questions backend/eval/questions.json
```

It reports **retrieval hit rate** (did the right chunk come back?) and **answer hit rate** (did the answer contain it?).

---

## 🗂️ Project structure

```
Rewind/
├── backend/
│   ├── app/
│   │   ├── main.py        # routes, SSE chat stream
│   │   ├── retrieval.py   # vector + keyword + RRF
│   │   ├── ingest.py      # background extract → chunk → embed
│   │   ├── chunking.py    # PDF/DOCX/TXT extraction, overlap chunker
│   │   ├── llm.py         # Claude / Gemini / Groq streaming
│   │   ├── auth.py        # JWT, bcrypt, Google, Turnstile
│   │   ├── ratelimit.py   # sliding-window limiter
│   │   ├── config.py      # env settings, plan limits
│   │   ├── db.py          # connection pool
│   │   └── schema.sql     # tables + HNSW / GIN indexes
│   ├── eval/              # retrieval + answer evaluation
│   └── Dockerfile
├── frontend/
│   ├── app/               # Next.js app router, styles
│   ├── components/        # Landing, AuthForm, DocsPanel, ChatPanel…
│   └── lib/api.ts         # API client
├── docker-compose.yml
└── .env.example
```

---

## 🛣️ Roadmap

```mermaid
timeline
    title Where Rewind is going
    Shipped : Auth + Google sign-in : Hybrid retrieval : Streaming cited chat : Plan limits + usage : Eval script
    Next : Stripe checkout for Pro : OCR for scanned PDFs : Reranker on top of RRF
    Later : Real job queue (RQ / Celery) : Tests + CI : Hosted demo
```

---

<div align="center">

**Built so every answer can be checked.** ⏪

If Rewind helped you, a ⭐ on the repo means a lot.

</div>
