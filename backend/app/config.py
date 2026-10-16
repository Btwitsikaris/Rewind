import os

# Read settings from a .env file (this folder or any parent, e.g. the project root) when running locally.
# Real environment variables always win, so Docker and hosting platforms are unaffected.
try:
    from dotenv import find_dotenv, load_dotenv

    load_dotenv(find_dotenv(usecwd=True))
except ImportError:
    pass

DATABASE_URL = os.environ.get("DATABASE_URL", "postgresql://rag:rag@localhost:5432/rag")
JWT_SECRET = os.environ.get("JWT_SECRET", "dev-only-change-me")
# Set APP_ENV=production on your server: hides /docs, trusts the hosting proxy's client IP header,
# and enforces a real JWT_SECRET.
APP_ENV = os.environ.get("APP_ENV", "development").lower()
IS_PROD = APP_ENV == "production"
TRUST_PROXY = os.environ.get("TRUST_PROXY", "1" if IS_PROD else "0") == "1"

# Refuse to run a public server with the built-in dev secret (anyone could forge login tokens).
_LOCAL_DB = ("localhost", "127.0.0.1", "@db:")
if JWT_SECRET == "dev-only-change-me" and (IS_PROD or not any(h in DATABASE_URL for h in _LOCAL_DB)):
    raise RuntimeError("Set a long random JWT_SECRET environment variable before deploying.")
GOOGLE_CLIENT_ID = os.environ.get("GOOGLE_CLIENT_ID", "")
ANTHROPIC_API_KEY = os.environ.get("ANTHROPIC_API_KEY", "")
GEMINI_API_KEY = os.environ.get("GEMINI_API_KEY", "")  # free key from https://aistudio.google.com/apikey
GEMINI_MODEL = os.environ.get("GEMINI_MODEL", "gemini-flash-latest")
GEMINI_FALLBACK_MODEL = os.environ.get("GEMINI_FALLBACK_MODEL", "gemini-3.1-flash-lite")  # tried if the main model is busy
GROQ_API_KEY = os.environ.get("GROQ_API_KEY", "")  # free key from https://console.groq.com/keys
GROQ_MODEL = os.environ.get("GROQ_MODEL", "llama-3.3-70b-versatile")
ANTHROPIC_MODEL = os.environ.get("ANTHROPIC_MODEL", "claude-sonnet-5-5")
EMBED_MODEL = os.environ.get("EMBED_MODEL", "BAAI/bge-small-en-v1.5")  # 384 dimensions
STORAGE_DIR = os.environ.get("STORAGE_DIR", "./storage")
MODEL_CACHE = os.environ.get("MODEL_CACHE", "./model_cache")
CORS_ORIGINS = [o.strip() for o in os.environ.get("CORS_ORIGINS", "http://localhost:3000").split(",") if o.strip()]
MAX_UPLOAD_MB = 15

# Abuse protection
TURNSTILE_SECRET_KEY = os.environ.get("TURNSTILE_SECRET_KEY", "")  # Cloudflare Turnstile; empty = no human check
MAX_SIGNUPS_PER_DAY = int(os.environ.get("MAX_SIGNUPS_PER_DAY", "500"))  # new accounts per day, whole site
MAX_PARALLEL_INGEST = int(os.environ.get("MAX_PARALLEL_INGEST", "2"))  # documents processed at the same time
MAX_PDF_PAGES = 500
MAX_CHUNKS = 6000
MAX_UNPACKED_MB = 100  # DOCX files are zip archives; refuse ones that expand to more than this

PLANS = {
    "free": {"questions_per_day": 20, "max_documents": 5},
    "pro": {"questions_per_day": 500, "max_documents": 100},
}
