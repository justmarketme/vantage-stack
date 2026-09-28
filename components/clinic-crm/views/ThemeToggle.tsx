"use client";

import { Monitor, Moon, Sun } from "lucide-react";
import { useTheme } from "@/components/clinic-crm/providers/ThemeProvider";
import { Segmented } from "../ui/Segmented";
import { Button } from "../ui/Button";

type ThemeChoice = "light" | "dark" | "system";

const OPTIONS: { value: ThemeChoice; label: string; Icon: typeof Sun }[] = [
  { value: "light", label: "Light", Icon: Sun },
  { value: "dark", label: "Dark", Icon: Moon },
  { value: "system", label: "System", Icon: Monitor },
];

/** Full segmented picker, or (compact) a single button that cycles light → dark → system. */
export function ThemeToggle({ compact, showLabels }: { compact?: boolean; showLabels?: boolean }) {
  const { theme, setTheme } = useTheme();

  if (compact) {
    const i = OPTIONS.findIndex((o) => o.value === theme);
    const current = OPTIONS[i] ?? OPTIONS[2];
    const next = OPTIONS[(i + 1) % OPTIONS.length];
    return (
      <Button variant="ghost" iconOnly aria-label={`Theme: ${current.label}. Switch to ${next.label}`} onClick={() => setTheme(next.value)}>
        <current.Icon size={18} aria-hidden />
      </Button>
    );
  }

  return (
    <Segmented<ThemeChoice>
      label="Theme"
      value={theme}
      onChange={setTheme}
      options={OPTIONS.map(({ value, label, Icon }) => ({
        value,
        label: (
          <>
            <Icon size={16} aria-hidden />
            <span className={showLabels ? undefined : "cc-sr-only"}>{label}</span>
          </>
        ),
      }))}
    />
  );
}
