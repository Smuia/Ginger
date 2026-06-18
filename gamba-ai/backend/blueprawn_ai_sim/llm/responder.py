# ──────────────────────────────────────────────────────────────────────────────
# blueprawn_ai_sim — LLM Responder
# ──────────────────────────────────────────────────────────────────────────────
"""
Generates conversational responses from transcribed text.
Uses OpenAI GPT in live mode, or canned simulation responses for offline dev.
"""
from __future__ import annotations

import asyncio
import logging
import random
from typing import AsyncGenerator

from blueprawn_ai_sim.config import get_settings

logger = logging.getLogger(__name__)

# ── Simulation Responses ──────────────────────────────────────────────────────
_SIM_RESPONSES: dict[str, str] = {
    "hello": "Ki kati! Nsanyuse nnyo okukubala. Nnyinza kutandika ntya okukuyamba leero?",
    "weather": "Nandikebedde wabweru singa mbadde nnyinza! Kyokka kwebaze ku ssimu yo okulaba embeera y'obudde eya leero.",
    "space": "Eno nsonga nnyuvu: emmunyeenye eya neutron nzito nnyo lwakuba akayiko kamu k'ebintu byayo kandipimye ekitundu kya ttonni obuwumbi mukaaga!",
    "weekend": "Wiikendi ze zisinga! Olowooza ku kuwummulamu ne kufulumako? Oyagala kukola ki?",
    "time": "Sirina ssaawa wano, naye essimu yo oba kompyuta erina okulaga esaawa entuufu leero!",
    "learn": "Ekyo kirowoozo kirungi! Okyeyongedde okulaba nti kamyoolo alina emitima esatu n'omusaayi ogw'ebweru?",
    "music": "Sinyiza kukubila nnyimba butereevu, naye nkusaba onoonyereze ku nnyimba za 'lo-fi beats' — nnungi nnyo okwewumuzaamu.",
    "news": "Nkusaba ogende ku mikutu gy'amawulire okufuna amawulire amatuufu ag'akaseera kano. Kiki ky'oyagala okumanya?",
    "remind": "Ekyo nja kukijjukira! Naye ku bikwata ku kujjukizibwa, alalamu y'essimu yo y'esinga okukuyamba.",
    "coffee": "Kisaayi kirungi! Tandika n'emmwanyi ensa, koresa amazzi agakeesebwa, era ofumbe okumala eddakiika nnya. Nyumirwa!",
}

_FALLBACK_RESPONSES = [
    "Ekyo kirowoozo kirungi nnyo! Mbuulira ebirala ku ebyo by'olowooza.",
    "Nkukutte. Mbuulira singa waliwo ekintu kyonna kye nnyinza okukuyamba.",
    "Nkitegedde! Ndi wano buli lwennyini w'onnetagira.",
    "Webale okugabana ekyo. Kiki eky'okugenda okunoonyerezaako oluvanyuma?",
    "Kale ddala! Waliwo ekintu ekirala ky'oyagala okwogerako?",
]


async def generate_response(transcript: str) -> str:
    """
    Generate a conversational response for the given transcript.

    Args:
        transcript: The user's transcribed speech text.

    Returns:
        The assistant's response text.
    """
    settings = get_settings()

    if not settings.use_live_ai:
        return _simulate_response(transcript)

    return await _gpt_response(transcript)


async def generate_response_stream(transcript: str) -> AsyncGenerator[str, None]:
    """
    Stream a conversational response token-by-token.

    Args:
        transcript: The user's transcribed speech text.

    Yields:
        Accumulated response text as each token arrives.
    """
    settings = get_settings()

    if not settings.use_live_ai:
        async for chunk in _simulate_response_stream(transcript):
            yield chunk
        return

    async for chunk in _gpt_response_stream(transcript):
        yield chunk


# ── OpenAI GPT Implementation ────────────────────────────────────────────────

async def _gpt_response(transcript: str) -> str:
    """Generate a complete response using OpenAI GPT."""
    import openai

    settings = get_settings()
    client = openai.AsyncOpenAI(api_key=settings.openai_api_key)

    try:
        completion = await client.chat.completions.create(
            model=settings.gpt_model,
            messages=[
                {"role": "system", "content": settings.gpt_system_prompt},
                {"role": "user", "content": transcript},
            ],
            max_tokens=settings.gpt_max_tokens,
            temperature=0.7,
        )
        response = completion.choices[0].message.content or ""
        logger.info(f"GPT response: {response[:80]}...")
        return response.strip()
    except openai.APIError as e:
        logger.error(f"GPT API error: {e}")
        raise
    except Exception as e:
        logger.error(f"Response generation failed: {e}")
        raise


async def _gpt_response_stream(transcript: str) -> AsyncGenerator[str, None]:
    """Stream a response using OpenAI GPT with server-sent events."""
    import openai

    settings = get_settings()
    client = openai.AsyncOpenAI(api_key=settings.openai_api_key)

    try:
        stream = await client.chat.completions.create(
            model=settings.gpt_model,
            messages=[
                {"role": "system", "content": settings.gpt_system_prompt},
                {"role": "user", "content": transcript},
            ],
            max_tokens=settings.gpt_max_tokens,
            temperature=0.7,
            stream=True,
        )

        accumulated = ""
        async for chunk in stream:
            delta = chunk.choices[0].delta.content
            if delta:
                accumulated += delta
                yield accumulated

    except openai.APIError as e:
        logger.error(f"GPT streaming error: {e}")
        raise
    except Exception as e:
        logger.error(f"Streaming response failed: {e}")
        raise


# ── Simulation Implementation ────────────────────────────────────────────────

def _simulate_response(transcript: str) -> str:
    """Match a canned response based on keyword overlap."""
    lower = transcript.lower()
    for keyword, response in _SIM_RESPONSES.items():
        if keyword in lower:
            logger.info(f"[SIM] Matched keyword '{keyword}' → response")
            return response

    response = random.choice(_FALLBACK_RESPONSES)
    logger.info(f"[SIM] Fallback response for: {transcript[:40]}")
    return response


async def _simulate_response_stream(transcript: str) -> AsyncGenerator[str, None]:
    """
    Simulate streaming by yielding the response word-by-word
    with realistic latency.
    """
    full_response = _simulate_response(transcript)
    words = full_response.split()
    accumulated = ""

    for i, word in enumerate(words):
        accumulated += (" " if i > 0 else "") + word
        yield accumulated
        # Simulate LLM token generation latency
        await asyncio.sleep(random.uniform(0.04, 0.12))
