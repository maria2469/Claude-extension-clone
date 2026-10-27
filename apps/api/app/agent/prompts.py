from functools import lru_cache
from pathlib import Path

from app.core.config import settings

_DIR = Path(__file__).parent / "prompts"


@lru_cache
def _read(name: str) -> str:
    return (_DIR / f"{name}.md").read_text(encoding="utf-8").replace("{{PRODUCT}}", settings.PRODUCT_NAME)


def system_blocks(
    page_url: str | None,
    today: str,
    page_title: str | None = None,
    page_content: str | None = None,
) -> list[dict]:
    """Static block first and cached; volatile text last so the cache prefix never changes."""
    page_info = f"Current page URL: {page_url or 'none'}"
    if page_title:
        page_info += f"\nCurrent page Title: {page_title}"
    page_info += f"\nToday: {today}"

    blocks = [
        {"type": "text", "text": _read("system"), "cache_control": {"type": "ephemeral"}},
        {"type": "text", "text": page_info},
    ]

    if page_content and page_content.strip():
        # Truncate content to avoid exceeding LLM context or TPM limits (Groq free tier has 8k TPM limit)
        trimmed = page_content.strip()
        if len(trimmed) > 10000:
            trimmed = trimmed[:10000] + "\n\n... [Content truncated to fit context limits] ..."
        blocks.append({
            "type": "text",
            "text": f"=== Active Browser Tab Content ===\n{trimmed}\n=== End Active Browser Tab Content ===",
        })

    return blocks


def review_prompt() -> str:
    return _read("review")


def classify_prompt() -> str:
    return _read("classify")


def summarize_prompt() -> str:
    return _read("summarize")
