import { readdir } from "fs/promises";
import { join } from "path";

export async function listUiComponentFiles(subdir = "components/ui"): Promise<string[]> {
  const dir = join(process.cwd(), subdir);
  try {
    const names = await readdir(dir);
    return names
      .filter((n) => n.endsWith(".tsx") || n.endsWith(".ts"))
      .filter((n) => !n.endsWith(".test.ts") && !n.endsWith(".test.tsx"))
      .sort((a, b) => a.localeCompare(b));
  } catch {
    return [];
  }
}
