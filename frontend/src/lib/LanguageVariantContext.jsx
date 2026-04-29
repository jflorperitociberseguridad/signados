/**
 * LanguageVariantContext — global "active sign-language variant" preference.
 * Defaults to LSE per the user's specification (Spanish-language priority).
 *
 * Provides:
 *   - variant: "LSE" | "ASL" | "BSL" | "LSM" | "LIBRAS" | "auto"
 *   - setVariant(v)
 *   - VARIANTS: full list with labels
 */
import { createContext, useContext, useEffect, useMemo, useState } from "react";

const KEY = "signlang.variant.v1";
const DEFAULT = "LSE";

export const VARIANTS = [
  { value: "LSE", label: "LSE — Lengua de Signos Española", flag: "🇪🇸", priority: true },
  { value: "ASL", label: "ASL — American Sign Language", flag: "🇺🇸" },
  { value: "BSL", label: "BSL — British Sign Language", flag: "🇬🇧" },
  { value: "LSM", label: "LSM — Lengua de Signos Mexicana", flag: "🇲🇽" },
  { value: "LIBRAS", label: "LIBRAS — Brasileña", flag: "🇧🇷" },
  { value: "auto", label: "Detección automática", flag: "✨" },
];

const ctx = createContext(null);

export function LanguageVariantProvider({ children }) {
  const [variant, _setVariant] = useState(() => {
    try {
      return localStorage.getItem(KEY) || DEFAULT;
    } catch {
      return DEFAULT;
    }
  });

  useEffect(() => {
    try {
      localStorage.setItem(KEY, variant);
    } catch {}
  }, [variant]);

  const value = useMemo(
    () => ({
      variant,
      setVariant: _setVariant,
      VARIANTS,
    }),
    [variant],
  );

  return <ctx.Provider value={value}>{children}</ctx.Provider>;
}

export function useLanguageVariant() {
  const v = useContext(ctx);
  if (!v) return { variant: DEFAULT, setVariant: () => {}, VARIANTS };
  return v;
}
