import { useEffect, useState } from "react";
import { Mail, Send, Loader2 } from "lucide-react";
import { Button } from "./ui/button";
import { Input } from "./ui/input";
import { toast } from "sonner";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "./ui/dialog";
import { sendShareEmail, getEmailStatus } from "../lib/api";

/**
 * ShareEmailDialog — small reusable dialog to email a translation share link.
 * Gracefully shows a "no configurado" state when the server has no Resend key.
 */
export default function ShareEmailDialog({
  translationId,
  translationText,
  language,
  shareUrl,
  trigger,
}) {
  const [open, setOpen] = useState(false);
  const [to, setTo] = useState("");
  const [from, setFrom] = useState("");
  const [busy, setBusy] = useState(false);
  const [configured, setConfigured] = useState(true);

  useEffect(() => {
    if (open) {
      getEmailStatus()
        .then((s) => setConfigured(!!s.configured))
        .catch(() => setConfigured(false));
    }
  }, [open]);

  async function submit() {
    if (!to || !translationText || !shareUrl) return;
    setBusy(true);
    try {
      const res = await sendShareEmail({
        to,
        translation_id: translationId,
        translation_text: translationText,
        language: language || "Auto",
        sender_name: from || "Alguien",
        share_url: shareUrl,
      });
      if (res.sent) {
        toast.success("Email enviado ✉️", { description: `Para: ${to}` });
        setOpen(false);
        setTo("");
      } else if (res.reason === "resend_not_configured") {
        toast.error("Email no configurado", {
          description: "Pide al admin que añada RESEND_API_KEY en .env",
        });
      } else {
        toast.error("No se pudo enviar el email", { description: res.reason });
      }
    } catch (e) {
      toast.error("Error de red al enviar el email");
    } finally {
      setBusy(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild data-testid="share-email-trigger">
        {trigger || (
          <Button variant="outline" size="sm" className="rounded-full">
            <Mail className="w-4 h-4 mr-2" /> Enviar por email
          </Button>
        )}
      </DialogTrigger>
      <DialogContent data-testid="share-email-dialog">
        <DialogHeader>
          <DialogTitle>Enviar traducción por email</DialogTitle>
        </DialogHeader>
        {!configured && (
          <p className="text-xs text-amber-700 bg-amber-50 dark:bg-amber-950/40 dark:text-amber-300 border border-amber-200 dark:border-amber-900 rounded-md px-3 py-2">
            ⚠️ El servidor todavía no tiene <code>RESEND_API_KEY</code> configurada;
            el email no se enviará realmente.
          </p>
        )}
        <div className="space-y-3">
          <div>
            <label className="block text-xs font-medium mb-1">Para</label>
            <Input
              data-testid="share-email-to"
              type="email"
              value={to}
              onChange={(e) => setTo(e.target.value)}
              placeholder="amig@ejemplo.com"
              autoFocus
            />
          </div>
          <div>
            <label className="block text-xs font-medium mb-1">Tu nombre (opcional)</label>
            <Input
              data-testid="share-email-from"
              value={from}
              onChange={(e) => setFrom(e.target.value)}
              placeholder="Nombre"
            />
          </div>
          <div className="bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-md px-3 py-2 text-xs">
            <div className="text-slate-500 mb-1">Vista previa</div>
            <div className="font-medium line-clamp-3">{translationText}</div>
            <div className="text-slate-500 mt-1">
              Enlace: <span className="break-all">{shareUrl}</span>
            </div>
          </div>
        </div>
        <DialogFooter>
          <Button
            data-testid="share-email-send"
            onClick={submit}
            disabled={busy || !to}
            className="btn-ikb rounded-full"
          >
            {busy ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <Send className="w-4 h-4 mr-2" />}
            Enviar
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
