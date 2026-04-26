import { useEffect } from "react";
import { useOfflineDictionary } from "../hooks/useOfflineDictionary";
import { Wifi, WifiOff, Download } from "lucide-react";

/**
 * Floating offline indicator: shows "Sin conexión · X signos disponibles"
 * when the device is offline, or briefly after a successful pre-fetch.
 */
export default function OfflineIndicator() {
  const { pack, online, loading, refresh } = useOfflineDictionary({ limit: 30 });

  // First-mount warm-up: one explicit refresh to seed the cache for new users.
  useEffect(() => {
    if (online && !pack) refresh();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  if (online) return null;

  const count = pack?.count || 0;

  return (
    <div
      data-testid="offline-indicator"
      className="fixed left-1/2 -translate-x-1/2 top-3 z-40 lg:top-4"
      style={{ paddingTop: "env(safe-area-inset-top)" }}
    >
      <div className="flex items-center gap-2 px-3 py-1.5 rounded-full bg-amber-500/95 text-white text-xs font-medium shadow-lg backdrop-blur-md border border-amber-300/50">
        {loading ? (
          <Download className="w-3.5 h-3.5 animate-bounce" />
        ) : (
          <WifiOff className="w-3.5 h-3.5" />
        )}
        <span>
          Sin conexión · {count > 0 ? `${count} signos offline` : "diccionario vacío"}
        </span>
      </div>
    </div>
  );
}

/** Inline status pill for the dictionary page header. */
export function ConnectivityPill() {
  const { online, pack, lastUpdated, loading, refresh } = useOfflineDictionary({
    limit: 30,
    autoRefresh: false,
  });
  return (
    <div
      data-testid="connectivity-pill"
      className={`inline-flex items-center gap-2 px-2.5 py-1 rounded-full text-xs font-medium border ${
        online
          ? "bg-emerald-50 text-emerald-700 border-emerald-200 dark:bg-emerald-950/40 dark:text-emerald-300 dark:border-emerald-900"
          : "bg-amber-50 text-amber-700 border-amber-200 dark:bg-amber-950/40 dark:text-amber-300 dark:border-amber-900"
      }`}
    >
      {online ? <Wifi className="w-3 h-3" /> : <WifiOff className="w-3 h-3" />}
      {online ? "En línea" : "Modo offline"}
      {pack ? (
        <>
          <span aria-hidden className="opacity-50">·</span>
          <button
            type="button"
            onClick={refresh}
            disabled={loading || !online}
            className="underline-offset-2 hover:underline disabled:opacity-50"
            title={lastUpdated ? `Actualizado: ${new Date(lastUpdated).toLocaleString()}` : ""}
            data-testid="offline-refresh"
          >
            {loading ? "Sincronizando…" : `${pack.count} signos`}
          </button>
        </>
      ) : null}
    </div>
  );
}
