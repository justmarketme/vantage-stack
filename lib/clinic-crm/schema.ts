import type { Sql } from "postgres";

/**
 * Clinic CRM schema — lives in its own Postgres schema, `clinic_crm`, for two reasons:
 *
 * 1. Supabase's REST API only exposes `public` by default. Patient data in a
 *    non-exposed schema cannot be reached with the anon key even if a policy
 *    is ever misconfigured. RLS is also enabled (with no policies) as a second wall.
 * 2. POPIA scoping: every table carries `clinic_id`, and the whole product can be
 *    exported or dropped as a unit.
 *
 * Idempotent: safe to run on every cold start and from `npm run clinic-crm:migrate`.
 */
export const CLINIC_CRM_DDL = [
  `CREATE SCHEMA IF NOT EXISTS clinic_crm`,
  `CREATE EXTENSION IF NOT EXISTS pgcrypto`,

  `CREATE TABLE IF NOT EXISTS clinic_crm.clinics (
    id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    name             text NOT NULL,
    timezone         text NOT NULL DEFAULT 'Africa/Johannesburg',
    whatsapp_from    text NOT NULL DEFAULT '',   -- e.g. whatsapp:+27600132533
    sms_from         text NOT NULL DEFAULT '',   -- E.164 Twilio number
    created_at       timestamptz NOT NULL DEFAULT now()
  )`,

  `CREATE TABLE IF NOT EXISTS clinic_crm.staff (
    id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    clinic_id        uuid NOT NULL REFERENCES clinic_crm.clinics(id) ON DELETE CASCADE,
    email            text NOT NULL UNIQUE,
    name             text NOT NULL,
    role             text NOT NULL CHECK (role IN ('owner','manager','reception')),
    password_hash    text NOT NULL,
    failed_logins    int  NOT NULL DEFAULT 0,
    locked_until     timestamptz,
    created_at       timestamptz NOT NULL DEFAULT now()
  )`,

  `CREATE TABLE IF NOT EXISTS clinic_crm.patients (
    id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    clinic_id         uuid NOT NULL REFERENCES clinic_crm.clinics(id) ON DELETE CASCADE,
    first_name        text NOT NULL,
    last_name         text NOT NULL DEFAULT '',
    phone             text NOT NULL,                 -- E.164
    email             text NOT NULL DEFAULT '',
    preferred_channel text NOT NULL DEFAULT 'whatsapp' CHECK (preferred_channel IN ('whatsapp','sms')),
    consent_at        timestamptz,
    consent_by        uuid REFERENCES clinic_crm.staff(id) ON DELETE SET NULL,
    lead_stage        text CHECK (lead_stage IN ('new','contacted','booked','lost')),
    opted_out_at      timestamptz,
    notes             text NOT NULL DEFAULT '',
    tags              text[] NOT NULL DEFAULT '{}',
    created_at        timestamptz NOT NULL DEFAULT now(),
    updated_at        timestamptz NOT NULL DEFAULT now(),
    UNIQUE (clinic_id, phone)
  )`,

  `CREATE TABLE IF NOT EXISTS clinic_crm.appointments (
    id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    clinic_id        uuid NOT NULL REFERENCES clinic_crm.clinics(id) ON DELETE CASCADE,
    patient_id       uuid NOT NULL REFERENCES clinic_crm.patients(id) ON DELETE CASCADE,
    starts_at        timestamptz NOT NULL,
    duration_min     int  NOT NULL DEFAULT 30,
    practitioner     text NOT NULL DEFAULT '',
    service          text NOT NULL DEFAULT '',
    status           text NOT NULL DEFAULT 'booked'
                     CHECK (status IN ('booked','confirmed','attended','no_show','cancelled')),
    status_at        timestamptz NOT NULL DEFAULT now(),
    created_at       timestamptz NOT NULL DEFAULT now()
  )`,
  `CREATE INDEX IF NOT EXISTS appointments_clinic_start_idx ON clinic_crm.appointments (clinic_id, starts_at)`,

  `CREATE TABLE IF NOT EXISTS clinic_crm.messages (
    id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    clinic_id        uuid NOT NULL REFERENCES clinic_crm.clinics(id) ON DELETE CASCADE,
    patient_id       uuid NOT NULL REFERENCES clinic_crm.patients(id) ON DELETE CASCADE,
    direction        text NOT NULL CHECK (direction IN ('in','out')),
    channel          text NOT NULL CHECK (channel IN ('whatsapp','sms')),
    body             text NOT NULL,
    status           text NOT NULL DEFAULT 'queued',
    twilio_sid       text UNIQUE,                    -- idempotency for webhook retries
    error_code       text,
    automation       text,
    sent_by          uuid REFERENCES clinic_crm.staff(id) ON DELETE SET NULL,
    read_at          timestamptz,
    created_at       timestamptz NOT NULL DEFAULT now()
  )`,
  `CREATE INDEX IF NOT EXISTS messages_patient_idx ON clinic_crm.messages (clinic_id, patient_id, created_at DESC)`,

  `CREATE TABLE IF NOT EXISTS clinic_crm.automations (
    id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    clinic_id        uuid NOT NULL REFERENCES clinic_crm.clinics(id) ON DELETE CASCADE,
    kind             text NOT NULL CHECK (kind IN ('appointment_reminder','no_show_followup','new_lead_ack','recall')),
    enabled          boolean NOT NULL DEFAULT false,
    "offset"         int NOT NULL DEFAULT 24,
    body             text NOT NULL,
    content_sid      text NOT NULL DEFAULT '',
    UNIQUE (clinic_id, kind)
  )`,

  // Outbox: the dispatcher claims due rows with FOR UPDATE SKIP LOCKED, so overlapping
  // cron invocations can never double-send. dedupe_key makes scheduling idempotent.
  `CREATE TABLE IF NOT EXISTS clinic_crm.outbox (
    id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    clinic_id        uuid NOT NULL REFERENCES clinic_crm.clinics(id) ON DELETE CASCADE,
    patient_id       uuid NOT NULL REFERENCES clinic_crm.patients(id) ON DELETE CASCADE,
    automation       text NOT NULL,
    due_at           timestamptz NOT NULL,
    status           text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','sent','failed','skipped')),
    attempts         int  NOT NULL DEFAULT 0,
    last_error       text,
    dedupe_key       text NOT NULL UNIQUE,
    created_at       timestamptz NOT NULL DEFAULT now()
  )`,
  `CREATE INDEX IF NOT EXISTS outbox_due_idx ON clinic_crm.outbox (status, due_at)`,

  `CREATE TABLE IF NOT EXISTS clinic_crm.goals (
    id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    clinic_id        uuid NOT NULL REFERENCES clinic_crm.clinics(id) ON DELETE CASCADE,
    title            text NOT NULL,
    metric           text NOT NULL DEFAULT 'custom',
    target           double precision,
    progress         double precision,
    due_on           date,
    color            text NOT NULL DEFAULT 'blue',
    x                double precision NOT NULL DEFAULT 40,
    y                double precision NOT NULL DEFAULT 40,
    done             boolean NOT NULL DEFAULT false,
    created_at       timestamptz NOT NULL DEFAULT now()
  )`,

  `CREATE TABLE IF NOT EXISTS clinic_crm.staff_state (
    staff_id         uuid NOT NULL REFERENCES clinic_crm.staff(id) ON DELETE CASCADE,
    key              text NOT NULL,
    value            jsonb NOT NULL,
    updated_at       timestamptz NOT NULL DEFAULT now(),
    PRIMARY KEY (staff_id, key)
  )`,

  // POPIA s.17/s.19 accountability: who touched which personal information, when.
  `CREATE TABLE IF NOT EXISTS clinic_crm.audit_log (
    id               bigserial PRIMARY KEY,
    clinic_id        uuid NOT NULL,
    actor            text NOT NULL,                  -- staff id, 'system', or 'twilio'
    action           text NOT NULL,
    entity           text NOT NULL,
    entity_id        text,
    at               timestamptz NOT NULL DEFAULT now()
  )`,
  `CREATE INDEX IF NOT EXISTS audit_clinic_idx ON clinic_crm.audit_log (clinic_id, at DESC)`,

  ...[
    "clinics", "staff", "patients", "appointments", "messages",
    "automations", "outbox", "goals", "staff_state", "audit_log",
  ].map((t) => `ALTER TABLE clinic_crm.${t} ENABLE ROW LEVEL SECURITY`),
];

let ensured: Promise<void> | null = null;

/** Runs the DDL once per process; concurrent callers share the same promise. */
export function ensureClinicCrmSchema(db: Sql): Promise<void> {
  ensured ??= (async () => {
    for (const stmt of CLINIC_CRM_DDL) await db.unsafe(stmt);
  })().catch((e) => {
    ensured = null;
    throw e;
  });
  return ensured;
}
