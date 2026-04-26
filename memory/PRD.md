# SignLanguage Pro — PRD

## Original problem statement
"quiero crear un app para traducir el lenguaje de signos, como ya sabes el lenguaje de textos no es solo mover la mano o poner posicion, sino tambien se usan los gestos con la boca, es decir los labios, las expresiones, y todo tipo de movimientos y manos"

## User choices (gathered)
- Bidirectional translation: signs↔text + LIVE/online mode
- Multiple sign languages with auto-detection (LSE / LSM / ASL / others)
- Real-time conversation mode + dictionary + history
- No authentication (public app)
- Professional design (Swiss IKB #002FA7)
- Production-ready, will deploy on user's own VPS
- WebRTC scope: 1-to-1 with shared room codes
- Resend: implement integration, leave key empty (graceful no-op)

## Architecture
- Backend: FastAPI (`/api/*`), MongoDB (motor), OpenAI GPT-4o (vision) + GPT-4o-mini (text) via `emergentintegrations`
- Frontend: React + Tailwind + Shadcn UI
- Webcam capture via MediaRecorder; client-side MediaPipe (Hands+Face+Pose) for zero-latency overlay
- Stripe (test) for billing; Resend (graceful no-op until key set) for emails
- Three.js for 3D Avatar placeholder
- WebRTC peer connection over FastAPI WebSocket signaling (Google STUN)
- PWA service worker with stale-while-revalidate caching for offline dictionary

## Implemented (Feb 2026)

### Phase 0 — MVP
- Home, Live Translation (record + auto live mode), Text→Signs, Conversation, Dictionary, History
- Backend: /api/translate/video, /api/translate/text-to-sign, /api/dictionary, /api/history

### Phase 1 — Pro
- MediaPipe local skeleton overlay (Hands + Face + Pose, no waist-down)
- CSS zoom/pan camera (wheel, pinch, drag, double-click reset)
- Mobile vertical orientation + flip camera + quality indicator
- Practice Mode, Quiz, Community Sign submission
- Voice-to-Sign (Web Speech API)
- Accessibility menu (font size, contrast, reduce motion)
- PWA installable (manifest + sw.js)
- Analytics dashboard
- PDF export (jsPDF) of conversations & history

### Phase 2 — Block A
- Stripe Checkout (Pro mensual / anual / Team) with webhook + status polling
- Admin panel (password-protected) — generate / list / revoke API keys
- Public API (X-API-Key) for /v1/translate/text-to-sign and /v1/dictionary
- Embeddable widget.js
- Avatar 3D base scene (Three.js)
- Dockerfile.frontend / Dockerfile.backend / docker-compose.yml / Caddyfile / Nginx
- DEPLOY.md with full VPS setup instructions

### Phase 2 — Block B (Feb 2026)
- **WebRTC video calls** (`/llamada`) — code-based 1-to-1 rooms, shareable link, perfect-negotiation, live AI subtitle pipeline (signer's frames sampled + translated + sent to peer over the signaling channel), local PiP, mute/cam toggles, in-call text chat
- **WebSocket signaling** at `/api/rtc/{room}` (FastAPI native WS), in-memory room registry, ICE servers endpoint with Google STUN
- **Offline mode** — `useOfflineDictionary` hook + localStorage cache + service-worker stale-while-revalidate for `/api/offline/pack` and `/api/dictionary` + `OfflineIndicator` floating banner + `ConnectivityPill` on Dictionary
- **Offline pack** endpoint (`/api/offline/pack`) — top-N signs scored by usage analytics
- **Resend email** integration (`/app/backend/email_service.py`) — graceful no-op when RESEND_API_KEY empty; templates for share/welcome/billing-receipt; `ShareEmailDialog` component on History page; `/api/email/share`, `/api/email/welcome`, `/api/email/status`
- Stripe webhook now auto-sends a billing receipt email when payment status flips to "paid" (idempotent via `receipt_sent` flag)

## Endpoints (canonical list)
- Public: /api/health, /api/translate/{video,frames,fingerspelling,text-to-sign}, /api/history (G/D), /api/translation/{id}, /api/dictionary[ /languages /community /sign-of-the-day /submit ], /api/practice/validate, /api/analytics/{event,summary}
- Billing: /api/billing/{plans,checkout,status/{sid}}, /api/webhook/stripe
- Admin (X-Admin-Password): /api/admin/{login, api-keys (G/P/D)}
- Public API (X-API-Key): /api/v1/translate/text-to-sign, /api/v1/dictionary
- Block B: /api/email/{status,share,welcome}, /api/rtc/{room,ice,stats}, /api/rtc/{room_id} (WebSocket), /api/offline/pack

## Test status
- Iter 1-6: backend 100% (all Phase 0/1/2A green)
- Iter 7: Phase 2 Block B — backend 15/15 ✅, frontend 95% (only 2 minor polish items, fixed)
- Test file: /app/backend/tests/test_iter7_phase2_block_b.py

## Backlog (P1)
- Real Avatar 3D animations (text → bone/hand keyframes via Three.js skeleton)
- Admin panel for moderating community-submitted signs
- TURN server config (currently STUN-only — production guidance in DEPLOY.md)
- Multi-replica WebRTC signaling (Redis Pub/Sub)
- Audio TTS readout of translated text
- Confidence threshold UI to suppress low-confidence outputs

## Backlog (P2)
- Custom user dictionary (requires auth)
- Group rooms (3+ peers)
- Native mobile app (Capacitor wrap)
- Per-user analytics & API usage dashboard
