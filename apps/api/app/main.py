from contextlib import asynccontextmanager

from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse

from app.api.v1.router import api_router
from app.core.config import settings
from app.core.logging import configure_logging
from app.core.origins import allowed_origins
from app.core.startup import shutdown, startup


@asynccontextmanager
async def lifespan(app: FastAPI):
    configure_logging()
    await startup()
    yield
    await shutdown()


app = FastAPI(
    title=f"{settings.PRODUCT_NAME} API",
    lifespan=lifespan,
    docs_url=None if settings.ENV == "production" else "/docs",
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=allowed_origins(),
    allow_credentials=False,
    allow_methods=["GET", "POST", "PATCH", "DELETE"],
    allow_headers=[
        "Authorization",
        "Content-Type",
        "X-Run-Id",
        "X-Trace-Id",
        "X-Client-Version",
    ],
)


@app.middleware("http")
async def limit_body(request: Request, call_next):
    # Reject oversized bodies early (SDD section 10.3).
    size = request.headers.get("content-length")
    if size and int(size) > settings.MAX_BODY_BYTES:
        return JSONResponse({"detail": "too_large"}, status_code=413)
    return await call_next(request)


# Root health endpoint per Section 3.4 contract: GET /health
@app.get("/health", tags=["health"])
async def root_health():
    return {"status": "ok"}


app.include_router(api_router, prefix="/v1")
