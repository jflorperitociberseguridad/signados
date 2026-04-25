import { NavLink, Outlet, Link } from "react-router-dom";
import {
  Hand,
  Video,
  BookOpen,
  History,
  Type,
  MessageSquare,
  SpellCheck,
} from "lucide-react";
import ThemeToggle from "./ThemeToggle";

const NavItem = ({ to, icon: Icon, label, testId }) => (
  <NavLink
    to={to}
    end={to === "/"}
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
    <span className="hidden md:inline">{label}</span>
  </NavLink>
);

export default function Layout() {
  return (
    <div className="min-h-screen bg-white dark:bg-slate-950 text-slate-900 dark:text-slate-100 flex flex-col transition-colors duration-200">
      <header
        data-testid="app-header"
        className="border-b border-slate-200 dark:border-slate-800 bg-white/80 dark:bg-slate-950/80 backdrop-blur-md sticky top-0 z-30"
      >
        <div className="max-w-[1400px] mx-auto px-4 sm:px-8 py-4 flex items-center gap-6">
          <Link
            to="/"
            data-testid="brand-link"
            className="flex items-center gap-2 group"
          >
            <span className="w-9 h-9 rounded-md bg-[#002FA7] text-white flex items-center justify-center transition-transform duration-200 group-hover:rotate-3">
              <Hand className="w-5 h-5" />
            </span>
            <div className="leading-tight">
              <div className="font-display font-semibold">SignLanguage</div>
              <div className="font-display text-xs text-slate-500 -mt-0.5 tracking-wide">
                PRO
              </div>
            </div>
          </Link>

          <nav
            data-testid="primary-nav"
            className="ml-auto flex items-center gap-1 overflow-x-auto"
          >
            <NavItem to="/" icon={Hand} label="Inicio" testId="nav-home" />
            <NavItem
              to="/traducir-en-vivo"
              icon={Video}
              label="En vivo"
              testId="nav-live"
            />
            <NavItem
              to="/texto-a-signos"
              icon={Type}
              label="Texto a signos"
              testId="nav-text-to-sign"
            />
            <NavItem
              to="/alfabeto"
              icon={SpellCheck}
              label="Alfabeto"
              testId="nav-fingerspelling"
            />
            <NavItem
              to="/conversacion"
              icon={MessageSquare}
              label="Conversación"
              testId="nav-conversation"
            />
            <NavItem
              to="/diccionario"
              icon={BookOpen}
              label="Diccionario"
              testId="nav-dictionary"
            />
            <NavItem
              to="/historial"
              icon={History}
              label="Historial"
              testId="nav-history"
            />
            <ThemeToggle />
          </nav>
        </div>
      </header>

      <main className="flex-1">
        <Outlet />
      </main>

      <footer
        data-testid="app-footer"
        className="border-t border-slate-200 dark:border-slate-800 mt-12"
      >
        <div className="max-w-[1400px] mx-auto px-4 sm:px-8 py-6 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 text-sm text-slate-500 dark:text-slate-400">
          <div>
            © {new Date().getFullYear()} SignLanguage Pro · Comunicación
            inclusiva impulsada por IA
          </div>
          <div className="flex items-center gap-2">
            <span className="inline-block w-2 h-2 rounded-full bg-emerald-500" />
            Servicio operativo
          </div>
        </div>
      </footer>
    </div>
  );
}
