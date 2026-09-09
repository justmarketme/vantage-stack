# COWORK_INTERFACE.md — how Claude Code and Claude Cowork divide the work

> Read this whenever a task touches marketing content, landing-page copy, the CRM operation
> dashboard, analytics delivery, or anything produced outside this repo.

## The one-line rule
**Claude Code owns the machine. Claude Cowork owns the operation.**
If it compiles, deploys, or touches the DB → it's yours (Claude Code).
If it's content, a connector, a browser, research, a schedule, or a delivery → it's Cowork's.

## What Claude Cowork is doing (do NOT duplicate it here)
Cowork runs the SEO/marketing operation from a separate workspace folder
(`Documents/Claude/Projects/Vantage stack/SEO_Automation/`). It owns:
- Blog + landing-page **copy, structure, and assets** (images/video), case studies, research
- Social publishing (LinkedIn/Facebook/Instagram), GSC/GA4 analytics pulls
- The **Sunday briefing** (delivered via Microsoft Teams + Outlook)
- The **data** that feeds the CRM operation dashboard (JSON files), and the content cadence (scheduled tasks)

## ⚙️ YOU own and RUN the always-on orchestrator (decided by Boss man)
The persistent engine that never stops — the **4 sub-agents** (Builder / Debugger / Tester / Researcher),
the **30-second event aggregator**, the **cron dispatch** (Mon keyword research, Tue outlines, Thu drafts,
Fri/Sat/Sun social, Sun briefing), and the **never-give-up failure loop** — is **yours to implement in this
app and keep running**. Use the app's stack: `mcp/` servers, `app/api/cron`, and a long-running worker
(not a loose Python script). The reference implementation of the intended behaviour is
`SEO_Automation/run.py` — read it as the spec, then build the real thing in TypeScript here.
When the orchestrator needs a connector, a browser (Google Flow, social schedulers, GSC/GA4), or content,
it **delegates to Claude Cowork** by writing a handoff entry; Cowork executes and reports back.

## What YOU (Claude Code) own at the seams
1. **Landing pages / blog as code.** Cowork hands you approved HTML/MD drafts; you implement them
   as Next.js routes/components, preserve the JSON-LD schema, deploy, and record the live URL back.
2. **The CRM operation dashboard TAB.** You build the React tab; it reads the JSON contract at
   `SEO_Automation/crm_dashboard_data/dashboard_template.json`. Cowork writes that data — you render it.
3. **In-app cron** (`app/api/cron`) is yours; the marketing cadence is Cowork's. Don't schedule the same job twice.

## The shared handoff queue
**In-repo mirror (reliable, always reachable):** `cowork-handoff/` at this repo's root holds a copy of
everything handed to you — the manifest plus `to_claude_code/`. Use this if you can't reach the external
Cowork folder. Cowork keeps it in sync with its canonical copy.

`SEO_Automation/handoff/handoff_manifest.json` (external Cowork folder) is the canonical record.
- Incoming work for you lands in `SEO_Automation/handoff/to_claude_code/` with a manifest entry (`status: "ready"`).
- When done, set that entry `status: "done"` and fill `result` (live URL + commit).
- When you need something from Cowork (copy, an asset, a metric), append an entry `to: "cowork"`.

**First handoff waiting for you:** `HO-2026-07-01-001` — the `/ai-calling` landing page
(`to_claude_code/ai-calling_READY_FOR_REVIEW.html`), blocked on Boss man's approval + details.

## Full contract
Canonical division of labor: `SEO_Automation/DIVISION_OF_LABOR.md` (Cowork side).
