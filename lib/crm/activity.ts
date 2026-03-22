import type { Sql } from "postgres";
import { ensureCrmSchema } from "./db";

export async function logCrmActivity(
  db: Sql,
  input: {
    action_type: string;
    client_id?: string | null;
    user_actor?: string;
    details?: Record<string, unknown>;
  },
) {
  await ensureCrmSchema(db);
  await db`
    insert into public.crm_activity (action_type, client_id, user_actor, details)
    values (
      ${input.action_type},
      ${input.client_id ? input.client_id : null}::uuid,
      ${input.user_actor ?? "system"},
      ${JSON.stringify(input.details ?? {})}::jsonb
    )
  `;
}

export async function logTelegramCommand(
  db: Sql,
  input: { command: string; args?: string; chat_id?: string; username?: string; ok: boolean },
) {
  await ensureCrmSchema(db);
  await db`
    insert into public.telegram_command_log (command, args, chat_id, username, ok)
    values (
      ${input.command},
      ${input.args ?? null},
      ${input.chat_id ?? null},
      ${input.username ?? null},
      ${input.ok}
    )
  `;
}
