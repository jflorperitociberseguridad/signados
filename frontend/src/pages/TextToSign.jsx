import { useState } from "react";
import { Card } from "../components/ui/card";
import { Button } from "../components/ui/button";
import { Textarea } from "../components/ui/textarea";
import { Badge } from "../components/ui/badge";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "../components/ui/select";
import { textToSign } from "../lib/api";
import { toast } from "sonner";
import { Hand, Smile, Eye, User, Loader2, Sparkles } from "lucide-react";

const LANGS = [
  { value: "auto", label: "Detección automática" },
  { value: "LSE", label: "LSE — Española" },
  { value: "LSM", label: "LSM — Mexicana" },
  { value: "ASL", label: "ASL — Americana" },
];

export default function TextToSign() {
  const [text, setText] = useState("");
  const [lang, setLang] = useState("auto");
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState(null);

  async function handleSubmit() {
    if (!text.trim()) return;
    setBusy(true);
    try {
      const res = await textToSign(text.trim(), lang);
      setResult(res);
    } catch (e) {
      const msg = e?.response?.data?.detail || e?.message || "Error";
      toast.error("Error al generar", { description: msg });
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="max-w-[1400px] mx-auto px-4 sm:px-8 py-8">
      <h1 className="font-display text-3xl sm:text-4xl font-semibold text-slate-900">
        Texto a signos
      </h1>
      <p className="text-slate-600 mt-1 mb-6">
        Escribe lo que quieres decir y la IA generará una guía paso a paso con
        manos, labios, expresiones y postura.
      </p>

      <div className="grid lg:grid-cols-5 gap-6">
        <Card className="lg:col-span-2 p-6 border border-slate-200 bg-white rounded-xl h-fit">
          <label className="text-sm font-medium text-slate-700 mb-2 block">
            Idioma de signos
          </label>
          <Select value={lang} onValueChange={setLang}>
            <SelectTrigger
              data-testid="t2s-lang-select"
              className="mb-4 border-slate-300"
            >
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {LANGS.map((l) => (
                <SelectItem key={l.value} value={l.value}>
                  {l.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>

          <label className="text-sm font-medium text-slate-700 mb-2 block">
            Texto a signar
          </label>
          <Textarea
            data-testid="t2s-text-input"
            value={text}
            onChange={(e) => setText(e.target.value)}
            placeholder="Escribe para traducir a lenguaje de signos…"
            rows={5}
            className="border-slate-300 resize-none"
          />

          <Button
            data-testid="t2s-generate-button"
            onClick={handleSubmit}
            disabled={busy || !text.trim()}
            className="btn-ikb w-full mt-4 h-11"
          >
            {busy ? (
              <>
                <Loader2 className="w-4 h-4 mr-2 animate-spin" /> Generando…
              </>
            ) : (
              <>
                <Sparkles className="w-4 h-4 mr-2" /> Generar guía
              </>
            )}
          </Button>

          <div className="mt-5 pt-5 border-t border-slate-100">
            <p className="text-xs text-slate-500 mb-2 font-medium">
              Pruébalo con:
            </p>
            <div className="flex flex-wrap gap-2">
              {["Hola, ¿cómo estás?", "Te quiero mucho", "Necesito ayuda, por favor"].map(
                (s) => (
                  <button
                    key={s}
                    type="button"
                    data-testid={`t2s-sample-${s.length}`}
                    onClick={() => setText(s)}
                    className="text-xs px-3 py-1.5 rounded-full border border-slate-200 text-slate-700 hover:border-[#002FA7] hover:text-[#002FA7] transition-colors duration-200"
                  >
                    {s}
                  </button>
                ),
              )}
            </div>
          </div>
        </Card>

        <div className="lg:col-span-3">
          {!result && !busy && (
            <Card className="p-10 border border-dashed border-slate-300 bg-slate-50 rounded-xl text-center">
              <Sparkles className="w-10 h-10 mx-auto text-slate-400 mb-3" />
              <h3 className="font-display text-lg font-semibold text-slate-900">
                La guía aparecerá aquí
              </h3>
              <p className="text-sm text-slate-600 mt-1">
                Escribe arriba y pulsa "Generar guía".
              </p>
            </Card>
          )}

          {busy && (
            <Card className="p-10 border border-slate-200 bg-white rounded-xl text-center">
              <Loader2 className="w-10 h-10 mx-auto text-[#002FA7] mb-3 animate-spin" />
              <p className="text-slate-700 font-medium">
                Generando guía paso a paso…
              </p>
            </Card>
          )}

          {result && !busy && (
            <div className="space-y-4">
              <Card className="p-5 border border-slate-200 bg-slate-50 rounded-xl">
                <div className="flex items-center justify-between gap-2 mb-2">
                  <span className="text-sm font-medium text-slate-600">
                    Resumen
                  </span>
                  <Badge className="bg-[#002FA7] text-white border-0">
                    {result.language}
                  </Badge>
                </div>
                <p
                  data-testid="t2s-summary"
                  className="font-display text-lg text-slate-900 leading-snug"
                >
                  {result.summary}
                </p>
              </Card>

              <div data-testid="t2s-steps" className="space-y-3">
                {result.steps?.map((s, i) => (
                  <Card
                    key={i}
                    className="p-5 border border-slate-200 bg-white rounded-xl fade-in-up"
                  >
                    <div className="flex items-baseline gap-3 mb-3">
                      <span className="font-display text-2xl font-semibold text-[#002FA7]">
                        {String(s.step ?? i + 1).padStart(2, "0")}
                      </span>
                      <h3 className="font-display text-xl font-semibold text-slate-900">
                        {s.word}
                      </h3>
                    </div>
                    <div className="grid sm:grid-cols-2 gap-3">
                      <Detail icon={Hand} label="Manos" text={s.hands} />
                      <Detail icon={Smile} label="Boca / labios" text={s.mouth} />
                      <Detail icon={Eye} label="Expresión" text={s.expression} />
                      <Detail icon={User} label="Postura" text={s.body} />
                    </div>
                  </Card>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

const Detail = ({ icon: Icon, label, text }) => (
  <div className="flex items-start gap-3">
    <span className="w-8 h-8 rounded-md bg-slate-100 text-slate-700 flex items-center justify-center shrink-0">
      <Icon className="w-4 h-4" />
    </span>
    <div className="min-w-0">
      <div className="text-xs uppercase tracking-wide text-slate-500 font-medium">
        {label}
      </div>
      <p className="text-sm text-slate-800 leading-snug">
        {text || <span className="text-slate-400">—</span>}
      </p>
    </div>
  </div>
);
