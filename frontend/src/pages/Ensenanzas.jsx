import { useEffect, useRef, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { Card } from "../components/ui/card";
import { Button } from "../components/ui/button";
import { Input } from "../components/ui/input";
import { Textarea } from "../components/ui/textarea";
import { Badge } from "../components/ui/badge";
import {
  Tabs,
  TabsList,
  TabsTrigger,
  TabsContent,
} from "../components/ui/tabs";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "../components/ui/select";
import {
  GraduationCap,
  Upload,
  FileText,
  Video as VideoIcon,
  Image as ImageIcon,
  Loader2,
  Trash2,
  RefreshCw,
  CheckCircle2,
  XCircle,
  Clock,
  BookOpen,
  AlertTriangle,
  Sparkles,
  Database,
  PencilLine,
  Search,
  Lock,
} from "lucide-react";
import { toast } from "sonner";
import { useAdminAuth } from "../lib/AdminAuthContext";
import {
  teachingUpload,
  teachingListFiles,
  teachingDelete,
  teachingProcess,
  teachingKnowledge,
  teachingDeleteKnowledge,
  teachingUpsertCorrection,
  teachingListCorrections,
  teachingDeleteCorrection,
  teachingStats,
} from "../lib/api";

const STATUS_BADGE = {
  uploaded: { className: "bg-amber-100 text-amber-700 border-amber-200", icon: Clock, label: "Pendiente" },
  processing: { className: "bg-sky-100 text-sky-700 border-sky-200", icon: Loader2, label: "Procesando…" },
  processed: { className: "bg-emerald-100 text-emerald-700 border-emerald-200", icon: CheckCircle2, label: "Procesado" },
  error: { className: "bg-red-100 text-red-700 border-red-200", icon: XCircle, label: "Error" },
};

const TYPE_ICON = {
  pdf: FileText,
  docx: FileText,
  image: ImageIcon,
  video: VideoIcon,
};

const fmtSize = (b) => {
  if (!b) return "—";
  const u = ["B", "KB", "MB", "GB"];
  let i = 0;
  let n = b;
  while (n > 1024 && i < u.length - 1) {
    n /= 1024;
    i++;
  }
  return `${n.toFixed(1)} ${u[i]}`;
};

const fmtDate = (iso) => {
  if (!iso) return "—";
  try {
    return new Date(iso).toLocaleString();
  } catch {
    return iso;
  }
};

export default function Ensenanzas() {
  const { isAdmin, password, login, verifying } = useAdminAuth();
  const navigate = useNavigate();
  const [pwdInput, setPwdInput] = useState("");

  // Files
  const [files, setFiles] = useState([]);
  const [uploading, setUploading] = useState(false);
  const [filesLoading, setFilesLoading] = useState(false);
  const fileInputRef = useRef(null);
  const [label, setLabel] = useState("");

  // Knowledge base
  const [kb, setKb] = useState([]);
  const [kbQ, setKbQ] = useState("");
  const [kbLang, setKbLang] = useState("all");
  const [kbLoading, setKbLoading] = useState(false);

  // Corrections
  const [corrections, setCorrections] = useState([]);
  const [corDraft, setCorDraft] = useState({
    word: "",
    language: "LSE",
    hands: "",
    mouth: "",
    expression: "",
    body: "",
    status: "correct",
    notes: "",
  });

  // Stats
  const [stats, setStats] = useState(null);

  const refreshAll = async () => {
    if (!isAdmin) return;
    setFilesLoading(true);
    try {
      const [f, k, c, s] = await Promise.all([
        teachingListFiles(password).catch(() => []),
        teachingKnowledge(password, { q: kbQ, language: kbLang, limit: 200 }).catch(() => []),
        teachingListCorrections(password).catch(() => []),
        teachingStats(password).catch(() => null),
      ]);
      setFiles(f);
      setKb(k);
      setCorrections(c);
      setStats(s);
    } finally {
      setFilesLoading(false);
    }
  };

  useEffect(() => {
    if (isAdmin) refreshAll();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isAdmin]);

  // Auto-poll while there's a "processing" file
  useEffect(() => {
    const anyProcessing = files.some(
      (f) => f.status === "processing" || f.status === "uploaded",
    );
    if (!anyProcessing) return;
    const t = setInterval(() => refreshAll(), 4500);
    return () => clearInterval(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [files]);

  const refreshKb = async () => {
    setKbLoading(true);
    try {
      const k = await teachingKnowledge(password, { q: kbQ, language: kbLang, limit: 200 });
      setKb(k);
    } finally {
      setKbLoading(false);
    }
  };

  // ----- Auth gate -----
  const tryLogin = async () => {
    const ok = await login(pwdInput);
    if (!ok) toast.error("Contraseña incorrecta");
  };

  if (!isAdmin) {
    return (
      <div className="max-w-md mx-auto px-4 py-16">
        <Card className="p-8 border border-slate-200 dark:border-slate-700 rounded-2xl">
          <div className="flex items-center gap-3 mb-4">
            <span className="w-10 h-10 rounded-md bg-emerald-600 text-white flex items-center justify-center">
              <Lock className="w-5 h-5" />
            </span>
            <h1 className="font-display text-2xl font-semibold">Enseñanzas</h1>
          </div>
          <p className="text-sm text-slate-500 mb-4">
            Esta zona es privada. Introduce la contraseña de administrador
            para acceder al panel de entrenamiento de la IA.
          </p>
          <Input
            data-testid="teach-pwd"
            type="password"
            value={pwdInput}
            onChange={(e) => setPwdInput(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && tryLogin()}
            placeholder="Contraseña"
          />
          <Button
            data-testid="teach-login"
            onClick={tryLogin}
            disabled={verifying}
            className="btn-ikb mt-4 w-full h-11"
          >
            {verifying ? (
              <Loader2 className="w-4 h-4 animate-spin" />
            ) : (
              "Entrar"
            )}
          </Button>
          <Link
            to="/"
            className="mt-4 text-xs text-slate-500 hover:text-slate-700 inline-block"
          >
            ← Volver al inicio
          </Link>
        </Card>
      </div>
    );
  }

  // ----- File upload handler -----
  const handleUpload = async (file) => {
    if (!file) return;
    setUploading(true);
    try {
      const f = await teachingUpload(password, file, label);
      toast.success("Archivo subido", { description: f.filename });
      setLabel("");
      // Auto-process right away
      await teachingProcess(password, f.id);
      toast.info("Procesando con IA…", { description: "Tomará unos segundos" });
      refreshAll();
    } catch (e) {
      toast.error("Error subiendo archivo", {
        description: e?.response?.data?.detail || e?.message,
      });
    } finally {
      setUploading(false);
      if (fileInputRef.current) fileInputRef.current.value = "";
    }
  };

  const reprocess = async (id) => {
    try {
      await teachingProcess(password, id);
      toast.info("Re-procesando…");
      refreshAll();
    } catch (e) {
      toast.error("Error", { description: e?.response?.data?.detail || e?.message });
    }
  };

  const removeFile = async (id) => {
    if (!window.confirm("¿Borrar este archivo y todos sus signos extraídos?")) return;
    try {
      await teachingDelete(password, id);
      toast.success("Archivo borrado");
      refreshAll();
    } catch {
      toast.error("Error borrando archivo");
    }
  };

  const removeKb = async (id) => {
    if (!window.confirm("¿Borrar esta entrada de la base de conocimiento?")) return;
    await teachingDeleteKnowledge(password, id);
    refreshKb();
  };

  // ----- Corrections -----
  const saveCorrection = async () => {
    if (!corDraft.word.trim()) {
      toast.error("Word es obligatorio");
      return;
    }
    try {
      await teachingUpsertCorrection(password, corDraft);
      toast.success("Corrección guardada");
      setCorDraft({
        ...corDraft,
        word: "",
        hands: "",
        mouth: "",
        expression: "",
        body: "",
        notes: "",
      });
      refreshAll();
    } catch (e) {
      toast.error("Error", { description: e?.response?.data?.detail || e?.message });
    }
  };

  const removeCorrection = async (id) => {
    if (!window.confirm("¿Borrar corrección?")) return;
    await teachingDeleteCorrection(password, id);
    refreshAll();
  };

  return (
    <div className="max-w-[1400px] mx-auto px-4 sm:px-8 py-8">
      {/* Header */}
      <div className="flex flex-col sm:flex-row items-start gap-3 mb-6">
        <span className="w-12 h-12 rounded-md bg-emerald-600 text-white flex items-center justify-center shrink-0">
          <GraduationCap className="w-6 h-6" />
        </span>
        <div className="flex-1">
          <h1 className="font-display text-3xl sm:text-4xl font-semibold text-slate-900 dark:text-slate-100">
            Enseñanzas
          </h1>
          <p className="text-slate-600 dark:text-slate-300 mt-1">
            Sube manuales, vídeos y referencias. La IA aprende de cada archivo,
            extrae el vocabulario y mejora las traducciones futuras.
          </p>
        </div>
        <Button
          data-testid="teach-refresh-all"
          onClick={refreshAll}
          variant="outline"
          className="rounded-full"
        >
          <RefreshCw className="w-4 h-4 mr-2" /> Actualizar
        </Button>
      </div>

      {/* Stats grid */}
      {stats && (
        <div data-testid="teach-stats" className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-6">
          <StatCard icon={FileText} label="Archivos" value={stats.files} />
          <StatCard icon={CheckCircle2} label="Procesados" value={stats.processed} />
          <StatCard icon={Database} label="Signos en KB" value={stats.kb_count} />
          <StatCard icon={PencilLine} label="Correcciones" value={stats.corrections} />
        </div>
      )}

      <Tabs defaultValue="upload" className="w-full">
        <TabsList className="w-full justify-start overflow-x-auto" data-testid="teach-tabs">
          <TabsTrigger value="upload" data-testid="tab-upload">
            <Upload className="w-4 h-4 mr-1.5" /> Subir
          </TabsTrigger>
          <TabsTrigger value="kb" data-testid="tab-kb">
            <Database className="w-4 h-4 mr-1.5" /> Conocimiento ({stats?.kb_count || 0})
          </TabsTrigger>
          <TabsTrigger value="corrections" data-testid="tab-corrections">
            <PencilLine className="w-4 h-4 mr-1.5" /> Correcciones ({stats?.corrections || 0})
          </TabsTrigger>
          <TabsTrigger value="train" data-testid="tab-train">
            <Sparkles className="w-4 h-4 mr-1.5" /> Entrenar IA
          </TabsTrigger>
        </TabsList>

        {/* ---- TAB 1: Subir manuales/vídeos ---- */}
        <TabsContent value="upload" className="mt-5">
          <Card className="p-5 mb-5 border border-emerald-200 dark:border-emerald-900 bg-emerald-50/50 dark:bg-emerald-950/20 rounded-xl">
            <h3 className="font-display text-lg font-semibold mb-3">
              Subir nuevo material
            </h3>
            <p className="text-sm text-slate-600 dark:text-slate-300 mb-4">
              PDF, Word, imágenes (JPG/PNG/WebP) o vídeos (MP4/WebM/MOV).
              Máx. 200 MB. La IA procesará el archivo automáticamente al
              subirlo.
            </p>
            <div className="flex flex-col sm:flex-row gap-3">
              <Input
                data-testid="teach-label"
                placeholder="Etiqueta opcional (ej: Manual LSE Curso 1)"
                value={label}
                onChange={(e) => setLabel(e.target.value)}
                className="flex-1"
              />
              <input
                ref={fileInputRef}
                data-testid="teach-file-input"
                type="file"
                accept=".pdf,.docx,.doc,.png,.jpg,.jpeg,.webp,.mp4,.webm,.mov"
                onChange={(e) => handleUpload(e.target.files?.[0])}
                className="hidden"
              />
              <Button
                data-testid="teach-pick-file"
                onClick={() => fileInputRef.current?.click()}
                disabled={uploading}
                className="btn-ikb h-11"
              >
                {uploading ? (
                  <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                ) : (
                  <Upload className="w-4 h-4 mr-2" />
                )}
                Subir archivo
              </Button>
            </div>
          </Card>

          <Card className="border border-slate-200 dark:border-slate-700 rounded-xl overflow-hidden">
            <div className="px-5 py-3 border-b border-slate-100 dark:border-slate-800 flex items-center justify-between">
              <h3 className="font-display font-semibold">Archivos subidos</h3>
              {filesLoading && <Loader2 className="w-4 h-4 animate-spin text-slate-400" />}
            </div>
            {files.length === 0 ? (
              <div data-testid="teach-files-empty" className="p-10 text-center text-slate-500">
                Aún no hay archivos. Sube el primer manual o vídeo arriba.
              </div>
            ) : (
              <div className="divide-y divide-slate-100 dark:divide-slate-800">
                {files.map((f) => {
                  const Icon = TYPE_ICON[f.type] || FileText;
                  const stCfg = STATUS_BADGE[f.status] || STATUS_BADGE.uploaded;
                  const StIcon = stCfg.icon;
                  return (
                    <div
                      key={f.id}
                      data-testid={`teach-file-${f.id}`}
                      className="px-5 py-3 flex flex-col sm:flex-row sm:items-center gap-3"
                    >
                      <span className="w-9 h-9 rounded-md bg-slate-100 dark:bg-slate-800 flex items-center justify-center shrink-0">
                        <Icon className="w-4 h-4 text-slate-600 dark:text-slate-300" />
                      </span>
                      <div className="min-w-0 flex-1">
                        <div className="font-medium text-sm truncate">
                          {f.label ? `${f.label} · ` : ""}
                          {f.filename}
                        </div>
                        <div className="text-xs text-slate-500 mt-0.5 flex flex-wrap gap-x-2.5 gap-y-0.5">
                          <span>{f.type.toUpperCase()}</span>
                          <span>{fmtSize(f.size)}</span>
                          <span>Subido {fmtDate(f.uploaded_at)}</span>
                          {f.processed_at && <span>Procesado {fmtDate(f.processed_at)}</span>}
                          {f.kb_count > 0 && <span className="text-emerald-700">+{f.kb_count} signos</span>}
                          {f.error && <span className="text-red-600">⚠ {f.error}</span>}
                        </div>
                      </div>
                      <Badge className={`${stCfg.className} border whitespace-nowrap`}>
                        <StIcon className={`w-3 h-3 mr-1 ${f.status === "processing" ? "animate-spin" : ""}`} />
                        {stCfg.label}
                      </Badge>
                      <div className="flex gap-1.5">
                        <Button
                          data-testid={`teach-reprocess-${f.id}`}
                          size="sm"
                          variant="ghost"
                          onClick={() => reprocess(f.id)}
                          disabled={f.status === "processing"}
                          title="Re-procesar"
                        >
                          <RefreshCw className="w-4 h-4" />
                        </Button>
                        <Button
                          data-testid={`teach-delete-${f.id}`}
                          size="sm"
                          variant="ghost"
                          onClick={() => removeFile(f.id)}
                          className="text-slate-400 hover:text-red-600"
                        >
                          <Trash2 className="w-4 h-4" />
                        </Button>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </Card>
        </TabsContent>

        {/* ---- TAB 2: Knowledge Base ---- */}
        <TabsContent value="kb" className="mt-5">
          <Card className="p-4 mb-4 border border-slate-200 dark:border-slate-700 rounded-xl">
            <div className="flex flex-col sm:flex-row gap-2">
              <div className="relative flex-1">
                <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
                <Input
                  data-testid="kb-search"
                  value={kbQ}
                  onChange={(e) => setKbQ(e.target.value)}
                  onKeyDown={(e) => e.key === "Enter" && refreshKb()}
                  placeholder="Buscar palabra o componente…"
                  className="pl-9"
                />
              </div>
              <Select value={kbLang} onValueChange={setKbLang}>
                <SelectTrigger data-testid="kb-lang" className="w-full sm:w-44">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Todos los idiomas</SelectItem>
                  <SelectItem value="LSE">LSE</SelectItem>
                  <SelectItem value="ASL">ASL</SelectItem>
                  <SelectItem value="BSL">BSL</SelectItem>
                  <SelectItem value="LSM">LSM</SelectItem>
                  <SelectItem value="LIBRAS">LIBRAS</SelectItem>
                </SelectContent>
              </Select>
              <Button data-testid="kb-search-btn" onClick={refreshKb} className="btn-ikb">
                {kbLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : "Buscar"}
              </Button>
            </div>
          </Card>

          {kb.length === 0 ? (
            <Card data-testid="kb-empty" className="p-10 text-center text-slate-500 border border-slate-200 dark:border-slate-700 rounded-xl">
              <BookOpen className="w-10 h-10 mx-auto text-slate-300 mb-2" />
              <p>La base de conocimiento está vacía.</p>
              <p className="text-xs mt-1">
                Sube manuales o vídeos en la pestaña "Subir" para que la IA
                extraiga vocabulario.
              </p>
            </Card>
          ) : (
            <div data-testid="kb-grid" className="grid sm:grid-cols-2 lg:grid-cols-3 gap-3">
              {kb.map((it) => (
                <Card
                  key={it.id}
                  className="p-4 border border-slate-200 dark:border-slate-700 rounded-xl bg-white dark:bg-slate-900 hover:border-emerald-400 transition-colors"
                >
                  <div className="flex items-start justify-between mb-2">
                    <div>
                      <div className="font-display font-semibold text-base">{it.word}</div>
                      <div className="flex flex-wrap gap-1 mt-1">
                        <Badge className="bg-[#002FA7] text-white border-0 text-[10px]">
                          {it.language}
                        </Badge>
                        <Badge
                          className={`text-[10px] ${
                            it.confidence === "alta"
                              ? "bg-emerald-100 text-emerald-700"
                              : it.confidence === "media"
                                ? "bg-amber-100 text-amber-700"
                                : "bg-red-100 text-red-700"
                          } border-0`}
                        >
                          {it.confidence || "—"}
                        </Badge>
                      </div>
                    </div>
                    <Button
                      data-testid={`kb-delete-${it.id}`}
                      size="icon"
                      variant="ghost"
                      onClick={() => removeKb(it.id)}
                      className="text-slate-400 hover:text-red-600 -mr-1 -mt-1"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </Button>
                  </div>
                  {it.hands && (
                    <div className="text-xs mb-1.5">
                      <span className="text-slate-500">Manos:</span>{" "}
                      <span className="text-slate-800 dark:text-slate-200">{it.hands}</span>
                    </div>
                  )}
                  {it.mouth && (
                    <div className="text-xs mb-1.5">
                      <span className="text-slate-500">Boca:</span>{" "}
                      <span className="text-slate-800 dark:text-slate-200">{it.mouth}</span>
                    </div>
                  )}
                  {it.expression && (
                    <div className="text-xs mb-1.5">
                      <span className="text-slate-500">Expresión:</span>{" "}
                      <span className="text-slate-800 dark:text-slate-200">{it.expression}</span>
                    </div>
                  )}
                  {it.source_filename && (
                    <div className="text-[10px] text-slate-400 mt-2 pt-2 border-t border-slate-100 dark:border-slate-800 truncate">
                      📄 {it.source_filename}
                    </div>
                  )}
                </Card>
              ))}
            </div>
          )}
        </TabsContent>

        {/* ---- TAB 3: Correcciones ---- */}
        <TabsContent value="corrections" className="mt-5">
          <div className="grid lg:grid-cols-2 gap-5">
            <Card className="p-5 border border-amber-200 dark:border-amber-900 bg-amber-50/50 dark:bg-amber-950/20 rounded-xl">
              <h3 className="font-display text-lg font-semibold mb-3 flex items-center gap-2">
                <PencilLine className="w-5 h-5 text-amber-700" />
                Añadir corrección manual
              </h3>
              <p className="text-xs text-slate-600 dark:text-slate-300 mb-4">
                Las correcciones tienen prioridad MÁXIMA sobre las
                extracciones automáticas de la IA. Úsalas para fijar signos
                que la IA representa de forma incorrecta.
              </p>
              <div className="space-y-2.5">
                <div className="grid grid-cols-2 gap-2">
                  <Input
                    data-testid="cor-word"
                    placeholder="Palabra (ej: Hola)"
                    value={corDraft.word}
                    onChange={(e) => setCorDraft({ ...corDraft, word: e.target.value })}
                  />
                  <Select
                    value={corDraft.language}
                    onValueChange={(v) => setCorDraft({ ...corDraft, language: v })}
                  >
                    <SelectTrigger data-testid="cor-lang">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="LSE">LSE</SelectItem>
                      <SelectItem value="ASL">ASL</SelectItem>
                      <SelectItem value="BSL">BSL</SelectItem>
                      <SelectItem value="LSM">LSM</SelectItem>
                      <SelectItem value="LIBRAS">LIBRAS</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <Textarea
                  data-testid="cor-hands"
                  placeholder="Manos (configuración + movimiento)"
                  rows={2}
                  value={corDraft.hands}
                  onChange={(e) => setCorDraft({ ...corDraft, hands: e.target.value })}
                />
                <Input
                  data-testid="cor-mouth"
                  placeholder="Boca / labios"
                  value={corDraft.mouth}
                  onChange={(e) => setCorDraft({ ...corDraft, mouth: e.target.value })}
                />
                <Input
                  data-testid="cor-expression"
                  placeholder="Expresión facial"
                  value={corDraft.expression}
                  onChange={(e) => setCorDraft({ ...corDraft, expression: e.target.value })}
                />
                <Input
                  data-testid="cor-body"
                  placeholder="Postura / cuerpo"
                  value={corDraft.body}
                  onChange={(e) => setCorDraft({ ...corDraft, body: e.target.value })}
                />
                <div className="grid grid-cols-2 gap-2">
                  <Select
                    value={corDraft.status}
                    onValueChange={(v) => setCorDraft({ ...corDraft, status: v })}
                  >
                    <SelectTrigger data-testid="cor-status">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="correct">Correcto</SelectItem>
                      <SelectItem value="doubtful">Dudoso</SelectItem>
                    </SelectContent>
                  </Select>
                  <Input
                    data-testid="cor-notes"
                    placeholder="Notas internas"
                    value={corDraft.notes}
                    onChange={(e) => setCorDraft({ ...corDraft, notes: e.target.value })}
                  />
                </div>
                <Button
                  data-testid="cor-save"
                  onClick={saveCorrection}
                  className="btn-ikb w-full h-11"
                >
                  Guardar corrección
                </Button>
              </div>
            </Card>

            <Card className="p-0 border border-slate-200 dark:border-slate-700 rounded-xl overflow-hidden">
              <div className="px-5 py-3 border-b border-slate-100 dark:border-slate-800 flex items-center justify-between">
                <h3 className="font-display font-semibold">Lista de correcciones</h3>
                <Badge className="bg-slate-100 text-slate-700 border-0">{corrections.length}</Badge>
              </div>
              {corrections.length === 0 ? (
                <div data-testid="cor-empty" className="p-10 text-center text-slate-500">
                  Aún no hay correcciones manuales.
                </div>
              ) : (
                <div className="divide-y divide-slate-100 dark:divide-slate-800 max-h-[480px] overflow-y-auto">
                  {corrections.map((c) => (
                    <div
                      key={c.id}
                      data-testid={`cor-item-${c.id}`}
                      className="p-4 flex items-start justify-between gap-2"
                    >
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-1.5 mb-1">
                          <span className="font-semibold">{c.word}</span>
                          <Badge className="bg-[#002FA7] text-white border-0 text-[10px]">{c.language}</Badge>
                          {c.status === "doubtful" ? (
                            <Badge className="bg-amber-100 text-amber-700 border-amber-200 text-[10px]">
                              <AlertTriangle className="w-2.5 h-2.5 mr-0.5" /> Dudoso
                            </Badge>
                          ) : (
                            <Badge className="bg-emerald-100 text-emerald-700 border-emerald-200 text-[10px]">
                              <CheckCircle2 className="w-2.5 h-2.5 mr-0.5" /> Correcto
                            </Badge>
                          )}
                        </div>
                        {c.hands && <p className="text-xs text-slate-600 dark:text-slate-300 line-clamp-2">{c.hands}</p>}
                        {c.notes && <p className="text-[11px] text-slate-400 mt-1 italic">{c.notes}</p>}
                      </div>
                      <Button
                        data-testid={`cor-delete-${c.id}`}
                        size="icon"
                        variant="ghost"
                        onClick={() => removeCorrection(c.id)}
                        className="text-slate-400 hover:text-red-600 shrink-0"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </Button>
                    </div>
                  ))}
                </div>
              )}
            </Card>
          </div>
        </TabsContent>

        {/* ---- TAB 4: Entrenar IA ---- */}
        <TabsContent value="train" className="mt-5">
          <Card className="p-6 border border-slate-200 dark:border-slate-700 rounded-xl">
            <h3 className="font-display text-xl font-semibold mb-3 flex items-center gap-2">
              <Sparkles className="w-5 h-5 text-[#002FA7]" /> Entrenamiento continuo
            </h3>
            <p className="text-sm text-slate-600 dark:text-slate-300 mb-4 max-w-2xl">
              La IA usa el contenido de la base de conocimiento (extraído de
              tus manuales) y las correcciones manuales como "guardarraíles"
              al generar traducciones de texto a signos. Esta página es un
              dashboard — el aprendizaje ocurre cada vez que alguien pide una
              traducción.
            </p>

            <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-3 mb-5">
              <InfoTile
                icon={Database}
                title="Base de conocimiento"
                value={`${stats?.kb_count || 0} signos`}
                hint="Extraídos automáticamente desde manuales y vídeos"
              />
              <InfoTile
                icon={PencilLine}
                title="Correcciones manuales"
                value={`${stats?.corrections || 0}`}
                hint="Tienen prioridad sobre la extracción automática"
              />
              <InfoTile
                icon={FileText}
                title="Material procesado"
                value={`${stats?.processed || 0} / ${stats?.files || 0}`}
                hint={stats?.errors ? `${stats.errors} con error` : "Sin errores"}
              />
            </div>

            <div className="bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-lg p-4 mb-5">
              <div className="text-xs uppercase tracking-wide text-slate-500 mb-2">
                Por idioma
              </div>
              <div className="flex flex-wrap gap-2">
                {(stats?.by_language || []).map((row) => (
                  <Badge
                    key={row.language}
                    className="bg-white dark:bg-slate-800 text-slate-700 dark:text-slate-200 border border-slate-200 dark:border-slate-700"
                  >
                    {row.language} · <strong className="ml-1">{row.count}</strong>
                  </Badge>
                ))}
                {(stats?.by_language || []).length === 0 && (
                  <span className="text-xs text-slate-400">— sin datos —</span>
                )}
              </div>
            </div>

            <div className="flex flex-wrap gap-2">
              <Button
                data-testid="train-reprocess-pending"
                onClick={async () => {
                  const pending = files.filter(
                    (f) => f.status === "uploaded" || f.status === "error",
                  );
                  if (pending.length === 0) {
                    toast.info("Nada pendiente que reprocesar");
                    return;
                  }
                  for (const f of pending) {
                    try {
                      await teachingProcess(password, f.id);
                    } catch {}
                  }
                  toast.success(`Re-procesando ${pending.length} archivo(s)`);
                  refreshAll();
                }}
                className="btn-ikb"
              >
                <RefreshCw className="w-4 h-4 mr-2" /> Re-procesar pendientes
              </Button>
              <Button
                onClick={() => navigate("/texto-a-signos")}
                variant="outline"
              >
                <Sparkles className="w-4 h-4 mr-2" /> Probar en Traductor
              </Button>
            </div>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}

const StatCard = ({ icon: Icon, label, value }) => (
  <Card className="p-4 border border-slate-200 dark:border-slate-700 rounded-xl bg-white dark:bg-slate-900">
    <div className="flex items-center gap-2 text-xs text-slate-500 uppercase tracking-wide">
      <Icon className="w-3.5 h-3.5" />
      {label}
    </div>
    <div className="font-display text-2xl font-semibold mt-1">{value}</div>
  </Card>
);

const InfoTile = ({ icon: Icon, title, value, hint }) => (
  <div className="p-4 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900">
    <div className="flex items-center gap-2 text-xs uppercase tracking-wide text-slate-500">
      <Icon className="w-3.5 h-3.5" />
      {title}
    </div>
    <div className="font-display text-2xl font-semibold mt-1">{value}</div>
    <div className="text-xs text-slate-400 mt-0.5">{hint}</div>
  </div>
);
