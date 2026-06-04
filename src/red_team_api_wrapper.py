"""
RedTeamAPIWrapper - Anthropic API client for automated red team / prompt injection testing.
Machine-readable JSON logging for CI/CD pipeline integration.
"""
from __future__ import annotations

import json
import os
import sys
import time
from datetime import datetime, timezone
from typing import Any, Dict, Optional

import anthropic
from anthropic import DefaultHttpxClient

try:
    from tenacity import (
        RetryCallState,
        retry,
        retry_if_exception_type,
        stop_after_attempt,
        wait_exponential,
    )
    _TENACITY_AVAILABLE = True
except ImportError:
    print(
        json.dumps({
            "timestamp": datetime.now(timezone.utc).isoformat(),
            "level": "warning",
            "event": "tenacity_missing",
            "message": "tenacity not installed — retry logic disabled",
        }),
        file=sys.stderr,
    )
    _TENACITY_AVAILABLE = False

try:
    from pydantic import BaseModel, Field

    class TokenUsage(BaseModel):
        input_tokens: int = 0
        output_tokens: int = 0
        cache_creation_input_tokens: int = 0
        cache_read_input_tokens: int = 0

    _PYDANTIC_AVAILABLE = True
except ImportError:
    _PYDANTIC_AVAILABLE = False


def _json_log(level: str, event: str, **extra: Any) -> None:
    record: dict[str, Any] = {
        "timestamp": datetime.now(timezone.utc).isoformat() + "Z",
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
    )


class RedTeamAPIWrapper:
    """
    Reusable, robust wrapper for Anthropic API calls in automated red team testing.

    Proxy resolution order:
      1. Explicit proxy_base_url constructor argument
      2. HTTPS_PROXY / HTTP_PROXY environment variables (honoured by httpx automatically)
    """

    def __init__(
        self,
        system_prompt: str,
        model: str,
        max_tokens: int,
        temperature: float,
        api_key: Optional[str] = None,
        proxy_base_url: Optional[str] = None,
        max_retries: int = 3,
        base_wait: float = 1.0,
        max_wait: float = 30.0,
    ) -> None:
        self.system_prompt = system_prompt
        self.model = model
        self.max_tokens = max_tokens
        self.temperature = temperature

        resolved_key = api_key or os.environ.get("ANTHROPIC_API_KEY")
        if not resolved_key:
            raise ValueError(
                "Anthropic API key required. Pass api_key= or set ANTHROPIC_API_KEY."
            )

        if proxy_base_url:
            http_client = DefaultHttpxClient(proxy=proxy_base_url)
            self._client = anthropic.Anthropic(api_key=resolved_key, http_client=http_client)
        else:
            # httpx automatically picks up HTTP_PROXY / HTTPS_PROXY env vars
            self._client = anthropic.Anthropic(api_key=resolved_key)

        # Wrap _call with retry at construction time so max_retries is configurable
        if _TENACITY_AVAILABLE:
            self._send_with_retry = retry(
                wait=wait_exponential(multiplier=base_wait, min=2, max=max_wait),
                stop=stop_after_attempt(max_retries),
                retry=retry_if_exception_type(anthropic.RateLimitError),
                after=_log_retry,
                reraise=True,
            )(self._call_api)
        else:
            self._send_with_retry = self._call_api

        _json_log(
            "info",
            "wrapper_initialized",
            model=self.model,
            max_tokens=self.max_tokens,
            temperature=self.temperature,
            proxy_configured=bool(proxy_base_url),
            retry_enabled=_TENACITY_AVAILABLE,
        )

    # ------------------------------------------------------------------
    # Public interface
    # ------------------------------------------------------------------

    def send(self, user_message: str) -> Dict[str, Any]:
        """
        Send a prompt injection payload or test query.

        Returns
        -------
        dict with keys: response, input_tokens, output_tokens,
                        cache_creation_input_tokens, cache_read_input_tokens,
                        stop_reason, total_time_ms
        """
        _json_log("info", "api_call_start", model=self.model, prompt_chars=len(user_message))
        start_time = time.time()

        try:
            message_response = self._send_with_retry(user_message)
        except anthropic.RateLimitError as exc:
            _json_log("error", "rate_limit_exhausted", error=str(exc))
            raise
        except anthropic.APIStatusError as exc:
            _json_log("error", "api_error", status_code=exc.status_code, error=str(exc))
            raise

        u = message_response.usage
        # stop_reason lives on the message object, NOT on usage
        stop_reason = message_response.stop_reason
        usage = {
            "input_tokens": getattr(u, "input_tokens", 0),
            "output_tokens": getattr(u, "output_tokens", 0),
            "cache_creation_input_tokens": getattr(u, "cache_creation_input_tokens", 0),
            "cache_read_input_tokens": getattr(u, "cache_read_input_tokens", 0),
        }
        total_time_ms = round((time.time() - start_time) * 1000, 2)

        _json_log(
            "info",
            "api_call_success",
            model=message_response.model,
            status="SUCCESS",
            stop_reason=stop_reason,
            total_time_ms=total_time_ms,
            **usage,
        )

        return {
            "response": self._extract_text(message_response),
            "stop_reason": stop_reason,
            "total_time_ms": total_time_ms,
            **usage,
        }

    # ------------------------------------------------------------------
    # Internals
    # ------------------------------------------------------------------

    def _call_api(self, user_message: str) -> anthropic.types.Message:
        return self._client.messages.create(
            model=self.model,
            max_tokens=self.max_tokens,
            temperature=self.temperature,
            system=self.system_prompt,
            messages=[{"role": "user", "content": user_message}],
        )

    @staticmethod
    def _extract_text(response: anthropic.types.Message) -> str:
        return "\n".join(
            block.text for block in response.content if hasattr(block, "text")
        )
