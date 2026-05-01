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

### Phase 2 — Block C (Feb 2026)
- **Avatar 3D realista** (`/avatar`) — anatomical humanoid built in Three.js with: head (with hair, eyes that blink, brows, lips, nose, cheeks, ears), neck, torso, articulated **shoulders (3-axis), elbows, wrists, and 5 fingers per hand with 3 phalanges each**
- Studio lighting (key + fill + rim + hemi), soft contact shadow, gradient background, ACES tone mapping
- 17 stylized poses (Hola, Adiós, Sí, No, Por favor, Gracias, Te quiero/ILY, Yo, Tú, Comer, Beber, Casa, Pensar, Bien, Mal, Ayuda, idle) with smooth slerp interpolation
- Idle life: breathing motion on chest, random blinks every 2-7s, subtle body sway
- Speed slider (0.4×-2.0×), camera orbit (mouse drag + pinch zoom + reset), quick-pose chips, current-word badge
- Pose system: `lib/avatarRig.js` (bone hierarchy) + `lib/avatarPoses.js` (PoseAnimator + word→pose mapping)

### Phase 2 — Block D (Feb 2026) — Header reorg + Admin Enseñanzas + KB
- **Header rework**: 8 primary nav items (Inicio · Traductor · Práctica · En vivo · PRO · Avatar 3D · Llamada · Conversa), "Más" dropdown (Quiz · Alfabeto · Comunidad · Diccionario · Historial), Admin-only entry (Enseñanzas) gated by `useAdminAuth()`
- "Texto" → "Traductor", `/analytics` → kept, new `/ensenanzas` is the admin home; `/traductor` alias redirects to `/texto-a-signos`
- Mobile: hamburger primary menu + 5-tab bottom navigation, dark-mode-aware
- Shared `AdminAuthContext` (localStorage-backed) — login from /admin OR /ensenanzas unlocks the admin pill in the nav and the Enseñanzas link
- **`/ensenanzas` admin panel** with 4 tabs:
  1. **Subir manuales** — file upload (PDF/DOCX/IMG/MP4/MOV/WebM, max 200MB) with auto-process
  2. **Base de conocimiento** — searchable cards (by word, by language) with delete
  3. **Correcciones manuales** — upsert form (word/language/hands/mouth/expression/body/status/notes), max-priority hints
  4. **Entrenar IA** — dashboard + "Re-procesar pendientes" + by-language breakdown
- **Backend pipeline** (`teaching_service.py`):
  - PDF text via `pypdf`, DOCX via `python-docx`, video frames via `cv2` (8 frames sampled), images via `cv2` resize+JPEG
  - Mining via GPT-4o-mini (text) + GPT-4o (vision) using `emergentintegrations` + Emergent LLM key
  - Strict JSON output schema (word/language/hands/mouth/expression/body/examples/confidence)
  - Async background task with `asyncio.create_task`; status: uploaded → processing → processed | error
- **KB-augmented text-to-sign**: every `/api/translate/text-to-sign` call now does a lightweight regex-prefix lookup over `corrections` (priority MAX) + `knowledge_base` and injects up to 8 hints into the LLM prompt; response now includes `confidence` (alta/media/baja), `kb_used` count, and `low_confidence_warning` text
- Frontend shows: green KB badge, color-coded confidence pill, amber low-confidence warning card
- **17 new admin endpoints** under `/api/admin/teaching/*` + public `/api/kb/lookup`

### Phase 2 — Block E (Feb 2026) — Realistic GLB avatar + Enseñanzas v2
- **Realistic Avatar GLB**: Mixamo Xbot model (`/models/avatar.glb`, 2.8 MB) loaded via `GLTFLoader` with full body skeleton. New file `lib/avatarRealistic.js` with bone-mapping for: shoulder/arm/forearm/hand/wrist + 5 fingers × 3 phalanges per hand + head/spine.
- 17 sign poses adapted to Mixamo bones (absolute local rotations); idle has natural arm-down rest pose; pose interpolation with smoothstep easing
- New **mode selector** on `/avatar` page: "Realista (GLB)" vs "Estilizado". Toggle disposes/recreates avatars cleanly. Default = Realista; auto-fallback to Estilizado if GLB load fails.
- Enseñanzas v2:
  - **PUT /api/admin/teaching/files/{id}** — replace binary; auto-purges KB entries (canonical: stale extractions removed on replace)
  - **PATCH /api/admin/teaching/files/{id}** — update label only
  - **GET /api/admin/teaching/knowledge?confidence=baja|media|alta** — filter by confidence
  - "Mostrar solo signos dudosos" quick toggle in KB tab
  - Per-row **replace** button next to reprocess/delete
- **Global LanguageVariantContext** (`lib/LanguageVariantContext.jsx`): localStorage-backed (`signlang.variant.v1`), default `LSE`, exposed app-wide. Variants: LSE (priority) · ASL · BSL · LSM · LIBRAS · auto.
- `/texto-a-signos` now defaults to the global variant; changing it elsewhere syncs back.
- Variant manager card at top of `/ensenanzas` so admins can change the active variant for the whole app from one place.

### Phase 2 — Block F (Feb 2026) — Real human avatar
- **Switched GLB asset** from Mixamo `Xbot.glb` (robot/mannequin) → **`Michelle.glb`** (real human female with skin, clothes, hair, glasses, headphones, headphones — 3.2 MB)
- Same Mixamo skeleton naming → **all 17 poses + bone-mapping work without code changes**
- Visual upgrade: from grey faceless robot → fully-textured young woman, fitting "figura de avatar humana" request

### Phase 2 — Block G (Feb 2026) — Vídeos de referencia + Avatar enlazado
- **Tab "Vídeos" en /ensenanzas** separado de "Subir manuales": galería con preview reproducible (`<video>` con blob URL autenticado), badges de signos extraídos, botones reprocesar/borrar
- **Backend endpoints nuevos** (admin-auth):
  - `GET /api/admin/teaching/videos` — lista solo los archivos `type=video` con sus signos KB enlazados
  - `GET /api/teaching/video-for-word?word=&language=` — encuentra el primer vídeo cuyo KB matchee la palabra dada
  - `GET /api/admin/teaching/file-stream/{id}` — sirve el binario con `FileResponse` (mime correcto por tipo)
- **Avatar 3D enlazado** (admin-only): cuando el avatar reproduce una palabra, si hay un vídeo subido que contiene esa seña, aparece automáticamente un mini-player en la esquina inferior izquierda del canvas — comparas el avatar con el humano real signando esa palabra
- Cumple los 7 requisitos del documento "Enseñanzas":
  1. ✅ Sección privada con auth admin
  2. ✅ Subir PDF/Word/Imágenes/Vídeos
  3. ✅ Tab dedicado a vídeos de referencia
  4. ✅ Base de conocimiento con extracción IA (vocab/manos/boca/expresión/cuerpo/ejemplos/variantes)
  5. ✅ Correcciones manuales con prioridad MAX
  6. ✅ Entrenar IA dashboard
  7. ✅ Vídeos como referencia visual del avatar

### Phase 2 — Block H (Feb 2026) — Configuración IA editable + footer link
- Movido enlace de "Enseñanzas" del menú "Más" al **footer** (más limpio, menos distracción para usuarios públicos)
- Nuevo tab **"Configuración IA"** en `/ensenanzas` (data-testid `tab-ai-config`)
- Endpoints nuevos (admin-auth):
  - `GET /api/admin/teaching/ai-config` — lee config + lista de modelos disponibles + prompt por defecto
  - `PUT /api/admin/teaching/ai-config` — guarda text_model, vision_model, system_prompt, max_text_chunks, max_image_batch, video_frames_count, min_confidence_keep, auto_process
  - `POST /api/admin/teaching/ai-config/reset` — restaura valores por defecto
  - `POST /api/admin/teaching/ai-config/test` — corre extracción de prueba con la config actual y devuelve nº de signos extraídos
- UI: modelos (gpt-4o, gpt-4o-mini, claude-sonnet-4-5, gemini-2.5-pro/flash), system prompt editable, sliders para chunks/batch/frames/min_confidence, switch auto-procesar, banner con dirty-state, botones Guardar / Probar / Restaurar default
- `teaching_service` ahora carga `ai_config` desde DB y respeta sus parámetros en cada extracción

### Phase 2 — Block I (May 2026) — Avatar fix + admin password rotation + clave OpenAI personal

#### Bug fix: avatar 3D animaba en T-pose
- **Causa raíz**: `avatarRealistic.js` tenía valores `arm.z = ±1.45` calibrados para Xbot.glb, pero el GLB activo es Michelle.glb cuyos ejes locales en LeftArm/RightArm difieren. Las rotaciones se aplicaban pero no traían los brazos abajo.
- **Fix**: refactor de `resolveSetters` para usar la **rest pose capturada del GLB** como fallback cuando una pose no especifica un eje. `ARM_REST()` ahora retorna `{}`. Idle = bind pose natural; cualquier pose modifica solo lo que necesita y los demás bones vuelven a rest.
- Verificado: Hola levanta brazo derecho, Por favor ambos brazos arriba, Bien thumbs-up, transiciones limpias.

#### Botón "Cambiar contraseña" en panel /ensenanzas
- Header del panel ahora incluye `teach-change-pwd-btn` que abre un modal con 3 inputs (current/new/confirm).
- Backend `POST /api/admin/change-password` valida current contra `_CURRENT_ADMIN_PASSWORD` (módulo-level mutable), guarda la nueva en `db.config['admin_password']` y actualiza la variable.
- Al arrancar el backend (`_load_admin_runtime_overrides`) carga el override desde DB. El env `ADMIN_PASSWORD` queda como bootstrap inicial.
- `replacePassword` añadido a `AdminAuthContext` para sincronizar localStorage tras un cambio exitoso.

#### Tab "API IA" para clave OpenAI personal
- Séptimo tab `tab-api-key` en /ensenanzas con UI completa:
  - Input cifrado (`type=password`) con toggle visibility, botón Guardar
  - Estado lateral: badge "Tu clave personal …XXXX" o "Clave Emergent (universal)"
  - Botones Verificar (test endpoint) y Eliminar
- Backend nuevos endpoints:
  - `GET /api/admin/teaching/api-key` → `{has_custom_key, masked_key:'…XXXX', active_source}`
  - `PUT /api/admin/teaching/api-key` body `{api_key:'sk-…'}` → cifra con Fernet (clave derivada de MONGO_URL+DB_NAME por SHA-256), guarda en `db.config['openai_api_key']`
  - `DELETE /api/admin/teaching/api-key` → vuelve a clave universal
  - `POST /api/admin/teaching/api-key/test` → ping al LLM con la clave activa
- `_llm_chat()` modificado: usa `_CUSTOM_OPENAI_API_KEY` cuando existe, si no `LLM_API_KEY` (Emergent universal o env OPENAI_API_KEY).
- La clave personal afecta toda la app (extracción de docs, texto-a-signos, traducción de vídeo, etc.).

## Backlog (P1)
- TURN server config (currently STUN-only — production guidance in DEPLOY.md)
- Multi-replica WebRTC signaling (Redis Pub/Sub)
- Admin panel for moderating community-submitted signs
- Audio TTS readout of translated text
- Confidence threshold UI to suppress low-confidence outputs

## Backlog (P2)
- Custom user dictionary (requires auth)
- Group rooms (3+ peers)
- Native mobile app (Capacitor wrap)
- Per-user analytics & API usage dashboard
