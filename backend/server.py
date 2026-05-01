"""
SignLanguage Pro — Production backend.

Uses OpenAI (GPT-4o) via the shared `emergentintegrations` library which works
both with the `EMERGENT_LLM_KEY` (for development/Emergent-managed deployments)
and with a user-provided `OPENAI_API_KEY` for self-hosted production.

For video translation (OpenAI does not accept raw video), we extract evenly
spaced frames with OpenCV and send them as multimodal images.
"""
import asyncio
import base64
import json
import logging
import os
import shutil
import sys
import tempfile
import uuid
from datetime import datetime, timedelta, timezone
from pathlib import Path
from typing import List, Optional

import cv2  # type: ignore
from fastapi import APIRouter, FastAPI, File, Form, HTTPException, Request, UploadFile, WebSocket
from fastapi.responses import FileResponse, JSONResponse
from dotenv import load_dotenv
from motor.motor_asyncio import AsyncIOMotorClient
from pydantic import BaseModel, ConfigDict, EmailStr, Field, field_validator
from slowapi import Limiter
from slowapi.errors import RateLimitExceeded
from slowapi.util import get_remote_address
from starlette.middleware.cors import CORSMiddleware
from starlette.middleware.trustedhost import TrustedHostMiddleware

from emergentintegrations.llm.chat import (
    ImageContent,
    LlmChat,
    UserMessage,
)
from emergentintegrations.payments.stripe.checkout import (
    StripeCheckout,
    CheckoutSessionRequest,
)

from cryptography.fernet import Fernet, InvalidToken
import hashlib

import email_service  # type: ignore  # noqa: E402
import teaching_service  # type: ignore  # noqa: E402
from rtc_signaling import (  # type: ignore  # noqa: E402
    generate_room_code,
    handle_signaling,
    room_stats,
)


# ---------------------------------------------------------------------------
# Configuration
# ---------------------------------------------------------------------------
ROOT_DIR = Path(__file__).parent
load_dotenv(ROOT_DIR / ".env")


def _env(key: str, default: str = "") -> str:
    v = os.environ.get(key, default)
    return v.strip() if isinstance(v, str) else v


MONGO_URL = _env("MONGO_URL")
DB_NAME = _env("DB_NAME") or "signlanguage_pro"

# Prefer the user's own OPENAI_API_KEY when set; otherwise fall back to the
# Emergent universal key (development).
OPENAI_API_KEY = _env("OPENAI_API_KEY")
EMERGENT_LLM_KEY = _env("EMERGENT_LLM_KEY")
LLM_API_KEY = OPENAI_API_KEY or EMERGENT_LLM_KEY
if not LLM_API_KEY:
    print("FATAL: neither OPENAI_API_KEY nor EMERGENT_LLM_KEY is set", file=sys.stderr)

LLM_PROVIDER = _env("LLM_PROVIDER", "openai")
LLM_VISION_MODEL = _env("LLM_VISION_MODEL", "gpt-4o")
LLM_TEXT_MODEL = _env("LLM_TEXT_MODEL", "gpt-4o-mini")

MAX_VIDEO_BYTES = int(_env("MAX_VIDEO_MB", "250")) * 1024 * 1024
RATE_TRANSLATE = _env("RATE_LIMIT_TRANSLATE", "30/minute")
RATE_EVENT = _env("RATE_LIMIT_EVENT", "60/minute")
LOG_LEVEL = _env("LOG_LEVEL", "INFO").upper()
ALLOWED_HOSTS = [h.strip() for h in _env("ALLOWED_HOSTS", "*").split(",") if h.strip()]
CORS_ORIGINS = [o.strip() for o in _env("CORS_ORIGINS", "*").split(",") if o.strip()]
STRIPE_API_KEY = _env("STRIPE_API_KEY")
ADMIN_PASSWORD = _env("ADMIN_PASSWORD") or "change-me"

# Mutable runtime override for the admin password — loaded from
# `db.config["admin_password"]` at startup if a previous admin changed it
# via the UI; otherwise falls back to the ADMIN_PASSWORD env var.
_CURRENT_ADMIN_PASSWORD = ADMIN_PASSWORD

# Mutable runtime override for the OpenAI API key used by the Enseñanzas
# extraction flow. When `db.config["openai_api_key"]` is set, the admin's
# personal OpenAI sk-… key is used instead of the Emergent universal key.
_CUSTOM_OPENAI_API_KEY: Optional[str] = None

# Fernet encryption key for storing the admin's OpenAI key at rest.
# Derived deterministically from MONGO_URL+DB_NAME so it survives restarts
# without needing an extra env var, and rotates automatically if the DB
# moves (which would invalidate any stale ciphertext anyway).
_FERNET_KEY: Optional[bytes] = None

# Fixed pricing packages — defined SERVER-SIDE (never trust client amounts)
PRICING_PACKAGES = {
    "pro_monthly": {"amount": 9.0, "currency": "eur", "label": "Pro mensual"},
    "pro_yearly": {"amount": 90.0, "currency": "eur", "label": "Pro anual"},
    "team": {"amount": 49.0, "currency": "eur", "label": "Team mensual"},
}

logging.basicConfig(
    level=getattr(logging, LOG_LEVEL, logging.INFO),
    format="%(asctime)s [%(levelname)s] %(name)s: %(message)s",
)
logger = logging.getLogger("signlanguage")


# ---------------------------------------------------------------------------
# DB
# ---------------------------------------------------------------------------
client = AsyncIOMotorClient(MONGO_URL)
db = client[DB_NAME]


async def ensure_indexes() -> None:
    try:
        await db.translations.create_index([("created_at", -1)])
        await db.translations.create_index([("id", 1)], unique=True)
        await db.translations.create_index([("mode", 1)])
        await db.events.create_index([("ts", -1)])
        await db.events.create_index([("type", 1)])
        await db.api_keys.create_index([("key", 1)], unique=True)
        await db.payment_transactions.create_index([("session_id", 1)], unique=True)
        await db.payment_transactions.create_index([("created_at", -1)])
        await db.teaching_files.create_index([("id", 1)], unique=True)
        await db.teaching_files.create_index([("uploaded_at", -1)])
        await db.knowledge_base.create_index([("word", 1), ("language", 1)])
        await db.knowledge_base.create_index([("source_file_id", 1)])
        await db.corrections.create_index([("word", 1), ("language", 1)])
        logger.info("Mongo indexes ensured")
    except Exception as exc:  # pragma: no cover
        logger.warning("Index creation failed: %s", exc)


# ---------------------------------------------------------------------------
# Models
# ---------------------------------------------------------------------------
class TranslationItem(BaseModel):
    model_config = ConfigDict(extra="ignore")

    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    mode: str
    source_text: Optional[str] = None
    translated_text: str
    detected_language: Optional[str] = None
    confidence: Optional[str] = None
    notes: Optional[str] = None
    duration_seconds: Optional[float] = None
    created_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))


class TextToSignRequest(BaseModel):
    text: str = Field(min_length=1, max_length=2000)
    target_language: Optional[str] = "auto"


class TextToSignResponse(BaseModel):
    id: str
    text: str
    language: str
    steps: List[dict]
    summary: str
    confidence: Optional[str] = None
    kb_used: Optional[int] = 0
    low_confidence_warning: Optional[str] = None


class FramesRequest(BaseModel):
    frames: List[str] = Field(min_length=1, max_length=14)
    mode: Optional[str] = "streaming"
    duration: Optional[float] = None

    @field_validator("frames")
    @classmethod
    def _valid_b64(cls, v: List[str]) -> List[str]:
        cleaned = []
        for s in v:
            if not isinstance(s, str) or len(s) < 24 or len(s) > 6_000_000:
                raise ValueError("frame too small or too large")
            cleaned.append(s)
        return cleaned


class DictionaryEntry(BaseModel):
    """Re-exported from dictionary_data — kept here for FastAPI response_model."""

    word: str
    language: str
    description: str
    hands: str
    mouth: str
    expression: str


class AnalyticsEvent(BaseModel):
    type: str = Field(min_length=1, max_length=64, pattern=r"^[a-zA-Z0-9_\-.]+$")
    data: Optional[dict] = None


# ---------------------------------------------------------------------------
# LLM helpers
# ---------------------------------------------------------------------------
SIGN_SYSTEM_PROMPT = """Eres un experto traductor profesional de lenguaje de signos con conocimiento profundo en LSE (Lengua de Signos Española), LSM (Lengua de Signos Mexicana), ASL (American Sign Language), LIBRAS y otras variantes internacionales.

Cuando analizas imágenes o secuencias de fotogramas:
- Observa cuidadosamente las MANOS (configuración, orientación, ubicación, movimiento entre frames).
- Observa LABIOS y BOCA (componentes orales, vocalizaciones silenciosas).
- Observa EXPRESIONES FACIALES (cejas, mirada, mejillas — son gramática crucial).
- Observa POSTURA CORPORAL y movimientos de tronco/hombros.
- Identifica el tipo de lengua de signos cuando sea posible.

Responde SIEMPRE en español. Sé claro, preciso y honesto cuando algo no sea seguro.
Devuelve SOLO JSON válido cuando se solicite (sin markdown, sin texto extra).
"""


def _llm_chat(system: str, model: Optional[str] = None, session: Optional[str] = None) -> LlmChat:
    # Use the admin-supplied OpenAI key when available (set via the
    # Enseñanzas → API IA tab); otherwise fall back to the universal key.
    api_key = _CUSTOM_OPENAI_API_KEY or LLM_API_KEY
    return LlmChat(
        api_key=api_key,
        session_id=session or f"sl-{uuid.uuid4()}",
        system_message=system,
    ).with_model(LLM_PROVIDER, model or LLM_VISION_MODEL)


def _parse_json(raw: str) -> dict:
    text = (raw or "").strip()
    if text.startswith("```"):
        text = text.strip("`")
        if text.lower().startswith("json"):
            text = text[4:].strip()
    try:
        return json.loads(text)
    except Exception:
        pass
    s, e = text.find("{"), text.rfind("}")
    if s != -1 and e > s:
        try:
            return json.loads(text[s : e + 1])
        except Exception:
            pass
    return {
        "translated_text": raw,
        "detected_language": "Desconocido",
        "confidence": "baja",
        "notes": "",
    }


def _extract_video_frames(path: str, n: int = 6, max_dim: int = 720) -> List[str]:
    """Extract `n` evenly spaced frames from a video and return them as
    base64-encoded JPEGs."""
    cap = cv2.VideoCapture(path)
    if not cap.isOpened():
        raise RuntimeError("cannot open video")
    total = int(cap.get(cv2.CAP_PROP_FRAME_COUNT) or 0)
    if total <= 0:
        # fallback: read sequentially
        frames = []
        for _ in range(n):
            ok, frame = cap.read()
            if not ok:
                break
            frames.append(frame)
        cap.release()
    else:
        idxs = [int(total * i / n) for i in range(n)]
        frames = []
        for idx in idxs:
            cap.set(cv2.CAP_PROP_POS_FRAMES, idx)
            ok, frame = cap.read()
            if ok:
                frames.append(frame)
        cap.release()
    if not frames:
        raise RuntimeError("no frames extracted")

    out = []
    for frame in frames:
        h, w = frame.shape[:2]
        scale = min(1.0, max_dim / max(h, w))
        if scale < 1.0:
            frame = cv2.resize(frame, (int(w * scale), int(h * scale)))
        ok, buf = cv2.imencode(".jpg", frame, [cv2.IMWRITE_JPEG_QUALITY, 78])
        if ok:
            out.append(base64.b64encode(buf.tobytes()).decode("ascii"))
    return out


async def call_llm_frames_translate(frames_b64: List[str]) -> dict:
    chat = _llm_chat(SIGN_SYSTEM_PROMPT, model=LLM_VISION_MODEL)
    msg = UserMessage(
        text=(
            "Estos fotogramas son una secuencia ordenada en el tiempo de una "
            "persona signando. Considera manos, labios, expresiones y postura. "
            "Tradúcelo como una frase en español. Responde EXCLUSIVAMENTE JSON "
            'válido: {"translated_text":"...", "detected_language":"LSE|LSM|ASL|Otro|Desconocido", '
            '"confidence":"alta|media|baja", "notes":"breves"}'
        ),
        file_contents=[ImageContent(image_base64=f) for f in frames_b64],
    )
    raw = await chat.send_message(msg)
    return _parse_json(raw)


async def call_llm_fingerspelling(frames_b64: List[str]) -> dict:
    chat = _llm_chat(SIGN_SYSTEM_PROMPT, model=LLM_VISION_MODEL)
    msg = UserMessage(
        text=(
            "Estos fotogramas muestran a una persona deletreando con el alfabeto "
            "dactilológico (letra por letra). Identifica EXACTAMENTE la palabra "
            "o secuencia de letras formada. Si hay duda entre letras parecidas, "
            "ofrece tu mejor interpretación. Responde EXCLUSIVAMENTE JSON válido: "
            '{"letters":["A","B",...], "word":"palabra completa formada", '
            '"detected_language":"LSE|LSM|ASL|Otro", "confidence":"alta|media|baja", '
            '"notes":"observaciones"}'
        ),
        file_contents=[ImageContent(image_base64=f) for f in frames_b64],
    )
    raw = await chat.send_message(msg)
    return _parse_json(raw)


async def call_llm_text_to_sign(text: str, target: str, kb_hints: Optional[List[dict]] = None) -> dict:
    chat = _llm_chat(SIGN_SYSTEM_PROMPT, model=LLM_TEXT_MODEL)
    target_label = {
        "LSE": "Lengua de Signos Española (LSE)",
        "LSM": "Lengua de Signos Mexicana (LSM)",
        "ASL": "American Sign Language (ASL)",
        "BSL": "British Sign Language (BSL)",
        "auto": "la lengua de signos más común para hablantes de español (preferir LSE)",
    }.get(target or "auto", "auto")

    hints_block = ""
    if kb_hints:
        rows = []
        for h in kb_hints[:8]:
            src = h.get("_source", "kb")
            row = (
                f"- {h.get('word','')} ({h.get('language','?')}) [{src}]: "
                f"manos={h.get('hands','')} | boca={h.get('mouth','')} | "
                f"expresión={h.get('expression','')} | cuerpo={h.get('body','')}"
            )
            rows.append(row)
        hints_block = (
            "\n\nBASE DE CONOCIMIENTO INTERNA — usa estas referencias verificadas con prioridad sobre el conocimiento general. "
            "Las marcadas como [correction] tienen prioridad MÁXIMA:\n" + "\n".join(rows) + "\n"
        )

    prompt = (
        f"Convierte el siguiente texto en una guía paso a paso para signarlo en {target_label}. "
        "Recuerda que el lenguaje de signos NO es solo manos: incluye también componentes orales "
        "(boca/labios), expresiones faciales y postura.\n"
        f"{hints_block}\n"
        f'Texto a signar: "{text}"\n\n'
        'Responde EXCLUSIVAMENTE en JSON válido (sin markdown):\n'
        '{"language":"LSE|LSM|ASL|BSL|...","summary":"resumen breve",'
        '"confidence":"alta|media|baja",'
        '"steps":[{"step":1,"word":"...","hands":"...","mouth":"...","expression":"...","body":"...","kb_match":true|false}]}'
    )
    raw = await chat.send_message(UserMessage(text=prompt))
    return _parse_json(raw)


# ---------------------------------------------------------------------------
# Analytics
# ---------------------------------------------------------------------------
async def record_event(event_type: str, data: Optional[dict] = None) -> None:
    try:
        await db.events.insert_one(
            {
                "id": str(uuid.uuid4()),
                "type": event_type,
                "data": data or {},
                "ts": datetime.now(timezone.utc).isoformat(),
            }
        )
    except Exception as exc:
        logger.warning("record_event failed: %s", exc)


_STOPWORDS = {
    "que", "para", "como", "con", "los", "las", "del", "una", "uno", "por",
    "muy", "está", "esta", "este", "ese", "esa", "soy", "eres", "tus",
    "más", "pero", "qué", "cuál", "donde", "cuando", "porque", "tambien", "también",
    "mis", "sus", "ser", "haber", "hacer", "tiene", "tener", "todo", "toda",
    "algun", "alguna", "algo", "alguien", "nada", "nadie", "siempre",
}


# ---------------------------------------------------------------------------
# App + middleware
# ---------------------------------------------------------------------------
limiter = Limiter(key_func=get_remote_address)
app = FastAPI(title="SignLanguage Pro API", version="1.0.0")
app.state.limiter = limiter


@app.exception_handler(RateLimitExceeded)
async def _rate_handler(request: Request, exc: RateLimitExceeded):
    return JSONResponse(
        status_code=429,
        content={"detail": "Demasiadas peticiones. Inténtalo en unos segundos."},
    )


api_router = APIRouter(prefix="/api")


@app.on_event("startup")
async def _startup():
    await ensure_indexes()
    await _load_admin_runtime_overrides()


@app.on_event("shutdown")
async def _shutdown():
    client.close()


# ---------------------------------------------------------------------------
# Public routes
# ---------------------------------------------------------------------------
@api_router.get("/")
async def root():
    return {"service": "SignLanguage Pro", "status": "ok", "version": "1.0.0"}


@api_router.get("/health")
async def health():
    """Liveness + DB ping."""
    info = {"service": "SignLanguage Pro", "status": "ok"}
    try:
        await db.command("ping")
        info["mongo"] = "ok"
    except Exception as exc:
        info["mongo"] = f"error: {exc}"
        info["status"] = "degraded"
    info["llm_provider"] = LLM_PROVIDER
    info["llm_vision_model"] = LLM_VISION_MODEL
    info["llm_key_configured"] = bool(LLM_API_KEY)
    return info


@api_router.post("/translate/video")
@limiter.limit(RATE_TRANSLATE)
async def translate_video(
    request: Request,
    file: UploadFile = File(...),
    mode: str = Form("video"),
    duration: Optional[float] = Form(None),
):
    suffix = ".webm"
    if file.filename and "." in file.filename:
        suffix = "." + file.filename.rsplit(".", 1)[-1].lower()

    tmp = tempfile.NamedTemporaryFile(suffix=suffix, delete=False)
    bytes_written = 0
    try:
        while True:
            chunk = await file.read(1024 * 1024)
            if not chunk:
                break
            bytes_written += len(chunk)
            if bytes_written > MAX_VIDEO_BYTES:
                tmp.close()
                os.unlink(tmp.name)
                raise HTTPException(
                    status_code=413,
                    detail=f"Archivo demasiado grande (máx {MAX_VIDEO_BYTES // (1024*1024)} MB).",
                )
            tmp.write(chunk)
        tmp.close()

        # Extract frames and send as images
        try:
            frames_b64 = await asyncio.to_thread(_extract_video_frames, tmp.name, 6)
        except Exception as exc:
            logger.exception("frame extraction failed")
            raise HTTPException(status_code=400, detail=f"No se pudo procesar el video: {exc}")

        try:
            result = await call_llm_frames_translate(frames_b64)
        except Exception as exc:
            logger.exception("LLM video translation failed")
            raise HTTPException(status_code=502, detail=f"AI translation error: {exc}")

        item = TranslationItem(
            mode=mode,
            translated_text=result.get("translated_text", ""),
            detected_language=result.get("detected_language"),
            confidence=result.get("confidence"),
            notes=result.get("notes"),
            duration_seconds=duration,
        )
        doc = item.model_dump()
        doc["created_at"] = doc["created_at"].isoformat()
        await db.translations.insert_one(doc)
        asyncio.create_task(
            record_event(
                "translate_video",
                {"mode": mode, "language": item.detected_language, "confidence": item.confidence, "size": bytes_written, "duration": duration},
            )
        )
        return item
    finally:
        try:
            os.unlink(tmp.name)
        except Exception:
            pass


@api_router.post("/translate/frames")
@limiter.limit(RATE_TRANSLATE)
async def translate_frames(request: Request, payload: FramesRequest):
    frames = payload.frames[:12]
    try:
        parsed = await call_llm_frames_translate(frames)
    except Exception as exc:
        logger.exception("LLM frames translation failed")
        raise HTTPException(status_code=502, detail=f"AI error: {exc}")

    item = TranslationItem(
        mode=payload.mode or "streaming",
        translated_text=parsed.get("translated_text", ""),
        detected_language=parsed.get("detected_language"),
        confidence=parsed.get("confidence"),
        notes=parsed.get("notes"),
        duration_seconds=payload.duration,
    )
    doc = item.model_dump()
    doc["created_at"] = doc["created_at"].isoformat()
    await db.translations.insert_one(doc)
    asyncio.create_task(
        record_event(
            "translate_frames",
            {"frames": len(frames), "language": item.detected_language, "confidence": item.confidence},
        )
    )
    return item


@api_router.post("/translate/fingerspelling")
@limiter.limit(RATE_TRANSLATE)
async def translate_fingerspelling(request: Request, payload: FramesRequest):
    frames = payload.frames[:14]
    try:
        parsed = await call_llm_fingerspelling(frames)
    except Exception as exc:
        logger.exception("LLM fingerspelling failed")
        raise HTTPException(status_code=502, detail=f"AI error: {exc}")

    word = parsed.get("word") or "".join(parsed.get("letters", []))
    item = TranslationItem(
        mode="fingerspelling",
        translated_text=word,
        detected_language=parsed.get("detected_language"),
        confidence=parsed.get("confidence"),
        notes=parsed.get("notes"),
    )
    doc = item.model_dump()
    doc["created_at"] = doc["created_at"].isoformat()
    await db.translations.insert_one(doc)
    asyncio.create_task(
        record_event(
            "fingerspelling",
            {"letters": len(parsed.get("letters", [])), "language": item.detected_language, "confidence": item.confidence},
        )
    )
    return {
        "id": item.id,
        "word": word,
        "letters": parsed.get("letters", []),
        "detected_language": item.detected_language,
        "confidence": item.confidence,
        "notes": item.notes,
    }


@api_router.post("/translate/text-to-sign", response_model=TextToSignResponse)
@limiter.limit(RATE_TRANSLATE)
async def text_to_sign(request: Request, payload: TextToSignRequest):
    try:
        kb_hints = await kb_augmented_hints(payload.text, payload.target_language or "auto")
    except Exception:
        kb_hints = []
    try:
        parsed = await call_llm_text_to_sign(
            payload.text, payload.target_language or "auto", kb_hints=kb_hints
        )
    except Exception as exc:
        logger.exception("LLM text-to-sign failed")
        raise HTTPException(status_code=502, detail=f"AI error: {exc}")

    confidence = (parsed.get("confidence") or "alta").lower()
    warn = None
    if confidence == "baja":
        warn = (
            "No tengo suficiente seguridad sobre este signo. "
            "Se recomienda revisión manual."
        )

    response = TextToSignResponse(
        id=str(uuid.uuid4()),
        text=payload.text,
        language=parsed.get("language", payload.target_language or "auto"),
        summary=parsed.get("summary", ""),
        steps=parsed.get("steps", []),
        confidence=confidence,
        kb_used=len(kb_hints),
        low_confidence_warning=warn,
    )

    item = TranslationItem(
        mode="text-to-sign",
        source_text=payload.text,
        translated_text=response.summary or payload.text,
        detected_language=response.language,
        confidence=confidence,
        notes=f"{len(response.steps)} pasos generados · {len(kb_hints)} KB hints",
    )
    doc = item.model_dump()
    doc["created_at"] = doc["created_at"].isoformat()
    await db.translations.insert_one(doc)
    asyncio.create_task(
        record_event(
            "text_to_sign",
            {"language": response.language, "steps": len(response.steps),
             "chars": len(payload.text), "kb_used": len(kb_hints), "confidence": confidence},
        )
    )
    return response


@api_router.get("/history", response_model=List[TranslationItem])
async def get_history(limit: int = 100):
    limit = max(1, min(500, int(limit)))
    docs = (
        await db.translations.find({}, {"_id": 0})
        .sort("created_at", -1)
        .to_list(limit)
    )
    for d in docs:
        if isinstance(d.get("created_at"), str):
            d["created_at"] = datetime.fromisoformat(d["created_at"])
    return docs


@api_router.delete("/history/{item_id}")
async def delete_history(item_id: str):
    res = await db.translations.delete_one({"id": item_id})
    if res.deleted_count == 0:
        raise HTTPException(status_code=404, detail="Not found")
    return {"deleted": res.deleted_count}


@api_router.delete("/history")
async def clear_history():
    res = await db.translations.delete_many({})
    return {"deleted": res.deleted_count}


@api_router.get("/translation/{item_id}", response_model=TranslationItem)
async def get_translation(item_id: str):
    doc = await db.translations.find_one({"id": item_id}, {"_id": 0})
    if not doc:
        raise HTTPException(status_code=404, detail="Not found")
    if isinstance(doc.get("created_at"), str):
        doc["created_at"] = datetime.fromisoformat(doc["created_at"])
    return doc


# ---------------------------------------------------------------------------
# Analytics endpoints
# ---------------------------------------------------------------------------
@api_router.post("/analytics/event")
@limiter.limit(RATE_EVENT)
async def post_event(request: Request, payload: AnalyticsEvent):
    await record_event(payload.type, payload.data)
    return {"ok": True}


@api_router.get("/analytics/summary")
async def analytics_summary(days: int = 14):
    days = max(1, min(365, int(days)))

    by_type_raw = await db.events.aggregate(
        [{"$group": {"_id": "$type", "count": {"$sum": 1}}}, {"$sort": {"count": -1}}]
    ).to_list(100)
    by_type = {x["_id"]: x["count"] for x in by_type_raw}

    trans = await db.translations.find(
        {}, {"_id": 0, "mode": 1, "detected_language": 1, "translated_text": 1, "created_at": 1}
    ).to_list(5000)

    by_mode: dict = {}
    by_language: dict = {}
    word_counter: dict = {}
    by_day: dict = {}
    for t in trans:
        m = t.get("mode") or "unknown"
        by_mode[m] = by_mode.get(m, 0) + 1
        lang = t.get("detected_language") or "Desconocido"
        by_language[lang] = by_language.get(lang, 0) + 1
        ts = t.get("created_at")
        if isinstance(ts, str):
            day = ts[:10]
            by_day[day] = by_day.get(day, 0) + 1
        text = (t.get("translated_text") or "").lower()
        for w in text.split():
            w = "".join(c for c in w if c.isalpha())
            if len(w) >= 3 and w not in _STOPWORDS:
                word_counter[w] = word_counter.get(w, 0) + 1

    dict_pipeline = [
        {"$match": {"type": "dictionary_search"}},
        {"$group": {"_id": "$data.q", "count": {"$sum": 1}}},
        {"$sort": {"count": -1}},
        {"$limit": 12},
    ]
    dict_top = await db.events.aggregate(dict_pipeline).to_list(12)
    top_dict = [{"q": x["_id"] or "", "count": x["count"]} for x in dict_top if x["_id"]]

    top_words = sorted(word_counter.items(), key=lambda kv: -kv[1])[:15]
    top_words = [{"word": w, "count": c} for w, c in top_words]

    today = datetime.now(timezone.utc).date()
    series = []
    for i in range(days - 1, -1, -1):
        d = today - timedelta(days=i)
        key = d.isoformat()
        series.append({"day": key, "count": by_day.get(key, 0)})

    return {
        "totals": {"translations": len(trans), "events": sum(by_type.values())},
        "by_type": by_type,
        "by_mode": [{"mode": k, "count": v} for k, v in sorted(by_mode.items(), key=lambda kv: -kv[1])],
        "by_language": [{"language": k, "count": v} for k, v in sorted(by_language.items(), key=lambda kv: -kv[1])],
        "by_day": series,
        "top_words": top_words,
        "top_dictionary_searches": top_dict,
    }


# ---------------------------------------------------------------------------
# Dictionary
# ---------------------------------------------------------------------------
from dictionary_data import SEED_DICTIONARY  # type: ignore  # noqa: E402


@api_router.get("/dictionary", response_model=List[DictionaryEntry])
async def list_dictionary(q: Optional[str] = None, language: Optional[str] = None):
    items = SEED_DICTIONARY
    if language and language != "all":
        items = [i for i in items if i.language.lower() == language.lower()]
    if q:
        ql = q.lower().strip()
        items = [i for i in items if ql in i.word.lower() or ql in i.description.lower()]
        asyncio.create_task(
            record_event(
                "dictionary_search",
                {"q": ql, "language": language or "all", "results": len(items)},
            )
        )
    return items


@api_router.get("/dictionary/languages")
async def list_languages():
    langs = sorted({i.language for i in SEED_DICTIONARY})
    return {"languages": langs}


@api_router.get("/dictionary/sign-of-the-day", response_model=DictionaryEntry)
async def sign_of_the_day():
    """Deterministic sign for today (UTC) so all users see the same one."""
    today = datetime.now(timezone.utc).date()
    seed = today.toordinal()
    idx = seed % len(SEED_DICTIONARY)
    return SEED_DICTIONARY[idx]


class CommunitySubmission(BaseModel):
    word: str = Field(min_length=1, max_length=80)
    language: str = Field(min_length=2, max_length=8)
    description: str = Field(min_length=4, max_length=400)
    hands: str = Field(min_length=4, max_length=600)
    mouth: Optional[str] = Field(default="", max_length=400)
    expression: Optional[str] = Field(default="", max_length=400)
    submitted_by: Optional[str] = Field(default=None, max_length=80)


@api_router.post("/dictionary/submit")
@limiter.limit("10/minute")
async def submit_sign(request: Request, payload: CommunitySubmission):
    doc = payload.model_dump()
    doc["id"] = str(uuid.uuid4())
    doc["status"] = "pending"
    doc["created_at"] = datetime.now(timezone.utc).isoformat()
    await db.community_dictionary.insert_one(doc)
    asyncio.create_task(record_event("dictionary_submit", {"language": payload.language}))
    doc.pop("_id", None)
    return {"ok": True, "id": doc["id"]}


@api_router.get("/dictionary/community", response_model=List[dict])
async def list_community(status: str = "approved", limit: int = 100):
    limit = max(1, min(500, int(limit)))
    docs = (
        await db.community_dictionary.find(
            {"status": status}, {"_id": 0}
        )
        .sort("created_at", -1)
        .to_list(limit)
    )
    return docs


# ---- Practice mode ----
class PracticeRequest(BaseModel):
    frames: List[str] = Field(min_length=2, max_length=12)
    expected_word: str = Field(min_length=1, max_length=80)
    language: Optional[str] = "auto"


@api_router.post("/practice/validate")
@limiter.limit(RATE_TRANSLATE)
async def practice_validate(request: Request, payload: PracticeRequest):
    """Score how well the user's attempt matches the expected sign."""
    chat = _llm_chat(SIGN_SYSTEM_PROMPT, model=LLM_VISION_MODEL)
    prompt = (
        f'Eres un evaluador de lengua de signos. El usuario intenta hacer el signo "{payload.expected_word}" '
        f"en {payload.language or 'la lengua de signos detectada'}. "
        "Evalúa estos fotogramas (manos, labios, expresión, postura). "
        "Responde EXCLUSIVAMENTE JSON válido:\n"
        '{"score": 0-100, "verdict": "perfecto|bueno|aceptable|incorrecto", '
        '"feedback": "1-2 frases concretas en español sobre cómo mejorar (manos, expresión, etc.)", '
        '"strengths": ["..."], "weaknesses": ["..."]}'
    )
    try:
        raw = await chat.send_message(
            UserMessage(text=prompt, file_contents=[ImageContent(image_base64=f) for f in payload.frames])
        )
    except Exception as exc:
        logger.exception("practice validate failed")
        raise HTTPException(status_code=502, detail=f"AI error: {exc}")

    parsed = _parse_json(raw)
    try:
        score = int(float(parsed.get("score", 0) or 0))
    except (TypeError, ValueError):
        score = 0
    score = max(0, min(100, score))
    asyncio.create_task(
        record_event(
            "practice_attempt",
            {"word": payload.expected_word, "language": payload.language, "score": score},
        )
    )
    return {
        "score": score,
        "verdict": parsed.get("verdict") or "aceptable",
        "feedback": parsed.get("feedback", ""),
        "strengths": parsed.get("strengths", []),
        "weaknesses": parsed.get("weaknesses", []),
    }


# ---------------------------------------------------------------------------
# Billing (Stripe)
# ---------------------------------------------------------------------------
class CheckoutCreateRequest(BaseModel):
    package_id: str
    origin_url: str
    email: Optional[str] = None


@api_router.post("/billing/checkout")
@limiter.limit("10/minute")
async def billing_checkout(request: Request, payload: CheckoutCreateRequest):
    if payload.package_id not in PRICING_PACKAGES:
        raise HTTPException(status_code=400, detail="Paquete inválido")
    if not STRIPE_API_KEY:
        raise HTTPException(status_code=503, detail="Stripe no configurado en este servidor")

    pkg = PRICING_PACKAGES[payload.package_id]
    origin = payload.origin_url.rstrip("/")
    success = f"{origin}/precios?session_id={{CHECKOUT_SESSION_ID}}"
    cancel = f"{origin}/precios"
    host_url = str(request.base_url)
    webhook_url = f"{host_url.rstrip('/')}/api/webhook/stripe"
    sc = StripeCheckout(api_key=STRIPE_API_KEY, webhook_url=webhook_url)
    req = CheckoutSessionRequest(
        amount=float(pkg["amount"]),
        currency=pkg["currency"],
        success_url=success,
        cancel_url=cancel,
        metadata={
            "package_id": payload.package_id,
            "label": pkg["label"],
            "email": payload.email or "anonymous",
            "source": "signlanguage_pro",
        },
    )
    try:
        session = await sc.create_checkout_session(req)
    except Exception as exc:
        logger.exception("stripe checkout failed")
        raise HTTPException(status_code=502, detail=f"Stripe error: {exc}")

    await db.payment_transactions.insert_one({
        "session_id": session.session_id,
        "amount": pkg["amount"],
        "currency": pkg["currency"],
        "package_id": payload.package_id,
        "metadata": {"email": payload.email or "anonymous"},
        "status": "initiated",
        "payment_status": "unpaid",
        "created_at": datetime.now(timezone.utc).isoformat(),
        "updated_at": datetime.now(timezone.utc).isoformat(),
    })
    asyncio.create_task(record_event("checkout_initiated", {"package": payload.package_id}))
    return {"url": session.url, "session_id": session.session_id}


@api_router.get("/billing/status/{session_id}")
async def billing_status(session_id: str):
    """Return Stripe checkout status; fall back to local DB record if Stripe
    can't find the session (sentinel test keys, expired, etc.)."""
    tx = await db.payment_transactions.find_one({"session_id": session_id}, {"_id": 0})
    if not tx:
        raise HTTPException(status_code=404, detail="Session not found")

    if STRIPE_API_KEY:
        try:
            sc = StripeCheckout(api_key=STRIPE_API_KEY, webhook_url="")
            st = await sc.get_checkout_status(session_id)
            if tx.get("payment_status") != "paid":
                await db.payment_transactions.update_one(
                    {"session_id": session_id},
                    {"$set": {
                        "status": st.status,
                        "payment_status": st.payment_status,
                        "updated_at": datetime.now(timezone.utc).isoformat(),
                    }},
                )
                if st.payment_status == "paid":
                    asyncio.create_task(record_event("checkout_paid", {"package": tx.get("package_id")}))
            return {
                "status": st.status,
                "payment_status": st.payment_status,
                "amount_total": st.amount_total,
                "currency": st.currency,
                "source": "stripe",
            }
        except Exception as exc:
            logger.warning("Stripe status retrieval failed (%s); falling back to DB", exc)

    # Fallback: local record only (webhook will update payment_status when triggered)
    return {
        "status": tx.get("status", "open"),
        "payment_status": tx.get("payment_status", "unpaid"),
        "amount_total": int(round((tx.get("amount") or 0) * 100)),
        "currency": tx.get("currency", "eur"),
        "source": "local",
    }


@api_router.post("/webhook/stripe")
async def stripe_webhook(request: Request):
    if not STRIPE_API_KEY:
        raise HTTPException(status_code=503, detail="Stripe no configurado")
    body = await request.body()
    sig = request.headers.get("Stripe-Signature", "")
    sc = StripeCheckout(api_key=STRIPE_API_KEY, webhook_url="")
    try:
        ev = await sc.handle_webhook(body, sig)
    except Exception as exc:
        raise HTTPException(status_code=400, detail=f"webhook error: {exc}")
    # Idempotent update by session_id
    if ev.session_id:
        await db.payment_transactions.update_one(
            {"session_id": ev.session_id},
            {"$set": {
                "payment_status": ev.payment_status,
                "event_type": ev.event_type,
                "event_id": ev.event_id,
                "updated_at": datetime.now(timezone.utc).isoformat(),
            }},
        )
        # Send receipt email when payment becomes "paid" (only once)
        if ev.payment_status == "paid":
            tx = await db.payment_transactions.find_one(
                {"session_id": ev.session_id}, {"_id": 0}
            )
            if tx and not tx.get("receipt_sent"):
                meta = tx.get("metadata") or {}
                recipient = meta.get("email") or ""
                if recipient and recipient != "anonymous" and "@" in recipient:
                    pkg_label = PRICING_PACKAGES.get(tx.get("package_id"), {}).get("label", "Pro")
                    subject, html = email_service.template_billing_receipt(
                        amount=float(tx.get("amount") or 0),
                        currency=tx.get("currency") or "eur",
                        package_label=pkg_label,
                        session_id=ev.session_id,
                    )
                    asyncio.create_task(
                        email_service.send_email(to=recipient, subject=subject, html=html)
                    )
                    await db.payment_transactions.update_one(
                        {"session_id": ev.session_id},
                        {"$set": {"receipt_sent": True}},
                    )
    asyncio.create_task(record_event(f"stripe_{ev.event_type}", {"session_id": ev.session_id}))
    return {"received": True}


@api_router.get("/billing/plans")
async def billing_plans():
    return {
        "free": {
            "label": "Gratis",
            "price": 0,
            "currency": "eur",
            "features": [
                "Traducciones limitadas (rate-limit estándar)",
                "Diccionario completo + práctica + quiz",
                "Modo conversación",
                "Análisis básico",
            ],
        },
        "packages": [
            {
                "id": k,
                "label": v["label"],
                "amount": v["amount"],
                "currency": v["currency"],
                "features": [
                    "Traducciones ilimitadas",
                    "API key para integrar en tu web",
                    "Sin marca de agua en exportaciones",
                    "Soporte prioritario",
                ],
            }
            for k, v in PRICING_PACKAGES.items()
        ],
    }


# ---------------------------------------------------------------------------
# API keys (admin-only generation)
# ---------------------------------------------------------------------------
class AdminAuthRequest(BaseModel):
    password: str


class ApiKeyCreate(BaseModel):
    label: str = Field(min_length=1, max_length=80)
    daily_limit: Optional[int] = 1000


def _verify_admin(password: str):
    if not _CURRENT_ADMIN_PASSWORD or password != _CURRENT_ADMIN_PASSWORD:
        raise HTTPException(status_code=401, detail="Invalid admin password")


@api_router.post("/admin/login")
@limiter.limit("5/minute")
async def admin_login(request: Request, payload: AdminAuthRequest):
    _verify_admin(payload.password)
    return {"ok": True}


@api_router.post("/admin/api-keys")
@limiter.limit("20/minute")
async def admin_create_key(request: Request, payload: ApiKeyCreate, x_admin_password: str = ""):
    _verify_admin(x_admin_password or request.headers.get("X-Admin-Password", ""))
    key = "slp_" + uuid.uuid4().hex
    doc = {
        "id": str(uuid.uuid4()),
        "key": key,
        "label": payload.label,
        "daily_limit": int(payload.daily_limit or 1000),
        "usage_today": 0,
        "usage_total": 0,
        "last_used_at": None,
        "created_at": datetime.now(timezone.utc).isoformat(),
        "active": True,
    }
    await db.api_keys.insert_one(doc)
    doc.pop("_id", None)
    return doc


@api_router.get("/admin/api-keys")
async def admin_list_keys(request: Request):
    _verify_admin(request.headers.get("X-Admin-Password", ""))
    docs = await db.api_keys.find({}, {"_id": 0}).sort("created_at", -1).to_list(500)
    return docs


@api_router.delete("/admin/api-keys/{key_id}")
async def admin_delete_key(request: Request, key_id: str):
    _verify_admin(request.headers.get("X-Admin-Password", ""))
    res = await db.api_keys.delete_one({"id": key_id})
    if res.deleted_count == 0:
        raise HTTPException(status_code=404, detail="Not found")
    return {"deleted": res.deleted_count}


# ---- Public API (key-protected, for widget / 3rd parties) ----
async def _check_api_key(request: Request) -> dict:
    api_key = request.headers.get("X-API-Key", "") or request.query_params.get("api_key", "")
    if not api_key:
        raise HTTPException(status_code=401, detail="Missing X-API-Key")
    doc = await db.api_keys.find_one({"key": api_key, "active": True}, {"_id": 0})
    if not doc:
        raise HTTPException(status_code=401, detail="Invalid API key")
    today = datetime.now(timezone.utc).date().isoformat()
    # Daily reset
    if doc.get("usage_date") != today:
        await db.api_keys.update_one(
            {"key": api_key},
            {"$set": {"usage_today": 0, "usage_date": today}},
        )
        doc["usage_today"] = 0
    if doc.get("usage_today", 0) >= doc.get("daily_limit", 1000):
        raise HTTPException(status_code=429, detail="Daily limit reached")
    await db.api_keys.update_one(
        {"key": api_key},
        {"$inc": {"usage_today": 1, "usage_total": 1},
         "$set": {"last_used_at": datetime.now(timezone.utc).isoformat(),
                  "usage_date": today}},
    )
    return doc


@api_router.post("/v1/translate/text-to-sign")
async def public_text_to_sign(request: Request, payload: TextToSignRequest):
    await _check_api_key(request)
    try:
        parsed = await call_llm_text_to_sign(payload.text, payload.target_language or "auto")
    except Exception as exc:
        raise HTTPException(status_code=502, detail=f"AI error: {exc}")
    return {
        "text": payload.text,
        "language": parsed.get("language", "auto"),
        "summary": parsed.get("summary", ""),
        "steps": parsed.get("steps", []),
    }


@api_router.get("/v1/dictionary")
async def public_dictionary(request: Request, q: Optional[str] = None, language: Optional[str] = None):
    await _check_api_key(request)
    items = SEED_DICTIONARY
    if language and language != "all":
        items = [i for i in items if i.language.lower() == language.lower()]
    if q:
        ql = q.lower().strip()
        items = [i for i in items if ql in i.word.lower() or ql in i.description.lower()]
    return [i.model_dump() for i in items]


# ---------------------------------------------------------------------------
# Email (Resend)
# ---------------------------------------------------------------------------
class ShareEmailRequest(BaseModel):
    to: EmailStr
    translation_id: Optional[str] = None
    translation_text: str = Field(min_length=1, max_length=2000)
    language: Optional[str] = "Auto"
    sender_name: Optional[str] = None
    share_url: str = Field(min_length=1, max_length=500)


@api_router.get("/email/status")
async def email_status():
    return {"configured": email_service.is_configured()}


@api_router.post("/email/share")
@limiter.limit("10/minute")
async def email_share(request: Request, payload: ShareEmailRequest):
    subject, html = email_service.template_share(
        translation_text=payload.translation_text,
        language=payload.language or "Auto",
        share_url=payload.share_url,
        sender_name=payload.sender_name or "Alguien",
    )
    res = await email_service.send_email(to=payload.to, subject=subject, html=html)
    asyncio.create_task(
        record_event(
            "email_share",
            {"sent": res.get("sent", False), "language": payload.language},
        )
    )
    return res


class WelcomeEmailRequest(BaseModel):
    to: EmailStr
    plan_label: str = "Pro"
    app_url: str = ""


@api_router.post("/email/welcome")
@limiter.limit("10/minute")
async def email_welcome(request: Request, payload: WelcomeEmailRequest):
    app_url = payload.app_url or _env("APP_PUBLIC_URL") or str(request.base_url).rstrip("/")
    subject, html = email_service.template_welcome(payload.plan_label, app_url)
    res = await email_service.send_email(to=payload.to, subject=subject, html=html)
    asyncio.create_task(record_event("email_welcome", {"sent": res.get("sent", False)}))
    return res


# ---------------------------------------------------------------------------
# Offline pack (top-N most-used signs for PWA cache)
# ---------------------------------------------------------------------------
@api_router.get("/offline/pack")
async def offline_pack(limit: int = 30):
    """Return the top-N dictionary entries by recent usage so the PWA can
    cache them for offline access."""
    limit = max(5, min(100, int(limit)))
    # Combine searches + practice attempts + text-to-sign words to score signs
    score: dict = {}
    try:
        async for ev in db.events.find(
            {"type": {"$in": ["dictionary_search", "practice_attempt"]}},
            {"_id": 0, "type": 1, "data": 1},
        ):
            data = ev.get("data") or {}
            term = (data.get("q") or data.get("word") or "").lower().strip()
            if not term:
                continue
            score[term] = score.get(term, 0) + 1
    except Exception:
        pass

    # Score dictionary entries: matches by word/description
    scored = []
    for entry in SEED_DICTIONARY:
        s = 0
        w = entry.word.lower()
        if w in score:
            s += score[w] * 3
        for term, c in score.items():
            if term and (term in w or w in term):
                s += c
        scored.append((s, entry))
    scored.sort(key=lambda kv: -kv[0])

    # If no usage data yet, just return the first N entries
    chosen = [e for _, e in scored[:limit]] if any(s > 0 for s, _ in scored) else SEED_DICTIONARY[:limit]
    return {
        "version": datetime.now(timezone.utc).date().isoformat(),
        "count": len(chosen),
        "items": [e.model_dump() for e in chosen],
    }


# ---------------------------------------------------------------------------
# WebRTC signaling
# ---------------------------------------------------------------------------
@api_router.post("/rtc/room")
@limiter.limit("30/minute")
async def rtc_create_room(request: Request):
    """Generate a fresh, shareable 6-character room code."""
    code = generate_room_code(6)
    asyncio.create_task(record_event("rtc_room_created", {"code": code}))
    return {"room": code, "expires_in_minutes": 60}


@api_router.get("/rtc/stats")
async def rtc_stats():
    return room_stats()


@api_router.get("/rtc/ice")
async def rtc_ice():
    """Return ICE servers (STUN). For production, set TURN_URL/TURN_USER/TURN_PASS env."""
    servers = [
        {"urls": ["stun:stun.l.google.com:19302", "stun:stun1.l.google.com:19302"]},
    ]
    turn_url = _env("TURN_URL")
    if turn_url:
        servers.append({
            "urls": [turn_url],
            "username": _env("TURN_USER"),
            "credential": _env("TURN_PASS"),
        })
    return {"iceServers": servers}


# WebSocket endpoint mounted on the FastAPI app (NOT the router) so the path
# resolves correctly. Still uses the /api prefix for ingress routing.
@app.websocket("/api/rtc/{room_id}")
async def rtc_ws(websocket: WebSocket, room_id: str):
    await handle_signaling(websocket, room_id.upper())


# ---------------------------------------------------------------------------
# Teaching / Knowledge Base (admin only)
# ---------------------------------------------------------------------------
TEACHING_MAX_BYTES = int(_env("TEACHING_MAX_MB", "200")) * 1024 * 1024

# AI configuration model with sensible defaults
DEFAULT_AI_CONFIG = {
    "text_model": LLM_TEXT_MODEL,        # e.g. gpt-4o-mini
    "vision_model": LLM_VISION_MODEL,    # e.g. gpt-4o
    "system_prompt": teaching_service.KB_SYSTEM_PROMPT_DEFAULT,
    "max_text_chunks": 6,                # how many ~10k-char chunks per file
    "max_image_batch": 6,                # how many frames per LLM vision call
    "video_frames_count": 8,             # frames sampled per uploaded video
    "min_confidence_keep": "baja",       # drop entries below this confidence
    "auto_process": True,                # process file immediately on upload
    "updated_at": None,
    "updated_by": None,
}

ALLOWED_TEXT_MODELS = ["gpt-4o-mini", "gpt-4o", "gpt-5", "gpt-5.2", "claude-sonnet-4.5", "gemini-3-flash"]
ALLOWED_VISION_MODELS = ["gpt-4o", "gpt-4o-mini", "gpt-5", "gpt-5.2", "claude-sonnet-4.5"]


async def get_ai_config() -> dict:
    """Load the AI config doc, falling back to defaults for missing keys."""
    doc = await db.config.find_one({"_id": "ai_config"}) or {}
    out = {**DEFAULT_AI_CONFIG, **{k: v for k, v in doc.items() if k != "_id"}}
    return out


def _llm_chat_factory_for_kb(system: str, model: str) -> LlmChat:
    return _llm_chat(system, model=model, session=f"kb-{uuid.uuid4()}")


async def _kb_lookup(word: str, language: Optional[str] = None, limit: int = 3) -> List[dict]:
    """Find matching KB + correction entries for a word; corrections take priority."""
    word_l = (word or "").lower().strip()
    if not word_l:
        return []
    out: List[dict] = []
    # Corrections first (higher priority)
    cor_query: dict = {"word": {"$regex": f"^{word_l}", "$options": "i"}}
    if language and language not in ("auto", "all"):
        cor_query["language"] = {"$regex": f"^{language}", "$options": "i"}
    async for c in db.corrections.find(cor_query, {"_id": 0}).limit(limit):
        out.append({**c, "_source": "correction"})
    # Then KB
    kb_query: dict = {"word": {"$regex": f"^{word_l}", "$options": "i"}}
    if language and language not in ("auto", "all"):
        kb_query["language"] = {"$regex": f"^{language}", "$options": "i"}
    async for k in db.knowledge_base.find(kb_query, {"_id": 0}).limit(limit):
        out.append({**k, "_source": "kb"})
    return out


async def kb_augmented_hints(text: str, language: Optional[str] = None) -> List[dict]:
    """Look up KB hints for the salient words in `text`."""
    words = [w for w in (text or "").split() if len(w) >= 3][:8]
    seen = set()
    hints: List[dict] = []
    for w in words:
        for h in await _kb_lookup(w, language, limit=2):
            key = (h.get("word", "").lower(), h.get("language", "").lower())
            if key in seen:
                continue
            seen.add(key)
            hints.append(h)
    return hints[:8]


def _verify_admin_either(request: Request, x_admin_password: str = "") -> None:
    pwd = x_admin_password or request.headers.get("X-Admin-Password", "")
    _verify_admin(pwd)


# ---------------------------------------------------------------------------
# Admin runtime overrides: password + custom OpenAI key
# ---------------------------------------------------------------------------
def _get_fernet() -> Fernet:
    """Lazy-init Fernet for the encrypted custom OpenAI key. Derives a 32-byte
    key from MONGO_URL+DB_NAME so it survives restarts without an extra env
    var. If the DB moves, ciphertexts are invalidated (acceptable: the admin
    can simply re-paste their key)."""
    global _FERNET_KEY
    if _FERNET_KEY is None:
        seed = (MONGO_URL + "::" + DB_NAME + "::ai-key-v1").encode("utf-8")
        digest = hashlib.sha256(seed).digest()
        _FERNET_KEY = base64.urlsafe_b64encode(digest)
    return Fernet(_FERNET_KEY)


async def _load_admin_runtime_overrides():
    """Load admin password + custom OpenAI key from DB on startup."""
    global _CURRENT_ADMIN_PASSWORD, _CUSTOM_OPENAI_API_KEY
    try:
        pwd_doc = await db.config.find_one({"_id": "admin_password"})
        if pwd_doc and pwd_doc.get("password"):
            _CURRENT_ADMIN_PASSWORD = pwd_doc["password"]
    except Exception as exc:
        logger.warning("Could not load admin_password override: %s", exc)
    try:
        key_doc = await db.config.find_one({"_id": "openai_api_key"})
        if key_doc and key_doc.get("ciphertext"):
            try:
                plain = _get_fernet().decrypt(key_doc["ciphertext"].encode("utf-8")).decode("utf-8")
                _CUSTOM_OPENAI_API_KEY = plain
            except InvalidToken:
                logger.warning("Stored OpenAI key ciphertext invalid (mongo moved?). Ignoring.")
    except Exception as exc:
        logger.warning("Could not load openai_api_key override: %s", exc)


class ChangePasswordRequest(BaseModel):
    current_password: str = Field(min_length=1)
    new_password: str = Field(min_length=4, max_length=120)


@api_router.post("/admin/change-password")
@limiter.limit("5/minute")
async def admin_change_password(request: Request, payload: ChangePasswordRequest):
    """Allow an authenticated admin to rotate the admin password. Persists in
    MongoDB so it survives restarts. The ENV ADMIN_PASSWORD is used as the
    initial bootstrap value only."""
    global _CURRENT_ADMIN_PASSWORD
    _verify_admin(payload.current_password)
    await db.config.update_one(
        {"_id": "admin_password"},
        {"$set": {
            "password": payload.new_password,
            "updated_at": datetime.now(timezone.utc).isoformat(),
        }},
        upsert=True,
    )
    _CURRENT_ADMIN_PASSWORD = payload.new_password
    return {"ok": True}


# ---- Custom OpenAI API key (Enseñanzas → tab "API IA") ----
class ApiKeyUpdate(BaseModel):
    api_key: str = Field(min_length=10, max_length=200)


def _mask_key(key: str) -> str:
    if not key:
        return ""
    return f"…{key[-4:]}" if len(key) >= 4 else "…"


@api_router.get("/admin/teaching/api-key")
async def teaching_get_api_key(request: Request):
    """Return the masked custom OpenAI key + which key is active."""
    _verify_admin_either(request)
    has_custom = bool(_CUSTOM_OPENAI_API_KEY)
    return {
        "has_custom_key": has_custom,
        "masked_key": _mask_key(_CUSTOM_OPENAI_API_KEY) if has_custom else "",
        "active_source": "custom" if has_custom else ("emergent_universal" if EMERGENT_LLM_KEY else ("openai_env" if OPENAI_API_KEY else "none")),
    }


@api_router.put("/admin/teaching/api-key")
async def teaching_update_api_key(request: Request, payload: ApiKeyUpdate):
    """Encrypt + store the admin's personal OpenAI key in DB."""
    global _CUSTOM_OPENAI_API_KEY
    _verify_admin_either(request)
    new_key = payload.api_key.strip()
    if not new_key.startswith("sk-"):
        raise HTTPException(400, "El formato de la clave parece inválido (debe comenzar con sk-)")
    ciphertext = _get_fernet().encrypt(new_key.encode("utf-8")).decode("utf-8")
    await db.config.update_one(
        {"_id": "openai_api_key"},
        {"$set": {
            "ciphertext": ciphertext,
            "last_4": new_key[-4:],
            "updated_at": datetime.now(timezone.utc).isoformat(),
        }},
        upsert=True,
    )
    _CUSTOM_OPENAI_API_KEY = new_key
    return {"ok": True, "has_custom_key": True, "masked_key": _mask_key(new_key)}


@api_router.delete("/admin/teaching/api-key")
async def teaching_delete_api_key(request: Request):
    """Remove the custom key — extraction reverts to Emergent universal key."""
    global _CUSTOM_OPENAI_API_KEY
    _verify_admin_either(request)
    await db.config.delete_one({"_id": "openai_api_key"})
    _CUSTOM_OPENAI_API_KEY = None
    return {"ok": True, "has_custom_key": False}


@api_router.post("/admin/teaching/api-key/test")
@limiter.limit("10/minute")
async def teaching_test_api_key(request: Request):
    """Quick smoke test of the currently-active OpenAI key (custom or fallback).
    Returns the source used + ok status."""
    _verify_admin_either(request)
    cfg = await get_ai_config()
    source = "custom" if _CUSTOM_OPENAI_API_KEY else ("emergent_universal" if EMERGENT_LLM_KEY else "openai_env")
    try:
        chat = _llm_chat("Eres un asistente. Responde solo 'ok'.", model=cfg.get("text_model") or "gpt-4o-mini")
        resp = await chat.send_message(UserMessage(text="ping"))
        return {
            "ok": True,
            "source": source,
            "model_used": cfg.get("text_model"),
            "response_preview": (str(resp) or "")[:120],
        }
    except Exception as exc:
        return {"ok": False, "source": source, "error": str(exc)[:300]}



# ---- Models ----
class CorrectionUpsertRequest(BaseModel):
    word: str = Field(min_length=1, max_length=120)
    language: str = Field(min_length=1, max_length=24)
    description: Optional[str] = Field(default="", max_length=600)
    hands: Optional[str] = Field(default="", max_length=600)
    mouth: Optional[str] = Field(default="", max_length=400)
    expression: Optional[str] = Field(default="", max_length=400)
    body: Optional[str] = Field(default="", max_length=400)
    status: Optional[str] = Field(default="correct")  # correct | doubtful
    notes: Optional[str] = Field(default="", max_length=600)


# ---- Endpoints ----
@api_router.post("/admin/teaching/upload")
@limiter.limit("30/minute")
async def teaching_upload(
    request: Request,
    file: UploadFile = File(...),
    label: str = Form(""),
):
    _verify_admin_either(request)

    file_type = teaching_service.detect_type(file.content_type or "", file.filename or "")
    if not file_type:
        raise HTTPException(status_code=400, detail="Tipo de archivo no soportado (PDF/DOCX/imagen/vídeo)")

    file_id = str(uuid.uuid4())
    safe = teaching_service.safe_name(file.filename or f"file-{file_id}")
    target = teaching_service.teaching_dir() / f"{file_id}__{safe}"

    bytes_written = 0
    try:
        with open(target, "wb") as fh:
            while True:
                chunk = await file.read(1024 * 1024)
                if not chunk:
                    break
                bytes_written += len(chunk)
                if bytes_written > TEACHING_MAX_BYTES:
                    fh.close()
                    target.unlink(missing_ok=True)
                    raise HTTPException(
                        status_code=413,
                        detail=f"Archivo demasiado grande (máx {TEACHING_MAX_BYTES // (1024 * 1024)} MB)",
                    )
                fh.write(chunk)
    except HTTPException:
        raise
    except Exception as exc:
        target.unlink(missing_ok=True)
        raise HTTPException(status_code=500, detail=f"Error guardando archivo: {exc}")

    doc = {
        "id": file_id,
        "filename": file.filename or safe,
        "label": label or "",
        "type": file_type,
        "size": bytes_written,
        "path": str(target),
        "status": "uploaded",
        "kb_count": 0,
        "uploaded_at": datetime.now(timezone.utc).isoformat(),
        "processed_at": None,
        "error": None,
    }
    await db.teaching_files.insert_one(doc)
    asyncio.create_task(record_event("teaching_upload", {"type": file_type, "size": bytes_written}))
    doc.pop("_id", None)
    return doc


@api_router.get("/admin/teaching/files")
async def teaching_list(request: Request):
    _verify_admin_either(request)
    docs = await db.teaching_files.find({}, {"_id": 0}).sort("uploaded_at", -1).to_list(500)
    return docs


@api_router.delete("/admin/teaching/files/{file_id}")
async def teaching_delete(request: Request, file_id: str):
    _verify_admin_either(request)
    doc = await db.teaching_files.find_one({"id": file_id}, {"_id": 0})
    if not doc:
        raise HTTPException(status_code=404, detail="Archivo no encontrado")
    try:
        Path(doc.get("path", "")).unlink(missing_ok=True)
    except Exception:
        pass
    await db.teaching_files.delete_one({"id": file_id})
    await db.knowledge_base.delete_many({"source_file_id": file_id})
    return {"deleted": 1}


@api_router.put("/admin/teaching/files/{file_id}")
async def teaching_replace(
    request: Request,
    file_id: str,
    file: UploadFile = File(...),
    label: str = Form(""),
):
    """Replace the binary of an existing teaching file (re-upload).
    KB entries are kept until the file is re-processed."""
    _verify_admin_either(request)
    doc = await db.teaching_files.find_one({"id": file_id}, {"_id": 0})
    if not doc:
        raise HTTPException(status_code=404, detail="Archivo no encontrado")

    file_type = teaching_service.detect_type(file.content_type or "", file.filename or "")
    if not file_type:
        raise HTTPException(status_code=400, detail="Tipo de archivo no soportado")

    safe = teaching_service.safe_name(file.filename or f"file-{file_id}")
    target = teaching_service.teaching_dir() / f"{file_id}__{safe}"
    bytes_written = 0
    try:
        with open(target, "wb") as fh:
            while True:
                chunk = await file.read(1024 * 1024)
                if not chunk:
                    break
                bytes_written += len(chunk)
                if bytes_written > TEACHING_MAX_BYTES:
                    fh.close()
                    target.unlink(missing_ok=True)
                    raise HTTPException(
                        status_code=413,
                        detail=f"Archivo demasiado grande (máx {TEACHING_MAX_BYTES // (1024 * 1024)} MB)",
                    )
                fh.write(chunk)
    except HTTPException:
        raise

    # Remove the previous file from disk if path changed
    old_path = doc.get("path")
    if old_path and old_path != str(target):
        try:
            Path(old_path).unlink(missing_ok=True)
        except Exception:
            pass

    update = {
        "filename": file.filename or safe,
        "type": file_type,
        "size": bytes_written,
        "path": str(target),
        "status": "uploaded",
        "kb_count": 0,  # KB rows for this file are purged on replace
        "uploaded_at": datetime.now(timezone.utc).isoformat(),
        "processed_at": None,
        "error": None,
    }
    if label:
        update["label"] = label
    await db.teaching_files.update_one({"id": file_id}, {"$set": update})
    # Purge stale KB entries — file content changed, old extractions no longer apply
    await db.knowledge_base.delete_many({"source_file_id": file_id})
    return {**doc, **update, "id": file_id}


@api_router.patch("/admin/teaching/files/{file_id}")
async def teaching_update_metadata(request: Request, file_id: str, payload: dict):
    """Update metadata only (label) — does not touch the file binary."""
    _verify_admin_either(request)
    label = (payload or {}).get("label")
    if label is None:
        raise HTTPException(status_code=400, detail="Falta 'label'")
    res = await db.teaching_files.update_one(
        {"id": file_id}, {"$set": {"label": str(label)[:200]}}
    )
    if res.matched_count == 0:
        raise HTTPException(status_code=404, detail="Archivo no encontrado")
    doc = await db.teaching_files.find_one({"id": file_id}, {"_id": 0})
    return doc


@api_router.post("/admin/teaching/process/{file_id}")
@limiter.limit("10/minute")
async def teaching_process(request: Request, file_id: str):
    _verify_admin_either(request)
    doc = await db.teaching_files.find_one({"id": file_id}, {"_id": 0})
    if not doc:
        raise HTTPException(status_code=404, detail="Archivo no encontrado")
    if doc.get("status") == "processing":
        raise HTTPException(status_code=409, detail="Ya en proceso")

    await db.teaching_files.update_one(
        {"id": file_id}, {"$set": {"status": "processing", "error": None}}
    )

    async def _run():
        try:
            cfg = await get_ai_config()
            path = Path(doc["path"])
            file_type = doc["type"]
            text_chunks, images_b64 = await teaching_service.extract_material(
                path, file_type, video_frames=int(cfg.get("video_frames_count") or 8),
            )
            kb_items = await teaching_service.mine_with_llm(
                llm_chat_factory=_llm_chat_factory_for_kb,
                user_message_factory=UserMessage,
                image_content_cls=ImageContent,
                text_model=cfg.get("text_model") or LLM_TEXT_MODEL,
                vision_model=cfg.get("vision_model") or LLM_VISION_MODEL,
                text_chunks=text_chunks,
                images_b64=images_b64,
                system_prompt=cfg.get("system_prompt") or None,
                max_text_chunks=int(cfg.get("max_text_chunks") or 6),
                max_image_batch=int(cfg.get("max_image_batch") or 6),
            )
            # Optional confidence filter
            min_conf = (cfg.get("min_confidence_keep") or "baja").lower()
            order = {"alta": 3, "media": 2, "baja": 1}
            min_rank = order.get(min_conf, 1)
            kb_items = [k for k in kb_items if order.get(k.get("confidence", "media"), 2) >= min_rank]

            # Replace existing entries from this source
            await db.knowledge_base.delete_many({"source_file_id": file_id})
            if kb_items:
                docs = []
                now = datetime.now(timezone.utc).isoformat()
                for it in kb_items:
                    docs.append(
                        {
                            "id": str(uuid.uuid4()),
                            "source_file_id": file_id,
                            "source_filename": doc.get("filename"),
                            "source_type": file_type,
                            "created_at": now,
                            **it,
                        }
                    )
                await db.knowledge_base.insert_many(docs)
            await db.teaching_files.update_one(
                {"id": file_id},
                {"$set": {
                    "status": "processed",
                    "kb_count": len(kb_items),
                    "processed_at": datetime.now(timezone.utc).isoformat(),
                    "error": None,
                }},
            )
            await record_event("teaching_processed", {"type": file_type, "count": len(kb_items)})
        except Exception as exc:
            logger.exception("teaching process failed")
            await db.teaching_files.update_one(
                {"id": file_id},
                {"$set": {"status": "error", "error": str(exc)[:400]}},
            )

    asyncio.create_task(_run())
    return {"started": True, "id": file_id}


@api_router.get("/admin/teaching/knowledge")
async def teaching_knowledge(
    request: Request,
    q: Optional[str] = None,
    language: Optional[str] = None,
    confidence: Optional[str] = None,
    limit: int = 200,
):
    _verify_admin_either(request)
    limit = max(1, min(1000, int(limit)))
    query: dict = {}
    if q:
        ql = q.lower().strip()
        query["$or"] = [
            {"word": {"$regex": ql, "$options": "i"}},
            {"hands": {"$regex": ql, "$options": "i"}},
        ]
    if language and language not in ("auto", "all"):
        query["language"] = {"$regex": f"^{language}", "$options": "i"}
    if confidence and confidence not in ("all",):
        query["confidence"] = confidence.lower()
    docs = await db.knowledge_base.find(query, {"_id": 0}).limit(limit).to_list(limit)
    return docs


@api_router.delete("/admin/teaching/knowledge/{kb_id}")
async def teaching_knowledge_delete(request: Request, kb_id: str):
    _verify_admin_either(request)
    res = await db.knowledge_base.delete_one({"id": kb_id})
    if res.deleted_count == 0:
        raise HTTPException(status_code=404, detail="Entrada no encontrada")
    return {"deleted": res.deleted_count}


@api_router.post("/admin/teaching/corrections")
@limiter.limit("60/minute")
async def teaching_correction_upsert(request: Request, payload: CorrectionUpsertRequest):
    _verify_admin_either(request)
    now = datetime.now(timezone.utc).isoformat()
    word_l = payload.word.lower().strip()
    lang_l = payload.language.lower().strip()
    update_doc = {
        **payload.model_dump(),
        "word": payload.word.strip(),
        "language": payload.language.strip(),
        "updated_at": now,
    }
    res = await db.corrections.find_one_and_update(
        {"word": {"$regex": f"^{word_l}$", "$options": "i"},
         "language": {"$regex": f"^{lang_l}$", "$options": "i"}},
        {
            "$set": update_doc,
            "$setOnInsert": {
                "id": str(uuid.uuid4()),
                "created_at": now,
            },
        },
        upsert=True,
        return_document=True,
        projection={"_id": 0},
    )
    return res


@api_router.get("/admin/teaching/corrections")
async def teaching_corrections_list(request: Request, limit: int = 500):
    _verify_admin_either(request)
    limit = max(1, min(2000, int(limit)))
    docs = await db.corrections.find({}, {"_id": 0}).sort("updated_at", -1).to_list(limit)
    return docs


@api_router.delete("/admin/teaching/corrections/{cid}")
async def teaching_correction_delete(request: Request, cid: str):
    _verify_admin_either(request)
    res = await db.corrections.delete_one({"id": cid})
    if res.deleted_count == 0:
        raise HTTPException(status_code=404, detail="Corrección no encontrada")
    return {"deleted": res.deleted_count}


@api_router.get("/admin/teaching/stats")
async def teaching_stats(request: Request):
    _verify_admin_either(request)
    files = await db.teaching_files.count_documents({})
    processed = await db.teaching_files.count_documents({"status": "processed"})
    pending = await db.teaching_files.count_documents({"status": "uploaded"})
    errors = await db.teaching_files.count_documents({"status": "error"})
    kb_count = await db.knowledge_base.count_documents({})
    corrections = await db.corrections.count_documents({})
    by_lang = await db.knowledge_base.aggregate(
        [{"$group": {"_id": "$language", "n": {"$sum": 1}}}, {"$sort": {"n": -1}}]
    ).to_list(50)
    return {
        "files": files,
        "processed": processed,
        "pending": pending,
        "errors": errors,
        "kb_count": kb_count,
        "corrections": corrections,
        "by_language": [{"language": x["_id"] or "?", "count": x["n"]} for x in by_lang],
    }


# ---- AI configuration ----
class AIConfigUpdate(BaseModel):
    text_model: Optional[str] = None
    vision_model: Optional[str] = None
    system_prompt: Optional[str] = Field(default=None, max_length=8000)
    max_text_chunks: Optional[int] = Field(default=None, ge=1, le=20)
    max_image_batch: Optional[int] = Field(default=None, ge=1, le=8)
    video_frames_count: Optional[int] = Field(default=None, ge=2, le=20)
    min_confidence_keep: Optional[str] = Field(default=None, pattern="^(alta|media|baja)$")
    auto_process: Optional[bool] = None


@api_router.get("/admin/teaching/ai-config")
async def teaching_get_ai_config(request: Request):
    _verify_admin_either(request)
    cfg = await get_ai_config()
    return {
        **cfg,
        "available_text_models": ALLOWED_TEXT_MODELS,
        "available_vision_models": ALLOWED_VISION_MODELS,
        "default_system_prompt": teaching_service.KB_SYSTEM_PROMPT_DEFAULT,
    }


@api_router.put("/admin/teaching/ai-config")
async def teaching_update_ai_config(request: Request, payload: AIConfigUpdate):
    _verify_admin_either(request)
    update: dict = {}
    body = payload.model_dump(exclude_unset=True)

    if "text_model" in body and body["text_model"]:
        if body["text_model"] not in ALLOWED_TEXT_MODELS:
            raise HTTPException(status_code=400, detail=f"Modelo de texto no permitido. Usa uno de: {', '.join(ALLOWED_TEXT_MODELS)}")
        update["text_model"] = body["text_model"]
    if "vision_model" in body and body["vision_model"]:
        if body["vision_model"] not in ALLOWED_VISION_MODELS:
            raise HTTPException(status_code=400, detail=f"Modelo de visión no permitido. Usa uno de: {', '.join(ALLOWED_VISION_MODELS)}")
        update["vision_model"] = body["vision_model"]
    for k in ("system_prompt", "max_text_chunks", "max_image_batch",
              "video_frames_count", "min_confidence_keep", "auto_process"):
        if k in body:
            update[k] = body[k]

    if not update:
        raise HTTPException(status_code=400, detail="Nada que actualizar")

    update["updated_at"] = datetime.now(timezone.utc).isoformat()
    update["updated_by"] = "admin"
    await db.config.update_one({"_id": "ai_config"}, {"$set": update}, upsert=True)
    return await get_ai_config()


@api_router.post("/admin/teaching/ai-config/reset")
async def teaching_reset_ai_config(request: Request):
    _verify_admin_either(request)
    await db.config.delete_one({"_id": "ai_config"})
    return await get_ai_config()


@api_router.post("/admin/teaching/ai-config/test")
@limiter.limit("10/minute")
async def teaching_test_ai_config(request: Request):
    """Smoke-test: run the configured text model on a tiny sample to confirm
    everything is wired (key valid, model name accepted, prompt parses)."""
    _verify_admin_either(request)
    cfg = await get_ai_config()
    sample_text = (
        "HOLA: mano abierta a la altura de la sien, deslizar hacia adelante. "
        "Boca articula 'hola'. Sonrisa suave."
    )
    try:
        items = await teaching_service.mine_with_llm(
            llm_chat_factory=_llm_chat_factory_for_kb,
            user_message_factory=UserMessage,
            image_content_cls=ImageContent,
            text_model=cfg["text_model"],
            vision_model=cfg["vision_model"],
            text_chunks=[sample_text],
            images_b64=[],
            system_prompt=cfg.get("system_prompt"),
            max_text_chunks=1,
        )
        return {
            "ok": True,
            "model_used": cfg["text_model"],
            "items_extracted": len(items),
            "preview": items[:2],
        }
    except Exception as exc:
        return {"ok": False, "error": str(exc)[:400]}


# Public KB lookup (used by text-to-sign + other consumers)
@api_router.get("/kb/lookup")
async def kb_lookup(q: str, language: Optional[str] = None, limit: int = 5):
    if not q:
        return {"items": []}
    items = await _kb_lookup(q, language, limit=max(1, min(20, int(limit))))
    return {"items": items}


# ---- Video reference helpers ----
@api_router.get("/admin/teaching/videos")
async def teaching_videos(request: Request):
    """List all uploaded reference videos with their KB summaries."""
    _verify_admin_either(request)
    docs = await db.teaching_files.find(
        {"type": "video"}, {"_id": 0}
    ).sort("uploaded_at", -1).to_list(500)
    out = []
    for d in docs:
        kb = await db.knowledge_base.find(
            {"source_file_id": d["id"]}, {"_id": 0, "word": 1, "language": 1, "confidence": 1}
        ).limit(50).to_list(50)
        out.append({**d, "kb_words": kb})
    return out


@api_router.get("/teaching/video-for-word")
async def video_for_word(
    request: Request,
    word: str,
    language: Optional[str] = None,
):
    """
    Find the most-relevant uploaded reference video for a given word.
    Admin-only: requires X-Admin-Password (the avatar overlay shows this only
    to admins; non-admin viewers don't see KB videos).
    """
    _verify_admin_either(request)
    word_l = (word or "").lower().strip()
    if not word_l:
        return {"video": None}
    kb_query: dict = {"word": {"$regex": f"^{word_l}", "$options": "i"}, "source_type": "video"}
    if language and language not in ("auto", "all"):
        kb_query["language"] = {"$regex": f"^{language}", "$options": "i"}
    kb = await db.knowledge_base.find_one(kb_query, {"_id": 0})
    if not kb:
        return {"video": None}
    f = await db.teaching_files.find_one({"id": kb["source_file_id"]}, {"_id": 0})
    if not f:
        return {"video": None}
    return {
        "video": {
            "file_id": f["id"],
            "filename": f["filename"],
            "label": f.get("label", ""),
            "stream_url": f"/api/admin/teaching/file-stream/{f['id']}",
        },
        "kb": kb,
    }


@api_router.get("/admin/teaching/file-stream/{file_id}")
async def teaching_file_stream(request: Request, file_id: str):
    """Stream the binary of an uploaded teaching file (admin-auth)."""
    _verify_admin_either(request)
    doc = await db.teaching_files.find_one({"id": file_id}, {"_id": 0})
    if not doc:
        raise HTTPException(status_code=404, detail="Archivo no encontrado")
    p = Path(doc.get("path", ""))
    if not p.exists():
        raise HTTPException(status_code=404, detail="Archivo no disponible")
    media = {
        "video": "video/mp4",
        "image": "image/jpeg",
        "pdf": "application/pdf",
        "docx": "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    }.get(doc.get("type", ""), "application/octet-stream")
    if doc.get("type") == "video":
        ext = p.suffix.lower()
        media = {
            ".webm": "video/webm",
            ".mov": "video/quicktime",
            ".mp4": "video/mp4",
        }.get(ext, "video/mp4")
    return FileResponse(str(p), media_type=media, filename=doc.get("filename", "file"))


# ---- Mount ----
app.include_router(api_router)

if ALLOWED_HOSTS and ALLOWED_HOSTS != ["*"]:
    app.add_middleware(TrustedHostMiddleware, allowed_hosts=ALLOWED_HOSTS)

app.add_middleware(
    CORSMiddleware,
    allow_credentials=True,
    allow_origins=CORS_ORIGINS or ["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)
