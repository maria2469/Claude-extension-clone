import time
from typing import Any, AsyncIterator
import jwt
import pytest
from httpx import ASGITransport, AsyncClient

from app.agent.llm import Llm, set_provider
from app.core.config import settings
from app.main import app
from app.services.ratelimit import reset_rate_limits


class MockLlm(Llm):
    async def stream_turn(
        self, *, model, system, messages, tools, max_tokens
    ) -> AsyncIterator[dict[str, Any]]:
        yield {"type": "text", "delta": "ok"}
        yield {
            "type": "final",
            "stop_reason": "end_turn",
            "content": [{"type": "text", "text": "ok"}],
            "usage": {"input_tokens": 1, "output_tokens": 1, "cache_read_tokens": 0},
        }


def create_valid_token(user_id: str = "rate-limited-user") -> str:
    settings.SUPABASE_JWT_SECRET = "test-secret-key-32-bytes-minimum-length!!"
    settings.SUPABASE_JWKS_URL = ""
    payload = {
        "sub": user_id,
        "email": f"{user_id}@example.com",
        "aud": "authenticated",
        "exp": int(time.time()) + 3600,
    }
    return jwt.encode(payload, settings.SUPABASE_JWT_SECRET, algorithm="HS256")


@pytest.mark.asyncio
async def test_31st_step_call_returns_429():
    reset_rate_limits()
    set_provider(MockLlm())

    user_id = "user-limit-test"
    token = create_valid_token(user_id)
    headers = {"Authorization": f"Bearer {token}"}
    body = {"messages": [{"role": "user", "content": "ping"}]}

    async with AsyncClient(
        transport=ASGITransport(app=app), base_url="http://test"
    ) as ac:
        # First 30 requests within limit should succeed
        for i in range(settings.STEPS_PER_MINUTE):
            resp = await ac.post("/v1/agent/step", headers=headers, json=body)
            assert resp.status_code == 200, f"Call {i+1} failed"

        # The 31st call must return 429 rate limited with Retry-After header
        resp_31 = await ac.post("/v1/agent/step", headers=headers, json=body)
        assert resp_31.status_code == 429
        assert resp_31.json()["detail"] == "rate_limited"
        assert "Retry-After" in resp_31.headers
        assert resp_31.headers["Retry-After"] == "60"

    reset_rate_limits()
