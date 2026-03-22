import { readFile } from "fs/promises";
import { join } from "path";

export type DesignTokens = {
  brand?: { name?: string; positioning?: string };
  colors?: Record<string, string>;
  typography?: {
    fontFamily?: Record<string, string[]>;
    scale?: Record<string, string>;
  };
  radius?: Record<string, string>;
  motion?: {
    easing?: Record<string, number[]>;
    durationMs?: Record<string, number>;
  };
  accessibility?: { minTapTargetPx?: number; focusVisibleRequired?: boolean };
  componentLibrary?: { root?: string; preferredSubdir?: string };
};

export async function loadDesignTokens(): Promise<DesignTokens> {
  const path = join(process.cwd(), "mcp", "design-system", "tokens.json");
  const raw = await readFile(path, "utf-8");
  return JSON.parse(raw) as DesignTokens;
}
