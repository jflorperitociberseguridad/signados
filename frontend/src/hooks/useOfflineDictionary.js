/**
 * useOfflineDictionary
 *  - Pre-fetches the top-N most-used signs and stores them in localStorage
 *    so the user can still browse the dictionary without connectivity.
 *  - Exposes:
 *      online      — boolean, navigator.onLine + actual fetch test
 *      pack        — { version, count, items } | null
 *      lastUpdated — ISO date string | null
 *      refresh()   — force re-download
 */
import { useEffect, useState, useCallback } from "react";
import { getOfflinePack } from "../lib/api";

const KEY = "signlang.offlinePack.v1";
const TS_KEY = "signlang.offlinePack.updatedAt.v1";
const STALE_MS = 24 * 60 * 60 * 1000; // 24h

function load() {
  try {
    const raw = localStorage.getItem(KEY);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

function save(pack) {
  try {
    localStorage.setItem(KEY, JSON.stringify(pack));
    localStorage.setItem(TS_KEY, new Date().toISOString());
  } catch {}
}

export function useOfflineDictionary({ limit = 30, autoRefresh = true } = {}) {
  const [pack, setPack] = useState(load);
  const [lastUpdated, setLastUpdated] = useState(
    () => localStorage.getItem(TS_KEY) || null,
  );
  const [online, setOnline] = useState(
    typeof navigator !== "undefined" ? navigator.onLine : true,
  );
  const [loading, setLoading] = useState(false);

  const refresh = useCallback(async () => {
    if (!navigator.onLine) return;
    setLoading(true);
    try {
      const data = await getOfflinePack(limit);
      save(data);
      setPack(data);
      setLastUpdated(new Date().toISOString());
    } catch {
      // fail silently — we keep whatever we had
    } finally {
      setLoading(false);
    }
  }, [limit]);

  // Online/offline listeners
  useEffect(() => {
    const on = () => setOnline(true);
    const off = () => setOnline(false);
    window.addEventListener("online", on);
    window.addEventListener("offline", off);
    return () => {
      window.removeEventListener("online", on);
      window.removeEventListener("offline", off);
    };
  }, []);

  // Auto-refresh on mount when stale or empty (and online)
  useEffect(() => {
    if (!autoRefresh) return;
    const ts = lastUpdated ? Date.parse(lastUpdated) : 0;
    const stale = !pack || Date.now() - ts > STALE_MS;
    if (stale && navigator.onLine) {
      refresh();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [autoRefresh]);

  return { pack, lastUpdated, online, loading, refresh };
}
