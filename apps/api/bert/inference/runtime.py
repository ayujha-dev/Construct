"""Runtime selection without forcing a local GPU or cloud credential."""

from __future__ import annotations

from dataclasses import dataclass
from typing import Any

import httpx

from bert.config import settings


@dataclass(frozen=True, slots=True)
class RuntimeProfile:
    """Model and endpoint contract selected by INFERENCE_MODE."""

    mode: str
    text_model: str
    vision_model: str
    text_endpoint: str | None
    vision_endpoint: str | None
    arbitration_model: str
    network_enabled: bool


def runtime_profile() -> RuntimeProfile:
    """Resolve simulator, cloud-burst, or local-vLLM settings deterministically."""
    if settings.inference_mode == "cloud_burst":
        return RuntimeProfile(
            mode="cloud_burst",
            text_model="llama-3.1-8b-instant",
            vision_model="llama-3.1-8b-instant",
            text_endpoint="https://api.groq.com/openai/v1",
            vision_endpoint="https://api.groq.com/openai/v1",
            arbitration_model="claude-3-5-sonnet",
            network_enabled=True,
        )
    if settings.inference_mode == "local_vllm":
        return RuntimeProfile(
            mode="local_vllm",
            text_model="Qwen/Qwen2.5-14B-Instruct-AWQ",
            vision_model="Qwen/Qwen2.5-VL-7B-Instruct-AWQ",
            text_endpoint=settings.vllm_text_url,
            vision_endpoint=settings.vllm_vision_url,
            arbitration_model="Qwen/Qwen2.5-14B-Instruct-AWQ",
            network_enabled=True,
        )
    return RuntimeProfile(
        mode="demo_simulator",
        text_model="Qwen2.5-14B-demo-simulator",
        vision_model="Qwen2.5-VL-7B-demo-simulator",
        text_endpoint=None,
        vision_endpoint=None,
        arbitration_model="Qwen2.5-14B-demo-simulator",
        network_enabled=False,
    )


class InferenceRuntime:
    """Small provider adapter used only when the simulator is disabled."""

    async def complete(self, agent: str, context: dict[str, Any]) -> dict[str, Any]:
        profile = runtime_profile()
        if not profile.network_enabled:
            return {"mode": profile.mode, "content": "simulated"}
        if profile.mode == "cloud_burst" and agent == "Arbiter":
            return await self._anthropic_complete(profile, context)
        return await self._openai_compatible_complete(profile, agent, context)

    async def _openai_compatible_complete(
        self, profile: RuntimeProfile, agent: str, context: dict[str, Any]
    ) -> dict[str, Any]:
        if profile.text_endpoint is None:
            raise RuntimeError("Text inference endpoint is not configured")
        api_key = settings.groq_api_key if profile.mode == "cloud_burst" else ""
        headers = {"Content-Type": "application/json"}
        if api_key:
            headers["Authorization"] = f"Bearer {api_key}"
        endpoint = profile.vision_endpoint if agent == "Scout" else profile.text_endpoint
        model = profile.vision_model if agent == "Scout" else profile.text_model
        async with httpx.AsyncClient(timeout=60.0) as client:
            response = await client.post(
                f"{endpoint.rstrip('/')}/chat/completions",
                headers=headers,
                json={
                    "model": model,
                    "messages": [{"role": "user", "content": str(context)}],
                    "temperature": 0,
                    "logprobs": True,
                },
            )
            response.raise_for_status()
            return response.json()

    async def _anthropic_complete(self, profile: RuntimeProfile, context: dict[str, Any]) -> dict[str, Any]:
        if not settings.anthropic_api_key:
            raise RuntimeError("ANTHROPIC_API_KEY is required for cloud_burst Arbiter calls")
        async with httpx.AsyncClient(timeout=60.0) as client:
            response = await client.post(
                "https://api.anthropic.com/v1/messages",
                headers={
                    "content-type": "application/json",
                    "x-api-key": settings.anthropic_api_key,
                    "anthropic-version": "2023-06-01",
                },
                json={
                    "model": profile.arbitration_model,
                    "max_tokens": 1024,
                    "temperature": 0,
                    "messages": [{"role": "user", "content": str(context)}],
                },
            )
            response.raise_for_status()
            return response.json()
