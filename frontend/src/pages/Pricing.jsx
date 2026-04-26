import { useEffect, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { Card } from "../components/ui/card";
import { Button } from "../components/ui/button";
import { Badge } from "../components/ui/badge";
import { Input } from "../components/ui/input";
import { CheckCircle2, Sparkles, Loader2, ArrowRight } from "lucide-react";
import { getPlans, createCheckout, getCheckoutStatus } from "../lib/api";
import { toast } from "sonner";

export default function Pricing() {
  const [plans, setPlans] = useState(null);
  const [busyPkg, setBusyPkg] = useState(null);
  const [email, setEmail] = useState("");
  const [params, setParams] = useSearchParams();
  const [pollState, setPollState] = useState(null);

  useEffect(() => {
    getPlans().then(setPlans);
  }, []);

  // If returning from Stripe, poll status
  useEffect(() => {
    const sid = params.get("session_id");
    if (!sid) return;
    let attempts = 0;
    const poll = async () => {
      attempts += 1;
      try {
        const st = await getCheckoutStatus(sid);
        setPollState(st);
        if (st.payment_status === "paid") {
          toast.success("¡Pago confirmado!", { description: "Gracias 💜" });
          setParams({}, { replace: true });
          return;
        }
        if (st.status === "expired" || attempts >= 8) {
          toast.error("Pago no completado o expirado");
          setParams({}, { replace: true });
          return;
        }
        setTimeout(poll, 2000);
      } catch (e) {
        toast.error("Error verificando pago");
      }
    };
    poll();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handleBuy = async (packageId) => {
    setBusyPkg(packageId);
    try {
      const res = await createCheckout(packageId, window.location.origin, email);
      window.location.href = res.url;
    } catch (e) {
      toast.error("No se pudo iniciar el pago", {
        description: e?.response?.data?.detail || e?.message,
      });
    } finally {
      setBusyPkg(null);
    }
  };

  if (!plans)
    return (
      <div className="text-center py-20">
        <Loader2 className="w-6 h-6 mx-auto animate-spin text-slate-400" />
      </div>
    );

  return (
    <div className="max-w-[1100px] mx-auto px-4 sm:px-8 py-10">
      <div className="text-center mb-10">
        <Badge className="bg-slate-100 text-slate-700 border-0 mb-4">
          <Sparkles className="w-3 h-3 mr-1.5" /> Precios simples
        </Badge>
        <h1 className="font-display text-4xl sm:text-5xl font-semibold mb-3">
          Elige tu plan
        </h1>
        <p className="text-slate-600 dark:text-slate-300">
          Todas las funciones esenciales gratis. Pasa a Pro cuando lo necesites.
        </p>
      </div>

      {pollState && (
        <Card className="mb-6 p-4 border border-emerald-200 bg-emerald-50 dark:bg-emerald-950/30 rounded-xl text-center">
          <span className="text-sm">
            Estado del pago: <strong>{pollState.payment_status}</strong>
          </span>
        </Card>
      )}

      <div className="grid md:grid-cols-3 gap-5">
        <PlanCard
          label={plans.free.label}
          price="0€"
          features={plans.free.features}
          cta={<Badge className="w-full justify-center py-2 bg-slate-100 text-slate-700 border-0">Plan actual</Badge>}
        />
        {plans.packages.map((p) => (
          <PlanCard
            key={p.id}
            featured={p.id === "pro_monthly"}
            label={p.label}
            price={`${p.amount}${p.currency === "eur" ? "€" : ""}`}
            period={p.id.includes("yearly") ? "/año" : p.id.includes("team") ? "/mes (5 usuarios)" : "/mes"}
            features={p.features}
            cta={
              <Button
                data-testid={`buy-${p.id}`}
                onClick={() => handleBuy(p.id)}
                disabled={busyPkg === p.id}
                className={`w-full h-11 rounded-full ${
                  p.id === "pro_monthly" ? "btn-ikb" : ""
                }`}
              >
                {busyPkg === p.id ? (
                  <>
                    <Loader2 className="w-4 h-4 mr-2 animate-spin" /> Cargando…
                  </>
                ) : (
                  <>
                    Suscribirse <ArrowRight className="w-4 h-4 ml-2" />
                  </>
                )}
              </Button>
            }
          />
        ))}
      </div>

      <Card className="mt-8 p-5 border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-900/40 rounded-xl">
        <p className="text-sm text-slate-600 dark:text-slate-300 mb-2">
          Email de facturación (opcional, para recibir el recibo):
        </p>
        <Input
          data-testid="billing-email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          placeholder="tu@email.com"
          className="max-w-md"
        />
        <p className="text-xs text-slate-500 mt-3">
          Pago seguro con Stripe (modo prueba). Puedes cancelar en cualquier
          momento.
        </p>
      </Card>
    </div>
  );
}

const PlanCard = ({ label, price, period, features, cta, featured }) => (
  <Card
    className={`p-6 rounded-2xl border ${
      featured
        ? "border-[#002FA7] shadow-lg ring-2 ring-[#002FA7]/20"
        : "border-slate-200 dark:border-slate-700"
    } bg-white dark:bg-slate-900 relative`}
  >
    {featured && (
      <Badge className="absolute -top-2.5 left-6 bg-[#002FA7] text-white border-0">
        Más popular
      </Badge>
    )}
    <h3 className="font-display text-xl font-semibold mb-1">{label}</h3>
    <div className="font-display text-4xl font-semibold mb-1">
      {price}
      {period && (
        <span className="text-base text-slate-400 font-normal ml-1">
          {period}
        </span>
      )}
    </div>
    <ul className="my-5 space-y-2.5 text-sm">
      {features.map((f, i) => (
        <li key={i} className="flex items-start gap-2">
          <CheckCircle2 className="w-4 h-4 text-emerald-500 shrink-0 mt-0.5" />
          <span>{f}</span>
        </li>
      ))}
    </ul>
    {cta}
  </Card>
);
