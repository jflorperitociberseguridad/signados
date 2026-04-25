"""Curated multi-language sign dictionary."""
from __future__ import annotations

from typing import List

from pydantic import BaseModel


class DictionaryEntry(BaseModel):
    word: str
    language: str
    description: str
    hands: str
    mouth: str
    expression: str


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
    # ---- ASL ----
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
    # ---- LSM ----
    DictionaryEntry(word="Hola", language="LSM", description="Saludo (LSM).", hands="Mano abierta a la altura de la frente, palma hacia adelante, movimiento corto hacia afuera.", mouth="Articular 'hola'.", expression="Sonrisa."),
    DictionaryEntry(word="Gracias", language="LSM", description="Agradecimiento (LSM).", hands="Yemas en el mentón hacia adelante (similar a LSE).", mouth="Articular 'gracias'.", expression="Sonrisa."),
    DictionaryEntry(word="Por favor", language="LSM", description="Petición (LSM).", hands="Mano abierta circulando sobre el pecho.", mouth="Articular 'por favor'.", expression="Cejas elevadas."),
    DictionaryEntry(word="Amigo", language="LSM", description="Amigo (LSM).", hands="Pulgar e índice de cada mano se enganchan y giran.", mouth="Articular 'amigo'.", expression="Sonrisa."),
    DictionaryEntry(word="Familia", language="LSM", description="Familia (LSM).", hands="Ambas manos en 'F' formando círculo horizontal.", mouth="Articular 'familia'.", expression="Cálida."),
]
