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
    ImageContent,
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


class FramesRequest(BaseModel):
    frames: List[str]  # base64 jpeg/png (no data: prefix)
    mode: Optional[str] = "streaming"
    duration: Optional[float] = None


@api_router.post("/translate/frames")
async def translate_frames(payload: FramesRequest):
    """Translate a list of base64 image frames as a single sign language phrase."""
    if not payload.frames:
        raise HTTPException(status_code=400, detail="No frames provided")
    # cap to 12 frames to keep latency low
    frames = payload.frames[:12]

    chat = LlmChat(
        api_key=EMERGENT_LLM_KEY,
        session_id=f"frames-{uuid.uuid4()}",
        system_message=SIGN_SYSTEM_PROMPT,
    ).with_model("gemini", GEMINI_MODEL)

    file_contents = [ImageContent(image_base64=f) for f in frames]

    prompt = (
        "Estos fotogramas son una secuencia ordenada en el tiempo (de un video corto) "
        "de una persona signando. Considera manos, labios, expresiones y postura. "
        "Tradúcelo como una frase en español. Responde EXCLUSIVAMENTE JSON válido:\n"
        '{"translated_text":"...", "detected_language":"LSE|LSM|ASL|Otro|Desconocido", '
        '"confidence":"alta|media|baja", "notes":"breves"}'
    )

    try:
        raw = await chat.send_message(
            UserMessage(text=prompt, file_contents=file_contents)
        )
    except Exception as e:
        logger.exception("Gemini frames translation failed")
        raise HTTPException(status_code=502, detail=f"AI error: {e}")

    parsed = _parse_json(raw)
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
    return item


@api_router.post("/translate/fingerspelling")
async def translate_fingerspelling(payload: FramesRequest):
    """Recognize fingerspelled letters/words from a sequence of frames."""
    if not payload.frames:
        raise HTTPException(status_code=400, detail="No frames provided")
    frames = payload.frames[:14]

    chat = LlmChat(
        api_key=EMERGENT_LLM_KEY,
        session_id=f"abc-{uuid.uuid4()}",
        system_message=SIGN_SYSTEM_PROMPT,
    ).with_model("gemini", GEMINI_MODEL)

    file_contents = [ImageContent(image_base64=f) for f in frames]
    prompt = (
        "Estos fotogramas muestran a una persona deletreando con el alfabeto "
        "dactilológico (letra por letra). Identifica EXACTAMENTE la palabra o "
        "secuencia de letras formada. Si hay duda entre letras parecidas, ofrece "
        "tu mejor interpretación. Responde EXCLUSIVAMENTE JSON válido:\n"
        '{"letters":["A","B",...], "word":"palabra completa formada", '
        '"detected_language":"LSE|LSM|ASL|Otro", "confidence":"alta|media|baja", '
        '"notes":"observaciones"}'
    )

    try:
        raw = await chat.send_message(
            UserMessage(text=prompt, file_contents=file_contents)
        )
    except Exception as e:
        logger.exception("Gemini fingerspelling failed")
        raise HTTPException(status_code=502, detail=f"AI error: {e}")

    parsed = _parse_json(raw)
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
    return {
        "id": item.id,
        "word": word,
        "letters": parsed.get("letters", []),
        "detected_language": item.detected_language,
        "confidence": item.confidence,
        "notes": item.notes,
    }


@api_router.get("/translation/{item_id}", response_model=TranslationItem)
async def get_translation(item_id: str):
    doc = await db.translations.find_one({"id": item_id}, {"_id": 0})
    if not doc:
        raise HTTPException(status_code=404, detail="Not found")
    if isinstance(doc.get("created_at"), str):
        doc["created_at"] = datetime.fromisoformat(doc["created_at"])
    return doc


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
    # ---- LSE (Lengua de Signos Española) ----
    DictionaryEntry(word="Hola", language="LSE", description="Saludo cordial.", hands="Mano abierta a la altura de la sien, palma hacia adelante; deslizar afuera con un pequeño arco.", mouth="Articular 'hola' silenciosamente.", expression="Sonrisa suave, cejas neutras."),
    DictionaryEntry(word="Adiós", language="LSE", description="Despedida.", hands="Mano abierta a la altura de la cabeza moviendo los dedos como saludando, palma al frente.", mouth="Articular 'adiós'.", expression="Sonrisa amable."),
    DictionaryEntry(word="Gracias", language="LSE", description="Agradecimiento.", hands="Yemas de la mano dominante tocan el mentón y se mueven hacia adelante.", mouth="Articular 'gracias'.", expression="Sonrisa, mirada al receptor."),
    DictionaryEntry(word="Por favor", language="LSE", description="Petición cortés.", hands="Mano abierta sobre el pecho, movimiento circular suave.", mouth="Articular 'por favor'.", expression="Cejas levemente elevadas."),
    DictionaryEntry(word="Sí", language="LSE", description="Afirmación.", hands="Puño con pulgar arriba o 'S' dactilológica acompañada de asentimiento.", mouth="Sellar los labios brevemente.", expression="Asentir con la cabeza."),
    DictionaryEntry(word="No", language="LSE", description="Negación.", hands="Índice y corazón se cierran sobre el pulgar como un 'pico' que se abre y cierra.", mouth="Articular 'no'.", expression="Negar con la cabeza, ceño leve."),
    DictionaryEntry(word="Perdón", language="LSE", description="Disculpa.", hands="Puño cerrado, frota el pecho en círculos.", mouth="Articular 'perdón'.", expression="Cejas elevadas, mirada baja."),
    DictionaryEntry(word="Te quiero", language="LSE", description="Expresión afectiva.", hands="Mano abierta toca el corazón y luego apunta al receptor.", mouth="Articular 'te quiero'.", expression="Sonrisa cálida, mirada directa."),
    DictionaryEntry(word="Amor", language="LSE", description="Sentimiento profundo.", hands="Ambos puños cruzados sobre el pecho.", mouth="Articular 'amor'.", expression="Mirada suave, sonrisa leve."),
    DictionaryEntry(word="Familia", language="LSE", description="Conjunto familiar.", hands="Ambas manos en 'F' que se separan trazando un círculo horizontal.", mouth="Articular 'familia'.", expression="Cálida y neutra."),
    DictionaryEntry(word="Amigo", language="LSE", description="Persona de confianza.", hands="Índices de ambas manos enganchados, alternando posiciones.", mouth="Articular 'amigo'.", expression="Sonrisa."),
    DictionaryEntry(word="Ayuda", language="LSE", description="Pedir o ofrecer ayuda.", hands="Puño cerrado sobre la palma horizontal de la otra; ambas suben juntas.", mouth="Articular 'ayuda'.", expression="Cejas elevadas si se pide."),
    DictionaryEntry(word="Casa", language="LSE", description="Vivienda.", hands="Manos planas formando un techo y bajan en paralelo formando paredes.", mouth="Articular 'casa'.", expression="Neutra."),
    DictionaryEntry(word="Comer", language="LSE", description="Acción de alimentarse.", hands="Mano en pinza llevando los dedos repetidamente a la boca.", mouth="Mover los labios como masticando.", expression="Neutra."),
    DictionaryEntry(word="Beber", language="LSE", description="Acción de tomar líquido.", hands="Mano en forma de 'C' (vaso) inclinándose hacia la boca.", mouth="Como bebiendo.", expression="Neutra."),
    DictionaryEntry(word="Agua", language="LSE", description="Elemento líquido.", hands="Dedos juntos cayendo en zig-zag desde arriba como gotas.", mouth="Articular 'agua'.", expression="Neutra."),
    DictionaryEntry(word="Trabajo", language="LSE", description="Empleo o labor.", hands="Puños cerrados, uno golpea repetidamente sobre el otro.", mouth="Articular 'trabajo'.", expression="Concentrada."),
    DictionaryEntry(word="Estudiar", language="LSE", description="Aprender.", hands="Mano abierta sobre la palma de la otra, dedos se mueven como leyendo.", mouth="Articular 'estudiar'.", expression="Concentrada."),
    DictionaryEntry(word="Buenos días", language="LSE", description="Saludo matutino.", hands="Mano abierta sale del mentón hacia adelante (bueno) seguida del signo 'día' (mano horizontal que sube como un sol).", mouth="Articular 'buenos días'.", expression="Sonrisa."),
    DictionaryEntry(word="Buenas tardes", language="LSE", description="Saludo de tarde.", hands="'Bueno' seguido de 'tarde' (mano horizontal a media altura, palma abajo, ligero movimiento).", mouth="Articular 'buenas tardes'.", expression="Cálida."),
    DictionaryEntry(word="Buenas noches", language="LSE", description="Saludo nocturno.", hands="'Bueno' seguido de 'noche' (manos cruzadas que descienden con palmas hacia abajo).", mouth="Articular 'buenas noches'.", expression="Suave."),
    DictionaryEntry(word="¿Cómo estás?", language="LSE", description="Pregunta de estado.", hands="Manos a la altura del pecho, palmas arriba, oscilan alternadas.", mouth="Articular 'cómo estás'.", expression="Cejas fruncidas (pregunta), mirada interesada."),
    DictionaryEntry(word="Bien", language="LSE", description="Estar bien.", hands="Pulgar arriba de la mano dominante, ligero movimiento adelante.", mouth="Articular 'bien'.", expression="Sonrisa."),
    DictionaryEntry(word="Mal", language="LSE", description="Estar mal.", hands="Mano abierta gira de palma hacia arriba a palma hacia abajo con gesto descendente.", mouth="Articular 'mal'.", expression="Cejas fruncidas, boca hacia abajo."),
    DictionaryEntry(word="Yo", language="LSE", description="Pronombre personal.", hands="Índice apuntando al propio pecho.", mouth="Articular 'yo'.", expression="Neutra."),
    DictionaryEntry(word="Tú", language="LSE", description="Pronombre 2ª persona.", hands="Índice apuntando al receptor.", mouth="Articular 'tú'.", expression="Neutra, mirada al receptor."),
    DictionaryEntry(word="Nombre", language="LSE", description="Identificación personal.", hands="Índice y corazón de cada mano se cruzan en X dos veces.", mouth="Articular 'nombre'.", expression="Neutra."),
    DictionaryEntry(word="Aprender", language="LSE", description="Adquirir conocimiento.", hands="Mano agarra de la palma de la otra y se lleva a la frente.", mouth="Articular 'aprender'.", expression="Concentrada."),
    DictionaryEntry(word="Hablar", language="LSE", description="Comunicarse oralmente.", hands="Índice y corazón frente a la boca, movimiento alternado de salida.", mouth="Como hablando.", expression="Neutra."),
    DictionaryEntry(word="Escuchar", language="LSE", description="Recibir sonido.", hands="Mano en 'C' cerca de la oreja.", mouth="Levemente abierta.", expression="Atenta."),
    DictionaryEntry(word="Ver", language="LSE", description="Percibir con la vista.", hands="Índice y corazón en 'V' frente a los ojos, salen al frente.", mouth="Neutra.", expression="Atención visual."),
    DictionaryEntry(word="Hoy", language="LSE", description="Tiempo presente.", hands="Manos en 'Y' golpean ligeramente hacia abajo dos veces.", mouth="Articular 'hoy'.", expression="Neutra."),
    DictionaryEntry(word="Ayer", language="LSE", description="Día anterior.", hands="Pulgar de la mano dominante toca la mejilla y se mueve hacia atrás.", mouth="Articular 'ayer'.", expression="Neutra."),
    DictionaryEntry(word="Mañana", language="LSE", description="Día siguiente.", hands="Mano en 'A' (puño con pulgar visible) sale desde la mejilla hacia adelante.", mouth="Articular 'mañana'.", expression="Neutra."),
    DictionaryEntry(word="Tiempo", language="LSE", description="Concepto temporal.", hands="Índice golpea el dorso de la otra muñeca (como un reloj).", mouth="Articular 'tiempo'.", expression="Neutra."),
    DictionaryEntry(word="Sordo", language="LSE", description="Persona sorda.", hands="Índice toca oreja y luego boca.", mouth="Articular 'sordo'.", expression="Neutra."),
    DictionaryEntry(word="Oyente", language="LSE", description="Persona oyente.", hands="Índice frente a la boca describe pequeños círculos.", mouth="Articular 'oyente'.", expression="Neutra."),
    DictionaryEntry(word="Bonito", language="LSE", description="Algo agradable a la vista.", hands="Mano abierta pasa frente al rostro de afuera hacia el centro y se cierra en pinza.", mouth="Articular 'bonito'.", expression="Sonrisa, ojos abiertos."),
    DictionaryEntry(word="Feo", language="LSE", description="Algo desagradable.", hands="Mano frente al rostro se cierra en pinza con gesto rápido.", mouth="Boca arrugada.", expression="Ceño fruncido."),
    DictionaryEntry(word="Feliz", language="LSE", description="Estado de alegría.", hands="Manos planas suben alternadamente por el pecho.", mouth="Sonrisa amplia.", expression="Sonrisa."),
    DictionaryEntry(word="Triste", language="LSE", description="Estado de pena.", hands="Manos abiertas frente a la cara, dedos descienden.", mouth="Boca hacia abajo.", expression="Tristeza, cejas caídas."),
    DictionaryEntry(word="Querer", language="LSE", description="Desear.", hands="Mano cerrada toca el pecho y se abre hacia adelante.", mouth="Articular 'querer'.", expression="Mirada intensa."),
    DictionaryEntry(word="Necesitar", language="LSE", description="Tener necesidad.", hands="Índice doblado golpea hacia abajo dos veces.", mouth="Articular 'necesitar'.", expression="Cejas elevadas."),
    DictionaryEntry(word="Saber", language="LSE", description="Tener conocimiento.", hands="Yemas de los dedos tocan la frente.", mouth="Articular 'saber'.", expression="Neutra."),
    DictionaryEntry(word="Pensar", language="LSE", description="Reflexionar.", hands="Índice realiza pequeños círculos junto a la frente.", mouth="Cerrada.", expression="Concentrada."),
    DictionaryEntry(word="Médico", language="LSE", description="Profesional de la salud.", hands="Dedos en 'M' o palpando el pulso en la muñeca.", mouth="Articular 'médico'.", expression="Profesional."),
    DictionaryEntry(word="Hospital", language="LSE", description="Centro sanitario.", hands="Cruz dibujada con índice sobre el brazo no dominante.", mouth="Articular 'hospital'.", expression="Neutra."),
    DictionaryEntry(word="Coche", language="LSE", description="Automóvil.", hands="Ambas manos sujetan un volante imaginario y giran.", mouth="Articular 'coche'.", expression="Neutra."),
    DictionaryEntry(word="Niño", language="LSE", description="Persona menor.", hands="Mano horizontal, palma abajo, indica altura baja.", mouth="Articular 'niño'.", expression="Suave."),
    DictionaryEntry(word="Mujer", language="LSE", description="Persona de género femenino.", hands="Pulgar y dedos rozan la mejilla descendiendo.", mouth="Articular 'mujer'.", expression="Neutra."),
    DictionaryEntry(word="Hombre", language="LSE", description="Persona de género masculino.", hands="Pulgar toca la frente y sale al frente.", mouth="Articular 'hombre'.", expression="Neutra."),
    DictionaryEntry(word="Color", language="LSE", description="Atributo visual.", hands="Yemas frente a la barbilla vibran ligeramente.", mouth="Articular 'color'.", expression="Neutra."),
    DictionaryEntry(word="Rojo", language="LSE", description="Color rojo.", hands="Índice se desliza hacia abajo por los labios.", mouth="Articular 'rojo'.", expression="Neutra."),

    # ---- ASL (American Sign Language) ----
    DictionaryEntry(word="Hello", language="ASL", description="Greeting (ASL).", hands="Flat hand at temple, palm out, moves forward in a small salute.", mouth="Mouth 'hello' silently.", expression="Smile, raised brows."),
    DictionaryEntry(word="Thank you", language="ASL", description="Thanks (ASL).", hands="Flat hand touches chin and moves forward toward the recipient.", mouth="Mouth 'thank you'.", expression="Soft smile, eye contact."),
    DictionaryEntry(word="Yes", language="ASL", description="Affirmation.", hands="Fist nods up and down like a head nodding.", mouth="Slight nod.", expression="Affirmative."),
    DictionaryEntry(word="No", language="ASL", description="Negation.", hands="Index, middle and thumb close together quickly.", mouth="Mouth 'no'.", expression="Slight frown, head shake."),
    DictionaryEntry(word="Please", language="ASL", description="Polite request.", hands="Flat hand on chest, circular motion.", mouth="Mouth 'please'.", expression="Soft, raised brows."),
    DictionaryEntry(word="Sorry", language="ASL", description="Apology.", hands="Closed fist circles on chest.", mouth="Mouth 'sorry'.", expression="Apologetic, lowered brows."),
    DictionaryEntry(word="Love", language="ASL", description="Affection.", hands="Both fists crossed over the chest.", mouth="Mouth 'love'.", expression="Soft smile."),
    DictionaryEntry(word="Family", language="ASL", description="Family unit.", hands="Both 'F' hands trace a horizontal circle outward.", mouth="Mouth 'family'.", expression="Warm, neutral."),
    DictionaryEntry(word="Friend", language="ASL", description="Friend.", hands="Both index fingers hook together, then switch.", mouth="Mouth 'friend'.", expression="Smile."),
    DictionaryEntry(word="Help", language="ASL", description="Help.", hands="Closed fist on flat palm of other hand; both lift up together.", mouth="Mouth 'help'.", expression="Raised brows if requesting."),

    # ---- LSM (Lengua de Signos Mexicana) ----
    DictionaryEntry(word="Hola", language="LSM", description="Saludo (LSM).", hands="Mano abierta a la altura de la frente, palma hacia adelante, movimiento corto hacia afuera.", mouth="Articular 'hola'.", expression="Sonrisa."),
    DictionaryEntry(word="Gracias", language="LSM", description="Agradecimiento (LSM).", hands="Yemas en el mentón hacia adelante (similar a LSE).", mouth="Articular 'gracias'.", expression="Sonrisa."),
    DictionaryEntry(word="Por favor", language="LSM", description="Petición (LSM).", hands="Mano abierta circulando sobre el pecho.", mouth="Articular 'por favor'.", expression="Cejas elevadas."),
    DictionaryEntry(word="Amigo", language="LSM", description="Amigo (LSM).", hands="Pulgar e índice de cada mano se enganchan y giran.", mouth="Articular 'amigo'.", expression="Sonrisa."),
    DictionaryEntry(word="Familia", language="LSM", description="Familia (LSM).", hands="Ambas manos en 'F' formando círculo horizontal.", mouth="Articular 'familia'.", expression="Cálida."),
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
