import { mkdir, readFile, writeFile } from "fs/promises";
import { existsSync } from "fs";
import { join } from "path";
import type { SchedulerJobRun } from "./types";

const dataDir = join(process.cwd(), "data");

async function ensureDataDir() {
  await mkdir(dataDir, { recursive: true });
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
  return join(dataDir, fileName);
}

export async function appendJobRun(run: SchedulerJobRun) {
  await ensureDataDir();
  const path = dataPath("scheduler_job_runs.json");
  const existing = await readJsonFile<SchedulerJobRun[]>(path, []);
  existing.unshift(run);
  await writeJsonFile(path, existing);
}

export async function listJobRuns(limit = 200): Promise<SchedulerJobRun[]> {
  await ensureDataDir();
  const path = dataPath("scheduler_job_runs.json");
  if (!existsSync(path)) return [];
  const rows = await readJsonFile<SchedulerJobRun[]>(path, []);
  return rows.slice(0, Math.max(0, limit));
}

