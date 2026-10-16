from pathlib import Path

import psycopg
from pgvector.psycopg import register_vector
from psycopg.rows import dict_row
from psycopg_pool import ConnectionPool

from . import config

pool = ConnectionPool(
    config.DATABASE_URL,
    min_size=1,
    max_size=10,
    kwargs={
        "row_factory": dict_row,
        # Ask the OS to keep the SSL connection alive so cloud databases don't silently drop it when idle.
        "keepalives": 1,
        "keepalives_idle": 30,
        "keepalives_interval": 10,
        "keepalives_count": 5,
        # Safe with hosted poolers (Supabase/Neon/pgbouncer), which don't support prepared statements.
        "prepare_threshold": None,
    },
    configure=register_vector,
    # Test a connection before handing it out; dead ones (server restarted, idle timeout,
    # "terminating connection due to administrator command") are replaced automatically.
    check=ConnectionPool.check_connection,
    max_idle=120,  # close spare connections after 2 minutes idle
    max_lifetime=900,  # recycle every connection after 15 minutes
    open=False,
)


def init_db() -> None:
    # The vector extension must exist before the pool registers the type on new connections.
    with psycopg.connect(config.DATABASE_URL, autocommit=True) as conn:
        conn.execute("CREATE EXTENSION IF NOT EXISTS vector")
        conn.execute(Path(__file__).with_name("schema.sql").read_text())
    pool.open()