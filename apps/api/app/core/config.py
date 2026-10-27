from functools import lru_cache
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    # One place for the brand so a rename never touches code (see SDD section 1).
    PRODUCT_NAME: str = "Malude"
    ENV: str = "development"

    GROQ_API_KEY: str = ""
    GEMINI_API_KEY: str = ""
    ANTHROPIC_API_KEY: str = ""
    MODEL_AGENT: str = "openai/gpt-oss-120b"
    MODEL_FAST: str = "openai/gpt-oss-20b"
    MODEL_GEMINI: str = "gemini-flash-lite-latest"

    SUPABASE_URL: str = ""
    SUPABASE_JWKS_URL: str = ""
    SUPABASE_JWT_SECRET: str = ""  # fallback only; prefer JWKS (asymmetric keys)
    DATABASE_URL: str = ""

    EXTENSION_ORIGINS: str = ""  # comma separated chrome-extension://<id>
    WEB_ORIGIN: str = ""
    SENTRY_DSN: str = ""

    MAX_BODY_BYTES: int = 5 * 1024 * 1024
    STEPS_PER_MINUTE: int = 30
    REVIEWS_PER_MINUTE: int = 10
    MAX_MESSAGES: int = 200
    # Plan limits live here until pricing is decided (no plans/billing module in v1).
    DAILY_TOKEN_BUDGET: int = 500_000  # per user per day; tune after measuring tokens per task in M2
    MAX_SCHEDULES: int = 10

    model_config = SettingsConfigDict(env_file=".env", extra="ignore")

    @property
    def extension_origins(self) -> list[str]:
        return [o.strip() for o in self.EXTENSION_ORIGINS.split(",") if o.strip()]


@lru_cache
def get_settings() -> Settings:
    return Settings()


settings = get_settings()
