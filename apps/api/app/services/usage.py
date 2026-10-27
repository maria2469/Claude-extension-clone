import time
from typing import Any
from collections import defaultdict
from fastapi import HTTPException

from app.core.config import settings

# In-memory daily token counter per user: {day_key: total_tokens}
_mem_usage: dict[str, int] = defaultdict(int)


def reset_usage() -> None:
    """Reset token usage tracking (useful in tests)."""
    _mem_usage.clear()


async def check_budget(user_id: str) -> None:
    """Enforce daily token budget per user in-memory.

    Raises 429 if the user's token spend in the current day window exceeds DAILY_TOKEN_BUDGET.
    """
    day_key = f"usage:tokens:{user_id}:{int(time.time() // 86400)}"
    used = _mem_usage[day_key]

    if used >= settings.DAILY_TOKEN_BUDGET:
        raise HTTPException(
            status_code=429,
            detail="daily_token_budget_exceeded",
            headers={"Retry-After": "86400"},
        )


async def record_usage(
    user_id: str, run_id: str | None, model: str, usage: dict[str, Any]
) -> None:
    """Record token spend for this turn into the in-memory daily counter."""
    total_tokens = usage.get("input_tokens", 0) + usage.get("output_tokens", 0)
    day_key = f"usage:tokens:{user_id}:{int(time.time() // 86400)}"
    _mem_usage[day_key] += total_tokens
