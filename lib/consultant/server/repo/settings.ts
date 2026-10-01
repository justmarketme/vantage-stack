import type { Sql } from "postgres";
import { consultantConfig } from "../../config";
import { GamificationSettings } from "../../types";
import { logError } from "../http";

/**
 * Gamification settings: `consultant_settings` row with key "gamification", editable in the
 * app by the Acquisition & Creative role (`manage_gamification`). Falls back to
 * `cfg.gamificationDefaults` when the row is missing OR fails validation (a bad row must never
 * take the leaderboard down — it is logged, and the next PUT replaces it).
 */
export const GAMIFICATION_KEY = "gamification";

export function defaultGamification(): GamificationSettings {
  return GamificationSettings.parse(consultantConfig().gamificationDefaults);
}

export async function getGamificationSettings(db: Sql): Promise<GamificationSettings> {
  const rows = await db<{ value: unknown }[]>`select value from public.consultant_settings where key = ${GAMIFICATION_KEY}`;
  if (!rows[0]) return defaultGamification();
  const parsed = GamificationSettings.safeParse(rows[0].value);
  if (parsed.success) return parsed.data;
  logError("settings.gamification.invalid", new Error("invalid_settings_row"));
  return defaultGamification();
}

export async function putGamificationSettings(db: Sql, value: GamificationSettings, memberId: string): Promise<GamificationSettings> {
  await db`
    insert into public.consultant_settings (key, value, updated_by, updated_at)
    values (${GAMIFICATION_KEY}, ${db.json(value as never)}, ${memberId}::uuid, now())
    on conflict (key) do update set value = excluded.value, updated_by = excluded.updated_by, updated_at = now()
  `;
  return value;
}
