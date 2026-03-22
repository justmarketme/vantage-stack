import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { execSync } from "child_process";

const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.join(scriptDir, "..");
const envPath = path.join(repoRoot, ".env.local");

function escapeForDoubleQuotes(v: string) {
  return v.replaceAll("\r", "").replaceAll("\n", "\\n").replaceAll('"', '\\"');
}

function parseArgs() {
  const args = process.argv.slice(2);
  const out: Record<string, string> = {};
  for (let i = 0; i < args.length; i++) {
    const a = args[i] ?? "";
    if (!a.startsWith("--")) continue;
    const key = a.slice(2);
    const next = args[i + 1];
    if (next && !next.startsWith("--")) {
      out[key] = next;
      i++;
    } else {
      out[key] = "true";
    }
  }
  return out;
}

function getClipboardText() {
  const text = execSync('powershell -NoProfile -Command "Get-Clipboard"', { encoding: "utf8" });
  return text.trimEnd();
}

function upsertKeyLine(text: string, key: string, value: string) {
  const line = `${key}="${escapeForDoubleQuotes(value)}"`;
  const re = new RegExp(`^${key}=.*$`, "m");
  if (re.test(text)) return text.replace(re, line);
  const suffix = text.endsWith("\n") ? "" : "\n";
  return text + suffix + line + "\n";
}

function getKeyValueOnDisk(text: string, key: string) {
  const re = new RegExp(`^${key}=(.*)$`, "m");
  const m = text.match(re);
  if (!m) return "";
  return String(m[1] ?? "");
}

function main() {
  const args = parseArgs();
  const key = (args.key ?? args.k ?? "").trim();
  if (!key) {
    console.error("Usage: npx tsx scripts/set-env-local-key-from-clipboard.ts --key WHOIS_API_KEY");
    process.exit(1);
  }
  if (!/^[A-Z0-9_]+$/.test(key)) {
    console.error("Invalid --key. Use only A-Z, 0-9, and underscore.");
    process.exit(1);
  }

  const token = getClipboardText();
  if (!token.trim()) {
    console.error("Clipboard is empty. Copy the key/token first.");
    process.exit(1);
  }

  const before = fs.existsSync(envPath) ? fs.readFileSync(envPath, "utf8") : "";
  const after = upsertKeyLine(before, key, token);
  fs.writeFileSync(envPath, after, "utf8");

  const diskValRaw = getKeyValueOnDisk(after, key);
  const diskNonEmpty = diskValRaw.trim().length > 0;
  console.log(`${key}: nonEmpty=${diskNonEmpty}`);
}

main();

