# Gamba Audio-First POC — HSPM Implementation Guide

> **Version:** ADEV1.5.5 POC  
> **Last Updated:** May 2026  
> **Status:** Development / Personal Validation

---

## Table of Contents

1. [System Architecture & Tech Stack](#1-system-architecture--tech-stack)
2. [Local Environment Setup](#2-local-environment-setup)
3. [Deployment to a Namecheap Domain](#3-deployment-to-a-namecheap-domain)
4. [Future Production Migration Roadmap](#4-future-production-migration-roadmap)

---

## 1. System Architecture & Tech Stack

### 1.1 High-Level Overview

Gamba is an audio-first conversational interface where **speech is the only input mechanism**. The system captures microphone audio in the browser, transmits it to a Python backend for transcription and response generation, and plays the response back to the user via browser-native speech synthesis.

```
┌─────────────────────────────────────────────────────────────────────┐
│                        USER'S BROWSER                               │
│                                                                     │
│   ┌──────────┐     ┌──────────────┐     ┌────────────────────┐     │
│   │ Mic Tap  │────▸│ MediaRecorder│────▸│  AudioInterface    │     │
│   └──────────┘     │ (Web Audio)  │     │  (React Component) │     │
│                    └──────────────┘     └────────┬───────────┘     │
│                                                  │                  │
│                              ┌───────────────────┼───────────────┐ │
│                              │   REST (POST)     │  WebSocket    │ │
│                              │   /audio          │  /ws/audio    │ │
│                              └───────┬───────────┼───────────┘   │ │
│                                      │           │               │ │
│   ┌──────────────────┐               │           │               │ │
│   │ Web Speech API   │◂──────────────┼───────────┼───────────    │ │
│   │ (speechSynthesis)│  JSON text    │           │               │ │
│   └──────────────────┘               │           │               │ │
└──────────────────────────────────────┼───────────┼───────────────┘
                                       │           │
                          ─ ─ ─ ─ ─ ─ ┼ ─ NETWORK ┼ ─ ─ ─ ─ ─ ─
                                       │           │
┌──────────────────────────────────────┼───────────┼───────────────┐
│                     BACKEND SERVER (FastAPI)      │               │
│                                      │           │               │
│   ┌──────────────────┐    ┌──────────▼───────────▼─────────┐    │
│   │  Whisper API     │◂───│      blueprawn_ai_sim          │    │
│   │  (Transcription) │    │      app.py / ws/handler.py    │    │
│   └────────┬─────────┘    └──────────┬─────────────────────┘    │
│            │                         │                           │
│            ▼                         ▼                           │
│   ┌──────────────────┐    ┌─────────────────────┐               │
│   │  Transcript Text │───▸│  GPT Response Engine │               │
│   └──────────────────┘    │  (llm/responder.py)  │               │
│                           └──────────┬──────────┘               │
│                                      │                           │
│                              JSON / WS Frames                    │
│                           { response, transcript }               │
└──────────────────────────────────────────────────────────────────┘
```

### 1.2 Frontend Stack

| Technology                             | Role                                                          |
| -------------------------------------- | ------------------------------------------------------------- |
| **Next.js 16** (App Router)            | React framework with file-based routing and server components |
| **TypeScript** (Strict Mode)           | Type-safe application code across all components              |
| **Tailwind CSS v4**                    | Utility-first styling with custom `@utility` directives       |
| **Web Audio API** (`MediaRecorder`)    | Browser-native microphone capture and audio chunk encoding    |
| **Web Speech API** (`speechSynthesis`) | Browser-native text-to-speech for reading AI responses aloud  |

**Key Frontend Components:**

- `AudioInterface.tsx` — Core orchestrator managing mic capture, dual-mode transmission, and state machine (`idle → recording → processing → speaking`)
- `MicButton.tsx` — Centered microphone button with state-driven animations and gold accent coloring
- `WaveformVisualizer.tsx` — Canvas-based radial frequency visualizer using `AnalyserNode`
- `TranscriptDisplay.tsx` — Fading transcript typography with streaming partial text
- `speechSynthesis.ts` — TTS utility with voice auto-selection and cancel-on-new-query

### 1.3 Backend Stack

| Technology                           | Role                                              |
| ------------------------------------ | ------------------------------------------------- |
| **FastAPI**                          | High-performance async Python web framework       |
| **OpenAI Whisper API** (`whisper-1`) | Speech-to-text transcription (live mode)          |
| **OpenAI GPT** (`gpt-4o-mini`)       | Conversational response generation with streaming |
| **WebSockets** (Starlette)           | Real-time bidirectional audio streaming protocol  |
| **Uvicorn**                          | ASGI server with hot-reload for development       |
| **Pydantic Settings**                | Typed configuration from environment variables    |

**Key Backend Modules:**

- `app.py` — FastAPI routes (`POST /audio`, `WS /ws/audio`, `GET /status`)
- `audio/transcriber.py` — Whisper API integration with simulation fallback
- `llm/responder.py` — GPT streaming responses with simulation fallback
- `ws/handler.py` — WebSocket session lifecycle (start → stream → stop → transcribe → respond)

### 1.4 End-to-End Data Flow

**REST Mode (Single Upload):**

```
1. User taps microphone → MediaRecorder starts
2. User taps again → MediaRecorder stops, audio Blob created
3. Frontend POSTs Blob as multipart/form-data to POST /audio
4. Backend saves file, transcribes via Whisper → transcript string
5. Backend generates response via GPT → response string
6. Backend returns JSON: {"transcript": "...", "response": "..."}
7. Frontend displays transcript + response text
8. Frontend triggers speechSynthesis.speak(response) → user hears reply
```

**WebSocket Mode (Real-Time Streaming):**

```
1. User taps microphone → WebSocket opens to /ws/audio
2. Frontend sends JSON: {"type": "start", "sampleRate": 16000, "mimeType": "audio/webm"}
3. MediaRecorder streams binary audio chunks every 250ms
4. User taps again → Frontend sends JSON: {"type": "stop"}
5. Backend merges chunks, transcribes → sends transcript_final frame
6. Backend streams GPT response token-by-token → response_partial frames
7. Backend sends response_final frame with complete text
8. Frontend triggers speechSynthesis.speak(finalResponse)
```

---

## 2. Local Environment Setup

### 2.1 Prerequisites

Ensure the following are installed on your development machine:

| Tool        | Minimum Version | Verify Command     |
| ----------- | --------------- | ------------------ |
| **Node.js** | 18.x or higher  | `node --version`   |
| **npm**     | 9.x or higher   | `npm --version`    |
| **Python**  | 3.11 or higher  | `python --version` |
| **pip**     | 23.x or higher  | `pip --version`    |
| **Git**     | 2.x             | `git --version`    |

### 2.2 Clone the Repository

```bash
git clone <your-repo-url> gamba-ai
cd gamba-ai
```

The project directory structure:

```
gamba-ai/
├── backend/
│   ├── .env                          # Backend configuration
│   ├── requirements.txt              # Python dependencies
│   ├── run.py                        # Uvicorn entry point
│   └── blueprawn_ai_sim/
│       ├── __init__.py
│       ├── app.py                    # FastAPI application
│       ├── config.py                 # Pydantic settings
│       ├── audio/
│       │   ├── __init__.py
│       │   └── transcriber.py        # Whisper STT
│       ├── llm/
│       │   ├── __init__.py
│       │   └── responder.py          # GPT response engine
│       └── ws/
│           ├── __init__.py
│           └── handler.py            # WebSocket handler
│
├── frontend/
│   ├── .env.local                    # Frontend configuration
│   ├── package.json
│   └── src/
│       ├── types/index.ts
│       ├── config/index.ts
│       ├── utils/speechSynthesis.ts
│       ├── components/
│       │   ├── AudioInterface.tsx
│       │   ├── MicButton.tsx
│       │   ├── ModeToggle.tsx
│       │   ├── WaveformVisualizer.tsx
│       │   └── TranscriptDisplay.tsx
│       └── app/
│           ├── globals.css
│           ├── layout.tsx
│           └── page.tsx
│
└── DOCUMENTATION.md                  # This file
```

---

### 2.3 Backend Setup (FastAPI)

#### Step 1: Navigate to the backend directory

```bash
cd backend
```

#### Step 2: Create and activate a Python virtual environment

**Linux / macOS:**

```bash
python3 -m venv venv
source venv/bin/activate
```

**Windows (PowerShell):**

```powershell
python -m venv venv
.\venv\Scripts\Activate.ps1
```

#### Step 3: Install Python dependencies

```bash
pip install -r requirements.txt
```

This installs:

- `fastapi` — Web framework
- `uvicorn[standard]` — ASGI server with WebSocket support
- `python-multipart` — Multipart form-data parsing for file uploads
- `pydantic-settings` — Typed environment configuration
- `openai` — OpenAI Whisper + GPT API client (used only in live mode)

#### Step 4: Configure the environment

The `.env` file controls the backend behavior:

```ini
# Simulation mode (default) — no API keys needed
USE_LIVE_AI=false
OPENAI_API_KEY=
DEBUG=true
```

To enable real AI transcription and responses:

```ini
# Live mode — requires a valid OpenAI API key
USE_LIVE_AI=true
OPENAI_API_KEY=sk-your-openai-key-here
WHISPER_MODEL=whisper-1
GPT_MODEL=gpt-4o-mini
GPT_MAX_TOKENS=150
DEBUG=true
```

> [!NOTE]
> In **simulation mode**, the backend returns deterministic canned responses without making any external API calls. This is ideal for UI development and testing without incurring API costs.

#### Step 5: Start the development server

```bash
python run.py
```

Or equivalently:

```bash
uvicorn blueprawn_ai_sim.app:app --host 0.0.0.0 --port 8000 --reload
```

Expected startup output:

```
INFO:     Uvicorn running on http://0.0.0.0:8000 (Press CTRL+C to quit)
INFO:     Started reloader process [PID] using WatchFiles
  BluePrawn AI Audio POC vADEV1.5.5 POC
  Mode: SIMULATION
  Upload dir: /path/to/backend/uploads
INFO:     Application startup complete.
```

#### Step 6: Verify the backend is running

```bash
curl http://localhost:8000/status
```

Expected response:

```json
{
  "status": "BluePrawn AI audio endpoint online",
  "version": "ADEV1.5.5 POC",
  "mode": "simulation"
}
```

Check the log file for detailed request tracing:

```bash
cat audio_endpoint.log
```

> [!TIP]
> The FastAPI interactive API docs are available at `http://localhost:8000/docs` — useful for testing the `POST /audio` endpoint with manual file uploads.

---

### 2.4 Frontend Setup (Next.js 16)

#### Step 1: Navigate to the frontend directory

```bash
cd frontend
```

#### Step 2: Install Node.js dependencies

```bash
npm install
```

#### Step 3: Verify environment variables

Confirm the `.env.local` file contains the correct backend URLs:

```ini
NEXT_PUBLIC_API_URL=http://localhost:8000
NEXT_PUBLIC_WS_URL=ws://localhost:8000
```

> [!IMPORTANT]
> These variables are embedded at **build time** for `NEXT_PUBLIC_` prefixed values. If you change them, restart the dev server.

#### Step 4: Start the development server

```bash
npm run dev
```

Expected output:

```
  ▲ Next.js 16.x.x (Turbopack)
  - Local:   http://localhost:3000
  - Environments: .env.local
  ✓ Ready
```

#### Step 5: Open in browser

Navigate to `http://localhost:3000`. You should see:

- The **"Gamba"** brand title in gradient navy text
- A centered **microphone button** in a dark, minimal interface
- A small **REST/Stream** toggle in the top-right corner

> [!WARNING]
> The browser will request **microphone permission** when you first tap the mic button. You must allow this for the application to function. If denied, an error message will appear in the transcript area.

#### Step 6: Test the full loop

1. Ensure the backend is running on port 8000
2. Tap the microphone — it turns gold with pulse animations
3. Speak (or wait a moment in simulation mode)
4. Tap again to stop recording
5. Observe the transcript and response appear
6. Hear the response spoken aloud via browser TTS

---

## 3. Deployment to a Namecheap Domain

> [!CAUTION]
> Namecheap **shared hosting** (cPanel) does **not** support long-running Python ASGI processes or WebSocket daemons. You **must** use a **Namecheap VPS** or **Dedicated Server** running Ubuntu for this deployment. The instructions below assume a VPS with root SSH access.

### 3.1 Domain DNS Configuration (Namecheap)

#### Step 1: Log in to Namecheap and navigate to your domain's DNS settings

`Dashboard → Domain List → Manage → Advanced DNS`

#### Step 2: Configure A Records

Add the following DNS records pointing to your VPS public IP address:

| Type     | Host  | Value         | TTL       |
| -------- | ----- | ------------- | --------- |
| A Record | `@`   | `YOUR_VPS_IP` | Automatic |
| A Record | `www` | `YOUR_VPS_IP` | Automatic |

**For a subdomain** (e.g., `gamba.blueprawn.ai`):

| Type     | Host    | Value         | TTL       |
| -------- | ------- | ------------- | --------- |
| A Record | `gamba` | `YOUR_VPS_IP` | Automatic |

> [!NOTE]
> DNS propagation can take up to 48 hours, but typically completes within 15-30 minutes. Verify with: `dig +short gamba.yourdomain.com`

---

### 3.2 Server Provisioning & Security

#### Step 1: SSH into your VPS

```bash
ssh root@YOUR_VPS_IP
```

#### Step 2: Update system packages

```bash
apt update && apt upgrade -y
```

#### Step 3: Install system dependencies

```bash
apt install -y python3 python3-pip python3-venv nginx git ffmpeg curl
```

> [!IMPORTANT]
> **`ffmpeg` is required** by OpenAI Whisper for audio format processing and transcoding. Without it, audio transcription will fail in live mode.

#### Step 4: Install Node.js (for the frontend)

```bash
curl -fsSL https://deb.nodesource.com/setup_20.x | bash -
apt install -y nodejs
```

Verify:

```bash
node --version   # Should be 20.x+
npm --version    # Should be 9.x+
```

#### Step 5: Configure firewall

```bash
ufw allow OpenSSH
ufw allow 'Nginx Full'
ufw enable
```

#### Step 6: Create a non-root deployment user (recommended)

```bash
adduser deploy
usermod -aG sudo deploy
su - deploy
```

---

### 3.3 Backend Deployment (Production)

#### Step 1: Clone the repository

```bash
sudo mkdir -p /var/www/blueprawn_ai_sim
sudo chown deploy:deploy /var/www/blueprawn_ai_sim
cd /var/www/blueprawn_ai_sim
git clone <your-repo-url> .
```

#### Step 2: Set up the Python environment

```bash
cd backend
python3 -m venv venv
source venv/bin/activate
pip install -r requirements.txt
```

#### Step 3: Create the production environment file

```bash
cat > .env << 'EOF'
USE_LIVE_AI=true
OPENAI_API_KEY=sk-your-production-key-here
WHISPER_MODEL=whisper-1
GPT_MODEL=gpt-4o-mini
GPT_MAX_TOKENS=150
DEBUG=false
CORS_ORIGINS=["https://gamba.yourdomain.com"]
EOF
```

> [!CAUTION]
> **Never commit your production `.env` file to Git.** Ensure `.env` is listed in `.gitignore`. The `OPENAI_API_KEY` is a sensitive credential.

#### Step 4: Test the backend manually

```bash
source venv/bin/activate
python run.py
# Verify: curl http://localhost:8000/status
# Then Ctrl+C to stop
```

#### Step 5: Create a systemd service file

```bash
sudo nano /etc/systemd/system/blueprawn.service
```

Paste the following:

```ini
[Unit]
Description=BluePrawn AI Audio POC (FastAPI)
After=network.target

[Service]
Type=simple
User=deploy
Group=deploy
WorkingDirectory=/var/www/blueprawn_ai_sim/backend
Environment="PATH=/var/www/blueprawn_ai_sim/backend/venv/bin:/usr/bin"
ExecStart=/var/www/blueprawn_ai_sim/backend/venv/bin/uvicorn \
    blueprawn_ai_sim.app:app \
    --host 127.0.0.1 \
    --port 8000 \
    --workers 2
Restart=always
RestartSec=5

[Install]
WantedBy=multi-user.target
```

#### Step 6: Enable and start the service

```bash
sudo systemctl daemon-reload
sudo systemctl enable blueprawn.service
sudo systemctl start blueprawn.service
```

#### Step 7: Verify the service

```bash
sudo systemctl status blueprawn.service
curl http://127.0.0.1:8000/status
```

View logs:

```bash
sudo journalctl -u blueprawn.service -f
```

---

### 3.4 Frontend Deployment (Production)

#### Step 1: Install PM2 globally

```bash
sudo npm install -g pm2
```

#### Step 2: Build the Next.js production bundle

```bash
cd /var/www/blueprawn_ai_sim/frontend
```

Create the production environment file:

```bash
cat > .env.local << 'EOF'
NEXT_PUBLIC_API_URL=https://gamba.yourdomain.com
NEXT_PUBLIC_WS_URL=wss://gamba.yourdomain.com
EOF
```

> [!IMPORTANT]
> In production behind SSL, use `https://` and `wss://` (secure WebSocket) protocols. The Nginx reverse proxy handles the TLS termination.

Install and build:

```bash
npm install
npm run build
```

#### Step 3: Start with PM2

```bash
pm2 start npm --name "gamba-frontend" -- start
pm2 save
pm2 startup
```

Verify:

```bash
pm2 status
curl http://127.0.0.1:3000
```

---

### 3.5 Nginx Reverse Proxy Configuration

#### Step 1: Create the Nginx server block

```bash
sudo nano /etc/nginx/sites-available/gamba
```

Paste the following configuration:

```nginx
# ──────────────────────────────────────────────────────────────────────
# Gamba Audio-First POC — Nginx Reverse Proxy
# ──────────────────────────────────────────────────────────────────────

# Upstream definitions
upstream frontend {
    server 127.0.0.1:3000;
}

upstream backend {
    server 127.0.0.1:8000;
}

# Connection upgrade map (required for WebSockets)
map $http_upgrade $connection_upgrade {
    default upgrade;
    ''      close;
}

server {
    listen 80;
    listen [::]:80;
    server_name gamba.yourdomain.com;

    # ── Security Headers ─────────────────────────────────────────────
    add_header X-Frame-Options "SAMEORIGIN" always;
    add_header X-Content-Type-Options "nosniff" always;
    add_header Referrer-Policy "strict-origin-when-cross-origin" always;

    # ── Client Body Size (for audio uploads) ─────────────────────────
    client_max_body_size 25M;

    # ── Backend API: REST Endpoints ──────────────────────────────────
    location /audio {
        proxy_pass http://backend/audio;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;

        # Audio uploads may take time
        proxy_read_timeout 120s;
        proxy_send_timeout 120s;
    }

    location /status {
        proxy_pass http://backend/status;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }

    # ── Backend API: WebSocket Endpoint ──────────────────────────────
    location /ws/ {
        proxy_pass http://backend;
        proxy_http_version 1.1;

        # Critical: WebSocket upgrade headers
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection $connection_upgrade;

        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;

        # WebSocket connections can be long-lived
        proxy_read_timeout 300s;
        proxy_send_timeout 300s;
    }

    # ── Backend API: FastAPI Docs ────────────────────────────────────
    location /docs {
        proxy_pass http://backend/docs;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
    }

    location /openapi.json {
        proxy_pass http://backend/openapi.json;
        proxy_set_header Host $host;
    }

    # ── Frontend: Next.js (catch-all) ────────────────────────────────
    location / {
        proxy_pass http://frontend;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection $connection_upgrade;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }
}
```

> [!WARNING]
> The `proxy_set_header Upgrade` and `proxy_set_header Connection` directives in the `/ws/` block are **essential** for WebSocket functionality. Without them, WebSocket connections will fail with a `400 Bad Request` or silently drop.

#### Step 2: Enable the site and test

```bash
sudo ln -s /etc/nginx/sites-available/gamba /etc/nginx/sites-enabled/
sudo nginx -t
sudo systemctl reload nginx
```

#### Step 3: Secure with Let's Encrypt SSL

```bash
sudo apt install -y certbot python3-certbot-nginx
sudo certbot --nginx -d gamba.yourdomain.com
```

Follow the interactive prompts to:

- Provide your email address for renewal notifications
- Agree to the Terms of Service
- Choose whether to redirect HTTP to HTTPS (recommended: **Yes**)

Certbot will automatically modify your Nginx config to add the SSL certificate and redirect blocks.

#### Step 4: Verify auto-renewal

```bash
sudo certbot renew --dry-run
```

#### Step 5: Final verification

```bash
# Health check
curl https://gamba.yourdomain.com/status

# Frontend
curl -s https://gamba.yourdomain.com | head -20

# WebSocket (quick test)
python3 -c "
import asyncio, websockets, json
async def test():
    async with websockets.connect('wss://gamba.yourdomain.com/ws/audio') as ws:
        await ws.send(json.dumps({'type':'start','sampleRate':16000,'mimeType':'audio/webm'}))
        await ws.send(json.dumps({'type':'stop'}))
        msg = await asyncio.wait_for(ws.recv(), timeout=5)
        print('WebSocket OK:', json.loads(msg)['type'])
asyncio.run(test())
"
```

---

## 4. Future Production Migration Roadmap

### 4.1 Whisper: Local Model → Managed API

| Aspect       | Current (POC)                                  | Production Target                                              |
| ------------ | ---------------------------------------------- | -------------------------------------------------------------- |
| **Provider** | OpenAI Whisper API (`whisper-1`) or simulation | OpenAI Whisper API or self-hosted Whisper on GPU cluster       |
| **Scaling**  | Single-process, sequential                     | Auto-scaling worker pool behind a queue (e.g., Celery + Redis) |
| **Latency**  | ~1-3s per utterance                            | <500ms via chunked streaming transcription                     |
| **Cost**     | Pay-per-request ($0.006/min)                   | Reserved instances or batch pricing                            |

**Migration steps:**

1. Evaluate real-time streaming alternatives (e.g., Deepgram, AssemblyAI) for sub-second latency
2. Implement a transcription worker queue to decouple API response time from Whisper processing
3. Add fallback chains: primary API → secondary API → local model

### 4.2 File Storage: Local Disk → Cloud Buckets

| Aspect        | Current (POC)                       | Production Target                    |
| ------------- | ----------------------------------- | ------------------------------------ |
| **Storage**   | `uploads/` directory on server disk | AWS S3 / GCS with lifecycle policies |
| **Retention** | Unlimited (manual cleanup)          | Auto-expire after 24-48 hours        |
| **Access**    | Direct filesystem                   | Pre-signed URLs with expiration      |

**Migration steps:**

1. Replace `filepath.write_bytes()` calls with S3 `put_object` via `boto3`
2. Configure S3 lifecycle rules to auto-delete audio files after 48 hours
3. Ensure audio files are encrypted at rest (SSE-S3 or SSE-KMS)
4. Add a cleanup task for orphaned uploads

> [!WARNING]
> Audio recordings contain sensitive user data. Any production storage solution **must** comply with your data retention policy and applicable privacy regulations (GDPR, CCPA, etc.).

### 4.3 Phased Feature Roadmap

#### Phase 3 — Memory Architecture

- Implement conversation context persistence using a lightweight store (Redis or SQLite)
- Maintain a sliding window of recent exchanges (last 5-10 turns) for contextual GPT responses
- Add session ID management for multi-turn conversations within a single page visit

#### Phase 4 — Identity & Authentication

- Integrate a lightweight auth provider (e.g., Clerk, Auth0, or NextAuth.js)
- Gate API access behind JWT tokens validated in FastAPI middleware
- Implement rate limiting per authenticated user (e.g., 60 requests/minute)
- Add usage tracking and billing hooks for metered access

#### Phase 5 — Multi-Language Support

- Extend Whisper transcription with explicit `language` parameter detection
- Configure GPT system prompt to respond in the detected language
- Add language-aware voice selection in the browser's `speechSynthesis` engine
- Support RTL (right-to-left) text rendering in the transcript display

#### Phase 6 — Production Hardening

- Replace `allow_origins=["*"]` CORS with explicit domain whitelist
- Add structured logging with correlation IDs (request tracing)
- Implement health check monitoring (e.g., UptimeRobot, Datadog)
- Set up CI/CD pipeline for automated testing and deployment
- Add error reporting (e.g., Sentry) for both frontend and backend
- Implement WebSocket connection pooling and heartbeat pings

---

> **Document maintained by the BluePrawn engineering team.**  
> For questions or updates, refer to the project repository's issue tracker.
>
> **Credits**
> Simon Muia (Techlead - BluePrawn Engineering Team)
