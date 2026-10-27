from typing import Any, AsyncIterator

from anthropic import AsyncAnthropic
from groq import AsyncGroq

from app.core.config import settings


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
    """Convert Anthropic-format messages to OpenAI/Groq format."""
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
                            "arguments": __import__("json").dumps(part.get("input", {})),
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
                # Groq expects one tool message per tool result
                for tid, tcontent in tool_results:
                    formatted.append({"role": "tool", "tool_call_id": tid, "content": tcontent})
                continue
            content = "\n".join(text_parts)

        formatted.append({"role": role, "content": content})
    return formatted


def _convert_tools_for_groq(tools: list[dict[str, Any]]) -> list[dict[str, Any]]:
    """Convert Anthropic tool schemas to OpenAI/Groq function format."""
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


class Llm:
    async def stream_turn(
        self, *, model, system, messages, tools, max_tokens
    ) -> AsyncIterator[dict[str, Any]]:
        """Yield {'type':'text','delta':str} chunks, then one {'type':'final', ...}."""
        import json as _json
        groq_client = _get_groq_client()
        if groq_client is not None:
            system_text = _format_system(system)
            conv_messages = _format_messages_for_groq(messages, system_text)
            full_text = []
            groq_tools = _convert_tools_for_groq(tools) if tools else None

            create_kwargs: dict[str, Any] = dict(
                model=model,
                messages=conv_messages,
                max_tokens=min(max_tokens or 2048, 1024),
                stream=True,
            )
            if groq_tools:
                create_kwargs["tools"] = groq_tools
                create_kwargs["tool_choice"] = "auto"

            stream = await groq_client.chat.completions.create(**create_kwargs)
            finish_reason = "end_turn"
            accumulated_tool_calls: dict[int, dict[str, Any]] = {}

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
                    finish_reason = "tool_use" if fr == "tool_calls" else ("end_turn" if fr == "stop" else fr)

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

    async def complete_json(self, *, model, system, user, max_tokens) -> str:
        """One non-streamed call for review, classify and summarize. Returns raw text."""
        groq_client = _get_groq_client()
        if groq_client is not None:
            system_text = _format_system(system)
            conv_messages = _format_messages_for_groq(
                [{"role": "user", "content": user}], system_text
            )
            resp = await groq_client.chat.completions.create(
                model=model,
                max_tokens=max_tokens,
                messages=conv_messages,
                temperature=0.1,
            )
            return resp.choices[0].message.content or ""

        anthropic_client = _get_anthropic_client()
        resp = await anthropic_client.messages.create(
            model=model, max_tokens=max_tokens, system=system,
            messages=[{"role": "user", "content": user}],
        )
        return "".join(b.text for b in resp.content if b.type == "text")


_llm = Llm()


def provider() -> Llm:
    # A function, not a bare global, so tests can monkeypatch it with a fake (mocked model in CI).
    return _llm


def set_provider(llm_instance: Llm) -> None:
    """Helper for testing to set the active LLM provider."""
    global _llm
    _llm = llm_instance
