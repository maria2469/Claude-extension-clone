import logging
import sentry_sdk

from app.core.config import settings

logger = logging.getLogger(__name__)


async def startup() -> None:
    """Run application startup hooks, such as Sentry initialization."""
    if settings.SENTRY_DSN:
        # Scrub URLs to origin to avoid leaking sensitive query params or paths
        sentry_sdk.init(
            dsn=settings.SENTRY_DSN,
            environment=settings.ENV,
            send_default_pii=False,
        )
        logger.info("Sentry initialized")
    logger.info("%s API starting up in %s mode", settings.PRODUCT_NAME, settings.ENV)


async def shutdown() -> None:
    """Run application shutdown hooks and clean up connections."""
    logger.info("%s API shutting down", settings.PRODUCT_NAME)
