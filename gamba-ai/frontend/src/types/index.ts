// ─── API Response Types ───────────────────────────────────────────────────────

/** REST API response shape from POST /audio */
export interface AudioUploadResponse {
  response?: string;
  transcript?: string;
  error?: string;
  audio?: string;
}

// ─── WebSocket Message Types ──────────────────────────────────────────────────

export type WSMessageType =
  | 'transcript_partial'
  | 'transcript_final'
  | 'response_partial'
  | 'response_final'
  | 'error';

/** Inbound WebSocket frame from the server */
export interface WSInboundMessage {
  type: WSMessageType;
  text: string;
  timestamp?: string;
}

/** Outbound WebSocket control frame */
export interface WSOutboundControl {
  type: 'start' | 'stop';
  sampleRate?: number;
  mimeType?: string;
}

// ─── Application State ───────────────────────────────────────────────────────

export type ConnectionMode = 'rest' | 'websocket';

export type RecordingState =
  | 'idle'
  | 'requesting_permission'
  | 'recording'
  | 'processing'
  | 'speaking'
  | 'error';

export interface TranscriptEntry {
  id: string;
  text: string;
  type: 'user' | 'assistant' | 'status' | 'error';
  timestamp: number;
}

// ─── Configuration ───────────────────────────────────────────────────────────

export interface GambaConfig {
  apiUrl: string;
  wsUrl: string;
  mode: ConnectionMode;
}
