import { useEffect, useState } from "react";
import { Card } from "../components/ui/card";
import { Badge } from "../components/ui/badge";
import {
  BarChart3,
  TrendingUp,
  Globe,
  Hand,
  Search,
  Loader2,
  Activity,
} from "lucide-react";
import {
  ResponsiveContainer,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  CartesianGrid,
  LineChart,
  Line,
  PieChart,
  Pie,
  Cell,
} from "recharts";
import { getAnalyticsSummary } from "../lib/api";

const PIE_COLORS = ["#002FA7", "#3B82F6", "#10B981", "#F59E0B", "#EF4444", "#8B5CF6", "#EC4899"];

const MODE_LABEL = {
  video: "Video",
  live: "En vivo",
  streaming: "Streaming",
  "text-to-sign": "Texto → signos",
  fingerspelling: "Alfabeto",
};

export default function Analytics() {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let alive = true;
    const load = () =>
      getAnalyticsSummary(14)
        .then((d) => {
          if (alive) setData(d);
        })
        .finally(() => alive && setLoading(false));
    load();
    const t = setInterval(load, 15000); // auto-refresh every 15s
    return () => {
      alive = false;
      clearInterval(t);
    };
  }, []);

  return (
    <div className="max-w-[1400px] mx-auto px-4 sm:px-8 py-8">
      <div className="flex items-start gap-3 mb-6">
        <span className="w-10 h-10 rounded-md bg-[#002FA7] text-white flex items-center justify-center shrink-0">
          <BarChart3 className="w-5 h-5" />
        </span>
        <div className="flex-1">
          <h1 className="font-display text-3xl sm:text-4xl font-semibold">
            Analítica
          </h1>
          <p className="text-slate-600 dark:text-slate-300 mt-1">
            Métricas anónimas de uso. Sin cookies ni datos personales.
          </p>
        </div>
        <Badge className="bg-emerald-500 text-white border-0">
          <Activity className="w-3 h-3 mr-1 animate-pulse" /> En vivo
        </Badge>
      </div>

      {loading && !data && (
        <Card className="p-12 text-center text-slate-500 border border-slate-200 dark:border-slate-700">
          <Loader2 className="w-6 h-6 mx-auto animate-spin mb-2" />
          Cargando métricas…
        </Card>
      )}

      {data && (
        <div className="space-y-6">
          {/* KPIs */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
            <Kpi
              label="Traducciones"
              value={data.totals?.translations ?? 0}
              icon={Hand}
            />
            <Kpi
              label="Eventos"
              value={data.totals?.events ?? 0}
              icon={TrendingUp}
            />
            <Kpi
              label="Idiomas detectados"
              value={data.by_language?.length ?? 0}
              icon={Globe}
            />
            <Kpi
              label="Búsquedas diccionario"
              value={
                data.top_dictionary_searches?.reduce((a, x) => a + x.count, 0) ??
                0
              }
              icon={Search}
            />
          </div>

          {/* Daily series */}
          <Card className="p-5 border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 rounded-xl">
            <div className="flex items-center justify-between mb-3">
              <h2 className="font-display text-lg font-semibold">
                Traducciones por día (últimos 14)
              </h2>
            </div>
            <div className="h-64" data-testid="chart-daily">
              <ResponsiveContainer>
                <LineChart data={data.by_day || []}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                  <XAxis
                    dataKey="day"
                    tickFormatter={(v) => v?.slice(5)}
                    stroke="#94a3b8"
                    fontSize={12}
                  />
                  <YAxis allowDecimals={false} stroke="#94a3b8" fontSize={12} />
                  <Tooltip />
                  <Line
                    type="monotone"
                    dataKey="count"
                    stroke="#002FA7"
                    strokeWidth={2.5}
                    dot={{ r: 3, fill: "#002FA7" }}
                    activeDot={{ r: 5 }}
                  />
                </LineChart>
              </ResponsiveContainer>
            </div>
          </Card>

          <div className="grid lg:grid-cols-2 gap-6">
            {/* Mode breakdown */}
            <Card className="p-5 border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 rounded-xl">
              <h2 className="font-display text-lg font-semibold mb-3">
                Por modo de uso
              </h2>
              <div className="h-64" data-testid="chart-mode">
                <ResponsiveContainer>
                  <BarChart data={(data.by_mode || []).map((x) => ({ ...x, mode: MODE_LABEL[x.mode] || x.mode }))}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                    <XAxis dataKey="mode" stroke="#94a3b8" fontSize={12} />
                    <YAxis allowDecimals={false} stroke="#94a3b8" fontSize={12} />
                    <Tooltip />
                    <Bar dataKey="count" fill="#002FA7" radius={[6, 6, 0, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </Card>

            {/* Languages pie */}
            <Card className="p-5 border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 rounded-xl">
              <h2 className="font-display text-lg font-semibold mb-3">
                Idiomas de signos detectados
              </h2>
              <div className="h-64" data-testid="chart-languages">
                <ResponsiveContainer>
                  <PieChart>
                    <Pie
                      data={data.by_language || []}
                      dataKey="count"
                      nameKey="language"
                      innerRadius={50}
                      outerRadius={90}
                      paddingAngle={2}
                    >
                      {(data.by_language || []).map((_, i) => (
                        <Cell
                          key={i}
                          fill={PIE_COLORS[i % PIE_COLORS.length]}
                        />
                      ))}
                    </Pie>
                    <Tooltip />
                  </PieChart>
                </ResponsiveContainer>
              </div>
              <div className="flex flex-wrap gap-2 mt-3 justify-center">
                {(data.by_language || []).map((l, i) => (
                  <Badge
                    key={l.language}
                    className="text-white border-0"
                    style={{
                      backgroundColor: PIE_COLORS[i % PIE_COLORS.length],
                    }}
                  >
                    {l.language} · {l.count}
                  </Badge>
                ))}
              </div>
            </Card>
          </div>

          {/* Top words & dict searches */}
          <div className="grid lg:grid-cols-2 gap-6">
            <Card className="p-5 border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 rounded-xl">
              <h2 className="font-display text-lg font-semibold mb-3">
                Palabras más traducidas
              </h2>
              {(data.top_words || []).length === 0 ? (
                <p className="text-sm text-slate-500">Aún sin datos.</p>
              ) : (
                <div className="flex flex-wrap gap-2" data-testid="top-words">
                  {(data.top_words || []).map((w) => (
                    <span
                      key={w.word}
                      className="px-3 py-1.5 rounded-full bg-slate-100 dark:bg-slate-800 text-slate-800 dark:text-slate-200 text-sm border border-slate-200 dark:border-slate-700"
                      style={{
                        fontSize: `${Math.min(20, 12 + w.count)}px`,
                      }}
                    >
                      {w.word}{" "}
                      <span className="text-slate-400 text-xs">
                        ×{w.count}
                      </span>
                    </span>
                  ))}
                </div>
              )}
            </Card>

            <Card className="p-5 border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 rounded-xl">
              <h2 className="font-display text-lg font-semibold mb-3">
                Búsquedas top en diccionario
              </h2>
              {(data.top_dictionary_searches || []).length === 0 ? (
                <p className="text-sm text-slate-500">Aún sin búsquedas.</p>
              ) : (
                <ol
                  data-testid="top-searches"
                  className="space-y-2 text-sm"
                >
                  {data.top_dictionary_searches.map((d, i) => (
                    <li
                      key={d.q}
                      className="flex items-center justify-between p-2 rounded-lg bg-slate-50 dark:bg-slate-800/50"
                    >
                      <span className="flex items-center gap-2">
                        <span className="w-6 h-6 rounded bg-[#002FA7] text-white text-xs flex items-center justify-center">
                          {i + 1}
                        </span>
                        <span className="font-medium">{d.q}</span>
                      </span>
                      <Badge variant="outline" className="border-slate-300">
                        {d.count} búsquedas
                      </Badge>
                    </li>
                  ))}
                </ol>
              )}
            </Card>
          </div>
        </div>
      )}
    </div>
  );
}

const Kpi = ({ label, value, icon: Icon }) => (
  <Card className="p-5 border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 rounded-xl">
    <div className="flex items-center justify-between">
      <span className="text-sm text-slate-500">{label}</span>
      <span className="w-8 h-8 rounded-md bg-[#002FA7]/10 text-[#002FA7] flex items-center justify-center">
        <Icon className="w-4 h-4" />
      </span>
    </div>
    <div className="font-display text-3xl font-semibold mt-2">
      {value.toLocaleString()}
    </div>
  </Card>
);
