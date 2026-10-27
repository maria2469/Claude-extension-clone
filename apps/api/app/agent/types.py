from typing import Any
from pydantic import BaseModel, Field


class StepRequest(BaseModel):
    messages: list[dict[str, Any]] = Field(min_length=1, max_length=200)
    tools: list[dict[str, Any]] = Field(default_factory=list, max_length=40)
    page_url: str | None = Field(default=None, max_length=2048)
    page_title: str | None = Field(default=None, max_length=1024)
    page_content: str | None = Field(default=None, max_length=200000)
    run_id: str | None = Field(default=None, max_length=64)
    max_tokens: int = Field(default=2048, ge=1, le=8192)


class ReviewRequest(BaseModel):
    user_goal: str = Field(max_length=4000)
    action: dict[str, Any]
    page_url: str | None = Field(default=None, max_length=2048)


class ReviewResult(BaseModel):
    allow: bool
    reason: str


class ClassifyRequest(BaseModel):
    text: str = Field(max_length=60000)
    source_url: str = Field(max_length=2048)


class ClassifyResponse(BaseModel):
    injection_score: float = Field(ge=0, le=1)
    spans: list[tuple[int, int]] = Field(default_factory=list)
    reason: str = ""
