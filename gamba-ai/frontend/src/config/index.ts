import type { GambaConfig, ConnectionMode } from '@/types';

/** Centralized configuration constants */
export const config: GambaConfig = {
  apiUrl: process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:8000',
  wsUrl: process.env.NEXT_PUBLIC_WS_URL ?? 'ws://localhost:8000',
  mode: (process.env.NEXT_PUBLIC_CONNECTION_MODE as ConnectionMode) ?? 'websocket',
};

/** REST endpoint for audio upload */
export const AUDIO_UPLOAD_ENDPOINT = `${config.apiUrl.replace(/\/$/, '')}/audio`;

/** WebSocket endpoint for audio streaming */
export const WS_AUDIO_ENDPOINT = `${config.wsUrl.replace(/\/$/, '')}/ws/audio`;

/** MediaRecorder MIME type preference order */
export const PREFERRED_MIME_TYPES = [
  'audio/webm;codecs=opus',
  'audio/webm',
  'audio/ogg;codecs=opus',
  'audio/mp4',
] as const;

/** Get the best supported MIME type for recording */
export function getSupportedMimeType(): string {
  if (typeof MediaRecorder === 'undefined') return 'audio/webm';
  for (const mime of PREFERRED_MIME_TYPES) {
    if (MediaRecorder.isTypeSupported(mime)) return mime;
  }
  return 'audio/webm';
}
