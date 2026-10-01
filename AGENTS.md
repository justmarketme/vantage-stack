# AGENTS.md — VantageStack

Instructions for AI coding agents (Claude Code, Cursor, Google Antigravity, Codex). This file
only points the way — **`CLAUDE.md` is the source of truth**; if anything here disagrees, CLAUDE.md wins.

## Read first
1. `CLAUDE.md` — stack, critical rules (Supabase project `tinkmipmxunwvyemhalu`; the Supabase MCP
   points at a DIFFERENT project — never migrate through it), Capital Legacy isolation.
2. `docs/AGENT_ARCHITECTURE.md` — the Current scope, **Decisions**, Supplementary directive and
   Influences sections are binding for the Consultant Portal.
3. `docs/consultant-portal/SPEC.md` (wave 1) and `SPEC-WAVE2.md` (wave 2: API, seams, ownership).
4. `COWORK_INTERFACE.md` before touching marketing / landing-page / CRM-operation content.

## Consultant Portal layout
| Path | What |
|---|---|
| `app/consultant/**`, `components/consultant/**` | pages + UI (colours only from `components/consultant/theme.css`) |
| `app/api/consultant/**` | session API (`requireConsultant`) |
| `app/api/webhooks/*`, `app/api/cron/consultant-*`, `app/api/consultant-voice/**` | no session — signature / `CRON_SECRET` auth |
| `lib/consultant/{types,schema,config}.ts` | **contracts — coordinator-owned, do not edit** |
| `lib/consultant/auth/**` | session, roles glue, CSP, HMAC signing, token encryption |
| `lib/consultant/server/**` | repos, events outbox, Emma, calendar, storage |
| `lib/consultant/client/**`, `hooks/consultant/**` | browser API client, Zustand stores, hooks |
| `ai-configs/**` | every prompt and Emma / Coach Alex rule set |
| `docs/consultant-portal/` | SPEC, DEPLOY, POPIA, STAGING |

## Commands
```bash
npx tsc --noEmit -p .                        # type-check
npx eslint <files>                           # lint what you touched
npx jest --config jest.config.cjs <path>     # tests (unit/integration/e2e projects)
npm run consultant:migrate                   # additive schema (app DB only)
npm run consultant:storage                   # private Storage bucket
```
Don't run `next build` / `next dev` in a shared tree. Revert `data/qa/*` and
`tsconfig.tsbuildinfo` churn before finishing. Never commit `.env*` secrets.
