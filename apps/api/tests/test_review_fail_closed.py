import time
import jwt
import pytest
from httpx import ASGITransport, AsyncClient

from app.agent.llm import Llm, set_provider
from app.core.config import settings
from app.main import app


class MockReviewMalformedLlm(Llm):
    async def complete_json(self, *, model, system, user, max_tokens) -> str:
        return "I am not returning valid json at all {broken"


class MockReviewExceptionLlm(Llm):
    async def complete_json(self, *, model, system, user, max_tokens) -> str:
        raise TimeoutError("Upstream LLM call timed out")


class MockReviewValidLlm(Llm):
    async def complete_json(self, *, model, system, user, max_tokens) -> str:
        return '```json\n{"allow": true, "reason": "Action is benign"}\n```'


def create_valid_token(user_id: str = "review-user") -> str:
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
async def test_review_malformed_json_fails_closed():
    set_provider(MockReviewMalformedLlm())
    token = create_valid_token()

    body = {
        "user_goal": "Check flight prices",
        "action": {"tool": "click", "selector": "#search"},
        "page_url": "https://flights.example",
    }

    async with AsyncClient(
        transport=ASGITransport(app=app), base_url="http://test"
    ) as ac:
        response = await ac.post(
            "/v1/agent/review",
            headers={"Authorization": f"Bearer {token}"},
            json=body,
        )
        assert response.status_code == 200
        data = response.json()
        assert data["allow"] is False
        assert data["reason"] == "review_unavailable"


@pytest.mark.asyncio
async def test_review_exception_fails_closed():
    set_provider(MockReviewExceptionLlm())
    token = create_valid_token()

    body = {
        "user_goal": "Delete account",
        "action": {"tool": "click", "selector": "#delete-btn"},
    }

    async with AsyncClient(
        transport=ASGITransport(app=app), base_url="http://test"
    ) as ac:
        response = await ac.post(
            "/v1/agent/review",
            headers={"Authorization": f"Bearer {token}"},
            json=body,
        )
        assert response.status_code == 200
        data = response.json()
        assert data["allow"] is False
        assert data["reason"] == "review_unavailable"


@pytest.mark.asyncio
async def test_review_valid_json_succeeds():
    set_provider(MockReviewValidLlm())
    token = create_valid_token()

    body = {
        "user_goal": "Check prices",
        "action": {"tool": "click", "selector": "#view"},
    }

    async with AsyncClient(
        transport=ASGITransport(app=app), base_url="http://test"
    ) as ac:
        response = await ac.post(
            "/v1/agent/review",
            headers={"Authorization": f"Bearer {token}"},
            json=body,
        )
        assert response.status_code == 200
        data = response.json()
        assert data["allow"] is True
        assert data["reason"] == "Action is benign"
