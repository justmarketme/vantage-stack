import { mkdir, readFile, writeFile } from "fs/promises";
import { existsSync } from "fs";
import { dirname, join } from "path";
import { fileURLToPath } from "url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const repoRoot = join(__dirname, "..", "..");

async function ensureDataDir() {
  await mkdir(join(repoRoot, "data"), { recursive: true });
}

async function readJsonFile<T>(path: string, fallback: T): Promise<T> {
  try {
    const txt = await readFile(path, "utf-8");
    return JSON.parse(txt) as T;
  } catch {
    return fallback;
  }
}

async function writeJsonFile(path: string, value: unknown) {
  await writeFile(path, JSON.stringify(value, null, 2) + "\n", "utf-8");
}

export function dataPath(fileName: string) {
  return join(repoRoot, "data", fileName);
}

export async function loadTable<T>(fileName: string): Promise<T[]> {
  await ensureDataDir();
  return readJsonFile<T[]>(dataPath(fileName), []);
}

export async function appendRow<T>(fileName: string, row: T): Promise<void> {
  await ensureDataDir();
  const path = dataPath(fileName);
  const existing = await readJsonFile<T[]>(path, []);
  existing.unshift(row);
  await writeJsonFile(path, existing);
}

export async function upsertRow<T extends { id: string }>(
  fileName: string,
  row: T,
): Promise<void> {
  await ensureDataDir();
  const path = dataPath(fileName);
  const existing = await readJsonFile<T[]>(path, []);
  const idx = existing.findIndex((r) => r?.id === row.id);
  if (idx >= 0) existing[idx] = row;
  else existing.unshift(row);
  await writeJsonFile(path, existing);
}

export async function loadClients(): Promise<
  Array<{
    id: string;
    name: string;
    company_name?: string;
    email?: string;
    whatsapp?: string;
    active: boolean;
    metadata?: Record<string, unknown>;
  }>
> {
  await ensureDataDir();
  const p = dataPath("clients.json");
  if (!existsSync(p)) return [];
  return readJsonFile(p, []);
}

