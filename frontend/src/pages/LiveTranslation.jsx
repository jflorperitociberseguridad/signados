import { useEffect, useState, useRef } from "react";
import SignCamera from "../components/SignCamera";
import { Card } from "../components/ui/card";
import { Button } from "../components/ui/button";
import { Badge } from "../components/ui/badge";
import { Switch } from "../components/ui/switch";
import { Label } from "../components/ui/label";
import { translateVideo, translateFrames } from "../lib/api";
import { exportConversationPDF } from "../lib/pdf";
import { toast } from "sonner";
import {
  Loader2,
  Trash2,
  Languages,
  Volume2,
  VolumeX,
  Upload,
  Share2,
  Copy,
  FileDown,
  Activity,
} from "lucide-react";

const SPEEDS = [
  { id: "stream", label: "Streaming", help: "Frames continuos cada 0.4s" },
  { id: "fast", label: "Rápido", help: "Clips de 2 segundos" },
  { id: "std", label: "Estándar", help: "Clips de 5 segundos" },
  { id: "manual", label: "Manual", help: "Grabar bajo demanda" },
];

function speak(text) {
  try {
    if (!("speechSynthesis" in window)) return;
    window.speechSynthesis.cancel();
    const u = new SpeechSynthesisUtterance(text);
    u.lang = "es-ES";
    u.rate = 1;
    u.pitch = 1;
    window.speechSynthesis.speak(u);
  } catch {}
}

export default function LiveTranslation() {
  const [speed, setSpeed] = useState("fast");
  const [busy, setBusy] = useState(false);
  const [transcript, setTranscript] = useState([]);
  const [latest, setLatest] = useState("");
  const [detected, setDetected] = useState("");
  const [tts, setTts] = useState(true);
  const [skeleton, setSkeleton] = useState(true);
  const [motionGated, setMotionGated] = useState(false);
  const fileInput = useRef(null);

  const camMode =
    speed === "manual" ? "manual" : speed === "stream" ? "streaming" : "live";
  const clipDuration = speed === "fast" ? 2 : speed === "std" ? 5 : 5;

  // stop tts on unmount
  useEffect(() => {
    return () => {
      try {
        window.speechSynthesis?.cancel();
      } catch {}
    };
  }, []);

  function pushItem(res) {
    const text = (res.translated_text || "").trim();
    if (!text) return;
    setLatest(text);
    setDetected(res.detected_language || "");
    if (tts) speak(text);
    setTranscript((prev) =>
      [
        {
          id: res.id,
          text,
          lang: res.detected_language,
          conf: res.confidence,
          notes: res.notes,
          ts: new Date().toLocaleTimeString(),
        },
        ...prev,
      ].slice(0, 80),
    );
  }

  async function handleClipReady(blob, duration) {
    if (!blob || blob.size < 1500) return;
    setBusy(true);
    try {
      const res = await translateVideo(blob, {
        mode: camMode === "live" ? "live" : "video",
        duration,
      });
      pushItem(res);
    } catch (e) {
      toast.error("Error al traducir", {
        description: e?.response?.data?.detail || e?.message || "Error",
      });
    } finally {
      setBusy(false);
    }
  }

  async function handleFramesReady(frames, duration) {
    if (!frames || frames.length < 3) return;
    setBusy(true);
    try {
      const res = await translateFrames(frames, { duration });
      pushItem(res);
    } catch (e) {
      toast.error("Error al traducir", {
        description: e?.response?.data?.detail || e?.message || "Error",
      });
    } finally {
      setBusy(false);
    }
  }

  async function handleFileUpload(e) {
    const f = e.target.files?.[0];
    if (!f) return;
    if (!f.type.startsWith("video/")) {
      toast.error("Por favor selecciona un archivo de video.");
      return;
    }
    setBusy(true);
    try {
      const res = await translateVideo(f, { mode: "video" });
      pushItem(res);
      toast.success("Video traducido");
    } catch (err) {
      toast.error("Error al subir", {
        description: err?.response?.data?.detail || err?.message,
      });
    } finally {
      setBusy(false);
      e.target.value = "";
    }
  }

  function shareItem(it) {
    const url = `${window.location.origin}/t/${it.id}`;
    if (navigator.share) {
      navigator
        .share({ title: "Traducción de signos", text: it.text, url })
        .catch(() => {});
    } else {
      navigator.clipboard.writeText(url);
      toast.success("Enlace copiado");
    }
  }

  return (
    <div className="max-w-[1400px] mx-auto px-4 sm:px-8 py-8">
      <div className="flex flex-wrap items-end justify-between gap-4 mb-5">
        <div>
          <h1 className="font-display text-3xl sm:text-4xl font-semibold">
            Traducción en vivo
          </h1>
          <p className="text-slate-600 dark:text-slate-300 mt-1">
            Modo directo: la IA traduce continuamente, sin esperas.
          </p>
        </div>
        <div className="flex items-center gap-4">
          <div className="flex items-center gap-2">
            <Label className="text-sm font-medium">Voz</Label>
            <Switch
              data-testid="tts-toggle"
              checked={tts}
              onCheckedChange={setTts}
            />
            {tts ? (
              <Volume2 className="w-4 h-4 text-[#002FA7]" />
            ) : (
              <VolumeX className="w-4 h-4 text-slate-400" />
            )}
          </div>
          <Button
            data-testid="upload-video-button"
            variant="outline"
            onClick={() => fileInput.current?.click()}
            className="border-slate-300 dark:border-slate-700"
          >
            <Upload className="w-4 h-4 mr-2" /> Subir video
          </Button>
          <input
            ref={fileInput}
            type="file"
            accept="video/*"
            className="hidden"
            onChange={handleFileUpload}
            data-testid="upload-video-input"
          />
        </div>
      </div>

      {/* Speed selector */}
      <div
        data-testid="speed-selector"
        className="grid grid-cols-2 sm:grid-cols-4 gap-2 mb-3 p-1 rounded-xl bg-slate-100 dark:bg-slate-800/50 border border-slate-200 dark:border-slate-700"
      >
        {SPEEDS.map((s) => (
          <button
            key={s.id}
            data-testid={`speed-${s.id}`}
            onClick={() => setSpeed(s.id)}
            className={`text-left px-3 py-2 rounded-lg transition-all duration-200 ${
              speed === s.id
                ? "bg-[#002FA7] text-white shadow-sm"
                : "text-slate-700 dark:text-slate-300 hover:bg-white dark:hover:bg-slate-800"
            }`}
          >
            <div className="text-sm font-semibold">{s.label}</div>
            <div
              className={`text-[11px] ${
                speed === s.id ? "text-white/80" : "text-slate-500"
              }`}
            >
              {s.help}
            </div>
          </button>
        ))}
      </div>

      {/* MediaPipe toggles */}
      <div className="flex flex-wrap items-center gap-4 mb-5 px-1">
        <div className="flex items-center gap-2">
          <Switch
            data-testid="skeleton-toggle"
            checked={skeleton}
            onCheckedChange={setSkeleton}
            id="skeleton-toggle"
          />
          <Label
            htmlFor="skeleton-toggle"
            className="text-sm flex items-center gap-1.5 cursor-pointer"
          >
            <Activity className="w-3.5 h-3.5" /> Esqueleto MediaPipe (sin latencia)
          </Label>
        </div>
        <div className="flex items-center gap-2">
          <Switch
            data-testid="motion-gated-toggle"
            checked={motionGated}
            onCheckedChange={setMotionGated}
            id="motion-gated"
            disabled={!skeleton}
          />
          <Label
            htmlFor="motion-gated"
            className={`text-sm cursor-pointer ${
              !skeleton ? "opacity-50" : ""
            }`}
          >
            Solo enviar a IA cuando haya movimiento
          </Label>
        </div>
        {transcript.length > 0 && (
          <Button
            data-testid="export-pdf-button"
            variant="outline"
            size="sm"
            onClick={() =>
              exportConversationPDF(
                transcript.map((t) => ({
                  from: "user",
                  text: t.text,
                  lang: t.lang,
                  ts: t.ts,
                })),
                { title: "Transcripción – Traducción en vivo" },
              )
            }
            className="ml-auto border-slate-300 dark:border-slate-700"
          >
            <FileDown className="w-4 h-4 mr-2" /> Exportar PDF
          </Button>
        )}
      </div>

      <div className="grid lg:grid-cols-3 gap-6">
        <div className="lg:col-span-2">
          <SignCamera
            mode={camMode}
            clipDuration={clipDuration}
            frameRateMs={400}
            batchEvery={6}
            showSkeleton={skeleton}
            motionGated={motionGated}
            onClipReady={handleClipReady}
            onFramesReady={handleFramesReady}
            statusText={busy && !latest ? "Analizando…" : latest}
            detectedLanguage={detected}
            busy={busy}
            testIdPrefix="live"
          />

          <Card className="mt-5 p-5 border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-900/40 rounded-xl">
            <div className="flex items-center gap-2 mb-2">
              <Languages className="w-4 h-4 text-slate-600 dark:text-slate-400" />
              <span className="text-sm font-medium text-slate-700 dark:text-slate-300">
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
              className="font-display text-xl sm:text-2xl min-h-[2.5rem]"
            >
              {latest || (
                <span className="text-slate-400">
                  Aquí aparecerá tu traducción…
                </span>
              )}
            </p>
            {latest && (
              <div className="mt-3 flex flex-wrap gap-2">
                <Button
                  size="sm"
                  variant="ghost"
                  onClick={() => speak(latest)}
                  data-testid="latest-speak"
                >
                  <Volume2 className="w-4 h-4 mr-1.5" /> Leer en voz alta
                </Button>
                <Button
                  size="sm"
                  variant="ghost"
                  onClick={() => navigator.clipboard.writeText(latest)}
                  data-testid="latest-copy"
                >
                  <Copy className="w-4 h-4 mr-1.5" /> Copiar
                </Button>
              </div>
            )}
          </Card>
        </div>

        <Card className="p-5 border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 rounded-xl h-fit lg:sticky lg:top-24">
          <div className="flex items-center justify-between mb-3">
            <h2 className="font-display text-lg font-semibold">
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
              <Loader2 className="w-4 h-4 animate-spin" /> Procesando…
            </div>
          )}

          <div
            data-testid="transcript-list"
            className="max-h-[60vh] overflow-y-auto divide-y divide-slate-100 dark:divide-slate-800"
          >
            {transcript.length === 0 ? (
              <p className="text-sm text-slate-500">
                Aún no hay traducciones. Comienza a grabar para verlas aquí.
              </p>
            ) : (
              transcript.map((t, i) => (
                <div key={t.id || i} className="py-3 fade-in-up group">
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
                    <div className="ml-auto flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                      <button
                        onClick={() => speak(t.text)}
                        className="p-1 rounded hover:bg-slate-100 dark:hover:bg-slate-800"
                        aria-label="Leer en voz alta"
                      >
                        <Volume2 className="w-3.5 h-3.5" />
                      </button>
                      {t.id && (
                        <button
                          onClick={() => shareItem(t)}
                          className="p-1 rounded hover:bg-slate-100 dark:hover:bg-slate-800"
                          aria-label="Compartir"
                        >
                          <Share2 className="w-3.5 h-3.5" />
                        </button>
                      )}
                    </div>
                  </div>
                  <p className="leading-snug">{t.text}</p>
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
