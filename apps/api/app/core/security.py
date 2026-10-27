import jwt  # PyJWT
from jwt import PyJWKClient
from fastapi import HTTPException, status

from app.core.config import settings

def _get_jwks_client() -> PyJWKClient | None:
    if settings.SUPABASE_JWKS_URL:
        return PyJWKClient(settings.SUPABASE_JWKS_URL)
    return None


def verify_token(token: str) -> dict:
    """Return JWT claims or raise 401.

    Why two paths: new Supabase projects sign with asymmetric keys (JWKS);
    older ones use a shared HS256 secret. We never accept alg=none.
    """
    try:
        # Never accept alg=none under any condition (SDD Section 3.3)
        header = jwt.get_unverified_header(token)
        alg = header.get("alg")
        if not alg or alg == "none":
            raise HTTPException(status.HTTP_401_UNAUTHORIZED, "invalid_token")
    except Exception:
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, "invalid_token")

    try:
        if alg in ("RS256", "ES256"):
            jwks = _get_jwks_client()
            if jwks is not None:
                key = jwks.get_signing_key_from_jwt(token).key
                return jwt.decode(
                    token, key, algorithms=["RS256", "ES256"], audience="authenticated"
                )
        secret = settings.SUPABASE_JWT_SECRET or "dev-secret-key-for-local-testing-32-chars-long!"
        return jwt.decode(
            token,
            secret,
            algorithms=["HS256"],
            audience="authenticated",
        )
    except jwt.PyJWTError:
        pass

    raise HTTPException(status.HTTP_401_UNAUTHORIZED, "invalid_token")
