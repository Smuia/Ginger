"use client";

import { useState, useEffect } from "react";
import type { RecordingState } from "@/types";
import WaveformVisualizer from "./WaveformVisualizer";

interface MicButtonProps {
  state: RecordingState;
  stream: MediaStream | null;
  onToggle: () => void;
}

const STATUS_TEXTS = [""];

/**
 * The central microphone button — the primary UI element.
 * Changes appearance based on recording state with pulse animations
 * and a surrounding canvas-based waveform visualizer.
 */
export default function MicButton({ state, stream, onToggle }: MicButtonProps) {
  const isIdle = state === "idle";
  const isActive = state === "recording";
  const isProcessing = state === "processing";
  const isSpeaking = state === "speaking";
  const isDisabled = state === "requesting_permission";

  const [textIndex, setTextIndex] = useState(0);
  const [fade, setFade] = useState(true);

  useEffect(() => {
    if (!isIdle) return;

    const interval = setInterval(() => {
      setFade(false);
      setTimeout(() => {
        setTextIndex((prev) => (prev + 1) % STATUS_TEXTS.length);
        setFade(true);
      }, 450); // Matches smooth transition time
    }, 3600); // Transitions nicely every 3.6s

    return () => clearInterval(interval);
  }, [isIdle]);

  return (
    <div className='relative flex items-center justify-center w-72 h-72 md:w-80 md:h-80'>
      {/* Waveform visualizer layer */}
      <WaveformVisualizer stream={stream} isActive={isActive} />

      {/* ── Idle: Blue gradient glow rings ─────────────────────────────── */}
      {isIdle && (
        <>
          {/* Outer breathing ring */}
          <div
            className='absolute rounded-full animate-blue-ring'
            style={{
              inset: "-8px",
              background:
                "linear-gradient(135deg, rgba(59,130,246,0.06) 0%, rgba(99,102,241,0.04) 50%, rgba(59,130,246,0.06) 100%)",
              border: "1px solid rgba(59,130,246,0.12)",
            }}
          />
          {/* Inner breathing ring */}
          <div
            className='absolute rounded-full animate-blue-ring'
            style={{
              inset: "4px",
              background:
                "linear-gradient(315deg, rgba(59,130,246,0.04) 0%, rgba(147,197,253,0.03) 100%)",
              border: "1px solid rgba(59,130,246,0.08)",
              animationDelay: "0.5s",
            }}
          />
        </>
      )}

      {/* ── Recording: Gold glow rings ──────────────────────────────────── */}
      {isActive && (
        <>
          <div className='absolute inset-0 rounded-full border border-amber-600/15 animate-ping-slow' />
          <div
            className='absolute rounded-full border border-amber-600/8 animate-ping-slower'
            style={{ inset: "-16px" }}
          />
        </>
      )}

      {/* Processing spinner ring */}
      {isProcessing && (
        <div className='absolute inset-6 rounded-full border-2 border-transparent border-t-amber-600/40 animate-spin' />
      )}

      {/* Speaking pulse ring */}
      {isSpeaking && (
        <div className='absolute inset-4 rounded-full border border-amber-500/20 animate-pulse' />
      )}

      {/* Main button */}
      <button
        onClick={onToggle}
        disabled={isDisabled}
        aria-label={isActive ? "Stop recording" : "Start recording"}
        aria-pressed={isActive}
        className={`
          relative z-10 flex items-center justify-center
          w-24 h-24 md:w-28 md:h-28 rounded-full
          transition-all duration-500 ease-out
          cursor-pointer select-none
          focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-400/50 focus-visible:ring-offset-4 focus-visible:ring-offset-[#f8f9fc]
          ${isDisabled ? "opacity-50 cursor-not-allowed" : ""}
          ${
            isActive
              ? "bg-gradient-to-br from-amber-500 to-amber-700 shadow-[0_0_50px_rgba(184,150,12,0.25)] scale-110"
              : isProcessing
                ? "bg-gradient-to-br from-amber-500/50 to-amber-700/50 shadow-[0_0_30px_rgba(184,150,12,0.12)]"
                : isSpeaking
                  ? "bg-gradient-to-br from-amber-400/30 to-amber-600/30 shadow-[0_0_35px_rgba(184,150,12,0.15)]"
                  : "bg-gradient-to-br from-blue-100/60 to-indigo-100/40 animate-blue-glow hover:from-blue-100/80 hover:to-indigo-100/60 hover:scale-105"
          }
        `}>
        {/* Mic icon */}
        <svg
          viewBox='0 0 24 24'
          fill='none'
          className={`w-10 h-10 md:w-12 md:h-12 transition-all duration-500 ${
            isActive
              ? "text-white drop-shadow-[0_0_12px_rgba(255,255,255,0.5)]"
              : isProcessing || isSpeaking
                ? "text-amber-700/60"
                : "text-blue-400"
          }`}
          stroke='currentColor'
          strokeWidth='1.5'
          strokeLinecap='round'
          strokeLinejoin='round'>
          <rect x='9' y='2' width='6' height='12' rx='3' />
          <path d='M5 10a7 7 0 0 0 14 0' />
          <line x1='12' y1='17' x2='12' y2='21' />
          <line x1='8' y1='21' x2='16' y2='21' />
        </svg>

        {/* Active recording dot */}
        {isActive && (
          <div className='absolute top-3 right-3 w-2.5 h-2.5 rounded-full bg-red-500 animate-pulse shadow-[0_0_8px_rgba(239,68,68,0.6)]' />
        )}
      </button>

      {/* State label — positioned below the logo */}
      <span
        className={`
          absolute -bottom-16 text-[10px] uppercase tracking-[0.25em] font-medium
          transition-all duration-500 transform
          ${
            isActive
              ? "text-amber-600/80 scale-100 opacity-100 translate-y-0"
              : isProcessing
                ? "text-amber-600/50 animate-pulse scale-100 opacity-100 translate-y-0"
                : isSpeaking
                  ? "text-amber-500/50 scale-100 opacity-100 translate-y-0"
                  : `text-blue-300 ${
                      fade
                        ? "opacity-100 translate-y-0 scale-100 blur-0"
                        : "opacity-0 translate-y-1.5 scale-95 blur-[1.5px]"
                    }`
          }
        `}>
        {isActive
          ? "Listening…"
          : isProcessing
            ? "Processing…"
            : isSpeaking
              ? "Speaking…"
              : STATUS_TEXTS[textIndex]}
      </span>
    </div>
  );
}
