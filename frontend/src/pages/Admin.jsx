import { useEffect, useState } from "react";
import { Card } from "../components/ui/card";
import { Button } from "../components/ui/button";
import { Badge } from "../components/ui/badge";
import { Input } from "../components/ui/input";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "../components/ui/table";
import {
  Lock,
  KeyRound,
  Plus,
  Trash2,
  Copy,
  Loader2,
  Shield,
} from "lucide-react";
import {
  adminLogin,
  adminListKeys,
  adminCreateKey,
  adminDeleteKey,
} from "../lib/api";
import { toast } from "sonner";

const STORAGE = "sl-admin-pwd";

export default function Admin() {
  const [pwd, setPwd] = useState(() => sessionStorage.getItem(STORAGE) || "");
  const [authed, setAuthed] = useState(false);
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(false);
  const [newLabel, setNewLabel] = useState("");
  const [newLimit, setNewLimit] = useState(1000);
  const [creating, setCreating] = useState(false);
  const [createdKey, setCreatedKey] = useState(null);

  const tryLogin = async (p) => {
    try {
      await adminLogin(p);
      sessionStorage.setItem(STORAGE, p);
      setAuthed(true);
      load(p);
    } catch {
      toast.error("Contraseña incorrecta");
      sessionStorage.removeItem(STORAGE);
    }
  };

  useEffect(() => {
    if (pwd) tryLogin(pwd);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const load = async (p) => {
    setLoading(true);
    try {
      const data = await adminListKeys(p);
      setItems(data);
    } catch {
      toast.error("Error cargando keys");
    } finally {
      setLoading(false);
    }
  };

  const create = async () => {
    if (!newLabel.trim()) return;
    setCreating(true);
    try {
      const k = await adminCreateKey(pwd, newLabel.trim(), newLimit);
      setCreatedKey(k.key);
      setNewLabel("");
      load(pwd);
      toast.success("Key creada");
    } catch (e) {
      toast.error("Error", { description: e?.response?.data?.detail || e?.message });
    } finally {
      setCreating(false);
    }
  };

  const remove = async (id) => {
    if (!window.confirm("¿Borrar esta API key?")) return;
    await adminDeleteKey(pwd, id);
    load(pwd);
  };

  if (!authed) {
    return (
      <div className="max-w-md mx-auto px-4 py-16">
        <Card className="p-8 border border-slate-200 dark:border-slate-700 rounded-2xl">
          <div className="flex items-center gap-3 mb-4">
            <span className="w-10 h-10 rounded-md bg-[#002FA7] text-white flex items-center justify-center">
              <Lock className="w-5 h-5" />
            </span>
            <h1 className="font-display text-2xl font-semibold">Panel admin</h1>
          </div>
          <p className="text-sm text-slate-500 mb-4">
            Introduce la contraseña de administrador.
          </p>
          <Input
            data-testid="admin-pwd"
            type="password"
            value={pwd}
            onChange={(e) => setPwd(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && tryLogin(pwd)}
            placeholder="Contraseña"
          />
          <Button
            data-testid="admin-login-button"
            onClick={() => tryLogin(pwd)}
            className="btn-ikb mt-4 w-full h-11"
          >
            <Shield className="w-4 h-4 mr-2" /> Entrar
          </Button>
        </Card>
      </div>
    );
  }

  return (
    <div className="max-w-[1200px] mx-auto px-4 sm:px-8 py-8">
      <div className="flex items-start gap-3 mb-6">
        <span className="w-10 h-10 rounded-md bg-[#002FA7] text-white flex items-center justify-center">
          <KeyRound className="w-5 h-5" />
        </span>
        <div className="flex-1">
          <h1 className="font-display text-3xl sm:text-4xl font-semibold">
            API keys
          </h1>
          <p className="text-slate-600 dark:text-slate-300 mt-1">
            Genera tokens para integrar SignLanguage Pro en webs y apps de
            terceros.
          </p>
        </div>
        <Button
          variant="outline"
          onClick={() => {
            sessionStorage.removeItem(STORAGE);
            setAuthed(false);
            setPwd("");
          }}
        >
          Salir
        </Button>
      </div>

      {createdKey && (
        <Card className="p-4 mb-5 border border-emerald-300 bg-emerald-50 dark:bg-emerald-950/30 rounded-xl">
          <div className="flex items-center justify-between gap-3">
            <div className="min-w-0">
              <div className="text-xs uppercase tracking-wide text-emerald-700 mb-1">
                Tu nueva key (copia ahora — solo se muestra una vez)
              </div>
              <code className="text-sm font-mono text-emerald-900 dark:text-emerald-200 break-all">
                {createdKey}
              </code>
            </div>
            <Button
              size="sm"
              onClick={() => {
                navigator.clipboard.writeText(createdKey);
                toast.success("Copiada");
              }}
            >
              <Copy className="w-4 h-4 mr-1.5" /> Copiar
            </Button>
            <Button size="sm" variant="ghost" onClick={() => setCreatedKey(null)}>
              ×
            </Button>
          </div>
        </Card>
      )}

      <Card className="p-5 mb-6 border border-slate-200 dark:border-slate-700 rounded-xl">
        <h2 className="font-display text-lg font-semibold mb-3">
          Crear nueva key
        </h2>
        <div className="grid sm:grid-cols-3 gap-3">
          <Input
            data-testid="new-key-label"
            value={newLabel}
            onChange={(e) => setNewLabel(e.target.value)}
            placeholder="Etiqueta (ej: Cliente Acme)"
          />
          <Input
            data-testid="new-key-limit"
            type="number"
            min="10"
            max="100000"
            value={newLimit}
            onChange={(e) => setNewLimit(parseInt(e.target.value) || 1000)}
            placeholder="Límite diario"
          />
          <Button
            data-testid="new-key-submit"
            onClick={create}
            disabled={creating || !newLabel.trim()}
            className="btn-ikb h-11"
          >
            {creating ? (
              <Loader2 className="w-4 h-4 animate-spin" />
            ) : (
              <>
                <Plus className="w-4 h-4 mr-2" /> Generar
              </>
            )}
          </Button>
        </div>
      </Card>

      <Card className="border border-slate-200 dark:border-slate-700 rounded-xl overflow-hidden">
        {loading ? (
          <div className="p-10 text-center text-slate-400">
            <Loader2 className="w-6 h-6 animate-spin mx-auto" />
          </div>
        ) : items.length === 0 ? (
          <div className="p-10 text-center text-slate-500">
            Aún no hay API keys.
          </div>
        ) : (
          <Table>
            <TableHeader>
              <TableRow className="bg-slate-50 dark:bg-slate-800/40">
                <TableHead>Etiqueta</TableHead>
                <TableHead>Key</TableHead>
                <TableHead className="text-right">Uso hoy</TableHead>
                <TableHead className="text-right">Total</TableHead>
                <TableHead className="text-right">Límite</TableHead>
                <TableHead></TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {items.map((k) => (
                <TableRow key={k.id}>
                  <TableCell className="font-medium">{k.label}</TableCell>
                  <TableCell>
                    <code className="text-xs font-mono text-slate-500">
                      {k.key.slice(0, 12)}…{k.key.slice(-4)}
                    </code>
                  </TableCell>
                  <TableCell className="text-right">{k.usage_today}</TableCell>
                  <TableCell className="text-right">{k.usage_total}</TableCell>
                  <TableCell className="text-right">{k.daily_limit}</TableCell>
                  <TableCell>
                    <Button
                      size="icon"
                      variant="ghost"
                      onClick={() => remove(k.id)}
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
