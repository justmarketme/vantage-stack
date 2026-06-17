import type { Sql } from "postgres";
import type { IsabelTurn } from "./elevenlabs-text";

/**
 * Persistence for Isabel's WhatsApp threads.
 *
 * One row per WhatsApp number. The transcript is JSONB so each inbound webhook
 * can re-seed Isabel with recent turns. Also holds booking state and the Meta
 * compliance fields (last inbound for the 24h-window check, opt-out, nudge once)
 * per docs/WHATSAPP_COMPLIANCE_PLAYBOOK.md.
 */

export type BookingStatus = "none" | "offering" | "booked";

export type WhatsAppThread = {
  phone: string;
  profile_name: string | null;
  transcript: IsabelTurn[];
  lead_client_id: string | null;
  opted_out: boolean;
  last_inbound_at: string | null;
  booking_status: BookingStatus;
  booking_offered: string[]; // ISO slot starts currently offered
  booking_uid: string | null;
  booking_name: string | null;
  booking_email: string | null;
  booking_intent_at: string | null;
  nudge_sent_at: string | null;
};

let ensured = false;

export async function ensureWhatsAppSchema(db: Sql): Promise<void> {
  if (ensured) return;
  await db`
    create table if not exists public.isabel_whatsapp_threads (
      phone           text primary key,
      profile_name    text,
      transcript      jsonb not null default '[]'::jsonb,
      lead_client_id  uuid,
      created_at      timestamptz not null default now(),
      updated_at      timestamptz not null default now()
    )
  `;
  // Idempotent column adds (booking + compliance state).
  await db`alter table public.isabel_whatsapp_threads add column if not exists opted_out boolean not null default false`;
  await db`alter table public.isabel_whatsapp_threads add column if not exists last_inbound_at timestamptz`;
  await db`alter table public.isabel_whatsapp_threads add column if not exists booking_status text not null default 'none'`;
  await db`alter table public.isabel_whatsapp_threads add column if not exists booking_offered jsonb not null default '[]'::jsonb`;
  await db`alter table public.isabel_whatsapp_threads add column if not exists booking_uid text`;
  await db`alter table public.isabel_whatsapp_threads add column if not exists booking_name text`;
  await db`alter table public.isabel_whatsapp_threads add column if not exists booking_email text`;
  await db`alter table public.isabel_whatsapp_threads add column if not exists booking_intent_at timestamptz`;
  await db`alter table public.isabel_whatsapp_threads add column if not exists nudge_sent_at timestamptz`;
  ensured = true;
}

type Row = {
  phone: string;
  profile_name: string | null;
  transcript: IsabelTurn[];
  lead_client_id: string | null;
  opted_out: boolean;
  last_inbound_at: string | null;
  booking_status: string;
  booking_offered: string[];
  booking_uid: string | null;
  booking_name: string | null;
  booking_email: string | null;
  booking_intent_at: string | null;
  nudge_sent_at: string | null;
};

function toThread(row: Row): WhatsAppThread {
  return {
    phone: row.phone,
    profile_name: row.profile_name,
    transcript: Array.isArray(row.transcript) ? row.transcript : [],
    lead_client_id: row.lead_client_id,
    opted_out: Boolean(row.opted_out),
    last_inbound_at: row.last_inbound_at,
    booking_status: (["none", "offering", "booked"].includes(row.booking_status) ? row.booking_status : "none") as BookingStatus,
    booking_offered: Array.isArray(row.booking_offered) ? row.booking_offered : [],
    booking_uid: row.booking_uid,
    booking_name: row.booking_name,
    booking_email: row.booking_email,
    booking_intent_at: row.booking_intent_at,
    nudge_sent_at: row.nudge_sent_at,
  };
}

export async function getThread(db: Sql, phone: string): Promise<WhatsAppThread | null> {
  const rows = await db<Row[]>`
    select phone, profile_name, transcript, lead_client_id::text as lead_client_id,
           opted_out, last_inbound_at, booking_status, booking_offered,
           booking_uid, booking_name, booking_email, booking_intent_at, nudge_sent_at
    from public.isabel_whatsapp_threads
    where phone = ${phone}
  `;
  const row = rows?.[0];
  return row ? toThread(row) : null;
}

/** Mark an inbound message: ensure the row exists and stamp last_inbound_at (the 24h-window anchor). */
export async function touchInbound(db: Sql, phone: string, profileName?: string | null): Promise<void> {
  await db`
    insert into public.isabel_whatsapp_threads (phone, profile_name, last_inbound_at)
    values (${phone}, ${profileName || null}, now())
    on conflict (phone) do update set
      last_inbound_at = now(),
      profile_name    = coalesce(public.isabel_whatsapp_threads.profile_name, excluded.profile_name),
      updated_at      = now()
  `;
}

export async function setOptedOut(db: Sql, phone: string, value: boolean): Promise<void> {
  await db`update public.isabel_whatsapp_threads set opted_out = ${value}, updated_at = now() where phone = ${phone}`;
}

/** Update the booking state machine. */
export async function setBookingState(
  db: Sql,
  phone: string,
  s: {
    status: BookingStatus;
    offered?: string[];
    uid?: string | null;
    name?: string | null;
    email?: string | null;
    markIntent?: boolean;
    markNudged?: boolean;
  },
): Promise<void> {
  await db`
    update public.isabel_whatsapp_threads set
      booking_status    = ${s.status},
      booking_offered   = ${JSON.stringify(s.offered ?? [])}::jsonb,
      booking_uid       = coalesce(${s.uid ?? null}, booking_uid),
      booking_name      = coalesce(${s.name ?? null}, booking_name),
      booking_email     = coalesce(${s.email ?? null}, booking_email),
      booking_intent_at = ${s.markIntent ? db`now()` : db`booking_intent_at`},
      nudge_sent_at     = ${s.markNudged ? db`now()` : db`nudge_sent_at`},
      updated_at        = now()
    where phone = ${phone}
  `;
}

/** Append the user message + Isabel's reply and upsert the thread. */
export async function appendTurns(
  db: Sql,
  params: { phone: string; profileName?: string | null; userMessage: string; assistantReply: string; prior: IsabelTurn[] },
): Promise<void> {
  const next: IsabelTurn[] = [
    ...params.prior,
    { role: "user" as const, content: params.userMessage },
    { role: "assistant" as const, content: params.assistantReply },
  ].slice(-40); // cap stored history

  await db`
    insert into public.isabel_whatsapp_threads (phone, profile_name, transcript)
    values (${params.phone}, ${params.profileName || null}, ${JSON.stringify(next)}::jsonb)
    on conflict (phone) do update set
      transcript   = ${JSON.stringify(next)}::jsonb,
      profile_name = coalesce(public.isabel_whatsapp_threads.profile_name, excluded.profile_name),
      updated_at   = now()
  `;
}

export async function linkLeadClient(db: Sql, phone: string, clientId: string): Promise<void> {
  await db`
    update public.isabel_whatsapp_threads
    set lead_client_id = ${clientId}::uuid, updated_at = now()
    where phone = ${phone}
  `;
}

/** Threads eligible for the one-time 2h "didn't finish booking" nudge. */
export async function getNudgeCandidates(db: Sql): Promise<WhatsAppThread[]> {
  const rows = await db<Row[]>`
    select phone, profile_name, transcript, lead_client_id::text as lead_client_id,
           opted_out, last_inbound_at, booking_status, booking_offered,
           booking_uid, booking_name, booking_email, booking_intent_at, nudge_sent_at
    from public.isabel_whatsapp_threads
    where booking_status = 'offering'
      and opted_out = false
      and nudge_sent_at is null
      and last_inbound_at is not null
      and last_inbound_at < now() - interval '2 hours'
  `;
  return (rows || []).map(toThread);
}
