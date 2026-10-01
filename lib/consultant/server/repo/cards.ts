import type { Sql } from "postgres";
import type { CardEventInput } from "../../types";

/** Coach Alex card telemetry — which cards fired on a call and which the consultant used. */
export async function insertCardEvents(db: Sql, callId: string, input: CardEventInput): Promise<void> {
  const rows = input.events.map((e) => ({
    call_id: callId,
    card_id: e.cardId,
    action: e.action,
    trigger_text: e.triggerText ?? null,
    at: new Date(e.at),
  }));
  await db`
    insert into public.consultant_card_events ${db(rows, "call_id", "card_id", "action", "trigger_text", "at")}
  `;
}
