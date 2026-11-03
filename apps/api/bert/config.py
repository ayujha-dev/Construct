"""Environment-backed runtime configuration."""

from __future__ import annotations

import os
from dataclasses import dataclass


@dataclass(frozen=True)
class Settings:
    inference_mode: str = os.getenv("INFERENCE_MODE", "demo_simulator")
    db_mode: str = os.getenv("DB_MODE", "sqlite_async")
    database_url: str = os.getenv("DATABASE_URL", "sqlite+aiosqlite:///./bert.db")
    api_origin: str = os.getenv("API_ORIGIN", "http://localhost:5173")
    vllm_text_url: str = os.getenv("VLLM_TEXT_URL", "http://localhost:8001/v1")
    vllm_vision_url: str = os.getenv("VLLM_VISION_URL", "http://localhost:8002/v1")
    groq_api_key: str = os.getenv("GROQ_API_KEY", "")
    anthropic_api_key: str = os.getenv("ANTHROPIC_API_KEY", "")


settings = Settings()
