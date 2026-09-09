# Claude Code Kickoff Prompt

Paste the block below into Claude Code (running in the `vantage-stack` repo).

---

We're standing up a two-part system for Vantage Stack and you (Claude Code) are one half of it.

**The setup:** Claude Cowork runs the SEO/marketing *operation* from a separate workspace folder (`Documents/Claude/Projects/Vantage stack/SEO_Automation/`). You (Claude Code) run the *codebase* — this Next.js app. We split the work by strength: **Claude Code owns the machine (code, DB, deploys); Cowork owns the operation (content, connectors, browser, research, delivery).**

**First, read these so you know the boundary and what's waiting for you:**
1. `COWORK_INTERFACE.md` (repo root) — who owns what + the shared handoff protocol.
2. The pointer now at the top of `CLAUDE.md`.
3. `../Documents/Claude/Projects/Vantage stack/SEO_Automation/DIVISION_OF_LABOR.md` — the full contract (if that path isn't reachable from here, ask me to copy it in).
4. `../Documents/Claude/Projects/Vantage stack/SEO_Automation/handoff/handoff_manifest.json` — the live handoff queue.

**Your standing responsibilities at the seams:**
- **Landing pages / blog as code.** Cowork writes approved copy + JSON-LD as HTML/MD drafts and drops them in `SEO_Automation/handoff/to_claude_code/`. You implement them as real Next.js routes/components, preserve the schema markup and the Space Grotesk + Inter design system, deploy, and record the live URL + commit back in the manifest (`status: "done"`, fill `result`).
- **The CRM operation dashboard tab.** Build a new tab inside the CRM (per the "CRM_DASHBOARD" concept) as a React view that reads the JSON contract at `SEO_Automation/crm_dashboard_data/dashboard_template.json` and renders, in plain human terms: what each agent is doing, progress %, the goal, the why, and analytics snapshot. Cowork writes that data; you render it. Poll/refresh on an interval.
- **In-app cron** (`app/api/cron`) is yours; the marketing cadence (keyword research, briefing, social) is Cowork's — don't schedule the same job twice.

**Your first concrete task — handoff `HO-2026-07-01-001`:**
The `/ai-calling` landing page is staged at `SEO_Automation/handoff/to_claude_code/ai-calling_READY_FOR_REVIEW.html` with a review summary next to it. It's a Problem-Agitate-Solve page with validated JSON-LD (Organization + Service + FAQPage + BreadcrumbList) and SA-specific trust signals. **Do NOT publish yet** — it's blocked on Boss man's approval and on him supplying the booking link, ROI numbers, a real anonymized case study, the explainer video, and footer details (all listed in the review summary). Your job now: scaffold the Next.js route/component for `/ai-calling` from this draft, wire it into the site's routing and design system, keep it behind review, and leave the `>>> REVIEW` items as clearly-marked placeholders. Report back the component path and any decisions.

**Ground rules:** Draft-first — nothing goes live without Boss man's review. Respect everything already in `CLAUDE.md` (the app DB is `tinkmipmxunwvyemhalu`; never run VantageStack migrations through the Supabase MCP; keep Capital Legacy isolated). When you finish anything that crosses the seam, update `handoff_manifest.json` so Cowork knows.
