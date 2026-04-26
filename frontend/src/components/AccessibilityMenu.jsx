/**
 * Accessibility settings panel — high contrast + dyslexia-friendly font + larger text.
 * Persists to localStorage and applies via classes on <html>.
 */
import { useEffect, useState } from "react";
import { Switch } from "./ui/switch";
import { Label } from "./ui/label";
import { Slider } from "./ui/slider";
import { Accessibility } from "lucide-react";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "./ui/popover";

const KEY = "sl-a11y-v1";

const DEFAULT = {
  highContrast: false,
  dyslexia: false,
  fontScale: 1.0, // 0.9..1.4
};

const load = () => {
  try {
    const raw = localStorage.getItem(KEY);
    if (raw) return { ...DEFAULT, ...JSON.parse(raw) };
  } catch {}
  return DEFAULT;
};

export default function AccessibilityMenu() {
  const [s, setS] = useState(load);

  useEffect(() => {
    const root = document.documentElement;
    root.classList.toggle("a11y-contrast", s.highContrast);
    root.classList.toggle("a11y-dyslexia", s.dyslexia);
    root.style.setProperty("--a11y-scale", String(s.fontScale));
    try {
      localStorage.setItem(KEY, JSON.stringify(s));
    } catch {}
  }, [s]);

  return (
    <Popover>
      <PopoverTrigger asChild>
        <button
          data-testid="a11y-toggle"
          className="p-2 rounded-md text-slate-700 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800"
          aria-label="Opciones de accesibilidad"
          title="Accesibilidad"
        >
          <Accessibility className="w-4 h-4" />
        </button>
      </PopoverTrigger>
      <PopoverContent className="w-72" align="end">
        <h3 className="font-display font-semibold mb-3">Accesibilidad</h3>
        <Row>
          <Label htmlFor="a11y-contrast" className="cursor-pointer">
            Alto contraste
          </Label>
          <Switch
            id="a11y-contrast"
            data-testid="a11y-contrast"
            checked={s.highContrast}
            onCheckedChange={(v) => setS({ ...s, highContrast: v })}
          />
        </Row>
        <Row>
          <Label htmlFor="a11y-dyslexia" className="cursor-pointer">
            Tipografía para dislexia
          </Label>
          <Switch
            id="a11y-dyslexia"
            data-testid="a11y-dyslexia"
            checked={s.dyslexia}
            onCheckedChange={(v) => setS({ ...s, dyslexia: v })}
          />
        </Row>
        <div className="mt-4">
          <Label className="text-sm">
            Tamaño de texto · {Math.round(s.fontScale * 100)}%
          </Label>
          <Slider
            value={[s.fontScale]}
            min={0.9}
            max={1.4}
            step={0.05}
            onValueChange={(v) => setS({ ...s, fontScale: v[0] })}
            className="mt-2"
            data-testid="a11y-font-scale"
          />
        </div>
        <button
          onClick={() => setS(DEFAULT)}
          className="text-xs text-slate-500 mt-4 hover:text-slate-900 dark:hover:text-white"
        >
          Restablecer
        </button>
      </PopoverContent>
    </Popover>
  );
}

const Row = ({ children }) => (
  <div className="flex items-center justify-between gap-2 py-2">{children}</div>
);
