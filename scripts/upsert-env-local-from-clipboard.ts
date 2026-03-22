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

function upsertKeyLine(text: string, key: string, value: string) {
  const line = `${key}="${escapeForDoubleQuotes(value)}"`;
  const re = new RegExp(`^${key}=.*$`, "m");
  if (re.test(text)) return text.replace(re, line);
  const suffix = text.endsWith("\n") ? "" : "\n";
  return text + suffix + line + "\n";
}

function parseAssignments(clipboardText: string) {
  // Accept lines like:
  //   KEY=value
  //   KEY="value"
  const assignments: Array<{ key: string; value: string }> = [];
  const lines = clipboardText.split(/\r?\n/);
  for (const rawLine of lines) {
    const line = rawLine.trim();
    if (!line) continue;
    const m = /^([A-Z0-9_]+)=(.*)$/.exec(line);
    if (!m) continue;
    const key = m[1];
    let value = m[2] ?? "";
    value = value.trim();
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }
    assignments.push({ key, value });
  }
  return assignments;
}

function getClipboardText() {
  // Use PowerShell to read clipboard on Windows.
  const text = execSync('powershell -NoProfile -Command "Get-Clipboard"', { encoding: "utf8" });
  return text.trimEnd();
}

function getKeyValueOnDisk(text: string, key: string) {
  const re = new RegExp(`^${key}=(.*)$`, "m");
  const m = text.match(re);
  if (!m) return "";
  return String(m[1] ?? "");
}

function main() {
  const clipboard = getClipboardText();
  if (!clipboard.trim()) {
    console.error("Clipboard is empty. Copy KEY=value lines first.");
    process.exit(1);
  }

  const assignments = parseAssignments(clipboard);
  if (!assignments.length) {
    console.error("No KEY=value lines found in clipboard.");
    process.exit(1);
  }

  const before = fs.existsSync(envPath) ? fs.readFileSync(envPath, "utf8") : "";
  let after = before;

  for (const { key, value } of assignments) {
    after = upsertKeyLine(after, key, value);
  }

  fs.writeFileSync(envPath, after, "utf8");

  // Verify only by non-empty signature (do not print secret values).
  for (const { key } of assignments) {
    const diskValRaw = getKeyValueOnDisk(after, key);
    const diskNonEmpty = diskValRaw.trim().length > 0;
    console.log(`${key}: nonEmpty=${diskNonEmpty}`);
  }
}

main();

