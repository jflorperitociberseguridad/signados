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
import { Hand, Smile, Eye, Search, BookOpen, WifiOff } from "lucide-react";
import { getDictionary, getLanguages } from "../lib/api";
import { useOfflineDictionary } from "../hooks/useOfflineDictionary";
import { ConnectivityPill } from "../components/OfflineIndicator";

export default function Dictionary() {
  const [q, setQ] = useState("");
  const [lang, setLang] = useState("all");
  const [items, setItems] = useState([]);
  const [langs, setLangs] = useState([]);
  const [loading, setLoading] = useState(false);
  const [usingOffline, setUsingOffline] = useState(false);
  const { pack, online } = useOfflineDictionary({ limit: 30 });

  useEffect(() => {
    getLanguages().then(setLangs).catch(() => {});
  }, []);

  useEffect(() => {
    setLoading(true);
    const t = setTimeout(() => {
      getDictionary({ q, language: lang })
        .then((data) => {
          setItems(data);
          setUsingOffline(false);
        })
        .catch(() => {
          // Network failed → fall back to local pack
          if (pack?.items) {
            const ql = (q || "").toLowerCase().trim();
            let local = pack.items;
            if (lang && lang !== "all") {
              local = local.filter(
                (x) => (x.language || "").toLowerCase() === lang.toLowerCase(),
              );
            }
            if (ql) {
              local = local.filter(
                (x) =>
                  (x.word || "").toLowerCase().includes(ql) ||
                  (x.description || "").toLowerCase().includes(ql),
              );
            }
            setItems(local);
            setUsingOffline(true);
          } else {
            setItems([]);
          }
        })
        .finally(() => setLoading(false));
    }, 200);
    return () => clearTimeout(t);
  }, [q, lang, pack, online]);

  return (
    <div className="max-w-[1400px] mx-auto px-4 sm:px-8 py-8">
      <div className="flex items-start gap-3 mb-6">
        <span className="w-10 h-10 rounded-md bg-[#002FA7] text-white flex items-center justify-center shrink-0">
          <BookOpen className="w-5 h-5" />
        </span>
        <div className="flex-1">
          <div className="flex items-center gap-2 flex-wrap">
            <h1 className="font-display text-3xl sm:text-4xl font-semibold text-slate-900 dark:text-slate-100">
              Diccionario de signos
            </h1>
            <ConnectivityPill />
          </div>
          <p className="text-slate-600 dark:text-slate-300 mt-1">
            Explora signos comunes con descripción detallada de manos, boca y
            expresión facial.
          </p>
        </div>
      </div>

      {usingOffline && (
        <div
          data-testid="dict-offline-banner"
          className="mb-4 flex items-center gap-2 px-3 py-2 rounded-lg bg-amber-50 dark:bg-amber-950/40 border border-amber-200 dark:border-amber-900 text-amber-800 dark:text-amber-200 text-sm"
        >
          <WifiOff className="w-4 h-4" />
          Mostrando los {pack?.count || 0} signos descargados — sin conexión.
        </div>
      )}

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
            className="p-5 border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 hover:border-[#002FA7] hover:-translate-y-1 hover:shadow-md transition-all duration-200 rounded-xl fade-in-up"
          >
            <div className="flex items-start justify-between mb-2">
              <h3 className="font-display text-xl font-semibold text-slate-900 dark:text-slate-100">
                {it.word}
              </h3>
              <Badge className="bg-[#002FA7] text-white border-0">
                {it.language}
              </Badge>
            </div>
            <p className="text-sm text-slate-600 dark:text-slate-300 mb-4">{it.description}</p>
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
    <span className="w-6 h-6 rounded bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 flex items-center justify-center shrink-0 mt-0.5">
      <Icon className="w-3.5 h-3.5" />
    </span>
    <div className="min-w-0">
      <span className="text-[11px] uppercase tracking-wide text-slate-500 font-medium block leading-tight">
        {label}
      </span>
      <span className="text-slate-800 dark:text-slate-200">{text}</span>
    </div>
  </div>
);
