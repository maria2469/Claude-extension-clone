from dataclasses import dataclass
from typing import AsyncIterator

from fastapi import Depends, Header, HTTPException, status
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.security import verify_token
from app.db.session import SessionLocal
from app.services.ratelimit import check_rate
from app.core.config import settings


import logging

logger = logging.getLogger("app.api.deps")


@dataclass
class CurrentUser:
    id: str
    email: str | None
    token: str  # kept so DB calls can run under the user's JWT (RLS stays the last defense)


async def get_current_user(authorization: str = Header(default="")) -> CurrentUser:
    scheme, _, token = authorization.partition(" ")
    if scheme.lower() != "bearer" or not token:
        logger.warning("[AUTH] Missing or invalid Authorization header: scheme='%s', token_present=%s", scheme, bool(token))
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, "missing_token")
    try:
        claims = verify_token(token)
        logger.info("[AUTH] Verified token for user_id='%s', email='%s'", claims.get("sub"), claims.get("email"))
        return CurrentUser(id=claims["sub"], email=claims.get("email"), token=token)
    except Exception as e:
        logger.warning("[AUTH] Token verification failed: %s", e)
        raise


async def get_db() -> AsyncIterator[AsyncSession]:
    async with SessionLocal() as session:
        yield session


async def step_rate_limit(user: CurrentUser = Depends(get_current_user)) -> CurrentUser:
    # 429 carries Retry-After; the extension waits that long (SDD section 10.7).
    await check_rate(f"step:{user.id}", settings.STEPS_PER_MINUTE, 60)
    return user
