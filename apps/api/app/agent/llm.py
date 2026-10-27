import asyncio
import json as _json
import logging
import re
from typing import Any, AsyncIterator

import httpx
from anthropic import AsyncAnthropic
from groq import AsyncGroq

from app.core.config import settings

_logger = logging.getLogger(__name__)


def _get_groq_client() -> AsyncGroq | None:
    if settings.GROQ_API_KEY:
        return AsyncGroq(api_key=settings.GROQ_API_KEY)
    return None


def _get_anthropic_client() -> AsyncAnthropic:
    return AsyncAnthropic(api_key=settings.ANTHROPIC_API_KEY or "dummy-key-for-init")


def model_for(task: str) -> str:
    return settings.MODEL_AGENT if task == "agent" else settings.MODEL_FAST


def _format_system(system: Any) -> str:
    if isinstance(system, list):
        return "\n\n".join(
            b["text"] for b in system if isinstance(b, dict) and "text" in b
        )
    return str(system or "")


def _format_messages_for_groq(
    messages: list[dict[str, Any]], system_text: str = ""
) -> list[dict[str, Any]]:
    """Convert Anthropic-format messages to OpenAI/Groq/Gemini format."""
    formatted: list[dict[str, Any]] = []
    if system_text:
        formatted.append({"role": "system", "content": system_text})
    for m in messages:
        role = m.get("role", "user")
        content = m.get("content", "")

        # Handle list content (may contain text blocks or tool_use/tool_result)
        if isinstance(content, list):
            text_parts = []
            tool_calls = []
            tool_results = []
            for part in content:
                if not isinstance(part, dict):
                    text_parts.append(str(part))
                    continue
                ptype = part.get("type", "")
                if ptype == "text":
                    text_parts.append(part["text"])
                elif ptype == "tool_use":
                    # Anthropic tool_use -> OpenAI tool_calls
                    tool_calls.append({
                        "id": part["id"],
                        "type": "function",
                        "function": {
                            "name": part["name"],
                            "arguments": _json.dumps(part.get("input", {})),
                        },
                    })
                elif ptype == "tool_result":
                    tool_results.append((part.get("tool_use_id", ""), str(part.get("content", ""))))

            if tool_calls:
                # Assistant message with tool calls
                msg: dict[str, Any] = {"role": "assistant", "content": " ".join(text_parts) or None, "tool_calls": tool_calls}
                formatted.append(msg)
                continue
            elif tool_results:
                # One tool message per tool result
                for tid, tcontent in tool_results:
                    formatted.append({"role": "tool", "tool_call_id": tid, "content": tcontent})
                continue
            content = "\n".join(text_parts)

        formatted.append({"role": role, "content": content})
    return formatted


def _convert_tools_for_groq(tools: list[dict[str, Any]]) -> list[dict[str, Any]]:
    """Convert Anthropic tool schemas to OpenAI/Groq/Gemini function format."""
    result = []
    for t in tools:
        result.append({
            "type": "function",
            "function": {
                "name": t["name"],
                "description": t.get("description", ""),
                "parameters": t.get("input_schema", {"type": "object", "properties": {}}),
            },
        })
    return result


async def _stream_gemini(
    conv_messages: list[dict[str, Any]],
    tools: list[dict[str, Any]] | None,
    max_tokens: int | None = None,
) -> AsyncIterator[dict[str, Any]]:
    """Stream completions from Google Gemini via its OpenAI-compatible endpoint."""
    url = "https://generativelanguage.googleapis.com/v1beta/openai/chat/completions"
    headers = {
        "Authorization": f"Bearer {settings.GEMINI_API_KEY}",
        "Content-Type": "application/json",
    }
    body: dict[str, Any] = {
        "model": settings.MODEL_GEMINI or "gemini-2.5-flash",
        "messages": conv_messages,
        "stream": True,
    }
    if tools:
        body["tools"] = tools
        body["tool_choice"] = "auto"
    if max_tokens:
        body["max_tokens"] = min(max_tokens, 2048)

    full_text: list[str] = []
    accumulated_tool_calls: dict[int, dict[str, Any]] = {}
    finish_reason = "end_turn"

    async with httpx.AsyncClient(timeout=45.0) as client:
        async with client.stream("POST", url, headers=headers, json=body) as response:
            if response.status_code != 200:
                raw_err = await response.aread()
                raise RuntimeError(
                    f"Gemini API returned status {response.status_code}: {raw_err.decode('utf-8', errors='replace')[:400]}"
                )

            async for line in response.aiter_lines():
                line = line.strip()
                if not line or not line.startswith("data: "):
                    continue
                data_str = line[6:].strip()
                if data_str == "[DONE]":
                    break

                try:
                    chunk = _json.loads(data_str)
                except Exception:
                    continue

                if not chunk.get("choices"):
                    continue
                choice = chunk["choices"][0]
                delta = choice.get("delta") or {}

                # Text delta
                if delta.get("content"):
                    c_delta = delta["content"]
                    full_text.append(c_delta)
                    yield {"type": "text", "delta": c_delta}

                # Tool calls
                if delta.get("tool_calls"):
                    for tc in delta["tool_calls"]:
                        idx = tc.get("index", 0)
                        if idx not in accumulated_tool_calls:
                            accumulated_tool_calls[idx] = {
                                "id": tc.get("id") or "",
                                "name": tc.get("function", {}).get("name") if tc.get("function") else "",
                                "arguments": "",
                            }
                        if tc.get("id"):
                            accumulated_tool_calls[idx]["id"] = tc["id"]
                        fn = tc.get("function")
                        if fn:
                            if fn.get("name"):
                                accumulated_tool_calls[idx]["name"] = fn["name"]
                            if fn.get("arguments"):
                                accumulated_tool_calls[idx]["arguments"] += fn["arguments"]

                fr = choice.get("finish_reason")
                if fr:
                    finish_reason = "tool_use" if fr in ("tool_calls", "function_call") else ("end_turn" if fr == "stop" else fr)

    total_text = "".join(full_text)
    out_tokens = max(1, len(total_text) // 4)
    in_tokens = sum(len(str(m.get("content", ""))) // 4 for m in conv_messages)

    content_blocks: list[dict[str, Any]] = []
    if total_text:
        content_blocks.append({"type": "text", "text": total_text})
    for tc in accumulated_tool_calls.values():
        try:
            parsed_input = _json.loads(tc["arguments"] or "{}")
        except Exception:
            parsed_input = {"raw": tc["arguments"]}
        content_blocks.append({
            "type": "tool_use",
            "id": tc["id"] or f"toolu_{tc['name']}_{id(tc)}",
            "name": tc["name"],
            "input": parsed_input,
        })

    yield {
        "type": "final",
        "stop_reason": finish_reason,
        "content": content_blocks if content_blocks else [{"type": "text", "text": total_text}],
        "usage": {
            "input_tokens": in_tokens,
            "output_tokens": out_tokens,
            "cache_read_tokens": 0,
        },
    }


async def _complete_gemini(
    conv_messages: list[dict[str, Any]],
    max_tokens: int | None = None,
) -> str:
    """Non-streaming call to Gemini for JSON/summaries."""
    url = "https://generativelanguage.googleapis.com/v1beta/openai/chat/completions"
    headers = {
        "Authorization": f"Bearer {settings.GEMINI_API_KEY}",
        "Content-Type": "application/json",
    }
    body: dict[str, Any] = {
        "model": settings.MODEL_GEMINI or "gemini-2.5-flash",
        "messages": conv_messages,
        "temperature": 0.1,
    }
    if max_tokens:
        body["max_tokens"] = max_tokens
    async with httpx.AsyncClient(timeout=30.0) as client:
        resp = await client.post(url, headers=headers, json=body)
        resp.raise_for_status()
        data = resp.json()
        return data["choices"][0]["message"]["content"] or ""


class Llm:
    async def stream_turn(
        self, *, model, system, messages, tools, max_tokens
    ) -> AsyncIterator[dict[str, Any]]:
        """Yield {'type':'text','delta':str} chunks, then one {'type':'final', ...}.
        
        Attempts Groq first. If Groq encounters rate limits, capacity issues, or connection
        errors, automatically fails over to Google Gemini. If all providers fail, returns a safe
        in-band response so execution never terminates with an unhandled exception.
        """
        system_text = _format_system(system)
        conv_messages = _format_messages_for_groq(messages, system_text)
        groq_tools = _convert_tools_for_groq(tools) if tools else None

        groq_client = _get_groq_client()
        groq_attempted = False
        if groq_client is not None:
            groq_attempted = True
            create_kwargs: dict[str, Any] = dict(
                model=model,
                messages=conv_messages,
                max_tokens=min(max_tokens or 2048, 1024),
                stream=True,
            )
            if groq_tools:
                create_kwargs["tools"] = groq_tools
                create_kwargs["tool_choice"] = "auto"

            stream = None
            max_retries = 1
            for attempt in range(max_retries + 1):
                try:
                    stream = await groq_client.chat.completions.create(**create_kwargs)
                    break
                except Exception as e:
                    err_str = str(e)
                    # If rate limited (429) or token limit exceeded (413), try short pause or fall through to Gemini
                    if ("429" in err_str or "rate_limit" in err_str.lower()) and attempt < max_retries:
                        m = re.search(r"try again in ([\d\.]+)s", err_str)
                        wait_sec = float(m.group(1)) + 0.5 if m else 3.0
                        _logger.warning("[AGENT] 429 rate limit on Groq. Pausing %.1fs (attempt %d/%d)...", wait_sec, attempt + 1, max_retries)
                        await asyncio.sleep(wait_sec)
                        continue
                    _logger.warning("[AGENT] Groq stream request failed: %s. Falling back to Gemini...", e)
                    stream = None
                    break

            if stream is not None:
                try:
                    finish_reason = "end_turn"
                    accumulated_tool_calls: dict[int, dict[str, Any]] = {}
                    full_text = []

                    async for chunk in stream:
                        if not chunk.choices:
                            continue
                        choice = chunk.choices[0]

                        # Text delta
                        if choice.delta and choice.delta.content:
                            delta = choice.delta.content
                            full_text.append(delta)
                            yield {"type": "text", "delta": delta}

                        # Tool call accumulation (streamed in fragments)
                        if choice.delta and choice.delta.tool_calls:
                            for tc in choice.delta.tool_calls:
                                idx = tc.index
                                if idx not in accumulated_tool_calls:
                                    accumulated_tool_calls[idx] = {
                                        "id": tc.id or "",
                                        "name": tc.function.name if tc.function else "",
                                        "arguments": "",
                                    }
                                if tc.id:
                                    accumulated_tool_calls[idx]["id"] = tc.id
                                if tc.function:
                                    if tc.function.name:
                                        accumulated_tool_calls[idx]["name"] = tc.function.name
                                    if tc.function.arguments:
                                        accumulated_tool_calls[idx]["arguments"] += tc.function.arguments

                        if choice.finish_reason:
                            fr = choice.finish_reason
                            finish_reason = "tool_use" if fr in ("tool_calls", "function_call") else ("end_turn" if fr == "stop" else fr)

                    total_text = "".join(full_text)
                    out_tokens = max(1, len(total_text) // 4)
                    in_tokens = sum(len(str(m.get("content", ""))) // 4 for m in conv_messages)

                    # Reconstruct Anthropic-format content blocks
                    content_blocks: list[dict[str, Any]] = []
                    if total_text:
                        content_blocks.append({"type": "text", "text": total_text})
                    for tc in accumulated_tool_calls.values():
                        try:
                            parsed_input = _json.loads(tc["arguments"] or "{}")
                        except Exception:
                            parsed_input = {"raw": tc["arguments"]}
                        content_blocks.append({
                            "type": "tool_use",
                            "id": tc["id"] or f"toolu_{tc['name']}_{id(tc)}",
                            "name": tc["name"],
                            "input": parsed_input,
                        })

                    yield {
                        "type": "final",
                        "stop_reason": finish_reason,
                        "content": content_blocks if content_blocks else [{"type": "text", "text": total_text}],
                        "usage": {
                            "input_tokens": in_tokens,
                            "output_tokens": out_tokens,
                            "cache_read_tokens": 0,
                        },
                    }
                    return
                except Exception as e:
                    _logger.warning("[AGENT] Error while reading Groq stream: %s. Falling back to Gemini...", e)

        # Fallback 1: Google Gemini (High TPM, fast, reliable fallback)
        if settings.GEMINI_API_KEY:
            try:
                _logger.info("[AGENT] Using Gemini (%s) as fallback...", settings.MODEL_GEMINI)
                async for chunk in _stream_gemini(conv_messages, groq_tools, max_tokens):
                    yield chunk
                return
            except Exception as e:
                _logger.error("[AGENT] Gemini fallback failed: %s", e)

        # Fallback 2: Anthropic (if key provided and valid)
        if settings.ANTHROPIC_API_KEY and not settings.ANTHROPIC_API_KEY.startswith("dummy"):
            try:
                _logger.info("[AGENT] Trying Anthropic provider as secondary fallback...")
                anthropic_client = _get_anthropic_client()
                kwargs: dict[str, Any] = dict(
                    model=model, max_tokens=max_tokens, system=system, messages=messages
                )
                if tools:
                    kwargs["tools"] = tools
                async with anthropic_client.messages.stream(**kwargs) as stream:
                    async for delta in stream.text_stream:
                        yield {"type": "text", "delta": delta}
                    final = await stream.get_final_message()
                yield {
                    "type": "final",
                    "stop_reason": final.stop_reason,
                    "content": [b.model_dump() for b in final.content],
                    "usage": {
                        "input_tokens": final.usage.input_tokens,
                        "output_tokens": final.usage.output_tokens,
                        "cache_read_tokens": getattr(final.usage, "cache_read_input_tokens", 0) or 0,
                    },
                }
                return
            except Exception as e:
                _logger.error("[AGENT] Anthropic secondary fallback failed: %s", e)

        # Ultimate safety fallback: Ensure execution never crashes and user gets a helpful message
        _logger.critical("[AGENT] All LLM providers exhausted or failed. Yielding graceful fallback turn.")
        safe_msg = (
            "I encountered a temporary rate limit or connection issue with the upstream AI provider. "
            "Please try sending your message again in a moment."
        )
        yield {"type": "text", "delta": safe_msg}
        yield {
            "type": "final",
            "stop_reason": "end_turn",
            "content": [{"type": "text", "text": safe_msg}],
            "usage": {"input_tokens": 0, "output_tokens": 15, "cache_read_tokens": 0},
        }

    async def complete_json(self, *, model, system, user, max_tokens) -> str:
        """One non-streamed call for review, classify and summarize. Returns raw text."""
        system_text = _format_system(system)
        conv_messages = _format_messages_for_groq(
            [{"role": "user", "content": user}], system_text
        )

        groq_client = _get_groq_client()
        if groq_client is not None:
            try:
                resp = await groq_client.chat.completions.create(
                    model=model,
                    max_tokens=max_tokens,
                    messages=conv_messages,
                    temperature=0.1,
                )
                return resp.choices[0].message.content or ""
            except Exception as e:
                _logger.warning("[AGENT] Groq complete_json failed: %s. Falling back to Gemini...", e)

        if settings.GEMINI_API_KEY:
            try:
                return await _complete_gemini(conv_messages, max_tokens)
            except Exception as e:
                _logger.error("[AGENT] Gemini complete_json fallback failed: %s", e)

        if settings.ANTHROPIC_API_KEY and not settings.ANTHROPIC_API_KEY.startswith("dummy"):
            try:
                anthropic_client = _get_anthropic_client()
                resp = await anthropic_client.messages.create(
                    model=model, max_tokens=max_tokens, system=system,
                    messages=[{"role": "user", "content": user}],
                )
                return "".join(b.text for b in resp.content if b.type == "text")
            except Exception as e:
                _logger.error("[AGENT] Anthropic complete_json failed: %s", e)

        return "{}"


_llm = Llm()


def provider() -> Llm:
    # A function, not a bare global, so tests can monkeypatch it with a fake (mocked model in CI).
    return _llm


def set_provider(llm_instance: Llm) -> None:
    """Helper for testing to set the active LLM provider."""
    global _llm
    _llm = llm_instance

