import { useEffect, useState } from "react";
import { useParams, Link } from "react-router-dom";
import { Card } from "../components/ui/card";
import { Button } from "../components/ui/button";
import { Badge } from "../components/ui/badge";
import { Volume2, Copy, Hand, ArrowLeft } from "lucide-react";
import { getTranslation } from "../lib/api";
import { toast } from "sonner";

const fmt = (iso) => {
  try {
    return new Date(iso).toLocaleString();
  } catch {
    return iso;
  }
};

export default function SharePage() {
  const { id } = useParams();
  const [item, setItem] = useState(null);
  const [error, setError] = useState("");

  useEffect(() => {
    getTranslation(id)
      .then(setItem)
      .catch((e) =>
        setError(
          e?.response?.status === 404
            ? "Esta traducción no existe o fue eliminada."
            : "No se pudo cargar la traducción.",
        ),
      );
  }, [id]);

  function speak() {
    if (!item) return;
    try {
      const u = new SpeechSynthesisUtterance(item.translated_text);
      u.lang = "es-ES";
      window.speechSynthesis.cancel();
      window.speechSynthesis.speak(u);
    } catch {}
  }

  return (
    <div className="max-w-2xl mx-auto px-4 sm:px-8 py-12">
      <Link
        to="/"
        className="inline-flex items-center gap-1.5 text-sm text-slate-600 dark:text-slate-300 hover:text-[#002FA7] mb-6"
      >
        <ArrowLeft className="w-4 h-4" /> Volver
      </Link>

      <Card className="p-8 border border-slate-200 dark:border-slate-700 rounded-2xl bg-white dark:bg-slate-900">
        <div className="flex items-center gap-2 mb-4">
          <span className="w-9 h-9 rounded-md bg-[#002FA7] text-white flex items-center justify-center">
            <Hand className="w-5 h-5" />
          </span>
          <span className="font-display font-semibold">SignLanguage Pro</span>
        </div>

        {error && (
          <p data-testid="share-error" className="text-red-600">
            {error}
          </p>
        )}

        {item && (
          <>
            <div className="text-xs uppercase tracking-wide text-slate-500 mb-2">
              Traducción · {fmt(item.created_at)}
            </div>
            <h1
              data-testid="share-text"
              className="font-display text-3xl sm:text-4xl font-semibold leading-tight"
            >
              {item.translated_text}
            </h1>
            <div className="mt-4 flex flex-wrap items-center gap-2">
              {item.detected_language && (
                <Badge className="bg-[#002FA7] text-white border-0">
                  {item.detected_language}
                </Badge>
              )}
              {item.confidence && (
                <Badge variant="outline" className="border-slate-300">
                  Confianza: {item.confidence}
                </Badge>
              )}
              {item.mode && (
                <Badge variant="outline" className="border-slate-300">
                  {item.mode}
                </Badge>
              )}
            </div>
            {item.notes && (
              <p className="mt-4 text-sm text-slate-600 dark:text-slate-300 italic">
                {item.notes}
              </p>
            )}
            <div className="mt-6 flex gap-2">
              <Button onClick={speak} className="btn-ikb">
                <Volume2 className="w-4 h-4 mr-2" /> Reproducir
              </Button>
              <Button
                variant="outline"
                onClick={() => {
                  navigator.clipboard.writeText(item.translated_text);
                  toast.success("Texto copiado");
                }}
              >
                <Copy className="w-4 h-4 mr-2" /> Copiar
              </Button>
            </div>
          </>
        )}
      </Card>
    </div>
  );
}
