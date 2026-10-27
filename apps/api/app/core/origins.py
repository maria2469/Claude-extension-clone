from app.core.config import settings


def allowed_origins() -> list[str]:
    # Only our own extension ids and web app. Never "*": the API accepts bearer tokens.
    out = list(settings.extension_origins)
    if settings.WEB_ORIGIN:
        out.append(settings.WEB_ORIGIN)
    return out
