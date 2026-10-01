import type { Sql } from "postgres";
import { MESSAGES_3A } from "../../metrics/tunables";
import { CLINICS_VERTICAL, type N8nIngress } from "../../types";
import { audit } from "../audit";
import { enqueueMessage, TemplateError } from "../emma/sender";
import { fail, txSql } from "../http";
import { importLeads } from "../repo/leadImport";

/**
 * n8n → app actions (the only inbound path from n8n; signature checked by the route).
 *
 * Idempotency via `consultant_ingress_keys`: the FIRST request with a key runs the action and
 * stores its result; any replay returns the stored result without running anything again.
 * - DB-only actions run in ONE transaction with the key insert, so the key exists iff the
 *   action committed (a failure rolls both back and n8n can simply retry). A concurrent
 *   duplicate blocks on the key's unique index until the first commits, then replays.
 * - `leads.import` uses 3B's importLeads, which manages its own transaction, so the key is
 *   CLAIMED first (result null = in progress → 409 for a concurrent duplicate), then the result
 *   is stored; on failure the claim is released so a retry can run.
 * A key reused for a DIFFERENT action is a 409.
 */

export type IngressOutcome = { status: number; body: { ok: true; result: unknown; replay?: true } };

type KeyRow = { action: string; result: unknown };

async function readKey(db: Sql, key: string): Promise<KeyRow | null> {
  const rows = await db<KeyRow[]>`select action, result from public.consultant_ingress_keys where idempotency_key = ${key}`;
  return rows[0] ?? null;
}

function replayOf(row: KeyRow, action: string): IngressOutcome {
  if (row.action !== action) fail(409, MESSAGES_3A.ingressConflict);
  if (row.result == null) fail(409, "This request is still being processed.");
  return { status: 200, body: { ok: true, result: row.result, replay: true } };
}

export async function handleIngress(db: Sql, input: N8nIngress): Promise<IngressOutcome> {
  const key = input.idempotencyKey;
  const prior = await readKey(db, key);
  if (prior) return replayOf(prior, input.action);

  if (input.action === "leads.import") {
    const claimed = await db`
      insert into public.consultant_ingress_keys (idempotency_key, action) values (${key}, ${input.action})
      on conflict (idempotency_key) do nothing returning 1
    `;
    if (!claimed.length) return replayOf((await readKey(db, key))!, input.action);
    try {
      const result = await importLeads(db, input.batch, { memberId: null, kind: "n8n" });
      await db`update public.consultant_ingress_keys set result = ${db.json(result as never)} where idempotency_key = ${key}`;
      await audit(db, {
        actorId: null,
        actorKind: "n8n",
        action: "n8n.leads.import",
        entity: "lead_import",
        meta: { provider: input.batch.provider, received: input.batch.leads.length, imported: result.imported, duplicates: result.duplicates, rejectedNonZaPhone: result.rejectedNonZaPhone },
      });
      return { status: 200, body: { ok: true, result } };
    } catch (e) {
      await db`delete from public.consultant_ingress_keys where idempotency_key = ${key} and result is null`.catch(() => undefined);
      throw e;
    }
  }

  return db.begin(async (tx) => {
    const t = txSql(tx);
    const claimed = await t`
      insert into public.consultant_ingress_keys (idempotency_key, action) values (${key}, ${input.action})
      on conflict (idempotency_key) do nothing returning 1
    `;
    if (!claimed.length) return replayOf((await readKey(t, key))!, input.action);
    const result = await runAction(t, input);
    await t`update public.consultant_ingress_keys set result = ${t.json(result as never)} where idempotency_key = ${key}`;
    return { status: 200, body: { ok: true as const, result } };
  });
}

async function runAction(t: Sql, input: Exclude<N8nIngress, { action: "leads.import" }>): Promise<Record<string, unknown>> {
  const actor = { id: null, kind: "n8n" as const };
  switch (input.action) {
    case "ping":
      await audit(t, { actorId: null, actorKind: "n8n", action: "n8n.ping", entity: "ingress" });
      return { pong: true };

    case "emma.send": {
      const lead = await t<{ id: string }[]>`
        select id::text from public.clients where id = ${input.leadId}::uuid and vertical = ${CLINICS_VERTICAL}
      `;
      if (!lead[0]) fail(404, MESSAGES_3A.notClinicsLead);
      const r = await enqueueOrBadRequest(() =>
        enqueueMessage(t, {
          audience: "lead",
          template: input.template,
          leadId: input.leadId,
          channel: input.channel,
          variables: input.variables,
          idempotencyKey: `n8n:${input.idempotencyKey}`,
          actor,
        }),
      );
      await audit(t, {
        actorId: null,
        actorKind: "n8n",
        action: "n8n.emma.send",
        entity: "lead",
        entityId: input.leadId,
        meta: { template: input.template, channel: input.channel, messageId: r.id, skipped: r.skipped },
      });
      // Consent gate (Decision 8): not an error — n8n sees why nothing will be sent.
      return r.skipped ? { messageId: r.id, skipped: r.skipped } : { messageId: r.id, status: r.status };
    }

    case "emma.notify_consultant": {
      const m = await t<{ id: string }[]>`
        select id::text from public.team_members where id = ${input.consultantId}::uuid and status = 'active'
      `;
      if (!m[0]) fail(404, MESSAGES_3A.unknownConsultant);
      const r = await enqueueOrBadRequest(() =>
        enqueueMessage(t, {
          audience: "consultant",
          template: input.template,
          consultantId: input.consultantId,
          variables: input.variables,
          idempotencyKey: `n8n:${input.idempotencyKey}`,
          actor,
        }),
      );
      await audit(t, {
        actorId: null,
        actorKind: "n8n",
        action: "n8n.emma.notify_consultant",
        entity: "consultant",
        entityId: input.consultantId,
        meta: { template: input.template, messageId: r.id, skipped: r.skipped },
      });
      return r.skipped ? { messageId: r.id, skipped: r.skipped } : { messageId: r.id, status: r.status };
    }

    case "lead.set_next_action": {
      const rows = await t`
        update public.clients set next_action = ${input.nextAction || null},
          next_action_at = ${input.nextActionAt ? new Date(input.nextActionAt) : null}, updated_at = now()
        where id = ${input.leadId}::uuid and vertical = ${CLINICS_VERTICAL}
        returning id
      `;
      if (!rows.length) fail(404, MESSAGES_3A.notClinicsLead);
      await audit(t, {
        actorId: null,
        actorKind: "n8n",
        action: "n8n.lead.set_next_action",
        entity: "lead",
        entityId: input.leadId,
        meta: { hasDate: !!input.nextActionAt },
      });
      return { leadId: input.leadId, updated: true };
    }
  }
}

async function enqueueOrBadRequest<T>(fn: () => Promise<T>): Promise<T> {
  try {
    return await fn();
  } catch (e) {
    if (e instanceof TemplateError) fail(400, MESSAGES_3A.unknownTemplate, { template: e.code });
    throw e;
  }
}
