# ──────────────────────────────────────────────────────────────────────────────
# blueprawn_ai_sim — Main FastAPI Application (OpenAI Realtime Upgrade)
# ──────────────────────────────────────────────────────────────────────────────
"""
Upgraded audio-first conversational backend proxy.

Establishes a low-latency, bidirectional WebSocket connection directly to 
OpenAI's Realtime Voice API, proxying raw audio chunks and transcript deltas
live between the browser client and OpenAI.
"""
from __future__ import annotations

import base64
import json
import logging
import uuid
import asyncio
from datetime import datetime, timezone
import websockets

from fastapi import FastAPI, WebSocket, WebSocketDisconnect, UploadFile, File
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse

from blueprawn_ai_sim.config import get_settings

# ── Logging Setup ─────────────────────────────────────────────────────────────

settings = get_settings()

import os
log_handlers = [logging.StreamHandler()]

# Only add FileHandler if we are not running on Vercel
if os.getenv("VERCEL") != "1":
    try:
        log_handlers.append(logging.FileHandler(settings.log_file, encoding="utf-8"))
    except Exception as e:
        import sys
        print(f"Warning: Could not initialize file logging to {settings.log_file}: {e}", file=sys.stderr)

logging.basicConfig(
    level=logging.DEBUG if settings.debug else logging.INFO,
    format="%(asctime)s │ %(levelname)-7s │ %(name)s │ %(message)s",
    handlers=log_handlers,
)
logger = logging.getLogger(__name__)

# ── FastAPI App ───────────────────────────────────────────────────────────────

app = FastAPI(
    title="Gamba Realtime Voice Agent",
    description="Real-time audio-to-audio proxy for Gamba voice interface using OpenAI Realtime WebSocket API",
    version=settings.app_version,
)

# Starlette requires allow_credentials=False when allow_origins contains "*"
allow_credentials = True
if "*" in settings.cors_origins:
    allow_credentials = False

app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.cors_origins,
    allow_credentials=allow_credentials,
    allow_methods=["*"],
    allow_headers=["*"],
)


# ── Startup Banner ────────────────────────────────────────────────────────────

@app.on_event("startup")
async def startup_event() -> None:
    mode = "🟢 LIVE (OpenAI Realtime API)" if settings.use_live_ai else "🟡 SIMULATION (Mock Realtime)"
    logger.info("=" * 60)
    logger.info(f"  Gamba Realtime Audio Proxy Server v{settings.app_version}")
    logger.info(f"  Mode: {mode}")
    logger.info(f"  Target OpenAI model: gpt-realtime")
    logger.info("=" * 60)


# ── Transcript Persistence ────────────────────────────────────────────────────

def _save_transcript(source: str, text: str) -> None:
    """Append a timestamped transcript line to the transcripts text file."""
    timestamp = datetime.now(timezone.utc).strftime("%Y-%m-%d %H:%M:%S UTC")
    line = f"[{timestamp}] [{source}] {text}\n"
    try:
        with open(settings.transcript_file, "a", encoding="utf-8") as f:
            f.write(line)
    except Exception as e:
        logger.error(f"Failed to save transcript: {e}")


# ── WebSocket: /ws/audio (Realtime Proxy) ─────────────────────────────────────

@app.websocket("/ws/audio")
async def websocket_audio(websocket: WebSocket):
    """
    Real-time bidirectional audio streaming proxy endpoint.
    Connects to OpenAI's native WebSocket Realtime API, proxying raw audio
    upstream and streaming base64 audio + transcript deltas downstream.
    """
    session_id = str(uuid.uuid4())[:8]
    logger.info(f"[WS:{session_id}] Next.js client connected")

    # Routing to Mock Realtime Simulation if live AI is disabled
    if not settings.use_live_ai:
        logger.info(f"[WS:{session_id}] Routing connection to Offline/Simulated Mock Realtime Handler")
        from blueprawn_ai_sim.ws.handler import handle_audio_websocket
        await handle_audio_websocket(websocket)
        return

    await websocket.accept()

    # API key validation
    if not settings.openai_api_key:
        logger.error(f"[WS:{session_id}] OPENAI_API_KEY environment variable is empty!")
        await websocket.send_text(json.dumps({
            "type": "error",
            "text": "Configuration Error: OpenAI API key is missing on the server."
        }))
        await websocket.close()
        return

    # Connection endpoint for OpenAI Realtime API (GA version)
    openai_realtime_url = "wss://api.openai.com/v1/realtime?model=gpt-realtime"
    openai_headers = {
        "Authorization": f"Bearer {settings.openai_api_key}",
    }

    # Select headers argument dynamically based on websockets library version (v14+ renamed extra_headers to additional_headers)
    ws_kwargs = {}
    try:
        import websockets
        ws_version = getattr(websockets, "__version__", "10.0")
        major_version = int(ws_version.split(".")[0])
        if major_version >= 14:
            ws_kwargs["additional_headers"] = openai_headers
        else:
            ws_kwargs["extra_headers"] = openai_headers
    except Exception:
        ws_kwargs["additional_headers"] = openai_headers

    try:
        logger.info(f"[WS:{session_id}] Opening socket connection to OpenAI Realtime API...")
        async with websockets.connect(openai_realtime_url, **ws_kwargs) as openai_ws:
            logger.info(f"[WS:{session_id}] Bidirectional Realtime session established with OpenAI")

            # ── 1. Configure the Voice Session & East African Accent ──────────
            # Uses the GA nested audio structure required by gpt-realtime models
            session_config = {
                "type": "session.update",
                "session": {
                    "type": "realtime",
                    "instructions": (
                        "You are Gamba, a brilliant, warm, and conversational AI assistant. "
                        "You speak and respond by default in Luganda. "
                        "You must adopt a natural, friendly, and warm Luganda-inflected female accent across all spoken responses. "
                        "When speaking Luganda, sound like a native speaker from Uganda. "
                        "When speaking English or Swahili, speak with a soft, distinct Ugandan (Luganda) accent, maintaining natural local intonation and warmth. "
                        "You can also understand English and Swahili and switch to them if the user initiates or changes languages mid-conversation. "
                        "Keep spoken responses short, concise, and highly interactive."
                    ),
                    "audio": {
                        "input": {
                            "format": {
                                "type": "audio/pcm",
                                "rate": 24000
                            },
                            "transcription": {
                                "model": "whisper-1"
                            },
                            "turn_detection": None  # We manually trigger response generation on stop control frames
                        },
                        "output": {
                            "format": {
                                "type": "audio/pcm",
                                "rate": 24000
                            },
                            "voice": "shimmer"
                        }
                    }
                }
            }
            await openai_ws.send(json.dumps(session_config))
            logger.info(f"[WS:{session_id}] Session config sent, waiting for confirmation...")

            # Wait for session.updated confirmation before streaming audio
            async for raw_msg in openai_ws:
                event = json.loads(raw_msg)
                event_type = event.get("type")
                logger.info(f"[WS:{session_id}] Init event: {event_type}")
                if event_type == "session.updated" or event_type == "session.created":
                    logger.info(f"[WS:{session_id}] Session confirmed. Ready for audio.")
                    break
                elif event_type == "error":
                    error_msg = event.get("error", {}).get("message", "Unknown error")
                    logger.error(f"[WS:{session_id}] Session config rejected: {error_msg}")
                    await websocket.send_text(json.dumps({
                        "type": "error",
                        "text": f"OpenAI session config error: {error_msg}"
                    }))
                    await websocket.close()
                    return

            # Turn variables for consolidated logging (Task D)
            last_user_transcript = [""]
            last_assistant_transcript = [""]
            chunks_forwarded = [0]

            # ── 2. Upstream Loop: Next.js Client ──▸ OpenAI ────────────────────
            async def upstream_loop():
                try:
                    while True:
                        message = await websocket.receive()

                        # Text control frames (JSON)
                        if "text" in message:
                            data = json.loads(message["text"])
                            msg_type = data.get("type")

                            if msg_type == "start":
                                logger.info(f"[WS:{session_id}] Client initiated stream.")
                            elif msg_type == "stop":
                                logger.info(f"[WS:{session_id}] Client completed speech. Committing buffer...")
                                # Commit buffer and trigger completion response
                                await openai_ws.send(json.dumps({"type": "input_audio_buffer.commit"}))
                                await openai_ws.send(json.dumps({"type": "response.create"}))

                        # Binary audio stream chunk
                        elif "bytes" in message and message["bytes"]:
                            audio_chunk = message["bytes"]
                            chunks_forwarded[0] += 1
                            if chunks_forwarded[0] == 1 or chunks_forwarded[0] % 10 == 0:
                                logger.info(f"[WS:{session_id}] Forwarding audio chunk #{chunks_forwarded[0]} ({len(audio_chunk)} bytes)")
                            # Base64 encode and package in OpenAI event
                            base64_audio = base64.b64encode(audio_chunk).decode("utf-8")
                            await openai_ws.send(json.dumps({
                                "type": "input_audio_buffer.append",
                                "audio": base64_audio
                            }))

                except WebSocketDisconnect:
                    logger.info(f"[WS:{session_id}] Client disconnected (Upstream)")
                except Exception as e:
                    logger.error(f"[WS:{session_id}] Upstream error occurred: {e}")

            # ── 3. Downstream Loop: OpenAI ──▸ Next.js Client ─────────────────
            async def downstream_loop():
                try:
                    async for raw_response in openai_ws:
                        event = json.loads(raw_response)
                        event_type = event.get("type")

                        # Error Handling
                        if event_type == "error":
                            logger.error(f"[WS:{session_id}] OpenAI Error: {event}")
                            await websocket.send_text(json.dumps({
                                "type": "error",
                                "text": event.get("error", {}).get("message", "OpenAI internal connection error.")
                            }))

                        # Capture User Transcription Completed
                        elif event_type == "conversation.item.input_audio_transcription.completed":
                            transcript = event.get("transcript", "").strip()
                            if transcript:
                                last_user_transcript[0] = transcript
                                logger.info(f"[WS:{session_id}] Transcription complete: {transcript}")
                                # Forward user transcript to frontend
                                await websocket.send_text(json.dumps({
                                    "type": "transcript_final",
                                    "text": transcript
                                }))

                        # Streaming Text Response Delta (Task C)
                        elif event_type == "response.output_audio_transcript.delta":
                            text_delta = event.get("delta", "")
                            if text_delta:
                                await websocket.send_text(json.dumps({
                                    "type": "response_partial",
                                    "text": text_delta
                                }))

                        # Streaming Audio Delta (Task C)
                        elif event_type == "response.output_audio.delta":
                            audio_delta = event.get("delta", "")
                            if audio_delta:
                                await websocket.send_text(json.dumps({
                                    "type": "audio_delta",
                                    "delta": audio_delta
                                }))

                        # Capture Assistant Audio Response Complete
                        elif event_type == "response.output_audio_transcript.done":
                            assistant_text = event.get("transcript", "").strip()
                            if assistant_text:
                                last_assistant_transcript[0] = assistant_text
                                logger.info(f"[WS:{session_id}] Completed response: {assistant_text}")
                                # Forward final assistant transcript to frontend
                                await websocket.send_text(json.dumps({
                                    "type": "response_final",
                                    "text": assistant_text
                                }))

                        # Log Completed Turn to audio_endpoint.log (Task D)
                        elif event_type == "response.done":
                            timestamp = datetime.now(timezone.utc).strftime("%Y-%m-%d %H:%M:%S UTC")
                            
                            # Strict Compliance with Task D Logging
                            log_entry = (
                                f"\n"
                                f"============================================================\n"
                                f"TIME: {timestamp}\n"
                                f"USER INTENT: {last_user_transcript[0]}\n"
                                f"OUTGOING VOICE RESPONSE: {last_assistant_transcript[0]}\n"
                                f"============================================================"
                            )
                            logger.info(log_entry)

                            # Persist transcripts to text file
                            _save_transcript(f"WS-REALTIME-USER:{session_id}", last_user_transcript[0])
                            _save_transcript(f"WS-REALTIME-RESPONSE:{session_id}", last_assistant_transcript[0])
                            
                            # Reset turn states
                            last_user_transcript[0] = ""
                            last_assistant_transcript[0] = ""

                except Exception as e:
                    logger.error(f"[WS:{session_id}] Downstream error occurred: {e}")

            # Run upstream and downstream concurrently
            await asyncio.gather(upstream_loop(), downstream_loop())

    except Exception as e:
        logger.error(f"[WS:{session_id}] OpenAI Realtime session failed: {e}")
        error_msg = str(e)
        friendly_error = f"OpenAI Realtime API Connection Failed: {error_msg}"
        
        # Parse common errors to give clear actionable instructions
        if "invalid_api_key" in error_msg:
            friendly_error = (
                "OpenAI Connection Failed: The API key provided in backend/.env is invalid. "
                "Please verify your key, or set USE_LIVE_AI=false in backend/.env to run in offline Simulation Mode."
            )
        elif "insufficient_quota" in error_msg:
            friendly_error = (
                "OpenAI Connection Failed: The API key has insufficient quota or has expired. "
                "Please check your billing details, or set USE_LIVE_AI=false in backend/.env to run in offline Simulation Mode."
            )
            
        try:
            await websocket.send_text(json.dumps({
                "type": "error",
                "text": friendly_error
            }))
        except Exception:
            pass
    finally:
        logger.info(f"[WS:{session_id}] Bidirectional socket closed.")


# ── REST: /audio (Audio Upload Endpoint) ──────────────────────────────────────

@app.post("/audio")
async def upload_audio(file: UploadFile = File(...)):
    """
    REST endpoint to upload a recorded audio file, transcribe it,
    generate a conversational response, and return both as JSON.
    """
    session_id = str(uuid.uuid4())[:8]
    logger.info(f"[REST:{session_id}] Audio upload received: filename={file.filename}")
    
    try:
        # Read the uploaded file bytes
        audio_data = await file.read()
        if not audio_data:
            return JSONResponse(status_code=400, content={"error": "Empty audio file received"})
            
        logger.info(f"[REST:{session_id}] Read {len(audio_data)} bytes of audio data")
        
        # 1. Transcribe the audio
        from blueprawn_ai_sim.audio.transcriber import transcribe_audio_bytes
        transcript = await transcribe_audio_bytes(audio_data, file.filename)
        logger.info(f"[REST:{session_id}] Transcript: {transcript}")
        
        # 2. Save transcript to transcripts.txt file
        _save_transcript(f"REST:{session_id}", transcript)
        
        # 3. Generate response
        from blueprawn_ai_sim.llm.responder import generate_response
        response_text = await generate_response(transcript)
        logger.info(f"[REST:{session_id}] Response: {response_text}")
        
        # 4. Save response to transcripts.txt file
        _save_transcript(f"REST:{session_id}-RESPONSE", response_text)
        
        # 5. Generate synthetic audio using OpenAI TTS if in live mode
        audio_base64 = None
        if settings.use_live_ai and settings.openai_api_key:
            try:
                import openai
                client = openai.AsyncOpenAI(api_key=settings.openai_api_key)
                logger.info(f"[REST:{session_id}] Requesting OpenAI TTS for response...")
                tts_response = await client.audio.speech.create(
                    model="tts-1",
                    voice="shimmer",
                    input=response_text,
                    response_format="mp3",
                )
                audio_content = tts_response.content
                audio_base64 = base64.b64encode(audio_content).decode("utf-8")
                logger.info(f"[REST:{session_id}] OpenAI TTS audio generated ({len(audio_content)} bytes)")
            except Exception as tts_err:
                logger.error(f"[REST:{session_id}] OpenAI TTS generation failed: {tts_err}")
        
        # Log completed turn (Task D compatibility)
        timestamp = datetime.now(timezone.utc).strftime("%Y-%m-%d %H:%M:%S UTC")
        log_entry = (
            f"\n"
            f"============================================================\n"
            f"TIME: {timestamp}\n"
            f"USER INTENT: {transcript}\n"
            f"OUTGOING VOICE RESPONSE: {response_text}\n"
            f"============================================================"
        )
        logger.info(log_entry)
        
        return {
            "transcript": transcript,
            "response": response_text,
            "audio": audio_base64
        }
        
    except Exception as e:
        logger.error(f"[REST:{session_id}] REST audio upload failed: {e}", exc_info=True)
        return JSONResponse(status_code=500, content={"error": f"Internal Server Error: {str(e)}"})


# ── Health Check ──────────────────────────────────────────────────────────────

@app.get("/status")
async def status():
    """Health check endpoint."""
    return {
        "status": "Gamba Realtime AI audio endpoint online",
        "version": settings.app_version,
        "mode": "realtime-openai",
    }
