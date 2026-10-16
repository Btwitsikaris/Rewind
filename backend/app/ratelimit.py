"""Small in-memory rate limiter (sliding window). Enough for a single server instance; if you run several
instances, each keeps its own counters (use Redis for a shared limit)."""
import math
import threading
import time
from collections import defaultdict, deque

from fastapi import HTTPException, Request

from . import config

_hits: dict[str, deque] = defaultdict(deque)
_lock = threading.Lock()
_MAX_WINDOW = 3600  # longest window used anywhere; older entries are always safe to drop
_last_sweep = 0.0


def client_ip(request: Request) -> str:
    """Behind a hosting proxy the socket address is the proxy, so read the forwarded header instead."""
    if config.TRUST_PROXY:
        fwd = request.headers.get("x-forwarded-for", "")
        if fwd:
            return fwd.split(",")[0].strip()
    return request.client.host if request.client else "unknown"


def _sweep(now: float) -> None:
    global _last_sweep
    if now - _last_sweep < 300:
        return
    _last_sweep = now
    for k in [k for k, q in _hits.items() if not q or q[-1] < now - _MAX_WINDOW]:
        del _hits[k]


def _too_many(q: deque, now: float, window: int) -> HTTPException:
    retry = max(1, int(q[0] + window - now) + 1)
    mins = math.ceil(retry / 60)
    wait = f"{retry} seconds" if retry < 60 else f"{mins} minute{'s' if mins != 1 else ''}"
    return HTTPException(429, f"Too many attempts. Please try again in {wait}.", headers={"Retry-After": str(retry)})


def check(key: str, limit: int, window: int) -> None:
    """Raise 429 if `key` already used up its `limit` events in the last `window` seconds."""
    now = time.monotonic()
    with _lock:
        _sweep(now)
        q = _hits[key]
        while q and q[0] <= now - window:
            q.popleft()
        if len(q) >= limit:
            raise _too_many(q, now, window)


def add(key: str) -> None:
    with _lock:
        _hits[key].append(time.monotonic())


def hit(key: str, limit: int, window: int) -> None:
    """Count one event and raise 429 if that goes over the limit."""
    check(key, limit, window)
    add(key)