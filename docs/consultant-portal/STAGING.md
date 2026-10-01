# Consultant Portal — staging

Staging is a **Supabase branch of the VantageStack project** (`tinkmipmxunwvyemhalu`) — never a
separate Supabase project, and never set up through the Supabase MCP (that MCP is connected to a
different project, `lead-velocity-staging`; see CLAUDE.md → Infra / Deployment). Every step here
is **user-gated**: it needs someone with Supabase dashboard and Vercel access.

Why a branch: it has its own Postgres, Storage, Realtime, API keys and ref, so staging data and
uploads can never mix with production, while billing, settings and people stay in one project.

---

## 1. Create the persistent `staging` branch (once)

1. Supabase dashboard → project `tinkmipmxunwvyemhalu` → **Branches** → **Enable branching**.
   (Branching is a paid feature and bills per branch-hour.)
2. **Create branch** → name `staging`, **Persistent: on** (preview branches are deleted
   automatically; staging must survive).
   CLI equivalent: `npx supabase --project-ref tinkmipmxunwvyemhalu branches create staging --persistent`.
3. Note the branch's own **ref** (e.g. `abcd1234…`), **API URL** `https://<branch-ref>.supabase.co`,
   **anon** and **service_role** keys, and the **pooler connection string**
   (branch → Settings → Database / API).

A new branch has no production data (and must never get any — POPIA). It also does not get the
CRM base tables, because this repo keeps no `supabase/migrations`. Copy the **schema only**:

```bash
pg_dump --schema-only --no-owner --no-privileges --schema=public "$PROD_DATABASE_URL" > /tmp/vs-schema.sql
psql "$STAGING_DATABASE_URL" -f /tmp/vs-schema.sql
```

Never pass a dump that contains data (no `--data-only`, no plain `pg_dump` without `--schema-only`).

## 2. Point Vercel Preview at the branch

Vercel → Project → Settings → Environment Variables, scope **Preview** only (Production keeps
the main project values):

| Variable | Preview value |
|---|---|
| `DATABASE_URL`, `SUPABASE_DATABASE_POOLER_URL` | branch pooler connection string |
| `SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_URL` | `https://<branch-ref>.supabase.co` |
| `SUPABASE_SERVICE_ROLE_KEY` | branch service_role key |
| `SUPABASE_KEY`, `NEXT_PUBLIC_SUPABASE_ANON_KEY` | branch anon key |
| `N8N_EVENTS_WEBHOOK_URL` | the **staging** n8n webhook (or blank to hold events in the outbox) |
| `EMMA_EVENTS_URL` | **blank** — staging must not ping Jono's EMMA with test events |
| `TWILIO_WHATSAPP_FROM` | the Twilio WhatsApp **sandbox** sender, so Emma only reaches numbers that joined the sandbox (`EMMA_DRY_RUN` does nothing on Vercel — every deployment runs with `NODE_ENV=production`) |
| `CONSULTANT_TOKEN_ENC_KEY` | a **different** key from production (`openssl rand -base64 32`) |

The portal CSP is derived from `NEXT_PUBLIC_SUPABASE_URL` / `SUPABASE_URL`, so previews
automatically allow the branch host and nothing else.

Notes:
- **Vercel Cron only runs on the production deployment.** On staging, events still go out
  immediately via `after()` in the request that caused them; to exercise retries call
  `curl -H "Authorization: Bearer $CRON_SECRET" https://<preview-url>/api/cron/consultant-dispatch`.
- Calendar OAuth on a preview needs that preview's callback URL registered with Google /
  Microsoft (DEPLOY.md §11). Use one stable preview alias (e.g. a `staging` git branch with a
  fixed Vercel domain) so the redirect URIs don't change on every push.

## 3. Prepare the branch database (from a machine, never the MCP)

Put the branch values in a separate env file (e.g. `.env.staging.local`, git-ignored) and run:

```bash
cp .env.staging.local .env.local   # or export the branch values in your shell
npm run consultant:migrate          # consultant_* tables, triggers, RLS — idempotent
npm run consultant:storage          # private bucket + policy check — idempotent
CONSULTANT_SEED_ALLOWED_DB_MARKER=<branch-ref> npm run consultant:seed-staging
```

The seed refuses to run unless `DATABASE_URL` contains `CONSULTANT_SEED_ALLOWED_DB_MARKER`. Set
it to the **branch ref**, which never appears in the production URL, so a mis-pointed seed
fails closed instead of writing test clinics into production. Restore your production
`.env.local` afterwards.

## 4. Promotion flow: staging → production

Deploys must never interrupt selling hours (Cloudreach rule), so:

1. **Additive, backwards-compatible schema only.** New tables/columns/indexes with
   `if not exists`; no drops, renames or type changes in the same release as code that depends
   on them. The currently deployed code must keep working against the new schema.
2. Open a PR → Vercel builds a Preview against the staging branch → run `npm run consultant:migrate`
   on staging if the schema changed → Agent 4's suites pass (`npm test`) and a manual smoke on the
   preview (DEPLOY.md §9, plus the wave-2 checks in §14).
3. Merge to `main`. **Before** the production deploy is promoted, run `npm run consultant:migrate`
   (and `consultant:storage` if the bucket settings changed) against production. Because the
   migration is additive, the old deployment keeps serving while it runs.
4. Vercel deploys atomically; roll back with **Instant Rollback** if needed — the additive schema
   stays and is harmless to the previous build.
5. Anything destructive (dropping a column) is a separate, later release, outside SAST selling
   hours, after the code that used it has been gone for at least one release.

Resetting staging: Branches → `staging` → **Reset** (wipes data), then repeat §1 schema copy and §3.
