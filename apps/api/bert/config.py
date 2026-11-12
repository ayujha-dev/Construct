"""Environment-backed runtime configuration."""

from __future__ import annotations

import logging
import os
from dataclasses import dataclass, field
from pathlib import Path

logger = logging.getLogger("shieldstaff.config")


def get_compat_env(key: str, default: str = "") -> str:
    """Accept SHIELDSTAFF_*, standard key, or fall back to BERT_* with a warning."""
    shieldstaff_key = f"SHIELDSTAFF_{key}" if not key.startswith("SHIELDSTAFF_") else key
    bert_key = f"BERT_{key}" if not key.startswith("BERT_") else key

    if shieldstaff_key in os.environ:
        return os.environ[shieldstaff_key]
    if key in os.environ:
        return os.environ[key]
    if bert_key in os.environ:
        logger.warning(
            "Legacy environment variable '%s' is deprecated and will be removed in a future release; use '%s' or '%s' instead.",
            bert_key,
            shieldstaff_key,
            key,
        )
        return os.environ[bert_key]
    return default


def resolve_database_url() -> str:
    """Resolve database URL with backward compatibility.

    Defaults to shieldstaff.db, but connects to bert.db if bert.db exists and shieldstaff.db does not.
    """
    custom = get_compat_env("DATABASE_URL", "")
    if custom:
        return custom

    cwd = Path.cwd()
    if (cwd / "shieldstaff.db").is_file():
        return "sqlite+aiosqlite:///./shieldstaff.db"
    if (cwd / "bert.db").is_file():
        return "sqlite+aiosqlite:///./bert.db"
    if (cwd / "apps" / "api" / "shieldstaff.db").is_file():
        return "sqlite+aiosqlite:///./shieldstaff.db"
    if (cwd / "apps" / "api" / "bert.db").is_file():
        return "sqlite+aiosqlite:///./bert.db"

    return "sqlite+aiosqlite:///./shieldstaff.db"


@dataclass(frozen=True)
class Settings:
    inference_mode: str = field(default_factory=lambda: get_compat_env("INFERENCE_MODE", "demo_simulator"))
    db_mode: str = field(default_factory=lambda: get_compat_env("DB_MODE", "sqlite_async"))
    database_url: str = field(default_factory=resolve_database_url)
    api_origin: str = field(default_factory=lambda: get_compat_env("API_ORIGIN", "http://localhost:5173"))
    vllm_text_url: str = field(default_factory=lambda: get_compat_env("VLLM_TEXT_URL", "http://localhost:8001/v1"))
    vllm_vision_url: str = field(default_factory=lambda: get_compat_env("VLLM_VISION_URL", "http://localhost:8002/v1"))
    groq_api_key: str = field(default_factory=lambda: get_compat_env("GROQ_API_KEY", ""))
    anthropic_api_key: str = field(default_factory=lambda: get_compat_env("ANTHROPIC_API_KEY", ""))
    min_quote_chars: int = field(default_factory=lambda: int(get_compat_env("MIN_QUOTE_CHARS", "24")))
    min_quote_words: int = field(default_factory=lambda: int(get_compat_env("MIN_QUOTE_WORDS", "4")))


settings = Settings()
