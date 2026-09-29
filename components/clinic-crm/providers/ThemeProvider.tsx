"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import { useContinuity } from "../../../lib/clinic-crm/client/continuity";
import { THEME_STORAGE_KEY, getStorage, safeGet, safeSet } from "../../../lib/clinic-crm/client/storage";

/**
 * Light / dark / system theme for the Clinic CRM shell.
 *
 * Contract with the layout (Agent 1):
 *   <div className="clinic-crm" id="clinic-crm-root" suppressHydrationWarning>
 *     <script dangerouslySetInnerHTML={{ __html: themeBootScript }} />   ← first child
 *     <ClinicProviders>…</ClinicProviders>
 *   </div>
 * The boot script sets `data-theme` before first paint (no flash); `suppressHydrationWarning`
 * stops React complaining about the attribute it didn't render. Style with
 * `.clinic-crm[data-theme="dark"]`.
 *
 * The choice persists locally (`vsc-theme`, survives logout — not PII) and via
 * continuity key `pref:theme`, so it follows the staff member across devices.
 */

export type ThemeChoice = "light" | "dark" | "system";
export type ResolvedTheme = "light" | "dark";

export const THEME_ROOT_ID = "clinic-crm-root";
export const THEME_CONTINUITY_KEY = "pref:theme";
const DARK_QUERY = "(prefers-color-scheme: dark)";

function isChoice(v: unknown): v is ThemeChoice {
  return v === "light" || v === "dark" || v === "system";
}

/**
 * Inline, dependency-free, ES5 — runs before hydration. Keep in sync with
 * `applyTheme` below.
 */
export const themeBootScript = `(function(){try{var t=null;try{t=localStorage.getItem(${JSON.stringify(
  THEME_STORAGE_KEY,
)})}catch(e){}if(t!=="light"&&t!=="dark")t=(window.matchMedia&&window.matchMedia(${JSON.stringify(
  DARK_QUERY,
)}).matches)?"dark":"light";var el=document.getElementById(${JSON.stringify(
  THEME_ROOT_ID,
)})||document.querySelector(".clinic-crm");if(el){el.setAttribute("data-theme",t);el.style.colorScheme=t}}catch(e){}})();`;

function systemTheme(): ResolvedTheme {
  try {
    return typeof window !== "undefined" && window.matchMedia?.(DARK_QUERY).matches ? "dark" : "light";
  } catch {
    return "light";
  }
}

function applyTheme(resolved: ResolvedTheme): void {
  if (typeof document === "undefined") return;
  const el = document.getElementById(THEME_ROOT_ID) ?? document.querySelector<HTMLElement>(".clinic-crm");
  if (!el) return;
  el.setAttribute("data-theme", resolved);
  el.style.colorScheme = resolved;
}

function readStoredChoice(): ThemeChoice {
  const v = safeGet(getStorage("local"), THEME_STORAGE_KEY);
  return isChoice(v) ? v : "system";
}

export interface ThemeContextValue {
  theme: ThemeChoice;
  resolved: ResolvedTheme;
  setTheme: (theme: ThemeChoice) => void;
}

const ThemeContext = createContext<ThemeContextValue | null>(null);

export interface ThemeProviderProps {
  children: ReactNode;
  /** Sync the choice to the server (needs a session). Default true. */
  syncEnabled?: boolean;
}

export function ThemeProvider({ children, syncEnabled = true }: ThemeProviderProps) {
  const [theme, setThemeState] = useState<ThemeChoice>("system");
  const [system, setSystem] = useState<ResolvedTheme>("light");
  const [remote, setRemote] = useContinuity<ThemeChoice | null>(THEME_CONTINUITY_KEY, null, {
    enabled: syncEnabled,
  });

  // Local choice + system preference, after mount (SSR renders "system"/"light").
  useEffect(() => {
    setThemeState(readStoredChoice());
    setSystem(systemTheme());
    let mql: MediaQueryList | null = null;
    try {
      mql = window.matchMedia?.(DARK_QUERY) ?? null;
    } catch {
      mql = null;
    }
    const onChange = () => setSystem(systemTheme());
    if (mql) {
      if (typeof mql.addEventListener === "function") mql.addEventListener("change", onChange);
      else mql.addListener?.(onChange); // Safari < 14
    }
    const onStorage = (e: StorageEvent) => {
      if (e.key === THEME_STORAGE_KEY) setThemeState(isChoice(e.newValue) ? e.newValue : "system");
    };
    window.addEventListener("storage", onStorage);
    return () => {
      if (mql) {
        if (typeof mql.removeEventListener === "function") mql.removeEventListener("change", onChange);
        else mql.removeListener?.(onChange);
      }
      window.removeEventListener("storage", onStorage);
    };
  }, []);

  // Another device changed it → adopt (continuity resolves last-write-wins).
  useEffect(() => {
    if (isChoice(remote)) {
      setThemeState(remote);
      safeSet(getStorage("local"), THEME_STORAGE_KEY, remote);
    }
  }, [remote]);

  const resolved: ResolvedTheme = theme === "system" ? system : theme;

  useEffect(() => {
    applyTheme(resolved);
  }, [resolved]);

  const setTheme = useCallback(
    (next: ThemeChoice) => {
      if (!isChoice(next)) return;
      setThemeState(next);
      safeSet(getStorage("local"), THEME_STORAGE_KEY, next);
      setRemote(next);
    },
    [setRemote],
  );

  const value = useMemo(() => ({ theme, resolved, setTheme }), [theme, resolved, setTheme]);
  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
}

export function useTheme(): ThemeContextValue {
  const ctx = useContext(ThemeContext);
  if (!ctx) throw new Error("useTheme must be used inside <ThemeProvider>");
  return ctx;
}
