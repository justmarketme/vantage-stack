import { mkdir, readFile, writeFile } from "fs/promises";
import { join } from "path";
import { withApiMonitoring } from "../../../lib/monitoring/api";

const ONE_BY_ONE_GIF = Buffer.from(
  "R0lGODlhAQABAPAAAAAAAAAAACH5BAEAAAAALAAAAAABAAEAAAICRAEAOw==",
  "base64"
);

async function ensureDataDir(repoRoot: string) {
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

type DeliveryRecord = {
  id: string;
  opens?: Array<{ opened_at: string; user_agent?: string | null; ip?: string | null }>;
};

async function handler(request: Request) {
  const { searchParams } = new URL(request.url);
  const deliveryId = (searchParams.get("delivery_id") || "").trim();

  try {
    if (deliveryId) {
      const repoRoot = process.cwd();
      await ensureDataDir(repoRoot);

      const dbPath = join(repoRoot, "data", "delivery-logs.json");
      const existing = await readJsonFile<DeliveryRecord[]>(dbPath, []);
      const idx = existing.findIndex((r) => r.id === deliveryId);
      if (idx >= 0) {
        const opens = (existing[idx].opens ?? []).slice();
        opens.unshift({
          opened_at: new Date().toISOString(),
          user_agent: request.headers.get("user-agent"),
          ip: request.headers.get("x-forwarded-for"),
        });
        existing[idx] = { ...existing[idx], opens };
        await writeJsonFile(dbPath, existing);
      }
    }
  } catch {
    // best-effort; never fail the pixel response
  }

  return new Response(ONE_BY_ONE_GIF, {
    status: 200,
    headers: {
      "Content-Type": "image/gif",
      "Cache-Control": "no-store, no-cache, must-revalidate, proxy-revalidate",
      Pragma: "no-cache",
      Expires: "0",
    },
  });
}

export const GET = withApiMonitoring({ route: "/api/track-open", method: "GET", handler });

