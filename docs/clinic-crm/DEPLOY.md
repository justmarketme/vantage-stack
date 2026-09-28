# Clinic CRM — deploy & operations

Surfaces: UI at `/clinic-crm`, API at `/api/clinic-crm/**`, both on the existing Vercel
project **vantage-stack** (`prj_y1JnywARKccCSRxR86LBBBSsT8zO`, team `jonos-projects-8697404e`),
served on **clinics.vantagestack.co.za**. Database: the app's Supabase Postgres
(**`tinkmipmxunwvyemhalu`**), schema `clinic_crm`.

Legend: **AUTOMATED** = done by code/config in this branch. **USER-GATED** = needs a human
with dashboard access, a signature, or a credential.

---

## 1. Environment variables

Set in Vercel → Project → Settings → Environment Variables (Production, and Preview if you
test there) and in `.env.local` for scripts. Never paste values into chat, tickets or git.

| Variable | Required | Used by | Notes |
|---|---|---|---|
| `CLINIC_CRM_SESSION_SECRET` | **yes** | auth (cookie JWT) | ≥ 32 chars, random. Sign-in returns 503 and middleware treats everyone as signed-out without it (fails closed). Rotating it signs every user out. Generate: `node -e "console.log(require('crypto').randomBytes(48).toString('base64url'))"` |
| `DATABASE_URL` or `SUPABASE_DATABASE_POOLER_URL` | **yes** | `clinicDb()`, migrate, seed | Must point at `tinkmipmxunwvyemhalu`. Pooler URL wins if both set. Shared with the rest of the site. |
| `CRON_SECRET` | **yes** | `GET /api/clinic-crm/cron/dispatch` | Vercel Cron sends `Authorization: Bearer $CRON_SECRET` automatically. The VPS timer (§4) sends the same header. Shared with the site's other crons. |
| `TWILIO_ACCOUNT_SID` | **yes** | outbound sends | Shared with Isabel/WhatsApp. |
| `TWILIO_AUTH_TOKEN` | **yes** | sends + webhook signature validation | Must be the **primary** token. A secondary token is ignored by Twilio's signer until promoted — rotate by promoting, then update this var in the same minute. |
| `CLINIC_CRM_PUBLIC_URL` | **yes** | webhook signature URL, status callbacks | `https://clinics.vantagestack.co.za` (no trailing slash). Falls back to `NEXT_PUBLIC_APP_URL`. Must be the exact origin configured in Twilio or every webhook fails signature validation (403). |
| `NEXT_PUBLIC_APP_URL` | fallback | as above | Already set for the site. |
| `CLINIC_CRM_TWILIO_DRY_RUN` | no | Twilio client | `true` = fake sends (ignored when `VERCEL_ENV=production`). **Must be unset/false in Production.** It does **not** disable webhook signature checks. |
| `CLINIC_CRM_TWILIO_SKIP_SIGNATURE` | no | webhook signature bypass (`DEV_SKIP`) | Local development only: `true` skips X-Twilio-Signature validation, and only when `NODE_ENV !== "production"` (never on a Vercel build). Leave unset. |
| `CLINIC_CRM_SEED_PASSWORD` | seed only | `npm run clinic-crm:seed` | Local shell only; never in Vercel. |

<!-- AGENT-3: add any further back-end variables below this line -->
### Back-end additions (Agent 3)
_None beyond the table above at time of writing (`lib/clinic-crm/server/**` reads only
`CLINIC_CRM_PUBLIC_URL`, `CLINIC_CRM_TWILIO_DRY_RUN`, `CRON_SECRET`, `NEXT_PUBLIC_APP_URL`,
`TWILIO_ACCOUNT_SID`, `TWILIO_AUTH_TOKEN`)._

---

## 2. Database: migrate, then seed

Both scripts read `.env.local` and print the target host, never the URL or any password.

```bash
# 1. Schema (idempotent — CREATE … IF NOT EXISTS, RLS enabled on every table)
npm run clinic-crm:migrate

# 2. First clinic + owner login + the 4 default automations (all DISABLED)
CLINIC_CRM_SEED_PASSWORD='<12+ chars, from a password manager>' \
npm run clinic-crm:seed -- --clinic "Smile Dental Sandton" \
  --email owner@smiledental.co.za --name "Dr Naidoo" \
  --sms-from +27XXXXXXXXX --whatsapp-from +27XXXXXXXXX
```

- The app also runs the same DDL lazily on first request (`ensureClinicCrmSchema`), so
  migrate is belt-and-braces — but run it, so a DDL failure shows up here rather than as a
  503 in front of a clinic.
- Seed refuses to touch an existing staff email (no silent password resets).
- The schema lives in `clinic_crm`, which Supabase's REST API does not expose; RLS is on
  with no policies. Do **not** add `clinic_crm` to Supabase → API → Exposed schemas.

---

## 3. Auth & edge security (AUTOMATED)

| Control | Where |
|---|---|
| `vs_clinic_session` cookie: HS256 JWT, 12 h, `HttpOnly`, `Secure` (prod), `SameSite=Lax`, `Path=/` | `lib/clinic-crm/auth/token.ts`, `session.ts` |
| Every API call re-reads the staff row → deleted staff locked out immediately; **role comes from the DB, not the cookie** | `requireSession()` |
| Login: bcrypt (cost 12); unknown emails compared against a dummy hash (no timing oracle); single generic error | `app/api/clinic-crm/auth/login` |
| Brute force: 5 tries / 15 min per IP+email, 30 / 15 min per IP (in-memory), plus DB lockout after 5 failures for 15 min (durable) | `lib/clinic-crm/auth/policy.ts` |
| Middleware: pages → `/clinic-crm/login` redirect; API → 401 JSON; cross-site writes → 403 | `lib/clinic-crm/auth/middleware.ts` |
| Headers on every clinic-crm response: `x-robots-tag: noindex`, `Cache-Control: no-store`, nonce CSP (self + Google Fonts), `frame-ancestors 'none'`, `Referrer-Policy: strict-origin-when-cross-origin`, `Permissions-Policy: microphone=(self)` (dictation), HSTS | same |
| Public paths (validated in-route): `/clinic-crm/login`, `POST auth/login`, `POST auth/logout`, `webhooks/*` (X-Twilio-Signature), `cron/*` (Bearer) | same |

**Known limits**
- In-memory rate limits are per serverless instance and reset on cold start (effective
  limit ≈ limit × warm instances). The DB lockout is the real control. If abuse appears,
  swap the Map in `lib/clinics/rateLimit.ts` for Upstash Redis — the signature stays.
- The account lockout can be triggered deliberately by someone who knows a staff email
  (a 15-minute denial of service for that user). Accepted trade-off; the owner can't unlock
  early without SQL today.
- A stolen cookie is valid until it expires (12 h) or the staff row is deleted — there is no
  per-user "sign out everywhere" (see contract request: `staff.session_version`).
- The nonce CSP requires `/clinic-crm` pages to be **dynamically rendered**. If a page is
  statically prerendered its scripts carry no nonce and the browser blocks them (blank page).
  `app/clinic-crm/layout.tsx` must opt into dynamic rendering (`export const dynamic = "force-dynamic"`).

---

## 4. Scheduling the dispatcher (reminders need ≤ 15-min cadence)

**Finding:** the `vantage-stack` project is on Vercel **Hobby**. Evidence: the billing API
returns "Plan not found" for the team (charges exist only on paid plans), and every one of
the nine existing crons in `vercel.json` is daily. Vercel docs (Cron Jobs → Usage & Pricing,
updated 2026-07-15): Hobby = **once per day, ±59 min precision**; a more frequent
expression **fails the deployment**. So `*/10 * * * *` was **not** added.

What is configured:

1. **Vercel Cron — daily backstop (AUTOMATED):** `GET /api/clinic-crm/cron/dispatch` at
   `0 6 * * *` UTC (08:00–08:59 SAST). Drains anything the primary scheduler missed. Safe
   alongside the timer: the outbox claims rows with `FOR UPDATE SKIP LOCKED`.
2. **Primary — systemd timer on the EMMA VPS (USER-GATED, ~5 min):** `emmadoesit.cloud`
   (Hostinger KVM, systemd) calls the endpoint every 10 minutes. The secret is passed as a
   systemd credential so it never appears in `ps`, the unit file or the journal.

```bash
# on the VPS, as root
install -d -m 700 /etc/clinic-crm
printf 'Authorization: Bearer %s\n' '<CRON_SECRET value>' > /etc/clinic-crm/dispatch.header
chmod 600 /etc/clinic-crm/dispatch.header

cat > /etc/systemd/system/clinic-crm-dispatch.service <<'EOF'
[Unit]
Description=Clinic CRM outbox dispatch (Vercel Hobby has no sub-daily cron)
After=network-online.target
Wants=network-online.target

[Service]
Type=oneshot
DynamicUser=yes
LoadCredential=dispatch-header:/etc/clinic-crm/dispatch.header
ExecStart=/usr/bin/curl -fsS --max-time 55 --retry 2 --retry-delay 5 \
  -H @%d/dispatch-header \
  -o /dev/null -w "dispatch %%{http_code} %%{time_total}s\n" \
  https://clinics.vantagestack.co.za/api/clinic-crm/cron/dispatch
NoNewPrivileges=yes
ProtectSystem=strict
ProtectHome=yes
PrivateTmp=yes
EOF

cat > /etc/systemd/system/clinic-crm-dispatch.timer <<'EOF'
[Unit]
Description=Run Clinic CRM dispatch every 10 minutes

[Timer]
OnCalendar=*:0/10
AccuracySec=30s
Persistent=true

[Install]
WantedBy=timers.target
EOF

systemctl daemon-reload
systemctl enable --now clinic-crm-dispatch.timer
systemctl start clinic-crm-dispatch.service && journalctl -u clinic-crm-dispatch -n 5 --no-pager
```

(`%d` is systemd's credentials-directory specifier, systemd ≥ 248 — Ubuntu 22.04+ is fine;
`-H @file` needs curl ≥ 7.55.) Expect `dispatch 200 …`. A `401` means the header file doesn't match Vercel's `CRON_SECRET`.
Always call the **custom domain**: `*.vercel.app` URLs on this project sit behind Vercel
Authentication (`ssoProtection: all_except_custom_domains`) and return 401 to curl and to Twilio.

Upgrade path: on Vercel Pro, add `{"path":"/api/clinic-crm/cron/dispatch","schedule":"*/10 * * * *"}`
to `vercel.json` and disable the timer (`systemctl disable --now clinic-crm-dispatch.timer`).

---

## 5. Twilio configuration (USER-GATED)

All URLs must use the exact origin in `CLINIC_CRM_PUBLIC_URL` — the signature covers the
full URL, so `vantage-stack.vercel.app` vs the custom domain, or a trailing slash, breaks it.

| Setting | Value |
|---|---|
| SMS number → Messaging → "A message comes in" | `POST https://clinics.vantagestack.co.za/api/clinic-crm/webhooks/twilio` |
| WhatsApp sender → Webhook URL for incoming messages | same URL, `POST` |
| Status callback | Set **per message** by the app (`statusCallback` → `/api/clinic-crm/webhooks/twilio/status`). Leave the number/sender-level status callback empty, or set it to the same URL. |
| Clinic row | `clinics.sms_from` = E.164 number, `clinics.whatsapp_from` = `whatsapp:+27…` (the `To` of inbound messages is how a webhook finds its clinic). |

**WhatsApp sender.** Twilio Console → Messaging → Senders → WhatsApp senders. Needs a Meta
Business Manager, business verification and a WhatsApp Business Account (WABA) per clinic
(or per ISV setup). Display-name approval by Meta. Days, not minutes.

**Content templates.** Business-initiated WhatsApp (reminders, no-show, recall) outside the
24 h window needs an approved template. Create in Twilio Console → Messaging → Content
Template Builder, submit for WhatsApp approval, paste the `HX…` SID into the automation in
Settings → Automations. Category: reminders/no-show = **Utility**; recall ("you're due for a
check-up") will likely be classed **Marketing** by Meta (different pricing, opt-in rules).
Variables are positional `{{1}}` firstName, `{{2}}` clinicName, `{{3}}` time
(`CRM_CONFIG.whatsapp.templateVariableOrder`). Until approved, the app falls back to SMS
or marks the outbox row `skipped`.

**SMS in South Africa.** Confirm with Twilio which sender type the account can use for ZA
recipients (SA long codes are limited; alphanumeric sender IDs are one-way and cannot
receive replies or STOP). Two-way SMS needs a reply-capable number.

**Hardening (recommended):** Messaging → Settings → Geo permissions: allow only South Africa
(+ any country a clinic genuinely serves); enable SMS pumping protection.

---

## 6. Domain / DNS (USER-GATED)

`clinics.vantagestack.co.za` is **not** in the project's domain list (checked via Vercel API:
only `vantagestack.co.za`, `www.`, and `*.vercel.app`). The `vercel.json` host rewrite for it
already exists.

1. Vercel → vantage-stack → Settings → Domains → Add `clinics.vantagestack.co.za`.
2. Hostinger DNS for `vantagestack.co.za`: add exactly the record Vercel shows (normally
   `CNAME clinics → cname.vercel-dns.com`; an `A` record to Vercel's IP also works).
3. Wait for Vercel's certificate, then `curl -I https://clinics.vantagestack.co.za/clinic-crm`
   → expect `307` to `/clinic-crm/login` with `x-robots-tag: noindex`.

---

## 7. Go-live checklist

| # | Item | Status |
|---|---|---|
| 1 | Auth, session, rate limit, lockout, Twilio signature validation | AUTOMATED (43 unit tests) |
| 2 | Middleware gate + security headers + noindex/no-store | AUTOMATED |
| 3 | Daily backstop cron in `vercel.json` | AUTOMATED |
| 4 | `npm run clinic-crm:migrate` / `clinic-crm:seed` scripts | AUTOMATED (not run) |
| 5 | `app/clinic-crm/layout.tsx` dynamic rendering (nonce CSP) | AGENT 1 — verify |
| 6 | Set `CLINIC_CRM_SESSION_SECRET`, `CLINIC_CRM_PUBLIC_URL` in Vercel Production; confirm `CLINIC_CRM_TWILIO_DRY_RUN` unset | USER-GATED |
| 7 | Run migrate against `tinkmipmxunwvyemhalu` | USER-GATED |
| 8 | Seed first clinic + owner | USER-GATED |
| 9 | Add domain in Vercel + DNS at Hostinger | USER-GATED |
| 10 | VPS systemd timer (§4) | USER-GATED |
| 11 | Twilio number/sender webhooks (§5) | USER-GATED |
| 12 | WhatsApp sender + Meta business verification | USER-GATED |
| 13 | Content templates approved; SIDs entered per automation | USER-GATED |
| 14 | Twilio geo permissions + pumping protection | USER-GATED |
| 15 | Operator agreement with each clinic; DPAs with Twilio/Meta/Supabase/Vercel; Information Officer registered (see POPIA.md) | USER-GATED (legal) |
| 16 | Smoke test: login → create patient (consent) → book in 70 min with reminder offset 1 h → confirm send → reply STOP → confirm opt-out blocks next send | USER-GATED |
| 17 | Enable automations per clinic after wording review | USER-GATED (clinic) |

---

## 8. Rollback

- **App:** Vercel → Deployments → previous production deployment → *Instant Rollback*.
  Nothing outside `/clinic-crm` and `/api/clinic-crm` depends on this branch; the only
  shared-file changes are additive (`middleware.ts` matcher + early branch, one `vercel.json`
  cron, two npm scripts).
- **Stop all outbound messages immediately:** `systemctl disable --now clinic-crm-dispatch.timer`
  on the VPS, remove the cron entry (or rotate `CRON_SECRET`), and/or blank `TWILIO_AUTH_TOKEN`
  for this project. Per clinic: disable automations in Settings.
- **Lock everyone out:** rotate `CLINIC_CRM_SESSION_SECRET` (invalidates every cookie).
- **Data:** the schema is self-contained. Do **not** `DROP SCHEMA clinic_crm` without an export
  — it holds patient records the clinic (not us) is responsible for under POPIA. Take a
  `pg_dump -n clinic_crm` first and agree retention with the clinic.
