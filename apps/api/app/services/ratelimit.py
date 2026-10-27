import time
from collections import defaultdict
from fastapi import HTTPException

# In-memory rate limiting bucket store: {bucket_key: count}
_buckets: dict[str, int] = defaultdict(int)
_expiry: dict[str, float] = {}


def reset_rate_limits() -> None:
    """Reset all rate limit counters (useful in tests)."""
    _buckets.clear()
    _expiry.clear()


async def check_rate(key: str, limit: int, window_s: int) -> None:
    """In-memory fixed-window rate limiter without Redis dependency."""
    now = time.time()
    bucket = int(now // window_s)
    k = f"rl:{key}:{bucket}"

    # Periodically clean up expired entries if dictionary grows
    if len(_buckets) > 1000:
        expired_keys = [b for b, exp in _expiry.items() if exp < now]
        for b in expired_keys:
            _buckets.pop(b, None)
            _expiry.pop(b, None)

    _buckets[k] += 1
    if k not in _expiry:
        _expiry[k] = now + window_s + 1

    if _buckets[k] > limit:
        raise HTTPException(429, "rate_limited", headers={"Retry-After": str(window_s)})
