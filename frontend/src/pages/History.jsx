import { useEffect, useState } from "react";
import { Card } from "../components/ui/card";
import { Button } from "../components/ui/button";
import { Badge } from "../components/ui/badge";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "../components/ui/table";
import { History as HistoryIcon, Trash2, Loader2, FileDown } from "lucide-react";
import { getHistory, deleteHistoryItem, clearHistory } from "../lib/api";
import { exportConversationPDF } from "../lib/pdf";
import { toast } from "sonner";

const fmt = (iso) => {
  try {
    return new Date(iso).toLocaleString();
  } catch {
    return iso;
  }
};

const modeLabel = {
  video: "Video",
  live: "En vivo",
  "text-to-sign": "Texto → signos",
};

export default function HistoryPage() {
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);

  async function load() {
    setLoading(true);
    try {
      const data = await getHistory();
      setItems(data);
    } catch {
      toast.error("Error al cargar historial");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    load();
  }, []);

  async function handleDelete(id) {
    await deleteHistoryItem(id);
    setItems((p) => p.filter((i) => i.id !== id));
  }

  async function handleClear() {
    if (!window.confirm("¿Borrar todo el historial?")) return;
    await clearHistory();
    setItems([]);
  }

  return (
    <div className="max-w-[1400px] mx-auto px-4 sm:px-8 py-8">
      <div className="flex items-start justify-between gap-3 mb-6">
        <div className="flex items-start gap-3">
          <span className="w-10 h-10 rounded-md bg-[#002FA7] text-white flex items-center justify-center shrink-0">
            <HistoryIcon className="w-5 h-5" />
          </span>
          <div>
            <h1 className="font-display text-3xl sm:text-4xl font-semibold text-slate-900">
              Historial de traducciones
            </h1>
            <p className="text-slate-600 mt-1">
              Tus últimas traducciones quedan guardadas aquí.
            </p>
          </div>
        </div>
        {items.length > 0 && (
          <div className="flex flex-wrap gap-2">
            <Button
              data-testid="history-export-pdf"
              variant="outline"
              onClick={() =>
                exportConversationPDF(
                  items.map((it) => ({
                    from: it.mode === "text-to-sign" ? "user" : "signer",
                    text: it.translated_text,
                    lang: it.detected_language,
                    ts: new Date(it.created_at).toLocaleString(),
                    summary: it.notes,
                  })),
                  { title: "Historial – SignLanguage Pro" },
                )
              }
              className="border-slate-300 dark:border-slate-700"
            >
              <FileDown className="w-4 h-4 mr-2" /> Exportar PDF
            </Button>
            <Button
              data-testid="history-clear-button"
              variant="outline"
              onClick={handleClear}
              className="border-red-200 text-red-600 hover:bg-red-50 hover:text-red-700"
            >
              <Trash2 className="w-4 h-4 mr-2" /> Borrar todo
            </Button>
          </div>
        )}
      </div>

      <Card className="border border-slate-200 bg-white rounded-xl overflow-hidden">
        {loading ? (
          <div className="p-10 text-center text-slate-500">
            <Loader2 className="w-6 h-6 mx-auto animate-spin mb-2" />
            Cargando…
          </div>
        ) : items.length === 0 ? (
          <div
            data-testid="history-empty"
            className="p-12 text-center text-slate-500"
          >
            Aún no hay traducciones guardadas.
          </div>
        ) : (
          <Table data-testid="history-table">
            <TableHeader>
              <TableRow className="bg-slate-50">
                <TableHead>Fecha</TableHead>
                <TableHead>Modo</TableHead>
                <TableHead>Texto</TableHead>
                <TableHead>Idioma</TableHead>
                <TableHead className="text-right">Duración</TableHead>
                <TableHead className="w-12"></TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {items.map((it) => (
                <TableRow key={it.id} data-testid={`history-row-${it.id}`}>
                  <TableCell className="text-slate-600 whitespace-nowrap text-sm">
                    {fmt(it.created_at)}
                  </TableCell>
                  <TableCell>
                    <Badge
                      variant="outline"
                      className="border-slate-200 text-slate-700"
                    >
                      {modeLabel[it.mode] || it.mode}
                    </Badge>
                  </TableCell>
                  <TableCell className="max-w-md">
                    <div className="text-slate-900 font-medium truncate">
                      {it.translated_text || "—"}
                    </div>
                    {it.source_text && (
                      <div className="text-xs text-slate-500 truncate">
                        Original: {it.source_text}
                      </div>
                    )}
                  </TableCell>
                  <TableCell>
                    {it.detected_language ? (
                      <Badge className="bg-[#002FA7] text-white border-0">
                        {it.detected_language}
                      </Badge>
                    ) : (
                      <span className="text-slate-400">—</span>
                    )}
                  </TableCell>
                  <TableCell className="text-right text-slate-600 text-sm">
                    {it.duration_seconds
                      ? `${it.duration_seconds.toFixed(1)} s`
                      : "—"}
                  </TableCell>
                  <TableCell>
                    <Button
                      data-testid={`history-delete-${it.id}`}
                      variant="ghost"
                      size="icon"
                      onClick={() => handleDelete(it.id)}
                      className="text-slate-400 hover:text-red-600"
                    >
                      <Trash2 className="w-4 h-4" />
                    </Button>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </Card>
    </div>
  );
}
