import json
from datetime import date

from fastapi import APIRouter, Depends
from fastapi.responses import StreamingResponse

from app.agent.llm import model_for, provider
from app.agent.prompts import classify_prompt, review_prompt, summarize_prompt, system_blocks
from app.agent.types import (
    ClassifyRequest, ClassifyResponse, ReviewRequest, ReviewResult, StepRequest,
)
from app.api.deps import CurrentUser, get_current_user, step_rate_limit
from app.core.config import settings
from app.services.ratelimit import check_rate
from app.services.sse import frame
from app.services.usage import check_budget, record_usage

import logging

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/agent", tags=["agent"])


@router.post("/step")
async def step(body: StepRequest, user: CurrentUser = Depends(step_rate_limit)):
    logger.info(
        "[AGENT] -> POST /v1/agent/step (user_id='%s', messages=%d, page_url='%s', title='%s', has_content=%s)",
        user.id, len(body.messages), body.page_url or "none", body.page_title or "none", bool(body.page_content),
    )
    await check_budget(user.id)  # 429 when the daily token budget is spent

    async def gen():
        try:
            delta_count = 0
            tool_use_count = 0
            async for ev in provider().stream_turn(
                model=model_for("agent"),
                system=system_blocks(
                    body.page_url,
                    date.today().isoformat(),
                    page_title=body.page_title,
                    page_content=body.page_content,
                ),
                messages=body.messages,
                tools=body.tools,
                max_tokens=body.max_tokens,
            ):
                if ev["type"] == "text":
                    delta_count += 1
                    yield frame("text", {"delta": ev["delta"]})
                elif ev["type"] == "final":
                    # Count tool_use blocks for logging
                    content = ev.get("content", [])
                    tool_use_count = sum(1 for c in content if isinstance(c, dict) and c.get("type") == "tool_use")
                    await record_usage(user.id, body.run_id, model_for("agent"), ev["usage"])
                    logger.info(
                        "[AGENT] <- Stream finished (%d text chunks, %d tool_use blocks, stop_reason=%s, usage=%s)",
                        delta_count, tool_use_count, ev.get("stop_reason"), ev.get("usage"),
                    )
                    # Emit full final event including tool_use blocks for the frontend agent loop
                    yield frame("final", {k: v for k, v in ev.items() if k != "type"})
        except Exception as e:  # stream already started, so report in-band
            logger.exception("[AGENT] Upstream error in stream_turn: %s", e)
            msg = str(e)
            if "rate_limit" in msg.lower() or "413" in msg or "too large" in msg.lower():
                err_text = "Page content exceeded rate/token limit. Content has been optimized—please try again."
            elif "credit balance is too low" in msg.lower() or "billing" in msg.lower():
                err_text = "LLM API credits depleted. Please verify your API key."
            else:
                err_text = f"Upstream error: {msg[:100]}"
            yield frame("error", {"status": 502, "message": err_text})

    # X-Accel-Buffering stops nginx-style proxies from buffering the stream.
    return StreamingResponse(
        gen(), media_type="text/event-stream",
        headers={"Cache-Control": "no-cache", "X-Accel-Buffering": "no"},
    )


@router.post("/review", response_model=ReviewResult)
async def review(body: ReviewRequest, user: CurrentUser = Depends(get_current_user)):
    await check_rate(f"review:{user.id}", settings.REVIEWS_PER_MINUTE, 60)
    try:
        raw = await provider().complete_json(
            model=model_for("review"), system=review_prompt(), max_tokens=200,
            user=json.dumps({"user_goal": body.user_goal, "action": body.action, "page_url": body.page_url}),
        )
        data = json.loads(raw.strip().removeprefix("```json").removesuffix("```").strip())
        return ReviewResult(allow=bool(data["allow"]), reason=str(data.get("reason", ""))[:300])
    except Exception:
        # FAIL CLOSED: any parse error, timeout or API failure blocks the action.
        return ReviewResult(allow=False, reason="review_unavailable")


@router.post("/classify", response_model=ClassifyResponse)
async def classify(body: ClassifyRequest, user: CurrentUser = Depends(get_current_user)):
    try:
        raw = await provider().complete_json(
            model=model_for("classify"), system=classify_prompt(), max_tokens=300,
            user=json.dumps({"url": body.source_url, "text": body.text}),
        )
        return ClassifyResponse(**json.loads(raw.strip().removeprefix("```json").removesuffix("```").strip()))
    except Exception:
        # Unknown is treated as suspicious: the extension then asks the user before acting.
        return ClassifyResponse(injection_score=1.0, reason="classifier_unavailable")


@router.post("/summarize")
async def summarize(body: StepRequest, user: CurrentUser = Depends(get_current_user)):
    text = await provider().complete_json(
        model=model_for("summarize"), system=summarize_prompt(), max_tokens=800,
        user=json.dumps(body.messages),
    )
    return {"summary": text}
