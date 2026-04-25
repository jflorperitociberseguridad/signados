import { useEffect, useState } from "react";
import { Card } from "../components/ui/card";
import { Input } from "../components/ui/input";
import { Badge } from "../components/ui/badge";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "../components/ui/select";
import { Hand, Smile, Eye, Search, BookOpen } from "lucide-react";
import { getDictionary, getLanguages } from "../lib/api";

export default function Dictionary() {
  const [q, setQ] = useState("");
  const [lang, setLang] = useState("all");
  const [items, setItems] = useState([]);
  const [langs, setLangs] = useState([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    getLanguages().then(setLangs).catch(() => {});
  }, []);

  useEffect(() => {
    setLoading(true);
    const t = setTimeout(() => {
      getDictionary({ q, language: lang })
        .then(setItems)
        .finally(() => setLoading(false));
    }, 200);
    return () => clearTimeout(t);
  }, [q, lang]);

  return (
    <div className="max-w-[1400px] mx-auto px-4 sm:px-8 py-8">
      <div className="flex items-start gap-3 mb-6">
        <span className="w-10 h-10 rounded-md bg-[#002FA7] text-white flex items-center justify-center shrink-0">
          <BookOpen className="w-5 h-5" />
        </span>
        <div>
          <h1 className="font-display text-3xl sm:text-4xl font-semibold text-slate-900">
            Diccionario de signos
          </h1>
          <p className="text-slate-600 mt-1">
            Explora signos comunes con descripción detallada de manos, boca y
            expresión facial.
          </p>
        </div>
      </div>

      <div className="flex flex-col sm:flex-row gap-3 mb-6">
        <div className="relative flex-1">
          <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
          <Input
            data-testid="dict-search-input"
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Buscar signo (hola, gracias…)"
            className="pl-9 h-11 border-slate-300"
          />
        </div>
        <Select value={lang} onValueChange={setLang}>
          <SelectTrigger
            data-testid="dict-lang-select"
            className="sm:w-56 h-11 border-slate-300"
          >
            <SelectValue placeholder="Idioma" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Todos los idiomas</SelectItem>
            {langs.map((l) => (
              <SelectItem key={l} value={l}>
                {l}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      <div
        data-testid="dict-grid"
        className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4"
      >
        {loading && items.length === 0 && (
          <div className="col-span-full text-sm text-slate-500">Cargando…</div>
        )}
        {!loading && items.length === 0 && (
          <div className="col-span-full text-sm text-slate-500">
            Sin resultados.
          </div>
        )}
        {items.map((it, i) => (
          <Card
            key={`${it.word}-${it.language}-${i}`}
            className="p-5 border border-slate-200 bg-white hover:border-[#002FA7] hover:-translate-y-1 hover:shadow-md transition-all duration-200 rounded-xl fade-in-up"
          >
            <div className="flex items-start justify-between mb-2">
              <h3 className="font-display text-xl font-semibold text-slate-900">
                {it.word}
              </h3>
              <Badge className="bg-[#002FA7] text-white border-0">
                {it.language}
              </Badge>
            </div>
            <p className="text-sm text-slate-600 mb-4">{it.description}</p>
            <div className="space-y-2 text-sm">
              <Row icon={Hand} label="Manos" text={it.hands} />
              <Row icon={Smile} label="Boca" text={it.mouth} />
              <Row icon={Eye} label="Expresión" text={it.expression} />
            </div>
          </Card>
        ))}
      </div>
    </div>
  );
}

const Row = ({ icon: Icon, label, text }) => (
  <div className="flex items-start gap-2">
    <span className="w-6 h-6 rounded bg-slate-100 text-slate-700 flex items-center justify-center shrink-0 mt-0.5">
      <Icon className="w-3.5 h-3.5" />
    </span>
    <div className="min-w-0">
      <span className="text-[11px] uppercase tracking-wide text-slate-500 font-medium block leading-tight">
        {label}
      </span>
      <span className="text-slate-800">{text}</span>
    </div>
  </div>
);
