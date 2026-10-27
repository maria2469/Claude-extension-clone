import time
import jwt
import pytest
from httpx import ASGITransport, AsyncClient

from app.core.config import settings
from app.main import app


@pytest.fixture(autouse=True)
def setup_jwt_secret():
    # Use HS256 secret for predictable test token generation
    settings.SUPABASE_JWT_SECRET = "test-secret-key-32-bytes-minimum-length!!"
    settings.SUPABASE_JWKS_URL = ""


@pytest.mark.asyncio
async def test_auth_missing_token():
    async with AsyncClient(
        transport=ASGITransport(app=app), base_url="http://test"
    ) as ac:
        response = await ac.get("/v1/me")
        assert response.status_code == 401
        assert response.json()["detail"] == "missing_token"


@pytest.mark.asyncio
async def test_auth_expired_token():
    payload = {
        "sub": "user-123",
        "email": "user@example.com",
        "aud": "authenticated",
        "exp": int(time.time()) - 3600,
    }
    token = jwt.encode(payload, settings.SUPABASE_JWT_SECRET, algorithm="HS256")
    async with AsyncClient(
        transport=ASGITransport(app=app), base_url="http://test"
    ) as ac:
        response = await ac.get(
            "/v1/me", headers={"Authorization": f"Bearer {token}"}
        )
        assert response.status_code == 401
        assert response.json()["detail"] == "invalid_token"


@pytest.mark.asyncio
async def test_auth_wrong_audience():
    payload = {
        "sub": "user-123",
        "email": "user@example.com",
        "aud": "wrong-audience",
        "exp": int(time.time()) + 3600,
    }
    token = jwt.encode(payload, settings.SUPABASE_JWT_SECRET, algorithm="HS256")
    async with AsyncClient(
        transport=ASGITransport(app=app), base_url="http://test"
    ) as ac:
        response = await ac.get(
            "/v1/me", headers={"Authorization": f"Bearer {token}"}
        )
        assert response.status_code == 401
        assert response.json()["detail"] == "invalid_token"


@pytest.mark.asyncio
async def test_auth_alg_none():
    # Attempt unsigned token attack
    payload = {
        "sub": "user-123",
        "email": "user@example.com",
        "aud": "authenticated",
        "exp": int(time.time()) + 3600,
    }
    token = jwt.encode(payload, key="", algorithm="none")
    async with AsyncClient(
        transport=ASGITransport(app=app), base_url="http://test"
    ) as ac:
        response = await ac.get(
            "/v1/me", headers={"Authorization": f"Bearer {token}"}
        )
        assert response.status_code == 401
        assert response.json()["detail"] == "invalid_token"


@pytest.mark.asyncio
async def test_auth_valid_token():
    payload = {
        "sub": "user-123",
        "email": "user@example.com",
        "aud": "authenticated",
        "exp": int(time.time()) + 3600,
    }
    token = jwt.encode(payload, settings.SUPABASE_JWT_SECRET, algorithm="HS256")
    async with AsyncClient(
        transport=ASGITransport(app=app), base_url="http://test"
    ) as ac:
        response = await ac.get(
            "/v1/me", headers={"Authorization": f"Bearer {token}"}
        )
        assert response.status_code == 200
        data = response.json()
        assert data["id"] == "user-123"
        assert data["email"] == "user@example.com"
        assert data["plan"] == "free"
