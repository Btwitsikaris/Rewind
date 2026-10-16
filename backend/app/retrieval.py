import uuid

from .db import pool
from .ingest import embedder

DOC_FILTER = "(%(docs)s::uuid[] IS NULL OR c.document_id = ANY(%(docs)s::uuid[]))"

VECTOR_SQL = f"""
SELECT c.id, c.document_id, d.filename, c.page, c.content
FROM chunks c JOIN documents d ON d.id = c.document_id
WHERE c.user_id = %(uid)s AND {DOC_FILTER}
ORDER BY c.embedding <=> %(qvec)s LIMIT 20
"""

KEYWORD_SQL = f"""
SELECT c.id, c.document_id, d.filename, c.page, c.content
FROM chunks c JOIN documents d ON d.id = c.document_id,
     websearch_to_tsquery('english', %(text)s) q
WHERE c.user_id = %(uid)s AND c.tsv @@ q AND {DOC_FILTER}
ORDER BY ts_rank_cd(c.tsv, q) DESC LIMIT 20
"""


def search(user_id, query: str, k: int = 6, document_ids=None) -> list[dict]:
    """Hybrid search: pgvector similarity + Postgres full text, merged with reciprocal rank fusion.
    Every query is filtered by user_id, so one user can never retrieve another user's chunks."""
    qvec = list(embedder().query_embed([query]))[0]
    params = {
        "uid": user_id,
        "qvec": qvec,
        "text": query,
        "docs": [uuid.UUID(str(d)) for d in document_ids] if document_ids else None,
    }
    with pool.connection() as conn:
        vec_rows = conn.execute(VECTOR_SQL, params).fetchall()
        kw_rows = conn.execute(KEYWORD_SQL, params).fetchall()

    scores: dict[int, float] = {}
    by_id: dict[int, dict] = {}
    for rows in (vec_rows, kw_rows):
        for rank, r in enumerate(rows):
            scores[r["id"]] = scores.get(r["id"], 0.0) + 1.0 / (60 + rank + 1)
            by_id[r["id"]] = r
    top = sorted(scores, key=scores.get, reverse=True)[:k]
    return [{**by_id[i], "document_id": str(by_id[i]["document_id"]), "score": round(scores[i], 4)} for i in top]
