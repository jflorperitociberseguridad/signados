import { useState } from "react";
import SignCamera from "../components/SignCamera";
import { Card } from "../components/ui/card";
import { Button } from "../components/ui/button";
import { Badge } from "../components/ui/badge";
import { Switch } from "../components/ui/switch";
import { Label } from "../components/ui/label";
import { translateVideo } from "../lib/api";
import { toast } from "sonner";
import { Loader2, Trash2, Languages } from "lucide-react";

export default function LiveTranslation() {
  const [liveMode, setLiveMode] = useState(false);
  const [busy, setBusy] = useState(false);
  const [transcript, setTranscript] = useState([]); // [{text, lang, conf, notes, ts}]
  const [latest, setLatest] = useState("");
  const [detected, setDetected] = useState("");

  async function handleClipReady(blob, duration) {
    if (!blob || blob.size < 1000) return;
    setBusy(true);
    try {
      const res = await translateVideo(blob, {
        mode: liveMode ? "live" : "video",
        duration,
      });
      const text = (res.translated_text || "").trim();
      if (text) {
        setLatest(text);
        setDetected(res.detected_language || "");
        setTranscript((prev) => [
          {
            text,
            lang: res.detected_language,
            conf: res.confidence,
            notes: res.notes,
            ts: new Date().toLocaleTimeString(),
          },
          ...prev,
        ].slice(0, 50));
      } else {
        toast.message("Sin contenido detectado", {
          description: "Intenta nuevamente con mejor iluminación.",
        });
      }
    } catch (e) {
      const msg = e?.response?.data?.detail || e?.message || "Error";
      toast.error("Error al traducir", { description: msg });
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="max-w-[1400px] mx-auto px-4 sm:px-8 py-8">
      <div className="flex flex-wrap items-end justify-between gap-4 mb-6">
        <div>
          <h1 className="font-display text-3xl sm:text-4xl font-semibold text-slate-900">
            Traducción en vivo
          </h1>
          <p className="text-slate-600 mt-1">
            Graba un clip o activa el modo en vivo para que la IA interprete
            tus señas, labios y expresiones.
          </p>
        </div>
        <div className="flex items-center gap-3">
          <Label
            htmlFor="live-toggle"
            className="text-sm font-medium text-slate-700"
          >
            Modo en vivo (cada 5s)
          </Label>
          <Switch
            id="live-toggle"
            data-testid="live-mode-toggle"
            checked={liveMode}
            onCheckedChange={setLiveMode}
          />
        </div>
      </div>

      <div className="grid lg:grid-cols-3 gap-6">
        <div className="lg:col-span-2">
          <SignCamera
            liveMode={liveMode}
            clipDuration={5}
            onClipReady={handleClipReady}
            statusText={busy && !latest ? "Analizando…" : latest}
            detectedLanguage={detected}
            busy={busy}
            testIdPrefix="live"
          />

          <Card className="mt-5 p-5 border border-slate-200 bg-slate-50 rounded-xl">
            <div className="flex items-center gap-2 mb-2">
              <Languages className="w-4 h-4 text-slate-600" />
              <span className="text-sm font-medium text-slate-700">
                Última traducción
              </span>
              {detected && (
                <Badge className="bg-[#002FA7] text-white border-0 ml-auto">
                  {detected}
                </Badge>
              )}
            </div>
            <p
              data-testid="latest-translation-text"
              className="font-display text-xl sm:text-2xl text-slate-900 min-h-[2.5rem]"
            >
              {latest || (
                <span className="text-slate-400">
                  Aquí aparecerá tu traducción…
                </span>
              )}
            </p>
          </Card>
        </div>

        <Card className="p-5 border border-slate-200 bg-white rounded-xl h-fit lg:sticky lg:top-24">
          <div className="flex items-center justify-between mb-3">
            <h2 className="font-display text-lg font-semibold text-slate-900">
              Transcripción
            </h2>
            {transcript.length > 0 && (
              <Button
                data-testid="clear-transcript-button"
                variant="ghost"
                size="sm"
                onClick={() => setTranscript([])}
                className="text-slate-500 hover:text-slate-900"
              >
                <Trash2 className="w-4 h-4" />
              </Button>
            )}
          </div>

          {busy && (
            <div className="flex items-center gap-2 text-sm text-slate-500 mb-2">
              <Loader2 className="w-4 h-4 animate-spin" /> Procesando clip…
            </div>
          )}

          <div
            data-testid="transcript-list"
            className="max-h-[60vh] overflow-y-auto divide-y divide-slate-100"
          >
            {transcript.length === 0 ? (
              <p className="text-sm text-slate-500">
                Aún no hay traducciones. Comienza a grabar para verlas aquí.
              </p>
            ) : (
              transcript.map((t, i) => (
                <div key={i} className="py-3 fade-in-up">
                  <div className="flex items-center gap-2 text-xs text-slate-500 mb-1">
                    <span>{t.ts}</span>
                    {t.lang && (
                      <Badge
                        variant="outline"
                        className="text-[10px] py-0 px-1.5 h-auto"
                      >
                        {t.lang}
                      </Badge>
                    )}
                    {t.conf && (
                      <span className="text-[10px] uppercase tracking-wide text-slate-400">
                        Conf: {t.conf}
                      </span>
                    )}
                  </div>
                  <p className="text-slate-900 leading-snug">{t.text}</p>
                  {t.notes && (
                    <p className="text-xs text-slate-500 mt-1 italic">
                      {t.notes}
                    </p>
                  )}
                </div>
              ))
            )}
          </div>
        </Card>
      </div>
    </div>
  );
}
