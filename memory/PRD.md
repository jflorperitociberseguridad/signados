# SignLanguage Pro — PRD

## Original problem statement
"quiero crear un app para traducir el lenguaje de signos, como ya sabes el lenguaje de textos no es solo mover la mano o poner posicion, sino tambien se usan los gestos con la boca, es decir los labios, las expresiones, y todo tipo de movimientos y manos"

## User choices (gathered)
- Bidirectional translation: signs↔text + LIVE/online mode
- Multiple sign languages with auto-detection (LSE / LSM / ASL / others)
- Real-time conversation mode + dictionary + history
- No authentication (public app)
- Professional design

## Architecture
- Backend: FastAPI (`/api/*`), MongoDB (motor), Gemini 3 Pro via `emergentintegrations` (model `gemini-3-pro-preview`)
- Frontend: React + Tailwind + Shadcn UI, "Swiss High-Contrast" professional palette (#002FA7 IKB)
- Webcam capture via MediaRecorder, webm clips uploaded as multipart to `/api/translate/video`

## Implemented (Feb 2026)
- Home (Hero + features grid + how-it-works)
- Live Translation: webcam record + auto live mode (5s loop), transcript panel, language detection badge
- Text → Signs: step-by-step guide with hands/mouth/expression/body breakdown, lang selector
- Conversation Mode: dual panel (signer cam ↔ speaker text) with chat-style feed
- Dictionary: 15 seed entries (LSE/LSM/ASL) with search and language filter
- History: table of past translations, delete single / clear all
- Backend endpoints: `/api/`, `/api/translate/video`, `/api/translate/text-to-sign`, `/api/dictionary`, `/api/dictionary/languages`, `/api/history` (GET / DELETE one / clear all)
- All 13 backend tests passing (100%)

## Backlog (P1)
- Expand dictionary with reference video clips per sign
- Audio TTS readout of translated text
- Save/share individual translations (link)
- Optional sign-language pose model (MediaPipe Holistic) client-side for faster real-time hints
- Confidence threshold UI to suppress low-confidence outputs
- Mobile camera-flip button (front/back)

## P2
- Multi-user rooms for remote conversation
- Export history as CSV/PDF
- Custom dictionary per user (after auth)
