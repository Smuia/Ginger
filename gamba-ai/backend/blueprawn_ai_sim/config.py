# ──────────────────────────────────────────────────────────────────────────────
# blueprawn_ai_sim — Configuration
# ──────────────────────────────────────────────────────────────────────────────
"""
Centralized configuration loaded from environment variables with sensible
POC defaults. Uses pydantic-settings for typed validation.
"""
from __future__ import annotations

import os
from pathlib import Path
from functools import lru_cache

from pydantic_settings import BaseSettings
from pydantic import Field


class Settings(BaseSettings):
    """Application settings — all overridable via env vars or .env file."""

    # ── App ───────────────────────────────────────────────────────────────────
    app_title: str = "BluePrawn AI Audio POC"
    app_version: str = "ADEV1.5.5 POC"
    debug: bool = True

    # ── CORS ──────────────────────────────────────────────────────────────────
    cors_origins: list[str] = ["*"]

    # ── Directories ───────────────────────────────────────────────────────────
    upload_dir: Path = Path("uploads")
    transcript_file: Path = Path("transcripts.txt")
    log_file: str = "audio_endpoint.log"

    # ── OpenAI (Whisper + GPT) ────────────────────────────────────────────────
    openai_api_key: str = Field(default="", description="OpenAI API key for Whisper & GPT")
    whisper_model: str = "whisper-1"
    gpt_model: str = "gpt-4o-mini"
    gpt_system_prompt: str = (
        "You are Gamba, a concise and friendly voice assistant. "
        "You speak and respond by default in Luganda. "
        "You must adopt a natural, friendly, and warm Luganda-inflected female accent across all spoken responses. "
        "When speaking Luganda, sound like a native speaker from Uganda. "
        "When speaking English, speak with a soft, distinct Ugandan (Luganda) accent, maintaining natural local intonation. "
        "Keep responses short (1-3 sentences) since they will be spoken aloud. "
        "Be helpful, warm, and to the point."
    )
    gpt_max_tokens: int = 150

    # ── Mode ──────────────────────────────────────────────────────────────────
    # When True, uses OpenAI APIs. When False, returns canned simulation responses.
    use_live_ai: bool = Field(default=False, description="Enable real OpenAI API calls")

    model_config = {
        "env_file": ".env",
        "env_file_encoding": "utf-8",
        "case_sensitive": False,
    }


@lru_cache()
def get_settings() -> Settings:
    """Cached singleton accessor for settings."""
    from dotenv import load_dotenv
    load_dotenv()
    settings = Settings()

    # Auto-enable live AI if a key is present and USE_LIVE_AI is not explicitly configured
    if settings.openai_api_key and os.getenv("USE_LIVE_AI") is None:
        settings.use_live_ai = True

    # If running on Vercel, override paths to /tmp to avoid Read-only file system error
    if os.getenv("VERCEL") == "1":
        settings.upload_dir = Path("/tmp/uploads")
        settings.transcript_file = Path("/tmp/transcripts.txt")
        settings.log_file = "/tmp/audio_endpoint.log"

    # Ensure upload directory exists
    try:
        settings.upload_dir.mkdir(parents=True, exist_ok=True)
    except Exception as e:
        import sys
        print(f"Warning: Could not create upload directory {settings.upload_dir}: {e}", file=sys.stderr)

    return settings
