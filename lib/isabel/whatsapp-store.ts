import type { Sql } from "postgres";
import type { IsabelTurn } from "./elevenlabs-text";

/**
 * Persistence for Isabel's WhatsApp threads.
 *
 * One row per WhatsApp number. The transcript is kept as JSONB so each inbound
 * webhook can re-seed Isabel with recent turns (ConvAI has no server-side
 * resume). Extracted lead fields and the linked CRM client id live here too.
 */

export type WhatsAppThread = {
  phone: string;
  profile_name: string | null;
  transcript: IsabelTurn[];
  lead_client_id: string | null;
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
  ensured = true;
}

export async function getThread(db: Sql, phone: string): Promise<WhatsAppThread | null> {
  const rows = await db<Array<{ phone: string; profile_name: string | null; transcript: IsabelTurn[]; lead_client_id: string | null }>>`
    select phone, profile_name, transcript, lead_client_id::text as lead_client_id
    from public.isabel_whatsapp_threads
    where phone = ${phone}
  `;
  const row = rows?.[0];
  if (!row) return null;
  return {
    phone: row.phone,
    profile_name: row.profile_name,
    transcript: Array.isArray(row.transcript) ? row.transcript : [],
    lead_client_id: row.lead_client_id,
  };
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
