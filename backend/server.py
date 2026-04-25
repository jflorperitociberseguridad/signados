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
from fastapi import APIRouter, FastAPI, File, Form, HTTPException, Request, UploadFile
from fastapi.responses import JSONResponse
from dotenv import load_dotenv
from motor.motor_asyncio import AsyncIOMotorClient
from pydantic import BaseModel, ConfigDict, Field, field_validator
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
    return LlmChat(
        api_key=LLM_API_KEY,
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


async def call_llm_text_to_sign(text: str, target: str) -> dict:
    chat = _llm_chat(SIGN_SYSTEM_PROMPT, model=LLM_TEXT_MODEL)
    target_label = {
        "LSE": "Lengua de Signos Española (LSE)",
        "LSM": "Lengua de Signos Mexicana (LSM)",
        "ASL": "American Sign Language (ASL)",
        "auto": "la lengua de signos más común para hablantes de español (preferir LSE)",
    }.get(target or "auto", "auto")

    prompt = (
        f"Convierte el siguiente texto en una guía paso a paso para signarlo en {target_label}. "
        "Recuerda que el lenguaje de signos NO es solo manos: incluye también componentes orales "
        "(boca/labios), expresiones faciales y postura.\n\n"
        f'Texto a signar: "{text}"\n\n'
        'Responde EXCLUSIVAMENTE en JSON válido (sin markdown):\n'
        '{"language":"LSE|LSM|ASL|...","summary":"resumen breve","steps":[{"step":1,"word":"...","hands":"...","mouth":"...","expression":"...","body":"..."}]}'
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
        parsed = await call_llm_text_to_sign(payload.text, payload.target_language or "auto")
    except Exception as exc:
        logger.exception("LLM text-to-sign failed")
        raise HTTPException(status_code=502, detail=f"AI error: {exc}")

    response = TextToSignResponse(
        id=str(uuid.uuid4()),
        text=payload.text,
        language=parsed.get("language", payload.target_language or "auto"),
        summary=parsed.get("summary", ""),
        steps=parsed.get("steps", []),
    )

    item = TranslationItem(
        mode="text-to-sign",
        source_text=payload.text,
        translated_text=response.summary or payload.text,
        detected_language=response.language,
        confidence="alta",
        notes=f"{len(response.steps)} pasos generados",
    )
    doc = item.model_dump()
    doc["created_at"] = doc["created_at"].isoformat()
    await db.translations.insert_one(doc)
    asyncio.create_task(
        record_event(
            "text_to_sign",
            {"language": response.language, "steps": len(response.steps), "chars": len(payload.text)},
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


# ---------------------------------------------------------------------------
# Mount
# ---------------------------------------------------------------------------
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
