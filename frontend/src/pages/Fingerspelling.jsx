import { useRef, useState } from "react";
import SignCamera from "../components/SignCamera";
import { Card } from "../components/ui/card";
import { Button } from "../components/ui/button";
import { Badge } from "../components/ui/badge";
import { Volume2, Copy, Type as TypeIcon } from "lucide-react";
import { translateFingerspelling } from "../lib/api";
import { toast } from "sonner";

export default function Fingerspelling() {
  const [busy, setBusy] = useState(false);
  const [word, setWord] = useState("");
  const [letters, setLetters] = useState([]);
  const [lang, setLang] = useState("");
  const bufferRef = useRef([]);

  async function handleFrames(frames) {
    if (!frames || frames.length < 4) return;
    setBusy(true);
    try {
      const res = await translateFingerspelling(frames);
      const w = (res.word || "").trim();
      if (w) {
        setWord(w);
        setLetters(res.letters || []);
        setLang(res.detected_language || "");
        try {
          const u = new SpeechSynthesisUtterance(w);
          u.lang = "es-ES";
          window.speechSynthesis.cancel();
          window.speechSynthesis.speak(u);
        } catch {}
      }
    } catch (e) {
      toast.error("Error", {
        description: e?.response?.data?.detail || e?.message,
      });
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="max-w-[1400px] mx-auto px-4 sm:px-8 py-8">
      <div className="flex items-start gap-3 mb-6">
        <span className="w-10 h-10 rounded-md bg-[#002FA7] text-white flex items-center justify-center shrink-0">
          <TypeIcon className="w-5 h-5" />
        </span>
        <div>
          <h1 className="font-display text-3xl sm:text-4xl font-semibold">
            Alfabeto dactilológico
          </h1>
          <p className="text-slate-600 dark:text-slate-300 mt-1">
            Deletrea con la mano frente a la cámara y la IA reconocerá las
            letras y la palabra completa.
          </p>
        </div>
      </div>

      <div className="grid lg:grid-cols-3 gap-6">
        <div className="lg:col-span-2">
          <SignCamera
            mode="streaming"
            frameRateMs={500}
            batchEvery={8}
            onFramesReady={handleFrames}
            busy={busy}
            statusText={busy && !word ? "Analizando…" : word}
            detectedLanguage={lang}
            testIdPrefix="abc"
          />
        </div>

        <Card className="p-5 border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 rounded-xl h-fit">
          <h2 className="font-display text-lg font-semibold mb-3">
            Resultado
          </h2>
          {!word && (
            <p className="text-sm text-slate-500">
              Empieza a deletrear y la palabra aparecerá aquí en tiempo real.
            </p>
          )}
          {word && (
            <>
              <div
                data-testid="abc-word"
                className="font-display text-3xl font-semibold tracking-wide mb-3"
              >
                {word}
              </div>
              <div className="flex flex-wrap gap-1.5 mb-4">
                {letters.map((l, i) => (
                  <Badge
                    key={i}
                    className="bg-slate-100 dark:bg-slate-800 text-slate-900 dark:text-slate-100 border-0 font-mono text-base px-3 py-1"
                  >
                    {l}
                  </Badge>
                ))}
              </div>
              <div className="flex gap-2">
                <Button
                  size="sm"
                  variant="ghost"
                  onClick={() => {
                    const u = new SpeechSynthesisUtterance(word);
                    u.lang = "es-ES";
                    window.speechSynthesis.cancel();
                    window.speechSynthesis.speak(u);
                  }}
                >
                  <Volume2 className="w-4 h-4 mr-1.5" /> Reproducir
                </Button>
                <Button
                  size="sm"
                  variant="ghost"
                  onClick={() => {
                    navigator.clipboard.writeText(word);
                    toast.success("Copiado");
                  }}
                >
                  <Copy className="w-4 h-4 mr-1.5" /> Copiar
                </Button>
              </div>
            </>
          )}
        </Card>
      </div>
    </div>
  );
}
