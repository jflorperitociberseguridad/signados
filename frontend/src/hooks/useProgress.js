/**
 * useProgress — gamified user progress stored in localStorage.
 * Tracks: practiced signs (with best score), streak, badges, level, XP.
 */
import { useEffect, useState, useCallback } from "react";

const KEY = "sl-progress-v1";

const DEFAULT = {
  xp: 0,
  level: 1,
  streak: 0,
  lastActiveDate: null, // YYYY-MM-DD
  signs: {}, // { [signKey]: { best:int, attempts:int, lastAt:iso } }
  badges: [], // ["first-sign", "streak-3", ...]
  quizCorrect: 0,
  quizWrong: 0,
};

const xpForLevel = (lvl) => 100 + (lvl - 1) * 50;

const loadFromStorage = () => {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return DEFAULT;
    return { ...DEFAULT, ...JSON.parse(raw) };
  } catch {
    return DEFAULT;
  }
};

const todayISO = () => new Date().toISOString().slice(0, 10);

export function useProgress() {
  const [state, setState] = useState(loadFromStorage);

  useEffect(() => {
    try {
      localStorage.setItem(KEY, JSON.stringify(state));
    } catch {}
  }, [state]);

  const update = useCallback((mut) => {
    setState((prev) => mut({ ...prev }) || prev);
  }, []);

  const touchStreak = useCallback(() => {
    update((p) => {
      const today = todayISO();
      if (p.lastActiveDate === today) return p;
      const yesterday = new Date(Date.now() - 86_400_000).toISOString().slice(0, 10);
      p.streak = p.lastActiveDate === yesterday ? p.streak + 1 : 1;
      p.lastActiveDate = today;
      if (p.streak === 3 && !p.badges.includes("streak-3")) p.badges.push("streak-3");
      if (p.streak === 7 && !p.badges.includes("streak-7")) p.badges.push("streak-7");
      if (p.streak === 30 && !p.badges.includes("streak-30")) p.badges.push("streak-30");
      return p;
    });
  }, [update]);

  const addXP = useCallback(
    (amount) => {
      update((p) => {
        p.xp += amount;
        while (p.xp >= xpForLevel(p.level)) {
          p.xp -= xpForLevel(p.level);
          p.level += 1;
        }
        return p;
      });
    },
    [update],
  );

  const recordSignAttempt = useCallback(
    (signKey, score) => {
      update((p) => {
        const cur = p.signs[signKey] || { best: 0, attempts: 0, lastAt: null };
        cur.attempts += 1;
        cur.lastAt = new Date().toISOString();
        if (score > cur.best) cur.best = score;
        p.signs[signKey] = cur;
        if (Object.keys(p.signs).length === 1 && !p.badges.includes("first-sign")) {
          p.badges.push("first-sign");
        }
        if (Object.keys(p.signs).length >= 10 && !p.badges.includes("ten-signs")) {
          p.badges.push("ten-signs");
        }
        return p;
      });
      addXP(Math.max(5, Math.round(score / 5)));
      touchStreak();
    },
    [update, addXP, touchStreak],
  );

  const recordQuiz = useCallback(
    (correct) => {
      update((p) => {
        if (correct) p.quizCorrect += 1;
        else p.quizWrong += 1;
        return p;
      });
      if (correct) {
        addXP(10);
        touchStreak();
      }
    },
    [update, addXP, touchStreak],
  );

  const reset = useCallback(() => setState(DEFAULT), []);

  return {
    state,
    addXP,
    recordSignAttempt,
    recordQuiz,
    touchStreak,
    reset,
    xpForNext: xpForLevel(state.level),
  };
}
