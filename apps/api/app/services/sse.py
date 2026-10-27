import json
from typing import Any


def frame(event: str, data: dict[str, Any]) -> str:
    # One SSE frame. json.dumps escapes newlines, so data stays on a single line.
    return f"event: {event}\ndata: {json.dumps(data, separators=(',', ':'))}\n\n"
