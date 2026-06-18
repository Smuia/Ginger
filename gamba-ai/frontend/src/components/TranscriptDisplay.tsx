"use client";

import type { TranscriptEntry } from "@/types";
import { useEffect, useRef, useState } from "react";

interface TranscriptDisplayProps {
  entries: TranscriptEntry[];
  partialText: string;
}

/**
 * Renders the transcript/status messages with a fading typography effect.
 * Most recent entries appear at the bottom with full opacity;
 * older entries fade upward.
 * It is collapsible, displaying a "View Transcript" toggle.
 */
export default function TranscriptDisplay({
  entries,
  partialText,
}: TranscriptDisplayProps) {
  const [isOpen, setIsOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  // Auto-scroll to bottom on new entries
  useEffect(() => {
    if (containerRef.current) {
      containerRef.current.scrollTop = containerRef.current.scrollHeight;
    }
  }, [entries, partialText]);

  const hasContent = entries.length > 0 || !!partialText;

  if (!hasContent) {
    return null;
  }

  return (
    <div className="w-full flex flex-col items-center">
      {/* View Transcript Toggle */}
      <button
        onClick={() => setIsOpen(!isOpen)}
        className="
          group flex items-center gap-1.5 px-3 py-1.5 rounded-full
          bg-black/[0.02] hover:bg-black/[0.05] active:bg-black/[0.08]
          border border-black/[0.04] hover:border-black/[0.08]
          transition-all duration-300 select-none
          text-[10px] uppercase tracking-[0.15em] font-medium
          focus:outline-none focus-visible:ring-1 focus-visible:ring-amber-500/30
          cursor-pointer text-gray-600 hover:text-gray-800
        "
        aria-expanded={isOpen}
        aria-controls="transcript-content"
      >
        <span>{isOpen ? "Hide Transcript" : "View Transcript"}</span>
        <svg
          className={`w-3.5 h-3.5 text-gray-400 group-hover:text-gray-600 transition-transform duration-300 ${
            isOpen ? "rotate-180" : ""
          }`}
          fill="none"
          stroke="currentColor"
          strokeWidth="2.5"
          viewBox="0 0 24 24"
        >
          <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
        </svg>
      </button>

      {/* Collapsible Transcript Container */}
      <div
        id="transcript-content"
        className={`
          w-full transition-all duration-300 ease-in-out overflow-hidden
          ${
            isOpen && hasContent
              ? "max-h-48 md:max-h-60 opacity-100 mt-4"
              : "max-h-0 opacity-0 mt-0 pointer-events-none"
          }
        `}
      >
        <div
          ref={containerRef}
          className="
            w-full max-w-xl mx-auto px-5 py-4 space-y-3
            max-h-36 md:max-h-48 overflow-y-auto scroll-smooth
            bg-white/40 backdrop-blur-md
            border border-black/[0.03] rounded-2xl
            shadow-[0_4px_20px_rgba(0,0,0,0.02)]
          "
          style={{ scrollbarGutter: "stable" }}
          role="log"
          aria-live="polite"
          aria-label="Conversation transcript"
        >
          {entries.map((entry, index) => {
            // Fade only the oldest entries near the top of the visible window
            const distFromEnd = entries.length - 1 - index;
            const fadeLevel =
              distFromEnd >= 5 ? 0.35 : Math.max(0.4, 1 - distFromEnd * 0.12);
            return (
              <div
                key={entry.id}
                className={`transition-all duration-500 ease-out ${getEntryClasses(entry.type)}`}
                style={{ opacity: fadeLevel }}
              >
                <span className="text-[10px] uppercase tracking-[0.2em] block mb-1 opacity-40">
                  {entry.type === "user"
                    ? "You"
                    : entry.type === "assistant"
                      ? "Gamba"
                      : ""}
                </span>
                <p className="text-sm leading-relaxed md:text-base">{entry.text}</p>
              </div>
            );
          })}

          {/* Partial / streaming text */}
          {partialText && (
            <div className="animate-fade-in">
              <span className="text-[10px] uppercase tracking-[0.2em] block mb-1 text-amber-600/50">
                Gamba
              </span>
              <p className="text-sm leading-relaxed md:text-base text-amber-800/70">
                {partialText}
                <span className="inline-block w-[2px] h-4 ml-1 bg-amber-600 animate-blink align-middle" />
              </p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function getEntryClasses(type: TranscriptEntry["type"]): string {
  switch (type) {
    case "user":
      return "text-gray-500";
    case "assistant":
      return "text-gray-800";
    case "status":
      return "text-gray-400 text-xs italic";
    case "error":
      return "text-red-500/80 text-xs";
    default:
      return "text-gray-500";
  }
}
