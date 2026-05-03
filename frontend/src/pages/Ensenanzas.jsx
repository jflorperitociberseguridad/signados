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
  ReplaceAll,
  Globe2,
  Film,
  Settings2,
  Wand2,
  RotateCcw,
  Key,
  KeyRound,
  Eye,
  EyeOff,
  Download,
  Archive,
} from "lucide-react";
import { toast } from "sonner";
import { useAdminAuth } from "../lib/AdminAuthContext";
import { useLanguageVariant, VARIANTS } from "../lib/LanguageVariantContext";
import {
  teachingUpload,
  teachingListFiles,
  teachingDelete,
  teachingReplace,
  teachingProcess,
  teachingKnowledge,
  teachingDeleteKnowledge,
  teachingUpsertCorrection,
  teachingListCorrections,
  teachingDeleteCorrection,
  teachingStats,
  teachingVideos,
  fetchVideoBlobUrl,
  teachingGetAIConfig,
  teachingUpdateAIConfig,
  teachingResetAIConfig,
  teachingTestAIConfig,
  teachingGetApiKey,
  teachingUpdateApiKey,
  teachingDeleteApiKey,
  teachingTestApiKey,
  teachingBackupPreview,
  teachingBackupDownloadUrl,
  teachingBackupToken,
  teachingBackupDownloadBlob,
  teachingRestore,
  adminChangePassword,
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
  const { isAdmin, password, login, verifying, replacePassword } = useAdminAuth();
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
  const [kbConfidence, setKbConfidence] = useState("all");
  const [kbLoading, setKbLoading] = useState(false);
  const [showDoubtfulOnly, setShowDoubtfulOnly] = useState(false);

  // File replace
  const replaceInputRef = useRef(null);
  const replacingRef = useRef(null); // file_id being replaced

  // Reference videos
  const [videos, setVideos] = useState([]);
  const [videoBlobs, setVideoBlobs] = useState({}); // file_id -> blob URL

  // AI Config
  const [aiCfg, setAiCfg] = useState(null);
  const [aiCfgDraft, setAiCfgDraft] = useState(null);
  const [aiCfgSaving, setAiCfgSaving] = useState(false);
  const [aiCfgTesting, setAiCfgTesting] = useState(false);
  const [aiCfgTestResult, setAiCfgTestResult] = useState(null);

  // Custom OpenAI API key (Tab "API IA")
  const [apiKeyInfo, setApiKeyInfo] = useState(null); // {has_custom_key, masked_key, active_source}
  const [apiKeyDraft, setApiKeyDraft] = useState("");
  const [apiKeyShow, setApiKeyShow] = useState(false);
  const [apiKeyBusy, setApiKeyBusy] = useState(false);
  const [apiKeyTestResult, setApiKeyTestResult] = useState(null);

  // Change-password modal
  const [showPwdModal, setShowPwdModal] = useState(false);
  const [pwdCurrent, setPwdCurrent] = useState("");
  const [pwdNew, setPwdNew] = useState("");
  const [pwdConfirm, setPwdConfirm] = useState("");
  const [pwdBusy, setPwdBusy] = useState(false);

  // Backup / Restore
  const [backupPreview, setBackupPreview] = useState(null);
  const [backupBusy, setBackupBusy] = useState(false);
  const [restoreFile, setRestoreFile] = useState(null);
  const [restoreWipe, setRestoreWipe] = useState(false);
  const [restoreBusy, setRestoreBusy] = useState(false);
  const [restoreResult, setRestoreResult] = useState(null);

  // Global variant
  const { variant, setVariant } = useLanguageVariant();

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
      const [f, k, c, s, v, ai, akey, bp] = await Promise.all([
        teachingListFiles(password).catch(() => []),
        teachingKnowledge(password, { q: kbQ, language: kbLang, confidence: kbConfidence, limit: 200 }).catch(() => []),
        teachingListCorrections(password).catch(() => []),
        teachingStats(password).catch(() => null),
        teachingVideos(password).catch(() => []),
        teachingGetAIConfig(password).catch(() => null),
        teachingGetApiKey(password).catch(() => null),
        teachingBackupPreview(password).catch(() => null),
      ]);
      setFiles(f);
      setKb(k);
      setCorrections(c);
      setStats(s);
      setVideos(v);
      if (ai) {
        setAiCfg(ai);
        setAiCfgDraft((d) => d || ai);
      }
      if (akey) setApiKeyInfo(akey);
      if (bp) setBackupPreview(bp);
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
      const k = await teachingKnowledge(password, {
        q: kbQ,
        language: kbLang,
        confidence: showDoubtfulOnly ? "baja" : kbConfidence,
        limit: 200,
      });
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

  const startReplace = (id) => {
    replacingRef.current = id;
    if (replaceInputRef.current) {
      replaceInputRef.current.value = "";
      replaceInputRef.current.click();
    }
  };

  const handleReplaceFile = async (file) => {
    const id = replacingRef.current;
    replacingRef.current = null;
    if (!file || !id) return;
    try {
      await teachingReplace(password, id, file, "");
      toast.success("Archivo reemplazado", { description: "Re-procesando con IA…" });
      // Auto-process the replacement so KB reflects the new content
      await teachingProcess(password, id);
      refreshAll();
    } catch (e) {
      toast.error("No se pudo reemplazar", {
        description: e?.response?.data?.detail || e?.message,
      });
    } finally {
      if (replaceInputRef.current) replaceInputRef.current.value = "";
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

  // ----- AI Config handlers -----
  const saveAiConfig = async () => {
    if (!aiCfgDraft) return;
    setAiCfgSaving(true);
    try {
      const updated = await teachingUpdateAIConfig(password, {
        text_model: aiCfgDraft.text_model,
        vision_model: aiCfgDraft.vision_model,
        system_prompt: aiCfgDraft.system_prompt,
        max_text_chunks: parseInt(aiCfgDraft.max_text_chunks, 10),
        max_image_batch: parseInt(aiCfgDraft.max_image_batch, 10),
        video_frames_count: parseInt(aiCfgDraft.video_frames_count, 10),
        min_confidence_keep: aiCfgDraft.min_confidence_keep,
        auto_process: !!aiCfgDraft.auto_process,
      });
      setAiCfg(updated);
      setAiCfgDraft(updated);
      toast.success("Configuración guardada");
    } catch (e) {
      toast.error("Error guardando configuración", {
        description: e?.response?.data?.detail || e?.message,
      });
    } finally {
      setAiCfgSaving(false);
    }
  };

  const resetAiConfig = async () => {
    if (!window.confirm("¿Restaurar la configuración por defecto?")) return;
    try {
      const cfg = await teachingResetAIConfig(password);
      setAiCfg(cfg);
      setAiCfgDraft(cfg);
      toast.success("Configuración restaurada a valores por defecto");
    } catch {
      toast.error("Error restaurando configuración");
    }
  };

  const testAiConfig = async () => {
    setAiCfgTesting(true);
    setAiCfgTestResult(null);
    try {
      // Save first if there are unsaved changes
      if (JSON.stringify(aiCfgDraft) !== JSON.stringify(aiCfg)) {
        await saveAiConfig();
      }
      const res = await teachingTestAIConfig(password);
      setAiCfgTestResult(res);
      if (res.ok) {
        toast.success(`Test OK · ${res.items_extracted} signo(s) extraídos con ${res.model_used}`);
      } else {
        toast.error("Test falló", { description: res.error });
      }
    } catch (e) {
      toast.error("Error en el test", { description: e?.message });
    } finally {
      setAiCfgTesting(false);
    }
  };

  // ----- API Key handlers -----
  const saveApiKey = async () => {
    if (!apiKeyDraft.trim()) {
      toast.error("Pega tu clave OpenAI (sk-…)");
      return;
    }
    setApiKeyBusy(true);
    try {
      const res = await teachingUpdateApiKey(password, apiKeyDraft.trim());
      setApiKeyInfo({ has_custom_key: true, masked_key: res.masked_key, active_source: "custom" });
      setApiKeyDraft("");
      setApiKeyShow(false);
      setApiKeyTestResult(null);
      toast.success("Clave guardada (cifrada en MongoDB)");
    } catch (e) {
      toast.error("Error guardando clave", {
        description: e?.response?.data?.detail || e?.message,
      });
    } finally {
      setApiKeyBusy(false);
    }
  };

  const removeApiKey = async () => {
    if (!window.confirm("¿Eliminar tu clave personal y volver a la clave Emergent universal?")) return;
    setApiKeyBusy(true);
    try {
      await teachingDeleteApiKey(password);
      setApiKeyInfo({ has_custom_key: false, masked_key: "", active_source: "emergent_universal" });
      setApiKeyTestResult(null);
      toast.success("Clave eliminada · usando clave Emergent universal");
    } catch (e) {
      toast.error("Error eliminando clave", { description: e?.message });
    } finally {
      setApiKeyBusy(false);
    }
  };

  const verifyApiKey = async () => {
    setApiKeyBusy(true);
    setApiKeyTestResult(null);
    try {
      const res = await teachingTestApiKey(password);
      setApiKeyTestResult(res);
      if (res.ok) {
        toast.success(`OK · clave ${res.source === "custom" ? "personal" : "Emergent"}`);
      } else {
        toast.error("La clave no responde", { description: res.error });
      }
    } catch (e) {
      toast.error("Error en la verificación", { description: e?.message });
    } finally {
      setApiKeyBusy(false);
    }
  };

  // ----- Change-password handlers -----
  const submitChangePassword = async () => {
    if (pwdNew !== pwdConfirm) {
      toast.error("Las contraseñas nuevas no coinciden");
      return;
    }
    if (pwdNew.length < 4) {
      toast.error("Mínimo 4 caracteres");
      return;
    }
    setPwdBusy(true);
    try {
      await adminChangePassword(pwdCurrent, pwdNew);
      replacePassword(pwdNew);
      setShowPwdModal(false);
      setPwdCurrent("");
      setPwdNew("");
      setPwdConfirm("");
      toast.success("Contraseña actualizada");
    } catch (e) {
      toast.error("No se pudo cambiar", {
        description: e?.response?.data?.detail || e?.message,
      });
    } finally {
      setPwdBusy(false);
    }
  };

  // ----- Backup / Restore handlers -----
  const downloadBackup = async () => {
    setBackupBusy(true);
    try {
      // Primary path: mint a one-shot token, then trigger native browser
      // navigation. This works on Safari/iOS where fetch+blob+anchor-click
      // is silently blocked.
      const { token } = await teachingBackupToken(password);
      const stamp = new Date().toISOString().replace(/[:.]/g, "-").slice(0, 19);
      const url = `${teachingBackupDownloadUrl()}?token=${encodeURIComponent(token)}&filename=signlang-backup-${stamp}.zip`;
      // Use a real anchor with target=_self so the browser handles the
      // Content-Disposition header and the suggested filename natively.
      const a = document.createElement("a");
      a.href = url;
      a.rel = "noopener";
      // No download attribute needed — the server returns Content-Disposition
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      toast.success("Descarga iniciada", {
        description: "Si tu navegador no muestra la descarga, comprueba el bloqueador de pop-ups.",
      });
    } catch (e) {
      // Fallback: classic fetch+blob path. Some corporate proxies kill
      // streamed responses; this catches them.
      try {
        const blob = await teachingBackupDownloadBlob(password);
        const url = URL.createObjectURL(blob);
        const a = document.createElement("a");
        const stamp = new Date().toISOString().replace(/[:.]/g, "-").slice(0, 19);
        a.href = url;
        a.download = `signlang-backup-${stamp}.zip`;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        setTimeout(() => URL.revokeObjectURL(url), 5000);
        toast.success("Backup descargado");
      } catch (e2) {
        toast.error("Error al descargar backup", {
          description: e2?.message || e?.message,
        });
      }
    } finally {
      setBackupBusy(false);
    }
  };

  const doRestore = async () => {
    if (!restoreFile) {
      toast.error("Selecciona un archivo ZIP primero");
      return;
    }
    const warn = restoreWipe
      ? "⚠️ Se borrarán TODOS los archivos de /teaching y se reemplazarán las colecciones. ¿Continuar?"
      : "⚠️ Se reemplazarán las colecciones MongoDB con el contenido del backup. Los archivos se añadirán/sobrescribirán. ¿Continuar?";
    if (!window.confirm(warn)) return;

    setRestoreBusy(true);
    setRestoreResult(null);
    try {
      const res = await teachingRestore(password, restoreFile, { wipeFiles: restoreWipe });
      setRestoreResult(res);
      toast.success("Restauración completada", {
        description: `${Object.keys(res?.summary?.collections || {}).length} colecciones · ${res?.summary?.files_restored || 0} archivos`,
      });
      // Refresh everything so the UI reflects the restored data
      await refreshAll();
    } catch (e) {
      toast.error("Error al restaurar", {
        description: e?.response?.data?.detail || e?.message,
      });
    } finally {
      setRestoreBusy(false);
    }
  };

  const draft = aiCfgDraft || {};
  const dirty = aiCfg && JSON.stringify(aiCfgDraft) !== JSON.stringify(aiCfg);

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
        <Button
          data-testid="teach-change-pwd-btn"
          onClick={() => setShowPwdModal(true)}
          variant="outline"
          className="rounded-full"
        >
          <KeyRound className="w-4 h-4 mr-2" /> Cambiar contraseña
        </Button>
      </div>

      {/* Global variant manager */}
      <Card data-testid="variant-manager" className="p-4 mb-4 border border-slate-200 dark:border-slate-700 rounded-xl bg-gradient-to-r from-blue-50 to-emerald-50 dark:from-slate-900 dark:to-slate-900">
        <div className="flex flex-col sm:flex-row sm:items-center gap-3">
          <span className="w-10 h-10 rounded-md bg-[#002FA7] text-white flex items-center justify-center shrink-0">
            <Globe2 className="w-5 h-5" />
          </span>
          <div className="flex-1 min-w-0">
            <div className="font-display font-semibold">Variante de lengua de signos activa</div>
            <p className="text-xs text-slate-600 dark:text-slate-300">
              La aplicación priorizará esta variante en todas las traducciones.
              <span className="block sm:inline sm:ml-1 text-amber-700 dark:text-amber-300">
                <AlertTriangle className="inline w-3 h-3 mr-0.5" />
                El lenguaje de signos puede variar según país, región o comunidad.
              </span>
            </p>
          </div>
          <Select value={variant} onValueChange={setVariant}>
            <SelectTrigger data-testid="variant-select" className="sm:w-72 bg-white dark:bg-slate-800">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {VARIANTS.map((v) => (
                <SelectItem key={v.value} value={v.value}>
                  {v.flag} {v.label}
                  {v.priority && (
                    <span className="ml-1.5 text-[10px] text-emerald-600 font-semibold">
                      · prioridad
                    </span>
                  )}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </Card>

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
        {/* Hidden replace input — triggered via startReplace */}
        <input
          ref={replaceInputRef}
          type="file"
          accept=".pdf,.docx,.doc,.png,.jpg,.jpeg,.webp,.mp4,.webm,.mov"
          onChange={(e) => handleReplaceFile(e.target.files?.[0])}
          className="hidden"
          data-testid="teach-replace-input"
        />
        <TabsList className="w-full justify-start overflow-x-auto" data-testid="teach-tabs">
          <TabsTrigger value="upload" data-testid="tab-upload">
            <Upload className="w-4 h-4 mr-1.5" /> Subir
          </TabsTrigger>
          <TabsTrigger value="videos" data-testid="tab-videos">
            <Film className="w-4 h-4 mr-1.5" /> Vídeos ({videos.length})
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
          <TabsTrigger value="ai" data-testid="tab-ai-config">
            <Settings2 className="w-4 h-4 mr-1.5" /> Configuración IA
          </TabsTrigger>
          <TabsTrigger value="apikey" data-testid="tab-api-key">
            <Key className="w-4 h-4 mr-1.5" /> API IA
          </TabsTrigger>
          <TabsTrigger value="backup" data-testid="tab-backup">
            <Archive className="w-4 h-4 mr-1.5" /> Copia de seguridad
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
                          data-testid={`teach-replace-${f.id}`}
                          size="sm"
                          variant="ghost"
                          onClick={() => startReplace(f.id)}
                          title="Reemplazar archivo"
                        >
                          <ReplaceAll className="w-4 h-4" />
                        </Button>
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

        {/* ---- TAB 1.5: Vídeos de referencia ---- */}
        <TabsContent value="videos" className="mt-5">
          <Card className="p-5 mb-5 border border-violet-200 dark:border-violet-900 bg-violet-50/50 dark:bg-violet-950/20 rounded-xl">
            <h3 className="font-display text-lg font-semibold mb-2 flex items-center gap-2">
              <Film className="w-5 h-5 text-violet-700" /> Vídeos de referencia visual
            </h3>
            <p className="text-sm text-slate-600 dark:text-slate-300">
              Sube vídeos de personas signando y la IA extraerá la configuración
              de manos, expresiones y movimiento. Estos vídeos sirven después
              como <strong>referencia visual del avatar</strong>: cuando se reproduce una palabra
              que aparece en alguno de tus vídeos, se mostrará el clip junto al
              avatar 3D para comparar.
            </p>
          </Card>

          {videos.length === 0 ? (
            <Card data-testid="videos-empty" className="p-10 text-center text-slate-500 border border-slate-200 dark:border-slate-700 rounded-xl">
              <Film className="w-10 h-10 mx-auto text-slate-300 mb-2" />
              <p>Aún no has subido vídeos.</p>
              <p className="text-xs mt-1">
                Ve a la pestaña <strong>Subir</strong> y arrastra un .mp4, .mov o .webm.
              </p>
            </Card>
          ) : (
            <div data-testid="videos-grid" className="grid sm:grid-cols-2 lg:grid-cols-3 gap-5">
              {videos.map((v) => (
                <VideoReferenceCard
                  key={v.id}
                  video={v}
                  password={password}
                  blobUrl={videoBlobs[v.id]}
                  onLoaded={(url) => setVideoBlobs((s) => ({ ...s, [v.id]: url }))}
                  onDelete={() => removeFile(v.id)}
                  onReprocess={() => reprocess(v.id)}
                />
              ))}
            </div>
          )}
        </TabsContent>
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
              <Select value={kbConfidence} onValueChange={setKbConfidence}>
                <SelectTrigger data-testid="kb-confidence" className="w-full sm:w-36">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Todas</SelectItem>
                  <SelectItem value="alta">Alta</SelectItem>
                  <SelectItem value="media">Media</SelectItem>
                  <SelectItem value="baja">Baja (dudosos)</SelectItem>
                </SelectContent>
              </Select>
              <Button data-testid="kb-search-btn" onClick={refreshKb} className="btn-ikb">
                {kbLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : "Buscar"}
              </Button>
            </div>
            <div className="flex items-center justify-between mt-3">
              <button
                data-testid="kb-doubtful-toggle"
                onClick={() => {
                  const next = !showDoubtfulOnly;
                  setShowDoubtfulOnly(next);
                  if (next) setKbConfidence("baja");
                  setTimeout(refreshKb, 50);
                }}
                className={`text-xs px-3 py-1.5 rounded-full border transition-colors ${
                  showDoubtfulOnly
                    ? "bg-amber-500 text-white border-amber-500"
                    : "bg-white dark:bg-slate-800 border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-300 hover:border-amber-400"
                }`}
              >
                <AlertTriangle className="inline w-3 h-3 mr-1" />
                {showDoubtfulOnly ? "Mostrando solo dudosos" : "Mostrar solo signos dudosos"}
              </button>
              <span className="text-xs text-slate-500">
                {kb.length} resultado{kb.length === 1 ? "" : "s"}
              </span>
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

        {/* ---- TAB 5: Configuración IA ---- */}
        <TabsContent value="ai" className="mt-5">
          {!draft.text_model ? (
            <Card className="p-10 text-center text-slate-500 border border-slate-200 dark:border-slate-700 rounded-xl">
              <Loader2 className="w-6 h-6 animate-spin mx-auto" />
            </Card>
          ) : (
            <div className="grid lg:grid-cols-3 gap-5">
              {/* Settings */}
              <div className="lg:col-span-2 space-y-5">
                <Card className="p-5 border border-slate-200 dark:border-slate-700 rounded-xl">
                  <h3 className="font-display text-lg font-semibold mb-1 flex items-center gap-2">
                    <Settings2 className="w-5 h-5 text-[#002FA7]" /> Modelos
                  </h3>
                  <p className="text-xs text-slate-500 mb-4">
                    Elige qué modelos usa la IA para analizar tus archivos.
                  </p>
                  <div className="grid sm:grid-cols-2 gap-3">
                    <div>
                      <label className="text-xs font-medium block mb-1">
                        Modelo para texto (PDF/Word)
                      </label>
                      <Select
                        value={draft.text_model}
                        onValueChange={(v) => setAiCfgDraft({ ...draft, text_model: v })}
                      >
                        <SelectTrigger data-testid="ai-text-model">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          {(aiCfg?.available_text_models || []).map((m) => (
                            <SelectItem key={m} value={m}>{m}</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                    <div>
                      <label className="text-xs font-medium block mb-1">
                        Modelo para imágenes/vídeo
                      </label>
                      <Select
                        value={draft.vision_model}
                        onValueChange={(v) => setAiCfgDraft({ ...draft, vision_model: v })}
                      >
                        <SelectTrigger data-testid="ai-vision-model">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          {(aiCfg?.available_vision_models || []).map((m) => (
                            <SelectItem key={m} value={m}>{m}</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                  </div>
                </Card>

                <Card className="p-5 border border-slate-200 dark:border-slate-700 rounded-xl">
                  <div className="flex items-start justify-between mb-1">
                    <div>
                      <h3 className="font-display text-lg font-semibold flex items-center gap-2">
                        <Wand2 className="w-5 h-5 text-emerald-700" /> Instrucciones a la IA (System Prompt)
                      </h3>
                      <p className="text-xs text-slate-500">
                        Describe a la IA QUÉ debe extraer y CÓMO formatearlo.
                      </p>
                    </div>
                    <Button
                      data-testid="ai-prompt-restore"
                      variant="outline"
                      size="sm"
                      onClick={() =>
                        setAiCfgDraft({
                          ...draft,
                          system_prompt: aiCfg?.default_system_prompt || draft.system_prompt,
                        })
                      }
                    >
                      <RotateCcw className="w-3.5 h-3.5 mr-1" /> Default
                    </Button>
                  </div>
                  <Textarea
                    data-testid="ai-system-prompt"
                    value={draft.system_prompt}
                    onChange={(e) => setAiCfgDraft({ ...draft, system_prompt: e.target.value })}
                    rows={11}
                    className="font-mono text-xs"
                    placeholder="Eres un asistente experto…"
                  />
                  <div className="mt-2 text-[11px] text-slate-400">
                    {(draft.system_prompt || "").length} caracteres
                  </div>
                </Card>

                <Card className="p-5 border border-slate-200 dark:border-slate-700 rounded-xl">
                  <h3 className="font-display text-lg font-semibold mb-1">Procesamiento</h3>
                  <p className="text-xs text-slate-500 mb-4">
                    Controla la profundidad y velocidad del análisis.
                  </p>
                  <div className="grid sm:grid-cols-3 gap-4">
                    <NumField
                      testId="ai-max-text-chunks"
                      label="Trozos por archivo"
                      hint="Máx. trozos de ~10k caracteres a procesar por PDF/Word"
                      min={1}
                      max={20}
                      value={draft.max_text_chunks}
                      onChange={(v) => setAiCfgDraft({ ...draft, max_text_chunks: v })}
                    />
                    <NumField
                      testId="ai-max-image-batch"
                      label="Imágenes por llamada"
                      hint="Cuántas imágenes/frames se mandan juntos"
                      min={1}
                      max={8}
                      value={draft.max_image_batch}
                      onChange={(v) => setAiCfgDraft({ ...draft, max_image_batch: v })}
                    />
                    <NumField
                      testId="ai-video-frames"
                      label="Frames por vídeo"
                      hint="Cuántos fotogramas se extraen de cada vídeo"
                      min={2}
                      max={20}
                      value={draft.video_frames_count}
                      onChange={(v) => setAiCfgDraft({ ...draft, video_frames_count: v })}
                    />
                  </div>
                  <div className="grid sm:grid-cols-2 gap-4 mt-4">
                    <div>
                      <label className="text-xs font-medium block mb-1">Confianza mínima</label>
                      <Select
                        value={draft.min_confidence_keep}
                        onValueChange={(v) => setAiCfgDraft({ ...draft, min_confidence_keep: v })}
                      >
                        <SelectTrigger data-testid="ai-min-confidence">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="baja">Baja (guardar todo)</SelectItem>
                          <SelectItem value="media">Media (recomendado)</SelectItem>
                          <SelectItem value="alta">Alta (solo signos seguros)</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                    <label className="flex items-center gap-2 mt-5 cursor-pointer text-sm">
                      <input
                        data-testid="ai-auto-process"
                        type="checkbox"
                        checked={!!draft.auto_process}
                        onChange={(e) => setAiCfgDraft({ ...draft, auto_process: e.target.checked })}
                        className="accent-[#002FA7] w-4 h-4"
                      />
                      Procesar automáticamente al subir
                    </label>
                  </div>
                </Card>

                <div className="flex flex-wrap gap-2">
                  <Button
                    data-testid="ai-save"
                    onClick={saveAiConfig}
                    disabled={!dirty || aiCfgSaving}
                    className="btn-ikb"
                  >
                    {aiCfgSaving ? (
                      <Loader2 className="w-4 h-4 animate-spin mr-2" />
                    ) : (
                      <CheckCircle2 className="w-4 h-4 mr-2" />
                    )}
                    Guardar configuración
                  </Button>
                  <Button
                    data-testid="ai-test"
                    onClick={testAiConfig}
                    disabled={aiCfgTesting}
                    variant="outline"
                  >
                    {aiCfgTesting ? (
                      <Loader2 className="w-4 h-4 animate-spin mr-2" />
                    ) : (
                      <Sparkles className="w-4 h-4 mr-2" />
                    )}
                    Probar configuración
                  </Button>
                  <Button
                    data-testid="ai-reset"
                    onClick={resetAiConfig}
                    variant="ghost"
                    className="text-slate-500"
                  >
                    <RotateCcw className="w-4 h-4 mr-2" /> Restaurar por defecto
                  </Button>
                </div>
              </div>

              {/* Sidebar: status + test result */}
              <aside className="space-y-3">
                <Card className="p-4 border border-slate-200 dark:border-slate-700 rounded-xl">
                  <h4 className="font-display font-semibold mb-2">Estado</h4>
                  <div className="space-y-2 text-xs">
                    <Row k="Modelo texto" v={aiCfg?.text_model} />
                    <Row k="Modelo visión" v={aiCfg?.vision_model} />
                    <Row k="Auto-procesar" v={aiCfg?.auto_process ? "Sí" : "No"} />
                    <Row
                      k="Última actualización"
                      v={aiCfg?.updated_at ? new Date(aiCfg.updated_at).toLocaleString() : "—"}
                    />
                  </div>
                </Card>

                {aiCfgTestResult && (
                  <Card
                    data-testid="ai-test-result"
                    className={`p-4 border rounded-xl ${
                      aiCfgTestResult.ok
                        ? "border-emerald-200 bg-emerald-50 dark:bg-emerald-950/30 dark:border-emerald-900"
                        : "border-red-200 bg-red-50 dark:bg-red-950/30 dark:border-red-900"
                    }`}
                  >
                    <h4 className="font-display font-semibold mb-2 flex items-center gap-2">
                      {aiCfgTestResult.ok ? (
                        <>
                          <CheckCircle2 className="w-4 h-4 text-emerald-700" /> Test exitoso
                        </>
                      ) : (
                        <>
                          <XCircle className="w-4 h-4 text-red-700" /> Test falló
                        </>
                      )}
                    </h4>
                    {aiCfgTestResult.ok ? (
                      <>
                        <p className="text-xs mb-2">
                          Modelo: <strong>{aiCfgTestResult.model_used}</strong> ·
                          Signos extraídos: <strong>{aiCfgTestResult.items_extracted}</strong>
                        </p>
                        {(aiCfgTestResult.preview || []).map((p, i) => (
                          <div key={i} className="text-[11px] bg-white/60 dark:bg-slate-900 rounded p-2 mb-1">
                            <strong>{p.word}</strong> ({p.language}) · {p.confidence}
                            <div className="text-slate-600 dark:text-slate-400">
                              Manos: {p.hands?.slice(0, 80)}…
                            </div>
                          </div>
                        ))}
                      </>
                    ) : (
                      <p className="text-xs font-mono break-all">{aiCfgTestResult.error}</p>
                    )}
                  </Card>
                )}

                <Card className="p-4 border border-amber-200 dark:border-amber-900 bg-amber-50/50 dark:bg-amber-950/20 rounded-xl text-xs">
                  <p className="text-amber-900 dark:text-amber-200">
                    <AlertTriangle className="inline w-3 h-3 mr-1" />
                    Cambiar de modelo afecta a TODAS las próximas extracciones
                    pero NO re-procesa archivos antiguos. Para que un archivo
                    use la nueva configuración, vuelve a darle "Re-procesar".
                  </p>
                </Card>
              </aside>
            </div>
          )}
        </TabsContent>

        {/* ---- TAB 6: API IA (custom OpenAI key) ---- */}
        <TabsContent value="apikey" className="mt-5" data-testid="tab-content-api-key">
          <div className="grid lg:grid-cols-3 gap-5">
            {/* Form */}
            <div className="lg:col-span-2 space-y-5">
              <Card className="p-5 border border-slate-200 dark:border-slate-700 rounded-xl">
                <h3 className="font-display text-lg font-semibold mb-1 flex items-center gap-2">
                  <Key className="w-5 h-5 text-[#002FA7]" /> Tu clave API de OpenAI
                </h3>
                <p className="text-xs text-slate-500 mb-4">
                  Pega tu propia clave (sk-…) para usarla en lugar de la clave universal de Emergent.
                  Se cifra antes de guardarse en MongoDB y nunca se devuelve en plano.
                </p>
                <div className="flex flex-col sm:flex-row gap-2">
                  <div className="flex-1 relative">
                    <Input
                      data-testid="api-key-input"
                      type={apiKeyShow ? "text" : "password"}
                      placeholder="sk-proj-…"
                      value={apiKeyDraft}
                      onChange={(e) => setApiKeyDraft(e.target.value)}
                      className="pr-10 font-mono text-sm"
                    />
                    <button
                      type="button"
                      onClick={() => setApiKeyShow((s) => !s)}
                      className="absolute right-2 top-1/2 -translate-y-1/2 p-1 text-slate-400 hover:text-slate-700"
                      data-testid="api-key-toggle-visibility"
                      aria-label={apiKeyShow ? "Ocultar clave" : "Mostrar clave"}
                    >
                      {apiKeyShow ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                    </button>
                  </div>
                  <Button
                    data-testid="api-key-save-btn"
                    onClick={saveApiKey}
                    disabled={apiKeyBusy || !apiKeyDraft.trim()}
                    className="btn-ikb"
                  >
                    {apiKeyBusy ? <Loader2 className="w-4 h-4 animate-spin" /> : <CheckCircle2 className="w-4 h-4 mr-1.5" />}
                    Guardar
                  </Button>
                </div>
                <p className="text-[11px] text-slate-400 mt-2">
                  Obtén tu clave en <a href="https://platform.openai.com/api-keys" target="_blank" rel="noreferrer" className="underline">platform.openai.com/api-keys</a>.
                </p>
              </Card>

              <Card className="p-5 border border-slate-200 dark:border-slate-700 rounded-xl">
                <h3 className="font-display text-lg font-semibold mb-3 flex items-center gap-2">
                  <Sparkles className="w-5 h-5 text-emerald-600" /> Probar la clave activa
                </h3>
                <div className="flex flex-wrap gap-2">
                  <Button
                    data-testid="api-key-verify-btn"
                    onClick={verifyApiKey}
                    disabled={apiKeyBusy}
                    variant="outline"
                  >
                    {apiKeyBusy ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <CheckCircle2 className="w-4 h-4 mr-2" />}
                    Verificar
                  </Button>
                  {apiKeyInfo?.has_custom_key && (
                    <Button
                      data-testid="api-key-delete-btn"
                      onClick={removeApiKey}
                      disabled={apiKeyBusy}
                      variant="outline"
                      className="text-red-600 border-red-200 hover:bg-red-50"
                    >
                      <Trash2 className="w-4 h-4 mr-2" /> Eliminar y volver a Emergent
                    </Button>
                  )}
                </div>
                {apiKeyTestResult && (
                  <div
                    data-testid="api-key-test-result"
                    className={`mt-4 p-3 rounded-lg text-sm border ${
                      apiKeyTestResult.ok
                        ? "border-emerald-200 bg-emerald-50 text-emerald-800"
                        : "border-red-200 bg-red-50 text-red-700"
                    }`}
                  >
                    {apiKeyTestResult.ok ? (
                      <>
                        <CheckCircle2 className="w-4 h-4 inline mr-1" />
                        Conexión OK · clave <strong>{apiKeyTestResult.source === "custom" ? "personal" : "Emergent universal"}</strong>
                        {apiKeyTestResult.model_used && <> · modelo {apiKeyTestResult.model_used}</>}
                      </>
                    ) : (
                      <>
                        <XCircle className="w-4 h-4 inline mr-1" />
                        Error: {apiKeyTestResult.error}
                      </>
                    )}
                  </div>
                )}
              </Card>
            </div>

            {/* Right rail: status */}
            <div className="space-y-3">
              <Card className="p-5 border border-slate-200 dark:border-slate-700 rounded-xl bg-gradient-to-b from-slate-50 to-white dark:from-slate-900 dark:to-slate-900/40">
                <h4 className="font-display font-semibold mb-3 flex items-center gap-2">
                  <Database className="w-4 h-4 text-[#002FA7]" /> Estado actual
                </h4>
                <div className="space-y-3 text-sm">
                  <div>
                    <div className="text-xs uppercase tracking-wide text-slate-500">Clave activa</div>
                    {apiKeyInfo?.has_custom_key ? (
                      <Badge data-testid="api-key-status-custom" className="bg-[#002FA7] text-white mt-1">
                        Tu clave personal {apiKeyInfo.masked_key}
                      </Badge>
                    ) : (
                      <Badge data-testid="api-key-status-emergent" className="bg-emerald-600 text-white mt-1">
                        Clave Emergent (universal)
                      </Badge>
                    )}
                  </div>
                  <div>
                    <div className="text-xs uppercase tracking-wide text-slate-500">Fuente</div>
                    <div className="text-slate-700 dark:text-slate-200 font-mono text-xs">
                      {apiKeyInfo?.active_source || "—"}
                    </div>
                  </div>
                  <div className="pt-2 border-t border-slate-200 dark:border-slate-700 text-[11px] text-slate-500 leading-relaxed">
                    Cuando tengas tu propia clave, todas las extracciones de
                    documentos y la generación texto-a-signos usarán esa clave.
                    Si la eliminas o no la has añadido, se usa la clave
                    universal incluida con la cuenta Emergent.
                  </div>
                </div>
              </Card>
            </div>
          </div>
        </TabsContent>

        {/* ---- TAB 7: Copia de seguridad ---- */}
        <TabsContent value="backup" className="mt-5" data-testid="tab-content-backup">
          <div className="grid lg:grid-cols-2 gap-5">
            {/* Download */}
            <Card className="p-5 border border-slate-200 dark:border-slate-700 rounded-xl">
              <h3 className="font-display text-lg font-semibold flex items-center gap-2 mb-1">
                <Download className="w-5 h-5 text-[#002FA7]" /> Descargar backup
              </h3>
              <p className="text-xs text-slate-500 mb-4">
                Archivo ZIP con todas las colecciones MongoDB (diccionario, KB Enseñanzas, correcciones, configuración IA, clave API cifrada, contraseña admin) y los archivos subidos en la zona Enseñanzas.
              </p>
              {backupPreview && (
                <div className="space-y-1.5 text-xs bg-slate-50 dark:bg-slate-900/40 rounded-lg p-3 mb-4 border border-slate-200 dark:border-slate-700">
                  {Object.entries(backupPreview.collections || {}).map(([k, v]) => (
                    <div key={k} className="flex justify-between">
                      <span className="font-mono text-slate-600 dark:text-slate-300">{k}</span>
                      <span className="font-semibold">{v}</span>
                    </div>
                  ))}
                  <div className="flex justify-between pt-1.5 mt-1.5 border-t border-slate-200 dark:border-slate-700">
                    <span className="font-mono text-slate-600 dark:text-slate-300">archivos Enseñanzas</span>
                    <span className="font-semibold">
                      {backupPreview.files_count} · {(backupPreview.files_bytes / 1024).toFixed(1)} KB
                    </span>
                  </div>
                </div>
              )}
              <Button
                data-testid="backup-download-btn"
                onClick={downloadBackup}
                disabled={backupBusy}
                className="btn-ikb w-full"
              >
                {backupBusy ? (
                  <><Loader2 className="w-4 h-4 mr-2 animate-spin" /> Preparando…</>
                ) : (
                  <><Download className="w-4 h-4 mr-2" /> Descargar ZIP</>
                )}
              </Button>
            </Card>

            {/* Restore */}
            <Card className="p-5 border border-slate-200 dark:border-slate-700 rounded-xl">
              <h3 className="font-display text-lg font-semibold flex items-center gap-2 mb-1">
                <Upload className="w-5 h-5 text-emerald-600" /> Restaurar backup
              </h3>
              <p className="text-xs text-slate-500 mb-4">
                Sube un ZIP previamente descargado. Se reemplazarán las colecciones por completo. Los archivos se añaden al directorio Enseñanzas (o se reemplazan si marcas la opción).
              </p>
              <div className="space-y-3">
                <Input
                  type="file"
                  accept=".zip,application/zip"
                  data-testid="backup-restore-file"
                  onChange={(e) => {
                    setRestoreFile(e.target.files?.[0] || null);
                    setRestoreResult(null);
                  }}
                />
                {restoreFile && (
                  <div className="text-xs text-slate-600 dark:text-slate-300 bg-slate-50 dark:bg-slate-900/40 rounded-lg p-2.5 border border-slate-200 dark:border-slate-700">
                    <strong>{restoreFile.name}</strong> · {(restoreFile.size / 1024).toFixed(1)} KB
                  </div>
                )}
                <label className="flex items-center gap-2 text-xs text-slate-600 dark:text-slate-300 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={restoreWipe}
                    onChange={(e) => setRestoreWipe(e.target.checked)}
                    data-testid="backup-restore-wipe"
                  />
                  Borrar archivos existentes antes de restaurar
                </label>
                <Button
                  data-testid="backup-restore-btn"
                  onClick={doRestore}
                  disabled={restoreBusy || !restoreFile}
                  variant="outline"
                  className="w-full border-emerald-300 text-emerald-700 hover:bg-emerald-50"
                >
                  {restoreBusy ? (
                    <><Loader2 className="w-4 h-4 mr-2 animate-spin" /> Restaurando…</>
                  ) : (
                    <><Upload className="w-4 h-4 mr-2" /> Restaurar</>
                  )}
                </Button>
              </div>

              {restoreResult && (
                <div
                  data-testid="backup-restore-result"
                  className="mt-4 p-3 rounded-lg text-sm border border-emerald-200 bg-emerald-50 text-emerald-800"
                >
                  <div className="flex items-center gap-1 font-semibold mb-1">
                    <CheckCircle2 className="w-4 h-4" /> Restauración completada
                  </div>
                  <div className="text-xs space-y-0.5">
                    {Object.entries(restoreResult.summary?.collections || {}).map(([k, v]) => (
                      <div key={k}>· {k}: {v} documentos</div>
                    ))}
                    <div>· Archivos restaurados: {restoreResult.summary?.files_restored || 0}</div>
                    {restoreResult.summary?.files_skipped > 0 && (
                      <div className="text-amber-700">· Archivos saltados: {restoreResult.summary.files_skipped}</div>
                    )}
                  </div>
                </div>
              )}
            </Card>
          </div>
        </TabsContent>
      </Tabs>

      {/* Change-password modal */}
      {showPwdModal && (
        <div
          className="fixed inset-0 z-50 bg-black/40 backdrop-blur-sm flex items-center justify-center p-4"
          onClick={() => !pwdBusy && setShowPwdModal(false)}
          data-testid="change-pwd-modal-backdrop"
        >
          <Card
            className="w-full max-w-md p-6 rounded-2xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900"
            onClick={(e) => e.stopPropagation()}
          >
            <h3 className="font-display text-xl font-semibold flex items-center gap-2 mb-1">
              <KeyRound className="w-5 h-5 text-[#002FA7]" /> Cambiar contraseña admin
            </h3>
            <p className="text-xs text-slate-500 mb-4">
              La nueva contraseña se guarda en MongoDB y se aplica al instante.
            </p>
            <div className="space-y-3">
              <div>
                <label className="text-xs text-slate-500 mb-1 block">Contraseña actual</label>
                <Input
                  type="password"
                  value={pwdCurrent}
                  onChange={(e) => setPwdCurrent(e.target.value)}
                  data-testid="change-pwd-current"
                  autoFocus
                />
              </div>
              <div>
                <label className="text-xs text-slate-500 mb-1 block">Nueva contraseña</label>
                <Input
                  type="password"
                  value={pwdNew}
                  onChange={(e) => setPwdNew(e.target.value)}
                  data-testid="change-pwd-new"
                />
              </div>
              <div>
                <label className="text-xs text-slate-500 mb-1 block">Confirmar nueva</label>
                <Input
                  type="password"
                  value={pwdConfirm}
                  onChange={(e) => setPwdConfirm(e.target.value)}
                  data-testid="change-pwd-confirm"
                  onKeyDown={(e) => e.key === "Enter" && submitChangePassword()}
                />
              </div>
            </div>
            <div className="flex justify-end gap-2 mt-5">
              <Button
                variant="outline"
                onClick={() => setShowPwdModal(false)}
                disabled={pwdBusy}
                data-testid="change-pwd-cancel"
              >
                Cancelar
              </Button>
              <Button
                onClick={submitChangePassword}
                disabled={pwdBusy || !pwdCurrent || !pwdNew || !pwdConfirm}
                className="btn-ikb"
                data-testid="change-pwd-submit"
              >
                {pwdBusy ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <CheckCircle2 className="w-4 h-4 mr-2" />}
                Guardar
              </Button>
            </div>
          </Card>
        </div>
      )}
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

const NumField = ({ testId, label, hint, value, min, max, onChange }) => (
  <div>
    <label className="text-xs font-medium block mb-1">{label}</label>
    <Input
      data-testid={testId}
      type="number"
      min={min}
      max={max}
      value={value ?? ""}
      onChange={(e) => onChange(parseInt(e.target.value || "0", 10))}
      className="font-mono"
    />
    <p className="text-[10px] text-slate-400 mt-0.5">{hint}</p>
  </div>
);

const Row = ({ k, v }) => (
  <div className="flex items-center justify-between gap-2">
    <span className="text-slate-500">{k}</span>
    <span className="font-mono text-right text-slate-800 dark:text-slate-200 truncate max-w-[60%]" title={v || ""}>
      {v || "—"}
    </span>
  </div>
);

function VideoReferenceCard({ video, password, blobUrl, onLoaded, onDelete, onReprocess }) {
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState("");

  useEffect(() => {
    if (blobUrl || loading) return;
    let cancelled = false;
    setLoading(true);
    fetchVideoBlobUrl(password, video.id)
      .then((url) => {
        if (cancelled) {
          URL.revokeObjectURL(url);
        } else {
          onLoaded(url);
        }
      })
      .catch(() => {
        if (!cancelled) setErr("No se pudo cargar el vídeo");
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [video.id]);

  return (
    <Card
      data-testid={`video-card-${video.id}`}
      className="overflow-hidden border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 rounded-xl flex flex-col"
    >
      <div className="aspect-video bg-slate-950 relative flex items-center justify-center">
        {blobUrl ? (
          <video
            data-testid={`video-player-${video.id}`}
            src={blobUrl}
            controls
            playsInline
            className="w-full h-full object-contain"
          />
        ) : loading ? (
          <Loader2 className="w-8 h-8 animate-spin text-white/60" />
        ) : (
          <span className="text-white/50 text-sm">{err || "Vídeo no disponible"}</span>
        )}
      </div>
      <div className="p-3 flex-1 flex flex-col">
        <div className="font-medium text-sm truncate">
          {video.label ? `${video.label} · ` : ""}
          {video.filename}
        </div>
        <div className="text-xs text-slate-500 mt-0.5 flex flex-wrap gap-x-2.5">
          <span>{(video.size / (1024 * 1024)).toFixed(1)} MB</span>
          {video.kb_count > 0 && (
            <span className="text-emerald-700 dark:text-emerald-300">
              +{video.kb_count} signos extraídos
            </span>
          )}
        </div>
        {(video.kb_words || []).length > 0 && (
          <div className="mt-2 flex flex-wrap gap-1">
            {(video.kb_words || []).slice(0, 6).map((w, i) => (
              <Badge
                key={i}
                className={`text-[10px] border-0 ${
                  w.confidence === "alta"
                    ? "bg-emerald-100 text-emerald-700"
                    : w.confidence === "media"
                      ? "bg-amber-100 text-amber-700"
                      : "bg-slate-100 text-slate-600"
                }`}
              >
                {w.word}
              </Badge>
            ))}
            {(video.kb_words || []).length > 6 && (
              <span className="text-[10px] text-slate-400 self-center">
                +{video.kb_words.length - 6} más
              </span>
            )}
          </div>
        )}
        <div className="flex gap-1.5 mt-auto pt-3 border-t border-slate-100 dark:border-slate-800">
          <Button
            data-testid={`video-reprocess-${video.id}`}
            size="sm"
            variant="outline"
            onClick={onReprocess}
            disabled={video.status === "processing"}
            className="flex-1"
          >
            <RefreshCw className="w-3.5 h-3.5 mr-1.5" />
            Re-procesar
          </Button>
          <Button
            data-testid={`video-delete-${video.id}`}
            size="sm"
            variant="ghost"
            onClick={onDelete}
            className="text-slate-400 hover:text-red-600"
          >
            <Trash2 className="w-3.5 h-3.5" />
          </Button>
        </div>
      </div>
    </Card>
  );
}
