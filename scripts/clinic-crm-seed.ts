/**
 * Creates a clinic and its owner login, plus the four default automations (all DISABLED
 * until the practice reviews the wording). Run `npm run clinic-crm:migrate` first.
 *
 *   CLINIC_CRM_SEED_PASSWORD='…' npm run clinic-crm:seed -- \
 *     --clinic "Smile Dental Sandton" --email owner@smiledental.co.za --name "Dr Naidoo" \
 *     [--sms-from +27…] [--whatsapp-from whatsapp:+27…] [--timezone Africa/Johannesburg]
 *
 * Every flag can instead come from env: CLINIC_CRM_SEED_CLINIC, _EMAIL, _NAME, _SMS_FROM,
 * _WHATSAPP_FROM, _TIMEZONE. The password is ONLY read from CLINIC_CRM_SEED_PASSWORD
 * (never a CLI arg — those land in shell history and process listings), bcrypt-hashed
 * (cost 12) and never printed.
 *
 * Idempotent: an existing clinic with the same name is reused; an existing staff email
 * is left untouched (the script refuses rather than silently resetting a password);
 * automations are inserted ON CONFLICT DO NOTHING.
 */
import bcrypt from "bcryptjs";
import type { Sql } from "postgres";
import { connectCrmDb } from "../lib/crm/db";
import { ensureClinicCrmSchema } from "../lib/clinic-crm/schema";
import { AUTOMATION_DEFAULTS } from "../lib/clinic-crm/server/config";
import { normalizeE164 } from "../lib/clinic-crm/types";
import { LOGIN_POLICY } from "../lib/clinic-crm/auth/policy";

const MIN_PASSWORD = 12;

function arg(flag: string, envName: string): string {
  const i = process.argv.indexOf(flag);
  const v = i >= 0 ? process.argv[i + 1] : process.env[envName];
  return (v ?? "").trim();
}

function die(msg: string): never {
  console.error(`[clinic-crm:seed] ${msg}`);
  process.exit(1);
}

async function main() {
  const clinicName = arg("--clinic", "CLINIC_CRM_SEED_CLINIC");
  const email = arg("--email", "CLINIC_CRM_SEED_EMAIL").toLowerCase();
  const name = arg("--name", "CLINIC_CRM_SEED_NAME");
  const timezone = arg("--timezone", "CLINIC_CRM_SEED_TIMEZONE") || "Africa/Johannesburg";
  const smsRaw = arg("--sms-from", "CLINIC_CRM_SEED_SMS_FROM");
  const waRaw = arg("--whatsapp-from", "CLINIC_CRM_SEED_WHATSAPP_FROM");
  const password = process.env.CLINIC_CRM_SEED_PASSWORD ?? "";

  if (!clinicName) die("--clinic (or CLINIC_CRM_SEED_CLINIC) is required");
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) die("--email must be a valid address");
  if (!name) die("--name (owner's display name) is required");
  if (password.length < MIN_PASSWORD) die(`CLINIC_CRM_SEED_PASSWORD must be set and at least ${MIN_PASSWORD} characters`);
  try {
    new Intl.DateTimeFormat("en", { timeZone: timezone });
  } catch {
    die(`--timezone "${timezone}" is not a valid IANA zone`);
  }

  const smsFrom = smsRaw ? normalizeE164(smsRaw) : "";
  if (smsRaw && !smsFrom) die("--sms-from must be an E.164 number");
  const waNumber = waRaw ? normalizeE164(waRaw) : "";
  if (waRaw && !waNumber) die("--whatsapp-from must be an E.164 number (with or without the whatsapp: prefix)");
  const whatsappFrom = waNumber ? `whatsapp:${waNumber}` : "";

  const db = await connectCrmDb();
  if (!db) die("No database URL. Set SUPABASE_DATABASE_POOLER_URL or DATABASE_URL in .env.local.");

  try {
    await ensureClinicCrmSchema(db);

    const [existingStaff] = await db<{ id: string }[]>`SELECT id FROM clinic_crm.staff WHERE email = ${email}`;
    if (existingStaff) die(`staff ${email} already exists — nothing changed (use the app to reset a password)`);

    const passwordHash = await bcrypt.hash(password, LOGIN_POLICY.bcryptRounds);

    const result = await db.begin(async (txn) => {
      // postgres.js types TransactionSql without its call signature under TS 5; it is callable at runtime.
      const tx = txn as unknown as Sql;
      let [clinic] = await tx<{ id: string }[]>`SELECT id FROM clinic_crm.clinics WHERE name = ${clinicName} LIMIT 1`;
      const reused = Boolean(clinic);
      if (!clinic) {
        [clinic] = await tx<{ id: string }[]>`
          INSERT INTO clinic_crm.clinics (name, timezone, whatsapp_from, sms_from)
          VALUES (${clinicName}, ${timezone}, ${whatsappFrom}, ${smsFrom ?? ""})
          RETURNING id`;
      }
      const [staff] = await tx<{ id: string }[]>`
        INSERT INTO clinic_crm.staff (clinic_id, email, name, role, password_hash)
        VALUES (${clinic.id}, ${email}, ${name}, 'owner', ${passwordHash})
        RETURNING id`;

      let automations = 0;
      for (const a of Object.values(AUTOMATION_DEFAULTS)) {
        const rows = await tx`
          INSERT INTO clinic_crm.automations (clinic_id, kind, enabled, "offset", body)
          VALUES (${clinic.id}, ${a.kind}, ${a.enabled}, ${a.offset}, ${a.body})
          ON CONFLICT (clinic_id, kind) DO NOTHING
          RETURNING id`;
        automations += rows.length;
      }

      await tx`INSERT INTO clinic_crm.audit_log (clinic_id, actor, action, entity, entity_id)
               VALUES (${clinic.id}, 'system', 'seed_owner', 'staff', ${staff.id})`;
      return { clinicId: clinic.id, staffId: staff.id, reused, automations };
    });

    console.log(
      `[clinic-crm:seed] ${result.reused ? "reused" : "created"} clinic ${result.clinicId}; ` +
        `owner ${result.staffId} (${email}); ${result.automations} default automation(s) added (all disabled).`,
    );
  } finally {
    await db.end({ timeout: 5 });
  }
}

main().catch((e) => die(`failed: ${(e as Error).message}`));
