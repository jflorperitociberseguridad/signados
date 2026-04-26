import { useEffect, useState } from "react";
import { Card } from "../components/ui/card";
import { Button } from "../components/ui/button";
import { Badge } from "../components/ui/badge";
import { Brain, CheckCircle2, XCircle, RotateCcw, Loader2 } from "lucide-react";
import { getDictionary } from "../lib/api";
import { useProgress } from "../hooks/useProgress";

function shuffle(arr) {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

export default function Quiz() {
  const [dict, setDict] = useState([]);
  const [round, setRound] = useState(null);
  const [picked, setPicked] = useState(null);
  const [loading, setLoading] = useState(true);
  const { state, recordQuiz } = useProgress();

  useEffect(() => {
    getDictionary().then((d) => {
      setDict(d);
      setLoading(false);
    });
  }, []);

  useEffect(() => {
    if (dict.length >= 4 && !round) newRound();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [dict]);

  const newRound = () => {
    if (dict.length < 4) return;
    const correct = dict[Math.floor(Math.random() * dict.length)];
    const wrongs = shuffle(dict.filter((d) => d.word !== correct.word)).slice(0, 3);
    const choices = shuffle([correct, ...wrongs]);
    setRound({ correct, choices });
    setPicked(null);
  };

  const choose = (entry) => {
    if (picked) return;
    const ok = entry.word === round.correct.word;
    setPicked({ word: entry.word, ok });
    recordQuiz(ok);
  };

  if (loading || !round) {
    return (
      <div className="max-w-3xl mx-auto px-4 py-12 text-center">
        <Loader2 className="w-6 h-6 mx-auto animate-spin text-slate-400" />
      </div>
    );
  }

  const total = state.quizCorrect + state.quizWrong;
  const accuracy = total ? Math.round((state.quizCorrect / total) * 100) : 0;

  return (
    <div className="max-w-3xl mx-auto px-4 sm:px-8 py-8">
      <div className="flex items-start gap-3 mb-6">
        <span className="w-10 h-10 rounded-md bg-[#002FA7] text-white flex items-center justify-center shrink-0">
          <Brain className="w-5 h-5" />
        </span>
        <div className="flex-1">
          <h1 className="font-display text-3xl sm:text-4xl font-semibold">
            Quiz de signos
          </h1>
          <p className="text-slate-600 dark:text-slate-300 mt-1">
            ¿Sabes a qué signo corresponde la descripción? Acumula XP.
          </p>
        </div>
        <div className="text-right">
          <div className="text-xs text-slate-500">Aciertos</div>
          <div className="font-display text-2xl font-semibold">
            {state.quizCorrect}
            <span className="text-base text-slate-400">/{total}</span>
          </div>
          <div className="text-xs text-slate-500">{accuracy}% precisión</div>
        </div>
      </div>

      <Card className="p-6 border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 rounded-2xl">
        <div className="flex items-center gap-2 mb-3">
          <Badge className="bg-[#002FA7] text-white border-0">
            {round.correct.language}
          </Badge>
          <span className="text-xs text-slate-500">¿Qué signo es éste?</span>
        </div>

        <h2 className="font-display text-xl font-semibold mb-2">
          {round.correct.description}
        </h2>
        <div className="text-sm text-slate-700 dark:text-slate-300 space-y-1.5 mb-5">
          <div>
            <strong className="text-slate-900 dark:text-slate-100">Manos:</strong>{" "}
            {round.correct.hands}
          </div>
          <div>
            <strong className="text-slate-900 dark:text-slate-100">Boca:</strong>{" "}
            {round.correct.mouth}
          </div>
          <div>
            <strong className="text-slate-900 dark:text-slate-100">Expresión:</strong>{" "}
            {round.correct.expression}
          </div>
        </div>

        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5">
          {round.choices.map((c) => {
            const isSelected = picked && picked.word === c.word;
            const isCorrect = picked && c.word === round.correct.word;
            const stateColor = !picked
              ? "border-slate-200 dark:border-slate-700 hover:border-[#002FA7]"
              : isCorrect
              ? "border-emerald-500 bg-emerald-50 dark:bg-emerald-950/30 text-emerald-700 dark:text-emerald-300"
              : isSelected
              ? "border-red-500 bg-red-50 dark:bg-red-950/30 text-red-700 dark:text-red-300"
              : "border-slate-200 dark:border-slate-700 opacity-60";
            return (
              <button
                key={c.word}
                onClick={() => choose(c)}
                disabled={!!picked}
                data-testid={`quiz-choice-${c.word}`}
                className={`px-3 py-3 rounded-xl border-2 text-sm font-medium transition-all duration-200 ${stateColor}`}
              >
                {c.word}
              </button>
            );
          })}
        </div>

        {picked && (
          <div className="mt-5 p-3 rounded-lg bg-slate-50 dark:bg-slate-800/40 flex items-center gap-2">
            {picked.ok ? (
              <>
                <CheckCircle2 className="w-5 h-5 text-emerald-500" />
                <span className="font-medium text-emerald-700 dark:text-emerald-300">
                  ¡Correcto! +10 XP
                </span>
              </>
            ) : (
              <>
                <XCircle className="w-5 h-5 text-red-500" />
                <span className="font-medium text-red-700 dark:text-red-300">
                  La respuesta era: {round.correct.word}
                </span>
              </>
            )}
            <Button
              data-testid="quiz-next"
              onClick={newRound}
              className="ml-auto btn-ikb"
              size="sm"
            >
              <RotateCcw className="w-4 h-4 mr-1.5" /> Siguiente
            </Button>
          </div>
        )}
      </Card>
    </div>
  );
}
