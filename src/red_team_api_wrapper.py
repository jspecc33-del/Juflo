"""
RedTeamAPIWrapper - Anthropic API client for automated red team / prompt injection testing.
Supports two providers: "anthropic" (cloud) and "ollama" (local, no API key needed).
Machine-readable JSON logging for CI/CD pipeline integration.
"""
from __future__ import annotations

import json
import os
import sys
import time
from datetime import datetime, timezone
from typing import Any, Dict, Literal, Optional

import httpx

try:
    import anthropic
    from anthropic import DefaultHttpxClient
    _ANTHROPIC_AVAILABLE = True
except ImportError:
    _ANTHROPIC_AVAILABLE = False

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
    _TENACITY_AVAILABLE = False

try:
    from pydantic import BaseModel

    class TokenUsage(BaseModel):
        input_tokens: int = 0
        output_tokens: int = 0
        cache_creation_input_tokens: int = 0
        cache_read_input_tokens: int = 0

    _PYDANTIC_AVAILABLE = True
except ImportError:
    _PYDANTIC_AVAILABLE = False


# ── logging ───────────────────────────────────────────────────────────────────

def _json_log(level: str, event: str, **extra: Any) -> None:
    record: dict[str, Any] = {
        "timestamp": datetime.now(timezone.utc).isoformat() + "Z",
        "level": level,
        "event": event,
    }
    record.update(extra)
    print(json.dumps(record), file=sys.stderr)


def _log_retry(state: RetryCallState) -> None:
    exc = state.outcome.exception() if state.outcome else None
    _json_log(
        "warning", "api_retry",
        attempt=state.attempt_number,
        error=str(exc) if exc else None,
    )


# ── main class ────────────────────────────────────────────────────────────────

class RedTeamAPIWrapper:
    """
    Unified red team wrapper supporting Anthropic cloud and local Ollama.

    provider="anthropic"  — requires ANTHROPIC_API_KEY or api_key=
    provider="ollama"     — requires Ollama running at ollama_base_url (no key needed)

    Both providers expose the same .send() interface and emit identical
    machine-readable JSON logs.
    """

    def __init__(
        self,
        system_prompt: str,
        model: str,
        provider: Literal["anthropic", "ollama"] = "anthropic",
        # Anthropic options
        max_tokens: int = 1024,
        temperature: float = 0.7,
        api_key: Optional[str] = None,
        proxy_base_url: Optional[str] = None,
        # Ollama options
        ollama_base_url: str = "http://localhost:11434",
        ollama_timeout: float = 120.0,
        # Retry options (both providers)
        max_retries: int = 3,
        base_wait: float = 1.0,
        max_wait: float = 30.0,
    ) -> None:
        self.system_prompt = system_prompt
        self.model = model
        self.provider = provider
        self.max_tokens = max_tokens
        self.temperature = temperature

        if provider == "anthropic":
            self._init_anthropic(api_key, proxy_base_url)
        elif provider == "ollama":
            self._init_ollama(ollama_base_url, ollama_timeout)
        else:
            raise ValueError(f"Unknown provider '{provider}'. Use 'anthropic' or 'ollama'.")

        # Wrap the internal call with retry
        if _TENACITY_AVAILABLE:
            retry_on = (
                anthropic.RateLimitError if provider == "anthropic" and _ANTHROPIC_AVAILABLE
                else httpx.ConnectError
            )
            self._send_with_retry = retry(
                wait=wait_exponential(multiplier=base_wait, min=2, max=max_wait),
                stop=stop_after_attempt(max_retries),
                retry=retry_if_exception_type(retry_on),
                after=_log_retry,
                reraise=True,
            )(self._call_api)
        else:
            self._send_with_retry = self._call_api

        _json_log(
            "info", "wrapper_initialized",
            provider=provider,
            model=self.model,
            retry_enabled=_TENACITY_AVAILABLE,
        )

    # ── provider init ─────────────────────────────────────────────────────────

    def _init_anthropic(self, api_key: Optional[str], proxy_base_url: Optional[str]) -> None:
        if not _ANTHROPIC_AVAILABLE:
            raise ImportError("anthropic package not installed. Run: pip install anthropic")
        resolved_key = api_key or os.environ.get("ANTHROPIC_API_KEY")
        if not resolved_key:
            raise ValueError("Anthropic API key required. Pass api_key= or set ANTHROPIC_API_KEY.")
        if proxy_base_url:
            http_client = DefaultHttpxClient(proxy=proxy_base_url)
            self._anthropic = anthropic.Anthropic(api_key=resolved_key, http_client=http_client)
        else:
            self._anthropic = anthropic.Anthropic(api_key=resolved_key)

    def _init_ollama(self, base_url: str, timeout: float) -> None:
        self._ollama_client = httpx.Client(base_url=base_url, timeout=timeout)
        # Verify Ollama is reachable
        try:
            r = self._ollama_client.get("/api/tags", timeout=5)
            models = [m["name"] for m in r.json().get("models", [])]
            _json_log("info", "ollama_connected", available_models=models)
        except Exception as exc:
            _json_log("warning", "ollama_not_reachable", error=str(exc),
                      hint="Make sure 'ollama serve' is running")

    # ── public interface ──────────────────────────────────────────────────────

    def send(self, user_message: str) -> Dict[str, Any]:
        """
        Send a prompt and return structured result.

        Returns dict with:
          response, stop_reason, total_time_ms,
          input_tokens, output_tokens,
          cache_creation_input_tokens, cache_read_input_tokens (Anthropic only)
        """
        _json_log("info", "api_call_start",
                  provider=self.provider, model=self.model,
                  prompt_chars=len(user_message))
        start = time.time()

        try:
            raw = self._send_with_retry(user_message)
        except Exception as exc:
            _json_log("error", "api_call_failed", error=str(exc))
            raise

        result = self._extract_result(raw)
        result["total_time_ms"] = round((time.time() - start) * 1000, 1)

        _json_log(
            "info", "api_call_success",
            provider=self.provider,
            model=self.model,
            stop_reason=result["stop_reason"],
            input_tokens=result["input_tokens"],
            output_tokens=result["output_tokens"],
            total_time_ms=result["total_time_ms"],
        )
        return result

    # ── internal dispatch ─────────────────────────────────────────────────────

    def _call_api(self, user_message: str) -> Any:
        if self.provider == "anthropic":
            return self._call_anthropic(user_message)
        return self._call_ollama(user_message)

    def _call_anthropic(self, user_message: str) -> "anthropic.types.Message":
        return self._anthropic.messages.create(
            model=self.model,
            max_tokens=self.max_tokens,
            temperature=self.temperature,
            system=self.system_prompt,
            messages=[{"role": "user", "content": user_message}],
        )

    def _call_ollama(self, user_message: str) -> dict:
        resp = self._ollama_client.post(
            "/api/chat",
            json={
                "model": self.model,
                "stream": False,
                "options": {"temperature": self.temperature},
                "messages": [
                    {"role": "system", "content": self.system_prompt},
                    {"role": "user",   "content": user_message},
                ],
            },
        )
        resp.raise_for_status()
        return resp.json()

    # ── result extraction ─────────────────────────────────────────────────────

    def _extract_result(self, raw: Any) -> Dict[str, Any]:
        if self.provider == "anthropic":
            return self._extract_anthropic(raw)
        return self._extract_ollama(raw)

    @staticmethod
    def _extract_anthropic(msg: "anthropic.types.Message") -> Dict[str, Any]:
        u = msg.usage
        return {
            "response": "\n".join(b.text for b in msg.content if hasattr(b, "text")),
            "stop_reason": msg.stop_reason,
            "input_tokens": getattr(u, "input_tokens", 0),
            "output_tokens": getattr(u, "output_tokens", 0),
            "cache_creation_input_tokens": getattr(u, "cache_creation_input_tokens", 0),
            "cache_read_input_tokens": getattr(u, "cache_read_input_tokens", 0),
            "total_time_ms": 0,
        }

    @staticmethod
    def _extract_ollama(data: dict) -> Dict[str, Any]:
        return {
            "response": data.get("message", {}).get("content", ""),
            "stop_reason": "end_turn" if data.get("done") else "unknown",
            "input_tokens": data.get("prompt_eval_count", 0),
            "output_tokens": data.get("eval_count", 0),
            "cache_creation_input_tokens": 0,
            "cache_read_input_tokens": 0,
            "total_time_ms": 0,
        }
