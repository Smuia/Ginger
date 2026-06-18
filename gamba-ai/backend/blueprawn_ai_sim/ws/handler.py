# ──────────────────────────────────────────────────────────────────────────────
# blueprawn_ai_sim — WebSocket Audio Handler
# ──────────────────────────────────────────────────────────────────────────────
"""
Manages the real-time WebSocket audio streaming lifecycle:
  1. Client sends a JSON 'start' control frame.
  2. Client streams binary audio chunks (WebM/Opus blobs every ~250ms).
  3. Client sends a JSON 'stop' control frame.
  4. Server accumulates chunks, transcribes, generates a response, and streams
     it back as partial/final message frames matching the frontend contract.
"""
from __future__ import annotations

import asyncio
import json
import logging
import uuid
from datetime import datetime, timezone

from fastapi import WebSocket, WebSocketDisconnect

from blueprawn_ai_sim.config import get_settings
from blueprawn_ai_sim.audio.transcriber import transcribe_audio_bytes
from blueprawn_ai_sim.llm.responder import generate_response_stream

logger = logging.getLogger(__name__)


def _save_transcript(source: str, text: str) -> None:
    """Append a timestamped transcript line to the transcripts text file."""
    settings = get_settings()
    timestamp = datetime.now(timezone.utc).strftime("%Y-%m-%d %H:%M:%S UTC")
    line = f"[{timestamp}] [{source}] {text}\n"
    try:
        with open(settings.transcript_file, "a", encoding="utf-8") as f:
            f.write(line)
    except Exception as e:
        logger.error(f"Failed to save transcript: {e}")


def _timestamp() -> str:
    """ISO 8601 UTC timestamp."""
    return datetime.now(timezone.utc).isoformat()


def _ws_frame(msg_type: str, text: str) -> str:
    """Serialize an outbound WebSocket message frame."""
    return json.dumps({
        "type": msg_type,
        "text": text,
        "timestamp": _timestamp(),
    })


async def handle_audio_websocket(websocket: WebSocket) -> None:
    """
    Full lifecycle handler for a single WebSocket audio session.

    Protocol:
      → Client sends: {"type": "start", "sampleRate": 16000, "mimeType": "audio/webm"}
      → Client sends: <binary audio chunk> (repeated every ~250ms)
      → Client sends: {"type": "stop"}
      ← Server sends: {"type": "transcript_partial", "text": "..."}
      ← Server sends: {"type": "transcript_final",   "text": "..."}
      ← Server sends: {"type": "response_partial",   "text": "..."}
      ← Server sends: {"type": "response_final",     "text": "..."}
    """
    await websocket.accept()
    session_id = uuid.uuid4().hex[:8]
    logger.info(f"[WS:{session_id}] Connection opened")

    audio_chunks: list[bytes] = []
    mime_type: str = "audio/webm"
    is_recording: bool = False

    try:
        while True:
            message = await websocket.receive()

            # ── Text frame (JSON control message) ─────────────────────────
            if "text" in message:
                try:
                    data = json.loads(message["text"])
                except json.JSONDecodeError:
                    logger.warning(f"[WS:{session_id}] Non-JSON text frame ignored")
                    continue

                msg_type = data.get("type", "")

                if msg_type == "start":
                    mime_type = data.get("mimeType", "audio/webm")
                    sample_rate = data.get("sampleRate", 16000)
                    audio_chunks.clear()
                    is_recording = True
                    logger.info(
                        f"[WS:{session_id}] Recording started "
                        f"(mime={mime_type}, rate={sample_rate})"
                    )

                elif msg_type == "stop":
                    is_recording = False
                    logger.info(
                        f"[WS:{session_id}] Recording stopped, "
                        f"{len(audio_chunks)} chunks, "
                        f"{sum(len(c) for c in audio_chunks)} bytes total"
                    )
                    await _process_session(websocket, session_id, audio_chunks, mime_type)
                    audio_chunks.clear()

            # ── Binary frame (audio data chunk) ───────────────────────────
            elif "bytes" in message and message["bytes"]:
                if is_recording:
                    chunk = message["bytes"]
                    audio_chunks.append(chunk)

                    # Send periodic partial transcript feedback to indicate
                    # the server is alive and receiving audio
                    if len(audio_chunks) % 8 == 0:  # Every ~2 seconds
                        await websocket.send_text(
                            _ws_frame("transcript_partial", "Listening…")
                        )

    except (WebSocketDisconnect, RuntimeError):
        logger.info(f"[WS:{session_id}] Client disconnected")
        # If we have unprocessed chunks, process them
        if audio_chunks:
            logger.info(f"[WS:{session_id}] Processing {len(audio_chunks)} remaining chunks")
            try:
                await _process_session(websocket, session_id, audio_chunks, mime_type)
            except Exception:
                pass  # Connection already closed
    except Exception as e:
        logger.error(f"[WS:{session_id}] Unexpected error: {e}", exc_info=True)
        try:
            await websocket.send_text(_ws_frame("error", str(e)))
        except Exception:
            pass


async def _process_session(
    websocket: WebSocket,
    session_id: str,
    audio_chunks: list[bytes],
    mime_type: str,
) -> None:
    """
    Process accumulated audio chunks:
      1. Merge into a single blob
      2. Transcribe to text
      3. Save transcript to text file
      4. Stream back an LLM response
    """
    if not audio_chunks:
        await websocket.send_text(
            _ws_frame("error", "No audio data received")
        )
        return

    # ── Merge chunks ──────────────────────────────────────────────────────
    merged_audio = b"".join(audio_chunks)
    logger.info(f"[WS:{session_id}] Merged audio: {len(merged_audio)} bytes")

    # Determine file extension from MIME
    ext = "webm"
    if "ogg" in mime_type:
        ext = "ogg"
    elif "mp4" in mime_type:
        ext = "mp4"

    # ── Transcribe ────────────────────────────────────────────────────────
    try:
        await websocket.send_text(
            _ws_frame("transcript_partial", "Transcribing…")
        )

        transcript = await transcribe_audio_bytes(merged_audio, f"recording.{ext}")

        await websocket.send_text(
            _ws_frame("transcript_final", transcript)
        )
        logger.info(f"[WS:{session_id}] Transcript: {transcript[:60]}")

        # Save transcript to text file
        _save_transcript(f"WS:{session_id}", transcript)
    except Exception as e:
        logger.error(f"[WS:{session_id}] Transcription failed: {e}")
        await websocket.send_text(
            _ws_frame("error", f"Transcription failed: {e}")
        )
        return

    # ── Generate & stream response ────────────────────────────────────────
    try:
        final_response = ""
        async for accumulated_text in generate_response_stream(transcript):
            final_response = accumulated_text
            await websocket.send_text(
                _ws_frame("response_partial", accumulated_text)
            )

        await websocket.send_text(
            _ws_frame("response_final", final_response)
        )
        logger.info(f"[WS:{session_id}] Response sent: {final_response[:60]}")

        # Save response to text file
        _save_transcript(f"WS:{session_id}-RESPONSE", final_response)
    except Exception as e:
        logger.error(f"[WS:{session_id}] Response generation failed: {e}")
        await websocket.send_text(
            _ws_frame("error", f"Response generation failed: {e}")
        )
