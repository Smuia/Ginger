"use client";

import { useState, useRef, useCallback, useEffect } from "react";
import Image from "next/image";
import type {
  RecordingState,
  ConnectionMode,
  TranscriptEntry,
  AudioUploadResponse,
} from "@/types";
import {
  AUDIO_UPLOAD_ENDPOINT,
  WS_AUDIO_ENDPOINT,
  getSupportedMimeType,
  config,
} from "@/config";
import {
  speak,
  cancel as cancelSpeech,
  initVoices,
} from "@/utils/speechSynthesis";
import MicButton from "./MicButton";
import UserMenu from "./UserMenu";
import TranscriptDisplay from "./TranscriptDisplay";

/** Generate a unique ID for transcript entries */
function uid(): string {
  return `${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
}

// ─── VAD (Voice Activity Detection) Constants ─────────────────────────────────
/** RMS threshold below which audio is considered "silence" (0–1 range) */
const SILENCE_THRESHOLD = 0.015;
/** How long the user must be silent before auto-stopping (ms) */
const SILENCE_DURATION_MS = 1800;
/** Minimum recording duration before VAD can trigger (ms) — prevents instant stop */
const MIN_RECORDING_MS = 600;
/** How often to sample the audio level (ms) */
const VAD_POLL_INTERVAL_MS = 100;

/**
 * AudioInterface — The primary orchestrator component.
 *
 * Manages microphone capture, dual-mode audio transmission (REST / WebSocket),
 * transcript state, text-to-speech playback, and automatic Voice Activity
 * Detection to stop recording when the user stops speaking.
 */
export default function AudioInterface() {
  // ─── State ──────────────────────────────────────────────────────────────────
  const [state, setState] = useState<RecordingState>("idle");
  const mode = config.mode;
  const [entries, setEntries] = useState<TranscriptEntry[]>([]);
  const [partialText, setPartialText] = useState("");
  const [stream, setStream] = useState<MediaStream | null>(null);

  // ─── Refs ───────────────────────────────────────────────────────────────────
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const wsRef = useRef<WebSocket | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const restAudioRef = useRef<HTMLAudioElement | null>(null);

  // ─── Realtime Streaming & Playback Refs ─────────────────────────────────────
  const processorRef = useRef<ScriptProcessorNode | null>(null);
  const streamingCtxRef = useRef<AudioContext | null>(null);
  const playQueueRef = useRef<Float32Array[]>([]);
  const isPlayingRef = useRef<boolean>(false);
  const nextPlayTimeRef = useRef<number>(0);
  const playbackContextRef = useRef<AudioContext | null>(null);
  const currentPlaybackSourcesRef = useRef<AudioBufferSourceNode[]>([]);

  // ─── VAD Refs ───────────────────────────────────────────────────────────────
  const vadIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const audioCtxRef = useRef<AudioContext | null>(null);
  const analyserRef = useRef<AnalyserNode | null>(null);
  const silenceStartRef = useRef<number | null>(null);
  const recordingStartRef = useRef<number>(0);
  /** Callback to invoke when VAD detects silence — set by start* functions */
  const vadStopCallbackRef = useRef<(() => void) | null>(null);

  // ─── Init voices on mount ──────────────────────────────────────────────────
  useEffect(() => {
    initVoices();
  }, []);

  // ─── Helpers ────────────────────────────────────────────────────────────────
  const addEntry = useCallback(
    (text: string, type: TranscriptEntry["type"]) => {
      setEntries((prev) => [
        ...prev,
        { id: uid(), text, type, timestamp: Date.now() },
      ]);
    },
    [],
  );

  const stopMediaStream = useCallback(() => {
    if (streamRef.current) {
      streamRef.current.getTracks().forEach((track) => track.stop());
      streamRef.current = null;
      setStream(null);
    }
  }, []);

  // ─── Realtime Playback Engine ───────────────────────────────────────────────
  const stopPlayback = useCallback(() => {
    currentPlaybackSourcesRef.current.forEach((src) => {
      try {
        src.stop();
      } catch {}
    });
    currentPlaybackSourcesRef.current = [];
    playQueueRef.current = [];
    isPlayingRef.current = false;
    nextPlayTimeRef.current = 0;

    if (restAudioRef.current) {
      try {
        restAudioRef.current.pause();
        restAudioRef.current.src = "";
      } catch {}
      restAudioRef.current = null;
    }
  }, []);

  const playNextChunkRef = useRef<() => void>(() => {});

  const playNextChunk = useCallback(() => {
    if (playQueueRef.current.length === 0) {
      isPlayingRef.current = false;
      setState((prev) => (prev === "speaking" ? "idle" : prev));
      return;
    }

    isPlayingRef.current = true;
    const chunk = playQueueRef.current.shift()!;
    const ctx = playbackContextRef.current;
    if (!ctx) return;

    const audioBuffer = ctx.createBuffer(1, chunk.length, 24000);
    audioBuffer.getChannelData(0).set(chunk);

    const source = ctx.createBufferSource();
    source.buffer = audioBuffer;
    source.connect(ctx.destination);
    currentPlaybackSourcesRef.current.push(source);

    const currentTime = ctx.currentTime;
    let playTime = nextPlayTimeRef.current;
    if (playTime < currentTime) {
      playTime = currentTime + 0.02;
    }

    source.start(playTime);
    nextPlayTimeRef.current = playTime + audioBuffer.duration;

    source.onended = () => {
      currentPlaybackSourcesRef.current =
        currentPlaybackSourcesRef.current.filter((s) => s !== source);
      playNextChunkRef.current();
    };
  }, []);

  useEffect(() => {
    playNextChunkRef.current = playNextChunk;
  }, [playNextChunk]);

  const queueAudioChunk = useCallback(
    (base64Data: string) => {
      const binaryString = window.atob(base64Data);
      const len = binaryString.length;
      const bytes = new Uint8Array(len);
      for (let i = 0; i < len; i++) {
        bytes[i] = binaryString.charCodeAt(i);
      }

      const int16Array = new Int16Array(bytes.buffer);
      const float32Array = new Float32Array(int16Array.length);
      for (let i = 0; i < int16Array.length; i++) {
        float32Array[i] = int16Array[i] / 32768.0;
      }

      if (!playbackContextRef.current) {
        playbackContextRef.current = new (
          window.AudioContext ||
          (window as Window & { webkitAudioContext?: typeof AudioContext })
            .webkitAudioContext
        )({ sampleRate: 24000 });
        nextPlayTimeRef.current = 0;
      }

      playQueueRef.current.push(float32Array);
      if (!isPlayingRef.current) {
        playNextChunk();
      }
    },
    [playNextChunk],
  );

  // ─── VAD: Start / Stop ──────────────────────────────────────────────────────
  const stopVAD = useCallback(() => {
    if (vadIntervalRef.current) {
      clearInterval(vadIntervalRef.current);
      vadIntervalRef.current = null;
    }
    if (audioCtxRef.current) {
      audioCtxRef.current.close().catch(() => {});
      audioCtxRef.current = null;
    }
    analyserRef.current = null;
    silenceStartRef.current = null;
    vadStopCallbackRef.current = null;
  }, []);

  const startVAD = useCallback(
    (mediaStream: MediaStream, onSilenceDetected: () => void) => {
      // Clean up any previous VAD
      stopVAD();

      const audioCtx = new AudioContext();
      audioCtxRef.current = audioCtx;

      const analyser = audioCtx.createAnalyser();
      analyser.fftSize = 512;
      analyser.smoothingTimeConstant = 0.3;
      analyserRef.current = analyser;

      const source = audioCtx.createMediaStreamSource(mediaStream);
      source.connect(analyser);

      vadStopCallbackRef.current = onSilenceDetected;
      recordingStartRef.current = Date.now();
      silenceStartRef.current = null;

      const dataArray = new Float32Array(analyser.fftSize);

      vadIntervalRef.current = setInterval(() => {
        if (!analyserRef.current) return;

        analyserRef.current.getFloatTimeDomainData(dataArray);

        // Calculate RMS (root mean square) for volume level
        let sumSquares = 0;
        for (let i = 0; i < dataArray.length; i++) {
          sumSquares += dataArray[i] * dataArray[i];
        }
        const rms = Math.sqrt(sumSquares / dataArray.length);

        const now = Date.now();
        const elapsed = now - recordingStartRef.current;

        if (rms < SILENCE_THRESHOLD) {
          // Audio is below silence threshold
          if (silenceStartRef.current === null) {
            silenceStartRef.current = now;
          }

          const silenceDuration = now - silenceStartRef.current;

          // Only auto-stop if we've recorded for at least MIN_RECORDING_MS
          // and silence has lasted SILENCE_DURATION_MS
          if (
            elapsed > MIN_RECORDING_MS &&
            silenceDuration >= SILENCE_DURATION_MS
          ) {
            if (vadStopCallbackRef.current) {
              vadStopCallbackRef.current();
            }
          }
        } else {
          // User is speaking — reset silence timer
          silenceStartRef.current = null;
        }
      }, VAD_POLL_INTERVAL_MS);
    },
    [stopVAD],
  );

  // ─── REST Mode: Record & Upload ────────────────────────────────────────────
  const startRestRecording = useCallback(async () => {
    try {
      setState("requesting_permission");

      const mediaStream = await navigator.mediaDevices.getUserMedia({
        audio: {
          echoCancellation: true,
          noiseSuppression: true,
          sampleRate: 24000,
        },
      });

      streamRef.current = mediaStream;
      setStream(mediaStream);

      const mimeType = getSupportedMimeType();
      const recorder = new MediaRecorder(mediaStream, { mimeType });
      mediaRecorderRef.current = recorder;
      chunksRef.current = [];

      recorder.ondataavailable = (e) => {
        if (e.data.size > 0) chunksRef.current.push(e.data);
      };

      recorder.onstop = async () => {
        setState("processing");
        stopVAD();
        stopMediaStream();

        const blob = new Blob(chunksRef.current, { type: mimeType });
        chunksRef.current = [];

        try {
          const formData = new FormData();
          formData.append(
            "file",
            blob,
            `recording.${mimeType.includes("webm") ? "webm" : "ogg"}`,
          );

          const res = await fetch(AUDIO_UPLOAD_ENDPOINT, {
            method: "POST",
            body: formData,
          });

          if (!res.ok) {
            throw new Error(`Server responded with ${res.status}`);
          }

          const data: AudioUploadResponse = await res.json();

          if (data.error) {
            addEntry(data.error, "error");
            setState("idle");
            return;
          }

          // Display transcript if available
          if (data.transcript) {
            addEntry(data.transcript, "user");
          }

          // Speak & display response
          const responseText = data.response ?? data.transcript ?? "";
          if (responseText) {
            addEntry(responseText, "assistant");
            setState("speaking");
            try {
              if (data.audio) {
                const audio = new Audio(`data:audio/mp3;base64,${data.audio}`);
                restAudioRef.current = audio;
                audio.onended = () => {
                  setState("idle");
                  restAudioRef.current = null;
                };
                audio.onerror = () => {
                  setState("idle");
                  restAudioRef.current = null;
                };
                await audio.play();
              } else {
                await speak(responseText);
                setState("idle");
              }
            } catch {
              setState("idle");
            }
          } else {
            setState("idle");
          }
        } catch (err) {
          const message = err instanceof Error ? err.message : "Upload failed";
          addEntry(`${message} (Endpoint: ${AUDIO_UPLOAD_ENDPOINT})`, "error");
          setState("idle");
        }
      };

      recorder.start();
      setState("recording");

      // Start VAD — auto-stop when user goes silent
      startVAD(mediaStream, () => {
        if (mediaRecorderRef.current?.state === "recording") {
          mediaRecorderRef.current.stop();
        }
      });
    } catch (err) {
      const message =
        err instanceof Error ? err.message : "Microphone access denied";
      addEntry(message, "error");
      setState("error");
      setTimeout(() => setState("idle"), 2000);
    }
  }, [addEntry, stopMediaStream, startVAD, stopVAD]);

  const stopRestRecording = useCallback(() => {
    stopVAD();
    if (
      mediaRecorderRef.current &&
      mediaRecorderRef.current.state === "recording"
    ) {
      mediaRecorderRef.current.stop();
    }
  }, [stopVAD]);

  const doStopWsStreaming = useCallback(() => {
    stopVAD();

    if (processorRef.current) {
      processorRef.current.disconnect();
      processorRef.current = null;
    }

    if (streamingCtxRef.current) {
      streamingCtxRef.current.close().catch(() => {});
      streamingCtxRef.current = null;
    }

    // Send stop control frame
    if (wsRef.current) {
      if (wsRef.current.readyState === WebSocket.OPEN) {
        wsRef.current.send(JSON.stringify({ type: "stop" }));
      }
    }

    stopMediaStream();
    setState("processing");
  }, [stopMediaStream, stopVAD]);

  // ─── WebSocket Mode: Stream Audio ──────────────────────────────────────────
  const startWsStreaming = useCallback(async () => {
    try {
      setState("requesting_permission");
      stopPlayback();

      const mediaStream = await navigator.mediaDevices.getUserMedia({
        audio: {
          echoCancellation: true,
          noiseSuppression: true,
          sampleRate: 24000,
        },
      });

      streamRef.current = mediaStream;
      setStream(mediaStream);

      // Open WebSocket
      const ws = new WebSocket(WS_AUDIO_ENDPOINT);
      wsRef.current = ws;

      ws.onopen = () => {
        // Send start control frame
        ws.send(
          JSON.stringify({
            type: "start",
            sampleRate: 24000,
            mimeType: "audio/pcm",
          }),
        );

        const audioContext = new (
          window.AudioContext ||
          (window as Window & { webkitAudioContext?: typeof AudioContext })
            .webkitAudioContext
        )();
        streamingCtxRef.current = audioContext;
        const actualRate = audioContext.sampleRate;

        const source = audioContext.createMediaStreamSource(mediaStream);
        const processor = audioContext.createScriptProcessor(4096, 1, 1);
        processorRef.current = processor;

        const TARGET_RATE = 24000;

        processor.onaudioprocess = (e) => {
          if (ws.readyState !== WebSocket.OPEN) return;
          const inputData = e.inputBuffer.getChannelData(0);

          // Resample from actualRate to TARGET_RATE
          let samples: Float32Array;
          if (actualRate === TARGET_RATE) {
            samples = inputData;
          } else {
            const ratio = actualRate / TARGET_RATE;
            const newLength = Math.round(inputData.length / ratio);
            samples = new Float32Array(newLength);
            for (let i = 0; i < newLength; i++) {
              const srcIndex = i * ratio;
              const low = Math.floor(srcIndex);
              const high = Math.min(low + 1, inputData.length - 1);
              const frac = srcIndex - low;
              samples[i] = inputData[low] * (1 - frac) + inputData[high] * frac;
            }
          }

          const pcm16 = new Int16Array(samples.length);
          for (let i = 0; i < samples.length; i++) {
            const s = Math.max(-1, Math.min(1, samples[i]));
            pcm16[i] = s < 0 ? s * 0x8000 : s * 0x7fff;
          }

          ws.send(pcm16.buffer);
        };

        source.connect(processor);
        processor.connect(audioContext.destination);

        setState("recording");

        // Start VAD — auto-stop when user goes silent
        startVAD(mediaStream, () => {
          doStopWsStreaming();
        });
      };

      ws.onmessage = (event) => {
        try {
          const msg = JSON.parse(event.data as string);

          switch (msg.type) {
            case "transcript_final":
              setPartialText("");
              addEntry(msg.text, "user");
              break;

            case "response_partial":
              setPartialText(msg.text);
              break;

            case "audio_delta":
              queueAudioChunk(msg.delta);
              setState("speaking");
              break;

            case "response_final":
              setPartialText("");
              addEntry(msg.text, "assistant");
              if (wsRef.current) {
                wsRef.current.close();
                wsRef.current = null;
              }
              break;

            case "error":
              addEntry(msg.text, "error");
              setState("idle");
              if (wsRef.current) {
                wsRef.current.close();
                wsRef.current = null;
              }
              break;
          }
        } catch {
          // Non-JSON message; ignore
        }
      };

      ws.onerror = () => {
        addEntry(
          `WebSocket connection error (Endpoint: ${WS_AUDIO_ENDPOINT})`,
          "error",
        );
        stopVAD();
        stopMediaStream();
        setState("idle");
      };

      ws.onclose = () => {
        if (processorRef.current) {
          processorRef.current.disconnect();
          processorRef.current = null;
        }
        stopVAD();
        stopMediaStream();
      };
    } catch (err) {
      const message =
        err instanceof Error ? err.message : "Microphone access denied";
      addEntry(message, "error");
      setState("error");
      setTimeout(() => setState("idle"), 2000);
    }
  }, [
    addEntry,
    stopMediaStream,
    startVAD,
    stopVAD,
    queueAudioChunk,
    stopPlayback,
    doStopWsStreaming,
  ]);

  // ─── Toggle Handler ─────────────────────────────────────────────────────────
  const handleToggle = useCallback(() => {
    cancelSpeech();

    if (state === "recording") {
      if (mode === "rest") {
        stopRestRecording();
      } else {
        doStopWsStreaming();
      }
    } else if (state === "idle" || state === "error") {
      if (mode === "rest") {
        startRestRecording();
      } else {
        startWsStreaming();
      }
    } else if (state === "speaking") {
      stopPlayback();
      setState("idle");
    }
  }, [
    state,
    mode,
    stopRestRecording,
    doStopWsStreaming,
    startRestRecording,
    startWsStreaming,
    stopPlayback,
  ]);

  // ─── Cleanup on unmount ─────────────────────────────────────────────────────
  useEffect(() => {
    return () => {
      cancelSpeech();
      stopPlayback();
      stopVAD();
      stopMediaStream();
      if (wsRef.current) {
        wsRef.current.close();
        wsRef.current = null;
      }
    };
  }, [stopMediaStream, stopVAD, stopPlayback]);

  // ─── Render ─────────────────────────────────────────────────────────────────
  // const isEngaged = state !== "idle";

  return (
    <div className='flex flex-col items-center justify-center w-full max-w-md mx-auto gap-4 md:gap-6 px-4 py-2'>
      {/* User Menu — top right corner */}
      <div className='absolute top-5 right-5 md:top-8 md:right-8'>
        <UserMenu />
      </div>

      {/* Microphone Button */}
      <div className='flex items-center justify-center mt-[50px] min-h-0 mb-14'>
        <MicButton state={state} stream={stream} onToggle={handleToggle} />
      </div>

      {/* Persistent Logo Display */}
      <div
        className={`flex justify-center transition-all duration-500 ease-out ${
          state !== "idle"
            ? "mt-6 md:mt-8 scale-95 opacity-40"
            : "mt-1 opacity-60"
        }`}>
        <Image
          src='/logo.webp'
          alt='Gamba AI'
          width={90}
          height={54}
          className='object-contain'
          priority
        />
      </div>

      {/* Transcript Display */}
      <div className='w-full mt-6'>
        <TranscriptDisplay entries={entries} partialText={partialText} />
      </div>

      {/* Dynamic tagline footer */}
      {/* <footer className="pb-6 md:pb-8">
        <p
          className={`
            text-[10px] tracking-[0.2em] uppercase select-none
            transition-all duration-700
            ${isEngaged
              ? 'animate-blue-text font-medium'
              : 'text-black/15'
            }
          `}
        >
          {isEngaged ? 'A local AI for you' : 'Speech is the interface'}
        </p>
      </footer> */}
    </div>
  );
}
