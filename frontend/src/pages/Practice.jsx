import { useEffect, useRef, useState } from "react";
import { useSearchParams } from "react-router-dom";
import SignCamera from "../components/SignCamera";
import { Card } from "../components/ui/card";
import { Button } from "../components/ui/button";
import { Badge } from "../components/ui/badge";
import { Progress } from "../components/ui/progress";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "../components/ui/select";
import {
  Trophy,
  Target,
  Sparkles,
  Loader2,
  Flame,
  Award,
  RefreshCw,
} from "lucide-react";
import { getDictionary, validatePractice } from "../lib/api";
import { useProgress } from "../hooks/useProgress";
import { toast } from "sonner";

const VERDICT_COLOR = {
  perfecto: "bg-emerald-500",
  bueno: "bg-emerald-400",
  aceptable: "bg-amber-500",
  incorrecto: "bg-red-500",
};

export default function Practice() {
  const [params, setParams] = useSearchParams();
  const [items, setItems] = useState([]);
  const [target, setTarget] = useState(null);
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState(null);
  const framesBufRef = useRef([]);
  const { state, recordSignAttempt, xpForNext } = useProgress();

  useEffect(() => {
    getDictionary().then((d) => {
      setItems(d);
      const w = params.get("word");
      const initial =
        (w && d.find((x) => x.word.toLowerCase() === w.toLowerCase())) ||
        d[Math.floor(Math.random() * d.length)];
      setTarget(initial);
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const pickRandom = () => {
    if (!items.length) return;
    let next = items[Math.floor(Math.random() * items.length)];
    if (target && items.length > 1 && next.word === target.word) {
      next = items[(items.indexOf(next) + 1) % items.length];
    }
    setTarget(next);
    setResult(null);
    setParams({ word: next.word });
  };

  const onFrames = (frames) => {
    if (!frames) return;
    framesBufRef.current = frames.slice(-8);
  };

  const handleEvaluate = async () => {
    if (!target || framesBufRef.current.length < 4) {
      toast.error("Espera unos segundos para capturar el signo");
      return;
    }
    setBusy(true);
    setResult(null);
    try {
      const res = await validatePractice({
        frames: framesBufRef.current.slice(-8),
        expected_word: target.word,
        language: target.language,
      });
      setResult(res);
      const key = `${target.language}:${target.word}`;
      recordSignAttempt(key, res.score);
    } catch (e) {
      toast.error("Error al evaluar", {
        description: e?.response?.data?.detail || e?.message,
      });
    } finally {
      setBusy(false);
    }
  };

  const xpInLvl = state.xp;
  const pct = Math.min(100, Math.round((xpInLvl / xpForNext) * 100));

  return (
    <div className="max-w-[1400px] mx-auto px-4 sm:px-8 py-8">
      <div className="flex items-start gap-3 mb-6">
        <span className="w-10 h-10 rounded-md bg-[#002FA7] text-white flex items-center justify-center shrink-0">
          <Target className="w-5 h-5" />
        </span>
        <div className="flex-1">
          <h1 className="font-display text-3xl sm:text-4xl font-semibold">
            Práctica guiada
          </h1>
          <p className="text-slate-600 dark:text-slate-300 mt-1">
            Practica un signo y la IA te dirá cómo mejorar.
          </p>
        </div>
      </div>

      {/* Stats bar */}
      <Card className="mb-6 p-4 border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 rounded-xl">
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3 items-center">
          <Stat icon={Trophy} label="Nivel" value={state.level} />
          <Stat icon={Sparkles} label="XP" value={`${xpInLvl} / ${xpForNext}`} />
          <Stat icon={Flame} label="Racha" value={`${state.streak} días`} />
          <Stat
            icon={Award}
            label="Insignias"
            value={state.badges.length}
          />
        </div>
        <Progress className="mt-3 h-2" value={pct} />
      </Card>

      <div className="grid lg:grid-cols-3 gap-6">
        <div className="lg:col-span-2">
          <SignCamera
            mode="streaming"
            frameRateMs={500}
            batchEvery={6}
            showSkeleton={true}
            onFramesReady={onFrames}
            statusText={busy ? "Analizando…" : ""}
            busy={busy}
            testIdPrefix="practice"
          />
          <div className="mt-4 flex flex-wrap gap-2">
            <Button
              data-testid="practice-evaluate"
              onClick={handleEvaluate}
              disabled={busy || !target}
              className="btn-ikb h-12 px-6 rounded-full"
            >
              {busy ? (
                <>
                  <Loader2 className="w-4 h-4 mr-2 animate-spin" /> Evaluando…
                </>
              ) : (
                <>
                  <Target className="w-4 h-4 mr-2" /> Evaluar mi signo
                </>
              )}
            </Button>
            <Button
              variant="outline"
              onClick={pickRandom}
              data-testid="practice-next"
              className="h-12 px-6 rounded-full"
            >
              <RefreshCw className="w-4 h-4 mr-2" /> Otro signo aleatorio
            </Button>
          </div>
        </div>

        <Card className="p-5 border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 rounded-xl h-fit">
          <div className="text-xs uppercase tracking-wide text-slate-500 mb-1">
            Signo a practicar
          </div>
          {target ? (
            <>
              <div className="flex items-baseline gap-3 mb-2">
                <h2 className="font-display text-3xl font-semibold">
                  {target.word}
                </h2>
                <Badge className="bg-[#002FA7] text-white border-0">
                  {target.language}
                </Badge>
              </div>
              <p className="text-sm text-slate-600 dark:text-slate-300 mb-3">
                {target.description}
              </p>
              <div className="space-y-2 text-sm border-t border-slate-100 dark:border-slate-800 pt-3">
                <div>
                  <strong className="text-slate-700 dark:text-slate-200">Manos:</strong>{" "}
                  {target.hands}
                </div>
                <div>
                  <strong className="text-slate-700 dark:text-slate-200">Boca:</strong>{" "}
                  {target.mouth}
                </div>
                <div>
                  <strong className="text-slate-700 dark:text-slate-200">Expresión:</strong>{" "}
                  {target.expression}
                </div>
              </div>

              <div className="mt-4 pt-4 border-t border-slate-100 dark:border-slate-800">
                <Select
                  value={target.word}
                  onValueChange={(v) => {
                    const n = items.find((x) => x.word === v);
                    if (n) {
                      setTarget(n);
                      setResult(null);
                    }
                  }}
                >
                  <SelectTrigger data-testid="practice-pick">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {items.slice(0, 60).map((it, i) => (
                      <SelectItem
                        key={`${it.word}-${it.language}-${i}`}
                        value={it.word}
                      >
                        {it.word} ({it.language})
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              {result && (
                <div
                  data-testid="practice-result"
                  className="mt-4 p-4 rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800/40 fade-in-up"
                >
                  <div className="flex items-center justify-between mb-2">
                    <span className="text-sm font-medium">Tu evaluación</span>
                    <Badge
                      className={`${
                        VERDICT_COLOR[result.verdict] || "bg-slate-500"
                      } text-white border-0 capitalize`}
                    >
                      {result.verdict}
                    </Badge>
                  </div>
                  <div className="font-display text-3xl font-semibold mb-2">
                    {result.score}
                    <span className="text-base text-slate-400">/100</span>
                  </div>
                  <Progress value={result.score} className="h-1.5 mb-3" />
                  {result.feedback && (
                    <p className="text-sm text-slate-700 dark:text-slate-200">
                      {result.feedback}
                    </p>
                  )}
                  {(result.strengths?.length || 0) > 0 && (
                    <div className="mt-2 text-xs text-emerald-600 dark:text-emerald-400">
                      ✓ {result.strengths.join(" · ")}
                    </div>
                  )}
                  {(result.weaknesses?.length || 0) > 0 && (
                    <div className="mt-1 text-xs text-amber-600 dark:text-amber-400">
                      ↑ {result.weaknesses.join(" · ")}
                    </div>
                  )}
                </div>
              )}
            </>
          ) : (
            <p className="text-sm text-slate-500">Cargando signos…</p>
          )}
        </Card>
      </div>
    </div>
  );
}

const Stat = ({ icon: Icon, label, value }) => (
  <div className="flex items-center gap-3">
    <span className="w-9 h-9 rounded-md bg-[#002FA7]/10 text-[#002FA7] flex items-center justify-center">
      <Icon className="w-4 h-4" />
    </span>
    <div className="leading-tight">
      <div className="text-xs text-slate-500">{label}</div>
      <div className="font-display text-lg font-semibold">{value}</div>
    </div>
  </div>
);
