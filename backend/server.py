from fastapi import FastAPI, APIRouter, UploadFile, File, Form, HTTPException
from dotenv import load_dotenv
from starlette.middleware.cors import CORSMiddleware
from motor.motor_asyncio import AsyncIOMotorClient
import os
import json
import logging
import tempfile
import shutil
from pathlib import Path
from pydantic import BaseModel, Field, ConfigDict
from typing import List, Optional
import uuid
from datetime import datetime, timezone

from emergentintegrations.llm.chat import (
    LlmChat,
    UserMessage,
    FileContentWithMimeType,
)


ROOT_DIR = Path(__file__).parent
load_dotenv(ROOT_DIR / ".env")

# MongoDB connection
mongo_url = os.environ["MONGO_URL"]
client = AsyncIOMotorClient(mongo_url)
db = client[os.environ["DB_NAME"]]

EMERGENT_LLM_KEY = os.environ["EMERGENT_LLM_KEY"]
GEMINI_MODEL = "gemini-3-pro-preview"

app = FastAPI(title="SignLanguage Pro API")
api_router = APIRouter(prefix="/api")


# ---------- Models ----------
class TranslationItem(BaseModel):
    model_config = ConfigDict(extra="ignore")

    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    mode: str  # "video", "live", "text-to-sign"
    source_text: Optional[str] = None  # original text for text->sign
    translated_text: str
    detected_language: Optional[str] = None
    confidence: Optional[str] = None  # "alta", "media", "baja"
    notes: Optional[str] = None
    duration_seconds: Optional[float] = None
    created_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))


class TextToSignRequest(BaseModel):
    text: str
    target_language: Optional[str] = "auto"  # LSE, LSM, ASL, auto


class TextToSignResponse(BaseModel):
    id: str
    text: str
    language: str
    steps: List[dict]  # [{step, hands, mouth, expression, body}]
    summary: str


class DictionaryEntry(BaseModel):
    word: str
    language: str
    description: str
    hands: str
    mouth: str
    expression: str


# ---------- Helpers ----------
SIGN_SYSTEM_PROMPT = """Eres un experto traductor profesional de lenguaje de signos con conocimiento profundo en LSE (Lengua de Signos Española), LSM (Lengua de Signos Mexicana), ASL (American Sign Language), LIBRAS y otras variantes internacionales.

Cuando analizas video o imágenes:
- Observa cuidadosamente las MANOS (configuración, orientación, ubicación, movimiento)
- Observa LABIOS y BOCA (componentes orales, vocalizaciones silenciosas)
- Observa EXPRESIONES FACIALES (cejas, mirada, mejillas — son gramática crucial)
- Observa POSTURA CORPORAL y movimientos de tronco/hombros
- Identifica el tipo de lengua de signos cuando sea posible

Responde SIEMPRE en español. Sé claro, preciso y honesto cuando algo no sea seguro."""


async def call_gemini_video(file_path: str, mime_type: str) -> dict:
    """Send a video file to Gemini and parse JSON translation."""
    chat = (
        LlmChat(
            api_key=EMERGENT_LLM_KEY,
            session_id=f"sign-{uuid.uuid4()}",
            system_message=SIGN_SYSTEM_PROMPT,
        )
        .with_model("gemini", GEMINI_MODEL)
    )

    video_attachment = FileContentWithMimeType(
        mime_type=mime_type, file_path=file_path
    )

    prompt = """Analiza este video de lenguaje de signos. Considera TODO: manos, labios/boca, expresiones faciales y postura corporal.

Responde EXCLUSIVAMENTE en formato JSON válido (sin markdown, sin texto extra) con esta estructura:
{
  "translated_text": "traducción al español del mensaje signado",
  "detected_language": "LSE | LSM | ASL | LIBRAS | Otro | Desconocido",
  "confidence": "alta | media | baja",
  "notes": "observaciones breves sobre expresiones faciales o componentes orales relevantes"
}"""

    msg = UserMessage(text=prompt, file_contents=[video_attachment])
    raw = await chat.send_message(msg)
    return _parse_json(raw)


def _parse_json(raw: str) -> dict:
    text = raw.strip()
    # Strip code fences if present
    if text.startswith("```"):
        text = text.strip("`")
        if text.lower().startswith("json"):
            text = text[4:].strip()
    # Try direct parse
    try:
        return json.loads(text)
    except Exception:
        pass
    # Try to find {...}
    start = text.find("{")
    end = text.rfind("}")
    if start != -1 and end != -1 and end > start:
        try:
            return json.loads(text[start : end + 1])
        except Exception:
            pass
    return {"translated_text": raw, "detected_language": "Desconocido", "confidence": "baja", "notes": ""}


# ---------- Routes ----------
@api_router.get("/")
async def root():
    return {"service": "SignLanguage Pro", "status": "ok"}


@api_router.post("/translate/video")
async def translate_video(
    file: UploadFile = File(...),
    mode: str = Form("video"),  # "video" or "live"
    duration: Optional[float] = Form(None),
):
    """Upload a short video clip; return AI sign-language translation."""
    suffix = ".webm"
    if file.filename and "." in file.filename:
        suffix = "." + file.filename.rsplit(".", 1)[-1].lower()

    mime_map = {
        ".webm": "video/webm",
        ".mp4": "video/mp4",
        ".mov": "video/quicktime",
        ".mkv": "video/x-matroska",
    }
    mime = mime_map.get(suffix, file.content_type or "video/webm")

    tmp = tempfile.NamedTemporaryFile(suffix=suffix, delete=False)
    try:
        shutil.copyfileobj(file.file, tmp)
        tmp.close()
        try:
            result = await call_gemini_video(tmp.name, mime)
        except Exception as e:
            logger.exception("Gemini video translation failed")
            raise HTTPException(status_code=502, detail=f"AI translation error: {str(e)}")

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
        return item
    finally:
        try:
            os.unlink(tmp.name)
        except Exception:
            pass


@api_router.post("/translate/text-to-sign", response_model=TextToSignResponse)
async def text_to_sign(payload: TextToSignRequest):
    """Convert text into a step-by-step sign-language description."""
    chat = LlmChat(
        api_key=EMERGENT_LLM_KEY,
        session_id=f"t2s-{uuid.uuid4()}",
        system_message=SIGN_SYSTEM_PROMPT,
    ).with_model("gemini", GEMINI_MODEL)

    target = payload.target_language or "auto"
    target_label = {
        "LSE": "Lengua de Signos Española (LSE)",
        "LSM": "Lengua de Signos Mexicana (LSM)",
        "ASL": "American Sign Language (ASL)",
        "auto": "la lengua de signos más común para hablantes de español (preferir LSE)",
    }.get(target, "auto")

    prompt = f"""Convierte el siguiente texto en una guía paso a paso para signarlo en {target_label}. Recuerda que el lenguaje de signos NO es solo manos: incluye también componentes orales (boca/labios), expresiones faciales y postura.

Texto a signar: "{payload.text}"

Responde EXCLUSIVAMENTE en JSON válido (sin markdown):
{{
  "language": "LSE|LSM|ASL|...",
  "summary": "resumen breve del mensaje y consejos generales",
  "steps": [
    {{
      "step": 1,
      "word": "palabra o frase",
      "hands": "configuración y movimiento de las manos",
      "mouth": "componente oral / movimiento de labios",
      "expression": "expresión facial necesaria (cejas, mirada)",
      "body": "postura o movimiento corporal"
    }}
  ]
}}"""

    raw = await chat.send_message(UserMessage(text=prompt))
    parsed = _parse_json(raw)

    response = TextToSignResponse(
        id=str(uuid.uuid4()),
        text=payload.text,
        language=parsed.get("language", target),
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

    return response


@api_router.get("/history", response_model=List[TranslationItem])
async def get_history(limit: int = 100):
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
    result = await db.translations.delete_one({"id": item_id})
    return {"deleted": result.deleted_count}


@api_router.delete("/history")
async def clear_history():
    result = await db.translations.delete_many({})
    return {"deleted": result.deleted_count}


# ---------- Dictionary (curated seed + AI fallback) ----------
SEED_DICTIONARY: List[DictionaryEntry] = [
    DictionaryEntry(
        word="Hola",
        language="LSE",
        description="Saludo básico, cordial.",
        hands="Mano dominante abierta a la altura de la sien, palma hacia adelante; deslizar hacia afuera con un pequeño arco.",
        mouth="Pronunciar silenciosamente 'hola'.",
        expression="Sonrisa suave, cejas neutras o ligeramente elevadas.",
    ),
    DictionaryEntry(
        word="Gracias",
        language="LSE",
        description="Expresión de agradecimiento.",
        hands="Yemas de los dedos de la mano dominante tocan el mentón y se mueven hacia adelante.",
        mouth="Articular 'gracias' silenciosamente.",
        expression="Sonrisa amable, mirada al receptor.",
    ),
    DictionaryEntry(
        word="Por favor",
        language="LSE",
        description="Petición cortés.",
        hands="Mano abierta sobre el pecho, movimiento circular suave.",
        mouth="Articular 'por favor'.",
        expression="Cejas levemente elevadas, mirada de petición.",
    ),
    DictionaryEntry(
        word="Sí",
        language="LSE",
        description="Afirmación.",
        hands="Mano cerrada con pulgar arriba o asentir con la cabeza acompañado de una 'S' dactilológica.",
        mouth="Cerrar y sellar los labios brevemente.",
        expression="Asentir con cabeza, cejas neutras.",
    ),
    DictionaryEntry(
        word="No",
        language="LSE",
        description="Negación.",
        hands="Dedos índice y corazón se cierran sobre el pulgar como un 'pico' que se abre y cierra.",
        mouth="Articular 'no'.",
        expression="Negar con la cabeza, cejas fruncidas leves.",
    ),
    DictionaryEntry(
        word="Te quiero",
        language="LSE",
        description="Expresión afectiva.",
        hands="Mano abierta toca el corazón y luego apunta al receptor.",
        mouth="Articular 'te quiero'.",
        expression="Sonrisa cálida, mirada directa.",
    ),
    DictionaryEntry(
        word="Ayuda",
        language="LSE",
        description="Pedir o ofrecer ayuda.",
        hands="Puño cerrado de la mano dominante apoyado sobre la palma horizontal de la otra; se elevan juntas.",
        mouth="Articular 'ayuda'.",
        expression="Cejas elevadas (interrogación) si se pide ayuda.",
    ),
    DictionaryEntry(
        word="Familia",
        language="LSE",
        description="Conjunto de personas unidas por parentesco.",
        hands="Ambas manos en forma de 'F' que se separan trazando un círculo horizontal.",
        mouth="Articular 'familia'.",
        expression="Neutra y cálida.",
    ),
    DictionaryEntry(
        word="Amigo",
        language="LSE",
        description="Persona de confianza.",
        hands="Índices de ambas manos enganchados, alternando posiciones.",
        mouth="Articular 'amigo'.",
        expression="Sonrisa.",
    ),
    DictionaryEntry(
        word="Buenos días",
        language="LSE",
        description="Saludo matutino.",
        hands="Mano abierta sale del mentón hacia adelante (bueno) seguida del signo de 'día' (mano horizontal que se eleva como sol).",
        mouth="Articular 'buenos días'.",
        expression="Sonrisa amable.",
    ),
    DictionaryEntry(
        word="Hello",
        language="ASL",
        description="Greeting (ASL).",
        hands="Flat hand at temple, palm out, moves forward and away in a small salute-like motion.",
        mouth="Mouth 'hello' silently.",
        expression="Smile, raised brows.",
    ),
    DictionaryEntry(
        word="Thank you",
        language="ASL",
        description="Thanks (ASL).",
        hands="Flat hand touches chin and moves forward toward the recipient.",
        mouth="Mouth 'thank you'.",
        expression="Soft smile, eye contact.",
    ),
    DictionaryEntry(
        word="Hola",
        language="LSM",
        description="Saludo (LSM).",
        hands="Mano abierta a la altura de la frente, palma hacia adelante, movimiento corto hacia afuera.",
        mouth="Articular 'hola'.",
        expression="Sonrisa.",
    ),
    DictionaryEntry(
        word="Amor",
        language="LSE",
        description="Sentimiento profundo de afecto.",
        hands="Ambas manos cerradas (puños) cruzadas sobre el pecho.",
        mouth="Articular 'amor'.",
        expression="Mirada suave, sonrisa leve.",
    ),
    DictionaryEntry(
        word="Casa",
        language="LSE",
        description="Vivienda.",
        hands="Manos planas formando un techo (dedos en punta tocándose) que luego bajan en paralelo formando paredes.",
        mouth="Articular 'casa'.",
        expression="Neutra.",
    ),
]


@api_router.get("/dictionary", response_model=List[DictionaryEntry])
async def list_dictionary(q: Optional[str] = None, language: Optional[str] = None):
    items = SEED_DICTIONARY
    if language and language != "all":
        items = [i for i in items if i.language.lower() == language.lower()]
    if q:
        ql = q.lower()
        items = [i for i in items if ql in i.word.lower() or ql in i.description.lower()]
    return items


@api_router.get("/dictionary/languages")
async def list_languages():
    langs = sorted({i.language for i in SEED_DICTIONARY})
    return {"languages": langs}


# Mount router
app.include_router(api_router)

app.add_middleware(
    CORSMiddleware,
    allow_credentials=True,
    allow_origins=os.environ.get("CORS_ORIGINS", "*").split(","),
    allow_methods=["*"],
    allow_headers=["*"],
)

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s - %(name)s - %(levelname)s - %(message)s",
)
logger = logging.getLogger(__name__)


@app.on_event("shutdown")
async def shutdown_db_client():
    client.close()
