import logging
import threading
from pathlib import Path

from . import config
from .chunking import chunk_text, extract_pages
from .db import pool

log = logging.getLogger(__name__)
_model = None
_slots = threading.BoundedSemaphore(config.MAX_PARALLEL_INGEST)  # limits CPU/memory use from uploads


def embedder():
    global _model
    if _model is None:
        from fastembed import TextEmbedding

        _model = TextEmbedding(model_name=config.EMBED_MODEL, cache_dir=config.MODEL_CACHE)
    return _model


def process_document(doc_id, path) -> None:
    """Runs in a background task: extract, chunk, embed, store."""
    try:
        with _slots:
            rows = [(page, c) for page, text in extract_pages(Path(path)) for c in chunk_text(text)]
            if not rows:
                raise ValueError("No extractable text (scanned PDFs need OCR, which is not enabled yet)")
            if len(rows) > config.MAX_CHUNKS:
                raise ValueError("Document is too large to index")

            vectors = []
            for i in range(0, len(rows), 64):
                vectors += list(embedder().embed([c for _, c in rows[i : i + 64]]))

        with pool.connection() as conn:
            user_id = conn.execute("SELECT user_id FROM documents WHERE id = %s", (doc_id,)).fetchone()["user_id"]
            with conn.cursor() as cur:
                cur.executemany(
                    "INSERT INTO chunks (document_id, user_id, page, idx, content, embedding) VALUES (%s,%s,%s,%s,%s,%s)",
                    [(doc_id, user_id, pg, i, c, v) for i, ((pg, c), v) in enumerate(zip(rows, vectors))],
                )
            conn.execute("UPDATE documents SET status='ready', n_chunks=%s WHERE id=%s", (len(rows), doc_id))
    except Exception as e:
        log.exception("Ingestion failed for %s", doc_id)
        # Show our own messages (ValueError); hide internal details of unexpected library errors.
        msg = str(e)[:300] if isinstance(e, ValueError) else "Could not read this file. It may be corrupted or password-protected."
        with pool.connection() as conn:
            conn.execute("UPDATE documents SET status='failed', error=%s WHERE id=%s", (msg, doc_id))