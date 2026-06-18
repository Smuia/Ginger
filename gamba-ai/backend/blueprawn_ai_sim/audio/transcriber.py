# ──────────────────────────────────────────────────────────────────────────────
# blueprawn_ai_sim — Audio Transcriber
# ──────────────────────────────────────────────────────────────────────────────
"""
Speech-to-text transcription via OpenAI Whisper API,
with a simulation fallback for offline development.
"""
from __future__ import annotations

import logging
import random
from pathlib import Path
from typing import BinaryIO

from blueprawn_ai_sim.config import get_settings

logger = logging.getLogger(__name__)

# ── Simulation Responses ──────────────────────────────────────────────────────
_SIM_TRANSCRIPTS = [
    "Ki kati, oli otya leero?",
    "Embeera y'obudde eri gye ku leero?",
    "Mbuulira ku kintu ekyewuunyisa eky'omu bbanga.",
    "Nnyinza okukuyambako ntya okutegeka wiikendi yange?",
    "Ssaawa mmeka kati?",
    "Nandyagadde okuyiga ekintu ekipya leero.",
    "Kuba ennyimba ez'okuwummulamu.",
    "Kiki ekiri mu mawulire ag'akaseera kano?",
    "Njjukiza okukubira mukwano gwange essimu oluvanyuma.",
    "Nnyinza ntya okufumba kaawa omulungi?",
]


async def transcribe_audio_file(
    file_path: Path | None = None,
    *,
    audio_bytes: bytes | None = None,
    filename: str = "recording.webm",
) -> str:
    """
    Transcribe audio to text from either a file path or raw bytes.

    Args:
        file_path: Path to the saved audio file on disk (optional).
        audio_bytes: Raw audio bytes (used when file_path is None).
        filename: Filename hint for format detection.

    Returns:
        Transcribed text string.
    """
    settings = get_settings()

    # If raw bytes provided, use the bytes path
    if audio_bytes is not None:
        if not settings.use_live_ai:
            return _simulate_transcription_from_bytes(audio_bytes)
        return await _whisper_transcribe_bytes(audio_bytes, filename)

    # Otherwise fall back to file path
    if file_path is None:
        raise ValueError("Either file_path or audio_bytes must be provided")

    if not settings.use_live_ai:
        return _simulate_transcription(file_path)

    return await _whisper_transcribe(file_path)


async def transcribe_audio_bytes(audio_data: bytes, filename: str = "audio.webm") -> str:
    """
    Transcribe raw audio bytes to text.

    Args:
        audio_data: Raw audio file bytes.
        filename: Filename hint for format detection.

    Returns:
        Transcribed text string.
    """
    settings = get_settings()

    if not settings.use_live_ai:
        return _simulate_transcription_from_bytes(audio_data)

    return await _whisper_transcribe_bytes(audio_data, filename)


# ── OpenAI Whisper Implementation ─────────────────────────────────────────────

async def _whisper_transcribe(file_path: Path) -> str:
    """Transcribe using OpenAI Whisper API from a file path."""
    import openai

    settings = get_settings()
    client = openai.AsyncOpenAI(api_key=settings.openai_api_key)

    try:
        with open(file_path, "rb") as audio_file:
            transcript = await client.audio.transcriptions.create(
                model=settings.whisper_model,
                file=audio_file,
                response_format="text",
                prompt="Ki kati, oli otya? Nsanyuse nnyo okukulaba. Ndi wano okukuyamba.",
            )
        logger.info(f"Whisper transcription ({file_path.name}): {transcript[:80]}...")
        return transcript.strip()
    except openai.APIError as e:
        logger.error(f"Whisper API error: {e}")
        raise
    except Exception as e:
        logger.error(f"Transcription failed: {e}")
        raise


async def _whisper_transcribe_bytes(audio_data: bytes, filename: str) -> str:
    """Transcribe using OpenAI Whisper API from raw bytes."""
    import openai

    settings = get_settings()
    client = openai.AsyncOpenAI(api_key=settings.openai_api_key)

    try:
        transcript = await client.audio.transcriptions.create(
            model=settings.whisper_model,
            file=(filename, audio_data),
            response_format="text",
            prompt="Ki kati, oli otya? Nsanyuse nnyo okukulaba. Ndi wano okukuyamba.",
        )
        logger.info(f"Whisper transcription (bytes): {transcript[:80]}...")
        return transcript.strip()
    except openai.APIError as e:
        logger.error(f"Whisper API error: {e}")
        raise
    except Exception as e:
        logger.error(f"Transcription failed: {e}")
        raise


# ── Simulation Implementation ─────────────────────────────────────────────────

def _simulate_transcription(file_path: Path) -> str:
    """Return a simulated transcript based on file size for determinism."""
    size = file_path.stat().st_size
    index = size % len(_SIM_TRANSCRIPTS)
    transcript = _SIM_TRANSCRIPTS[index]
    logger.info(f"[SIM] Transcription for {file_path.name}: {transcript}")
    return transcript


def _simulate_transcription_from_bytes(audio_data: bytes) -> str:
    """Return a simulated transcript from raw audio bytes."""
    index = len(audio_data) % len(_SIM_TRANSCRIPTS)
    transcript = _SIM_TRANSCRIPTS[index]
    logger.info(f"[SIM] Transcription from bytes ({len(audio_data)}B): {transcript}")
    return transcript
