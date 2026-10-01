import type { Sql } from "postgres";
import { consultantConfig } from "../../config";
import { CLINICS_VERTICAL, normalizeZaPhone, type ScrapedImportResult, type ScrapedLeadImport } from "../../types";
import { CRM_FEED } from "../constants";
import { logActivity } from "../crmFeed";
import { txSql } from "../http";
import { auditSafe, kick } from "../sideEffects";
import { lockPhone, placeholderEmail } from "./leads";

/**
 * Public-domain lead intake (Decision 8). ONE seam for every source of found clinics — the
 * manager import route and 3A's n8n `leads.import` action both call `importLeads`.
 *
 * Rules:
 * - Phones are normalised to SA +27 (`normalizeZaPhone`). A lead without a valid +27 number is
 *   not imported (consultants can't call it) and is counted in `rejectedNonZaPhone`.
 * - Dedupe on phone OR Google place id against existing Clinics leads (and within the batch).
 *   An UNTAGGED CRM row (vertical null — e.g. from the CRM lead scraper) with the same place id
 *   is tagged `vertical = 'clinics'` in place instead of creating a second row for the business.
 *   A row in another vertical, or an email already used by any CRM client, counts as a duplicate.
 * - New rows are unassigned pool leads: stage `new`, `lead_source = 'public_scrape'`,
 *   `source = <provider>`, `source_url`, `sourced_at = now()`, placeholder email when none.
 * - NO consent row is written: messaging consent starts at "none" (consultants may call; Emma
 *   may not message them until they opt in).
 * - One transaction for the whole batch; phones are locked in sorted order so two concurrent
 *   imports can't deadlock. Audited with counts only.
 */

export const PUBLIC_SCRAPE_SOURCE = "public_scrape" as const;

export type ImportCandidate = {
  name: string;
  phone: string;
  email: string | null;
  website: string | null;
  address: string | null;
  placeId: string | null;
  contactName: string | null;
  contactRole: string | null;
  city: string | null;
  sourceUrl: string | null;
};

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function clean(v: string | null | undefined): string | null {
  const s = (v ?? "").trim();
  return s && s !== "—" && s !== "-" ? s : null;
}

function httpUrl(v: string | null | undefined, addScheme: boolean): string | null {
  let s = clean(v);
  if (!s) return null;
  if (addScheme && !/^https?:\/\//i.test(s)) s = `https://${s}`;
  try {
    const u = new URL(s);
    return u.protocol === "http:" || u.protocol === "https:" ? u.toString() : null;
  } catch {
    return null;
  }
}

/**
 * Pure first pass: normalise, reject non-+27 numbers, and drop in-batch duplicates (same phone
 * or same place id — the first occurrence wins). Unit-tested.
 */
export function prepareImport(batch: Pick<ScrapedLeadImport, "leads">): {
  candidates: ImportCandidate[];
  rejectedNonZaPhone: number;
  duplicates: number;
} {
  const candidates: ImportCandidate[] = [];
  const phones = new Set<string>();
  const places = new Set<string>();
  let rejectedNonZaPhone = 0;
  let duplicates = 0;
  for (const l of batch.leads) {
    const phone = l.phone ? normalizeZaPhone(l.phone) : null;
    if (!phone) {
      rejectedNonZaPhone++;
      continue;
    }
    const placeId = clean(l.placeId);
    if (phones.has(phone) || (placeId && places.has(placeId))) {
      duplicates++;
      continue;
    }
    phones.add(phone);
    if (placeId) places.add(placeId);
    const email = clean(l.email)?.toLowerCase() ?? null;
    candidates.push({
      name: l.businessName.trim(),
      phone,
      email: email && EMAIL.test(email) ? email : null,
      website: httpUrl(l.website, true),
      address: clean(l.address),
      placeId,
      contactName: clean(l.contactName) ?? clean(l.ownerName),
      contactRole: clean(l.contactRole),
      city: clean(l.city),
      sourceUrl: httpUrl(l.sourceUrl, false),
    });
  }
  return { candidates, rejectedNonZaPhone, duplicates };
}

/**
 * The CRM lead scraper adds these columns lazily (app/api/crm/lead-scraper/import); the import
 * needs them too, so the same idempotent, additive DDL runs once per process.
 * TODO(contract-request 3B-CR-4): add place_id / source / address + the place_id index to CONSULTANT_DDL_V2.
 */
let columnsEnsured = false;
export async function ensureImportColumns(db: Sql): Promise<void> {
  if (columnsEnsured) return;
  await db.unsafe(`
    alter table public.clients add column if not exists place_id text;
    alter table public.clients add column if not exists source text;
    alter table public.clients add column if not exists address text;
    create unique index if not exists clients_place_id_uidx on public.clients (place_id) where place_id is not null;
  `);
  columnsEnsured = true;
}

type Match = { id: string; vertical: string | null };

export async function importLeads(
  db: Sql,
  batch: ScrapedLeadImport,
  actor: { memberId: string | null; kind: "member" | "n8n" },
): Promise<ScrapedImportResult> {
  const prepared = prepareImport(batch);
  const result: ScrapedImportResult = { imported: 0, duplicates: prepared.duplicates, rejectedNonZaPhone: prepared.rejectedNonZaPhone };
  const cfg = consultantConfig();
  const actorLabel = actor.kind === "n8n" ? "n8n" : "lead_import";

  if (prepared.candidates.length) {
    await ensureImportColumns(db);
    const sorted = [...prepared.candidates].sort((a, b) => (a.phone < b.phone ? -1 : a.phone > b.phone ? 1 : 0));

    const counts = await db.begin(async (tx) => {
      const t = txSql(tx);
      let imported = 0;
      let duplicates = 0;
      for (const c of sorted) {
        await lockPhone(t, c.phone);

        const clinics = await t<{ id: string }[]>`
          select id::text from public.clients
          where vertical = ${CLINICS_VERTICAL}
            and (phone = ${c.phone} or (${c.placeId}::text is not null and place_id = ${c.placeId}))
          limit 1
        `;
        if (clinics[0]) {
          duplicates++;
          continue;
        }

        if (c.placeId) {
          const byPlace = await t<Match[]>`select id::text, vertical from public.clients where place_id = ${c.placeId} limit 1 for update`;
          if (byPlace[0]) {
            if (byPlace[0].vertical) {
              duplicates++; // belongs to another vertical — never re-tag it
              continue;
            }
            // Untagged CRM row for the same business → bring it into the Clinics pool in place.
            await t`
              update public.clients set
                vertical = ${CLINICS_VERTICAL},
                sales_stage = coalesce(sales_stage, 'new'),
                sales_stage_changed_at = coalesce(sales_stage_changed_at, now()),
                phone = coalesce(phone, ${c.phone}),
                contact_name = coalesce(contact_name, ${c.contactName}),
                contact_role = coalesce(contact_role, ${c.contactRole}),
                city = coalesce(city, ${c.city}),
                website_url = coalesce(website_url, ${c.website}),
                address = coalesce(address, ${c.address}),
                lead_source = coalesce(lead_source, ${PUBLIC_SCRAPE_SOURCE}),
                source = coalesce(source, ${batch.provider}),
                source_url = coalesce(source_url, ${c.sourceUrl}),
                sourced_at = coalesce(sourced_at, now()),
                updated_at = now()
              where id = ${byPlace[0].id}::uuid
            `;
            await logActivity(t, CRM_FEED.activity.leadCreated, byPlace[0].id, actorLabel, {
              source: PUBLIC_SCRAPE_SOURCE,
              provider: batch.provider,
              tagged_existing: true,
              consultant_id: null,
            });
            imported++;
            continue;
          }
        }

        if (c.email) {
          const byEmail = await t<{ id: string }[]>`select id::text from public.clients where lower(email) = ${c.email} limit 1`;
          if (byEmail[0]) {
            duplicates++; // the business is already a CRM client (any vertical)
            continue;
          }
        }

        const rows = await t<{ id: string }[]>`
          insert into public.clients (
            name, company, email, website_url, city, address, contact_name, contact_role, phone,
            lead_source, source, place_id, source_url, sourced_at,
            vertical, sales_stage, sales_stage_changed_at, status, created_by
          ) values (
            ${c.name}, ${c.name}, ${c.email ?? placeholderEmail()}, ${c.website}, ${c.city}, ${c.address},
            ${c.contactName}, ${c.contactRole}, ${c.phone},
            ${PUBLIC_SCRAPE_SOURCE}, ${batch.provider}, ${c.placeId}, ${c.sourceUrl}, now(),
            ${CLINICS_VERTICAL}, 'new', now(), ${cfg.pipeline.newLeadStatus}, ${actorLabel}
          )
          returning id::text
        `;
        await logActivity(t, CRM_FEED.activity.leadCreated, rows[0].id, actorLabel, {
          source: PUBLIC_SCRAPE_SOURCE,
          provider: batch.provider,
          consultant_id: null,
        });
        imported++;
      }
      return { imported, duplicates };
    });
    result.imported = counts.imported;
    result.duplicates += counts.duplicates;
  }

  kick();
  await auditSafe(db, {
    actorId: actor.memberId,
    actorKind: actor.kind,
    action: "leads.import",
    entity: "lead_import",
    meta: {
      provider: batch.provider,
      received: batch.leads.length,
      imported: result.imported,
      duplicates: result.duplicates,
      rejectedNonZaPhone: result.rejectedNonZaPhone,
    },
  });
  return result;
}
