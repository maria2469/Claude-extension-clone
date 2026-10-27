import json
import time
from typing import Any, AsyncIterator
import jwt
import pytest
from httpx import ASGITransport, AsyncClient

from app.agent.llm import Llm, set_provider
from app.core.config import settings
from app.main import app


class MockSuccessLlm(Llm):
    async def stream_turn(
        self, *, model, system, messages, tools, max_tokens
    ) -> AsyncIterator[dict[str, Any]]:
        yield {"type": "text", "delta": "Hello "}
        yield {"type": "text", "delta": "world!"}
        yield {
            "type": "final",
            "stop_reason": "end_turn",
            "content": [{"type": "text", "text": "Hello world!"}],
            "usage": {
                "input_tokens": 15,
                "output_tokens": 5,
                "cache_read_tokens": 0,
            },
        }


class MockFailingLlm(Llm):
    async def stream_turn(
        self, *, model, system, messages, tools, max_tokens
    ) -> AsyncIterator[dict[str, Any]]:
        yield {"type": "text", "delta": "Starting..."}
        raise RuntimeError("Anthropic upstream connection dropped")


def create_valid_token(user_id: str = "user-test") -> str:
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
async def test_agent_step_stream_success():
    set_provider(MockSuccessLlm())
    token = create_valid_token()

    body = {
        "messages": [{"role": "user", "content": "Hello"}],
        "page_url": "https://example.com",
        "run_id": "run-001",
    }

    async with AsyncClient(
        transport=ASGITransport(app=app), base_url="http://test"
    ) as ac:
        response = await ac.post(
            "/v1/agent/step",
            headers={"Authorization": f"Bearer {token}"},
            json=body,
        )
        assert response.status_code == 200
        assert "text/event-stream" in response.headers["content-type"]
        text = response.text

        # Verify event stream sequence: text deltas then final
        assert "event: text" in text
        assert '"delta":"Hello "' in text
        assert '"delta":"world!"' in text
        assert "event: final" in text
        assert '"stop_reason":"end_turn"' in text


@pytest.mark.asyncio
async def test_agent_step_stream_failure():
    set_provider(MockFailingLlm())
    token = create_valid_token()

    body = {
        "messages": [{"role": "user", "content": "Trigger error"}],
    }

    async with AsyncClient(
        transport=ASGITransport(app=app), base_url="http://test"
    ) as ac:
        response = await ac.post(
            "/v1/agent/step",
            headers={"Authorization": f"Bearer {token}"},
            json=body,
        )
        assert response.status_code == 200
        text = response.text

        # Stream reports error in-band once stream has started
        assert "event: error" in text
        assert '"status":502' in text
        assert '"message":"upstream_error"' in text
