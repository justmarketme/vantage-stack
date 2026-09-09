# CLAUDE.md — Vantage Stack

Standing engineering rules for this project. These apply to **every** task — read and follow them on every run.

> **Working alongside Claude Cowork:** the SEO/marketing operation is run by Claude Cowork from a
> separate workspace. Before touching marketing content, landing-page copy, the CRM operation
> dashboard, or analytics delivery, read **`COWORK_INTERFACE.md`** — it defines who owns what and the
> shared handoff queue. Rule of thumb: **Claude Code owns the machine; Cowork owns the operation.**

---

## Project

**VantageStack** is an AI calling and CRM platform that qualifies leads, books appointments, and demo-calls prospects.

**GitHub:** `justmarketme/vantage-stack`
**Vercel project ID:** `prj_y1JnywARKccCSRxR86LBBBSsT8zO` (team: `team_UlVtHW4rq7AN951png8rU4qk`)
**Dev port:** 6685

---

## Stack

| Layer | Tech |
|---|---|
| Framework | Next.js 15 (App Router) · TypeScript · Tailwind CSS |
| Database | Supabase (Postgres via `postgres` driver, pooler URL) |
| AI Voice | ElevenLabs ConvAI (`@elevenlabs/react`) — agent: **VS DEMO CALLER** |
| Voice / SMS | Twilio (outbound calls via TwiML + SMS) |
| Auth | Custom admin session cookie — `jose` + `bcryptjs` (no Supabase Auth) |
| Observability | Sentry |
| AI (secondary) | Ultravox client |
| Animation | Framer Motion |
| Charts | chart.js + react-chartjs-2 |
| MCP | `@modelcontextprotocol/sdk` — 20+ internal MCP servers under `mcp/` |
| Telegram bot | `node-telegram-bot-api` |
| PDF / canvas | jspdf, html2canvas, canvg |
| Validation | zod + zod-to-json-schema |

---

## Directory Map

```
app/                    Next.js App Router pages + API routes
  admin/                Admin dashboard
  analytics/            Analytics views
  api/                  API routes (see below)
  blueprint/            Blueprint multi-step form flow
  crm/                  CRM views
  design-system/        Design system docs
  monitoring/           Monitoring dashboard
  qa/                   QA tooling
  report/               Report views
  scheduler/            Scheduler views

app/api/
  admin/        analytics/      blueprint/      crm/
  cron/         delivery/       demo-call/      dev/
  elevenlabs/   health/         monitoring/     qa/
  report/       research/       scheduler/      telegram/
  track-open/   video/

components/             Shared React components
  agent-config/AgentConfigDrawer.tsx  — key component

lib/                    Server-side utilities
  admin/   analytics/  api/     auth/
  blueprint/  crm/     delivery/  demo-call/
  design-system/  design-to-code/  email/
  monitoring/  scheduler-engine/  sop/
  team/  weekly-scheduler/

hooks/                  Client-side React hooks
scripts/                One-off and setup scripts (tsx)
types/                  Shared TypeScript types
tests/                  Jest suites (unit / integration / e2e)
mcp/                    Internal MCP servers (see below)
public/                 Static assets
content/                Content files
data/                   Data files
docs/                   Project docs
```

---

## Internal MCP Servers (`mcp/`)

Each is a TypeScript `server.ts`, runnable via `npm run mcp:<name>`:

- `analytics-engine`
- `avatar-generator`
- `blueprint-validator`
- `briefing-generator`
- `ceo-coach`
- `crm-orchestrator`
- `database-architect`
- `delivery-coordinator`
- `design-system`
- `design-to-code`
- `documentation-specialist`
- `email-orchestrator`
- `infrastructure-deployer`
- `monitoring-engine`
- `qa-engineer`
- `report-builder`
- `report-generator`
- `research-orchestrator`
- `scheduler-engine`
- `secrets-manager`
- `sop-generator`
- `telegram-orchestrator`
- `video-generator`
- `weekly-scheduler`

---

## Environment Variables (`.env.local` required)

```
DATABASE_URL
SUPABASE_DATABASE_POOLER_URL
SUPABASE_KEY
SUPABASE_URL
SUPABASE_SERVICE_ROLE_KEY
NEXT_PUBLIC_SUPABASE_URL
ADMIN_SESSION_SECRET
ELEVEN_LABS_API_KEY
NEXT_PUBLIC_ELEVENLABS_AGENT_ID
TWILIO_ACCOUNT_SID
TWILIO_AUTH_TOKEN
TWILIO_FROM_NUMBER
NEXT_PUBLIC_APP_URL          # public base URL — required for Twilio TwiML webhook
```

Never commit `.env.local` or any file containing secrets.

---

## Build & Test

```bash
npm install
npm run dev          # http://localhost:6685
npm run build
npm test             # all suites
npm run test:unit
npm run test:integration
npm run test:e2e
npm run lint
npx tsc --noEmit
```

---

## Critical Rules

### Engineering
- **Work from first principles.** Understand the real requirement before writing code. Don't copy an existing pattern just because it's there — choose the simplest design that satisfies the requirement.
- **Keep the build clean.** Small, single-responsibility modules. No dead code, no duplication, clear names.
- **Never hardcode.** Every number, key, endpoint, prompt, and toggle must live in config/env — never inline.
- **Done means tested.** Nothing is done until proven working end-to-end with tests.

### Infra / Deployment
- **Capital Legacy (`Capital_Legacy_cc_leader_board`) must never cross-contaminate with VantageStack.** These two repos are completely isolated. Capital Legacy pushes must never trigger deployments into the VantageStack Vercel project. If Capital Legacy deployments appear in VantageStack's Vercel deployment list, investigate immediately — the wrong repo may be connected under Vercel → Settings → Git.
- Twilio TwiML webhook: `{NEXT_PUBLIC_APP_URL}/api/demo-call/twiml` — must be publicly reachable.
- ElevenLabs agent ID is in `NEXT_PUBLIC_ELEVENLABS_AGENT_ID`.
- **The app DB is Supabase project `tinkmipmxunwvyemhalu`** (from `.env.local`). The connected **Supabase MCP points at a DIFFERENT project** (`cmsylaupctrbsvzrgzwy`, "lead-velocity-staging"). NEVER run migrations / `execute_sql` / schema checks for VantageStack through the MCP — it hits the wrong database. For app DB work use the `postgres` driver against `DATABASE_URL`, or `npx supabase` linked to `tinkmipmxunwvyemhalu`.

---

## Design System

Fonts: **Space Grotesk** (headings) + **Inter** (body)
Animations: Framer Motion throughout
Custom cursor on desktop
Scroll animations + parallax effects

---

## Blueprint System Overhaul

Full audit completed 2026-06-09. Everything below is planned but NOT yet implemented.

### What was audited

- `components/blueprint/UnifiedBlueprintForm.tsx` — 3-step form, 4 paths (LEADS/PRESENCE/AUTOMATION/EXPLORE)
- `lib/blueprint/schema.ts` — Zod validation schema
- `lib/crm/intake.ts` — intake pipeline: validate → INSERT → task → events → generate → WhatsApp
- `lib/crm/blueprint-generator.ts` — blueprint markdown + Gemini AI generation
- `lib/crm/industry-data.ts` — 13 industry entries with competitors + benchmarks
- Migrations actually live at `mcp/database-architect/migrations/` (NOT `supabase/migrations/`, which doesn't exist). They are stale — `007` is the last to touch `clients` columns. The de-facto schema manager is `ensureCrmSchema()` in `lib/crm/db.ts` (idempotent runtime DDL). **Invariant:** every column an INSERT/UPDATE writes must be a base column OR added by `ensureCrmSchema` — enforced by `tests/unit/clients-schema-drift.test.ts`. Base columns are listed in `lib/crm/schema-columns.ts`.
- All downstream consumers: `client-update.ts`, `service.ts`, `research-batch.ts`, CRM API routes, `ClientQuestionnaireForm.tsx`, `blueprint-review` page, pipeline page

---

### Critical bugs to fix first (before new features)

**1. Five DB columns exist but are NEVER written (intake.ts)**

`buildIntakeChallenges()` puts these in `challenges[]` JSONB but the INSERT statement has no dedicated column write:

| Form field | Column that exists | Fix |
|---|---|---|
| `serveArea` | `serve_area` | Add to INSERT + ON CONFLICT UPDATE |
| `teamSize` | `team_size` | Add to INSERT + ON CONFLICT UPDATE |
| `biggestFrustration` | `biggest_frustration` | Add to INSERT + ON CONFLICT UPDATE |
| `packagePreference` | `package_preference` | Add to INSERT + ON CONFLICT UPDATE |
| `clientAcquisition` | `client_acquisition` | Add to INSERT + ON CONFLICT UPDATE |

**2. Budget null bug (intake.ts)**

`${monthly_budget ?? 0}` — change to `${monthly_budget ?? null}`. Zero is a valid budget; null means "not answered."

**3. currentMarketing default (schema.ts)**

`z.string().trim().optional().default("")` — change default to `undefined` / remove default so "not answered" is detectable as null in DB.

**4. All 8 gap flags hardcoded (blueprint-generator.ts)**

Every client sees the same 8 ❌ flags regardless of what they answered. Destroys call credibility.

**5. All 11 path-specific fields ignored by blueprint (blueprint-generator.ts)**

`enquiryVolume`, `followUpMethod`, `missedCallHandling`, `currentWebsiteStatus`, `googleMapsStatus`, `websiteGoal`, `serveArea`, `biggestTimeWaste`, `teamSize`, `biggestFrustration`, `packagePreference` — none are used in `buildBlueprintMarkdown()` or the Gemini prompt.

**6. Industry mismatch between forms**

Quick form has 13 industry options. `ClientQuestionnaireForm.tsx` (CRM manual entry) has only 8. They must match.

---

### Part 1 — Form changes (UnifiedBlueprintForm.tsx + schema.ts)

#### Step 1 additions

**Two-tier industry selection**

After industry dropdown selection → show sub-niche tap cards (accordion reveal, same step, no new page). When "Other" → hide sub-niche cards, show free-text input instead:
- Label: "Describe your industry or type of business"
- Placeholder: "e.g. pet grooming, solar installations, vintage clothing"
- Required when Other selected, 100 char max
- On submit: pass raw text to Gemini to classify → store both `industry_custom_description` (raw) and `industry_classified` (AI result)
- "Other" stays at bottom of list

Sub-niches per industry:

| Industry | Sub-niches |
|---|---|
| Healthcare | General Practice · Dental · Physiotherapy & Allied Health · Mental Health · Medical Aesthetics & Wellness · Veterinary · Specialist Medical · Supplements & Health Products |
| Professional Services | Legal · Accounting & Tax · Business Consulting · IT Services & Support · HR & Recruitment · Engineering & Architecture · Financial Advisory |
| E-Commerce | Fashion & Apparel · Electronics & Tech · Beauty & Personal Care · Home & Garden · Food & Grocery · Handmade & Artisan · Digital Products |
| Real Estate | Residential Sales · Commercial Property · Property Management · Short-Term Rentals · Property Development · Valuation & Appraisal |
| Construction | Residential Building & Renovation · Commercial Construction · Specialty Trades · Interior Design & Fit-Out · Landscaping · Civil & Infrastructure |
| Education | K-12 Tutoring & Private Schools · Online Courses & EdTech · Corporate Training · Test Prep · Skills Bootcamps · Higher Education |
| Hospitality | Hotel & Accommodation · Restaurant & Café · Catering & Events · Bar & Nightlife · Tours & Travel · Wellness & Spa |
| Technology | SaaS & Software · App Development · IT Support & Managed Services · Cybersecurity · FinTech · MarTech |
| Financial Services | Insurance (General) · Life & Health Insurance · Investment Advisory · Accounting & Bookkeeping · Lending & Credit · Crypto & Digital Assets |
| Retail | Fashion & Apparel · Electronics · Specialty Retail · Furniture & Home · Grocery · Beauty & Cosmetics |
| Food & Beverage | Restaurant (Eat-In) · Takeaway & Delivery · Bakery & Confectionery · Catering & Food Service · Beverage Production · Food Distribution |
| Marketing | Digital Marketing Agency · Creative & Design · Social Media Management · PR & Communications · Influencer & Affiliate |
| Other | → free-text only, no sub-niches |

**Shared website existence question (move to Step 1, before intent)**

"Do you currently have a website?" — Yes / No / In progress

This replaces the duplicate `currentWebsiteStatus` that appears in both PRESENCE and AUTOMATION paths with different option sets.

**Vendor experience multi-select (new, after intent selection)**

"Have you worked with any of these before to grow your business?" — multi-select tap cards:
- Digital marketing or SEO agency
- Web design or development studio
- Social media manager
- CRM or automation consultant
- AI solutions or tech solutions provider
- Business or growth consultant
- None yet — first time exploring this

Don't use "digital marketing agency" as the sole label — Vantage Stack is not positioning there.

#### Step 2 path additions

**LEADS path — add 2 questions**

Q: "Of every 10 enquiries you get, roughly how many become paying clients?" → tap cards: 1–2 · 3–4 · 5–6 · 7 or more · I don't track this

Q: "How quickly do you typically respond to a new enquiry?" → tap cards: Within 5 minutes · Within the hour · Same day · It varies · Next day or later

**PRESENCE path — add 1 conditional question**

Show only if `websiteExists` is NOT "No": "Are you currently getting enquiries through your website?" → Yes, regularly · Occasionally · Rarely or never · No idea — I don't track it

**AUTOMATION path — add 1 question**

Q: "Roughly how many hours per week does your team lose to these tasks?" → 1–3 hrs · 3–6 hrs · 6–10 hrs · 10+ hours

#### Step 2 duplicates to remove

- Remove `clientAcquisition` from LEADS path (duplicate — it's asked in PRESENCE and now covered by vendor experience)
- Remove `clientAcquisition` from AUTOMATION path (same reason)
- Remove `currentWebsiteStatus` from AUTOMATION path (now shared Step 1 question)

#### Step 3 additions

**Urgency question (new)**

"When are you looking to get started?" → ASAP — I need this now · Within the next month · Just exploring for now

If "ASAP" → budget question becomes semi-required (prompt shown)

**Social handle (new, optional)**

"Your most active social media profile (optional)" — single text input, placeholder: "@yourbusiness or paste a profile link"

One field beats 5 separate platform fields in the quick form. Feeds Social Media section of blueprint.

#### New schema fields to add (schema.ts)

`subNiche`, `industryCustomDescription`, `industryClassified`, `previousVendorExp` (array), `conversionRate`, `speedToContact`, `urgencyTimeline`, `primarySocialHandle`, `hoursLostPerWeek`, `siteConversionStatus`, `websiteExists`

---

### Part 2 — Supabase migrations

**Migration 010 — formalise + add columns**

These columns exist only in `ensureCrmSchema` (db.ts runtime DDL), not in committed migrations:
`blueprint_markdown`, `package_intent`, `primary_intent`, `preferred_contact_time`, all 5 social fields (`social_instagram`, `social_tiktok`, `social_facebook`, `social_x`, `social_youtube`), `serve_area`, `team_size`, `biggest_frustration`, `package_preference`, `client_acquisition`

Also add all new form fields:
`sub_niche`, `industry_custom_description`, `industry_classified`, `previous_vendor_exp` (text[]), `conversion_rate`, `speed_to_contact`, `urgency_timeline`, `primary_social_handle`, `hours_lost_per_week`, `site_conversion_status`, `website_exists`

**Migration 011 — indexes**

```sql
create index if not exists idx_clients_primary_intent on public.clients(primary_intent);
create index if not exists idx_clients_industry on public.clients(industry);
create index if not exists idx_clients_sub_niche on public.clients(sub_niche);
create index if not exists idx_clients_urgency_timeline on public.clients(urgency_timeline);
create index if not exists idx_clients_status_created on public.clients(status, created_at desc);
```

---

### Part 3 — Blueprint generator overhaul (blueprint-generator.ts)

**Reorder sections** — Executive Summary (their situation + biggest gap + potential) must be section 1. Currently buried after business overview.

**Conditionalise all 8 gap flags**

| Flag | Condition to show |
|---|---|
| ❌ No GA4/GTM | website exists AND no analytics tool in `toolsUsed` AND no GA4 in enrichment tech stack |
| ❌ No conversion tracking | `conversionRate` === "I don't track this" |
| ❌ No retargeting pixel | no pixel in enrichment tech stack AND they run/ran paid ads |
| ❌ No heatmap | no behavior tool (Hotjar/Clarity) in `toolsUsed` |
| ❌ No lead magnet | LEADS path AND `followUpMethod` shows low/no follow-up |
| ❌ No email nurture | `followUpMethod` is "inconsistent" or "we don't really" |
| ❌ No WhatsApp Business | WhatsApp Business NOT in `toolsUsed` AND follow-up is manual |
| Content & SEO Gaps | client HAS a website (`websiteExists` !== "No") |

**Populate benchmark table from real form data**

| Metric | New logic |
|---|---|
| Avg. Conversion Rate | Show `conversionRate` value if provided |
| Cost Per Lead | budget / enquiryVolume if both provided |
| Avg. Leads/Month | `enquiryVolume` × 4 if provided |

**Add path-specific analysis sections**

- LEADS → "Lead Conversion Analysis": uses `enquiryVolume`, `conversionRate`, `speedToContact`, `followUpMethod`, `missedCallHandling`
- PRESENCE → "Online Visibility Analysis": uses `currentWebsiteStatus`, `googleMapsStatus`, `siteConversionStatus`, `serveArea`
- AUTOMATION → "Operational Efficiency Analysis": uses `biggestTimeWaste`, `toolsUsed`, `teamSize`, `hoursLostPerWeek` → calculate time cost + automation ROI
- EXPLORE → "Business Growth Opportunity": uses `biggestFrustration` → highest-priority service recommendation

**Loss aversion framing** — replace neutral ❌ flags with cost-of-inaction. E.g., "Your current response time means you're losing approximately R___/month to competitors who respond within 5 minutes."

**ROI calculator** — use `avgTransactionValue` + `conversionRate` + `enquiryVolume`: "If we improve your conversion rate from X% to Y%, that's ___ additional clients/month at R___ average deal = R___/month additional revenue."

**Enrich Gemini prompt** — currently missing: `subNiche`, `conversionRate`, `speedToContact`, `avgTransactionValue`, `urgencyTimeline`, `previousVendorExp`, `hoursLostPerWeek`, `enrichment.pageSpeed` scores, `enrichment.seoSignals`, sub-niche industry benchmarks

**Single CTA at end** — replace generic 4-step next-steps list with one explicit "Book your 30-minute strategy call" action (Calendly link or WhatsApp CTA). Single CTA increases response 371% over a list.

**Industry-specific case study placeholder** — add a section prompting account manager to insert the right case study before sending.

---

### Part 4 — Industry data (industry-data.ts)

1. Add `subNiches: string[]` array to each entry — powers tap cards
2. Add `subNicheBenchmarks: Record<string, IndustryBenchmarks>` — sub-niche CPL, conversion rate, top channels, avg deal size. Fall back to parent where unknown.
3. Add `source: "wordstream_2026" | "hubspot_2025" | "internal_estimate"` to each benchmark
4. Move competitor lists to sub-niche level:
   - Healthcare > Medical Aesthetics → Skin Renewal, Laser Clinics SA, Aesthetics SA
   - Healthcare > Supplements → Faithful to Nature, Wellness Warehouse, Herbex, Dischem Online
   - Healthcare > General Practice → My Meds, Medipost, MedBrief
   - (pattern for all sub-niches)

---

### Part 5 — Downstream compatibility (must update alongside main changes)

Every file below consumes client data from the DB. Adding new columns requires updates in each.

| File | What needs updating |
|---|---|
| `lib/crm/client-update.ts` | Add new columns to `ClientPatch` type + UPDATE statement |
| `lib/crm/blueprint-generator.ts` | Add new columns to `BlueprintClientData` interface |
| `lib/scheduler-engine/research-batch.ts` | Add `sub_niche`, `conversion_rate`, `speed_to_contact`, `urgency_timeline` to metadata JSONB sent to webhook |
| `components/crm/ClientQuestionnaireForm.tsx` | Fix industry list from 8 → 13 options (match quick form); add sub-niche selector; add new fields |
| `app/crm/blueprint-review/[clientId]/page.tsx` | Ensure new columns are fetched; social handle field handling |
| `app/api/crm/clients/route.ts` (GET list) | Add `sub_niche`, `urgency_timeline` to selected columns if needed for filtering |
| `app/api/crm/clients/[id]/route.ts` (PATCH) | Add new columns to updateable set |

**Status values centralisation** — currently hardcoded in 6+ locations. Create `lib/crm/constants.ts` with a single `CLIENT_STATUSES` export and replace all inline references:
- `components/crm/statusStyles.ts`
- `app/crm/pipeline/page.tsx` (STAGE_CONFIG)
- `ClientQuestionnaireForm.tsx`
- CRM API routes
- `service.ts`
- `client-update.ts`

---

### Implementation order (dependency-safe)

1. Migration 010 (columns) → Migration 011 (indexes)
2. `lib/blueprint/schema.ts` — add new Zod fields
3. `lib/crm/intake.ts` — fix 5 missing column writes, budget null, add new field writes
4. `lib/crm/industry-data.ts` — add subNiches, subNicheBenchmarks, source tags
5. `components/blueprint/UnifiedBlueprintForm.tsx` — all form changes
6. `lib/crm/blueprint-generator.ts` — full overhaul (conditional flags, path sections, ROI, Gemini prompt)
7. `components/crm/ClientQuestionnaireForm.tsx` — sync industry list, add new fields
8. `lib/crm/client-update.ts` — ClientPatch type update
9. `lib/scheduler-engine/research-batch.ts` — add new fields to webhook payload
10. `lib/crm/constants.ts` (new) — centralise status values; update all 6 reference sites

---

---

## Demo Caller + Design-to-Code + Social Enrichment Overhaul

Full audit completed 2026-06-09. Everything below is planned but NOT yet implemented.

---

### System overview

Three systems must work together but currently don't share data:

1. **Demo Caller** (`app/crm/demo-call/DemoCallClient.tsx`) — shows a website in laptop + phone iframe viewers. Uses `ScaledIframe` with `srcDoc` (rendered HTML, not a URL iframe). Has two tabs: "Has Website" (scrapes via N8n/Firecrawl) and "Manual Info" (generates HTML from typed form). **Problem:** Fallback HTML and manual HTML are hardcoded templates for plumbing/electric/cleaning only — no CRM data flows in.

2. **Design-to-Code** (`lib/design-to-code/`) — generates a Claude prompt + design brief to build a production website. Pulls client profile from CRM (`getClientDetail()`), aggregates via `aggregateFromClientDetail()`, then `buildMasterPrompt()` + `buildDesignBriefMarkdown()`. **Problem:** social insights, website enrichment data, sub-niche benchmarks, and new blueprint fields (`conversionRate`, `speedToContact`, `urgencyTimeline`, `previousVendorExp`) are never passed in.

3. **Social Scraper** (`lib/crm/social-scraper.ts`) — Apify scrapes Instagram, TikTok, Facebook, X, YouTube. Collects followers, engagement, hashtags, content themes, posting frequency. **Problem:** results flow into blueprint markdown only — never reach design-to-code or demo caller.

---

### Part 6 — Demo Caller: blueprint data flow into laptop + phone preview

**How the demo caller works today:**
- Single page at `/crm/demo-call` — no `clientId` in URL, no CRM data fetched
- Two tabs: "Has Website" (manual URL entry) and "Manual Info" (type name/location/services/pricing by hand)
- Preview renders in `ScaledIframe` using `srcDoc` — a fully rendered HTML string, NOT a URL iframe
- Desktop mockup: 1280px iframe scaled to container. Phone mockup: 393×852px (iPhone 14 Pro) with bezel
- Both views render the same HTML string — one layout, two viewports

**Root problem:** Account manager must retype everything. No client data flows in from the blueprint. The Demo Call tab is a global CRM nav item (not client-specific) — there is no shared client context across the sidebar.

**Fix — add a client search/select at the top of the Demo Call tab:**

**Step 1 — Client picker at top of Demo Call page**

Add a search/select input at the top of `DemoCallClient`:
- Type a client name → calls `/api/crm/clients?search=...` → shows dropdown of matching clients
- Select a client → immediately loads all their blueprint data into the preview

This is the same pattern used across the CRM — no new infrastructure needed.

**Step 2 — Blueprint data auto-populates everything on client select**

When a client is selected, fetch their full record from `/api/crm/clients/${id}` and map blueprint fields:

| Blueprint field | Maps to preview |
|---|---|
| `name` / `company` | Business name in hero, nav logo, footer |
| `industry` + `sub_niche` | Hero image selection + headline template |
| `serve_area` | Location shown in footer + hero trust bar |
| `challenges[]` + `website_goal[]` + `biggest_time_waste[]` | Services section bullet list |
| `monthly_budget` + `revenue_range` | Pricing tier label |
| `success_goals` | Hero sub-headline |
| `biggest_frustration` | Problem/agitate section copy |
| `social_insights[].dominantColor` (from node-vibrant) | Brand accent color replaces hardcoded orange |
| `google_business_data.rating` + `.reviewCount` | Social proof section |
| `google_business_data.hours` | Contact section hours |
| `google_business_data.phone` | Contact CTA phone number |
| `website_url` | If set: use "Has Website" path (Firecrawl scrape) |

**Step 3 — Two paths based on whether client has a website**

**Path A — Client has `website_url`:**
- Auto-switch to "Has Website" tab, pre-fill URL
- Auto-trigger `handleDeploy()` → N8n/Firecrawl scrapes the real site → displays in iframe
- Both laptop and phone viewers show the real scraped site

**Path B — Client has no website:**
- Generate mock site HTML from `ClientPreviewContext` (see below)
- Mock renders immediately in both laptop and phone `ScaledIframe` viewers
- Account manager can edit fields and hit "Regenerate" to update the preview
- This IS the demo — "here's what your site could look like" shown during the call

**Step 4 — `generatePreviewHTML()` accepts full client context**

Replace `ManualFormData` (4 plain text fields) with `ClientPreviewContext`:

```typescript
interface ClientPreviewContext {
  businessName: string
  industry: string           // drives image + headline selection
  subNiche?: string          // more specific than industry
  location?: string          // serve_area from blueprint
  services: string[]         // parsed from challenges / website_goal / biggest_time_waste
  pricing?: string           // from monthly_budget range
  primaryColor?: string      // hex from node-vibrant social scrape
  headline?: string          // from success_goals
  problemStatement?: string  // from biggest_frustration
  reviewRating?: number      // from Google Business Profile
  reviewCount?: number
  phone?: string             // from Google Business Profile
  hours?: string             // from Google Business Profile
}
```

Keep `ManualFormData` as a subset so the "Manual Info" tab still works for non-CRM use.

- Expand `IMAGES` map: 8 keywords → full 13 industries + key sub-niches (curated Unsplash URLs, same pattern)
- Expand `HEADLINES` map: 4 templates → industry-specific problem/headline/agitate/solution for each industry
- When `primaryColor` set → replace all instances of `#f97316` in the HTML with the client's actual brand color
- When `reviewRating` + `reviewCount` set → render real Google rating in social proof section
- When `phone` set → use real phone number on CTA buttons
- When `hours` set → show real hours in contact section

**Step 5 — Design-to-code prompt also auto-generated from blueprint data**

When a client is selected in the demo caller (or when a blueprint is submitted), the design-to-code prompt should be auto-generated and stored. Currently `runGenerateDesignBrief()` is only triggered manually via the API route. Wire it to run automatically when:
- A new blueprint submission is processed (`intake.ts`) AND the client has no website, OR
- The account manager selects a client in the demo caller

The generated prompt is stored in the `design_to_code` table (already exists) so it's ready when needed — no re-generation required.

**What the account manager sees in the Demo Call tab:**
1. Search and select a client from the top picker
2. If they have a website → live scraped preview loads automatically in both viewers
3. If no website → mock site appears immediately using their industry, services, location, brand colors — not a generic plumbing template
4. Account manager can adjust any field and regenerate
5. The design-to-code master prompt (for actual site build) has already been generated and is available in the client's record

---

### Part 7 — Design-to-Code: pass all enrichment context

**Current gap in `lib/design-to-code/aggregate.ts`:**

`aggregateFromClientDetail()` pulls 14 fields from client profile but ignores:
- `social_insights` (scraped by `social-scraper.ts`, stored in blueprint)
- `website_enrichment` (tech stack, page speed, SEO signals)
- `sub_niche` (new field — more specific than industry)
- `conversion_rate`, `speed_to_contact`, `urgency_timeline` (new blueprint fields)
- `previous_vendor_exp` (shapes recommendation language)
- `primary_social_handle` (new quick-form field)

**Fix — update `AggregatedClientContext` type and `aggregateFromClientDetail()`:**

Add to the aggregated context:
```typescript
subNiche?: string
socialInsights?: SocialInsight[]           // from social-scraper
websiteEnrichment?: WebsiteEnrichmentData  // from website-enrichment
conversionRate?: string
speedToContact?: string
urgencyTimeline?: string
previousVendorExp?: string[]
primarySocialHandle?: string
```

**Fix — update `buildMasterPrompt()` in `master-prompt.ts`:**

Add to DESIGN REQUIREMENTS section:
- Brand voice: if `socialInsights` available → extract from top content themes and captions, not just the `d.brand_voice` discovery field
- Primary colors: if `socialInsights` available → use dominant brand colors observed on social (note: pass extracted color hints as strings)
- Social proof context: "Brand has [X] total followers across [platforms] with [Y]% avg engagement — website should reinforce this trust signal"

Add to BUSINESS CONTEXT section:
- Sub-niche: more specific industry context for competitor differentiation
- Conversion gap: if `conversionRate` available → "Client currently converts X/10 enquiries — website conversion path must address this directly"
- Previous vendors: if `previousVendorExp` available → "Client has previously worked with [types] — avoid positioning language that sounds like [category]"

**Fix — update `runGenerateDesignBrief()` to pass enrichment data:**

The API route at `app/api/crm/clients/[id]/design-to-code/route.ts` calls `getClientDetail()` which already returns `website_url`. Extend it to also fetch `blueprint_markdown` (contains social insights) and parse out enrichment data before calling `aggregateFromClientDetail()`.

---

### Part 8 — Social scraping: tool audit, replacements, and enrichment pipeline

#### Current tool status (audited 2026-06-09)

| Platform | Current actor | Status | Action |
|---|---|---|---|
| Instagram | `apify/instagram-scraper` | ✅ Active | Keep — works for public profiles |
| TikTok | `clockworks/tiktok-profile-scraper` | ⚠️ Fragile | Keep but add non-US proxy routing (had outages during 2025 US TikTok ban) |
| Facebook | `apify/facebook-pages-scraper` | ✅ Active | Keep — best structured data (category, hours, address, phone, rating) |
| X/Twitter | `quacker/twitter-scraper` | ❌ DEPRECATED | Replace with `apidojo/tweet-scraper` ($0.40/1,000 tweets) |
| YouTube | `apify/youtube-scraper` | ✅ Active | Replace with YouTube Data API v3 (free, 10k units/day, no scraping needed) |

**New tools to add:**

| Tool | Purpose | Cost |
|---|---|---|
| **Outscraper** (`outscraper.com`) | Google Business Profile — category, hours, address, phone, rating, review count, photos | $3/1,000 lookups ($0.60/200/month) — first 500 free |
| **ScrapeCreators** (`scrapecreators.com`) | Multi-platform fallback + LinkedIn (B2B clients) | $10/5,000 credits (~$0.40/200 scrapes) |
| **node-vibrant v4** | Extract dominant brand colors from Instagram profile pic + recent post images | Free npm package |
| **Gemini Vision** (already in stack) | Semantic brand tone/style description from 2–3 images | Already paying for Gemini API |
| **YouTube Data API v3** | Channel: subscriber count, description, topic categories, upload frequency | Free (Google Cloud key needed) |

**Total cost for 200 clients/month: ~$3–5/month.**

#### Why Google Business Profile is critical

For South African SMBs, Google Business Profile (via Outscraper) is the single richest data source:
- **Structured category** (e.g. "Physiotherapy Clinic") → maps directly to site template selection
- **Address + coordinates** → footer map embed, serve area
- **Phone + email** → contact section auto-fill
- **Hours of operation** → contact section
- **Star rating + review count** → homepage social proof widget ("4.8 ★ from 214 reviews")
- **Photos** → hero image candidates, color extraction
- **Website URL** → if found, scrape it directly (far richer than social alone)

Add Outscraper as the **first** enrichment step, triggered by business name + city from the intake form. This fills in most of the "no website" gap without requiring the client to do anything.

#### Social data → website generation mapping

```
Facebook category / Google category  →  site template selection + industry classification
Instagram/FB bio text                 →  hero tagline + "About" section copy seed
Facebook hours                        →  contact/hours section
Facebook/Google address               →  footer + map embed
Instagram hashtags                    →  services section keywords
Instagram post images (node-vibrant)  →  primary + secondary brand colors in hex
Instagram/TikTok caption tone         →  brand voice (casual vs. professional vs. bold)
Google review rating + count          →  social proof widget
Instagram follower count              →  audience size note in admin view
LinkedIn specialties (B2B)           →  services bullet list
```

#### New enrichment pipeline order

Replace the current single-step social scrape with a sequential enrichment chain:

1. **Google Business Profile** (Outscraper) — triggered by `business_name` + `city` from intake. Returns category, address, hours, rating, phone, photos.
2. **Website scrape** (existing `website-enrichment.ts`) — if `website_url` found (from form OR from Google result). Returns tech stack, page speed, SEO signals, color hints.
3. **Instagram** (Apify) — profile pic + 9 recent posts → `node-vibrant` color extraction → captions → hashtag themes.
4. **TikTok** (Apify, non-US proxy) — bio + video titles → content themes.
5. **Facebook page** (Apify) — structured data: category, hours, reviews.
6. **YouTube** (YouTube Data API v3) — channel description + topic categories.
7. **LinkedIn** (ScrapeCreators) — only for B2B clients (Professional Services, Technology, Financial Services industries).

Steps 3–7 run in parallel (after 1–2 complete). The whole chain aborts early for each step if the client has no handle for that platform.

#### Fixes required in `lib/crm/social-scraper.ts`

1. **Replace** `quacker/twitter-scraper` with `apify/tweet-scraper` (actor ID: `apidojo/tweet-scraper`)
2. **Replace** YouTube actor with YouTube Data API v3 call (`googleapis.com/youtube/v3/channels`)
3. **Fix `contentThemes`** — currently always empty array. Extract by splitting captions on spaces, filter to 3+ char words, count frequency, return top 10 non-stopwords.
4. **Implement basic `audienceSentiment`** — scan captions for positive keywords (amazing, love, great, results, transform) vs. negative (problem, fix, issue, struggle) → return 'positive' / 'neutral' / 'negative'.
5. **Add retry with 1 backoff** — current timeout: 90s fixed, 0 retries. Add one retry on FAILED/TIMED-OUT before throwing.
6. **Parallelize** robots.txt + sitemap.xml fetches in `website-enrichment.ts` (currently sequential, wastes up to 10s).
7. **Wire `primary_social_handle`** — when platform-specific handles are empty but `primary_social_handle` is set, attempt Instagram first, then TikTok.

#### New: `extractBrandContext()` utility

Create `lib/crm/brand-context.ts`:

```typescript
interface BrandContext {
  dominantColors: { primary: string; secondary: string; accent: string }  // hex
  dominantTone: 'professional' | 'casual' | 'playful' | 'luxury' | 'technical'
  topHashtags: string[]     // across all platforms, deduplicated
  contentThemes: string[]   // across all platforms
  totalAudience: number
  avgEngagement: number     // weighted across platforms
  googleRating?: number
  googleReviewCount?: number
  googleCategory?: string
  address?: string
  phone?: string
  openingHours?: string
}

export async function extractBrandContext(
  insights: SocialInsight[],
  googleData?: GoogleBusinessData,
  profileImageUrls?: string[]
): Promise<BrandContext>
```

Color extraction: download profile pic + up to 6 recent post images → run `node-vibrant` on each → collect Vibrant swatches → most common hex = primary, DarkVibrant = secondary, LightMuted = accent.

Then pass `BrandContext` into `aggregateFromClientDetail()` and surface in `buildMasterPrompt()`.

#### New env vars needed

```
OUTSCRAPER_API_KEY          # Google Business Profile lookups
YOUTUBE_DATA_API_KEY        # YouTube Data API v3 (Google Cloud)
SCRAPECREATORS_API_KEY      # LinkedIn + fallback platform scraping
```

---

### Updated file list for this section

| File | Changes |
|---|---|
| `lib/crm/social-scraper.ts` | Replace `quacker/twitter-scraper` → `apidojo/tweet-scraper`; replace YouTube actor → YouTube Data API v3; fix `contentThemes`; implement `audienceSentiment`; add retry; wire `primary_social_handle` |
| `lib/crm/brand-context.ts` *(new)* | `extractBrandContext()` — distills social + Google insights into colors/tone/themes; runs `node-vibrant` on images |
| `lib/crm/google-business.ts` *(new)* | `lookupGoogleBusiness(name, city)` — Outscraper API call; returns structured category/address/hours/rating |
| `lib/crm/website-enrichment.ts` | Parallelize robots.txt + sitemap.xml fetches; add `node-vibrant` color extraction from OG image |
| `lib/demo-call/generatePreviewHTML.ts` | Add `ClientPreviewContext` type; expand IMAGES map to all 13 industries + sub-niches; add industry-aware headlines; accept brand colors from context |
| `app/crm/demo-call/DemoCallClient.tsx` | Add "Load from CRM" tab — client picker auto-populates form; wire `website_url` pre-fill; pass brand colors from social insights |
| `lib/design-to-code/aggregate.ts` | Add `subNiche`, `brandContext`, `websiteEnrichment`, `conversionRate`, `speedToContact`, `previousVendorExp` to aggregated context |
| `lib/design-to-code/types.ts` | Extend `AggregatedClientContext` with new fields |
| `lib/design-to-code/master-prompt.ts` | Add social brand voice, colors, sub-niche context, conversion gap, previous vendor framing |
| `app/api/crm/clients/[id]/design-to-code/route.ts` | Fetch social insights + enrichment + Google Business data before calling `runGenerateDesignBrief()` |
| `lib/crm/intake.ts` | Trigger Google Business lookup at intake time if `serve_area` / `industry` provided; store result in new `google_business_data` JSONB column |
| `app/crm/demo-call/DemoCallClient.tsx` | Add client search/select picker at top; on select: fetch client, map blueprint fields to `ClientPreviewContext`, auto-trigger deploy or generate mock; pass context to `generatePreviewHTML` |
| `lib/crm/intake.ts` | After blueprint generation: if `website_url` is empty, auto-call `runGenerateDesignBrief()` to pre-generate design-to-code prompt |

---

### Verification checklist

- [ ] Submit each path with test data. Confirm sub-niche appears after industry. Select "Other" → free-text required, max 100 chars.
- [ ] Vendor experience multi-select sends correct array to DB.
- [ ] No duplicate `clientAcquisition` question in LEADS or AUTOMATION paths.
- [ ] Time each path manually — all ≤ 2.5 min.
- [ ] Query DB after test submission: `serve_area`, `team_size`, `biggest_frustration`, `package_preference`, `client_acquisition`, `sub_niche`, `conversion_rate`, `speed_to_contact`, `urgency_timeline` all in dedicated columns.
- [ ] `monthly_budget` is NULL (not 0) when client skips budget question.
- [ ] Blueprint for client who answered "I have a CRM" does NOT show ❌ No WhatsApp Business.
- [ ] Blueprint for no-website client does NOT show Content/SEO gap section.
- [ ] LEADS client who said "3–4 per 10" → benchmark table shows that value, not "❓ Not tracked".
- [ ] Healthcare > Medical Aesthetics → competitors show Skin Renewal / Laser Clinics, NOT Netcare.
- [ ] Apply migrations 010+011 to fresh DB — all columns present, `ensureCrmSchema` DDL throws no duplicate errors.
- [ ] LEADS client: enquiryVolume=10/week, conversionRate=2/10 → blueprint shows ROI calculation in recommendations.
- [ ] CRM manual entry form industry list matches quick form (13 options).
- [ ] `quacker/twitter-scraper` no longer called anywhere — replaced by `apidojo/tweet-scraper`.
- [ ] YouTube scrape uses YouTube Data API v3 (`googleapis.com/youtube/v3/channels`), not Apify actor.
- [ ] `contentThemes` is populated (non-empty array) for Instagram and TikTok after a real scrape.
- [ ] `audienceSentiment` returns 'positive', 'neutral', or 'negative' — never null.
- [ ] Google Business lookup fires for a test client with no website — returns category, address, rating.
- [ ] Demo caller "Load from CRM" tab: select an existing client → form auto-populates with their real data.
- [ ] Demo caller no-website fallback: brand colors from social scrape appear in preview HTML (not generic grey/white).
- [ ] Design-to-code master prompt for a client with Instagram data references their actual brand tone and primary color, not "(define from brand)".
- [ ] `OUTSCRAPER_API_KEY`, `YOUTUBE_DATA_API_KEY`, `SCRAPECREATORS_API_KEY` added to `.env.local` and documented.
