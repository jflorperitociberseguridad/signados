import { useState } from "react";
import { NavLink, Outlet, Link } from "react-router-dom";
import {
  Hand,
  Video,
  BookOpen,
  History,
  Languages,
  MessageSquare,
  SpellCheck,
  GraduationCap,
  Menu,
  X,
  Target,
  Brain,
  Users,
  Sparkles,
  CreditCard,
  PhoneCall,
  ChevronDown,
  LogOut,
  ShieldCheck,
} from "lucide-react";
import ThemeToggle from "./ThemeToggle";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "./ui/dropdown-menu";
import { useAdminAuth } from "../lib/AdminAuthContext";

// Primary nav (always visible on desktop)
const PRIMARY = [
  { to: "/", icon: Hand, label: "Inicio", testId: "nav-home" },
  { to: "/texto-a-signos", icon: Languages, label: "Traductor", testId: "nav-traductor" },
  { to: "/practica", icon: Target, label: "Práctica", testId: "nav-practice" },
  { to: "/traducir-en-vivo", icon: Video, label: "En vivo", testId: "nav-live" },
  { to: "/precios", icon: CreditCard, label: "PRO", testId: "nav-pricing" },
  { to: "/avatar", icon: Sparkles, label: "Avatar 3D", testId: "nav-avatar" },
  { to: "/llamada", icon: PhoneCall, label: "Llamada", testId: "nav-call" },
  { to: "/conversacion", icon: MessageSquare, label: "Conversa", testId: "nav-conversation" },
];

// Secondary "Más" dropdown
const MORE = [
  { to: "/quiz", icon: Brain, label: "Quiz", testId: "nav-quiz" },
  { to: "/alfabeto", icon: SpellCheck, label: "Alfabeto", testId: "nav-fingerspelling" },
  { to: "/comunidad", icon: Users, label: "Comunidad", testId: "nav-community" },
  { to: "/diccionario", icon: BookOpen, label: "Diccionario", testId: "nav-dictionary" },
  { to: "/historial", icon: History, label: "Historial", testId: "nav-history" },
];

// Admin-only links
const ADMIN_LINKS = [
  { to: "/ensenanzas", icon: GraduationCap, label: "Enseñanzas", testId: "nav-teaching" },
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

function MoreMenu({ items, isAdmin, adminItems, onLogout }) {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        data-testid="nav-more"
        className="flex items-center gap-1 px-3 py-2 rounded-md text-sm font-medium text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 hover:text-slate-900 dark:hover:text-white"
      >
        Más <ChevronDown className="w-3.5 h-3.5" />
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-52" data-testid="nav-more-content">
        {items.map((it) => (
          <DropdownMenuItem key={it.to} asChild>
            <NavLink
              to={it.to}
              data-testid={it.testId}
              className="flex items-center gap-2 cursor-pointer"
            >
              <it.icon className="w-4 h-4 text-slate-500" />
              <span>{it.label}</span>
            </NavLink>
          </DropdownMenuItem>
        ))}
        {isAdmin && (
          <>
            <div className="px-2 py-1 mt-1 border-t border-slate-100 dark:border-slate-800 text-[10px] uppercase tracking-wide text-slate-400">
              Admin
            </div>
            {adminItems.map((it) => (
              <DropdownMenuItem key={it.to} asChild>
                <NavLink
                  to={it.to}
                  data-testid={it.testId}
                  className="flex items-center gap-2 cursor-pointer"
                >
                  <it.icon className="w-4 h-4 text-emerald-600" />
                  <span>{it.label}</span>
                </NavLink>
              </DropdownMenuItem>
            ))}
            <DropdownMenuItem
              data-testid="nav-admin-logout"
              onClick={onLogout}
              className="flex items-center gap-2 cursor-pointer text-red-600"
            >
              <LogOut className="w-4 h-4" />
              <span>Salir admin</span>
            </DropdownMenuItem>
          </>
        )}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

export default function Layout() {
  const [open, setOpen] = useState(false);
  const { isAdmin, logout } = useAdminAuth();

  return (
    <div className="min-h-screen bg-white dark:bg-slate-950 text-slate-900 dark:text-slate-100 flex flex-col transition-colors duration-200">
      <header
        data-testid="app-header"
        className="border-b border-slate-200 dark:border-slate-800 bg-white/80 dark:bg-slate-950/80 backdrop-blur-md sticky top-0 z-30"
        style={{ paddingTop: "env(safe-area-inset-top)" }}
      >
        <div className="max-w-[1400px] mx-auto px-4 sm:px-8 py-3.5 flex items-center gap-3">
          <Link to="/" data-testid="brand-link" className="flex items-center gap-2 group shrink-0">
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
            className="ml-auto hidden lg:flex items-center gap-0.5"
          >
            {PRIMARY.map((n) => (
              <TopNavItem key={n.to} {...n} />
            ))}
            <MoreMenu items={MORE} isAdmin={isAdmin} adminItems={ADMIN_LINKS} onLogout={logout} />
            {isAdmin && (
              <span
                data-testid="admin-pill"
                className="ml-1 inline-flex items-center gap-1 px-2 py-1 rounded-full text-[10px] font-medium bg-emerald-100 text-emerald-700 border border-emerald-200 dark:bg-emerald-950/40 dark:text-emerald-300 dark:border-emerald-900"
              >
                <ShieldCheck className="w-3 h-3" /> Admin
              </span>
            )}
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

        {open && (
          <div
            data-testid="mobile-menu"
            className="lg:hidden border-t border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-950 fade-in-up"
          >
            <div className="max-w-[1400px] mx-auto px-4 py-3 grid grid-cols-2 gap-1.5">
              {PRIMARY.map((n) => (
                <TopNavItem key={n.to} {...n} onClick={() => setOpen(false)} />
              ))}
              <div className="col-span-2 mt-2 pt-2 border-t border-slate-100 dark:border-slate-800 text-[10px] uppercase tracking-wide text-slate-400 px-3">
                Más
              </div>
              {MORE.map((n) => (
                <TopNavItem key={n.to} {...n} onClick={() => setOpen(false)} />
              ))}
              {isAdmin && (
                <>
                  <div className="col-span-2 mt-2 pt-2 border-t border-slate-100 dark:border-slate-800 text-[10px] uppercase tracking-wide text-emerald-600 px-3">
                    Admin
                  </div>
                  {ADMIN_LINKS.map((n) => (
                    <TopNavItem key={n.to} {...n} onClick={() => setOpen(false)} />
                  ))}
                  <button
                    data-testid="mobile-admin-logout"
                    onClick={() => {
                      logout();
                      setOpen(false);
                    }}
                    className="col-span-2 mt-1 px-3 py-2 rounded-md text-sm font-medium text-red-600 hover:bg-red-50 flex items-center gap-2"
                  >
                    <LogOut className="w-4 h-4" /> Salir admin
                  </button>
                </>
              )}
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
