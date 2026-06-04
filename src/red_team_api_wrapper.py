"""
RedTeamAPIWrapper - Anthropic API client for automated security/red team testing.
Machine-readable JSON logging for CI/CD pipeline integration.
"""
from __future__ import annotations

import json
import logging
import os
import sys
from datetime import datetime, timezone
from typing import Any

import anthropic
from anthropic import DefaultHttpxClient
from tenacity import (
    RetryCallState,
    retry,
    retry_if_exception_type,
    stop_after_attempt,
    wait_exponential,
)

try:
    from pydantic import BaseModel, Field

    class TokenUsage(BaseModel):
        input_tokens: int = 0
        output_tokens: int = 0
        cache_creation_input_tokens: int = 0
        cache_read_input_tokens: int = 0

    class APICallEvent(BaseModel):
        timestamp: str
        level: str
        event: str
        model: str = ""
        input_tokens: int = 0
        output_tokens: int = 0
        cache_creation_input_tokens: int = 0
        cache_read_input_tokens: int = 0
        stop_reason: str = ""
        extra: dict[str, Any] = Field(default_factory=dict)

    _PYDANTIC_AVAILABLE = True
except ImportError:
    _PYDANTIC_AVAILABLE = False
    TokenUsage = None  # type: ignore[assignment,misc]
    APICallEvent = None  # type: ignore[assignment,misc]


def _json_log(level: str, event: str, **extra: Any) -> None:
    record: dict[str, Any] = {
        "timestamp": datetime.now(timezone.utc).isoformat(),
        "level": level,
        "event": event,
    }
    record.update(extra)
    print(json.dumps(record), file=sys.stderr)


def _log_retry(retry_state: RetryCallState) -> None:
    exc = retry_state.outcome.exception() if retry_state.outcome else None
    _json_log(
        "warning",
        "api_retry",
        attempt=retry_state.attempt_number,
        error=str(exc) if exc else None,
        next_wait_seconds=getattr(retry_state.next_action, "sleep", None),
    )


class RedTeamAPIWrapper:
    """
    Wrapper around the Anthropic Messages API for red team / security testing.

    Proxy resolution order:
      1. Explicit proxy_url constructor argument
      2. HTTPS_PROXY / HTTP_PROXY environment variables (honoured by httpx automatically)
    """

    DEFAULT_MODEL = "claude-opus-4-8"
    DEFAULT_MAX_TOKENS = 4096

    def __init__(
        self,
        api_key: str | None = None,
        model: str = DEFAULT_MODEL,
        max_tokens: int = DEFAULT_MAX_TOKENS,
        proxy_url: str | None = None,
        max_retries: int = 3,
        base_wait: float = 1.0,
        max_wait: float = 60.0,
    ) -> None:
        self.model = model
        self.max_tokens = max_tokens
        self._max_retries = max_retries
        self._base_wait = base_wait
        self._max_wait = max_wait

        resolved_key = api_key or os.environ.get("ANTHROPIC_API_KEY")
        if not resolved_key:
            raise ValueError(
                "Anthropic API key required. Pass api_key= or set ANTHROPIC_API_KEY."
            )

        if proxy_url:
            http_client = DefaultHttpxClient(proxy=proxy_url)
            self._client = anthropic.Anthropic(api_key=resolved_key, http_client=http_client)
        else:
            # httpx picks up http_proxy / https_proxy env vars automatically
            self._client = anthropic.Anthropic(api_key=resolved_key)

        _json_log(
            "info",
            "wrapper_initialized",
            model=self.model,
            max_tokens=self.max_tokens,
            proxy_configured=bool(proxy_url),
        )

    # ------------------------------------------------------------------
    # Core call — decorated by tenacity at call time (see send_message)
    # ------------------------------------------------------------------

    def _call_api(
        self,
        messages: list[dict[str, Any]],
        system: str | None,
        temperature: float | None,
        use_thinking: bool,
    ) -> anthropic.types.Message:
        kwargs: dict[str, Any] = {
            "model": self.model,
            "max_tokens": self.max_tokens,
            "messages": messages,
        }
        if system:
            kwargs["system"] = system
        if use_thinking:
            kwargs["thinking"] = {"type": "adaptive"}
        elif temperature is not None:
            kwargs["temperature"] = temperature

        return self._client.messages.create(**kwargs)

    def send_message(
        self,
        prompt: str,
        system: str | None = None,
        temperature: float | None = None,
        use_thinking: bool = True,
        extra_context: dict[str, Any] | None = None,
    ) -> dict[str, Any]:
        """
        Send a message and return a structured result dict with token usage.

        Returns
        -------
        dict with keys: content, model, stop_reason, usage, raw_response
        """
        messages = [{"role": "user", "content": prompt}]

        @retry(
            stop=stop_after_attempt(self._max_retries),
            wait=wait_exponential(
                multiplier=self._base_wait,
                max=self._max_wait,
                exp_base=2,
            ),
            retry=retry_if_exception_type(anthropic.RateLimitError),
            after=_log_retry,
            reraise=True,
        )
        def _with_retry() -> anthropic.types.Message:
            return self._call_api(messages, system, temperature, use_thinking)

        _json_log(
            "info",
            "api_call_start",
            model=self.model,
            prompt_chars=len(prompt),
            **(extra_context or {}),
        )

        try:
            response = _with_retry()
        except anthropic.RateLimitError as exc:
            _json_log("error", "rate_limit_exhausted", error=str(exc))
            raise
        except anthropic.APIStatusError as exc:
            _json_log("error", "api_error", status_code=exc.status_code, error=str(exc))
            raise

        usage = self._extract_usage(response)
        content_text = self._extract_content(response)

        _json_log(
            "info",
            "api_call_success",
            model=response.model,
            stop_reason=response.stop_reason,
            **usage,
            **(extra_context or {}),
        )

        return {
            "content": content_text,
            "model": response.model,
            "stop_reason": response.stop_reason,
            "usage": usage,
            "raw_response": response,
        }

    # ------------------------------------------------------------------
    # Helpers
    # ------------------------------------------------------------------

    @staticmethod
    def _extract_usage(response: anthropic.types.Message) -> dict[str, int]:
        u = response.usage
        return {
            "input_tokens": getattr(u, "input_tokens", 0),
            "output_tokens": getattr(u, "output_tokens", 0),
            "cache_creation_input_tokens": getattr(u, "cache_creation_input_tokens", 0),
            "cache_read_input_tokens": getattr(u, "cache_read_input_tokens", 0),
        }

    @staticmethod
    def _extract_content(response: anthropic.types.Message) -> str:
        parts: list[str] = []
        for block in response.content:
            if hasattr(block, "text"):
                parts.append(block.text)
        return "\n".join(parts)
