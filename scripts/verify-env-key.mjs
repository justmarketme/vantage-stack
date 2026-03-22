import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");
const envPath = path.join(root, ".env.local");

if (process.argv[2] === "--twilio-all") {
  const lines = fs.readFileSync(envPath, "utf8").split(/\r?\n/);
  for (let i = 0; i < lines.length; i++) {
    const l = lines[i];
    if (!l.includes("TWILIO")) continue;
    const ix = l.indexOf("=");
    const k = ix >= 0 ? l.slice(0, ix).trim() : l;
    let val = ix >= 0 ? l.slice(ix + 1).trim() : "";
    if (val.startsWith('"') && val.endsWith('"')) val = val.slice(1, -1);
    console.log(`Line ${i + 1}: ${k} valueLen=${val.length} startsAC=${val.startsWith("AC")}`);
  }
  process.exit(0);
}

const key = process.argv[2] || "TWILIO_ACCOUNT_SID";
const t = fs.readFileSync(envPath, "utf8");
const re = new RegExp(`^${key}=(.*)$`, "m");
const m = t.match(re);
let v = m ? m[1].trim() : "";
if (v.startsWith('"') && v.endsWith('"')) v = v.slice(1, -1);

console.log(`${key} nonEmpty:`, v.length > 0);
if (key === "TWILIO_ACCOUNT_SID") {
  console.log("Looks like Twilio Account SID (starts with AC):", v.startsWith("AC"));
}
