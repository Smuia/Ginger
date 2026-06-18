'use client';

import type { ConnectionMode } from '@/types';

interface ModeToggleProps {
  mode: ConnectionMode;
  onToggle: () => void;
}

/**
 * Minimal toggle switch between REST and WebSocket modes.
 * Positioned unobtrusively so it doesn't break the minimal aesthetic.
 */
export default function ModeToggle({ mode, onToggle }: ModeToggleProps) {
  return (
    <button
      onClick={onToggle}
      className="
        group flex items-center gap-2 px-3 py-1.5 rounded-full
        bg-black/[0.03] hover:bg-black/[0.06]
        border border-black/[0.06] hover:border-black/[0.1]
        transition-all duration-300 cursor-pointer
        focus:outline-none focus-visible:ring-1 focus-visible:ring-amber-500/30
      "
      aria-label={`Current mode: ${mode}. Click to switch.`}
    >
      {/* Toggle track */}
      <div className="relative w-8 h-4 rounded-full bg-black/[0.06] transition-colors">
        <div
          className={`
            absolute top-0.5 w-3 h-3 rounded-full transition-all duration-300
            ${
              mode === 'websocket'
                ? 'left-[18px] bg-amber-500 shadow-[0_0_6px_rgba(184,150,12,0.4)]'
                : 'left-0.5 bg-gray-300'
            }
          `}
        />
      </div>

      {/* Label */}
      <span className="text-[10px] uppercase tracking-[0.15em] text-gray-400 group-hover:text-gray-500 transition-colors select-none">
        {mode === 'rest' ? 'REST' : 'Stream'}
      </span>
    </button>
  );
}
