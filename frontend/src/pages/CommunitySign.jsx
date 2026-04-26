import { useEffect, useState } from "react";
import { Card } from "../components/ui/card";
import { Button } from "../components/ui/button";
import { Badge } from "../components/ui/badge";
import { Input } from "../components/ui/input";
import { Textarea } from "../components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "../components/ui/select";
import { Send, Users, Sparkles, Loader2 } from "lucide-react";
import { submitCommunitySign, getCommunitySigns } from "../lib/api";
import { toast } from "sonner";

const LANGS = ["LSE", "LSM", "ASL", "LIBRAS", "LSF", "Otro"];

export default function CommunitySign() {
  const [form, setForm] = useState({
    word: "",
    language: "LSE",
    description: "",
    hands: "",
    mouth: "",
    expression: "",
    submitted_by: "",
  });
  const [busy, setBusy] = useState(false);
  const [community, setCommunity] = useState([]);

  useEffect(() => {
    getCommunitySigns("approved").then(setCommunity).catch(() => {});
  }, []);

  const submit = async () => {
    if (!form.word || !form.description || !form.hands) {
      toast.error("Faltan campos obligatorios");
      return;
    }
    setBusy(true);
    try {
      await submitCommunitySign(form);
      toast.success("¡Gracias por tu aportación!", {
        description: "Tu signo entrará al diccionario tras revisión.",
      });
      setForm({
        word: "",
        language: "LSE",
        description: "",
        hands: "",
        mouth: "",
        expression: "",
        submitted_by: "",
      });
    } catch (e) {
      toast.error("Error al enviar", {
        description: e?.response?.data?.detail || e?.message,
      });
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="max-w-[1400px] mx-auto px-4 sm:px-8 py-8">
      <div className="flex items-start gap-3 mb-6">
        <span className="w-10 h-10 rounded-md bg-[#002FA7] text-white flex items-center justify-center shrink-0">
          <Users className="w-5 h-5" />
        </span>
        <div>
          <h1 className="font-display text-3xl sm:text-4xl font-semibold">
            Diccionario colaborativo
          </h1>
          <p className="text-slate-600 dark:text-slate-300 mt-1">
            ¿Conoces un signo que falta? Añádelo y ayuda a que la app aprenda.
          </p>
        </div>
      </div>

      <div className="grid lg:grid-cols-2 gap-6">
        <Card className="p-6 border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 rounded-xl">
          <h2 className="font-display text-xl font-semibold mb-4">
            Proponer un signo
          </h2>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <Field label="Palabra*">
              <Input
                value={form.word}
                onChange={(e) => setForm({ ...form, word: e.target.value })}
                data-testid="cm-word"
                placeholder="Ej: Saludar"
              />
            </Field>
            <Field label="Idioma*">
              <Select
                value={form.language}
                onValueChange={(v) => setForm({ ...form, language: v })}
              >
                <SelectTrigger data-testid="cm-language">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {LANGS.map((l) => (
                    <SelectItem key={l} value={l}>
                      {l}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </Field>
          </div>
          <Field label="Descripción*">
            <Textarea
              rows={2}
              value={form.description}
              onChange={(e) => setForm({ ...form, description: e.target.value })}
              data-testid="cm-description"
              placeholder="Significado y contexto"
            />
          </Field>
          <Field label="Manos*">
            <Textarea
              rows={2}
              value={form.hands}
              onChange={(e) => setForm({ ...form, hands: e.target.value })}
              data-testid="cm-hands"
              placeholder="Configuración, ubicación y movimiento"
            />
          </Field>
          <Field label="Boca / labios">
            <Input
              value={form.mouth}
              onChange={(e) => setForm({ ...form, mouth: e.target.value })}
              data-testid="cm-mouth"
              placeholder="Componente oral"
            />
          </Field>
          <Field label="Expresión">
            <Input
              value={form.expression}
              onChange={(e) => setForm({ ...form, expression: e.target.value })}
              data-testid="cm-expression"
              placeholder="Cejas, mirada, etc."
            />
          </Field>
          <Field label="Tu nombre o alias (opcional)">
            <Input
              value={form.submitted_by}
              onChange={(e) =>
                setForm({ ...form, submitted_by: e.target.value })
              }
              data-testid="cm-submitter"
              placeholder="Anónimo"
            />
          </Field>
          <Button
            data-testid="cm-submit"
            onClick={submit}
            disabled={busy}
            className="btn-ikb mt-4 h-11 w-full"
          >
            {busy ? (
              <>
                <Loader2 className="w-4 h-4 mr-2 animate-spin" /> Enviando…
              </>
            ) : (
              <>
                <Send className="w-4 h-4 mr-2" /> Enviar para revisión
              </>
            )}
          </Button>
        </Card>

        <Card className="p-6 border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-900/40 rounded-xl">
          <div className="flex items-center justify-between mb-4">
            <h2 className="font-display text-xl font-semibold flex items-center gap-2">
              <Sparkles className="w-4 h-4 text-[#002FA7]" /> Aprobados por la
              comunidad
            </h2>
            <Badge variant="outline">{community.length}</Badge>
          </div>
          {community.length === 0 ? (
            <p className="text-sm text-slate-500">
              Aún no hay signos comunitarios aprobados. ¡Sé el primero!
            </p>
          ) : (
            <ul className="space-y-3">
              {community.map((c) => (
                <li
                  key={c.id}
                  className="p-3 rounded-lg bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700"
                >
                  <div className="flex items-baseline gap-2 mb-1">
                    <span className="font-display font-semibold">
                      {c.word}
                    </span>
                    <Badge className="bg-[#002FA7] text-white border-0 text-[10px]">
                      {c.language}
                    </Badge>
                    {c.submitted_by && (
                      <span className="text-xs text-slate-500 ml-auto">
                        por {c.submitted_by}
                      </span>
                    )}
                  </div>
                  <p className="text-sm text-slate-600 dark:text-slate-300">
                    {c.description}
                  </p>
                </li>
              ))}
            </ul>
          )}
        </Card>
      </div>
    </div>
  );
}

const Field = ({ label, children }) => (
  <div className="mt-3">
    <label className="text-xs font-medium uppercase tracking-wide text-slate-500 mb-1 block">
      {label}
    </label>
    {children}
  </div>
);
