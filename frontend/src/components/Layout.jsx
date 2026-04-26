import { useState } from "react";
import { NavLink, Outlet, Link } from "react-router-dom";
import {
  Hand,
  Video,
  BookOpen,
  History,
  Type,
  MessageSquare,
  SpellCheck,
  BarChart3,
  Menu,
  X,
  Target,
  Brain,
  Users,
  Trophy,
  Flame,
  Sparkles,
  CreditCard,
} from "lucide-react";
import ThemeToggle from "./ThemeToggle";
import AccessibilityMenu from "./AccessibilityMenu";
import { useProgress } from "../hooks/useProgress";

const NAV = [
  { to: "/", icon: Hand, label: "Inicio", testId: "nav-home" },
  { to: "/traducir-en-vivo", icon: Video, label: "En vivo", testId: "nav-live" },
  { to: "/texto-a-signos", icon: Type, label: "Texto", testId: "nav-text-to-sign" },
  { to: "/practica", icon: Target, label: "Práctica", testId: "nav-practice" },
  { to: "/quiz", icon: Brain, label: "Quiz", testId: "nav-quiz" },
  { to: "/avatar", icon: Sparkles, label: "Avatar 3D", testId: "nav-avatar" },
  { to: "/alfabeto", icon: SpellCheck, label: "Alfabeto", testId: "nav-fingerspelling" },
  { to: "/conversacion", icon: MessageSquare, label: "Conversa", testId: "nav-conversation" },
  { to: "/diccionario", icon: BookOpen, label: "Dicc.", testId: "nav-dictionary" },
  { to: "/comunidad", icon: Users, label: "Comunidad", testId: "nav-community" },
  { to: "/historial", icon: History, label: "Historial", testId: "nav-history" },
  { to: "/precios", icon: CreditCard, label: "Pro", testId: "nav-pricing" },
  { to: "/analytics", icon: BarChart3, label: "Analítica", testId: "nav-analytics" },
];

// Bottom-tab quick access on mobile
const BOTTOM_TABS = [
  { to: "/", icon: Hand, label: "Inicio", testId: "tab-home" },
  { to: "/traducir-en-vivo", icon: Video, label: "En vivo", testId: "tab-live" },
  { to: "/practica", icon: Target, label: "Práctica", testId: "tab-practice" },
  { to: "/diccionario", icon: BookOpen, label: "Dicc.", testId: "tab-dict" },
  { to: "/historial", icon: History, label: "Historial", testId: "tab-history" },
];

const TopNavItem = ({ to, icon: Icon, label, testId, onClick }) => (
  <NavLink
    to={to}
    end={to === "/"}
    onClick={onClick}
    data-testid={testId}
    className={({ isActive }) =>
      `flex items-center gap-2 px-3 py-2 rounded-md text-sm font-medium transition-all duration-200 ${
        isActive
          ? "bg-[#002FA7] text-white"
          : "text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 hover:text-slate-900 dark:hover:text-white"
      }`
    }
  >
    <Icon className="w-4 h-4" />
    <span>{label}</span>
  </NavLink>
);

export default function Layout() {
  const [open, setOpen] = useState(false);
  const { state } = useProgress();

  return (
    <div className="min-h-screen bg-white dark:bg-slate-950 text-slate-900 dark:text-slate-100 flex flex-col transition-colors duration-200">
      {/* Top header */}
      <header
        data-testid="app-header"
        className="border-b border-slate-200 dark:border-slate-800 bg-white/80 dark:bg-slate-950/80 backdrop-blur-md sticky top-0 z-30"
        style={{ paddingTop: "env(safe-area-inset-top)" }}
      >
        <div className="max-w-[1400px] mx-auto px-4 sm:px-8 py-3.5 flex items-center gap-4">
          <Link to="/" data-testid="brand-link" className="flex items-center gap-2 group">
            <span className="w-9 h-9 rounded-md bg-[#002FA7] text-white flex items-center justify-center transition-transform duration-200 group-hover:rotate-3">
              <Hand className="w-5 h-5" />
            </span>
            <div className="leading-tight">
              <div className="font-display font-semibold">SignLanguage</div>
              <div className="font-display text-xs text-slate-500 -mt-0.5 tracking-wide">PRO</div>
            </div>
          </Link>

          {/* Desktop nav */}
          <nav
            data-testid="primary-nav"
            className="ml-auto hidden lg:flex items-center gap-1"
          >
            {NAV.map((n) => (
              <TopNavItem key={n.to} {...n} />
            ))}
            <ThemeToggle />
          </nav>

          {/* Mobile burger */}
          <div className="ml-auto flex items-center gap-1 lg:hidden">
            <ThemeToggle />
            <button
              data-testid="mobile-menu-toggle"
              onClick={() => setOpen((v) => !v)}
              className="p-2 rounded-md text-slate-700 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800"
              aria-label="Abrir menú"
            >
              {open ? <X className="w-5 h-5" /> : <Menu className="w-5 h-5" />}
            </button>
          </div>
        </div>

        {/* Mobile drawer */}
        {open && (
          <div
            data-testid="mobile-menu"
            className="lg:hidden border-t border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-950 fade-in-up"
          >
            <div className="max-w-[1400px] mx-auto px-4 py-3 grid grid-cols-2 gap-1.5">
              {NAV.map((n) => (
                <TopNavItem key={n.to} {...n} onClick={() => setOpen(false)} />
              ))}
            </div>
          </div>
        )}
      </header>

      <main className="flex-1 pb-20 lg:pb-0">
        <Outlet />
      </main>

      <footer
        data-testid="app-footer"
        className="border-t border-slate-200 dark:border-slate-800 mt-12 hidden lg:block"
      >
        <div className="max-w-[1400px] mx-auto px-4 sm:px-8 py-6 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 text-sm text-slate-500 dark:text-slate-400">
          <div>© {new Date().getFullYear()} SignLanguage Pro · Comunicación inclusiva impulsada por IA</div>
          <div className="flex items-center gap-2">
            <span className="inline-block w-2 h-2 rounded-full bg-emerald-500" /> Servicio operativo
          </div>
        </div>
      </footer>

      {/* Mobile bottom tab bar */}
      <nav
        data-testid="bottom-tabs"
        className="lg:hidden fixed bottom-0 left-0 right-0 z-30 bg-white/95 dark:bg-slate-950/95 backdrop-blur-md border-t border-slate-200 dark:border-slate-800"
        style={{ paddingBottom: "env(safe-area-inset-bottom)" }}
      >
        <div className="grid grid-cols-5">
          {BOTTOM_TABS.map(({ to, icon: Icon, label, testId }) => (
            <NavLink
              key={to}
              to={to}
              end={to === "/"}
              data-testid={testId}
              className={({ isActive }) =>
                `flex flex-col items-center justify-center gap-1 py-2.5 text-[11px] font-medium transition-colors ${
                  isActive
                    ? "text-[#002FA7] dark:text-blue-400"
                    : "text-slate-500 dark:text-slate-400"
                }`
              }
            >
              {({ isActive }) => (
                <>
                  <Icon
                    className={`w-5 h-5 ${
                      isActive ? "scale-110 transition-transform" : ""
                    }`}
                  />
                  <span>{label}</span>
                </>
              )}
            </NavLink>
          ))}
        </div>
      </nav>
    </div>
  );
}
