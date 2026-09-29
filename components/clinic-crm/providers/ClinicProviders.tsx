"use client";

import type { ReactNode } from "react";
import { SessionProvider, useSession } from "./SessionProvider";
import { ThemeProvider } from "./ThemeProvider";
import { ToastProvider } from "./ToastProvider";

export { SessionProvider, useSession, LOGIN_PATH } from "./SessionProvider";
export type { SessionContextValue } from "./SessionProvider";
export { ThemeProvider, useTheme, themeBootScript, THEME_ROOT_ID } from "./ThemeProvider";
export type { ThemeChoice, ResolvedTheme, ThemeContextValue } from "./ThemeProvider";
export { ToastProvider, useToast } from "./ToastProvider";
export type { ToastItem, ToastKind, ToastContextValue } from "./ToastProvider";

/** Theme sync to the server only once signed in (no `state/*` calls on the login page). */
function SessionAwareTheme({ children }: { children: ReactNode }) {
  const { session } = useSession();
  return <ThemeProvider syncEnabled={session !== null}>{children}</ThemeProvider>;
}

export function ClinicProviders({ children }: { children: ReactNode }) {
  return (
    <SessionProvider>
      <SessionAwareTheme>
        <ToastProvider>{children}</ToastProvider>
      </SessionAwareTheme>
    </SessionProvider>
  );
}

export default ClinicProviders;
