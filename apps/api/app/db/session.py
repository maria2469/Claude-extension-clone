from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker, create_async_engine

from app.core.config import settings

# In tests or lightweight setups without PostgreSQL, we provide a placeholder
# engine or create the engine from DATABASE_URL.
if settings.DATABASE_URL:
    engine = create_async_engine(settings.DATABASE_URL, echo=False, pool_pre_ping=True)
else:
    # Fallback in-memory sqlite for local/test runs without a configured postgres
    engine = create_async_engine("sqlite+aiosqlite:///:memory:", echo=False)

SessionLocal = async_sessionmaker(
    bind=engine,
    class_=AsyncSession,
    expire_on_commit=False,
    autocommit=False,
    autoflush=False,
)
